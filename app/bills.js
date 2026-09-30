// Kucni racuni u glavnom procesu: Groq citanje (kljuc je sifrovan i nikad ne ide u stranicu)
// i fajlovi priloga u <podaci>/Prilozi. Sve zavisnosti se ubacuju, pa se testira bez Electron-a.
const fs = require('fs');
const path = require('path');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const MAX_IMAGES = 3;
const MAX_TEXT = 20000;
const TIMEOUT_MS = 60000;
const TRASH = '.obrisano';
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|heic)$/i; // prilog je samo racun (PDF ili slika) — nikad nesto sto se pokrece

const MAX_WAIT_S = 30; // 429 sa kracim cekanjem: saceka se jednom i pokusa ponovo

function createBills({ fetch, safeStorage, getSettings, saveSettings, dataDir, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const s = () => getSettings();
  const encryption = () => { try { return !!safeStorage.isEncryptionAvailable(); } catch { return false; } };
  const getKey = () => {
    const enc = s().groqKeyEnc;
    if (!enc || !encryption()) return '';
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  };
  const keyInfo = () => ({ set: !!getKey(), last4: getKey() ? (s().groqKeyLast4 || '') : '', model: s().groqModel || DEFAULT_MODEL, sendText: s().groqSendText !== false, encryption: encryption() });
  function setKey(key) {
    key = String(key || '').trim();
    if (!key) { delete s().groqKeyEnc; delete s().groqKeyLast4; saveSettings(); return keyInfo(); }
    if (!encryption()) return { ...keyInfo(), error: 'encryption' };
    s().groqKeyEnc = safeStorage.encryptString(key).toString('base64');
    s().groqKeyLast4 = key.slice(-4);
    saveSettings();
    return keyInfo();
  }
  function setOptions(o) {
    if (o && typeof o.model === 'string') { const m = o.model.trim(); if (m && m !== DEFAULT_MODEL) s().groqModel = m.slice(0, 120); else delete s().groqModel; }
    if (o && typeof o.sendText === 'boolean') s().groqSendText = o.sendText;
    saveSettings();
    return keyInfo();
  }
  async function call(messages) {
    const key = getKey();
    if (!key) return { ok: false, kind: 'nokey' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: keyInfo().model, messages, response_format: { type: 'json_object' }, temperature: 0 })
      });
      if (!res.ok) {
        let message = '', code = '';
        try { const j = await res.json(); message = (j.error && j.error.message) || ''; code = (j.error && j.error.code) || ''; } catch { /* nema tela */ }
        const kind = res.status === 401 || res.status === 403 ? 'key' : res.status === 429 ? 'limit'
          : (res.status === 404 || code === 'model_not_found' || code === 'model_decommissioned') ? 'model' : 'http';
        const ra = parseInt(res.headers && res.headers.get && res.headers.get('retry-after'), 10);
        return { ok: false, kind, status: res.status, message: String(message).slice(0, 300), ...(Number.isFinite(ra) ? { retryAfter: ra } : {}) };
      }
      const j = await res.json();
      const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return typeof content === 'string' ? { ok: true, content } : { ok: false, kind: 'http', status: res.status, message: 'prazan odgovor' };
    } catch (err) {
      return { ok: false, kind: err && err.name === 'AbortError' ? 'timeout' : 'network', message: String(err && err.message || err).slice(0, 300) };
    } finally { clearTimeout(timer); }
  }
  const buildMessages = (imgs, t, prompt) => {
    const parts = [{ type: 'text', text: t ? 'Tekst iz PDF-a:\n' + t : 'Pročitaj račun sa slike.' }];
    imgs.forEach(url => parts.push({ type: 'image_url', image_url: { url } }));
    return [{ role: 'system', content: String(prompt || '') }, { role: 'user', content: parts }];
  };
  // Besplatan Groq nivo ima limit ulaznih tokena u minuti (npr. 7000); veci zahtev vraca 413.
  // Zato: na 413 ponovi sa manje slika (tekst iz PDF-a ostaje), a na 429 sa kratkim cekanjem saceka jednom.
  async function read({ images, text, prompt }) {
    const t = keyInfo().sendText && text ? String(text).slice(0, MAX_TEXT) : '';
    const imgs = (Array.isArray(images) ? images : []).filter(u => /^data:image\/(jpeg|png|webp);base64,/.test(u)).slice(0, MAX_IMAGES);
    const ladder = [imgs];
    if (imgs.length > 1) ladder.push(imgs.slice(0, 1));
    if (t && imgs.length) ladder.push([]);
    let res = null, waited = false;
    for (let i = 0; i < ladder.length; i++) {
      res = await call(buildMessages(ladder[i], t, prompt));
      if (res.ok === false && res.kind === 'limit' && !waited && res.retryAfter != null && res.retryAfter <= MAX_WAIT_S) {
        waited = true;
        await sleep((res.retryAfter + 1) * 1000);
        res = await call(buildMessages(ladder[i], t, prompt));
      }
      if (!(res.ok === false && res.status === 413)) return res;
    }
    return { ...res, kind: 'toolarge' };
  }
  const testKey = () => call([{ role: 'user', content: 'Vrati JSON {"ok":true}' }]);

  // ---- Prilozi ----
  const dir = () => path.join(dataDir(), 'Prilozi');
  const trash = () => path.join(dir(), TRASH);
  const safeName = n => String(n || 'racun').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').slice(0, 120) || 'racun';
  // Samo ime fajla direktno u folderu (bez putanje) — stranica ne sme da izadje iz Prilozi
  function inside(base, name) {
    if (!name || typeof name !== 'string' || /[\\/]/.test(name) || name === '.' || name === '..') return null;
    const p = path.join(base, name);
    return path.dirname(p) === base ? p : null;
  }
  const filePath = name => { const p = ALLOWED_EXT.test(String(name || '')) && inside(dir(), name); return p && fs.existsSync(p) ? p : null; };
  function saveFile(bytes, name) {
    try {
      fs.mkdirSync(dir(), { recursive: true });
      const clean = safeName(name), ext = path.extname(clean), stem = clean.slice(0, clean.length - ext.length);
      if (!ALLOWED_EXT.test(clean)) return { ok: false, error: 'nedozvoljen tip fajla' };
      let final = clean;
      for (let i = 2; fs.existsSync(path.join(dir(), final)); i++) final = `${stem}-${i}${ext}`;
      fs.writeFileSync(path.join(dir(), final), Buffer.from(bytes));
      return { ok: true, name: final };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  }
  function move(fromBase, toBase, name) {
    const from = inside(fromBase, name), to = inside(toBase, name);
    if (!from || !to || !fs.existsSync(from)) return { ok: false };
    try {
      fs.mkdirSync(toBase, { recursive: true });
      fs.renameSync(from, to);
      const t = new Date(now()); fs.utimesSync(to, t, t);
      return { ok: true };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  }
  const deleteFile = name => move(dir(), trash(), name);
  const restoreFile = name => move(trash(), dir(), name);
  function purgeTrash(days = 30) {
    let n = 0;
    try {
      fs.readdirSync(trash()).forEach(f => {
        const p = path.join(trash(), f);
        try { if (now() - fs.statSync(p).mtimeMs > days * 864e5) { fs.unlinkSync(p); n++; } } catch { /* ignorisano */ }
      });
    } catch { /* nema smeca */ }
    return n;
  }
  // Dodatna kopija: kopiraj priloge koji nedostaju ili su promenjeni (obrisani iz .obrisano se ne kopiraju)
  function mirrorTo(target) {
    let n = 0;
    if (!fs.existsSync(dir())) return 0;
    fs.mkdirSync(target, { recursive: true });
    fs.readdirSync(dir(), { withFileTypes: true }).filter(d => d.isFile()).forEach(d => {
      const src = path.join(dir(), d.name), dst = path.join(target, d.name);
      const a = fs.statSync(src);
      let same = false;
      try { const b = fs.statSync(dst); same = b.size === a.size && Math.abs(b.mtimeMs - a.mtimeMs) < 2000; } catch { same = false; }
      if (!same) { fs.copyFileSync(src, dst); fs.utimesSync(dst, a.atime, a.mtime); n++; }
    });
    return n;
  }
  return { keyInfo, setKey, setOptions, read, testKey, saveFile, filePath, deleteFile, restoreFile, purgeTrash, mirrorTo };
}

function registerBillsIpc(ipcMain, api, shell) {
  ipcMain.handle('bills:key-info', () => api.keyInfo());
  ipcMain.handle('bills:key-set', (_e, key) => api.setKey(key));
  ipcMain.handle('bills:options', (_e, o) => api.setOptions(o));
  ipcMain.handle('bills:key-test', () => api.testKey());
  ipcMain.handle('bills:read', (_e, req) => api.read(req || {}));
  ipcMain.handle('bills:save-file', (_e, bytes, name) => api.saveFile(bytes, name));
  ipcMain.handle('bills:open-file', (_e, name) => { const p = api.filePath(name); if (!p) return { ok: false }; if (!process.env.KNJIGA_TEST) shell.openPath(p); return { ok: true }; });
  ipcMain.handle('bills:delete-file', (_e, name) => api.deleteFile(name));
  ipcMain.handle('bills:restore-file', (_e, name) => api.restoreFile(name));
}

module.exports = { createBills, registerBillsIpc, DEFAULT_MODEL, GROQ_URL };
