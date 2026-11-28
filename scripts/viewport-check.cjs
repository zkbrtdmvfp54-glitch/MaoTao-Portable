const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const windowModule = require('../src/main/window');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let petController;
const PetWindow = windowModule.PetWindow;
windowModule.PetWindow = class PetWindowForViewportCheck extends PetWindow {
  constructor(...args) {
    super(...args);
    petController = this;
  }
};

async function waitForViewport(width, leftForScale) {
  const until = Date.now() + 10000;
  let lastResult = null;
  while (Date.now() < until) {
    petController.send('pet:preferences', petController.store.prefs);
    const result = await petController.win.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('#pet-scene')?.getBoundingClientRect();
      const scene = document.querySelector('#pet-scene');
      return rect && { innerWidth, innerHeight, left: rect.left, top: rect.top, width: rect.width, height: rect.height, styled: Boolean(scene.style.width) };
    })()`);
    lastResult = result;
    const scale = result?.innerWidth / width;
    if (result?.styled && Math.abs(result.innerWidth - width) < 2
        && Math.abs(result.left - leftForScale(scale)) < 2) return result;
    await wait(40);
  }
  throw new Error(`renderer did not resize to ${width}px: ${JSON.stringify(lastResult)}`);
}

async function run() {
  const until = Date.now() + 15000;
  while (!petController && Date.now() < until) await wait(50);
  assert.ok(petController, 'pet window was not created');
  const pet = petController.win;
  for (let attempt = 0; attempt < 200 && !pet.isVisible(); attempt++) await wait(50);
  assert.ok(pet.isVisible(), 'pet window is not visible');
  await pet.webContents.executeJavaScript('document.fonts.ready');

  petController.store.set('position', null);
  petController.store.set('keyboard', false);
  petController.place('center');
  petController.send('pet:preferences', petController.store.prefs);
  const compact = await waitForViewport(180, scale => -120 * scale);
  const compactScale = compact.innerWidth / 180;
  assert.ok(Math.abs(compact.innerHeight - 260) < 2, JSON.stringify(compact));
  assert.ok(Math.abs(compact.left + 120 * compactScale) < 2, JSON.stringify(compact));
  assert.ok(Math.abs(compact.top + 40 * compactScale) < 2, JSON.stringify(compact));
  assert.ok(Math.abs(compact.width - 420 * compactScale) < 2, JSON.stringify(compact));
  assert.ok(Math.abs(compact.height - 340 * compactScale) < 2, JSON.stringify(compact));
  if (process.env.MAOTAO_TEST_OUTPUT) {
    fs.mkdirSync(process.env.MAOTAO_TEST_OUTPUT, { recursive: true });
    const image = await pet.webContents.capturePage();
    fs.writeFileSync(path.join(process.env.MAOTAO_TEST_OUTPUT, 'single-cat-viewport.png'), image.toPNG());
  }

  const normalBounds = pet.getBounds();
  const display = require('electron').screen.getDisplayMatching(normalBounds);
  petController.enterEdgePeek(normalBounds, display.workArea, 'right');
  await wait(380);
  const tuckedBounds = pet.getBounds();
  const visible = Math.round(96 * normalBounds.width / 180);
  assert.equal(tuckedBounds.x + visible, display.workArea.x + display.workArea.width);
  assert.equal(petController.edgePeek?.side, 'right');
  const spillPixels = await pet.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#pet');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const boundary = Math.floor(216 * canvas.width / 420);
    const data = context.getImageData(boundary, 0, canvas.width - boundary, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  })()`);
  assert.equal(spillPixels, 0, 'compact tucked mode must not draw into the neighboring display');
  assert.ok([...petController.mask].every((value, index) => index % 105 < 54 || value === 0),
    'compact tucked hit testing must stop at the display seam');
  petController.exitEdgePeek();
  await wait(300);

  petController.store.set('keyboard', true);
  petController.place('center');
  petController.send('pet:preferences', petController.store.prefs);
  const full = await waitForViewport(420, () => 0);
  const fullScale = full.innerWidth / 420;
  assert.ok(Math.abs(full.left) < 1, JSON.stringify(full));
  assert.ok(Math.abs(full.top) < 1, JSON.stringify(full));
  assert.ok(Math.abs(full.width - 420 * fullScale) < 2, JSON.stringify(full));
  assert.ok(Math.abs(full.height - 340 * fullScale) < 2, JSON.stringify(full));

  console.log(JSON.stringify({ compact, full, keyboardAndMouseRemainWithinFullViewport: true }));
}

require('../src/main/main');
app.whenReady().then(run).then(() => app.quit()).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.once('will-quit', () => setTimeout(() => process.exit(1), 80));
  app.quit();
});
