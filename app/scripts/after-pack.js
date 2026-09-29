// Posle pakovanja Mac aplikacije: "ad-hoc" potpis (bez Apple naloga). Na Apple Silicon (M1 i noviji)
// macOS nece da pokrene nepotpisan kod, a Electron-ov originalni potpis se kvari kad se aplikaciji
// promeni ime i Info.plist. Ad-hoc potpis to popravlja; Gatekeeper i dalje trazi da korisnik
// jednom potvrdi otvaranje (vidi docs/mac-instalacija.md).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('Ad-hoc potpisano:', app);
};
