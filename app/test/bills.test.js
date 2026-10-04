// Testovi za app/bills.js — bez Electron-a (lazni fetch i safeStorage)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createBills, DEFAULT_MODEL, GROQ_URL } = require('../bills.js');

function setup(fetchImpl, enc = true){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knjiga-bills-'));
  const settings = {};
  const safeStorage = { isEncryptionAvailable: () => enc, encryptString: s => Buffer.from('X' + s), decryptString: b => b.toString().slice(1) };
  const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, opts }); return fetchImpl(url, opts); };
  const api = createBills({ fetch, safeStorage, getSettings: () => settings, saveSettings: () => {}, dataDir: () => dir, sleep: async () => {} });
  return { api, dir, calls, settings: () => settings };
}
const okResponse = content => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { content } }] }) });

test('kljuc: sifrovan u podesavanjima, stranica vidi samo poslednja 4 znaka', () => {
  const { api, settings } = setup(() => okResponse('{}'));
  assert.equal(api.keyInfo().set, false);
  const info = api.setKey('gsk_abcdef1234');
  assert.deepEqual({ set: info.set, last4: info.last4, model: info.model }, { set: true, last4: '1234', model: DEFAULT_MODEL });
  assert.ok(settings().groqKeyEnc && !JSON.stringify(settings()).includes('gsk_abcdef'));
  assert.ok(!JSON.stringify(info).includes('gsk_abcdef'));
  assert.equal(api.setKey('').set, false);
  const noEnc = setup(() => okResponse('{}'), false);
  assert.equal(noEnc.api.setKey('gsk_x').error, 'encryption');
  assert.equal(noEnc.api.keyInfo().set, false);
});

test('read: salje model, slike, tekst i json_object; vraca sadrzaj', async () => {
  const { api, calls } = setup(() => okResponse('{"amount":1}'));
  api.setKey('gsk_test9999');
  api.setOptions({ model: 'drugi/model' });
  const r = await api.read({ images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC', 'data:image/jpeg;base64,DDD'], text: 'Ukupno 100', prompt: 'UPUTSTVO' });
  assert.deepEqual(r, { ok: true, content: '{"amount":1}' });
  assert.equal(calls[0].url, GROQ_URL);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer gsk_test9999');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.model, 'drugi/model');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].content, 'UPUTSTVO');
  const parts = body.messages[1].content;
  assert.equal(parts.filter(p => p.type === 'image_url').length, 3);   // najvise 3
  assert.match(parts.find(p => p.type === 'text').text, /Ukupno 100/);
  api.setOptions({ sendText: false });
  await api.read({ images: ['data:image/jpeg;base64,AAA'], text: 'TAJNO', prompt: 'P' });
  assert.ok(!calls[1].opts.body.includes('TAJNO'));
});

test('read: greske po vrsti', async () => {
  const mk = (status, headers = {}) => setup(() => ({ ok: false, status, headers: new Map(Object.entries(headers)), json: async () => ({ error: { message: 'm', code: status === 404 ? 'model_not_found' : '' } }) }));
  const none = setup(() => okResponse('{}'));
  assert.equal((await none.api.read({ images: [], text: 'x', prompt: 'p' })).kind, 'nokey');
  for (const [status, kind] of [[401, 'key'], [429, 'limit'], [404, 'model'], [500, 'http']]) {
    const s = mk(status, status === 429 ? { 'retry-after': '12' } : {}); s.api.setKey('gsk_k');
    const r = await s.api.read({ images: [], text: 'x', prompt: 'p' });
    assert.equal(r.kind, kind, String(status));
    if (status === 429) assert.equal(r.retryAfter, 12);
  }
  const net = setup(() => { throw new TypeError('fetch failed'); }); net.api.setKey('gsk_k');
  assert.equal((await net.api.read({ images: [], text: 'x', prompt: 'p' })).kind, 'network');
  const slow = setup(() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }); slow.api.setKey('gsk_k');
  assert.equal((await slow.api.read({ images: [], text: 'x', prompt: 'p' })).kind, 'timeout');
});

test('prilozi: cuvanje, sudar imena, putanja van foldera, brisanje i vracanje, smece, preslikavanje', () => {
  const { api, dir } = setup(() => okResponse('{}'));
  const a = api.saveFile(new Uint8Array([1, 2, 3]), '2025-01 struja/stan?.pdf');
  assert.equal(a.ok, true);
  assert.equal(a.name, '2025-01 struja-stan-.pdf');
  assert.equal(api.saveFile(new Uint8Array([4]), '2025-01 struja/stan?.pdf').name, '2025-01 struja-stan--2.pdf');
  assert.ok(fs.existsSync(path.join(dir, 'Prilozi', a.name)));
  assert.equal(api.filePath('..\podaci.json'), null);
  assert.equal(api.filePath('../x'), null);
  assert.equal(api.deleteFile('..\podaci.json').ok, false);
  assert.equal(api.deleteFile(a.name).ok, true);
  assert.ok(!fs.existsSync(path.join(dir, 'Prilozi', a.name)) && fs.existsSync(path.join(dir, 'Prilozi', '.obrisano', a.name)));
  assert.equal(api.restoreFile(a.name).ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'Prilozi', a.name)));
  api.deleteFile(a.name);
  const old = path.join(dir, 'Prilozi', '.obrisano', a.name);
  const t = new Date(Date.now() - 31 * 864e5); fs.utimesSync(old, t, t);
  assert.equal(api.purgeTrash(30), 1);
  const target = path.join(dir, 'kopija');
  assert.equal(api.mirrorTo(target), 1);   // samo "...-2.pdf" (obrisani se ne kopiraju)
  assert.equal(api.mirrorTo(target), 0);   // nista novo
});

