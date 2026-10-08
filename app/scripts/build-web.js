// Spaja E:\Vanja\src u E:\Vanja\budzet-tracker.html: svaki red <!--@include X--> u sablonu zamenjuje se tacnim sadrzajem src/X.
// Izvor se menja u src/; budzet-tracker.html u korenu je generisan (copy-web ga pravi pre svakog pokretanja i pakovanja).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const INCLUDE = /^<!--@include ([\w./-]+)-->\r?\n?$/;
function buildWeb(){
  const tpl = fs.readFileSync(path.join(SRC, 'budzet-tracker.html'), 'utf8');
  const lines = tpl.split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l);
  return lines.map(l => {
    const m = INCLUDE.exec(l);
    if (!m) return l;
    const file = path.join(SRC, m[1]);
    if (!file.startsWith(SRC + path.sep) || !fs.existsSync(file)) throw new Error('build-web: nema fajla src/' + m[1]);
    return fs.readFileSync(file, 'utf8');
  }).join('');
}
module.exports = { buildWeb, ROOT };
if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, 'budzet-tracker.html'), buildWeb(), 'utf8');
  console.log('Spojeno: src/ -> budzet-tracker.html');
}
