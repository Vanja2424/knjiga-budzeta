// Objavljuje izvorni kod na GitHub (grana main) bez git-a, preko GitHub API-ja.
// Salje SAMO fajlove sa spiska ispod — licni podaci (podaci.json, Budzet.xlsx, rezervne kopije)
// nikad ne idu na GitHub. Repozitorijum posle objave sadrzi tacno ove fajlove.
// Upotreba: npm run push-source -- "Poruka commit-a"
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const { owner, repo } = pkg.build.publish[0];
const root = path.join(__dirname, '..', '..');
const app = path.join(__dirname, '..');
const message = process.argv.slice(2).join(' ') || `Izvorni kod ${pkg.version}`;

const listDir = (dir, re) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).sort() : [];
const FILES = [
  ['README.md', path.join(root, 'README.md')],
  ['.gitignore', path.join(root, '.gitignore')],
  ['budzet-tracker.html', path.join(root, 'budzet-tracker.html')],
  ['budzet-core.js', path.join(root, 'budzet-core.js')],
  ['i18n.js', path.join(root, 'i18n.js')],
  ['xlsx.core.min.js', path.join(root, 'xlsx.core.min.js')],
  ['pokreni-budzet.bat', path.join(root, 'pokreni-budzet.bat')],
  ...['main.js', 'preload.js', 'quick-add.html', 'package.json', 'package-lock.json'].map(f => ['app/' + f, path.join(app, f)]),
  ['app/build/icon.png', path.join(app, 'build', 'icon.png')],
  ['app/build/installer.nsh', path.join(app, 'build', 'installer.nsh')],
  ...listDir(path.join(app, 'scripts'), /\.js$/).map(f => ['app/scripts/' + f, path.join(app, 'scripts', f)]),
  ...listDir(path.join(app, 'test'), /\.js$/).map(f => ['app/test/' + f, path.join(app, 'test', f)]),
  ...listDir(path.join(app, 'release-notes'), /\.md$/).map(f => ['app/release-notes/' + f, path.join(app, 'release-notes', f)]),
];

const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN nije postavljen.'); process.exit(1); }
const api = `https://api.github.com/repos/${owner}/${repo}`;
async function gh(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  for (const [, local] of FILES) if (!fs.existsSync(local)) throw new Error('Nedostaje ' + local);
  // Zastita: nista sto lici na licne podatke
  for (const [repoPath] of FILES) if (/podaci|\.xlsx$|rezervne|backup/i.test(repoPath)) throw new Error('Odbijeno (lični podaci?): ' + repoPath);

  const ref = await gh(`${api}/git/ref/heads/main`);
  const parent = await gh(`${api}/git/commits/${ref.object.sha}`);
  const tree = [];
  for (const [repoPath, local] of FILES) {
    const blob = await gh(`${api}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: fs.readFileSync(local).toString('base64'), encoding: 'base64' }) });
    tree.push({ path: repoPath, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(`${api}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) });
  if (newTree.sha === parent.tree.sha) { console.log('Nema izmena — izvorni kod na GitHub-u je već ažuran.'); return; }
  const commit = await gh(`${api}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [parent.sha] }) });
  await gh(`${api}/git/refs/heads/main`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  console.log(`Objavljeno ${FILES.length} fajlova: https://github.com/${owner}/${repo}/commit/${commit.sha.slice(0, 7)}`);
})().catch(e => { console.error(e.message); process.exit(1); });
