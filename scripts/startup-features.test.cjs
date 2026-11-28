const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../src/main/settings.js');
const { setAutostart } = require('../src/main/autostart.js');
const { edgeSide, peekBounds, visiblePeekWidth, interpolateBounds } = require('../src/main/edge-peek.js');

test('startup and switch sound preferences persist with safe defaults', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maotao-startup-features-'));
  const store = new SettingsStore(directory);
  assert.equal(store.prefs.launchAtStartup, false);
  assert.equal(store.prefs.keySwitch, 'brown');

  store.set('launchAtStartup', true);
  store.set('keySwitch', 'silentRed');
  store.set('keySwitch', 'unknown');
  store.flush();

  const reloaded = new SettingsStore(directory);
  assert.equal(reloaded.prefs.launchAtStartup, true);
  assert.equal(reloaded.prefs.keySwitch, 'silentRed');
});

test('all six common switch profiles have distinct generated sound settings', async () => {
  const { KEY_SWITCH_PROFILES } = await import('../src/renderer/audio/SoundManager.js');
  const profiles = Object.values(KEY_SWITCH_PROFILES);
  assert.equal(profiles.length, 6);
  assert.equal(new Set(profiles.map(profile => JSON.stringify(profile))).size, 6);
});

test('edge tuck geometry supports negative monitor coordinates', () => {
  const workArea = { x: -1080, y: -120, width: 1080, height: 1800 };
  const bounds = { x: -1072, y: 1540, width: 420, height: 340 };
  assert.equal(edgeSide(bounds, workArea), 'left');
  assert.deepEqual(peekBounds(bounds, workArea, 'left'), {
    ...bounds, x: -1280, y: 1340
  });
  assert.deepEqual(interpolateBounds({ x: -1280, y: 1340, width: 420, height: 340 }, bounds, 1), bounds);
});

test('tucked width scales with the pet and remains on its occupied display at every size', () => {
  const workArea = { x: -1080, y: 0, width: 1080, height: 1920 };
  for (const scale of [0.75, 1, 1.25, 1.5]) {
    const bounds = { x: -800, y: 700, width: Math.round(420 * scale), height: Math.round(340 * scale) };
    const visible = visiblePeekWidth(bounds);
    const tuckedRight = peekBounds(bounds, workArea, 'right');
    const tuckedLeft = peekBounds(bounds, workArea, 'left');
    assert.ok(Math.abs(visible / bounds.width - 220 / 420) < 0.005);
    assert.equal(tuckedRight.x + visible, workArea.x + workArea.width);
    assert.equal(tuckedLeft.x + bounds.width - visible, workArea.x);
    assert.equal(tuckedRight.y + bounds.height <= workArea.y + workArea.height, true);
  }
});

test('Windows autostart uses Electron login item settings and verifies the result', () => {
  let configured;
  let queried;
  const app = {
    setLoginItemSettings(value) { configured = value; },
    getLoginItemSettings(query) { queried = query; return { openAtLogin: configured.openAtLogin }; }
  };
  assert.equal(setAutostart(true, { app, platform: 'win32', executable: 'C:\\Apps\\MAOTAO.exe' }), true);
  assert.deepEqual(configured, { openAtLogin: true, path: 'C:\\Apps\\MAOTAO.exe', args: [] });
  assert.deepEqual(queried, { path: 'C:\\Apps\\MAOTAO.exe', args: [] });
});

test('Linux autostart atomically creates and removes its desktop entry', () => {
  const files = new Map();
  const directories = [];
  const fsImpl = {
    mkdirSync(directory, options) { directories.push([directory, options]); },
    writeFileSync(file, contents) { files.set(file, contents); },
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); },
    unlinkSync(file) {
      if (!files.delete(file)) {
        const error = new Error('missing file');
        error.code = 'ENOENT';
        throw error;
      }
    }
  };
  const root = path.join(os.tmpdir(), 'maotao-linux-profile');
  const file = path.join(root, 'autostart', 'maotao-desktop-pet.desktop');
  assert.equal(setAutostart(true, { platform: 'linux', fsImpl, appDataPath: root, executable: '/opt/MAOTAO Desktop Pet.AppImage' }), true);
  assert.deepEqual(directories, [[path.dirname(file), { recursive: true }]]);
  assert.match(files.get(file), /^\[Desktop Entry\]/);
  assert.match(files.get(file), /Exec="\/opt\/MAOTAO Desktop Pet\.AppImage"/);
  assert.equal(setAutostart(false, { platform: 'linux', fsImpl, appDataPath: root }), true);
  assert.equal(files.has(file), false);
});