test('prilozi: neuspelo upisivanje vraca gresku', () => {
  const { api, dir } = setup(() => okResponse('{}'));
  fs.writeFileSync(path.join(dir, 'Prilozi'), 'nije folder');   // Prilozi je fajl -> mkdir/pisanje pada
  const r = api.saveFile(new Uint8Array([1]), 'a.pdf');
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('prilozi: samo PDF i slike (nema .bat/.exe ni otvaranja drugih tipova)', () => {
  const { api, dir } = setup(() => okResponse('{}'));
  for (const bad of ['x.bat', 'x.exe', 'x.hta', 'x.cmd', 'x.js', 'x', 'x.pdf.exe']) assert.equal(api.saveFile(new Uint8Array([1]), bad).ok, false, bad);
  for (const good of ['a.pdf', 'b.JPG', 'c.jpeg', 'd.png', 'e.webp', 'f.heic']) assert.equal(api.saveFile(new Uint8Array([1]), good).ok, true, good);
  fs.writeFileSync(path.join(dir, 'Prilozi', 'podmetnut.bat'), 'x');
  assert.equal(api.filePath('podmetnut.bat'), null);
  assert.ok(api.filePath('a.pdf'));
});

test('read: 413 (limit tokena) -> automatski ponovi sa manje slika, pa samo tekst', async () => {
  const bodies = [];
  const tooLarge = { ok: false, status: 413, headers: new Map(), json: async () => ({ error: { message: 'Request too large ... (ITPM): Limit 7000, Requested 8134' } }) };
  let n = 0;
  const { api } = setup((url, opts) => { bodies.push(JSON.parse(opts.body)); n++; return n < 3 ? tooLarge : okResponse('{"amount":1}'); });
  api.setKey('gsk_k');
  const r = await api.read({ images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'], text: 'Ukupno 100', prompt: 'P' });
  assert.deepEqual(r, { ok: true, content: '{"amount":1}' });
  const imgs = b => b.messages[1].content.filter(p => p.type === 'image_url').length;
  assert.deepEqual(bodies.map(imgs), [2, 1, 0]);
  assert.match(JSON.stringify(bodies[2]), /Ukupno 100/);
});

test('read: 413 i bez teksta -> jedna slika; ako i to ne prodje, jasna greska', async () => {
  const bodies = [];
  const tooLarge = { ok: false, status: 413, headers: new Map(), json: async () => ({ error: { message: 'too large' } }) };
  const { api } = setup((url, opts) => { bodies.push(JSON.parse(opts.body)); return tooLarge; });
  api.setKey('gsk_k');
  const r = await api.read({ images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'], text: '', prompt: 'P' });
  assert.equal(r.kind, 'toolarge');
  assert.deepEqual(bodies.map(b => b.messages[1].content.filter(p => p.type === 'image_url').length), [2, 1]);
});

test('read: 429 sa kratkim cekanjem -> saceka i pokusa jos jednom', async () => {
  const waits = []; let n = 0;
  const limited = { ok: false, status: 429, headers: new Map([['retry-after', '12']]), json: async () => ({ error: { message: 'rate' } }) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knjiga-bills-'));
  const settings = {};
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('X' + s), decryptString: b => b.toString().slice(1) };
  const api = createBills({ fetch: async () => (++n === 1 ? limited : okResponse('{"x":1}')), safeStorage, getSettings: () => settings, saveSettings: () => {}, dataDir: () => dir, sleep: async ms => { waits.push(ms); } });
  api.setKey('gsk_k');
  assert.deepEqual(await api.read({ images: [], text: 't', prompt: 'p' }), { ok: true, content: '{"x":1}' });
  assert.deepEqual(waits, [13000]);
  n = 0;
  const long = { ok: false, status: 429, headers: new Map([['retry-after', '120']]), json: async () => ({}) };
  const settings2 = {};
  const api2 = createBills({ fetch: async () => long, safeStorage, getSettings: () => settings2, saveSettings: () => {}, dataDir: () => dir, sleep: async ms => { waits.push(ms); } });
  api2.setKey('gsk_k');
  assert.equal((await api2.read({ images: [], text: 't', prompt: 'p' })).kind, 'limit');
  assert.equal(waits.length, 1);   // predugo cekanje se ne radi
});

test('read: bez slike i teksta (npr. uvoz izvoda) poruka ne trazi citanje slike', async () => {
  const { api, calls } = setup(() => okResponse('{}'));
  api.setKey('gsk_k');
  await api.read({ images: [], text: '', prompt: 'P' });
  const parts = JSON.parse(calls[0].opts.body).messages[1].content;
  assert.ok(!/sa slike/.test(parts[0].text), parts[0].text);
});
test('prilozi: brisanje i vracanje nikad ne prepisuju fajl istog imena', () => {
  const { api, dir } = setup(() => okResponse('{}'));
  const P = path.join(dir, 'Prilozi'), T = path.join(P, '.obrisano');
  // novi fajl ne uzima ime koje jos stoji u smecu (da bi vracanje radilo)
  const a = api.saveFile(new Uint8Array([1]), 'a.pdf');
  api.deleteFile(a.name);
  const a2 = api.saveFile(new Uint8Array([2]), 'a.pdf');
  assert.notEqual(a2.name, 'a.pdf');
  // brisanje: u smecu vec postoji isto ime -> stari obrisani ostaje sacuvan
  fs.mkdirSync(T, { recursive: true });
  fs.writeFileSync(path.join(T, 'b.pdf'), 'STARI');
  fs.writeFileSync(path.join(P, 'b.pdf'), 'NOVI');
  const d = api.deleteFile('b.pdf');
  assert.equal(d.ok, true);
  assert.equal(fs.readFileSync(path.join(T, 'b.pdf'), 'utf8'), 'NOVI');   // poslednji obrisani je pod svojim imenom (za vracanje)
  const kept = fs.readdirSync(T).filter(n => n !== 'b.pdf' && n.startsWith('b'));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(T, kept[0]), 'utf8'), 'STARI');
  // vracanje: u Prilozi vec postoji isto ime -> vraca se pod novim imenom, postojeci ostaje
  fs.writeFileSync(path.join(T, 'c.pdf'), 'OBRISANI');
  fs.writeFileSync(path.join(P, 'c.pdf'), 'POSTOJECI');
  const r = api.restoreFile('c.pdf');
  assert.equal(r.ok, true);
  assert.notEqual(r.name, 'c.pdf');
  assert.equal(fs.readFileSync(path.join(P, 'c.pdf'), 'utf8'), 'POSTOJECI');
  assert.equal(fs.readFileSync(path.join(P, r.name), 'utf8'), 'OBRISANI');
  // bez sudara ime ostaje isto
  assert.equal(api.restoreFile('b.pdf').name, 'b.pdf');
});

test('prilozi: readFile vraca bajtove samo za ime iz Priloga (bez putanje), ne iz smeca', () => {
  const { api } = setup(() => okResponse('{}'));
  const saved = api.saveFile(new Uint8Array([7, 8, 9]), 'racun.png');
  assert.ok(saved.ok);
  const r = api.readFile(saved.name);
  assert.equal(r.ok, true); assert.deepEqual([...r.bytes], [7, 8, 9]);
  assert.equal(api.readFile('../podaci.json').ok, false);
  assert.equal(api.readFile('nema.png').ok, false);
  api.deleteFile(saved.name);
  assert.equal(api.readFile(saved.name).ok, false);
});

test('fiskalni racun: samo https://suf.purs.gov.rs, stranica + spisak stavki (POST sa brojem i tokenom), greske', async () => {
  const html = "<script>viewModel.InvoiceNumber('AB-CD-1'); viewModel.Token('tok-123');</script><span id=\"totalAmountLabel\">10,00</span>";
  const spec = { success: true, items: [{ name: 'X (E)/kom', quantity: 1, total: 10 }] };
  const seen = [];
  const { api } = setup(async (url, opts) => {
    seen.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (/\/specifications$/.test(url)) return { ok: true, status: 200, json: async () => spec, text: async () => JSON.stringify(spec) };
    return { ok: true, status: 200, text: async () => html };
  });
  const url = 'https://suf.purs.gov.rs/v/?vl=AbC%2B1%3D';
  const r = await api.fiscal(url);
  assert.equal(r.ok, true); assert.equal(r.html, html); assert.deepEqual(r.spec, spec);
  assert.equal(seen[0].url, url);
  assert.equal(seen[1].method, 'POST'); assert.match(String(seen[1].body), /invoiceNumber=AB-CD-1/); assert.match(String(seen[1].body), /token=tok-123/);
  seen.length = 0;
  assert.equal((await api.fiscal('https://evil.com/v/?vl=1')).ok, false);
  assert.equal((await api.fiscal('http://suf.purs.gov.rs/v/?vl=1')).ok, false);
  assert.equal(seen.length, 0);
  const bad = setup(async () => ({ ok: false, status: 404, text: async () => '' }));
  const b = await bad.api.fiscal(url);
  assert.deepEqual([b.ok, b.kind], [false, 'http']);
  const off = setup(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  assert.equal((await off.api.fiscal(url)).kind, 'network');
  // spisak stavki ne radi -> stranica i dalje (zurnal je rezerva)
  const half = setup(async (u) => /specifications/.test(u) ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, text: async () => html });
  const h = await half.api.fiscal(url);
  assert.equal(h.ok, true); assert.equal(h.spec, null);
});
