// Objavljuje izvorni kod na GitHub (grana main) preko git-a: commit svih izmena + push.
// Licni podaci (podaci.json, Budzet.xlsx, rezervne kopije, verzije/) su u .gitignore, a skripta
// dodatno odbija commit ako bi bilo sta slicno uslo u repozitorijum.
// Token se ne cuva u git podesavanjima — prosledjuje se samo za ovaj push (GH_TOKEN).
// Upotreba: npm run push-source -- "Poruka commit-a"
const { execFileSync } = require('child_process');
const path = require('path');

const pkg = require('../package.json');
const root = path.join(__dirname, '..', '..');
const message = process.argv.slice(2).join(' ') || `Izvorni kod ${pkg.version}`;
const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts }).trim();

try {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN nije postavljen.');

  git(['add', '-A']);
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const tracked = git(['ls-files']).split('\n');
  const bad = tracked.filter(f => /podaci|\.xlsx$|rezervne|backup|^verzije\//i.test(f));
  if (bad.length) { git(['reset', '-q']); throw new Error('Odbijeno (lični podaci?): ' + bad.join(', ')); }

  if (staged.length) git(['commit', '-q', '-m', message]);
  const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD']));
  if (!ahead) { console.log('Nema izmena — izvorni kod na GitHub-u je već ažuran.'); process.exit(0); }

  const auth = Buffer.from('x-access-token:' + token).toString('base64');
  git(['-c', 'credential.helper=', '-c', `http.https://github.com/.extraheader=Authorization: Basic ${auth}`, 'push', '-q', 'origin', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`Objavljeno (${staged.length} izmenjenih fajlova): https://github.com/Vanja2424/knjiga-budzeta/commit/${git(['rev-parse', '--short', 'HEAD'])}`);
} catch (e) {
  // poruka greske ne sme da sadrzi token
  console.error(String(e.stderr || e.message).replace(/Basic [A-Za-z0-9+/=]+/g, 'Basic ***'));
  process.exit(1);
}
