const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { localDate, SettingsStore } = require('../src/main/settings.js');
const { classify } = require('../src/main/input-hook.js');
const { UiohookKey } = require('uiohook-napi');
const assets = require('../assets/pet/manifest.json');

test('the original keyboard mapping retains five rows, reverse layout and top-row space', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const kb = new KeyboardRenderer(assets.layers.keyboard);
  assert.equal(new Set(kb.keys.map(key => key.row)).size, 5);
  assert.equal(kb.resolveKey('Space').row, 0);
  assert.equal(kb.resolveKey('Space').cap.space, true);
  assert.ok(kb.resolveKey('Space').cy < kb.resolveKey('KeyZ').cy);
  assert.ok(kb.resolveKey('Space').cap.w > kb.resolveKey('KeyZ').cap.w * 4);
  assert.ok(kb.resolveKey('KeyQ').cx > kb.resolveKey('KeyP').cx);
  kb.setMode('mirror');
  assert.ok(kb.resolveKey('KeyQ').cx < kb.resolveKey('KeyP').cx);
  assert.equal(kb.resolveKey('F12').id, 'Equal');
  assert.equal(kb.resolveKey('', '猫').row >= 1, true);
});

test('both original paw sprites can strike a key, with single or two-paw space', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { PetStateMachine } = await import('../src/renderer/pet/PetStateMachine.js');
  const { Effects } = await import('../src/renderer/pet/Effects.js');
  const kb = new KeyboardRenderer(assets.layers.keyboard);
  const effects = new Effects();
  const state = new PetStateMachine(assets, kb, { configure() {}, playKeyClick() {} }, effects, () => {});
  const prefs = { keyboard: true, view: 'cat', sleepMinutes: 2 };
  state.configure(prefs);
  state.key(kb.resolveKey('Space'), 'Space');
  assert.equal(state.leftPaw.timer, 0);
  assert.equal(state.rightPaw.timer, 1);
  state.key(kb.resolveKey('Space'), null);
  assert.equal(state.leftPaw.timer, 1);
  assert.equal(state.rightPaw.timer, 1);
  for (let i = 0; i < 7; i++) state.update(0.017, performance.now());
  const target = kb.resolveKey('Space');
  assert.ok(Math.abs(state.rightPaw.x - target.cx - 16) < 4);
  assert.ok(Math.abs(state.rightPaw.y - target.cy) < 6);
  assert.equal(effects.floatingLetters.length, 1);
  state.configure({ ...prefs, keyboard: false });
  state.key(kb.resolveKey('Space'), 'Space');
  assert.equal(state.leftPaw.timer, 0, 'hiding the keyboard disables typing animation');
  assert.equal(state.rightPaw.timer, 0);
  assert.equal(effects.floatingLetters.length, 0);
  state.lastActivity = 0;
  state.update(0.05, 121000);
  assert.equal(state.sleeping, true);
  state.key(target, null);
  assert.equal(state.sleeping, false);
});

test('linked keystrokes animate through petting and stay blocked in standby', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { PetStateMachine } = await import('../src/renderer/pet/PetStateMachine.js');
  const { Effects } = await import('../src/renderer/pet/Effects.js');
  const keyboard = new KeyboardRenderer(assets.layers.keyboard);
  const effects = new Effects();
  const pressed = [];
  const state = new PetStateMachine(assets, keyboard, {
    configure() {}, playKeyClick() {}
  }, effects, () => {});
  state.setModel({ tapKey: code => pressed.push(code), setStandbyMode() {} });
  state.configure({ keyboard: true, view: 'cat', sleepMinutes: 5, standbyMode: false });
  state.petEnergy = 1;
  state.poke = 0.5;
  state.key(keyboard.resolveKey('KeyD'), null, true);
  assert.deepEqual(pressed, ['KeyD']);
  assert.ok(state.leftPaw.timer > 0 || state.rightPaw.timer > 0);
  assert.ok(effects.keyRipples.length > 0);
  assert.equal(effects.floatingLetters.length, 1);
  assert.match(effects.floatingLetters[0].label, /^[A-Z]$/);
  for (let i = 0; i < 6; i++) state.key(keyboard.resolveKey(i % 2 ? 'KeyK' : 'KeyD'), null, true);
  assert.equal(effects.floatingLetters.length, 7);
  for (let i = 0; i < 40; i++) effects.update(0.05, performance.now());
  assert.equal(effects.floatingLetters.length, 0, 'floating letters must auto-clean after duration');
  state.configure({ keyboard: true, view: 'cat', sleepMinutes: 5, standbyMode: true });
  const before = [...pressed];
  state.key(keyboard.resolveKey('KeyD'), null, true);
  assert.deepEqual(pressed, before);
  assert.equal(state.leftPaw.timer, 0);
  assert.equal(state.rightPaw.timer, 0);
  assert.equal(effects.floatingLetters.length, 0);
});

test('hiding the keyboard blocks linked typing too', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { PetStateMachine } = await import('../src/renderer/pet/PetStateMachine.js');
  const { Effects } = await import('../src/renderer/pet/Effects.js');
  const keyboard = new KeyboardRenderer(assets.layers.keyboard);
  const effects = new Effects();
  const pressed = [];
  const state = new PetStateMachine(assets, keyboard, {
    configure() {}, playKeyClick() {}
  }, effects, () => {});
  state.setModel({ tapKey: code => pressed.push(code) });
  state.configure({ keyboard: false, view: 'cat', sleepMinutes: 5, standbyMode: false });
  state.key(keyboard.resolveKey('KeyD'), null, true);
  assert.deepEqual(pressed, []);
  assert.equal(state.leftPaw.timer, 0);
  assert.equal(state.rightPaw.timer, 0);
  assert.equal(effects.keyRipples.length, 0);
});

