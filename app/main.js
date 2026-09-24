const {
  app, BrowserWindow, protocol, net, session, shell, nativeTheme, ipcMain, dialog,
  Menu, Tray, nativeImage, globalShortcut, screen, Notification, powerMonitor
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
// Azuriranja postoje samo u instaliranoj verziji (portable i razvojno pokretanje ih nemaju).
const autoUpdater = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE ? require('electron-updater').autoUpdater : null;

// Stabilan "origin" (app://budzet) da localStorage / IndexedDB ostanu isti bez obzira gde je
// aplikacija instalirana ili odakle se portable .exe pokrece.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Jezik aplikacije (srpski ili engleski) — cita se iz podesavanja pre pokretanja Chromium-a, jer od njega
// zavise format datuma u poljima, meni za desni klik i provera pravopisa.
function readLangEarly() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).lang === 'en' ? 'en' : 'sr'; }
  catch { return 'sr'; }
}
let LANG = readLangEarly();
app.commandLine.appendSwitch('lang', LANG === 'en' ? 'en-GB' : 'sr-Latn-RS');
app.commandLine.appendSwitch('accept-lang', LANG === 'en' ? 'en-GB,en' : 'sr-Latn-RS,sr');
const EN = {
  'Ažuriranja': 'Updates', 'Ažuriranja rade samo u instaliranoj verziji aplikacije.': 'Updates only work in the installed version of the app.',
  'Imaš najnoviju verziju ({0}).': 'You have the latest version ({0}).', 'Provera ažuriranja nije uspela.': 'The update check failed.',
  'Sačuvaj izveštaj kao PDF': 'Save report as PDF', '{0} kasnih plaćanja': '{0} late payments', 'Knjiga budžeta': 'Budget Book',
  'Knjiga budžeta — {0} kasno plaćanje': 'Budget Book — {0} late payment', 'Knjiga budžeta — {0} kasnih plaćanja': 'Budget Book — {0} late payments',
  'Novi unos': 'New entry', 'Datoteka': 'File', 'Novi rashod…': 'New expense…', 'Novi prihod…': 'New income…', 'Brzi unos (iz bilo kog programa)': 'Quick entry (from any program)',
  'Odštampaj izveštaj…': 'Print report…', 'Sačuvaj izveštaj kao PDF…': 'Save report as PDF…', 'Napravi rezervnu kopiju sada': 'Back up now',
  'Otvori folder sa rezervnim kopijama': 'Open backups folder', 'Prikaži fajl sa podacima': 'Show data file', 'Zatvori prozor': 'Close window', 'Izađi': 'Quit',
  'Prikaz': 'View', 'Pretraži stavke': 'Search items', 'Promeni temu (svetla/tamna)': 'Toggle theme (light/dark)', 'Skupi / proširi bočni meni': 'Collapse / expand sidebar',
  'Uvećaj': 'Zoom in', 'Umanji': 'Zoom out', 'Stvarna veličina': 'Actual size', 'Ceo ekran': 'Full screen', 'Alatke za programere': 'Developer tools',
  'Pomoć': 'Help', 'Prečice na tastaturi': 'Keyboard shortcuts', 'Proveri ažuriranja…': 'Check for updates…', 'O aplikaciji': 'About',
  'Verzija {0}\nElectron {1}\n\nPodaci: {2}\nRezervne kopije: {3}': 'Version {0}\nElectron {1}\n\nData: {2}\nBackups: {3}',
  'Otvori Knjigu budžeta': 'Open Budget Book', 'Brzi unos rashoda': 'Quick expense', 'Brzi unos prihoda': 'Quick income', 'Pokreni sa Windows-om': 'Start with Windows',
  'Knjiga budžeta radi u pozadini': 'Budget Book is running in the background',
  'Podsetnici za plaćanja i dalje stižu. Aplikacija je u system tray-u (pored sata).': 'Payment reminders still arrive. The app is in the system tray (next to the clock).',
  'Novi rashod': 'New expense', 'Novi prihod': 'New income',
  'Pregled': 'Overview', 'Transakcije': 'Transactions', 'Budžet': 'Budget', 'Ponavljajuće': 'Recurring', 'Ciljevi i dugovi': 'Goals & debts', 'Izveštaji': 'Reports', 'Podešavanja': 'Settings',
};
const T = (sr, ...args) => (LANG === 'en' && EN[sr] !== undefined ? EN[sr] : sr).replace(/\{(\d+)\}/g, (m, i) => args[i] !== undefined ? args[i] : m);

const APP_ORIGIN = 'app://budzet/';
const APP_URL = APP_ORIGIN + 'budzet-tracker.html';
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
const TITLEBAR_HEIGHT = 40;
// Mica pozadina postoji od Windows 11 22H2 (build 22621).
const SUPPORTS_MICA = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;
// Portable .exe se pri svakom pokretanju raspakuje u privremeni folder — za autostart i
// jump listu mora se koristiti putanja do samog portable fajla, ne do raspakovane kopije.
const EXE_PATH = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

const THEME_COLORS = {
  light: { bg: '#F5F6F8', symbol: '#344054' },
  dark:  { bg: '#0F1115', symbol: '#E4E7EC' }
};

let mainWindow = null;
let quickAddWindow = null;
let tray = null;
let isQuitting = false;
let appTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';

// ---------- Podesavanja (userData/settings.json) ----------
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  closeToTray: true, trayHintShown: false, quickAddShortcut: 'CommandOrControl+Alt+Shift+B', windowState: null,
  lastVersion: null, restartHidden: false, releaseNotes: null, lang: 'sr'
};
let settings = { ...DEFAULT_SETTINGS };
function loadSettings() {
  try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) }; } catch { /* prvi start */ }
}
let settingsTimer = null;
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(saveSettingsNow, 400);
}
function saveSettingsNow() {
  clearTimeout(settingsTimer);
  try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2)); } catch { /* ignorisano */ }
}

