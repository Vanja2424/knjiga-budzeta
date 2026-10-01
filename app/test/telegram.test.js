// Testovi za app/telegram.js — bez Electron-a i bez pravog Telegrama (lazni fetch i safeStorage)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegram } = require('../telegram.js');

const TOKEN = '123456:ABC-secret_token';
function setup({ handle, tick, settings: init } = {}){
  const settings = Object.assign({}, init || {});
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('X' + s), decryptString: b => b.toString().slice(1) };
  const calls = [], queue = {};
  const reply = (method, result, extra) => Object.assign({ ok: true, status: 200, json: async () => ({ ok: true, result }) }, extra || {});
  const fetch = async (url, opts) => {
    const m = /\/bot[^/]+\/(\w+)$/.exec(url) || /\/file\/bot[^/]+\/(.+)$/.exec(url);
    const method = url.includes('/file/bot') ? 'FILE' : m[1];
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, method, body });
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
    T: s => s, now: () => 1000000, sleep: async () => {}, random: () => 0.4821, autoStart: false
  });
  return { api, settings, calls, queue, handled, reply };
}
const upd = (id, msg) => ({ update_id: id, message: Object.assign({ message_id: id, chat: { id: 77 }, from: { id: 77 } }, msg) });

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
  assert.equal(pairCode, '4821');
  queue.getUpdates = [reply('getUpdates', [upd(1, { text: '1111' }), upd(2, { text: ' 4821 ' }), { update_id: 3, message: { message_id: 3, chat: { id: 55 }, text: 'kafa 250' } }])];
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
  assert.equal(handled[0].file.mime, 'image/jpeg');
  assert.ok(handled[0].progressMessageId > 0);
  assert.equal(handled[1].fileError, 'type');
  assert.equal(handled[2].fileError, 'size');
  assert.ok(!calls.some(c => c.method === 'getFile' && c.body.file_id === 'd2'));
});

test('telegram: dugme -> answerCallbackQuery i izmena poruke; 429 i 401; token nije u gresci', async () => {
  const { api, settings, queue, reply, calls } = setup({ settings: { telegramChatId: 77 }, handle: async p => ({ callbackText: 'Sačuvano', replies: [{ editMessageId: p.messageId, text: '✓ Sačuvano' }] }) });
  await api.setToken(TOKEN); settings.telegramChatId = 77;
  queue.getUpdates = [reply('getUpdates', [{ update_id: 30, callback_query: { id: 'cb1', data: 's:abc', message: { message_id: 5, chat: { id: 77 } } } }])];
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
