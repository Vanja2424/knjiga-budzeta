// Publishes dist/ to GitHub Releases. electron-builder's own publisher races when
// creating the release (two parallel uploads → 422) and never uploads latest.yml,
// so we build with --publish never and upload the three files here, sequentially.
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const { owner, repo } = pkg.build.publish[0];
const version = pkg.version;
const tag = `v${version}`;
const dist = path.join(__dirname, '..', 'dist');
const exe = `Knjiga-budzeta-Setup-${version}.exe`;
const files = [exe, `${exe}.blockmap`, 'latest.yml'];

const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN nije postavljen.'); process.exit(1); }

const api = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function gh(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  if (!res.ok && res.status !== 404) throw new Error(`${opts.method || 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 404 ? null : res.status === 204 ? {} : res.json();
}

(async () => {
  const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  if (!yml.includes(`version: ${version}`)) throw new Error(`dist/latest.yml nije za ${version} — pokreni build ponovo.`);
  for (const f of files) if (!fs.existsSync(path.join(dist, f))) throw new Error(`Nedostaje dist/${f}`);

  // Beleske o izdanju (prikazuju se u aplikaciji posle azuriranja): release-notes/<verzija>.md
  const notesFile = path.join(__dirname, '..', 'release-notes', `${version}.md`);
  const body = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : '';

  let release = await gh(`${api}/releases/tags/${tag}`);
  if (!release) {
    release = await gh(`${api}/releases`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, target_commitish: 'main', name: version, body, draft: false, prerelease: false }),
    });
    console.log(`Kreiran release ${tag}`);
  } else if (body && release.body !== body) {
    release = await gh(`${api}/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  }

  for (const f of files) {
    const old = release.assets.find(a => a.name === f);
    if (old) await gh(`${api}/releases/assets/${old.id}`, { method: 'DELETE' });
    const body = fs.readFileSync(path.join(dist, f));
    const url = release.upload_url.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(f)}`;
    await gh(url, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) } });
    console.log(`Otpremljeno ${f} (${(body.length / 1048576).toFixed(1)} MB)`);
  }
  console.log(`Gotovo: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
})().catch(e => { console.error(e.message); process.exit(1); });
