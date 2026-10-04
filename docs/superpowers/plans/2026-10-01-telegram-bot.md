# Telegram bot (v1.28.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Korisnik šalje svom Telegram botu tekst („kafa 250“) i slike ili PDF-ove računa. Aplikacija na računaru ih prima i upisuje: tekst odmah, a slike posle potvrde dugmetom u Telegramu.

**Architecture:**
- **Prijem poruka:** `app/telegram.js` radi u glavnom procesu. Dugo čita poruke preko `getUpdates`, povezuje nalog kodom, preuzima fajlove i šalje odgovore. Token ostaje šifrovan u glavnom procesu.
- **Prosleđivanje stranici:** svaku poruku glavni proces prosleđuje stranici kao `window.__telegramBridge.handle(payload)`, preko `runInMain`, istog mehanizma koji koristi brzi unos.
- **Obrada:** stranica obrađuje poruku postojećim kodom (brzi unos, čitači računa) i vraća odgovore.
- **Jezgro:** čisti delovi (namera, nacrt unosa, vrsta slike, raspored dugmadi, čišćenje stavki na čekanju) idu u `budzet-core.js`.

**Tech Stack:** Electron 44 glavni proces (`net.fetch`), vanilla JS stranica, node:test, Electron smoke.

**Spec:** `docs/superpowers/specs/2026-10-01-telegram-bot-design.md`

## Global Constraints

- **Token:** nikad u stranici, logu, poruci o grešci ni chatu. Čuva se samo kao `telegramTokenEnc` (safeStorage); stranica vidi samo poslednja 4 znaka.
- **Ko sme da piše botu:** samo povezani chat (`telegramChatId`). Poruke iz drugih chatova se ignorišu i ne dobijaju odgovor. Izuzetak je važeći kod za povezivanje.
- **Potvrda primljene poruke:** offset se pomera tek kad stranica uspešno obradi update. Već obrađen `update_id` se ne upisuje ponovo (`budzet-telegram-obradjeno-v1`, poslednjih 500).
- **Fajlovi:** prihvataju se samo pdf/jpg/png/webp, najviše 10 MB.
- **Stavke na čekanju:** ističu posle 7 dana.
- **Tekstovi:** novi tekstovi idu u `i18n.js`; ključevi se prvo proveravaju alatom `i18nadd.js --check`.
- **Kopija web fajlova:** `copy-web` se pokreće pre svakog smoke-a.
- **Skripte za izmene:** pišu se alatom Write, ne kroz bash heredoc.
- **Testovi:** u testovima nema pravog Telegrama. Živi test se radi samo uz `KNJIGA_TELEGRAM_TEST_TOKEN` i samo sa izmišljenim podacima.
- **Verzija:** 1.28.0.

## Rulings u odnosu na spec (pre početka)

- **R1.**
  - *Spec:* slike se čuvaju u `.obrisano` do potvrde.
  - *Plan:* slike se čuvaju odmah u Prilozi. „Odbaci“ i istek ih premeštaju u `.obrisano`.
  - *Zašto:* postojeći IPC nema „sačuvaj u smeće“. Krajnji ishod je isti, a smeće se ionako briše posle 30 dana.
  - *Cena greške:* mala. Ako aplikacija padne pre „Odbaci“, u Priloge ostane višak slika.
- **R2.**
  - *Spec:* sažeci (`telegramReceiptSummary` i ostali) idu u jezgro.
  - *Plan:* idu u stranicu.
  - *Zašto:* to je formatiranje teksta sa `t()` i `fmt`. Proveravaju se smoke testom.
  - *Cena greške:* nema.
- **R3.**
  - *Spec:* uplatnica postaje rashod za plaćanje.
  - *Plan:* bot nudi **✓ Plaćeno** (plaćen rashod sa prilogom) i **Otvori u aplikaciji** (IPS prozor za plaćanje).
  - *Zašto:* neplaćen rashod sa primaocem trenutno nema dugme za IPS, pa bi samo stajao.
  - *Cena greške:* korisnik koji želi „za plaćanje“ otvara uplatnicu u aplikaciji.
- **R4.**
  - *Spec:* bot ima jedno dugme „Sačuvaj“ i za kućne račune.
  - *Plan:* kućni račun dobija dva dugmeta, **✓ Plaćen** i **✓ Za plaćanje**.
  - *Zašto:* postojeći prozor isto ima dva dugmeta.
- **R5.** Čuvanje kućnog računa iz bota koristi postojeći prozor za pregled bez prikazivanja (`headless`), umesto da se iz njega izdvaja posebna funkcija.
  - Zabranjeno je dok je neki prozor za račun otvoren na računaru; bot tada javlja da treba prvo završiti taj prozor.
  - *Zašto:* `saveBillFromReview` vezu sa ponavljajućom, zamenu i valutu radi preko polja forme. Prepisivanje toga je rizičnije od ponovnog korišćenja.

## Review Focus

1. **Duga obrada.** Čitanje računa traje 10–40 s, a za to vreme stigne nova poruka. Obrada ide redom, jedna po jedna, i nijedna se ne gubi. Pokriva se testom `telegram: update se obradjuje redom, offset posle svakog` (Task 1).
2. **Stranica nije spremna.** Prozor se još učitava, pa `__telegramBridge` ne postoji. Offset se ne pomera i poruka dolazi ponovo. Testovi: `telegram: greska u handle ne pomera offset` (Task 1) i `__notready` u `runTelegramBridge` (Task 2).
3. **Prozor za račun je već otvoren na računaru dok stiže „✓ Sačuvaj“ iz Telegrama.** Korisnikov prozor ostaje netaknut, a bot javi da treba sačekati. Smoke: `telegram: Sačuvaj dok je prozor otvoren ne dira prozor` (Task 5).
4. **Ponovo poslato dugme posle restarta.** Telegram ponovi `callback_query`, a stavka je već sačuvana. Upisa nema, a bot javlja „Ovo više nije na čekanju.“ Smoke: `telegram: dupli klik Sačuvaj ne upisuje dvaput` (Task 5).
5. **Tekst bez iznosa ili sa nepoznatom valutom.** Bot pošalje jasnu poruku i ništa ne upiše. Testovi: core `telegramEntryDraft` (Task 3) i smoke `telegram: bez iznosa ne upisuje` (Task 4).

---

### Task 1: `app/telegram.js` — prijem, povezivanje, slanje

**Files:**
- Create: `app/telegram.js`
- Create: `app/test/telegram.test.js`
- Modify: `app/package.json` — `"test"` script mora da uključi i `test/telegram.test.js`. Pogledaj kako je uključen `bills.test.js` i dodaj isto.

**Interfaces:**
- Produces:
  - `createTelegram({ fetch, safeStorage, getSettings, saveSettings, handle, tick, onStatus, T, now, sleep, random })` vraća `{ status, setToken, startPairing, unlink, setOn, pollOnce, start, stop, deliver }`.
  - `registerTelegramIpc(ipcMain, api)`.
  - `handle(payload)` vraća Promise sa `{ replies: [{ text, buttons?, editMessageId? }], callbackText? }`. Dugmad su redovi `[{ text, data }]`.
- Payload:
  - za tekst: `{ update_id, kind: 'text', text }`;
  - za fajl: `{ update_id, kind: 'file', caption, progressMessageId, file?: { base64, name, mime }, fileError?: 'type'|'size'|'download' }`;
  - za dugme: `{ update_id, kind: 'callback', data, messageId }`.
- `tick()` vraća Promise sa `{ replies }` i poziva se najviše jednom u 60 s.

- [ ] **Step 1: Failing test** — `app/test/telegram.test.js`:

