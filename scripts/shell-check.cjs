const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, powerMonitor, screen } = require('electron');
const { SettingsStore } = require('../src/main/settings');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const nativeInput = (action, ...args) => new Promise((resolve, reject) => {
  const script = path.join(__dirname, 'windows-input.ps1');
  const names = ['-X', '-Y', '-TargetX', '-TargetY'];
  const parameters = args.flatMap((value, index) => [names[index], String(value)]);
  const command = spawn('pwsh.exe', ['-NoProfile', '-File', script, '-Action', action, ...parameters], { windowsHide: true });
  let output = '';
  command.stdout.on('data', chunk => { output += chunk; });
  command.stderr.on('data', chunk => { output += chunk; });
  command.on('error', reject);
  command.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(output)));
});

const trayModule = require('../src/main/tray');
const originalBuildMenu = trayModule.buildMenu;
let actions;
let menu;
trayModule.buildMenu = (store, callbacks, ...args) => {
  actions = callbacks;
  menu = originalBuildMenu(store, callbacks, ...args);
  return menu;
};
let confirmations = 0;
dialog.showMessageBox = async () => { confirmations++; return { response: 1 }; };
dialog.showErrorBox = (title, content) => { throw new Error(title + ': ' + content); };

require('../src/main/main');
app.whenReady().then(async () => {
  const pet = BrowserWindow.getAllWindows()[0];
  assert.ok(pet);
  for (let attempt = 0; attempt < 100 && !pet.isVisible(); attempt++) await wait(50);
  assert.ok(pet.isVisible(), 'pet window did not become visible');
  assert.equal(pet.isAlwaysOnTop(), true, 'pet window should be topmost after startup');
  actions.set('top', false);
  assert.equal(pet.isAlwaysOnTop(), false, 'tray preference should disable topmost');
  actions.set('top', true);
  assert.equal(pet.isAlwaysOnTop(), true, 'tray preference should restore topmost');
  let renderErrors = [];
  pet.webContents.on('console-message', event => {
    if (event.level === 'error') renderErrors.push(event.message);
  });
  const under = new BrowserWindow({ show: false, width: 700, height: 550, frame: false });
  await under.loadURL('data:text/html,<body style="background:lightblue"><script>window.clicks=0;window.keys=0;onpointerdown=()=>window.clicks++;onkeydown=()=>window.keys++</script>');
  const primary = screen.getPrimaryDisplay();
  // The test helper explicitly opts its input thread into per-monitor DPI awareness,
  // so the secondary monitor may use negative virtual-screen coordinates.
  const monitor = screen.getAllDisplays().find(display => display.id !== primary.id && display.workArea.width > 780) ?? primary;
  const anchor = primary.workArea;
  pet.setPosition(anchor.x + 90, anchor.y + 90);
  under.setPosition(anchor.x + 40, anchor.y + 40);
  under.setAlwaysOnTop(true, 'floating');
  under.show();
  pet.moveTop();
  await wait(120);
  assert.equal(under.isFocused(), true);
  assert.equal(pet.isFocused(), false);
  assert.ok(menu.items.some(item => item.label === '退出程序'));
  const evaluate = js => pet.webContents.executeJavaScript(js);
  let sceneReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    sceneReady = await evaluate(`(() => { const c = document.querySelector('#pet'); if (!c || c.width !== 420 || document.querySelectorAll('#pet-scene > canvas').length < 2) return false;
      return c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3] > 0; })()`);
    if (sceneReady) break;
    await wait(50);
  }
  assert.ok(sceneReady, '7paws WebGL 场景未及时绘制');
  const snapshot = async name => {
    if (process.env.MAOTAO_TEST_OUTPUT) {
      const image = await pet.webContents.capturePage();
      await fs.writeFile(path.join(process.env.MAOTAO_TEST_OUTPUT, name), image.toPNG());
    }
  };
  const moreSettings = menu.items.find(item => item.label === '更多设置');
  assert.ok(moreSettings);
  const commonMenu = menu.items.find(item => item.label === '常用');
  assert.ok(commonMenu);
  const commonItems = commonMenu.submenu.items;
  const coatItems = commonItems.find(item => item.label === '更换花色').submenu.items;
  assert.ok(commonItems.some(item => item.label === '进入待机'));
  const appearanceMenu = moreSettings.submenu.items.find(item => item.label === '外观');
  assert.ok(appearanceMenu);
  const coatSamples = [
    ['black', '奶牛猫'], ['calico', '三花猫'],
    ['siamese', '暹罗猫'], ['maotao', '灰白虎斑（毛桃）'],
    ['white', '异瞳白猫'], ['solidblack', '纯黑猫']
  ];
  for (const [coat, label] of coatSamples) {
    actions.set('coat', coat);
    await wait(110);
    assert.equal(await evaluate("document.querySelector('#pet-scene').dataset.coat"), coat);
    await snapshot(`桌面宠物-花色-${label}.png`);
  }
  assert.deepEqual(coatItems.map(item => item.label), ['黑白奶牛猫', '三花猫', '暹罗猫', '灰白虎斑（毛桃）', '异瞳白猫', '纯黑猫']);
  assert.equal(coatItems.length, coatSamples.length);
  actions.set('focusMode', true);
  await wait(180);
  const headphoneStyle = await evaluate("document.querySelector('#pet-scene').dataset.headphoneStyle");
  assert.match(headphoneStyle, /^one-piece-over-ear-/, headphoneStyle);
  await snapshot('桌面宠物-专注耳机.png');
  actions.set('focusMode', false);
  await wait(120);
  const alpha = await evaluate(`(() => {
    const c = document.querySelector('#pet'), ctx = c.getContext('2d');
    const point = (x,y) => ctx.getImageData(x*c.width/420,y*c.height/340,1,1).data[3];
    return [point(5,5), point(198,130), point(248,260)];
  })()`);
  const renderDiagnostics = await evaluate(`({ ready: document.readyState, three: window.THREE?.REVISION,
    createCat: typeof window.createCat, status: document.querySelector('#status')?.textContent,
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ id:c.id, width:c.width, height:c.height,
      rect:[c.getBoundingClientRect().width,c.getBoundingClientRect().height], opacity:getComputedStyle(c).opacity,
      alpha:c.id==='pet' ? c.getContext('2d').getImageData(198*c.width/420,130*c.height/340,1,1).data[3] : null })) })`);
  console.log('RENDER', JSON.stringify({ alpha, renderDiagnostics, renderErrors }));
  await snapshot('桌面宠物-排查.png');
  assert.ok(alpha[0] === 0 && alpha[1] >= 245 && alpha[2] >= 245, JSON.stringify({ alpha, renderErrors }));
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  assert.equal(await evaluate("fetch('https://example.com').then(()=>true,()=>false)"), false);
  await snapshot('桌面宠物-待机.png');
  await evaluate(`window.linkEvents = [];
    window.maotao.onInput(event => linkEvents.push(event));
    window.statusText = () => document.querySelector('#status').textContent; void 0;`);

  const { x, y } = pet.getBounds();
  function point(dx, dy) {
    const current = pet.getBounds();
    const p = screen.dipToScreenPoint({ x: current.x + dx, y: current.y + dy });
    return [p.x, p.y];
  }
  const clicksBefore = await under.webContents.executeJavaScript('clicks');
  const physical = await nativeInput('click', ...point(8, 8));
  await wait(120);
  assert.ok(await under.webContents.executeJavaScript('clicks') > clicksBefore, JSON.stringify({ physical, point:point(8,8), underHWND: String(under.getNativeWindowHandle().readBigUInt64LE()), petHWND: String(pet.getNativeWindowHandle().readBigUInt64LE()), under: under.getBounds(), pet:pet.getBounds() }));
  for (let attempt = 0; attempt < 10 && !under.isFocused(); attempt++) await wait(50);
  assert.equal(under.isFocused(), true);
  await nativeInput('key', 65);
  await wait(90);
  assert.deepEqual(await evaluate('linkEvents'), []);
  await actions.toggleInput();
  assert.equal(confirmations, 1);
  assert.ok(menu.items.some(item => item.label.includes('监听中')));
  await nativeInput('key', 75);
  await wait(110);
  const nativeKeyState = await evaluate("document.querySelector('#pet-scene').dataset.modelState");
  pet.webContents.send('pet:input', { kind: 'key', side: 'right', category: 'key' });
  await wait(110);
  const linkedKeyProbe = await evaluate(`({ state: document.querySelector('#pet-scene').dataset.modelState,
    events: linkEvents.slice(-3), preferences: ${JSON.stringify(new SettingsStore(app.getPath('userData')).prefs)} })`);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', key: 'k' })); void 0;");
  await wait(110);
  const localKeyState = await evaluate("({ state: document.querySelector('#pet-scene').dataset.modelState,
    gate: document.querySelector('#pet-scene').dataset.keyGate })");
  console.log('LINKED_KEY_PROBE', JSON.stringify({ nativeKeyState, linkedKeyProbe, localKeyState }));
  assert.equal(localKeyState.state, 'typing', `local keyboard should animate the cat: ${JSON.stringify({ linkedKeyProbe, localKeyState })}`);
  actions.set('keyboard', false);
  await wait(80);
  await nativeInput('key', 75);
  await wait(100);
  assert.notEqual(await evaluate("document.querySelector('#pet-scene').dataset.modelState"), 'typing',
    'hiding the keyboard must stop the linked typing animation');
  actions.set('keyboard', true);
  await wait(80);
  await snapshot('桌面宠物-敲击.png');
  await evaluate(`document.querySelector('#status')?.classList.remove('visible');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); void 0;`);
  await wait(65);
  await snapshot('桌面宠物-双爪敲击.png');
  const secondClickBaseline = await under.webContents.executeJavaScript('clicks');
  const secondTransparentPoint = point(10, 200);
  const secondTransparentClick = await nativeInput('click', ...secondTransparentPoint);
  await wait(120);
  const secondClickCount = await under.webContents.executeJavaScript('clicks');
  assert.ok(secondClickCount > secondClickBaseline, JSON.stringify({ secondClickBaseline, secondClickCount, secondTransparentPoint, secondTransparentClick, bounds: pet.getBounds() }));
  const received = await evaluate('linkEvents');
  assert.ok(received.some(event => event.kind === 'key' && event.side === 'right'), JSON.stringify(received));
  assert.ok(received.some(event => event.kind === 'mouse'), JSON.stringify(received));
  assert.ok(received.every(event => !('key' in event) && !('code' in event)));
  powerMonitor.emit('lock-screen');
  assert.ok(menu.items.some(item => item.label.includes('已暂停')));
  await nativeInput('key', 65);
  assert.equal((await evaluate('linkEvents')).length, received.length);
  await actions.toggleInput();
  await actions.toggleInput();
  assert.ok(menu.items.some(item => item.label.includes('已暂停')));

  under.setAlwaysOnTop(false);
  pet.moveTop();
  await wait(100);
  const rendererClick = (x, y) => evaluate(`(() => {
    const canvas = document.querySelector('#pet');
    const make = type => {
      const event = new PointerEvent(type, { bubbles:true, button:0, pointerId:91, pointerType:'mouse', clientX:${x}, clientY:${y} });
      Object.defineProperties(event, { offsetX:{ value:${x} }, offsetY:{ value:${y} } });
      canvas.dispatchEvent(event);
    };
    make('pointerdown'); make('pointerup'); return statusText();
  })()`);
  const noseClick = await evaluate(`(() => {
    const canvas = document.querySelector('#pet');
    const [x, y] = document.querySelector('#pet-scene').dataset.nosePoint.split(',').map(Number);
    const make = type => {
      const event = new PointerEvent(type, { bubbles:true, button:0, pointerId:91, pointerType:'mouse', clientX:x, clientY:y });
      Object.defineProperties(event, { offsetX:{ value:x }, offsetY:{ value:y } });
      canvas.dispatchEvent(event);
    };
    make('pointerdown'); make('pointerup');
    return { x, y, status:statusText() };
  })()`);
  assert.match(noseClick.status, /小鼻子/, JSON.stringify(noseClick));
  assert.match(await rendererClick(210, 110), /眯起眼睛/);
  await wait(850);
  await snapshot('桌面宠物-抚摸心形.png');
  const petBounds = pet.getBounds();
  const workArea = screen.getDisplayMatching(petBounds).workArea;
  const safeCursor = [
    { x: workArea.x + 12, y: workArea.y + 12 },
    { x: workArea.x + workArea.width - 12, y: workArea.y + 12 },
    { x: workArea.x + 12, y: workArea.y + workArea.height - 12 },
    { x: workArea.x + workArea.width - 12, y: workArea.y + workArea.height - 12 }
  ].find(({ x, y }) => x < petBounds.x - 40 || x > petBounds.x + petBounds.width + 40
    || y < petBounds.y - 40 || y > petBounds.y + petBounds.height + 40);
  assert.ok(safeCursor, 'could not find a pointer location outside the pet window');
  const safeScreenPoint = screen.dipToScreenPoint(safeCursor);
  await nativeInput('probe', safeScreenPoint.x, safeScreenPoint.y);
  await wait(300);
  pet.webContents.send('pet:action', 'sleep');
  await wait(80);
  const sleepCheck = await evaluate("({ status: statusText(), model: document.querySelector('#pet-scene').dataset.modelState })");
  assert.match(sleepCheck.status, /睡着了/, JSON.stringify(sleepCheck));
  assert.equal(sleepCheck.model, 'sleeping', JSON.stringify(sleepCheck));
  await snapshot('桌面宠物-睡眠.png');
  pet.webContents.send('pet:action', 'sleep');
  await wait(45);
  assert.match(await evaluate('statusText()'), /醒来/);
  actions.set('keyboard', false);
  await wait(160);
  await snapshot('桌面宠物-隐藏键盘.png');
  const removed = await evaluate(`(() => {
    const c = document.querySelector('#pet');
    return c.getContext('2d').getImageData(365*c.width/420, 260*c.height/340, 1, 1).data[3];
  })()`);
  assert.equal(removed, 0);
  actions.set('keyboard', true);
  actions.set('standbyMode', true);
  await wait(120);
  assert.ok(menu.items.find(item => item.label === '常用').submenu.items.some(item => item.label === '退出待机'));
  assert.equal(await evaluate("document.querySelector('#pet-scene').dataset.modelState"), 'idle');
  pet.webContents.send('pet:input', { kind: 'key', side: 'left', category: 'key' });
  await wait(100);
  assert.notEqual(await evaluate("document.querySelector('#pet-scene').dataset.modelState"), 'typing');
  actions.set('standbyMode', false);
  actions.set('sound', false);
  actions.set('coat', 'maotao');
  await wait(120);
  await Promise.all(Array.from({ length: 30 }, (_, i) => new Promise(resolve => setTimeout(() => {
    const category = ['letter', 'number', 'space'][i % 3];
    pet.webContents.send('pet:input', { kind: 'key', side: i % 2 ? 'right' : 'left', category });
    resolve();
  }, i * 42))));
  let angerState;
  for (let attempt = 0; attempt < 28; attempt++) {
    await wait(22);
    angerState = await evaluate(`({ mood: document.querySelector('#pet-scene').dataset.modelState,
      mark: document.querySelector('.anger-mark')?.classList.contains('visible'),
      tailHit: document.querySelector('#pet-scene').dataset.tailHit === 'true' })`);
    if (angerState.mood === 'angry' && angerState.mark && angerState.tailHit) break;
  }
  assert.deepEqual(angerState, { mood: 'angry', mark: true, tailHit: true }, JSON.stringify(angerState));
  await snapshot('桌面宠物-快速打字-生气拍尾.png');

  const clicksBeforeDrag = await under.webContents.executeJavaScript('clicks');
  await nativeInput('drag', ...point(210, 260), ...point(270, 278));
  await wait(1250);
  assert.equal(await under.webContents.executeJavaScript('clicks'), clicksBeforeDrag);
  assert.ok(pet.getBounds().x >= x + 34, JSON.stringify(pet.getBounds()));
  assert.ok(pet.getBounds().y >= y + 15, JSON.stringify(pet.getBounds()));
  const persisted = new SettingsStore(app.getPath('userData'));
  assert.equal(persisted.prefs.sound, false);
  assert.deepEqual(persisted.prefs.position, { x: pet.getBounds().x, y: pet.getBounds().y });
  assert.ok(persisted.stats.keys >= 1);
  assert.equal(persisted.prefs.globalInput, undefined);
  let crossDisplay = 'one display available';
  if (monitor.id !== primary.id) {
    pet.setPosition(monitor.workArea.x + 90, monitor.workArea.y + 90);
    await wait(260);
    const bounds = pet.getBounds();
    assert.equal(screen.getDisplayMatching(bounds).id, monitor.id);
    const start = screen.dipToScreenPoint({ x: bounds.x + 210, y: bounds.y + 260 });
    const end = screen.dipToScreenPoint({ x: primary.workArea.x + 390, y: primary.workArea.y + 500 });
    await nativeInput('drag', start.x, start.y, end.x, end.y);
    await wait(750);
    assert.equal(screen.getDisplayMatching(pet.getBounds()).id, primary.id, JSON.stringify(pet.getBounds()));
    crossDisplay = true;
  }
  pet.close();
  assert.equal(pet.isVisible(), false);
  actions.toggle();
  assert.equal(pet.isVisible(), true);

  const appPids = app.getAppMetrics();
  await wait(2300);
  const cpu = app.getAppMetrics().map(process => ({ type: process.type, percent: Number(process.cpu.percentCPUUsage.toFixed(3)) }));
  const unexpectedRenderErrors = renderErrors.filter(message =>
    !message.includes('https://example.com/') && !message.includes('Fetch API cannot load'));
  assert.deepEqual(unexpectedRenderErrors, []);
  console.log(JSON.stringify({ transparentClick: true, foregroundPreserved: true,
    externalInputDefaultOff: true, optInAndNativeEvents: true, lockPause: true, repeatedToggle: true,
    poke: true, rub: true, sleepWake: true, keyboardToggle: true, mutePersisted: true, drag: true,
    closeHides: true, trayShow: true, rapidTypingAnger: true, tailThump: true, remoteFetchBlocked: true, cpu, appProcessCount: appPids.length, crossDisplay,
    display: screen.getAllDisplays().map(display => ({ id: display.id, scale: display.scaleFactor, workArea: display.workArea })), appVersions: process.versions }));
  menu.items.find(item => item.label === '退出程序').click();
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.once('will-quit', () => setTimeout(() => process.exit(1), 80));
  app.quit();
});