test('cross-application key categories route to generic keys without text labels', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { InteractionController } = await import('../src/renderer/interaction/InteractionController.js');
  const keyboard = new KeyboardRenderer(assets.layers.keyboard);
  const calls = [];
  const controller = Object.create(InteractionController.prototype);
  controller.state = { keyboard, standbyMode: false, key: (...args) => calls.push(args) };
  controller.input({ kind: 'key', category: 'key', side: 'left' });
  assert.equal(calls[0][0].id, 'KeyD');
  assert.equal(calls[0][1], null);
  assert.equal(calls[0][2], true);
  controller.state.standbyMode = true;
  controller.input({ kind: 'key', category: 'space' });
  assert.equal(calls.length, 1);
});

test('stationary cursor updates do not wake a sleeping cat; real movement does', async () => {
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { PetStateMachine } = await import('../src/renderer/pet/PetStateMachine.js');
  const keyboard = new KeyboardRenderer(assets.layers.keyboard);
  const state = new PetStateMachine(assets, keyboard, { configure() {} }, { configure() {}, update() {} }, () => {});
  let cursorMoves = 0;
  state.setModel({ setCursor() {}, pointerMoved() { cursorMoves++; }, trigger() {} });
  state.configure({ keyboard: true, view: 'cat', sleepMinutes: 5 });
  state.cursor(160, 110, true);
  state.setSleep();
  state.cursor(160, 110, true);
  assert.equal(state.sleeping, true);
  assert.equal(cursorMoves, 0);
  state.cursor(164, 112, true);
  assert.equal(state.sleeping, false);
  assert.equal(cursorMoves, 1);
});

test('global inputs export only coarse side and category', () => {
  assert.deepEqual(classify(UiohookKey.A), classify(UiohookKey.S));
  assert.deepEqual(classify(UiohookKey.K), { kind: 'key', side: 'right', category: 'key' });
  assert.deepEqual(classify(UiohookKey.Space), { kind: 'key', category: 'space' });
});

test('preferences survive reloading while stats reset on the local date', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maotao-settings-'));
  const store = new SettingsStore(directory);
  store.set('volume', 0.25);
  store.set('coat', 'siamese');
  store.set('coat', 'not-a-coat');
  store.set('position', { x: -105, y: 20 });
  store.set('globalInput', true);
  store.count('keys');
  store.flush();
  const readback = new SettingsStore(directory);
  assert.equal(readback.prefs.volume, 0.25);
  assert.equal(readback.prefs.coat, 'siamese');
  assert.deepEqual(readback.prefs.position, { x: -105, y: 20 });
  assert.equal(readback.prefs.globalInput, undefined);
  assert.equal(readback.stats.keys, 1);
  readback.stats.date = '2020-01-01';
  readback.count('clicks');
  assert.deepEqual(readback.stats, { date: localDate(), clicks: 1, keys: 0 });
  readback.flush();
  const legacyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'maotao-legacy-settings-'));
  fs.writeFileSync(path.join(legacyDirectory, 'preferences.json'), JSON.stringify({ prefs: { coat: 'maotao' } }));
  assert.equal(new SettingsStore(legacyDirectory).prefs.coat, 'maotao');
  fs.writeFileSync(readback.file, '{broken');
  assert.equal(new SettingsStore(directory).prefs.size, 'medium');
});

test('coat switch triggers handover animation, argue sounds, and full-fps rendering', async () => {
  const { PetStateMachine } = await import('../src/renderer/pet/PetStateMachine.js');
  const { KeyboardRenderer } = await import('../src/renderer/interaction/KeyboardRenderer.js');
  const { SevenPawsRenderer } = await import('../src/renderer/pet/SevenPawsRenderer.js');

  const handovers = [];
  let stageCb = null;
  let active = false;
  const fakeCanvas = { id: '3d-canvas', width: 420, height: 340 };
  const fakeHost = { dataset: {}, querySelectorAll: () => [fakeCanvas] };
  global.window = {
    THREE: {},
    createCat: () => ({
      setOptions() {},
      setLayout() {},
      setFocusMode() {},
      setStandbyMode() {},
      clear() {},
      switchCoatWithHandover(coatId) { handovers.push(coatId); active = true; return true; },
      isHandoverActive() { return active; },
      setOnHandoverStage(cb) { stageCb = cb; }
    })
  };
  try {
    const renderer = new SevenPawsRenderer(fakeHost, { coat: 'siamese', keyboard: true });
    assert.deepEqual(handovers, []);
    renderer.setPreferences({ coat: 'siamese', keyboard: true });
    assert.deepEqual(handovers, []);
    renderer.setPreferences({ coat: 'solidblack', keyboard: true });
    assert.deepEqual(handovers, ['solidblack']);

    const argueRoles = [];
    const sound = {
      configure() {}, playKeyClick() {}, playMouseClick() {}, playMeow() {}, playPurr() {},
      playHandoverArgue(role) { argueRoles.push(role); }
    };
    const effects = {
      theme: 'cream', floatingLetters: [], keyRipples: [], mouseClicks: [],
      addKeyRipple() {}, spawnParticle() {}, update() {}
    };
    const machine = new PetStateMachine(assets, new KeyboardRenderer(assets.layers.keyboard), sound, effects, () => {});
    machine.setModel(renderer);
    assert.equal(typeof stageCb, 'function');
    stageCb('argue-in');
    stageCb('argue-out');
    assert.deepEqual(argueRoles, ['incoming', 'outgoing']);
    const idleNow = machine.lastVisual + 5000;
    assert.equal(machine.frameInterval(idleNow), 15);
    active = false;
    assert.ok(machine.frameInterval(idleNow) > 15);
  } finally {
    delete global.window;
  }
});