```js
// Testovi za app/telegram.js — bez Electron-a i bez pravog Telegrama (lazni fetch i safeStorage)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegram } = require('../telegram.js');

const TOKEN = '123456:ABC-secret_token';
function setup({ handle, tick, settings: init } = {}){
  const settings = Object.assign({}, init || {});
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('X' + s), decryptString: b => b.toString().slice(1) };
  const calls = [], queue = {};
  const reply = (method, result, extra) => Object.assign({ ok: true, status: 200, json: async () => ({ ok: true, result }) }, extra || {});
  const fetch = async (url, opts) => {
    const m = /\/bot[^/]+\/(\w+)$/.exec(url) || /\/file\/bot[^/]+\/(.+)$/.exec(url);
    const method = url.includes('/file/bot') ? 'FILE' : m[1];
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, method, body });
    const q = queue[method];
    if (q && q.length) { const r = q.shift(); return typeof r === 'function' ? r(body) : r; }
    if (method === 'getMe') return reply(method, { username: 'knjiga_test_bot' });
    if (method === 'sendMessage') return reply(method, { message_id: 900 + calls.length });
    if (method === 'getUpdates') return reply(method, []);
    return reply(method, true);
  };
  const handled = [];
  const api = createTelegram({
    fetch, safeStorage, getSettings: () => settings, saveSettings: () => {},
    handle: handle || (async p => { handled.push(p); return { replies: [{ text: 'ok ' + p.kind }] }; }),
    tick: tick || (async () => ({ replies: [] })),
    T: s => s, now: () => 1000000, sleep: async () => {}, random: () => 0.4821, autoStart: false
  });
  return { api, settings, calls, queue, handled, reply };
}
const upd = (id, msg) => ({ update_id: id, message: Object.assign({ message_id: id, chat: { id: 77 }, from: { id: 77 } }, msg) });

test('telegram: token sifrovan, stranica vidi samo poslednja 4 znaka, getMe daje ime bota', async () => {
  const { api, settings } = setup();
  const st = await api.setToken(TOKEN);
  assert.equal(st.set, true); assert.equal(st.last4, 'oken'); assert.equal(st.botName, 'knjiga_test_bot');
  assert.ok(settings.telegramTokenEnc && !JSON.stringify(settings).includes('secret'));
  assert.ok(!JSON.stringify(api.status()).includes('secret'));
  const cleared = await api.setToken('');
  assert.equal(cleared.set, false); assert.equal(settings.telegramChatId, undefined);
});

test('telegram: povezivanje kodom, istekao kod i tudji chat se ignorisu', async () => {
  const { api, settings, queue, calls, reply, handled } = setup();
  await api.setToken(TOKEN);
  const { pairCode } = api.startPairing();
  assert.equal(pairCode, '4821');
  queue.getUpdates = [reply('getUpdates', [upd(1, { text: '1111' }), upd(2, { text: ' 4821 ' }), { update_id: 3, message: { message_id: 3, chat: { id: 55 }, text: 'kafa 250' } }])];
  await api.pollOnce();
  assert.equal(settings.telegramChatId, 77);
  assert.equal(settings.telegramOffset, 4);
  assert.equal(handled.length, 0); // ni kod ni tudja poruka ne idu stranici
  const sent = calls.filter(c => c.method === 'sendMessage');
  assert.equal(sent.length, 1); assert.equal(sent[0].body.chat_id, 77);
  assert.equal(api.status().pairCode, '');
});

test('telegram: update se obradjuje redom, offset posle svakog; greska u handle ne pomera offset', async () => {
  let fail = true;
  const order = [];
  const { api, settings, queue, reply } = setup({ settings: { telegramChatId: 77 }, handle: async p => {
    order.push(p.update_id);
    if (p.update_id === 11 && fail) throw new Error('page not ready');
    return { replies: [] };
  } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [upd(10, { text: 'a 1' }), upd(11, { text: 'b 2' }), upd(12, { text: 'c 3' })])];
  const wait = await api.pollOnce();
  assert.deepEqual(order, [10, 11]);
  assert.equal(settings.telegramOffset, 11);
  assert.ok(wait >= 30);
  fail = false;
  queue.getUpdates = [b => { assert.equal(b.offset, 11); return reply('getUpdates', [upd(11, { text: 'b 2' }), upd(12, { text: 'c 3' })]); }];
  await api.pollOnce();
  assert.deepEqual(order, [10, 11, 11, 12]);
  assert.equal(settings.telegramOffset, 13);
});

test('telegram: fotografija -> najveca velicina, poruka "Citam", base64 u payload; los tip i velicina', async () => {
  const { api, settings, queue, reply, handled, calls } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getFile = [b => { assert.equal(b.file_id, 'big'); return reply('getFile', { file_path: 'photos/a.jpg', file_size: 300 }); }];
  queue.FILE = [{ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }];
  queue.getUpdates = [reply('getUpdates', [
    upd(20, { caption: 'maxi', photo: [{ file_id: 'small', file_size: 10, width: 90, height: 90 }, { file_id: 'big', file_size: 300, width: 1280, height: 960 }] }),
    upd(21, { document: { file_id: 'd1', file_name: 'x.exe', mime_type: 'application/octet-stream', file_size: 5 } }),
    upd(22, { document: { file_id: 'd2', file_name: 'r.pdf', mime_type: 'application/pdf', file_size: 50 * 1024 * 1024 } })
  ])];
  await api.pollOnce();
  assert.equal(handled[0].kind, 'file'); assert.equal(handled[0].caption, 'maxi');
  assert.equal(handled[0].file.base64, Buffer.from([1, 2, 3]).toString('base64'));
  assert.equal(handled[0].file.mime, 'image/jpeg');
  assert.ok(handled[0].progressMessageId > 0);
  assert.equal(handled[1].fileError, 'type');
  assert.equal(handled[2].fileError, 'size');
  assert.ok(!calls.some(c => c.method === 'getFile' && c.body.file_id === 'd2'));
});

test('telegram: dugme -> answerCallbackQuery i izmena poruke; 429 i 401; token nije u gresci', async () => {
  const { api, settings, queue, reply, calls } = setup({ settings: { telegramChatId: 77 }, handle: async p => ({ callbackText: 'Sačuvano', replies: [{ editMessageId: p.messageId, text: '✓ Sačuvano' }] }) });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [{ update_id: 30, callback_query: { id: 'cb1', data: 's:abc', message: { message_id: 5, chat: { id: 77 } } } }])];
  await api.pollOnce();
  const ans = calls.find(c => c.method === 'answerCallbackQuery');
  assert.equal(ans.body.callback_query_id, 'cb1'); assert.equal(ans.body.text, 'Sačuvano');
  const ed = calls.find(c => c.method === 'editMessageText');
  assert.deepEqual([ed.body.message_id, ed.body.text, ed.body.reply_markup.inline_keyboard.length], [5, '✓ Sačuvano', 0]);
  queue.getUpdates = [{ ok: false, status: 429, json: async () => ({ ok: false, parameters: { retry_after: 17 } }) }];
  assert.equal(await api.pollOnce(), 17);
  queue.getUpdates = [async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/bot' + TOKEN + '/getUpdates'); }];
  await api.pollOnce();
  assert.equal(api.status().state, 'offline');
  assert.ok(!JSON.stringify(api.status()).includes('secret'));
  queue.getUpdates = [{ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) }];
  assert.equal(await api.pollOnce(), -1);
  assert.equal(api.status().state, 'badToken');
});

test('telegram: dugmad -> inline tastatura, tekst se skracuje na 4096', async () => {
  const { api, settings, calls } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  await api.deliver([{ text: 'x'.repeat(5000), buttons: [[{ text: '✓ Sačuvaj', data: 's:1' }], [{ text: '✕', data: 'x:1' }, { text: 'Otvori', data: 'o:1' }]] }]);
  const m = calls.find(c => c.method === 'sendMessage');
  assert.equal(m.body.text.length, 4096);
  assert.deepEqual(m.body.reply_markup.inline_keyboard, [[{ text: '✓ Sačuvaj', callback_data: 's:1' }], [{ text: '✕', callback_data: 'x:1' }, { text: 'Otvori', callback_data: 'o:1' }]]);
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `cd /e/Vanja/app && node --test test/telegram.test.js`
  - Expected: FAIL with "Cannot find module '../telegram.js'".

- [ ] **Step 3: Implementacija** — `app/telegram.js`:

```js
// Telegram bot u glavnom procesu: dugo citanje poruka (getUpdates), povezivanje kodom, preuzimanje fajlova i slanje odgovora.
// Token je sifrovan (safeStorage) i nikad ne ide u stranicu ni u poruke o gresci. Poruku obradjuje stranica (handle);
// offset (potvrda Telegramu) ide napred tek posle uspesne obrade, pa se neobradjena poruka ponovo dobija.
const API = 'https://api.telegram.org';
const POLL_S = 50;
const MAX_FILE = 10 * 1024 * 1024;
const PAIR_MS = 10 * 60 * 1000;
const TICK_MS = 60 * 1000;
const BACKOFF = [5, 10, 30, 60];
const MIME_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function createTelegram({ fetch, safeStorage, getSettings, saveSettings, handle, tick, onStatus = () => {}, T = s => s,
  now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random, autoStart = true }) {
  const s = () => getSettings();
  const encryption = () => { try { return !!safeStorage.isEncryptionAvailable(); } catch { return false; } };
  const getToken = () => {
    const enc = s().telegramTokenEnc;
    if (!enc || !encryption()) return '';
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  };
  let state = 'off';        // off | notoken | running | offline | conflict | badToken
  let pair = null;          // { code, until }
  let lastError = '', errors = 0, lastTick = 0, stopFlag = false, running = false, pollCtrl = null;
  const scrub = msg => { const tok = getToken(); let m = String(msg || ''); if (tok) m = m.split(tok).join('…'); return m.replace(/bot\d+:[\w-]+/g, 'bot…').slice(0, 300); };
  const err = (kind, extra) => Object.assign(new Error(kind), { kind }, extra || {});

  function status() {
    const tok = getToken();
    const pairing = !!pair && pair.until > now();
    return { set: !!tok, last4: tok ? (s().telegramTokenLast4 || '') : '', botName: s().telegramBotName || '', linked: !!s().telegramChatId,
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
      ['telegramTokenEnc', 'telegramTokenLast4', 'telegramBotName', 'telegramChatId', 'telegramOffset'].forEach(k => delete s()[k]);
      saveSettings(); setState('notoken'); return status();
    }
    if (!encryption()) return { ...status(), error: 'encryption' };
    const changed = getToken() !== token;
    s().telegramTokenEnc = safeStorage.encryptString(token).toString('base64');
    s().telegramTokenLast4 = token.slice(-4);
    if (changed) { delete s().telegramChatId; delete s().telegramOffset; delete s().telegramBotName; }
    saveSettings();
    try { const me = await api('getMe'); s().telegramBotName = String(me && me.username || ''); saveSettings(); lastError = ''; state = 'off'; }
    catch (e) { lastError = scrub(e.message); setState(e.kind === 'badToken' ? 'badToken' : 'offline'); return status(); }
    start();
    return status();
  }
  function startPairing() {
    const code = String(Math.floor(random() * 10000)).padStart(4, '0');
    pair = { code, until: now() + PAIR_MS };
    start();
    onStatus(status());
    return status();
  }
  function unlink() { delete s().telegramChatId; saveSettings(); pair = null; onStatus(status()); return status(); }
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
    try { res = await fetch(`${API}/file/bot${getToken()}/${info.file_path}`, { method: 'GET' }); }
    catch (e) { throw err('download'); }
    if (!res.ok) throw err('download');
    const buf = Buffer.from(await res.arrayBuffer());
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

  async function processUpdate(u) {
    const msg = u.message, cb = u.callback_query;
    const chatId = msg ? msg.chat && msg.chat.id : (cb && cb.message && cb.message.chat ? cb.message.chat.id : null);
    if (chatId == null) return;
    const linked = s().telegramChatId;
    if (!linked || String(linked) !== String(chatId)) {
      if (msg && pair && pair.until > now() && String(msg.text || '').trim() === pair.code) {
        s().telegramChatId = chatId; saveSettings(); pair = null;
        await deliver([{ text: T('✓ Povezano sa Knjigom budžeta. Pošalji npr. „kafa 250“ ili sliku računa. /pomoc za uputstvo.') }], chatId);
        onStatus(status());
      }
      return; // tudji chat: bez odgovora
    }
    const p = { update_id: u.update_id };
    if (cb) Object.assign(p, { kind: 'callback', data: String(cb.data || ''), messageId: cb.message.message_id });
    else if (msg) {
      const f = pickFile(msg);
      if (f) {
        p.kind = 'file'; p.caption = String(msg.caption || '');
        if (f.unsupported) p.fileError = f.unsupported;
        else {
          const prog = await safe(() => api('sendMessage', { chat_id: chatId, text: T('⏳ Čitam…') }));
          p.progressMessageId = prog && prog.message_id;
          try { p.file = await downloadFile(f); } catch (e) { p.fileError = e.kind === 'size' ? 'size' : 'download'; }
        }
      } else Object.assign(p, { kind: 'text', text: String(msg.text || '') });
    } else return;
    const out = await handle(p); // baca -> offset ostaje, poruka dolazi ponovo
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
      lastError = scrub(e.message);
      if (e.kind === 'badToken') { setState('badToken'); return -1; }
      setState(e.kind === 'conflict' ? 'conflict' : 'offline');
      const wait = e.kind === 'limit' && e.retryAfter ? e.retryAfter : BACKOFF[Math.min(errors, BACKOFF.length - 1)];
      errors++;
      return wait;
    }
    errors = 0; lastError = ''; setState('running');
    for (const u of updates || []) {
      try { await processUpdate(u); }
      catch (e) { lastError = scrub(e && e.message); return 30; }
      s().telegramOffset = u.update_id + 1; saveSettings();
    }
    if (s().telegramChatId && now() - lastTick >= TICK_MS) {
      lastTick = now();
      const out = await safe(() => tick());
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
        if (wait > 0 && !stopFlag) await sleep(wait * 1000);
      }
    } finally { running = false; }
  }
  function start() { if (autoStart && getToken() && s().telegramOn !== false) loop(); }
  function stop() { stopFlag = true; if (pollCtrl) { try { pollCtrl.abort(); } catch { /* vec zavrseno */ } } }
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
```

- [ ] **Step 4: Run, expect PASS**
  - Run: `cd /e/Vanja/app && node --test test/telegram.test.js`
  - Expected: 6/6 pass. If a test fails, fix the code, not the test (systematic-debugging).
- [ ] **Step 5:** Update the package.json test script, then run `npm test`. Expected: everything passes.
- [ ] **Step 6:** Commit: `Telegram: prijem poruka, povezivanje kodom, slanje odgovora (glavni proces)`.

### Task 2: Povezivanje u glavnom procesu i preload; čitanje priloga

**Files:**
- Modify: `app/main.js`
- Modify: `app/preload.js`
- Modify: `app/bills.js` + `app/test/bills.test.js` (`readFile`)

**Interfaces:**
- Consumes: Task 1, `createTelegram` / `registerTelegramIpc`.
- Produces:
  - `window.desktop.telegram.{ status, setToken, pair, unlink, setOn, onStatus(cb) }`;
  - `window.desktop.bills.readFile(name)`, koji vraća `{ ok, bytes: Uint8Array, name }` ili `{ ok: false }`.

- [ ] **Step 1: Failing test** (`bills.test.js`, na kraj):

```js
test('prilozi: readFile vraca bajtove samo za ime iz Priloga (bez putanje), ne iz smeca', () => {
  const { api } = setup(() => okResponse('{}'));
  const saved = api.saveFile(new Uint8Array([7, 8, 9]), 'racun.png');
  assert.ok(saved.ok);
  const r = api.readFile(saved.name);
  assert.equal(r.ok, true); assert.deepEqual([...r.bytes], [7, 8, 9]);
  assert.equal(api.readFile('../podaci.json').ok, false);
  assert.equal(api.readFile('nema.png').ok, false);
  api.deleteFile(saved.name);
  assert.equal(api.readFile(saved.name).ok, false);
});
```

- [ ] **Step 2:**
  - Run: `cd /e/Vanja/app && node --test test/bills.test.js`
  - Expected: FAIL with `api.readFile is not a function`.
- [ ] **Step 3: Implementacija**
  - **`bills.js`:** pored `filePath`, dodaj:
    ```js
    function readFile(name){ const p = filePath(name); if(!p) return { ok: false }; try { return { ok: true, bytes: new Uint8Array(fs.readFileSync(p)), name: path.basename(p) }; } catch { return { ok: false }; } }
    ```
    - Pre toga proveri da `filePath` odbija putanje i fajlove iz smeća. Ako ne odbija, test to otkriva; tada dodaj proveru `path.basename(name) === name && ALLOWED_EXT.test(name)`.
    - Dodaj `readFile` u return.
    - U `registerBillsIpc` dodaj: `ipcMain.handle('bills:read-file', (_e, name) => api.readFile(name));`.
  - **`preload.js`:**
    - `bills` dobija `readFile: (name) => ipcRenderer.invoke('bills:read-file', name)`;
    - novi blok:
    ```js
    // Telegram bot: token i petlja su u glavnom procesu; stranica vidi samo status
    telegram: {
      status: () => ipcRenderer.invoke('telegram:status'),
      setToken: (t) => ipcRenderer.invoke('telegram:set-token', t),
      pair: () => ipcRenderer.invoke('telegram:pair'),
      unlink: () => ipcRenderer.invoke('telegram:unlink'),
      setOn: (on) => ipcRenderer.invoke('telegram:set-on', on),
      onStatus: (cb) => ipcRenderer.on('telegram:status', (_e, st) => cb(st))
    },
    ```
  - **`main.js`:**
    - pored `require('./bills')` dodaj `const { createTelegram, registerTelegramIpc } = require('./telegram');`;
    - pored `let billsApi` dodaj `let telegramApi = null;`;
    - u `init()`, odmah posle `registerBillsIpc(...)`:
    ```js
    // Telegram: poruku obradjuje stranica (__telegramBridge); dok stranica nije spremna, poruka se ne potvrdjuje Telegramu
    const runTelegramBridge = async (fn, arg) => {
      const r = await runInMain(`window.__telegramBridge ? window.__telegramBridge.${fn}(${arg === undefined ? '' : JSON.stringify(arg)}) : '__notready'`);
      if (r === '__notready') throw new Error('stranica nije spremna');
      return r;
    };
    telegramApi = createTelegram({ fetch: (u, o) => net.fetch(u, o), safeStorage, getSettings: () => settings, saveSettings: saveSettingsNow, T,
      handle: p => runTelegramBridge('handle', p), tick: () => runTelegramBridge('tick'), onStatus: st => sendToMain('telegram:status', st) });
    registerTelegramIpc(ipcMain, telegramApi);
    ```
    - pored `mainWindow.webContents.once('did-finish-load', () => handleArgs(process.argv));` dodaj:
    ```js
    // u testovima bot ne radi (osim zivog testa sa test tokenom)
    if (!process.env.KNJIGA_TEST || process.env.KNJIGA_TELEGRAM_LIVE) mainWindow.webContents.once('did-finish-load', () => setTimeout(() => telegramApi.start(), 3000));
    ```
    - u `quitApp()`, ili na početku `before-quit` kad je `isQuitting`, dodaj `if (telegramApi) telegramApi.stop();`.
- [ ] **Step 4:**
  - Run: `npm test`. Expected: PASS.
  - Run smoke (`copy-web` + `node test/smoke.js`). Expected: SVE U REDU, jer je ponašanje nepromenjeno.
- [ ] **Step 5:** Commit: `Telegram: povezivanje u glavnom procesu, preload, čitanje priloga`.

### Task 3: Jezgro — namera, nacrt unosa, vrsta slike, dugmad, čekanje

**Files:**
- Modify: `budzet-core.js` (nova sekcija ispred `// ---------- Provera Excel fajla i fajla kopije ----------`; izvoz)
- Test: `app/test/core.test.js`

