// Pokrece pravu aplikaciju (Electron) nad KOPIJOM podataka u privremenom folderu i izvrsava
// test/smoke-checks.js u stranici. Pravi podaci i instalirana aplikacija se ne diraju.
// Upotreba: npm run smoke [-- putanja\do\podaci.json]
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'knjiga-smoke-'));
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir);
const src = process.argv[2];
if (src) fs.copyFileSync(src, path.join(dataDir, 'podaci.json'));

const env = { ...process.env, KNJIGA_TEST: '1', KNJIGA_DATA_DIR: dataDir, KNJIGA_BACKUP_DIR: path.join(tmp, 'backup'), KNJIGA_TEST_SCRIPT: path.join(__dirname, 'smoke-checks.js') };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require('electron');
const r = spawnSync(electron, ['.', `--user-data-dir=${path.join(tmp, 'userdata')}`], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 120000 });
const line = (r.stdout || '').split('\n').find(l => l.startsWith('SMOKE_RESULT '));
if (!line) { console.error('Nema rezultata. stdout:\n' + r.stdout + '\nstderr:\n' + r.stderr); process.exit(1); }
const res = JSON.parse(line.slice('SMOKE_RESULT '.length));
console.log(`Provereno: ${res.passed ? res.passed.length : 0} ✓`);
(res.passed || []).forEach(p => console.log('  ✓ ' + p));
(res.failures || []).forEach(f => console.log('  ✗ ' + f));
(res.consoleErrors || []).forEach(e => console.log('  ✗ greška u konzoli: ' + e));
console.log(res.ok ? 'SVE U REDU' : 'IMA GREŠAKA');
const saved = path.join(dataDir, 'podaci.json');
if (fs.existsSync(saved)) console.log('Fajl posle testa: ' + saved);
process.exit(res.ok ? 0 : 1);
