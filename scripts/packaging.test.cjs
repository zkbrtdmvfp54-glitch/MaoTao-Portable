const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

test('builder configuration names all supported desktop packages', () => {
  const build = pkg.build;
  assert.deepEqual(build.win.target.map(item => item.target), ['portable', 'nsis']);
  assert.deepEqual(build.mac.target.map(item => item.target), ['dmg', 'zip']);
  assert.deepEqual(build.mac.target[0].arch, ['x64', 'arm64']);
  assert.deepEqual(build.linux.target.map(item => item.target), ['AppImage', 'deb']);
  assert.deepEqual(build.linux.target[0].arch, ['x64']);
  assert.deepEqual(build.linux.target[1].arch, ['x64', 'arm64']);
  assert.ok(build.asarUnpack.includes('node_modules/uiohook-napi/prebuilds/**'));
});

test('platform icons retain the supplied transparent mark', () => {
  const processed = path.join(root, 'assets/pet/processed');
  const ico = fs.readFileSync(path.join(processed, 'app.ico'));
  const tray = fs.readFileSync(path.join(processed, 'tray.png'));
  const linux = fs.readFileSync(path.join(processed, 'linux.png'));
  const icns = fs.readFileSync(path.join(processed, 'app.icns'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  for (const png of [tray, linux]) assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(icns.toString('ascii', 0, 4), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  let offset = 8;
  const chunks = new Set();
  while (offset < icns.length) {
    const kind = icns.toString('ascii', offset, offset + 4);
    const size = icns.readUInt32BE(offset + 4);
    assert.ok(size >= 8 && offset + size <= icns.length, `invalid ${kind} chunk size`);
    chunks.add(kind);
    offset += size;
  }
  assert.deepEqual([...chunks], ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']);
});

test('native hook has prebuilt modules for packaged CPU targets', () => {
  for (const target of ['win32-x64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']) {
    assert.ok(fs.existsSync(path.join(root, 'node_modules/uiohook-napi/prebuilds', target, 'uiohook-napi.node')), target);
  }
});

test('petting emits three non-overlapping rising heart bubbles', async () => {
  const { Effects } = await import('../src/renderer/pet/Effects.js');
  const effects = new Effects();
  effects.spawnHeartBubbles(166, 99);
  assert.deepEqual(effects.particles.map(particle => particle.type), ['heart', 'heart', 'heart']);
  assert.deepEqual(effects.particles.map(particle => particle.delay), [0, 0.64, 1.28]);
  assert.ok(effects.particles.every(particle => particle.vy < 0 && particle.color === '#f18aa9'));
  effects.spawnHeartBubbles(166, 99);
  assert.equal(effects.particles.length, 3, 'heart sequences must not stack on a single petting burst');
});

test('focus headset is a minimal two-part flat model with BackSide outline and arched crown', () => {
  const model = fs.readFileSync(path.join(root, 'assets/pet/third-party/7paws/7paws.js'), 'utf8');
  assert.match(model, /headphoneVariants\.push\(makeHeadphoneVariant\('one-piece-over-ear'\)\)/);
  assert.doesNotMatch(model, /makeHeadphoneVariant\('earbuds'\)/);
  assert.doesNotMatch(model, /makeHeadphoneVariant\('on-ear'\)/);
  assert.match(model, /new THREE\.CatmullRomCurve3\(/);
  assert.match(model, /new THREE\.TubeGeometry\(bandCurve,/);
  assert.match(model, /const headsetColor = flat\('#83b29a'\)/);
  assert.match(model, /const headsetOutline = back\('#242326'\)/);
  assert.match(model, /headsetColor\.color\.set\(colors\.color\)/);
  assert.match(model, /name: '珊瑚粉'/);
  assert.match(model, /iry = er/);
  assert.match(model, /pupilRadius, pupilRadius/);
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/pet/PetRenderer.js'), 'utf8');
  assert.match(renderer, /digitW = 14, digitH = 24, thick = 3/);
  assert.match(renderer, /const y = 38/);
});

test('standby is persistent, visible in the common menu, and disables global key animation gates', () => {
  const settings = fs.readFileSync(path.join(root, 'src/main/settings.js'), 'utf8');
  const tray = fs.readFileSync(path.join(root, 'src/main/tray.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const state = fs.readFileSync(path.join(root, 'src/renderer/pet/PetStateMachine.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/pet/SevenPawsRenderer.js'), 'utf8');
  const model = fs.readFileSync(path.join(root, 'assets/pet/third-party/7paws/7paws.js'), 'utf8');
  assert.match(settings, /standbyMode: false/);
  assert.match(tray, /label: '更换花色'/);
  assert.match(tray, /prefs\.standbyMode \? '退出待机' : '进入待机'/);
  assert.match(tray, /label: '外观与窗口'/);
  assert.match(main, /if \(store\.prefs\.standbyMode\) return;/);
  assert.match(state, /key\(keyObj, label, linked = false\)/);
  assert.match(state, /this\.standbyMode \|\| this\.dragging/);
  assert.match(state, /if \(!this\.prefs\.keyboard\) return/);
  assert.match(renderer, /this\.standbyMode \|\| !this\.preferences\.keyboard/);
  assert.match(model, /setStandbyMode\(enabled\)/);
});