**Interfaces:**
- Produces:
  - `telegramIntent(text)` → `{ kind: 'command'|'entry'|'empty', command? }`, gde je `command` `'pomoc'|'ponisti'|'nepoznata'`. `/start` i `/help` daju `'pomoc'`.
  - `telegramEntryDraft(text, ctx)` → `{ type, desc, amount, currency, date, accountId, category }` ili `{ error: 'noamount'|'nodesc' }`. `ctx` je `{ today, accounts, currencies, rules, history, expenseCats, incomeCats }`.
  - `photoKindFromCaption(caption)` → `'receipt'|'bill'|'slip'|null`.
  - `parseTelegramCallback(data)` → `{ action, id, arg }` ili `null`.
  - `cleanTelegramPending(list, nowMs)` → `{ keep, expired }`.
  - `TELEGRAM_PENDING_DAYS = 7`.

- [ ] **Step 1: Failing test**:

```js
test('telegram: namera, nacrt unosa (prihod, pravila, istorija), vrsta slike, dugme, cekanje', () => {
  assert.deepEqual(C.telegramIntent('/pomoc'), { kind: 'command', command: 'pomoc' });
  assert.deepEqual(C.telegramIntent('/start'), { kind: 'command', command: 'pomoc' });
  assert.deepEqual(C.telegramIntent('/ponisti@knjiga_bot'), { kind: 'command', command: 'ponisti' });
  assert.deepEqual(C.telegramIntent('/xyz'), { kind: 'command', command: 'nepoznata' });
  assert.deepEqual(C.telegramIntent('   '), { kind: 'empty' });
  assert.deepEqual(C.telegramIntent('kafa 250'), { kind: 'entry' });
  const ctx = { today: '2026-10-01', accounts: [{ id: 'a1', name: 'Visa', type: 'tekuci' }], currencies: ['EUR'],
    rules: [{ keyword: 'gorivo', category: 'Auto' }, { keyword: 'gor', category: 'Ostalo' }],
    history: [{ type: 'expense', desc: 'kafa', category: 'Kafići' }], expenseCats: ['Hrana', 'Auto', 'Kafići', 'Ostalo'], incomeCats: ['Plata', 'Ostali prihodi'] };
  assert.deepEqual(C.telegramEntryDraft('kafa 250', ctx), { type: 'expense', desc: 'kafa', amount: 250, currency: null, date: '2026-10-01', accountId: null, category: 'Kafići' });
  const g = C.telegramEntryDraft('gorivo 6000 juče', ctx);
  assert.deepEqual([g.category, g.date, g.amount], ['Auto', '2026-09-30', 6000]);
  assert.equal(C.telegramEntryDraft('plata 120000', ctx).type, 'income');
  assert.equal(C.telegramEntryDraft('+ honorar 30000', ctx).type, 'income');
  assert.equal(C.telegramEntryDraft('hleb 80', ctx).category, null);
  assert.deepEqual(C.telegramEntryDraft('kafa', ctx), { error: 'noamount' });
  assert.deepEqual(C.telegramEntryDraft('250', ctx), { error: 'nodesc' });
  assert.equal(C.photoKindFromCaption('Struja septembar'), 'bill');
  assert.equal(C.photoKindFromCaption('račun za infostan'), 'bill');
  assert.equal(C.photoKindFromCaption('uplatnica vrtić'), 'slip');
  assert.equal(C.photoKindFromCaption('MAXI'), 'receipt');
  assert.equal(C.photoKindFromCaption('Idea'), 'receipt');
  assert.equal(C.photoKindFromCaption('ideja za poklon'), null);
  assert.equal(C.photoKindFromCaption(''), null);
  assert.deepEqual(C.parseTelegramCallback('k:abc123:receipt'), { action: 'k', id: 'abc123', arg: 'receipt' });
  assert.deepEqual(C.parseTelegramCallback('s:abc123'), { action: 's', id: 'abc123', arg: '' });
  assert.equal(C.parseTelegramCallback('z:abc'), null);
  assert.equal(C.parseTelegramCallback('s:../x'), null);
  const day = 864e5, now = 30 * day;
  const r = C.cleanTelegramPending([{ id: 'a', created: now - 8 * day, kind: 'receipt' }, { id: 'b', created: now - day, kind: 'bill' }, null, { id: 'c' }], now);
  assert.deepEqual(r.keep.map(p => p.id), ['b']);
  assert.deepEqual(r.expired.map(p => p.id), ['a']);
});
```

