// Citanje QR koda u glavnom procesu (ZXing, wasm) — cita i gust QR fiskalnog racuna sa smanjene slike (Telegram fotografija),
// sto jsQR u stranici ne moze. Radi lokalno, bez mreze. toRgba (bajtovi slike -> pikseli) se ubacuje, pa se testira bez Electron-a.
const fs = require('fs');

let zxing = null;
function zx() {
  if (!zxing) {
    const z = require('zxing-wasm/reader');
    // wasm se daje direktno (u instaliranoj aplikaciji je u app.asar; fetch ga ne bi nasao)
    z.prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) }, fireImmediately: true });
    zxing = z;
  }
  return zxing;
}

async function decodeRgba({ data, width, height }) {
  const pixels = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const res = await zx().readBarcodes({ data: pixels, width, height, colorSpace: 'srgb' },
    { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 });
  const ok = (res || []).find(r => r.isValid && r.text);
  return ok ? ok.text : null;
}

function createQrReader({ toRgba }) {
  return {
    async decode(bytes) {
      try {
        const img = toRgba(Buffer.from(bytes));
        if (!img || !img.width || !img.height) return null;
        return await decodeRgba(img);
      } catch { return null; }
    }
  };
}

module.exports = { createQrReader, decodeRgba };
