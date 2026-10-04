// Testovi za app/telegram.js — bez Electron-a i bez pravog Telegrama (lazni fetch i safeStorage)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegram } = require('../telegram.js');

const fs = require('node:fs'), path = require('node:path');

const TOKEN = '123456:ABC-secret_token';
let lastOpts = null;
function setup({ handle, tick, settings: init, extra } = {}){
  const settings = Object.assign({}, init || {});
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('X' + s), decryptString: b => b.toString().slice(1) };
  const calls = [], queue = {};
  const reply = (method, result, extra) => Object.assign({ ok: true, status: 200, json: async () => ({ ok: true, result }) }, extra || {});
  const fetch = async (url, opts) => {
    const m = /\/bot[^/]+\/(\w+)$/.exec(url) || /\/file\/bot[^/]+\/(.+)$/.exec(url);
    const method = url.includes('/file/bot') ? 'FILE' : m[1];
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, method, body }); lastOpts = opts;
    const q = queue[method];
    if (q && q.length) { const r = q.shift(); return typeof r === 'function' ? r(body) : r; }
    if (method === 'getMe') return reply(method, { username: 'knjiga_test_bot' });
    if (method === 'sendMessage') return reply(method, { message_id: 900 + calls.length });
    if (method === 'getUpdates') return reply(method, []);
    return reply(method, true);
  };
  const handled = [];
  const api = createTelegram({
    fetch, safeStorage, getSettings: () => settings, saveSettings: () => {},
    handle: handle || (async p => { handled.push(p); return { replies: [{ text: 'ok ' + p.kind }] }; }),
    tick: tick || (async () => ({ replies: [] })),
    T: s => s, now: () => 1000000, sleep: async () => {}, random: () => 0.4821, autoStart: false, ...(extra || {})
  });
  return { api, settings, calls, queue, handled, reply };
}
const upd = (id, msg) => ({ update_id: id, message: Object.assign({ message_id: id, chat: { id: 77, type: 'private' }, from: { id: 77 } }, msg) });

test('telegram: token sifrovan, stranica vidi samo poslednja 4 znaka, getMe daje ime bota', async () => {
  const { api, settings } = setup();
  const st = await api.setToken(TOKEN);
  assert.equal(st.set, true); assert.equal(st.last4, 'oken'); assert.equal(st.botName, 'knjiga_test_bot');
  assert.ok(settings.telegramTokenEnc && !JSON.stringify(settings).includes('secret'));
  assert.ok(!JSON.stringify(api.status()).includes('secret'));
  const cleared = await api.setToken('');
  assert.equal(cleared.set, false); assert.equal(settings.telegramChatId, undefined);
});

test('telegram: povezivanje kodom, istekao kod i tudji chat se ignorisu', async () => {
  const { api, settings, queue, calls, reply, handled } = setup();
  await api.setToken(TOKEN);
  const { pairCode } = api.startPairing();
  assert.equal(pairCode, '482100');
  queue.getUpdates = [reply('getUpdates', [upd(1, { text: '1111' }), upd(2, { text: ' 482100 ' }), { update_id: 3, message: { message_id: 3, chat: { id: 55, type: 'private' }, from: { id: 55 }, text: 'kafa 250' } }])];
  await api.pollOnce();
  assert.equal(settings.telegramChatId, 77);
  assert.equal(settings.telegramOffset, 4);
  assert.equal(handled.length, 0); // ni kod ni tudja poruka ne idu stranici
  const sent = calls.filter(c => c.method === 'sendMessage');
  assert.equal(sent.length, 1); assert.equal(sent[0].body.chat_id, 77);
  assert.equal(api.status().pairCode, '');
});

test('telegram: update se obradjuje redom, offset posle svakog; greska u handle ne pomera offset', async () => {
  let fail = true;
  const order = [];
  const { api, settings, queue, reply } = setup({ settings: { telegramChatId: 77 }, handle: async p => {
    order.push(p.update_id);
    if (p.update_id === 11 && fail) throw new Error('page not ready');
    return { replies: [] };
  } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [upd(10, { text: 'a 1' }), upd(11, { text: 'b 2' }), upd(12, { text: 'c 3' })])];
  const wait = await api.pollOnce();
  assert.deepEqual(order, [10, 11]);
  assert.equal(settings.telegramOffset, 11);
  assert.ok(wait >= 30);
  fail = false;
  queue.getUpdates = [b => { assert.equal(b.offset, 11); return reply('getUpdates', [upd(11, { text: 'b 2' }), upd(12, { text: 'c 3' })]); }];
  await api.pollOnce();
  assert.deepEqual(order, [10, 11, 11, 12]);
  assert.equal(settings.telegramOffset, 13);
});

