const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

copyDir(path.join(ROOT, 'src', 'renderer'), path.join(OUT, 'src', 'renderer'));
copyDir(path.join(ROOT, 'assets', 'pet', 'audio'), path.join(OUT, 'assets', 'pet', 'audio'));
copyDir(path.join(ROOT, 'assets', 'pet', 'processed'), path.join(OUT, 'assets', 'pet', 'processed'));
copyDir(path.join(ROOT, 'assets', 'pet', 'animations'), path.join(OUT, 'assets', 'pet', 'animations'));
copyDir(path.join(ROOT, 'assets', 'pet', 'third-party', '7paws'), path.join(OUT, 'assets', 'pet', 'third-party', '7paws'));

const manifestSrc = path.join(ROOT, 'assets', 'pet', 'manifest.json');
if (fs.existsSync(manifestSrc)) {
  fs.mkdirSync(path.join(OUT, 'assets', 'pet'), { recursive: true });
  fs.copyFileSync(manifestSrc, path.join(OUT, 'assets', 'pet', 'manifest.json'));
}

// Keep dist-web super slim: remove desktop-only icon blobs not needed in WebView
for (const unused of ['app.ico', 'app.icns', 'linux.png']) {
  const p = path.join(OUT, 'assets', 'pet', 'processed', unused);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Sync Tauri desktop & tray icons from assets/pet/processed into src-tauri/icons
const iconDir = path.join(ROOT, 'src-tauri', 'icons');
fs.mkdirSync(iconDir, { recursive: true });
for (const [srcName, dstName] of [
  ['app.ico', 'icon.ico'],
  ['app.icns', 'icon.icns'],
  ['linux.png', 'icon.png'],
  ['tray.png', 'tray.png']
]) {
  const s = path.join(ROOT, 'assets', 'pet', 'processed', srcName);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(iconDir, dstName));
}

console.log('Prepared lightweight Tauri frontend at:', OUT);
