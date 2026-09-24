// Kopira web deo aplikacije (jedini izvor je koren E:\Vanja) u folder app pre pokretanja/pakovanja.
const fs = require('fs');
const path = require('path');
const FILES = ['budzet-tracker.html', 'budzet-core.js', 'i18n.js', 'xlsx.core.min.js'];
const root = path.join(__dirname, '..', '..');
const app = path.join(__dirname, '..');
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(app, f));
console.log('Kopirano:', FILES.join(', '));