test('telegram: fotografija -> najveca velicina, poruka "Citam", base64 u payload; los tip i velicina', async () => {
  const { api, settings, queue, reply, handled, calls } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getFile = [b => { assert.equal(b.file_id, 'big'); return reply('getFile', { file_path: 'photos/a.jpg', file_size: 300 }); }];
  queue.FILE = [{ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }];
  queue.getUpdates = [reply('getUpdates', [
    upd(20, { caption: 'maxi', photo: [{ file_id: 'small', file_size: 10, width: 90, height: 90 }, { file_id: 'big', file_size: 300, width: 1280, height: 960 }] }),
    upd(21, { document: { file_id: 'd1', file_name: 'x.exe', mime_type: 'application/octet-stream', file_size: 5 } }),
    upd(22, { document: { file_id: 'd2', file_name: 'r.pdf', mime_type: 'application/pdf', file_size: 50 * 1024 * 1024 } })
  ])];
  await api.pollOnce();
  assert.equal(handled[0].kind, 'file'); assert.equal(handled[0].caption, 'maxi');
  assert.equal(handled[0].file.base64, Buffer.from([1, 2, 3]).toString('base64'));
  assert.equal(handled[0].file.mime, 'image/jpeg'); assert.equal(handled[0].file.compressed, true);
  assert.ok(handled[0].progressMessageId > 0);
  assert.equal(handled[1].fileError, 'type');
  assert.equal(handled[2].fileError, 'size');
  assert.ok(!calls.some(c => c.method === 'getFile' && c.body.file_id === 'd2'));
});

test('telegram: dugme -> answerCallbackQuery i izmena poruke; 429 i 401; token nije u gresci', async () => {
  const { api, settings, queue, reply, calls } = setup({ settings: { telegramChatId: 77 }, handle: async p => ({ callbackText: 'Sačuvano', replies: [{ editMessageId: p.messageId, text: '✓ Sačuvano' }] }) });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [{ update_id: 30, callback_query: { id: 'cb1', from: { id: 77 }, data: 's:abc', message: { message_id: 5, chat: { id: 77 } } } }])];
  await api.pollOnce();
  const ans = calls.find(c => c.method === 'answerCallbackQuery');
  assert.equal(ans.body.callback_query_id, 'cb1'); assert.equal(ans.body.text, 'Sačuvano');
  const ed = calls.find(c => c.method === 'editMessageText');
  assert.deepEqual([ed.body.message_id, ed.body.text, ed.body.reply_markup.inline_keyboard.length], [5, '✓ Sačuvano', 0]);
  queue.getUpdates = [{ ok: false, status: 429, json: async () => ({ ok: false, parameters: { retry_after: 17 } }) }];
  assert.equal(await api.pollOnce(), 17);
  queue.getUpdates = [async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/bot' + TOKEN + '/getUpdates'); }];
  await api.pollOnce();
  assert.equal(api.status().state, 'offline');
  assert.ok(!JSON.stringify(api.status()).includes('secret'));
  queue.getUpdates = [{ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) }];
  assert.equal(await api.pollOnce(), -1);
  assert.equal(api.status().state, 'badToken');
});

test('telegram: dugmad -> inline tastatura, tekst se skracuje na 4096', async () => {
  const { api, settings, calls } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  await api.deliver([{ text: 'x'.repeat(5000), buttons: [[{ text: '✓ Sačuvaj', data: 's:1' }], [{ text: '✕', data: 'x:1' }, { text: 'Otvori', data: 'o:1' }]] }]);
  const m = calls.find(c => c.method === 'sendMessage');
  assert.equal(m.body.text.length, 4096);
  assert.deepEqual(m.body.reply_markup.inline_keyboard, [[{ text: '✓ Sačuvaj', callback_data: 's:1' }], [{ text: '✕', callback_data: 'x:1' }, { text: 'Otvori', callback_data: 'o:1' }]]);
});

