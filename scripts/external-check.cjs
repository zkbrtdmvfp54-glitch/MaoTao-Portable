const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, dialog, screen } = require('electron');
const tray = require('../src/main/tray');
let actions;
const menu = tray.buildMenu;
tray.buildMenu = (store, callbacks, ...rest) => {
  actions = callbacks;
  return menu(store, callbacks, ...rest);
};
dialog.showMessageBox = async () => ({ response: 1 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureTitle = 'MAOTAO external input fixture';
const finish = () => {
  foreign?.kill();
  app.quit();
};
let foreign;

require('../src/main/main');
app.whenReady().then(async () => {
  const pet = BrowserWindow.getAllWindows()[0];
  await wait(700);
  const profile = await fs.mkdtemp(path.join(process.env.MAOTAO_DEV_PROFILE || os.tmpdir(), 'maotao-foreign-'));
  const statePath = path.join(profile, 'counts.json');
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find(item => item.id !== primary.id) ?? primary;
  const { x, y } = display.workArea;
  const [left, top] = [x + Math.min(260, Math.max(60, display.workArea.width - 400)), y + 480];
  const physical = screen.dipToScreenPoint({ x: left, y: top });
  foreign = spawn('pwsh.exe', ['-NoProfile', '-STA', '-File', path.join(__dirname, 'foreground-fixture.ps1'),
    '-StatePath', statePath, '-Left', String(physical.x), '-Top', String(physical.y)],
  { stdio: 'ignore', windowsHide: true });
  const counts = () => fs.readFile(statePath, 'utf8').then(JSON.parse);
  for (let i = 0; i < 50; i++) {
    try { await counts(); break; } catch { await wait(160); }
  }
  assert.notEqual((await counts()).pid, process.pid);
  const evaluate = script => pet.webContents.executeJavaScript(script);
  await evaluate('window.coarseEvents=[]; maotao.onInput(event=>coarseEvents.push(event)); void 0;');
  const script = path.join(__dirname, 'windows-input.ps1');
  const native = (action, x = 0, y = 0, title, processId) => execFileSync('pwsh.exe',
    ['-NoProfile', '-File', script, '-Action', action, '-X', String(x), '-Y', String(y),
      ...(title ? ['-Title', title] : []), ...(processId ? ['-ProcessId', String(processId)] : [])],
    { windowsHide: true, encoding: 'utf8' }).trim();
  const fixture = JSON.parse(native('find-title', 0, 0, fixtureTitle));
  if (!fixture?.visible || !fixture.title.includes(fixtureTitle)) {
    console.log(JSON.stringify({ externalWinForms: 'skipped', reason: 'The dedicated WinForms test fixture is not visible.' }));
    finish();
    return;
  }
  const clickPoint = [fixture.x + 85, fixture.y + 90];
  const hit = JSON.parse(native('probe', ...clickPoint));
  if (!hit.class.includes(fixtureTitle)) {
    console.log(JSON.stringify({ externalWinForms: 'skipped', reason: 'A safe hit test did not identify the dedicated test fixture; no input was sent.', hit }));
    finish();
    return;
  }
  // A real input click is sent only after WindowFromPoint identifies our uniquely titled fixture.
  native('click', ...clickPoint);
  await wait(140);
  const foreground = JSON.parse(native('foreground', 0, 0));
  if (!foreground.includes(fixtureTitle)) {
    console.log(JSON.stringify({ externalWinForms: 'skipped', reason: 'Windows did not activate the dedicated test fixture after its safe click.', foreground }));
    finish();
    return;
  }
  const beforeKey = (await counts()).keys;
  const beforeClick = (await counts()).clicks;
  native('click', fixture.x + 100, fixture.y + 105);
  await wait(110);
  native('key', 65);
  await wait(110);
  assert.ok((await counts()).keys > beforeKey);
  assert.deepEqual(await evaluate('coarseEvents'), []);
  await actions.toggleInput();
  native('key', 75);
  native('click', physical.x + 100, physical.y + 105);
  await wait(180);
  const events = await evaluate('coarseEvents');
  const linkedModelState = await evaluate("document.querySelector('#pet-scene').dataset.modelState");
  assert.ok(events.some(event => event.kind === 'key' && event.side === 'right'), JSON.stringify(events));
  assert.equal(linkedModelState, 'typing', `global key input should drive the 3D typing motion (state=${linkedModelState})`);
  assert.ok(events.some(event => event.kind === 'mouse'));
  assert.ok((await counts()).keys >= beforeKey + 2);
  assert.ok((await counts()).clicks >= beforeClick + 2);
  assert.equal(pet.isFocused(), false);
  actions.set('keyboard', false);
  native('key', 75);
  await wait(140);
  assert.notEqual(await evaluate("document.querySelector('#pet-scene').dataset.modelState"), 'typing',
    'hiding the keyboard should block linked paw strikes');
  actions.set('keyboard', true);
  await actions.toggleInput();
  native('key', 65);
  await wait(110);
  assert.ok((await counts()).keys >= beforeKey + 3);
  assert.equal((await evaluate('coarseEvents')).length, events.length);
  console.log(JSON.stringify({ externalWinForms: true, receivedKeys: 3, receivedClicks: 2,
    defaultOff: true, nativeLink: true, paused: true, foregroundPreserved: true }));
  finish();
}).catch(error => {
  finish();
  console.error(error);
  app.exit(1);
});
