// Most izmedju stranice i desktop programa. Stranica vidi samo window.desktop sa ovim
// funkcijama — nema direktnog pristupa Node-u ni fajl sistemu.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: ipcRenderer.sendSync('desktop:info'),

  // Fajl sa podacima (Documents\Knjiga budzeta\podaci.json)
  data: {
    load: () => ipcRenderer.sendSync('data:load'),
    save: (data) => ipcRenderer.invoke('data:save', data),
    saveSync: (data) => ipcRenderer.sendSync('data:save-sync', data),
    info: () => ipcRenderer.invoke('data:info'),
    open: () => ipcRenderer.invoke('data:open')
  },

  // Kursna lista (NBS)
  getRates: (force) => ipcRenderer.invoke('rates:get', force),

  // Rezervne kopije
  backupNow: (kind) => ipcRenderer.invoke('backup:now', kind),
  backupInfo: () => ipcRenderer.invoke('backup:info'),
  backupList: () => ipcRenderer.invoke('backup:list'),
  backupRead: (name) => ipcRenderer.invoke('backup:read', name),
  openBackups: () => ipcRenderer.invoke('backup:open'),
  // Dodatna kopija van racunara (USB / drugi folder)
  extraBackup: {
    info: () => ipcRenderer.invoke('backup:extra-info'),
    now: () => ipcRenderer.invoke('backup:extra-now'),
    choose: () => ipcRenderer.invoke('backup:extra-choose'),
    clear: () => ipcRenderer.invoke('backup:extra-clear'),
    open: () => ipcRenderer.invoke('backup:extra-open'),
    onChange: (cb) => ipcRenderer.on('desktop:extra-backup', (_e, info) => cb(info))
  },

  // Prozor i Windows integracija
  choosePdfPath: (name) => ipcRenderer.invoke('pdf:choose', name),
  writePdf: (filePath) => ipcRenderer.invoke('pdf:write', filePath),
  setTheme: (theme, explicit) => ipcRenderer.send('desktop:theme', theme, !!explicit),
  setBadge: (count, dataUrl) => ipcRenderer.send('desktop:badge', count, dataUrl),
  showWindow: () => ipcRenderer.send('desktop:show'),
  showMenu: (x, y) => ipcRenderer.send('desktop:menu', x, y),
  onCommand: (cb) => ipcRenderer.on('desktop:command', (_e, name, arg) => cb(name, arg)),
  onSettingsChanged: (cb) => ipcRenderer.on('desktop:settings-changed', () => cb()),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Automatska azuriranja
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.send('update:check'),
    install: () => ipcRenderer.send('update:install'),
    postpone: () => ipcRenderer.send('update:postpone'),
    notes: () => ipcRenderer.invoke('update:notes'),
    openDownload: () => ipcRenderer.send('update:open-download'),
    onChange: (cb) => ipcRenderer.on('desktop:update', (_e, s) => cb(s))
  },

  // Prozor za brzi unos
  quick: {
    getData: () => ipcRenderer.invoke('quick:data'),
    add: (entry) => ipcRenderer.invoke('quick:add', entry),
    close: () => ipcRenderer.send('quick:close'),
    resize: (h) => ipcRenderer.send('quick:resize', h),
    onOpen: (cb) => ipcRenderer.on('quick:open', (_e, opts) => cb(opts)),
    // iz glavnog prozora: otvori prozor za unos (rashod/prihod)
    open: (type) => ipcRenderer.send('quick:open-request', type)
  },

  // Kucni racuni: AI citanje (Groq; kljuc ostaje u glavnom procesu) i prilozi u folderu Prilozi
  bills: {
    keyInfo: () => ipcRenderer.invoke('bills:key-info'),
    setKey: (key) => ipcRenderer.invoke('bills:key-set', key),
    setOptions: (o) => ipcRenderer.invoke('bills:options', o),
    testKey: () => ipcRenderer.invoke('bills:key-test'),
    read: (req) => ipcRenderer.invoke('bills:read', req),
    saveFile: (bytes, name) => ipcRenderer.invoke('bills:save-file', bytes, name),
    openFile: (name) => ipcRenderer.invoke('bills:open-file', name),
    deleteFile: (name) => ipcRenderer.invoke('bills:delete-file', name),
    restoreFile: (name) => ipcRenderer.invoke('bills:restore-file', name)
  }
});