// ---------- Podaci: jedan JSON fajl (Documents\Knjiga budzeta\podaci.json) ----------
// Stranica i dalje koristi localStorage API, ali u desktop app-u ga zamenjuje sloj koji sve
// cuva ovde (vidi <head> u budzet-tracker.html). Svi upisi su sinhroni i atomicni (temp + rename),
// pa se redosled upisa nikad ne mesa i fajl nikad ne ostane polu-upisan.
const DATA_APP_ID = 'Knjiga budzeta';
const dataDir = () => process.env.KNJIGA_DATA_DIR || path.join(app.getPath('documents'), 'Knjiga budzeta');
const dataFile = () => path.join(dataDir(), 'podaci.json');
const backupDir = () => process.env.KNJIGA_BACKUP_DIR || path.join(dataDir(), 'Rezervne kopije');
const BACKUP_KEEP_DAYS = 30;
let lastSavedAt = null;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function readDataFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || raw.app !== DATA_APP_ID || !raw.data || typeof raw.data !== 'object') throw new Error('Nepoznat format fajla.');
  return raw;
}
// OneDrive (Documents je cesto u OneDrive-u) i antivirus kratko zakljucavaju fajl dok ga sinhronizuju —
// tada rename/write baca EPERM/EBUSY/EACCES. Pokusaj ponovo nekoliko puta pre nego sto prijavis gresku.
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function withRetry(fn) {
  const delays = [50, 150, 400, 1000];
  for (let i = 0; ; i++) {
    try { return fn(); } catch (err) {
      if (i >= delays.length || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      sleepSync(delays[i]);
    }
  }
}
function writeDataFile(data) {
  ensureDailyBackup();
  fs.mkdirSync(dataDir(), { recursive: true });
  const savedAt = new Date().toISOString();
  const tmp = dataFile() + '.tmp';
  withRetry(() => fs.writeFileSync(tmp, JSON.stringify({ app: DATA_APP_ID, format: 1, savedAt, data }, null, 2)));
  withRetry(() => fs.renameSync(tmp, dataFile()));
  lastSavedAt = savedAt;
  return savedAt;
}

// ---------- Rezervne kopije ----------
// Podaci-YYYY-MM-DD.json   dnevna (stanje pre prvog upisa tog dana), cuva se 30 poslednjih
// Mesecna-YYYY-MM.json     prva kopija u mesecu, cuva se 12 poslednjih
// Rucna-kopija-*.json      rucno napravljena (dugme ili meni), ne brise se automatski
// Pre-vracanja-*.json      stanje neposredno pre vracanja neke kopije, cuva se 10 poslednjih
const BACKUP_KEEP_MONTHS = 12;
const BACKUP_KINDS = [
  { kind: 'daily', re: /^Podaci-\d{4}-\d{2}-\d{2}\.json$/, keep: BACKUP_KEEP_DAYS },
  { kind: 'monthly', re: /^Mesecna-\d{4}-\d{2}\.json$/, keep: BACKUP_KEEP_MONTHS },
  { kind: 'manual', re: /^Rucna-kopija-.*\.json$/, keep: Infinity },
  { kind: 'before', re: /^Pre-vracanja-.*\.json$/, keep: 10 }
];
const backupKind = (name) => (BACKUP_KINDS.find(k => k.re.test(name)) || { kind: 'other' }).kind;
function pruneBackups() {
  try {
    const files = fs.readdirSync(backupDir());
    BACKUP_KINDS.forEach(({ re, keep }) => {
      if (keep === Infinity) return;
      const list = files.filter(f => re.test(f)).sort();
      list.slice(0, Math.max(0, list.length - keep)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
    });
  } catch { /* ignorisano */ }
}
// Kopija fajla sa podacima onakvog kakav je bio PRE prvog upisa tog dana (i meseca).
function ensureDailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    const daily = path.join(backupDir(), `Podaci-${todayStr()}.json`);
    const monthly = path.join(backupDir(), `Mesecna-${todayStr().slice(0, 7)}.json`);
    if (fs.existsSync(daily) && fs.existsSync(monthly)) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    if (!fs.existsSync(daily)) withRetry(() => fs.copyFileSync(dataFile(), daily));
    if (!fs.existsSync(monthly)) withRetry(() => fs.copyFileSync(dataFile(), monthly));
    pruneBackups();
  } catch { /* kopija ne sme da obori cuvanje */ }
}
// Spisak kopija za prikaz u Podesavanjima. Broj stavki se kesira po mtime-u (fajlovi se ne menjaju).
const backupMetaCache = new Map();
function listBackups() {
  let files = [];
  try { files = fs.readdirSync(backupDir()).filter(f => /\.json$/.test(f)); } catch { return []; }
  return files.map(name => {
    const full = path.join(backupDir(), name);
    let stat; try { stat = fs.statSync(full); } catch { return null; }
    const key = name + '|' + stat.mtimeMs;
    if (!backupMetaCache.has(key)) {
      let meta = { savedAt: null, entries: null, valid: false };
      try {
        const raw = readDataFile(full);
        const e = raw.data['budzet-stavke-v2'];
        const arr = typeof e === 'string' ? JSON.parse(e) : e;
        meta = { savedAt: raw.savedAt || null, entries: Array.isArray(arr) ? arr.length : null, valid: true };
      } catch { /* stari format ili ostecen */ }
      backupMetaCache.set(key, meta);
    }
    return { name, kind: backupKind(name), mtime: stat.mtimeMs, ...backupMetaCache.get(key) };
  }).filter(b => b && b.valid).sort((a, b) => b.mtime - a.mtime);
}
function newestValidBackup() {
  try {
    const files = fs.readdirSync(backupDir()).filter(f => /\.json$/.test(f))
      .map(f => ({ name: f, t: fs.statSync(path.join(backupDir(), f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const f of files) {
      try { return { name: f.name, raw: readDataFile(path.join(backupDir(), f.name)) }; } catch { /* stari format ili ostecen — sledeci */ }
    }
  } catch { /* nema foldera */ }
  return null;
}
function lastBackupInfo() {
  try {
    const files = fs.readdirSync(backupDir()).filter(f => /\.json$/.test(f))
      .map(f => fs.statSync(path.join(backupDir(), f)).mtimeMs).sort((a, b) => b - a);
    return { dir: backupDir(), count: files.length, last: files[0] || null };
  } catch { return { dir: backupDir(), count: 0, last: null }; }
}

ipcMain.on('data:load', (e) => {
  const file = dataFile();
  if (!fs.existsSync(file)) { e.returnValue = { ok: true, data: null, path: file }; return; }
  try {
    const raw = readDataFile(file);
    lastSavedAt = raw.savedAt;
    e.returnValue = { ok: true, data: raw.data, path: file, savedAt: raw.savedAt };
  } catch {
    // Ostecen fajl: skloni ga u stranu (ne brisi) i ucitaj najnoviju ispravnu rezervnu kopiju.
    const aside = file.replace(/\.json$/, `.ostecen-${Date.now()}.json`);
    try { fs.renameSync(file, aside); } catch { /* ignorisano */ }
    const b = newestValidBackup();
    e.returnValue = b
      ? { ok: true, data: b.raw.data, path: file, warning: `Fajl sa podacima je bio oštećen (sačuvan je kao "${path.basename(aside)}"). Učitana je rezervna kopija "${b.name}".` }
      : { ok: false, data: null, path: file, warning: `Fajl sa podacima je bio oštećen (sačuvan je kao "${path.basename(aside)}"), a ispravna rezervna kopija nije pronađena. Učitani su podaci iz internog skladišta aplikacije.` };
  }
});
ipcMain.handle('data:save', (_e, data) => writeDataFile(data));
ipcMain.on('data:save-sync', (e, data) => {
  try { e.returnValue = { ok: true, savedAt: writeDataFile(data) }; } catch (err) { e.returnValue = { ok: false, error: err.message }; }
});
ipcMain.handle('data:info', () => ({ path: dataFile(), savedAt: lastSavedAt }));
ipcMain.handle('data:open', () => { if (fs.existsSync(dataFile())) shell.showItemInFolder(dataFile()); else shell.openPath(dataDir()); });

ipcMain.handle('backup:now', (_e, kind) => {
  if (!fs.existsSync(dataFile())) throw new Error('Još nema sačuvanih podataka.');
  fs.mkdirSync(backupDir(), { recursive: true });
  const t = new Date();
  const stamp = `${todayStr()}_${String(t.getHours()).padStart(2, '0')}-${String(t.getMinutes()).padStart(2, '0')}-${String(t.getSeconds()).padStart(2, '0')}`;
  const target = path.join(backupDir(), `${kind === 'before' ? 'Pre-vracanja' : 'Rucna-kopija'}-${stamp}.json`);
  withRetry(() => fs.copyFileSync(dataFile(), target));
  pruneBackups();
  return target;
});
ipcMain.handle('backup:info', () => lastBackupInfo());
ipcMain.handle('backup:list', () => listBackups().map(({ name, kind, mtime, savedAt, entries }) => ({ name, kind, mtime, savedAt, entries })));
ipcMain.handle('backup:read', (_e, name) => {
  // Samo ime fajla iz foldera sa kopijama — bez putanja
  if (typeof name !== 'string' || path.basename(name) !== name || !/\.json$/.test(name)) throw new Error('Neispravno ime kopije.');
  const raw = readDataFile(path.join(backupDir(), name));
  return { savedAt: raw.savedAt || null, data: raw.data };
});
ipcMain.handle('backup:open', () => { fs.mkdirSync(backupDir(), { recursive: true }); shell.openPath(backupDir()); });

// ---------- Automatska azuriranja (GitHub Releases) ----------
// Nova verzija se preuzima u pozadini i instalira SAMA:
//  - ako je prozor sakriven (tray) ili minimizovan: odmah, tiho, i aplikacija se vraca u tray;
//  - ako je prozor otvoren: posle odbrojavanja od 60 s (u naslovnoj traci "Sada" / "Kasnije");
//  - "Kasnije": cim se prozor sledeci put sakrije/minimizuje, ili pri izlasku iz aplikacije.
// Pre instalacije se podaci uvek upisuju u fajl (flushRenderer).
const UPDATE_COUNTDOWN_MS = 60 * 1000;
// Aplikacija obicno danima zivi u tray-u, pa provera samo pri pokretanju nije dovoljna.
const UPDATE_CHECK_EVERY_MS = 15 * 60 * 1000;
const UPDATE_STALE_MS = 10 * 60 * 1000;
let updateState = { status: 'idle', version: null, percent: 0, error: null, current: app.getVersion(), installAt: null, postponed: false };
let manualUpdateCheck = false;
let updateTimer = null;
let lastUpdateCheck = 0;
function setUpdate(patch) {
  updateState = { ...updateState, ...patch };
  sendToMain('desktop:update', updateState);
}
const windowIsAway = () => !mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized();
function scheduleAutoInstall() {
  clearTimeout(updateTimer);
  if (updateState.status !== 'ready') return;
  if (windowIsAway()) { installUpdateNow({ hidden: !mainWindow || !mainWindow.isVisible() }); return; }
  if (updateState.postponed) return;
  setUpdate({ installAt: Date.now() + UPDATE_COUNTDOWN_MS });
  updateTimer = setTimeout(() => installUpdateNow({ hidden: windowIsAway() }), UPDATE_COUNTDOWN_MS);
}
function postponeUpdate() {
  clearTimeout(updateTimer);
  setUpdate({ installAt: null, postponed: true });
}
function checkForUpdates(manual) {
  if (!autoUpdater) {
    if (manual) dialog.showMessageBox(mainWindow, { type: 'info', title: T('Ažuriranja'), message: T('Ažuriranja rade samo u instaliranoj verziji aplikacije.') });
    return;
  }
  if (updateState.status === 'ready' || updateState.status === 'downloading') {
    if (manual) command('navigate', 'podesavanja-azuriranja');
    return;
  }
  manualUpdateCheck = !!manual;
  lastUpdateCheck = Date.now();
  autoUpdater.checkForUpdates().catch(() => { /* greska stize i kroz 'error' dogadjaj */ });
}
function releaseNotesText(info) {
  const n = info && info.releaseNotes;
  const text = Array.isArray(n) ? n.map(x => x.note || '').join('\n') : (n || '');
  // GitHub vraca HTML — dovoljan je obican tekst
  return String(text).replace(/<li>/gi, '• ').replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
function setupUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Posle sna/zakljucanog ekrana racunar je mozda satima bio offline — proveri odmah.
  const checkIfStale = () => { if (Date.now() - lastUpdateCheck > UPDATE_STALE_MS) checkForUpdates(false); };
  powerMonitor.on('resume', () => setTimeout(checkIfStale, 20000));
  powerMonitor.on('unlock-screen', () => setTimeout(checkIfStale, 5000));
  // Kad korisnik otvori prozor (iz tray-a ili prebacivanjem), proveri ako je prosla provera stara.
  app.on('browser-window-focus', (_e, win) => { if (win === mainWindow) checkIfStale(); });
  autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => {
    setUpdate({ status: 'current' });
    if (manualUpdateCheck) dialog.showMessageBox(mainWindow, { type: 'info', title: T('Ažuriranja'), message: T('Imaš najnoviju verziju ({0}).', app.getVersion()) });
    manualUpdateCheck = false;
  });
  autoUpdater.on('update-available', (i) => { setUpdate({ status: 'downloading', version: i.version, percent: 0 }); manualUpdateCheck = false; });
  autoUpdater.on('download-progress', (p) => setUpdate({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    settings.releaseNotes = { version: i.version, text: releaseNotesText(i) };
    saveSettingsNow();
    setUpdate({ status: 'ready', version: i.version, postponed: false });
    scheduleAutoInstall();
  });
  autoUpdater.on('error', (err) => {
    setUpdate({ status: 'error', error: String(err && err.message || err).split('\n')[0] });
    if (manualUpdateCheck) dialog.showMessageBox(mainWindow, { type: 'warning', title: T('Ažuriranja'), message: T('Provera ažuriranja nije uspela.'), detail: updateState.error });
    manualUpdateCheck = false;
  });
  setTimeout(() => checkForUpdates(false), 10000);
  setInterval(() => checkForUpdates(false), UPDATE_CHECK_EVERY_MS);
}
let installing = false;
async function installUpdateNow(opts) {
  if (updateState.status !== 'ready' || installing) return;
  installing = true;
  clearTimeout(updateTimer);
  setUpdate({ status: 'installing', installAt: null });
  await flushRenderer();
  isQuitting = true;
  // Ako je aplikacija bila u tray-u, posle instalacije se vraca u tray (ne iskace prozor).
  settings.restartHidden = !!(opts && opts.hidden);
  saveSettingsNow();
  autoUpdater.quitAndInstall(true, true);
}
ipcMain.handle('update:get', () => updateState);
ipcMain.on('update:check', () => checkForUpdates(true));
ipcMain.on('update:install', () => installUpdateNow({ hidden: false }));
ipcMain.on('update:postpone', () => postponeUpdate());
ipcMain.handle('update:notes', () => settings.releaseNotes);

// ---------- Kursna lista (NBS srednji kurs, preko kurs.resenje.org) ----------
// Salje se samo zahtev za kursnu listu — nikakvi podaci iz aplikacije. Poslednji uspesno preuzet
// kurs se cuva, pa konverzija radi i bez interneta.
const RATE_CODES = ['EUR', 'USD', 'CHF', 'GBP'];
const RATES_FILE = () => path.join(app.getPath('userData'), 'kursna-lista.json');
let ratesCache = null;
async function getRates(force) {
  if (!ratesCache) { try { ratesCache = JSON.parse(fs.readFileSync(RATES_FILE(), 'utf8')); } catch { ratesCache = null; } }
  const fresh = ratesCache && ratesCache.date === todayStr() && Date.now() - ratesCache.fetchedAt < 6 * 3600 * 1000;
  if (fresh && !force) return { ...ratesCache, stale: false };
  try {
    const res = await net.fetch('https://kurs.resenje.org/api/v1/rates/today', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const rates = {};
    (json.rates || []).forEach(r => { if (RATE_CODES.includes(r.code) && r.exchange_middle) rates[r.code] = r.exchange_middle / (r.parity || 1); });
    if (!rates.EUR) throw new Error('Kursna lista nema EUR.');
    const date = (json.rates.find(r => r.code === 'EUR') || {}).date || todayStr();
    ratesCache = { date, rates, fetchedAt: Date.now(), source: 'NBS srednji kurs' };
    try { fs.writeFileSync(RATES_FILE(), JSON.stringify(ratesCache)); } catch { /* ignorisano */ }
    return { ...ratesCache, stale: false };
  } catch (err) {
    if (ratesCache) return { ...ratesCache, stale: true, error: err.message };
    return { date: null, rates: {}, stale: true, error: err.message };
  }
}
ipcMain.handle('rates:get', (_e, force) => getRates(!!force));

// ---------- PDF ----------
ipcMain.handle('pdf:choose', async (_e, suggestedName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: T('Sačuvaj izveštaj kao PDF'),
    defaultPath: path.join(app.getPath('documents'), suggestedName || 'Izvestaj.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('pdf:write', async (_e, filePath) => {
  const pdf = await mainWindow.webContents.printToPDF({
    printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  });
  await fs.promises.writeFile(filePath, pdf);
  if (!process.env.KNJIGA_TEST) shell.openPath(filePath);
  return filePath;
});

// ---------- Prozor, tema, bedz ----------
let updatedFrom = null; // verzija pre upravo instaliranog azuriranja (za poruku "Azurirano na …")
ipcMain.on('desktop:info', (e) => {
  e.returnValue = { mica: SUPPORTS_MICA, version: app.getVersion(), titlebarHeight: TITLEBAR_HEIGHT, updatedFrom, lang: LANG };
});
ipcMain.on('desktop:theme', (_e, theme, explicit) => {
  appTheme = theme === 'dark' ? 'dark' : 'light';
  // Mica i sistemski dijalozi prate temu aplikacije; ako tema nije rucno izabrana, prati se Windows.
  nativeTheme.themeSource = explicit ? appTheme : 'system';
  applyTitlebarColors();
});
ipcMain.on('desktop:badge', (_e, count, dataUrl) => {
  if (!mainWindow) return;
  if (count > 0 && dataUrl) {
    mainWindow.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), T('{0} kasnih plaćanja', count));
  } else {
    mainWindow.setOverlayIcon(null, '');
  }
  if (tray) tray.setToolTip(count > 0 ? T(count === 1 ? 'Knjiga budžeta — {0} kasno plaćanje' : 'Knjiga budžeta — {0} kasnih plaćanja', count) : T('Knjiga budžeta'));
});
ipcMain.on('desktop:show', () => showMain());
ipcMain.on('desktop:menu', (_e, x, y) => {
  if (!mainWindow) return;
  buildAppMenu().popup({ window: mainWindow, x: Math.round(x), y: Math.round(y) });
});
ipcMain.handle('settings:get', () => ({
  startWithWindows: getAutostart(),
  closeToTray: settings.closeToTray,
  quickAddShortcut: settings.quickAddShortcut,
  quickAddShortcutOk: shortcutRegistered,
  backupDir: backupDir()
}));
ipcMain.handle('settings:set', (_e, key, value) => {
  if (key === 'startWithWindows') setAutostart(!!value);
  if (key === 'closeToTray') { settings.closeToTray = !!value; saveSettings(); }
  if (key === 'quickAddShortcut') { settings.quickAddShortcut = String(value || ''); saveSettings(); registerQuickAddShortcut(); }
  if (key === 'lang') {
    settings.lang = value === 'en' ? 'en' : 'sr';
    saveSettingsNow();
    // Jezik menja i Chromium (datumi u poljima), pa se aplikacija ponovo pokrece
    if (settings.lang !== LANG) { app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--hidden') }); quitApp(); }
  }
  rebuildTrayMenu();
  return { ok: true, quickAddShortcutOk: shortcutRegistered };
});

function applyTitlebarColors() {
  if (!mainWindow) return;
  const c = THEME_COLORS[appTheme];
  try {
    mainWindow.setTitleBarOverlay({ color: SUPPORTS_MICA ? '#00000000' : c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT });
  } catch { /* ignorisano */ }
  if (!SUPPORTS_MICA) mainWindow.setBackgroundColor(c.bg);
}

function sendToMain(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}
function command(name, arg) {
  showMain();
  sendToMain('desktop:command', name, arg);
}

// ---------- Brzi unos (mali prozor) ----------
async function runInMain(expr) {
  if (!mainWindow) throw new Error('Glavni prozor nije spreman.');
  return mainWindow.webContents.executeJavaScript(expr, true);
}
ipcMain.handle('quick:data', () => runInMain('window.__desktopBridge && window.__desktopBridge.getQuickAddData()'));
ipcMain.handle('quick:add', (_e, entry) => runInMain(`window.__desktopBridge.addEntry(${JSON.stringify(entry)})`));
// Prozor za unos se ne unistava pri zatvaranju nego sakriva — ponovno otvaranje je trenutno.
let quickOpenedFromApp = false;
function hideQuickAdd() {
  if (!quickAddWindow || !quickAddWindow.isVisible()) return;
  quickAddWindow.hide();
  // Posle unosa iz aplikacije fokus se vraca glavnom prozoru
  if (quickOpenedFromApp && mainWindow && mainWindow.isVisible()) mainWindow.focus();
}
ipcMain.on('quick:close', () => hideQuickAdd());
ipcMain.on('quick:open-request', (_e, type) => openQuickAdd(type, { fromApp: true }));
ipcMain.on('quick:resize', (_e, h) => {
  if (!quickAddWindow) return;
  const [w] = quickAddWindow.getContentSize();
  const area = screen.getDisplayMatching(quickAddWindow.getBounds()).workArea;
  const height = Math.min(Math.ceil(h), area.height - 40);
  quickAddWindow.setContentSize(w, height);
  // Ne dozvoli da se prozor produzi ispod ivice ekrana
  const b = quickAddWindow.getBounds();
  if (b.y + b.height > area.y + area.height) quickAddWindow.setPosition(b.x, Math.max(area.y + 10, area.y + area.height - b.height - 10));
});

// Polozaj: iz aplikacije — centrirano iznad glavnog prozora; iz globalne precice/tray-a — na ekranu sa kursorom.
function placeQuickAdd(fromApp) {
  const [w, h] = quickAddWindow.getSize();
  let x, y;
  if (fromApp && mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
    const m = mainWindow.getBounds();
    x = m.x + (m.width - w) / 2; y = m.y + Math.max(60, (m.height - h) / 3);
  } else {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    x = area.x + (area.width - w) / 2; y = area.y + (area.height - h) / 3;
  }
  quickAddWindow.setPosition(Math.round(x), Math.round(y));
}
function openQuickAdd(type, opts) {
  type = type === 'income' ? 'income' : 'expense';
  quickOpenedFromApp = !!(opts && opts.fromApp);
  if (quickAddWindow) {
    quickAddWindow.webContents.send('quick:open', { type, theme: appTheme });
    placeQuickAdd(quickOpenedFromApp);
    quickAddWindow.show(); quickAddWindow.focus();
    return;
  }
  const W = 440, H = 520;
  quickAddWindow = new BrowserWindow({
    width: W, height: H, useContentSize: true,
    frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: SUPPORTS_MICA ? '#00000000' : THEME_COLORS[appTheme].bg,
    backgroundMaterial: SUPPORTS_MICA ? 'acrylic' : undefined,
    roundedCorners: true,
    icon: ICON_PATH, title: T('Novi unos'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  placeQuickAdd(quickOpenedFromApp);
  quickAddWindow.loadURL(`${APP_ORIGIN}quick-add.html?type=${type}&theme=${appTheme}&mica=${SUPPORTS_MICA ? 1 : 0}`);
  quickAddWindow.once('ready-to-show', () => { quickAddWindow.show(); quickAddWindow.focus(); });
  quickAddWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); hideQuickAdd(); } });
  quickAddWindow.on('closed', () => { quickAddWindow = null; });
}

let shortcutRegistered = false;
function registerQuickAddShortcut() {
  globalShortcut.unregisterAll();
  shortcutRegistered = false;
  if (!settings.quickAddShortcut) return;
  try { shortcutRegistered = globalShortcut.register(settings.quickAddShortcut, () => openQuickAdd('expense')); } catch { shortcutRegistered = false; }
}

// ---------- Autostart ----------
function getAutostart() {
  return app.getLoginItemSettings({ path: EXE_PATH, args: ['--hidden'] }).openAtLogin;
}
function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: EXE_PATH, args: ['--hidden'] });
}

// ---------- Meni i precice ----------
const SCREENS = [
  ['pregled', 'Pregled'], ['rashodi', 'Transakcije'], ['kategorije', 'Budžet'], ['ponavljajuce', 'Ponavljajuće'],
  ['ciljevi', 'Ciljevi i dugovi'], ['izvestaj', 'Izveštaji'], ['podesavanja', 'Podešavanja']
];
function menuTemplate() {
  return [
    { label: T('Datoteka'), submenu: [
      { label: T('Novi rashod…'), accelerator: 'CmdOrCtrl+N', click: () => openQuickAdd('expense', { fromApp: true }) },
      { label: T('Novi prihod…'), accelerator: 'CmdOrCtrl+Shift+N', click: () => openQuickAdd('income', { fromApp: true }) },
      { label: T('Brzi unos (iz bilo kog programa)'), accelerator: settings.quickAddShortcut || undefined, registerAccelerator: false, click: () => openQuickAdd('expense') },
      { type: 'separator' },
      { label: T('Odštampaj izveštaj…'), accelerator: 'CmdOrCtrl+P', click: () => command('print-report') },
      { label: T('Sačuvaj izveštaj kao PDF…'), accelerator: 'CmdOrCtrl+Shift+S', click: () => command('save-pdf') },
      { type: 'separator' },
      { label: T('Napravi rezervnu kopiju sada'), click: () => command('backup-now') },
      { label: T('Otvori folder sa rezervnim kopijama'), click: () => { fs.mkdirSync(backupDir(), { recursive: true }); shell.openPath(backupDir()); } },
      { label: T('Prikaži fajl sa podacima'), click: () => { if (fs.existsSync(dataFile())) shell.showItemInFolder(dataFile()); } },
      { type: 'separator' },
      { label: T('Zatvori prozor'), accelerator: 'CmdOrCtrl+W', click: () => mainWindow && mainWindow.close() },
      { label: T('Izađi'), accelerator: 'CmdOrCtrl+Q', click: () => quitApp() }
    ]},
    { label: T('Prikaz'), submenu: [
      ...SCREENS.map(([id, label], i) => ({
        label: T(label), accelerator: id === 'podesavanja' ? 'CmdOrCtrl+,' : `CmdOrCtrl+${i + 1}`,
        click: () => command('navigate', id)
      })),
      { label: T('Pretraži stavke'), accelerator: 'CmdOrCtrl+F', click: () => command('search') },
      { type: 'separator' },
      { label: T('Promeni temu (svetla/tamna)'), accelerator: 'CmdOrCtrl+Shift+L', click: () => command('toggle-theme') },
      { label: T('Skupi / proširi bočni meni'), accelerator: 'CmdOrCtrl+Alt+S', click: () => command('toggle-sidebar') },
      { type: 'separator' },
      { label: T('Uvećaj'), accelerator: 'CmdOrCtrl+=', click: () => zoom(+0.5) },
      { label: T('Umanji'), accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
      { label: T('Stvarna veličina'), accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
      { label: T('Ceo ekran'), accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      { type: 'separator' },
      { label: T('Alatke za programere'), accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow && mainWindow.webContents.toggleDevTools() }
    ]},
    { label: T('Pomoć'), submenu: [
      { label: T('Prečice na tastaturi'), click: () => command('navigate', 'podesavanja-desktop') },
      { label: T('Proveri ažuriranja…'), click: () => checkForUpdates(true) },
      { label: T('O aplikaciji'), click: showAbout }
    ]}
  ];
}
function buildAppMenu() { return Menu.buildFromTemplate(menuTemplate()); }
function zoom(step) {
  if (!mainWindow) return;
  const wc = mainWindow.webContents;
  wc.setZoomLevel(step === 0 ? 0 : Math.max(-3, Math.min(4, wc.getZoomLevel() + step)));
}
// Precice iz menija se obradjuju ovde (a ne preko sakrivene trake menija) da bi radile
// pouzdano i uz prilagodjenu naslovnu traku.
function acceleratorMatches(acc, input) {
  const parts = acc.split('+');
  const key = parts.pop().toLowerCase();
  const want = { ctrl: false, shift: false, alt: false };
  parts.forEach(p => {
    const k = p.toLowerCase();
    if (k === 'cmdorctrl' || k === 'commandorcontrol' || k === 'ctrl') want.ctrl = true;
    if (k === 'shift') want.shift = true;
    if (k === 'alt') want.alt = true;
  });
  if (!!input.control !== want.ctrl || !!input.shift !== want.shift || !!input.alt !== want.alt) return false;
  const inKey = input.key.toLowerCase();
  if (key === '=' ) return inKey === '=' || inKey === '+';
  if (/^\d$/.test(key)) return input.code === 'Digit' + key || input.code === 'Numpad' + key;
  if (key.length === 1 && /[a-z]/.test(key)) return input.code === 'Key' + key.toUpperCase();
  return inKey === key;
}
function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const walk = (items) => {
    for (const item of items) {
      if (item.submenu) { if (walk(item.submenu)) return true; continue; }
      if (item.accelerator && item.registerAccelerator !== false && item.click && acceleratorMatches(item.accelerator, input)) {
        event.preventDefault();
        item.click();
        return true;
      }
    }
    return false;
  };
  walk(menuTemplate());
}
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: T('O aplikaciji'), icon: nativeImage.createFromPath(ICON_PATH),
    message: T('Knjiga budžeta'),
    detail: T('Verzija {0}\nElectron {1}\n\nPodaci: {2}\nRezervne kopije: {3}', app.getVersion(), process.versions.electron, dataFile(), backupDir())
  });
}