- [ ] **Step 2:**
  - Run: `npm test`
  - Expected: FAIL with `C.telegramIntent is not a function`.
- [ ] **Step 3: Implementacija** (`budzet-core.js`; `parseQuickSentence` i `foldText` već postoje):

```js
  // ---------- Telegram bot: poruka -> namera / nacrt unosa / vrsta slike ----------
  const TELEGRAM_PENDING_DAYS = 7;
  const TG_INCOME_WORDS = ['plata', 'prihod', 'honorar', 'penzija', 'zarada', 'bonus', 'dnevnica'];
  const TG_KIND_WORDS = [
    ['slip', ['uplatnica', 'uplatnicu', 'nalog za uplatu']],
    ['bill', ['struja', 'struju', 'eps', 'infostan', 'voda', 'vodu', 'vodovod', 'grejanje', 'toplana', 'gas', 'internet', 'telefon', 'kablovska', 'sbb', 'telekom', 'mts', 'yettel', 'komunalije', 'racun za']],
    ['receipt', ['maxi', 'lidl', 'idea', 'aman', 'dis', 'univerexport', 'tempo', 'roda', 'mercator', 'prodavnica', 'market', 'fiskalni', 'pijaca', 'apoteka']]
  ];
  function telegramIntent(text){
    const s = String(text || '').trim();
    if(!s) return { kind: 'empty' };
    if(s[0] === '/'){
      const cmd = foldText(s.slice(1).split(/[\s@]/)[0]);
      return { kind: 'command', command: ['start', 'help', 'pomoc'].includes(cmd) ? 'pomoc' : (cmd === 'ponisti' ? 'ponisti' : 'nepoznata') };
    }
    return { kind: 'entry' };
  }
  // Tekst iz Telegrama -> nacrt unosa: "+" na pocetku ili rec prihoda (plata, honorar...) = prihod; kategorija iz pravila, pa iz istorije
  function telegramEntryDraft(text, ctx){
    const c = ctx || {};
    let raw = String(text || '').trim(), type = 'expense';
    if(raw[0] === '+'){ type = 'income'; raw = raw.slice(1).trim(); }
    const p = parseQuickSentence(raw, { today: c.today, accounts: c.accounts || [], currencies: c.currencies || [] });
    const desc = String(p.desc || '').trim();
    if(!(p.amount > 0)) return { error: desc || !raw ? 'noamount' : 'nodesc' };
    if(!desc) return { error: 'nodesc' };
    const first = foldText(desc.split(/\s+/)[0]);
    if(type === 'expense' && (TG_INCOME_WORDS.includes(first) || (c.incomeCats || []).some(x => foldText(x) === first))) type = 'income';
    const cats = (type === 'expense' ? c.expenseCats : c.incomeCats) || [];
    const low = desc.toLowerCase();
    let category = null;
    if(type === 'expense'){
      const rule = (c.rules || []).filter(r => r && r.keyword).slice().sort((a, b) => b.keyword.length - a.keyword.length).find(r => low.includes(String(r.keyword).toLowerCase()));
      if(rule && cats.includes(rule.category)) category = rule.category;
    }
    if(!category){
      const h = (c.history || []).find(x => x && x.type === type && String(x.desc || '').toLowerCase() === low);
      if(h && cats.includes(h.category)) category = h.category;
    }
    return { type, desc, amount: p.amount, currency: p.currency || null, date: p.date || c.today, accountId: p.accountId || null, category };
  }
  function photoKindFromCaption(caption){
    const f = ' ' + foldText(String(caption || '')).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    if(!f.trim()) return null;
    for(const [kind, words] of TG_KIND_WORDS) if(words.some(w => f.includes(' ' + w + ' '))) return kind;
    return null;
  }
  // callback_data: "<akcija>:<id>[:<arg>]"; akcije k (vrsta), s (sacuvaj), x (odbaci), o (otvori), u (ponisti)
  function parseTelegramCallback(data){
    const m = /^([ksxou]):([A-Za-z0-9]{1,40})(?::([a-z]{1,10}))?$/.exec(String(data || ''));
    return m ? { action: m[1], id: m[2], arg: m[3] || '' } : null;
  }
  function cleanTelegramPending(list, nowMs){
    const limit = nowMs - TELEGRAM_PENDING_DAYS * 864e5;
    const valid = (Array.isArray(list) ? list : []).filter(p => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.created === 'number');
    return { keep: valid.filter(p => p.created >= limit), expired: valid.filter(p => p.created < limit) };
  }
```

Dodaj u `return { … }`, posle `estimateShoppingItem,`, sledeće:

```js
TELEGRAM_PENDING_DAYS, telegramIntent, telegramEntryDraft, photoKindFromCaption, parseTelegramCallback, cleanTelegramPending,
```

U `DATA_ARRAY_KEYS` dodaj `'budzet-telegram-cekanje-v1'`.

- [ ] **Step 4:**
  - Run: `npm test`. Expected: PASS.
  - Ako `parseQuickSentence('250')` vrati opis „250“, ili `'juče'` ne da 2026-09-30: pogledaj šta funkcija stvarno vraća. Zatim prilagodi nacrt, a ne test. Ako je u pitanju stvarna razlika u ponašanju, zapiši Ruling u ledger.
- [ ] **Step 5:** Commit: `Jezgro: Telegram namera, nacrt unosa, vrsta slike, dugmad, čekanje`.

### Task 4: Stranica — podešavanja, tekst u rashod, komande, poništavanje

**Files:**
- Modify: `budzet-tracker.html`
- Modify: `i18n.js`
- Modify: `app/test/smoke-checks.js`

**Interfaces:**
- Consumes: Task 2 (`desktop.telegram.*`) i Task 3 (`C.telegram*`).
- Produces:
  - `window.__telegramBridge = { handle(p), tick() }`, oba vraćaju Promise sa `{ replies, callbackText? }`;
  - test hook `window.__fakeTgCategory`;
  - `__desktopBridge.addEntry(...)` sada vraća i `ids`, `category`, `type`.

- [ ] **Step 1: Failing smoke.** Blok ide ispred `    // Cuvanje u fajl`:

```js
    // Telegram: tekst -> rashod, dupli update, ponisti, komande, bez iznosa, podesavanja
    {
      check('telegram: most postoji', !!window.__telegramBridge && typeof window.__telegramBridge.handle === 'function');
      if (window.__telegramBridge) {
        const B = window.__telegramBridge;
        const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
        window.__fakeTgCategory = async () => ({ ok: true, content: JSON.stringify({ kategorija: 'Ostalo' }) });
        const n0 = ents().length;
        const r1 = await B.handle({ update_id: 900001, kind: 'text', text: 'Smoke tg kafa 250' });
        const e1 = ents().find(e => e.desc === 'Smoke tg kafa');
        check('telegram: tekst postaje rashod', !!e1 && e1.amount === 250 && e1.type === 'expense', JSON.stringify(e1));
        check('telegram: odgovor sa iznosom i dugmetom Poništi', /✓/.test(r1.replies[0].text) && /250/.test(r1.replies[0].text) && /^u:/.test(r1.replies[0].buttons[0][0].data), JSON.stringify(r1));
        const r1b = await B.handle({ update_id: 900001, kind: 'text', text: 'Smoke tg kafa 250' });
        check('telegram: isti update se ne upisuje dvaput', ents().length === n0 + 1 && r1b.replies.length === 0);
        const r2 = await B.handle({ update_id: 900002, kind: 'callback', data: r1.replies[0].buttons[0][0].data, messageId: 5 });
        check('telegram: Poništi briše rashod i menja poruku', !ents().some(e => e.desc === 'Smoke tg kafa') && r2.replies[0].editMessageId === 5, JSON.stringify(r2));
        const r3 = await B.handle({ update_id: 900003, kind: 'text', text: 'Smoke tg kafa' });
        check('telegram: bez iznosa ne upisuje', ents().length === n0 && /iznos/i.test(r3.replies[0].text), r3.replies[0] && r3.replies[0].text);
        const r4 = await B.handle({ update_id: 900004, kind: 'text', text: '/pomoc' });
        check('telegram: /pomoc daje uputstvo', /kafa 250/.test(r4.replies[0].text));
        await B.handle({ update_id: 900005, kind: 'text', text: '+Smoke tg honorar 3000' });
        check('telegram: + znači prihod', ents().some(e => e.desc === 'Smoke tg honorar' && e.type === 'income' && e.amount === 3000));
        const r6 = await B.handle({ update_id: 900006, kind: 'text', text: '/ponisti' });
        check('telegram: /ponisti poništava poslednji unos', !ents().some(e => e.desc === 'Smoke tg honorar') && /Poništeno/.test(r6.replies[0].text), r6.replies[0] && r6.replies[0].text);
        window.__fakeTgCategory = null;
      }
      go('podesavanja'); await sleep(150);
      check('telegram: podešavanja imaju odeljak', !!$('tgSettings') && $('tgSettings').style.display !== 'none' && !!$('tgToken') && !!$('tgPair'));
    }
```

