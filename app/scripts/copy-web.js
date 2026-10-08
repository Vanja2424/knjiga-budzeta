// Kopira web deo aplikacije (jedini izvor je koren E:\Vanja) u folder app pre pokretanja/pakovanja.
const fs = require('fs');
const path = require('path');
// budzet-tracker.html se prvo spaja iz src/ (vidi build-web.js)
const { buildWeb } = require('./build-web');
fs.writeFileSync(path.join(__dirname, '..', '..', 'budzet-tracker.html'), buildWeb(), 'utf8');
const FILES = ['budzet-tracker.html', 'budzet-core.js', 'i18n.js', 'xlsx.core.min.js', 'qrcode-generator.js', 'jsQR.js', 'pdf.min.mjs', 'pdf.worker.min.mjs'];
const root = path.join(__dirname, '..', '..');
const app = path.join(__dirname, '..');
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(app, f));
console.log('Kopirano:', FILES.join(', '));
