// Testovi za app/qr.js — ZXing (wasm) cita QR iz piksela; slika se pravi u memoriji (qrcode-generator)
const test = require('node:test');
const assert = require('node:assert/strict');
const qrcode = require('../../qrcode-generator.js');
const { createQrReader, decodeRgba } = require('../qr.js');

function qrRgba(text, px = 4, margin = 4) {
  const q = qrcode(0, 'L'); q.addData(text); q.make();
  const n = q.getModuleCount(), size = (n + margin * 2) * px;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.isDark(r, c)) continue;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = (((margin + r) * px + y) * size + (margin + c) * px + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, width: size, height: size };
}

test('qr: ZXing cita gust QR (dug link fiskalnog racuna) iz piksela', async () => {
  const url = 'https://suf.purs.gov.rs/v/?vl=' + 'A'.repeat(600) + '%2B' + 'b'.repeat(200) + '%3D';
  assert.equal(await decodeRgba(qrRgba(url, 3)), url);
});

test('qr: slika bez QR-a i neispravni bajtovi -> null', async () => {
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
  assert.equal(await decodeRgba(blank), null);
  const reader = createQrReader({ toRgba: () => null });
  assert.equal(await reader.decode(Buffer.from([1, 2, 3])), null);
  const throwing = createQrReader({ toRgba: () => { throw new Error('nije slika'); } });
  assert.equal(await throwing.decode(Buffer.from([1])), null);
  const ok = createQrReader({ toRgba: () => qrRgba('https://suf.purs.gov.rs/v/?vl=X1') });
  assert.equal(await ok.decode(Buffer.from([1])), 'https://suf.purs.gov.rs/v/?vl=X1');
});