const tick0 = () => new Promise(r => setImmediate(r));
test('telegram: stop pa odmah start ne ostavlja bota mrtvog (petlja nastavlja, stanje nije offline)', async () => {
  let polls = 0;
  const { api, settings, queue } = setup({ settings: { telegramChatId: 77 }, extra: { autoStart: true } });
  settings.telegramTokenEnc = Buffer.from('X' + TOKEN).toString('base64');
  const blocking = (body, opts) => { polls++; return new Promise((res, rej) => { opts.signal.addEventListener('abort', () => rej(new Error('aborted'))); }); };
  queue.getUpdates = [ (b) => blocking(b, lastOpts), (b) => blocking(b, lastOpts), (b) => blocking(b, lastOpts) ];
  api.start(); await tick0(); await tick0();
  assert.equal(polls, 1);
  api.stop(); api.start();
  for (let i = 0; i < 6; i++) await tick0();
  assert.equal(polls, 2);
  assert.notEqual(api.status().state, 'offline');
  api.stop(); for (let i = 0; i < 4; i++) await tick0();
});

test('telegram: poruka koja stalno pada se posle 3 pokusaja preskace uz poruku; nespremna stranica se ne preskace', async () => {
  let notReady = true;
  const { api, settings, queue, reply, calls } = setup({ settings: { telegramChatId: 77 }, handle: async p => {
    if (p.update_id === 60 && notReady) throw Object.assign(new Error('stranica nije spremna'), { notReady: true });
    if (p.update_id === 61) throw new Error('bug u citacu');
    return { replies: [] };
  } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  for (let i = 0; i < 5; i++) { queue.getUpdates = [reply('getUpdates', [upd(60, { text: 'a 1' })])]; await api.pollOnce(); }
  assert.equal(settings.telegramOffset || 0, 0);
  notReady = false;
  queue.getUpdates = [reply('getUpdates', [upd(60, { text: 'a 1' })])]; await api.pollOnce();
  assert.equal(settings.telegramOffset, 61);
  for (let i = 0; i < 2; i++) { queue.getUpdates = [reply('getUpdates', [upd(61, { text: 'b 2' })])]; assert.equal(await api.pollOnce(), 30); assert.equal(settings.telegramOffset, 61); }
  queue.getUpdates = [reply('getUpdates', [upd(61, { text: 'b 2' })])];
  await api.pollOnce();
  assert.equal(settings.telegramOffset, 62);
  assert.ok(calls.some(c => c.method === 'sendMessage' && /nije mogla da se obradi/.test(c.body.text)));
});

test('telegram: obrada koja ne zavrsi na vreme ne pomera offset', async () => {
  const { api, settings, queue, reply } = setup({ settings: { telegramChatId: 77 }, handle: () => new Promise(() => {}), extra: { handleTimeoutMs: 20 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [upd(70, { text: 'a 1' })])];
  assert.equal(await api.pollOnce(), 30);
  assert.equal(settings.telegramOffset || 0, 0);
});

test('telegram: kanal se ne povezuje, kod pada posle 5 pogresnih, dugme od drugog korisnika se ignorise (privatni chat)', async () => {
  const { api, settings, queue, reply, handled } = setup();
  await api.setToken(TOKEN);
  api.startPairing();
  const grp = { update_id: 80, message: { message_id: 80, chat: { id: -100, type: 'channel' }, from: { id: 9 }, text: '482100' } };
  queue.getUpdates = [reply('getUpdates', [grp])]; await api.pollOnce();
  assert.equal(settings.telegramChatId, undefined);
  const wrong = [81, 82, 83, 84, 85].map(id => ({ update_id: id, message: { message_id: id, chat: { id: 55, type: 'private' }, from: { id: 55 }, text: String(100000 + id) } }));
  queue.getUpdates = [reply('getUpdates', wrong)]; await api.pollOnce();
  assert.equal(api.status().pairCode, '');
  queue.getUpdates = [reply('getUpdates', [upd(86, { text: '482100' })])]; await api.pollOnce();
  assert.equal(settings.telegramChatId, undefined);
  api.startPairing();
  queue.getUpdates = [reply('getUpdates', [upd(87, { text: '482100' })])]; await api.pollOnce();
  assert.equal(settings.telegramChatId, 77); assert.equal(settings.telegramUserId, 77);
  queue.getUpdates = [reply('getUpdates', [{ update_id: 88, callback_query: { id: 'c', from: { id: 999 }, data: 's:x', message: { message_id: 1, chat: { id: 77 } } } }])];
  await api.pollOnce();
  assert.equal(handled.length, 0);
});

test('telegram: grupa — povezivanje kodom iz grupe, svi clanovi, ime posiljaoca, druga grupa se ignorise, prelazak u supergrupu', async () => {
  const { api, settings, queue, reply, handled, calls } = setup();
  await api.setToken(TOKEN);
  api.startPairing();
  const g = (id, chat, from, extra) => ({ update_id: id, message: Object.assign({ message_id: id, chat, from }, extra) });
  const kuca = { id: -200, type: 'group', title: 'Kuća' };
  queue.getUpdates = [reply('getUpdates', [g(90, kuca, { id: 5, first_name: 'Ana' }, { text: '482100' })])];
  await api.pollOnce();
  assert.equal(settings.telegramChatId, -200);
  assert.equal(settings.telegramUserId, undefined);
  assert.equal(settings.telegramChatTitle, 'Kuća');
  assert.equal(api.status().chatTitle, 'Kuća');
  assert.ok(calls.some(c => c.method === 'sendMessage' && c.body.chat_id === -200 && /Povezano/.test(c.body.text)));
  queue.getUpdates = [reply('getUpdates', [
    g(91, kuca, { id: 6, first_name: 'Vanja', last_name: 'C' }, { text: 'kafa 250' }),
    g(92, { id: -300, type: 'group', title: 'Druga' }, { id: 6, first_name: 'Vanja' }, { text: 'kafa 999' }),
    g(93, kuca, { id: 5, first_name: 'Ana' }, { new_chat_members: [{ id: 7 }] }),
    g(94, kuca, { id: 5, first_name: 'Ana' }, { migrate_to_chat_id: -100200 }),
    g(95, { id: -100200, type: 'supergroup', title: 'Kuća' }, { id: 5, first_name: 'Ana' }, { text: 'hleb 80' })
  ])];
  await api.pollOnce();
  assert.deepEqual(handled.map(p => [p.update_id, p.text, p.group, p.from && p.from.name]), [[91, 'kafa 250', true, 'Vanja'], [95, 'hleb 80', true, 'Ana']]);
  assert.equal(settings.telegramChatId, -100200);
  assert.equal(settings.telegramOffset, 96);
});

test('telegram: privatni chat — payload nije grupni', async () => {
  const { api, settings, queue, reply, handled } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [upd(96, { text: 'kafa 250', from: { id: 77, first_name: 'Vanja' } })])];
  await api.pollOnce();
  assert.equal(handled[0].group, false);
});

test('telegram: ime bota ispred koda i poruke (@bot 482100, @bot kafa 250) se prihvata', async () => {
  const { api, settings, queue, reply, handled } = setup();
  await api.setToken(TOKEN);
  api.startPairing();
  const kuca = { id: -400, type: 'supergroup', title: 'Kuća' };
  const g = (id, text) => ({ update_id: id, message: { message_id: id, chat: kuca, from: { id: 6, first_name: 'Vanja' }, text } });
  queue.getUpdates = [reply('getUpdates', [g(100, '@knjiga_test_bot 482100')])];
  await api.pollOnce();
  assert.equal(settings.telegramChatId, -400);
  queue.getUpdates = [reply('getUpdates', [g(101, '@Knjiga_Test_Bot kafa 250'), g(102, 'kafa 300 @knjiga_test_bot'), g(103, '/ponisti@knjiga_test_bot')])];
  await api.pollOnce();
  assert.deepEqual(handled.map(p => p.text), ['kafa 250', 'kafa 300', '/ponisti@knjiga_test_bot']);
});

test('telegram: provera tokena bez mreze (ne 401) -> petlja ipak krece i pokusava ponovo; los token ne krece', async () => {
  let polls = 0;
  const { api, queue } = setup({ extra: { autoStart: true } });
  queue.getMe = [async () => { throw new Error('getaddrinfo ENOTFOUND api.telegram.org'); }];
  queue.getUpdates = [b => { polls++; const o = lastOpts; return new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(new Error('aborted'))); }); }];
  const st = await api.setToken(TOKEN);
  assert.equal(st.state, 'offline');
  for (let i = 0; i < 4; i++) await tick0();
  assert.equal(polls, 1);
  api.stop(); for (let i = 0; i < 4; i++) await tick0();
  const bad = setup({ extra: { autoStart: true } });
  let badPolls = 0;
  bad.queue.getMe = [{ ok: false, status: 401, json: async () => ({ ok: false }) }];
  bad.queue.getUpdates = [() => { badPolls++; return bad.reply('getUpdates', []); }];
  assert.equal((await bad.api.setToken(TOKEN)).state, 'badToken');
  for (let i = 0; i < 4; i++) await tick0();
  assert.equal(badPolls, 0);
});

