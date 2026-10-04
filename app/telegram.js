// Telegram bot u glavnom procesu: dugo citanje poruka (getUpdates), povezivanje kodom, preuzimanje fajlova i slanje odgovora.
// Token je sifrovan (safeStorage) i nikad ne ide u stranicu ni u poruke o gresci. Poruku obradjuje stranica (handle);
// offset (potvrda Telegramu) ide napred tek posle uspesne obrade, pa se neobradjena poruka ponovo dobija.
const API = 'https://api.telegram.org';
const POLL_S = 50;
const MAX_FILE = 10 * 1024 * 1024;
const PAIR_MS = 10 * 60 * 1000;
const TICK_MS = 60 * 1000;
const BACKOFF = [5, 10, 30, 60];
const MAX_ATTEMPTS = 3;          // poruka koja i dalje pada (greska u obradi) se posle toga preskace uz poruku korisniku
const MAX_PAIR_TRIES = 5;        // pogresni kodovi iz nepovezanih chatova pre nego sto se kod ponisti
const HANDLE_TIMEOUT_MS = 180000;
const DOWNLOAD_TIMEOUT_MS = 60000;
const LINKABLE = ['private', 'group', 'supergroup']; // kanal se ne povezuje
const MIME_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function createTelegram({ fetch, safeStorage, getSettings, saveSettings, handle, tick, onStatus = () => {}, T = s => s,
  now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random, autoStart = true, handleTimeoutMs = HANDLE_TIMEOUT_MS }) {
  const s = () => getSettings();
  const encryption = () => { try { return !!safeStorage.isEncryptionAvailable(); } catch { return false; } };
  const getToken = () => {
    const enc = s().telegramTokenEnc;
    if (!enc || !encryption()) return '';
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  };
  let state = 'off';        // off | notoken | running | offline | conflict | badToken
  let pair = null;          // { code, until }
  let lastError = '', errors = 0, lastTick = 0, stopFlag = false, running = false, pollCtrl = null, abortedByStop = false, wake = null;
  const attempts = new Map(); // update_id -> broj neuspelih obrada
  // Obrada sa rokom: stranica koja se osvezi/padne usred obrade ne sme da zaustavi petlju zauvek
  const withTimeout = (promise, ms) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('obrada nije zavrsena na vreme')), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); res(v); }, e => { clearTimeout(timer); rej(e); });
  });
  // Spavanje koje stop() prekida (da novi start() ne ceka staru petlju)
  const nap = ms => new Promise(r => { wake = r; sleep(ms).then(r); });
  const scrub = msg => { const tok = getToken(); let m = String(msg || ''); if (tok) m = m.split(tok).join('…'); return m.replace(/bot\d+:[\w-]+/g, 'bot…').slice(0, 300); };
  const err = (kind, extra) => Object.assign(new Error(kind), { kind }, extra || {});

  function status() {
    const tok = getToken();
    const pairing = !!pair && pair.until > now();
    return { set: !!tok, last4: tok ? (s().telegramTokenLast4 || '') : '', botName: s().telegramBotName || '', linked: !!s().telegramChatId, chatTitle: s().telegramChatTitle || '',
      on: s().telegramOn !== false, state: tok ? state : 'notoken', pairCode: pairing ? pair.code : '', pairUntil: pairing ? pair.until : 0,
      encryption: encryption(), error: lastError };
  }
  function setState(x) { if (state !== x) { state = x; onStatus(status()); } }

  async function api(method, body, timeoutMs = 20000) {
    const token = getToken();
    if (!token) throw err('notoken');
    const ctrl = new AbortController();
    if (method === 'getUpdates') pollCtrl = ctrl;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try { res = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ctrl.signal }); }
    catch (e) { throw err('network', { message: scrub(e && e.message) }); }
    finally { clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401 || res.status === 404) throw err('badToken');
    if (res.status === 409) throw err('conflict');
    if (res.status === 429) throw err('limit', { retryAfter: data && data.parameters && data.parameters.retry_after });
    if (!res.ok || !data || !data.ok) throw err('http', { status: res.status, message: scrub(data && data.description) });
    return data.result;
  }
  const safe = async fn => { try { return await fn(); } catch { return null; } };

  async function setToken(token) {
    token = String(token || '').trim();
    stop();
    if (!token) {
      ['telegramTokenEnc', 'telegramTokenLast4', 'telegramBotName', 'telegramChatId', 'telegramUserId', 'telegramChatTitle', 'telegramOffset'].forEach(k => delete s()[k]);
      saveSettings(); setState('notoken'); return status();
    }
    if (!encryption()) return { ...status(), error: 'encryption' };
    const changed = getToken() !== token;
    s().telegramTokenEnc = safeStorage.encryptString(token).toString('base64');
    s().telegramTokenLast4 = token.slice(-4);
    if (changed) { delete s().telegramChatId; delete s().telegramUserId; delete s().telegramChatTitle; delete s().telegramOffset; delete s().telegramBotName; }
    saveSettings();
    try { const me = await api('getMe'); s().telegramBotName = String(me && me.username || ''); saveSettings(); lastError = ''; state = 'off'; }
    catch (e) { lastError = scrub(e.message); setState(e.kind === 'badToken' ? 'badToken' : 'offline'); return status(); }
    start();
    return status();
  }
  function startPairing() {
    const code = String(Math.floor(random() * 1000000)).padStart(6, '0');
    pair = { code, until: now() + PAIR_MS, tries: 0 };
    start();
    onStatus(status());
    return status();
  }
  function unlink() { delete s().telegramChatId; delete s().telegramUserId; delete s().telegramChatTitle; saveSettings(); pair = null; onStatus(status()); return status(); }
  function setOn(on) { s().telegramOn = !!on; saveSettings(); if (on) start(); else { stop(); setState('off'); } return status(); }

  // Fajl iz poruke: najveca fotografija ili dokument (samo pdf/jpg/png/webp)
  function pickFile(msg) {
    if (Array.isArray(msg.photo) && msg.photo.length) {
      const big = msg.photo.slice().sort((a, b) => ((b.file_size || 0) - (a.file_size || 0)) || ((b.width * b.height) - (a.width * a.height)))[0];
      return { file_id: big.file_id, file_size: big.file_size || 0, name: 'telegram.jpg', mime: 'image/jpeg' };
    }
    if (msg.document) {
      const d = msg.document, mime = String(d.mime_type || '').toLowerCase();
      if (!MIME_EXT[mime]) return { unsupported: 'type' };
      return { file_id: d.file_id, file_size: d.file_size || 0, name: String(d.file_name || ('telegram.' + MIME_EXT[mime])).slice(0, 80), mime };
    }
    return null;
  }
  async function downloadFile(f) {
    if (f.file_size > MAX_FILE) throw err('size');
    const info = await api('getFile', { file_id: f.file_id });
    if (!info || !info.file_path || (info.file_size || 0) > MAX_FILE) throw err('size');
    let res;
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
    let buf;
    try {
      res = await fetch(`${API}/file/bot${getToken()}/${info.file_path}`, { method: 'GET', signal: ctrl.signal });
      if (!res.ok) throw err('download');
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) { throw err('download'); }
    finally { clearTimeout(timer); }
    if (buf.length > MAX_FILE) throw err('size');
    return { base64: buf.toString('base64'), name: f.name, mime: f.mime };
  }

  const markup = buttons => ({ inline_keyboard: (buttons || []).map(row => row.map(b => ({ text: String(b.text).slice(0, 60), callback_data: String(b.data).slice(0, 64) }))) });
  async function deliver(replies, chatId) {
    chatId = chatId || s().telegramChatId;
    for (const r of replies || []) {
      if (!r || !r.text) continue;
      const text = String(r.text).slice(0, 4096);
      if (r.editMessageId) {
        const ok = await safe(() => api('editMessageText', { chat_id: chatId, message_id: r.editMessageId, text, reply_markup: markup(r.buttons) }));
        if (ok) continue;
      }
      await safe(() => api('sendMessage', { chat_id: chatId, text, reply_markup: r.buttons ? markup(r.buttons) : undefined }));
    }
  }

  // "@ime_bota 482100" / "kafa 250 @ime_bota" -> bez pominjanja bota (u grupi se botu tako pise; "/komanda@bot" ostaje)
  function stripMention(text) {
    const name = String(s().telegramBotName || '').replace(/[^A-Za-z0-9_]/g, '');
    const re = name ? new RegExp('(^|\\s)@' + name + '(?=\\s|$)', 'gi') : /(^|\s)@[A-Za-z0-9_]{3,}bot(?=\s|$)/gi;
    return String(text || '').replace(re, ' ').replace(/\s+/g, ' ').trim();
  }
  async function processUpdate(u) {
    const msg = u.message, cb = u.callback_query;
    const chatId = msg ? msg.chat && msg.chat.id : (cb && cb.message && cb.message.chat ? cb.message.chat.id : null);
    if (chatId == null) return;
    let linked = s().telegramChatId;
    // grupa je postala supergrupa: Telegram javlja novi id u staroj grupi — veza prelazi na novu
    if (msg && msg.migrate_to_chat_id && linked && String(linked) === String(chatId)) { s().telegramChatId = msg.migrate_to_chat_id; saveSettings(); return; }
    const fromId = msg ? msg.from && msg.from.id : cb.from && cb.from.id;
    const userOk = !s().telegramUserId || String(s().telegramUserId) === String(fromId);
    if (!linked || String(linked) !== String(chatId) || !userOk) {
      const text = msg ? stripMention(msg.text) : '';
      const linkable = !!msg && !!msg.chat && LINKABLE.includes(msg.chat.type);
      if (linkable && pair && pair.until > now() && /^\d{4,8}$/.test(text) && text !== pair.code && ++pair.tries >= MAX_PAIR_TRIES) { pair = null; onStatus(status()); }
      if (linkable && pair && pair.until > now() && text === pair.code) {
        s().telegramChatId = chatId;
        // privatni chat: samo ta osoba; grupa: svi clanovi (korisnik bira ko je u grupi)
        if (msg.chat.type === 'private') { s().telegramUserId = fromId; delete s().telegramChatTitle; }
        else { delete s().telegramUserId; s().telegramChatTitle = String(msg.chat.title || '').slice(0, 80); }
        saveSettings(); pair = null;
        await deliver([{ text: T('✓ Povezano sa Knjigom budžeta. Pošalji npr. „kafa 250“ ili sliku računa. /pomoc za uputstvo.') }], chatId);
        onStatus(status());
      }
      return; // tudji chat: bez odgovora
    }
    const chat = msg ? msg.chat : cb.message.chat;
    const from = msg ? msg.from : cb.from;
    const p = { update_id: u.update_id, group: !!chat && chat.type !== 'private',
      from: { id: from && from.id, name: String((from && (from.first_name || from.username)) || '').slice(0, 40) } };
    if (cb) Object.assign(p, { kind: 'callback', data: String(cb.data || ''), messageId: cb.message.message_id });
    else if (msg) {
      const f = pickFile(msg);
      if (f) {
        p.kind = 'file'; p.caption = stripMention(msg.caption);
        if (f.unsupported) p.fileError = f.unsupported;
        else {
          const prog = await safe(() => api('sendMessage', { chat_id: chatId, text: T('⏳ Čitam…') }));
          p.progressMessageId = prog && prog.message_id;
          try { p.file = await downloadFile(f); } catch (e) { p.fileError = e.kind === 'size' ? 'size' : 'download'; }
        }
      } else if (typeof msg.text === 'string') Object.assign(p, { kind: 'text', text: stripMention(msg.text) });
      else return; // sistemske poruke (novi clan, promena imena...) — bez odgovora
    } else return;
    const out = await withTimeout(handle(p), handleTimeoutMs); // baca -> offset ostaje, poruka dolazi ponovo
    if (cb) await safe(() => api('answerCallbackQuery', { callback_query_id: cb.id, text: (out && out.callbackText) || undefined }));
    await deliver(out && out.replies, chatId);
  }

  // Jedan krug: vraca sekunde cekanja pre sledeceg (0 = odmah, -1 = stani)
  async function pollOnce() {
    if (!getToken()) { setState('notoken'); return -1; }
    let updates;
    try {
      updates = await api('getUpdates', { offset: s().telegramOffset || 0, timeout: POLL_S, allowed_updates: ['message', 'callback_query'] }, (POLL_S + 15) * 1000);
    } catch (e) {
      if (abortedByStop) { abortedByStop = false; return stopFlag ? -1 : 0; }
      lastError = scrub(e.message);
      if (e.kind === 'badToken') { setState('badToken'); return -1; }
      setState(e.kind === 'conflict' ? 'conflict' : 'offline');
      const wait = e.kind === 'limit' && e.retryAfter ? e.retryAfter : BACKOFF[Math.min(errors, BACKOFF.length - 1)];
      errors++;
      return wait;
    }
    errors = 0; lastError = ''; setState('running');
    for (const u of updates || []) {
      try { await processUpdate(u); attempts.delete(u.update_id); }
      catch (e) {
        lastError = scrub(e && e.message);
        if (e && e.kind === 'badToken') { setState('badToken'); return -1; }
        const n = e && e.notReady ? 0 : (attempts.get(u.update_id) || 0) + 1;
        if (n < MAX_ATTEMPTS) { if (n) attempts.set(u.update_id, n); return 30; }
        attempts.delete(u.update_id);
        await deliver([{ text: T('✕ Ova poruka nije mogla da se obradi ({0}). Pošalji je ponovo ili je unesi u aplikaciji.', lastError) }]);
      }
      s().telegramOffset = u.update_id + 1; saveSettings();
    }
    if (s().telegramChatId && now() - lastTick >= TICK_MS) {
      lastTick = now();
      const out = await safe(() => withTimeout(tick(), handleTimeoutMs));
      if (out && out.replies && out.replies.length) await deliver(out.replies);
    }
    return 0;
  }
  async function loop() {
    if (running) return;
    running = true; stopFlag = false;
    try {
      while (!stopFlag && s().telegramOn !== false) {
        const wait = await pollOnce();
        if (wait < 0) break;
        if (wait > 0 && !stopFlag) await nap(wait * 1000);
      }
    } finally { running = false; }
  }
  function start() {
    if (!autoStart || !getToken() || s().telegramOn === false) return;
    if (running) { stopFlag = false; return; } // stara petlja jos radi (spava ili obradjuje) — samo nastavlja
    loop();
  }
  function stop() {
    stopFlag = true;
    if (pollCtrl) { abortedByStop = true; try { pollCtrl.abort(); } catch { /* vec zavrseno */ } }
    if (wake) { const w = wake; wake = null; w(); }
  }
  return { status, setToken, startPairing, unlink, setOn, pollOnce, start, stop, deliver };
}

function registerTelegramIpc(ipcMain, api) {
  ipcMain.handle('telegram:status', () => api.status());
  ipcMain.handle('telegram:set-token', (_e, token) => api.setToken(token));
  ipcMain.handle('telegram:pair', () => api.startPairing());
  ipcMain.handle('telegram:unlink', () => api.unlink());
  ipcMain.handle('telegram:set-on', (_e, on) => api.setOn(on));
}

module.exports = { createTelegram, registerTelegramIpc, MAX_FILE };