// ---------- Tray ----------
function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T('Otvori Knjigu budžeta'), click: showMain },
    { type: 'separator' },
    { label: T('Brzi unos rashoda'), click: () => openQuickAdd('expense') },
    { label: T('Brzi unos prihoda'), click: () => openQuickAdd('income') },
    { type: 'separator' },
    { label: T('Pokreni sa Windows-om'), type: 'checkbox', checked: getAutostart(), click: (i) => { setAutostart(i.checked); sendToMain('desktop:settings-changed'); } },
    { type: 'separator' },
    { label: T('Izađi'), click: quitApp }
  ]));
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PATH).resize({ width: 32, height: 32 }));
  tray.setToolTip(T('Knjiga budžeta'));
  tray.on('click', showMain);
  rebuildTrayMenu();
}

// ---------- Glavni prozor ----------
function restoreBounds() {
  const s = settings.windowState;
  const def = { width: 1280, height: 860 };
  if (!s || !s.bounds) return def;
  // Ako je monitor na kom je prozor bio iskljucen, ne vracaj prozor van ekrana.
  const visible = screen.getAllDisplays().some(d => {
    const a = d.workArea, b = s.bounds;
    return b.x + 100 > a.x && b.x < a.x + a.width - 100 && b.y + 40 > a.y && b.y < a.y + a.height - 40;
  });
  return visible ? s.bounds : { width: s.bounds.width, height: s.bounds.height };
}
function rememberBounds() {
  if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
  settings.windowState = {
    bounds: mainWindow.isMaximized() ? (settings.windowState && settings.windowState.bounds) || mainWindow.getNormalBounds() : mainWindow.getBounds(),
    maximized: mainWindow.isMaximized()
  };
  saveSettings();
}