test('telegram: ime bota se dopuni kad mreza proradi (getMe nije uspeo pri upisu tokena)', async () => {
  const { api, settings, queue, reply } = setup();
  queue.getMe = [async () => { throw new Error('offline'); }];
  await api.setToken(TOKEN);
  assert.equal(api.status().botName, '');
  queue.getUpdates = [reply('getUpdates', [])];
  await api.pollOnce();
  assert.equal(settings.telegramBotName, 'knjiga_test_bot');
});

test('telegram: 409 (isti bot na drugom racunaru) -> stanje conflict, ceka najmanje 30 s i sve duze', async () => {
  const { api, queue } = setup({ settings: { telegramChatId: 77 } });
  await api.setToken(TOKEN);
  const c409 = () => ({ ok: false, status: 409, json: async () => ({ ok: false, description: 'Conflict: terminated by other getUpdates request' }) });
  queue.getUpdates = [c409(), c409(), c409(), c409(), c409()];
  const waits = [];
  for (let i = 0; i < 5; i++) waits.push(await api.pollOnce());
  assert.equal(api.status().state, 'conflict');
  assert.ok(waits.every(w => w >= 30), JSON.stringify(waits));
  waits.slice(1).forEach((w, i) => assert.ok(w >= waits[i], JSON.stringify(waits)));
  assert.equal(waits[4], 60);
});