- [ ] **Step 2:**
  - Run: `copy-web` + smoke.
  - Expected: `✗ telegram: most postoji` and `✗ telegram: podešavanja imaju odeljak`.

- [ ] **Step 3: Implementacija**

**a) `addEntry`** (u `__desktopBridge`). Povratna vrednost:

```js
        return { ok:true, amountText: fmt(total) + (parts.length > 1 ? t(' ({0} kategorije)', parts.length) : ''), ids: made, category: parts[0].category, type };
```

Uz to, pre `parts.forEach`, dodaj `const made = [];`, a u petlji `made.push(id);`.

**b) Poništavanje zaokruživanja** (pored `applyRoundUpSaving`):

```js
  function unapplyRoundUpSaving(amount){
    if(!roundUpGoalId) return;
    const g = goals.find(x=>x.id === roundUpGoalId);
    const roundup = Math.ceil(amount/100)*100 - amount;
    if(!g || roundup <= 0) return;
    g.current = Math.max(0, Math.round((g.current - roundup) * 100) / 100);
    saveGoals();
  }
```

**c) HTML podešavanja.** Posle zatvarajućeg `</div>` od `#aiSettings`:

```html
      <div class="settings-group" id="tgSettings" style="display:none;">
        <h3>Telegram bot</h3>
        <div class="import-status" style="margin-top:0;">Šalji botu rashode („kafa 250“) i slike računa sa telefona — upisuju se ovde. Napravi bota: u Telegramu otvori @BotFather, pošalji /newbot i nalepi token ovde.</div>
        <div class="import-status"><label for="tgToken">Token bota</label></div>
        <div class="file-row"><input type="password" id="tgToken" autocomplete="off" style="max-width:320px;"><button class="btn-secondary" id="tgTokenSave">Sačuvaj token</button><button class="btn-link" id="tgTokenClear">Obriši token</button></div>
        <div class="file-row"><button class="btn-secondary" id="tgPair">Poveži Telegram</button><button class="btn-link" id="tgUnlink">Prekini vezu</button></div>
        <label class="paid-checkbox-label"><input type="checkbox" id="tgOn"> Bot uključen</label>
        <div class="import-status" id="tgStatus" aria-live="polite"></div>
        <div class="import-status">Bot radi dok je aplikacija pokrenuta (i u traci pored sata). Telegram čuva poruke 24 sata — ako je računar duže ugašen, starije poruke se gube; poruka na koju bot nije odgovorio nije upisana. Poruke sa botom nisu šifrovane s kraja na kraj (Telegram ih vidi).</div>
      </div>
```

**d) JS podešavanja.** Ide posle `aiKeysLink` listenera:

```js
  // ---------- Telegram bot: podesavanja (token i petlja su u glavnom procesu) ----------
  const tgEl = id => document.getElementById(id);
  const TG_STATE = { notoken: ()=> t('Token nije upisan.'), off: ()=> t('Bot je isključen.'), running: ()=> t('Radi.'), offline: ()=> t('Nema veze sa Telegramom — pokušavam ponovo.'),
    conflict: ()=> t('Isti bot radi na drugom mestu (drugi računar ili webhook).'), badToken: ()=> t('Token ne važi — proveri ga u @BotFather.') };
  let tgPairTimer = null;
  function renderTgStatus(st){
    if(!st) return;
    tgEl('tgToken').value = ''; tgEl('tgToken').placeholder = st.set ? t('upisan (…{0})', st.last4) : t('nije upisan');
    tgEl('tgOn').checked = st.on;
    ['tgPair', 'tgOn'].forEach(id=> { tgEl(id).disabled = !st.set; });
    tgEl('tgUnlink').style.display = st.linked ? '' : 'none';
    const parts = [];
    if(st.pairCode) parts.push(t('Pošalji botu {0} kod: {1} (važi još {2} min).', st.botName ? '@' + st.botName : '', st.pairCode, Math.max(1, Math.ceil((st.pairUntil - Date.now()) / 60000))));
    else if(st.linked) parts.push(t('Povezan sa {0}.', st.botName ? '@' + st.botName : t('botom')));
    else if(st.set) parts.push(t('Nije povezan — klikni „Poveži Telegram“.'));
    if(TG_STATE[st.state] && (st.state !== 'running' || !st.linked)) parts.push(TG_STATE[st.state]());
    if(st.set && !(document.getElementById('deskCloseToTray') || {}).checked) parts.push(t('Zatvaranje prozora gasi aplikaciju, pa i bota — uključi „Zatvaranje prozora ostavlja aplikaciju u system tray-u“.'));
    if(st.encryption === false) parts.push(t('Šifrovanje ključa nije dostupno na ovom računaru, pa ključ ne može da se sačuva.'));
    tgEl('tgStatus').textContent = parts.join(' ');
    clearTimeout(tgPairTimer);
    if(st.pairCode) tgPairTimer = setTimeout(async ()=> renderTgStatus(await window.desktop.telegram.status()), 30000);
  }
  async function renderTgSettings(){
    const box = tgEl('tgSettings');
    if(!(window.desktop && window.desktop.telegram)){ box.style.display = 'none'; return; }
    box.style.display = '';
    renderTgStatus(await window.desktop.telegram.status());
  }
  if(window.desktop && window.desktop.telegram){
    window.desktop.telegram.onStatus(st=> renderTgStatus(st));
    tgEl('tgTokenSave').addEventListener('click', async ()=>{ const v = tgEl('tgToken').value.trim(); if(!v) return; tgEl('tgStatus').textContent = t('Proveravam…'); renderTgStatus(await window.desktop.telegram.setToken(v)); });
    tgEl('tgTokenClear').addEventListener('click', async ()=> renderTgStatus(await window.desktop.telegram.setToken('')));
    tgEl('tgPair').addEventListener('click', async ()=> renderTgStatus(await window.desktop.telegram.pair()));
    tgEl('tgUnlink').addEventListener('click', async ()=>{ if(await appConfirm(t('Prekinuti vezu sa Telegramom? Bot više neće primati tvoje poruke dok ga ponovo ne povežeš.'))) renderTgStatus(await window.desktop.telegram.unlink()); });
    tgEl('tgOn').addEventListener('change', async e=> renderTgStatus(await window.desktop.telegram.setOn(e.target.checked)));
  }
```

`renderTgSettings()` se poziva tamo gde se poziva `renderAiSettings()`: na prikazu Podešavanja (`grep -n "renderAiSettings()"`).

**e) Most.** Ide na kraj glavnog skripta, ispred `window.__desktopBridge`, ili posle bloka za račune (Task 5 ga proširuje):

```js
  // ---------- Telegram bot: obrada poruka (glavni proces prosledi poruku, ovde se upisuje i vrati odgovor) ----------
  const TG_DONE_KEY = 'budzet-telegram-obradjeno-v1', TG_PENDING_KEY = 'budzet-telegram-cekanje-v1', TG_LOG_KEY = 'budzet-telegram-unosi-v1';
  const tgLoad = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; } };
  const tgSave = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  let fakeTgCategory = null; // test: req -> { ok, content }
  Object.defineProperty(window, '__fakeTgCategory', { get: ()=> fakeTgCategory, set: v=>{ fakeTgCategory = v; }, configurable: true });
  const tgReply = (text, extra) => ({ replies: [Object.assign({ text }, extra || {})] });
  const tgDayLabel = iso => { const today = toISODateLocal(new Date()); const y = new Date(); y.setDate(y.getDate() - 1);
    return iso === today ? t('danas') : iso === toISODateLocal(y) ? t('juče') : fmtDocDate(iso); };
  const TG_HELP = () => t('Pošalji rashod kao „kafa 250“, „gorivo 6000 juče visa“ ili prihod sa + („+honorar 30000“). Pošalji sliku ili PDF računa iz prodavnice, kućnog računa ili uplatnice — pokazaću šta sam pročitao pa ti potvrdiš. /ponisti poništava poslednji unos.');
  async function tgAiCategory(desc){
    if(String(desc).replace(/[^\p{L}]/gu, '').length < 4) return null;
    const req = { images: [], text: '', prompt: C.quickCategoryPrompt(expenseCats, desc) };
    const call = fakeTgCategory ? fakeTgCategory(req) : (window.desktop && window.desktop.bills ? window.desktop.bills.read(req) : null);
    if(!call) return null;
    const res = await Promise.race([Promise.resolve(call).catch(()=> null), new Promise(r=> setTimeout(()=> r(null), 3000))]);
    return res && res.ok ? C.cleanQuickCategory(res.content, expenseCats) : null;
  }
  function tgLog(ids, label){
    const id = newId();
    tgSave(TG_LOG_KEY, tgLoad(TG_LOG_KEY).concat({ id, ids, label, at: Date.now() }).slice(-50));
    return id;
  }
  function tgUndo(logId){
    const log = tgLoad(TG_LOG_KEY), item = logId ? log.find(l=> l.id === logId) : log.filter(l=> !l.undone && Date.now() - l.at < 864e5).pop();
    if(!item || item.undone) return null;
    const set = new Set(item.ids), gone = entries.filter(e=> set.has(e.id));
    gone.forEach(e=>{ if(e.type === 'expense') unapplyRoundUpSaving(e.amount); });
    if(gone.length){ entries = entries.filter(e=> !set.has(e.id)); saveEntries(); renderAll(); }
    item.undone = true; tgSave(TG_LOG_KEY, log);
    return item;
  }
  async function tgText(text){
    const intent = C.telegramIntent(text);
    if(intent.kind === 'command' && intent.command === 'ponisti'){
      const it = tgUndo(null);
      return tgReply(it ? t('↩ Poništeno: {0}', it.label) : t('Nema unosa iz Telegrama za poništavanje (poslednja 24 sata).'));
    }
    if(intent.kind !== 'entry') return tgReply(TG_HELP());
    const data = window.__desktopBridge.getQuickAddData();
    const d = C.telegramEntryDraft(text, { today: toISODateLocal(new Date()), accounts: data.accounts || [], currencies: CURRENCIES.filter(c=> c !== 'RSD'),
      rules: data.rules, history: data.history, expenseCats, incomeCats });
    if(d.error === 'noamount') return tgReply(t('Nisam našao iznos — pošalji npr. „kafa 250“.'));
    if(d.error) return tgReply(t('Napiši i šta je, npr. „kafa 250“.'));
    const category = d.category || (d.type === 'expense' ? await tgAiCategory(d.desc) : null) || '';
    const r = window.__desktopBridge.addEntry({ type: d.type, desc: d.desc, amount: d.amount, currency: d.currency || 'RSD', date: d.date, accountId: d.accountId || undefined, category, paid: true });
    if(!r || !r.ok) return tgReply('✕ ' + ((r && r.error) || t('Stavka nije dodata.')));
    const label = `${d.desc} · ${r.amountText}`;
    const logId = tgLog(r.ids, label);
    return tgReply(`✓ ${d.type === 'income' ? t('Prihod') + ': ' : ''}${label} · ${r.category} · ${tgDayLabel(d.date)}`, { buttons: [[{ text: t('Poništi'), data: 'u:' + logId }]] });
  }
  async function tgCallback(p){
    const cb = C.parseTelegramCallback(p.data);
    if(!cb) return { replies: [] };
    if(cb.action === 'u'){
      const it = tgUndo(cb.id);
      return { callbackText: it ? t('Poništeno') : t('Već poništeno'), replies: it ? [{ editMessageId: p.messageId, text: t('↩ Poništeno: {0}', it.label) }] : [] };
    }
    return tgFileCallback(p, cb); // Task 5
  }
  async function tgHandle(p){
    const done = tgLoad(TG_DONE_KEY);
    if(!p || done.includes(p.update_id)) return { replies: [] };
    let out = { replies: [] };
    if(p.kind === 'text') out = await tgText(p.text);
    else if(p.kind === 'callback') out = await tgCallback(p);
    else if(p.kind === 'file') out = await tgFile(p); // Task 5
    tgSave(TG_DONE_KEY, tgLoad(TG_DONE_KEY).concat(p.update_id).slice(-500));
    return out;
  }
  async function tgTick(){ return tgFileTick(); } // Task 5
  // Task 4: privremeno, dok Task 5 ne doda obradu fajlova
  async function tgFile(p){ return tgReply(t('Slike još ne primam.'), p.progressMessageId ? { editMessageId: p.progressMessageId } : null); }
  async function tgFileCallback(){ return { replies: [] }; }
  async function tgFileTick(){ return { replies: [] }; }
  window.__telegramBridge = { handle: tgHandle, tick: tgTick };
```

