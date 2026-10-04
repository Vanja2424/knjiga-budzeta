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