test('telegram: otkazan izlazak ne gasi bota — stop tek kad izlazak stvarno ide (main.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const bq = /app\.on\('before-quit'[\s\S]*?\n\}\);/.exec(src)[0];
  const guard = bq.indexOf('if (!isQuitting)'), stopAt = bq.indexOf('telegramApi.stop()');
  assert.ok(guard >= 0, bq);
  assert.ok(stopAt < 0 || (stopAt > guard && /return;\s*\}/.test(bq.slice(guard, stopAt))), 'before-quit gasi bota pre nego sto quitApp odluci: ' + bq);
  const qa = /async function quitApp\(\) \{[\s\S]*?\n\}/.exec(src)[0];
  const cancel = qa.indexOf('response === 2'), stop = qa.indexOf('telegramApi.stop()');
  assert.ok(cancel > 0 && stop > cancel, 'quitApp treba da gasi bota tek posle dijaloga (otkazivanje ga ostavlja)');
});

test('telegram: QR na slici (glavni proces) -> link Poreske uprave u payload; drugi QR i PDF se ne citaju kao fiskalni', async () => {
  const decoded = [];
  const qrText = { big: 'https://suf.purs.gov.rs/v/?vl=AbC%2B1%3D', other: 'K:PR|V:01|R:845000000040484987' };
  const { api, settings, queue, reply, handled } = setup({ settings: { telegramChatId: 77 }, extra: { decodeQr: async buf => { decoded.push(buf.length); return qrText[buf.toString()] || null; } } });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  const file = (id, name) => reply('getFile', { file_path: 'f/' + id, file_size: 3 });
  const bytes = txt => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(Buffer.from(txt)).buffer });
  queue.getFile = [file('a'), file('b'), file('c')];
  queue.FILE = [bytes('big'), bytes('other'), bytes('big')];
  queue.getUpdates = [reply('getUpdates', [
    upd(110, { photo: [{ file_id: 'p1', file_size: 3, width: 9, height: 9 }] }),
    upd(111, { photo: [{ file_id: 'p2', file_size: 3, width: 9, height: 9 }] }),
    upd(112, { document: { file_id: 'd1', file_name: 'r.pdf', mime_type: 'application/pdf', file_size: 3 } })
  ])];
  await api.pollOnce();
  assert.deepEqual(handled.map(p => p.fiscalUrl || null), ['https://suf.purs.gov.rs/v/?vl=AbC%2B1%3D', null, null]);
  assert.equal(decoded.length, 2); // PDF se ne salje citacu slika
});