Napomena: `getQuickAddData` je metoda objekta `__desktopBridge`, pa proveri da li se tako zove (`grep -n "getQuickAddData" budzet-tracker.html`). Most se registruje samo kad postoji `window.desktop`, isto kao `__desktopBridge`; ako je `__desktopBridge` već pod tim uslovom, stavi most u isti blok.

**f) EN.** Za sve nove tekstove u `t(…)` i HTML-u napravi snippet, pa pokreni `i18nadd.js --check`, pa dodaj. Pazi na sudare sa postojećim ključevima: 'Poništi', 'danas', 'Prihod', 'Proveravam…' i 'upisan (…{0})' verovatno već postoje, pa ih preskoči.

- [ ] **Step 4:** Run smoke. Expected: all ✓.
- [ ] **Step 5:** Commit: `Telegram: podešavanja, tekst u rashod, /pomoc, /ponisti, poništavanje`.

### Task 5: Stranica — slike i PDF: vrsta, čitanje, potvrda, otvaranje, isticanje, ponovni pokušaj

**Files:**
- Modify: `budzet-tracker.html`
- Modify: `i18n.js`
- Modify: `app/test/smoke-checks.js`

**Interfaces:**
- Consumes:
  - Task 4 (most, `tgReply`, `tgLog`, `tgLoad`/`tgSave`, `TG_PENDING_KEY`);
  - Task 2 (`desktop.bills.readFile`);
  - postojeće: `prepareBillFile`, `readReceiptPart`, `readBill`, `readSlip`, `openBillReview`, `saveBillFromReview`, `openIpsOneOff`, `addReceiptFiles`.
- Produces:
  - `saveReceiptData(d)` vraća Promise sa `{ ok, ids?, count?, error?, cancelled? }`;
  - `mergedReceiptState(parts)` vraća `{ items, store, date, total }`;
  - `saveBillFromReview(paid)` vraća Promise sa `true` ili `false`;
  - `openBillReview(opts)` prihvata `opts.savedFile` i `opts.headless`.

- [ ] **Step 1: Failing smoke.** Blok ide posle Task 4 bloka. Koristi postojeći `__fakeReceiptReading`, `__fakeBillReading` i `__fakeSlipReading`. Mali PNG pravi se kao u postojećim proverama računa (`grep -n "toBlob" app/test/smoke-checks.js` i kopiraj pomoćnu funkciju).

```js
    // Telegram: slika -> vrsta -> sazetak -> Sacuvaj/Odbaci/Otvori; cekanje posle osvezavanja; zauzet prozor; dupli klik
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const pend = () => JSON.parse(localStorage.getItem('budzet-telegram-cekanje-v1') || '[]');
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      const b64 = btoa(String.fromCharCode(...png));
      const file = { base64: b64, name: 'telegram.png', mime: 'image/png' };
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke TG Maxi', date: '2026-09-28', total: 300, items: [{ name: 'Smoke TG hleb', qty: 1, unit: 'kom', price: 100, category: 'Hrana' }, { name: 'Smoke TG sapun', qty: 1, unit: 'kom', price: 200, category: 'Hrana' }] }) });
      // bez opisa -> pitanje o vrsti
      const a1 = await B.handle({ update_id: 900101, kind: 'file', caption: '', progressMessageId: 41, file });
      const ask = a1.replies[0];
      check('telegram: slika bez opisa pita za vrstu', ask.editMessageId === 41 && ask.buttons.flat().some(b => /^k:.+:receipt$/.test(b.data)), JSON.stringify(a1));
      const kData = ask.buttons.flat().find(b => /:receipt$/.test(b.data)).data;
      const a2 = await B.handle({ update_id: 900102, kind: 'callback', data: kData, messageId: 41 });
      const sum = a2.replies[0];
      check('telegram: sažetak računa sa dugmadima', /Smoke TG Maxi/.test(sum.text) && /300/.test(sum.text) && sum.buttons.flat().some(b => /^s:/.test(b.data)), sum.text);
      const sData = sum.buttons.flat().find(b => /^s:/.test(b.data)).data;
      // zauzet prozor: korisnik ima otvoren prozor za racun -> nista se ne dira
      $('receiptOverlay').classList.add('show');
      const busy = await B.handle({ update_id: 900103, kind: 'callback', data: sData, messageId: 41 });
      check('telegram: Sačuvaj dok je prozor otvoren ne dira prozor', !ents().some(e => e.desc === 'Smoke TG Maxi') && !!busy.callbackText && $('receiptOverlay').classList.contains('show'), JSON.stringify(busy));
      $('receiptOverlay').classList.remove('show');
      const a3 = await B.handle({ update_id: 900104, kind: 'callback', data: sData, messageId: 41 });
      const saved = ents().filter(e => e.desc === 'Smoke TG Maxi');
      check('telegram: Sačuvaj upisuje račun sa prilogom', saved.length === 1 && saved[0].amount === 300 && (saved[0].attachments || []).length === 1 && /✓/.test(a3.replies[0].text), JSON.stringify(saved));
      const a4 = await B.handle({ update_id: 900105, kind: 'callback', data: sData, messageId: 41 });
      check('telegram: dupli klik Sačuvaj ne upisuje dvaput', ents().filter(e => e.desc === 'Smoke TG Maxi').length === 1 && /više nije na čekanju/.test((a4.replies[0] || {}).text || ''), JSON.stringify(a4));
      // opis "struja" -> kucni racun; Odbaci; cekanje ostaje posle ponovnog citanja iz localStorage
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ billType: 'Struja', month: '2026-09', amount: 4321, dueDate: '2026-10-15' }) });
      const b1 = await B.handle({ update_id: 900106, kind: 'file', caption: 'struja', progressMessageId: 42, file });
      check('telegram: opis „struja“ odmah čita kućni račun', /4[.,]?321/.test(b1.replies[0].text) && b1.replies[0].buttons.flat().some(b => /^s:.+:n$/.test(b.data)), b1.replies[0].text);
      check('telegram: na čekanju je sačuvano', pend().some(p => p.kind === 'bill'));
      const xData = b1.replies[0].buttons.flat().find(b => /^x:/.test(b.data)).data;
      const b2 = await B.handle({ update_id: 900107, kind: 'callback', data: xData, messageId: 42 });
      check('telegram: Odbaci ne pravi ništa', !pend().some(p => p.kind === 'bill') && /Odbačeno/.test(b2.replies[0].text) && !window.__bills().bills.some(b => b.amount === 4321), b2.replies[0].text);
      // Otvori u aplikaciji -> prozor za racun iz prodavnice sa procitanim stavkama
      const c1 = await B.handle({ update_id: 900108, kind: 'file', caption: 'maxi', progressMessageId: 43, file });
      const oData = c1.replies[0].buttons.flat().find(b => /^o:/.test(b.data)).data;
      await B.handle({ update_id: 900109, kind: 'callback', data: oData, messageId: 43 }); await sleep(300);
      check('telegram: Otvori otvara prozor za pregled', $('receiptOverlay').classList.contains('show') && window.__receiptState().items.length === 2, String(window.__receiptState() && window.__receiptState().items.length));
      $('receiptCancel').click(); await sleep(80);
      // AI zauzet -> ponovni pokusaj u tick
      window.__fakeReceiptReading = () => ({ ok: false, kind: 'limit', retryAfter: 30 });
      const d1 = await B.handle({ update_id: 900110, kind: 'file', caption: 'maxi', progressMessageId: 44, file });
      check('telegram: AI zauzet -> poruka i čekanje', /zauzet/.test(d1.replies[0].text) && pend().some(p => p.retryAt), d1.replies[0].text);
      const pl = pend(); pl.forEach(p => { if (p.retryAt) p.retryAt = Date.now() - 1; }); localStorage.setItem('budzet-telegram-cekanje-v1', JSON.stringify(pl));
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke TG Lidl', date: '2026-09-28', total: 50, items: [{ name: 'Smoke TG voda', price: 50, category: 'Hrana' }] }) });
      const t1 = await B.tick();
      check('telegram: tick ponovo čita i šalje sažetak', t1.replies.some(r => r.editMessageId === 44 && /Smoke TG Lidl/.test(r.text)), JSON.stringify(t1));
      // isticanje posle 7 dana
      const pl2 = pend(); pl2.forEach(p => { p.created = Date.now() - 8 * 864e5; }); localStorage.setItem('budzet-telegram-cekanje-v1', JSON.stringify(pl2));
      const t2 = await B.tick();
      check('telegram: posle 7 dana ističe', pend().length === 0 && t2.replies.some(r => /Isteklo/.test(r.text)), JSON.stringify(t2));
      // los fajl
      const f1 = await B.handle({ update_id: 900111, kind: 'file', caption: '', progressMessageId: 45, fileError: 'type' });
      check('telegram: nepodržan fajl dobija objašnjenje', /PDF|JPG/i.test(f1.replies[0].text), f1.replies[0].text);
      window.__fakeReceiptReading = null; window.__fakeBillReading = null;
      window.__deleteEntriesById(ents().filter(e => /^Smoke TG/.test(e.desc)).map(e => e.id));
    }
```

