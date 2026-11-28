const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { app, BrowserWindow, screen } = require('electron');
const windowModule = require('../src/main/window');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const execFileAsync = promisify(execFile);
let petController;
const PetWindow = windowModule.PetWindow;
windowModule.PetWindow = class PetWindowForMonitorCheck extends PetWindow {
  constructor(...args) {
    super(...args);
    petController = this;
  }
};

async function runInputAction(action, point, target) {
  const script = path.join(__dirname, 'windows-input.ps1');
  const args = ['-NoProfile', '-File', script, '-Action', action,
    '-X', String(point.x), '-Y', String(point.y)];
  if (target) args.push('-TargetX', String(target.x), '-TargetY', String(target.y));
  const { stdout } = await execFileAsync('pwsh.exe', args, { windowsHide: true, encoding: 'utf8' });
  return JSON.parse(stdout);
}

const moveCursor = point => runInputAction('probe', point);
const click = point => runInputAction('click', point);
const holdDrag = (from, to) => runInputAction('hold-drag', from, to);

async function run() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find(display => display.id !== primary.id);
  assert.ok(secondary, 'a second display is required for this check');

  const until = Date.now() + 20000;
  let pet;
  while (!pet && Date.now() < until) {
    pet = BrowserWindow.getAllWindows().find(window => window.getTitle() === '毛桃桌面宠物');
    if (!pet) await wait(100);
  }
  assert.ok(pet, 'the pet window did not start');
  for (let attempt = 0; attempt < 100 && !pet.isVisible(); attempt++) await wait(50);
  assert.ok(pet.isVisible(), 'the pet window is not visible');
  assert.ok(petController, 'the pet drag controller was not captured');
  await wait(220);

  const initial = pet.getBounds();
  const fromWindow = {
    x: primary.workArea.x + 90,
    y: primary.workArea.y + 90
  };
  pet.setPosition(fromWindow.x, fromWindow.y);
  await wait(250);
  const startBounds = pet.getBounds();
  const anchor = { x: 210, y: 130 };
  const start = screen.dipToScreenPoint({
    x: startBounds.x + anchor.x,
    y: startBounds.y + anchor.y
  });

  const targetWindow = {
    x: secondary.workArea.x + Math.floor((secondary.workArea.width - startBounds.width) / 2),
    y: secondary.workArea.y + Math.floor((secondary.workArea.height - startBounds.height) / 2)
  };
  const target = screen.dipToScreenPoint({
    x: targetWindow.x + anchor.x,
    y: targetWindow.y + anchor.y
  });
  const startPointer = await moveCursor(start);
  petController.startDrag(anchor);
  await wait(80);
  const targetPointer = await moveCursor(target);
  petController.pollMouse();
  await wait(500);

  const finalBounds = pet.getBounds();
  const finalDisplay = screen.getDisplayMatching(finalBounds);
  assert.equal(finalDisplay.id, secondary.id, JSON.stringify({ start, target, startPointer, targetPointer, cursor: screen.getCursorScreenPoint(), finalBounds, displays }));
  petController.endDrag();

  for (const scale of [0.75, 1, 1.25, 1.5]) {
    petController.store.set('scale', scale);
    petController.place('center');
    await wait(120);
    const normalBounds = pet.getBounds();
    const rightEdgeBounds = {
      ...normalBounds,
      x: secondary.workArea.x + secondary.workArea.width - normalBounds.width
    };
    const pointAt = bounds => screen.dipToScreenPoint({
      x: bounds.x + anchor.x * bounds.width / 420,
      y: bounds.y + anchor.y * bounds.height / 340
    });
    await moveCursor(pointAt(normalBounds));
    petController.startDrag(anchor);
    await wait(50);
    await moveCursor(pointAt(rightEdgeBounds));
    await wait(70);
    petController.endDrag();
    await wait(360);
    assert.equal(petController.edgePeek?.side, 'right', `scale ${scale} should tuck to the occupied display edge: ${JSON.stringify({ normalBounds, rightEdgeBounds, currentBounds: pet.getBounds(), workArea: screen.getDisplayMatching(pet.getBounds()).workArea, cursor: screen.getCursorScreenPoint(), drag: petController.drag })}`);
    const tuckedBounds = pet.getBounds();
    const expectedVisible = Math.round(220 * normalBounds.width / 420);
    assert.equal(tuckedBounds.x + expectedVisible, secondary.workArea.x + secondary.workArea.width,
      `scale ${scale} should preserve the visible edge strip`);
    assert.equal(screen.getDisplayMatching(tuckedBounds).id, secondary.id, `scale ${scale} should remain on the occupied display`);
    petController.startDragFromEdgePeek();
    petController.endDrag();
    await wait(70);
    assert.equal(petController.edgePeek, null, `scale ${scale} should restore before the next size`);
  }

  petController.store.set('scale', 1);
  petController.place('center');
  await wait(120);
  const normalBounds = pet.getBounds();
  const rightEdgeBounds = {
    ...normalBounds,
    x: secondary.workArea.x + secondary.workArea.width - normalBounds.width
  };
  const pointAt = bounds => screen.dipToScreenPoint({
    x: bounds.x + anchor.x * bounds.width / 420,
    y: bounds.y + anchor.y * bounds.height / 340
  });
  await moveCursor(pointAt(normalBounds));
  petController.startDrag(anchor);
  await wait(50);
  await moveCursor(pointAt(rightEdgeBounds));
  await wait(70);
  petController.endDrag();
  await wait(400);
  assert.equal(petController.edgePeek?.side, 'right', 'dragging to the display edge should tuck the cat');
  assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#pet-scene').dataset.edgePeek"), 'right');
  const tuckBounds = pet.getBounds();
  const spillPixels = await pet.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#pet');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const boundary = Math.floor(216 * canvas.width / 420);
    const image = context.getImageData(boundary, 0, canvas.width - boundary, canvas.height).data;
    let count = 0;
    for (let i = 3; i < image.length; i += 4) if (image[i] > 0) count++;
    return count;
  })()`);
  assert.equal(spillPixels, 0, 'the tucked cat must not paint or receive hits on the neighboring display');
  assert.ok([...petController.mask].every((value, index) => index % 105 < 54 || value === 0),
    'the native hit mask must stop at the active display seam');
  if (process.env.MAOTAO_TEST_OUTPUT) {
    const image = await pet.webContents.capturePage();
    require('node:fs').writeFileSync(path.join(process.env.MAOTAO_TEST_OUTPUT, 'edge-peek.png'), image.toPNG());
  }

  let visibleCatPoint = null;
  for (let y = 29; y < 43 && !visibleCatPoint; y++) {
    for (let x = 49; x < 54; x++) {
      if (petController.mask?.[y * 105 + x]) {
        visibleCatPoint = { x: x * 4 + 2, y: y * 4 + 2 };
        break;
      }
    }
  }
  assert.ok(visibleCatPoint, 'the tucked strip has no active native hit-mask cells');
  const clickPoint = screen.dipToScreenPoint({
    x: pet.getBounds().x + visibleCatPoint.x,
    y: pet.getBounds().y + visibleCatPoint.y
  });
  const maskIndex = Math.floor(visibleCatPoint.y / 4) * 105 + Math.floor(visibleCatPoint.x / 4);
  const clickCursorInput = await moveCursor(clickPoint);
  await wait(150);
  petController.pollMouse();
  const cursor = screen.getCursorScreenPoint();
  assert.equal(petController.ignored, false, `native hit testing rejected the visible pet cell: ${JSON.stringify({ clickPoint, clickCursorInput, cursor, visibleCatPoint, maskValue: petController.mask?.[maskIndex], clickThrough: petController.store.prefs.clickThrough, bounds: pet.getBounds(), workAreas: displays.map(display => display.workArea) })}`);
  const clickResult = await click(clickPoint);
  const petHandle = pet.getNativeWindowHandle().readBigUInt64LE();
  assert.equal(BigInt(clickResult.root), petHandle, `tucked cat did not receive click: ${JSON.stringify({ clickResult, visibleCatPoint, bounds: pet.getBounds(), maskValue: petController.mask?.[maskIndex], ignored: petController.ignored })}`);
  await wait(350);
  assert.equal(petController.edgePeek?.side, 'right', 'a short click should keep the cat tucked');
  assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#pet-scene').dataset.edgePeek"), 'right');
  assert.equal(pet.getBounds().x, tuckBounds.x, 'a short click should not move the tucked window');
  const pullTarget = screen.dipToScreenPoint({ x: clickPoint.x - 120, y: clickPoint.y });
  const ignoredBeforeHold = petController.ignored;
  const pullInput = await holdDrag(clickPoint, pullTarget);
  await wait(350);
  assert.equal(petController.edgePeek, null, `a long-press drag should pull the cat out: ${JSON.stringify({ pullInput, ignoredBeforeHold, ignoredAfterHold: petController.ignored, petHandle: pet.getNativeWindowHandle().readBigUInt64LE().toString(), bounds: pet.getBounds(), drag: petController.drag, edgePeek: petController.edgePeek, cursor: screen.getCursorScreenPoint() })}`);
  assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#pet-scene').dataset.edgePeek"), 'none');
  assert.ok(pet.getBounds().x < rightEdgeBounds.x - 25, 'pulling out should move the cat into the occupied display');
  assert.equal(screen.getDisplayMatching(pet.getBounds()).id, secondary.id, 'pull-out should stay on the occupied display');
  console.log(JSON.stringify({
    initial,
    primary: { id: primary.id, workArea: primary.workArea },
    secondary: { id: secondary.id, workArea: secondary.workArea },
    finalBounds,
    finalDisplay: finalDisplay.id,
    crossDisplayDrag: true,
    scalesTuckedOnOccupiedDisplay: [0.75, 1, 1.25, 1.5],
    edgePeek: 'right',
    neighboringDisplaySpillPixels: spillPixels,
    edgePeekClickStaysTucked: true,
    edgePeekLongPressDragOut: true,
    visibleCatPoint
  }));
}

require('../src/main/main');
app.whenReady().then(run).then(() => app.quit()).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.once('will-quit', () => setTimeout(() => process.exit(1), 80));
  app.quit();
});