function createWindow(startHidden) {
  const c = THEME_COLORS[appTheme];
  mainWindow = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 420,
    minHeight: 520,
    show: false,
    title: T('Knjiga budžeta'),
    icon: ICON_PATH,
    backgroundColor: SUPPORTS_MICA ? '#00000000' : c.bg,
    backgroundMaterial: SUPPORTS_MICA ? 'mica' : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: SUPPORTS_MICA ? '#00000000' : c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  Menu.setApplicationMenu(null);
  if (settings.windowState && settings.windowState.maximized) mainWindow.maximize();

  mainWindow.webContents.on('before-input-event', handleShortcut);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => { if (!startHidden) mainWindow.show(); });
  ['resize', 'move', 'maximize', 'unmaximize'].forEach(ev => mainWindow.on(ev, rememberBounds));
  // Preuzeto azuriranje se instalira cim korisnik skloni prozor (tray ili minimizovanje).
  ['hide', 'minimize'].forEach(ev => mainWindow.on(ev, () => {
    if (!isQuitting && updateState.status === 'ready') setTimeout(scheduleAutoInstall, 1500);
  }));

  mainWindow.on('close', (e) => {
    rememberBounds();
    if (isQuitting || !settings.closeToTray) return;
    e.preventDefault();
    mainWindow.hide();
    if (!settings.trayHintShown && Notification.isSupported()) {
      new Notification({
        title: T('Knjiga budžeta radi u pozadini'),
        body: T('Podsetnici za plaćanja i dalje stižu. Aplikacija je u system tray-u (pored sata).'),
        icon: ICON_PATH
      }).show();
      settings.trayHintShown = true;
      saveSettings();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(APP_URL);
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

// Pre izlaska: upisi poslednje izmene u fajl sa podacima (cuvanje ide sa kratkim zakasnjenjem).
async function flushRenderer() {
  try {
    await Promise.race([
      runInMain('window.__desktopBridge ? window.__desktopBridge.flush() : null'),
      new Promise(r => setTimeout(r, 3000))
    ]);
  } catch { /* ignorisano */ }
}
async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  saveSettingsNow();
  await flushRenderer();
  // Preuzeta nova verzija se tiho instalira pri izlasku (bez ponovnog pokretanja).
  if (updateState.status === 'ready' && autoUpdater) { autoUpdater.quitAndInstall(true, false); return; }
  app.exit(0);
}

function handleArgs(argv) {
  const qa = argv.find(a => a.startsWith('--quick-add'));
  if (qa) { openQuickAdd(qa.split('=')[1]); return true; }
  return false;
}

// ---------- Start ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => { if (!handleArgs(argv)) showMain(); });
  app.whenReady().then(init);
}

function init() {
  app.setAppUserModelId('com.vanja.knjigabudzeta'); // potrebno za Windows notifikacije
  loadSettings();

  protocol.handle('app', async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(__dirname, rel));
    if (!file.startsWith(__dirname + path.sep)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!file.endsWith('.html')) return res;
    // Stranica sme da ucitava samo sopstveni sadrzaj — nema spoljnih skripti ni mreznih zahteva.
    const headers = new Headers(res.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "font-src 'self' data:", "manifest-src 'self' data:",
      "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"
    ].join('; '));
    return new Response(res.body, { status: res.status, headers });
  });

  const allowed = new Set(['notifications', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  app.setUserTasks([
    { program: EXE_PATH, arguments: '--quick-add=expense', iconPath: EXE_PATH, iconIndex: 0, title: T('Novi rashod'), description: T('Brzi unos rashoda') },
    { program: EXE_PATH, arguments: '--quick-add=income', iconPath: EXE_PATH, iconIndex: 0, title: T('Novi prihod'), description: T('Brzi unos prihoda') }
  ]);

  if (settings.lastVersion && settings.lastVersion !== app.getVersion()) updatedFrom = settings.lastVersion;
  settings.lastVersion = app.getVersion();
  const restartHidden = settings.restartHidden;
  settings.restartHidden = false;
  saveSettingsNow();

  const startHidden = process.argv.includes('--hidden') || restartHidden;
  createWindow(startHidden || process.argv.some(a => a.startsWith('--quick-add')));
  createTray();
  registerQuickAddShortcut();
  ensureDailyBackup();
  setupUpdater();
  mainWindow.webContents.once('did-finish-load', () => handleArgs(process.argv));
}

app.on('before-quit', (e) => {
  if (!isQuitting) { e.preventDefault(); quitApp(); }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
if (process.env.KNJIGA_TEST) global.__kbTest = { openQuickAdd, main: () => mainWindow, quick: () => quickAddWindow, quitApp };
// Automatska provera (npm run smoke): pokrene skriptu u stranici i ispise rezultat.
if (process.env.KNJIGA_TEST_SCRIPT) {
  app.whenReady().then(() => {
    const errors = [];
    const hook = () => {
      if (!mainWindow) return setTimeout(hook, 100);
      mainWindow.webContents.on('console-message', (e) => {
        const level = e.level !== undefined ? e.level : e.params && e.params.level;
        if (level === 'error' || level === 3) errors.push(String(e.message || (e.params && e.params.message)));
      });
      mainWindow.webContents.on('render-process-gone', (_e, d) => { errors.push('renderer gone: ' + d.reason); });
      // Test pokreta: simuliraj da su animacije u sistemu ukljucene (ili iskljucene)
      if (process.env.KNJIGA_TEST_MOTION) {
        try {
          mainWindow.webContents.debugger.attach('1.3');
          mainWindow.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: process.env.KNJIGA_TEST_MOTION }] });
        } catch (err) { errors.push('emulacija: ' + err.message); }
      }
      if (process.env.KNJIGA_TEST_SIZE) {
        const [w, h] = process.env.KNJIGA_TEST_SIZE.split(',').map(Number);
        mainWindow.unmaximize(); mainWindow.setSize(w, h);
      }
      mainWindow.webContents.once('did-finish-load', () => setTimeout(async () => {
        let result;
        try { result = await runInMain(fs.readFileSync(process.env.KNJIGA_TEST_SCRIPT, 'utf8')); }
        catch (err) { result = { ok: false, failures: ['skripta: ' + err.message] }; }
        result.consoleErrors = errors;
        result.locale = app.getLocale(); result.lang = LANG;
        if (errors.length) result.ok = false;
        if (process.env.KNJIGA_TEST_SHOT) {
          try { fs.writeFileSync(process.env.KNJIGA_TEST_SHOT, (await mainWindow.webContents.capturePage()).toPNG()); } catch (err) { result.shotError = err.message; }
        }
        // Snimak prozora za unos (KNJIGA_TEST_QUICK=expense|income[,more])
        if (process.env.KNJIGA_TEST_QUICK) {
          const [qType, qMore] = process.env.KNJIGA_TEST_QUICK.split(',');
          openQuickAdd(qType, { fromApp: true });
          await new Promise(r => setTimeout(r, 1500));
          if (qMore) { await quickAddWindow.webContents.executeJavaScript("document.getElementById('moreToggle').click(); document.getElementById('amount').value='240'; document.getElementById('desc').value='Namirnice'; document.getElementById('spreadOn').click();"); await new Promise(r => setTimeout(r, 700)); }
          try { fs.writeFileSync(process.env.KNJIGA_TEST_QUICK_SHOT, (await quickAddWindow.webContents.capturePage()).toPNG()); } catch (err) { result.quickShotError = err.message; }
          result.quickVisible = quickAddWindow.isVisible();
          result.quickBounds = quickAddWindow.getBounds();
        }
        process.stdout.write('SMOKE_RESULT ' + JSON.stringify(result) + '\n');
        isQuitting = true;
        await flushRenderer();
        app.exit(result.ok ? 0 : 1);
      }, 1500));
    };
    hook();
  });
}
app.on('window-all-closed', () => { /* ostaje u tray-u */ });