Oblik lažnog AI odgovora za kućni račun (`__fakeBillReading`) i `__bills()` prepiši iz postojećih smoke provera kućnih računa (`grep -n "__fakeBillReading = " app/test/smoke-checks.js`) — gornji JSON je samo skica. `__bills()`: koristi postojeći test hook (`grep -n "window.__bills = "`), sa onim oblikom koji on stvarno vraća.

- [ ] **Step 2:**
  - Run smoke.
  - Expected: ✗ na `telegram: slika bez opisa pita za vrstu`, jer Task 4 privremeno odgovara „Slike još ne primam“.

- [ ] **Step 3: Implementacija**

**a) Refaktor računa iz prodavnice.**
- **`mergedReceiptState(parts)`:** iz `rebuildReceiptItems`, bez globalnog `receipt`:
  ```js
  function mergedReceiptState(parts){
    const merged = C.mergeReceiptParts(parts.map(p=> p.reading)) || { store: '', date: '', total: null, items: [] };
    const items = receiptItemsWithCategories(merged.items);
    return { items: items.length ? items : [emptyReceiptItem()], store: merged.store || '', date: merged.date || toISODateLocal(new Date()), total: merged.total };
  }
  ```
  `rebuildReceiptItems` je zove i prepisuje polja koja nisu „touched“, tačno kao sada.
- **`saveReceipt` se deli na dva dela:**
  - `async function saveReceiptData(d)`, gde je `d` `{ items, store, date, total, parts?, attachments?, confirmed? }`. Sadrži sve od validacije do `saveEntries(); saveShopping();`, uključujući upozorenje o slikama i poruku za opoziv. Vraća `{ ok: true, ids, count: items.length }`. Validacija i otkazivanje duplikata vraćaju `{ ok: false, error }` / `{ ok: false, cancelled: true }`.
    - Prilozi su `d.attachments` (već sačuvana imena) i bajtovi iz `d.parts`. Deo koji ima `part.savedName` se ne čuva ponovo, nego mu se ime dodaje u priloge.
    - Duplikat se računa iz `d.date`/`d.total` (`C.findReceiptDuplicate`). Potvrda (`appConfirm`) se traži samo kad `!d.confirmed`.
  - `saveReceipt()` čita formu (`receiptStore`, `receiptDate`, `receiptTotal`), poziva `saveReceiptData({ items: receipt.items, store, date, total, parts: receipt.parts })` i na `ok` radi `closeReceipt(true)`. Na grešku piše `res.error` u `receiptStatus` i vraća dugme.
  - Postojeći smoke za račune mora i dalje da prolazi. Proveri to odmah posle refaktora, pre Telegram koda.
- **`closeReceipt(false)`:** delovi sa `savedName` (otvoreni iz Telegrama) idu u smeće, kroz `desktop.bills.deleteFile`.

**b) Kućni račun bez prozora.**
- **`openBillReview(opts)`:**
  - `billReview.savedFile = opts.savedFile || null`;
  - ako je `opts.headless`, ne dodaje se `'show'` na `billOverlay`.
- **`saveBillFromReview`:**
  - vraća `false` na svakom ranom `return` i `true` na kraju;
  - `let file = edit ? edit.file : (billReview.savedFile || undefined);`;
  - čuvanje `prep.bytes` se preskače kad postoji `savedFile`.
- **`closeBillReview(saved, keepFile)`:** kad `!saved && !keepFile && billReview.savedFile`, fajl ide u smeće.

**c) Obrada fajlova.** Zamenjuje privremene `tgFile`, `tgFileCallback` i `tgFileTick` iz Task 4:

