// Instalacija sadrzi samo fajlove iz package.json build.files — svaki lokalni require mora biti na spisku
// (inace instalirana aplikacija pada pri pokretanju, a testovi iz izvornog foldera to ne vide).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const files = require(path.join(APP, 'package.json')).build.files;

function localRequires(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = fs.readFileSync(path.join(APP, file), 'utf8');
  for (const m of src.matchAll(/require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g)) {
    let dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
    if (!/\.\w+$/.test(dep)) dep += '.js';
    localRequires(dep, seen);
  }
  return seen;
}

test('build: svaki lokalni modul glavnog procesa je u build.files', () => {
  const needed = [...localRequires('main.js'), ...localRequires('preload.js')];
  const missing = [...new Set(needed)].filter(f => f !== 'package.json' && !files.includes(f)); // package.json je uvek u instalaciji
  assert.deepEqual(missing, []);
});

// Test kuke (window.__*) glavnog prozora postoje samo kad je KNJIGA_TEST postavljen (desktop.info.test), kao u prozoru za brzi unos.
// Izuzeci: mostovi koje koristi glavni proces (runInMain) ili sama stranica.
test('build: test kuke glavnog prozora samo u test pokretanju', () => {
  const html = fs.readFileSync(path.join(APP, '..', 'budzet-tracker.html'), 'utf8');
  const KEEP = ['__desktopData', '__desktopBridge', '__telegramBridge', '__toggleSidebar'];
  assert.match(html, /const IS_TEST = !!\(window\.desktop && window\.desktop\.info && window\.desktop\.info\.test\);/);
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  const usedByMain = [...new Set([...main.matchAll(/window\.(__\w+)/g)].map(m => m[1]))];
  assert.deepEqual(usedByMain.filter(n => !KEEP.includes(n)), [], 'glavni proces koristi kuku koja nije na spisku izuzetaka');
  const ungated = [];
  html.split(/\r?\n/).forEach((line, i) => {
    const m = /^\s*(?:window\.(__\w+)\s*=[^=]|Object\.defineProperty\(window,\s*'(__\w+)')/.exec(line);
    if (!m) return;
    const name = m[1] || m[2];
    if (!KEEP.includes(name)) ungated.push((i + 1) + ': ' + name);
  });
  assert.deepEqual(ungated, []);
  assert.ok((html.match(/if\(IS_TEST\) (?:window\.__|Object\.defineProperty\(window, '__)/g) || []).length > 60);
});

test('build: budzet-tracker.html u korenu je tacan spoj iz src/ (izvor se menja u src/)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const { buildWeb, ROOT } = require('../scripts/build-web.js');
  const built = buildWeb();
  assert.equal(fs.readFileSync(path.join(ROOT, 'budzet-tracker.html'), 'utf8') === built, true, 'budzet-tracker.html nije spoj iz src/ — pokreni npm run copy-web');
  assert.match(built, /GENERISANO iz src\//);
  assert.doesNotMatch(built, /<!--@include /);
  const js = fs.readdirSync(path.join(ROOT, 'src', 'js'));
  assert.ok(js.length >= 20 && js.every(f => fs.statSync(path.join(ROOT, 'src', 'js', f)).size > 0));
});