```js
  const tgPending = () => tgLoad(TG_PENDING_KEY);
  const tgPendingPut = p => tgSave(TG_PENDING_KEY, tgPending().filter(x=> x.id !== p.id).concat(p));
  const tgPendingDrop = id => tgSave(TG_PENDING_KEY, tgPending().filter(x=> x.id !== id));
  const tgMem = new Map(); // id -> File (dok se ne sacuva na disk ili za isti rad)
  const b64ToBytes = b64 => { const s = atob(b64), a = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const TG_FILE_ERR = { type: ()=> t('Primam samo PDF, JPG, PNG ili WEBP.'), size: ()=> t('Fajl je veći od 10 MB.'), download: ()=> t('Fajl nije preuzet iz Telegrama — pošalji ga ponovo.') };
  const tgBusy = () => ['billOverlay', 'receiptOverlay', 'ipsOverlay'].some(id=> document.getElementById(id).classList.contains('show'));
  const tgButtons = (p, saveRow) => [saveRow, [{ text: '✕ ' + t('Odbaci'), data: 'x:' + p.id }, { text: t('Otvori u aplikaciji'), data: 'o:' + p.id }]].filter(Boolean);
  async function tgPendingFile(p){
    if(tgMem.has(p.id)) return tgMem.get(p.id);
    if(!p.file || !(window.desktop && window.desktop.bills && window.desktop.bills.readFile)) return null;
    const r = await window.desktop.bills.readFile(p.file);
    return r && r.ok ? new File([r.bytes], p.fileName || r.name, { type: p.mime || '' }) : null;
  }
  async function tgFile(p){
    const edit = p.progressMessageId ? { editMessageId: p.progressMessageId } : null;
    if(p.fileError || !p.file) return tgReply('✕ ' + (TG_FILE_ERR[p.fileError] || TG_FILE_ERR.download)(), edit);
    const file = new File([b64ToBytes(p.file.base64)], p.file.name, { type: p.file.mime });
    const pend = { id: newId(), created: Date.now(), fileName: p.file.name, mime: p.file.mime, kind: C.photoKindFromCaption(p.caption), messageId: p.progressMessageId || null };
    const saveFile = fakeSaveFile || (window.desktop && window.desktop.bills && window.desktop.bills.saveFile);
    if(saveFile){
      const ext = (/\.(\w+)$/.exec(p.file.name) || [, 'jpg'])[1].toLowerCase();
      try{ const r = await saveFile(new Uint8Array(await file.arrayBuffer()), `${toISODateLocal(new Date())}-telegram-${pend.id}.${ext}`); if(r && r.ok) pend.file = r.name; } catch(e){ /* ostaje u memoriji */ }
    }
    tgMem.set(pend.id, file);
    tgPendingPut(pend);
    if(!pend.kind) return tgReply(t('Šta je ovo?'), Object.assign({}, edit, { buttons: [
      [{ text: t('Račun iz prodavnice'), data: `k:${pend.id}:receipt` }], [{ text: t('Kućni račun'), data: `k:${pend.id}:bill` }],
      [{ text: t('Uplatnica'), data: `k:${pend.id}:slip` }, { text: '✕ ' + t('Odbaci'), data: 'x:' + pend.id }]] }));
    return tgRead(pend, file);
  }
  // Citanje po vrsti -> stanje na cekanju + sazetak sa dugmadima (ili poruka o gresci / ponovni pokusaj)
  async function tgRead(pend, file){
    const edit = pend.messageId ? { editMessageId: pend.messageId } : {};
    const fail = msg => { tgPendingPut(pend); return tgReply('✕ ' + msg, Object.assign({}, edit, { buttons: tgButtons(pend, null) })); };
    const busyRetry = () => { pend.retryAt = Date.now() + 60000; tgPendingPut(pend); return tgReply(t('AI je zauzet — pokušavam ponovo za minut.'), edit); };
    delete pend.retryAt;
    if(pend.kind === 'receipt'){
      const part = { prep: await prepareBillFile(file, receiptPrepOpts) };
      await readReceiptPart(part, 0);
      if(part.errorKind === 'limit') return busyRetry();
      if(part.error) return fail(part.error);
      pend.state = mergedReceiptState([part]);
      tgPendingPut(pend);
      return tgReply(tgReceiptSummary(pend.state), Object.assign({}, edit, { buttons: tgButtons(pend, [{ text: '✓ ' + t('Sačuvaj'), data: 's:' + pend.id }]) }));
    }
    if(pend.kind === 'bill'){
      ensureBillDefaults();
      const r = await readBill(await prepareBillFile(file));
      if(r && r.kind === 'limit') return busyRetry();
      if(!r || !r.reading || !r.reading.billTypeId) return fail((r && r.message) || t('Vrsta računa nije prepoznata — otvori ga u aplikaciji.'));
      pend.state = { reading: r.reading, source: r.source, message: r.message };
      tgPendingPut(pend);
      return tgReply(tgBillSummary(r.reading), Object.assign({}, edit, { buttons: tgButtons(pend, [{ text: '✓ ' + t('Plaćen'), data: `s:${pend.id}:p` }, { text: '✓ ' + t('Za plaćanje'), data: `s:${pend.id}:n` }]) }));
    }
    const status = { textContent: '' };
    const s = await readSlip(file, status, null);
    if(!s || s.failed) return fail(status.textContent || t('Uplatnica nije pročitana — popuni podatke ručno.'));
    pend.state = { name: s.name || '', account: s.account || '', model: s.model || '', reference: s.reference || '', purpose: s.purpose || '', code: s.code || '', amount: s.amount || 0, currency: s.currency || 'RSD' };
    tgPendingPut(pend);
    return tgReply(tgSlipSummary(pend.state), Object.assign({}, edit, { buttons: tgButtons(pend, pend.state.amount > 0 && pend.state.currency === 'RSD' ? [{ text: '✓ ' + t('Plaćeno'), data: 's:' + pend.id }] : null) }));
  }
  function tgReceiptSummary(st){
    const rows = C.receiptToExpenses(st.items.filter(i=> i.price != null), st.total > 0 ? st.total : null);
    const total = st.total > 0 ? st.total : rows.reduce((s, r)=> s + r.amount, 0);
    const dup = st.date && total > 0 ? C.findReceiptDuplicate(entries, st.date, total) : null;
    return `🧾 ${st.store || t('Prodavnica')} · ${tgDayLabel(st.date)} · ${fmt(total)}\n` + rows.map(r=> `${r.category} ${fmt(r.amount)}`).join(', ')
      + ` · ${t('{0} stavki', st.items.filter(i=> (i.name || '').trim()).length)}` + (dup ? '\n⚠ ' + t('Ovaj račun je možda već unet ({0}).', st.date) : '');
  }
  function tgBillSummary(r){
    const type = billTypeById(r.billTypeId), loc = locationById(r.locationId || (type && type.locationId));
    const dup = type && r.month ? C.findBillDuplicate(bills, type.id, r.month) : null;
    return `🏠 ${type ? type.name : '?'}${locations.length > 1 && loc ? ' · ' + loc.name : ''} · ${r.month ? monthYearLabelSr(r.month) : '?'} · ${r.amount > 0 ? fmtOrig(r.amount, loc ? loc.currency : 'RSD') : '?'}`
      + (r.dueDate ? ' · ' + t('rok {0}', fmtDocDate(r.dueDate)) : '') + (dup ? '\n⚠ ' + t('Za {0} već postoji račun ({1}).', monthYearLabelSr(r.month), fmtOrig(dup.amount, dup.currency)) : '');
  }
  function tgSlipSummary(s){
    return `🧾 ${s.name || C.formatAccount(s.account)} · ${s.amount > 0 ? fmtOrig(s.amount, s.currency) : '?'}` + (s.purpose ? '\n' + s.purpose : '') + (s.account ? '\n' + C.formatAccount(s.account) : '')
      + (s.currency !== 'RSD' ? '\n⚠ ' + t('Uplatnica nije u dinarima — otvori je u aplikaciji.') : '');
  }
  async function tgFileCallback(p, cb){
    const pend = tgPending().find(x=> x.id === cb.id);
    if(!pend) return { callbackText: t('Ovo više nije na čekanju.'), replies: [{ editMessageId: p.messageId, text: t('Ovo više nije na čekanju.') }] };
    pend.messageId = p.messageId;
    if(cb.action === 'x'){
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      if(pend.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file);
      return { callbackText: t('Odbačeno'), replies: [{ editMessageId: p.messageId, text: '✕ ' + t('Odbačeno') }] };
    }
    if(tgBusy()) return { callbackText: t('Na računaru je otvoren prozor za račun — završi ga pa pritisni ponovo.'), replies: [] };
    const file = await tgPendingFile(pend);
    if(cb.action === 'k'){
      if(!['receipt', 'bill', 'slip'].includes(cb.arg)) return { replies: [] };
      if(!file) return tgReply('✕ ' + TG_FILE_ERR.download(), { editMessageId: p.messageId });
      pend.kind = cb.arg; tgPendingPut(pend);
      return tgRead(pend, file);
    }
    if(cb.action === 'o'){
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      if(window.desktop && window.desktop.showWindow) window.desktop.showWindow();
      if(!file) return tgReply('✕ ' + TG_FILE_ERR.download(), { editMessageId: p.messageId });
      if(pend.kind === 'receipt' && pend.state){
        const prep = await prepareBillFile(file, receiptPrepOpts);
        receipt = Object.assign({ parts: [{ prep, savedName: pend.file }], page: 0, edited: true }, pend.state);
        rEl('receiptOverlay').classList.add('show'); renderReceipt();
      } else if(pend.kind === 'bill' && pend.state){
        openBillReview({ prepared: await prepareBillFile(file), reading: pend.state.reading, message: pend.state.message, source: pend.state.source, savedFile: pend.file });
      } else if(pend.kind === 'slip'){
        if(pend.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file); // IPS prozor cuva svoju kopiju
        openIpsOneOff(file);
      } else addReceiptFiles([file]);
      return { callbackText: t('Otvoreno u aplikaciji'), replies: [{ editMessageId: p.messageId, text: '↗ ' + t('Otvoreno u aplikaciji') }] };
    }
    if(cb.action === 's' && pend.state){
      let ids = [], label = '';
      if(pend.kind === 'receipt'){
        const r = await saveReceiptData(Object.assign({}, pend.state, { attachments: pend.file ? [pend.file] : [], confirmed: true }));
        if(!r.ok) return { callbackText: r.error || t('Nije sačuvano.'), replies: [] };
        ids = r.ids; label = `${pend.state.store || t('Prodavnica')} · ${t('{0} stavki', r.count)}`;
      } else if(pend.kind === 'bill'){
        if(billReview) return { callbackText: t('Na računaru je otvoren prozor za račun — završi ga pa pritisni ponovo.'), replies: [] };
        openBillReview({ reading: pend.state.reading, source: pend.state.source, savedFile: pend.file, headless: true });
        const ok = await saveBillFromReview(cb.arg === 'p');
        if(!ok){ const msg = billEl('billStatus').textContent; closeBillReview(false, true); return { callbackText: msg || t('Nije sačuvano.'), replies: [] }; }
      } else {
        const s = pend.state;
        const r = window.__desktopBridge.addEntry({ type: 'expense', desc: s.name || s.purpose || t('Uplatnica'), amount: s.amount, currency: 'RSD', date: toISODateLocal(new Date()), category: '', paid: true });
        if(!r.ok) return { callbackText: r.error, replies: [] };
        const e = entries.find(x=> x.id === r.ids[0]);
        if(e){ if(pend.file) e.attachments = [pend.file]; e.payee = C.cleanPayee({ name: s.name, account: s.account, model: s.model, reference: s.reference, purpose: s.purpose, code: s.code }); saveEntries(); }
        ids = r.ids; label = `${s.name || t('Uplatnica')} · ${r.amountText}`;
      }
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      const logId = ids.length ? tgLog(ids, label) : null;
      return { callbackText: t('Sačuvano'), replies: [{ editMessageId: p.messageId, text: '✓ ' + t('Sačuvano') + (label ? ': ' + label : ''), buttons: logId ? [[{ text: t('Poništi'), data: 'u:' + logId }]] : undefined }] };
    }
    return { replies: [] };
  }
  async function tgFileTick(){
    const { keep, expired } = C.cleanTelegramPending(tgPending(), Date.now());
    tgSave(TG_PENDING_KEY, keep);
    const replies = [];
    expired.forEach(p=>{ tgMem.delete(p.id); if(p.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(p.file); if(p.messageId) replies.push({ editMessageId: p.messageId, text: t('Isteklo — nije sačuvano.') }); });
    for(const p of keep.filter(x=> x.retryAt && x.retryAt <= Date.now())){
      const file = await tgPendingFile(p);
      if(!file) continue;
      const out = await tgRead(p, file);
      replies.push(...out.replies);
    }
    return { replies };
  }
```

**d) Vrsta greške iz čitača.**
- `readReceiptPart`: na neuspeh postavi `part.errorKind = res && res.kind`, a na uspeh `delete part.errorKind`.
- `readBill`: u povratnu vrednost dodaj `kind: res && !res.ok ? res.kind : undefined`. Promenljiva `res` je u bloku, pa je podigni na nivo funkcije.
- **Ne menjaj ponašanje prozora.**

**e)** Ukloni privremene `tgFile`, `tgFileCallback` i `tgFileTick` iz Task 4.

**f) EN** za sve nove tekstove (prvo `--check`). Postojeći ključevi koji se ponovo koriste su 'Odbaci', 'Sačuvaj', 'Plaćen', 'Za plaćanje', 'Kućni račun', 'Uplatnica', 'Prodavnica' i '{0} stavki'. Proveri da li postoje.

- [ ] **Step 4:** Run smoke. Expected: svi ✓, uključujući stare provere za račune, kućne račune i IPS.
- [ ] **Step 5:** Commit: `Telegram: slike i PDF — vrsta, čitanje, potvrda, otvaranje, isticanje, ponovni pokušaj`.

### Task 6: Završno

- [ ] **EN:**
  - pokreni aplikaciju sa `lang: en`;
  - napravi snimak Podešavanja → Telegram bot (`run-page.js`);
  - proveri da u odeljku nema srpskog teksta.
- [ ] **Živi test** (samo ako postoji `KNJIGA_TELEGRAM_TEST_TOKEN`):
  - pomoćna skripta: `createTelegram` sa pravim `fetch`, `getMe`, pa `sendMessage` u povezani test chat;
  - ako chat nije povezan, test se preskače i korisniku se kaže kako da ga poveže;
  - token se nikad ne ispisuje.
- [ ] **Nezavisan pregled cele grane** (najjači model). Zatim popravke, svaka sa testom koji prvo pada.
- [ ] **Release notes** `app/release-notes/1.28.0.md`:
  - na srpskom, sa kratkim uputstvom u tri koraka za BotFather;
  - jedan red na engleskom.
- [ ] **Izdavanje:**
  - verzija 1.28.0, `npm test` + smoke;
  - spajanje u main, `push-source`, `release`;
  - ažuriranje memorije.
