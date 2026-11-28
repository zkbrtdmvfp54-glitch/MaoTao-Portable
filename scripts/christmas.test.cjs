const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('illustrated Christmas backdrop can be toggled and ships in both app and website builds', () => {
  const model = read('assets/pet/third-party/7paws/7paws.js');
  const renderer = read('src/renderer/pet/SevenPawsRenderer.js');
  const appStyle = read('src/renderer/style.css');
  const site = read('docs/index.html');
  const settings = read('src/main/settings.js');
  const tray = read('src/main/tray.js');
  const rustSettings = read('src-tauri/src/settings.rs');
  const nativeTray = read('src-tauri/src/tray.rs');
  const backdropPath = path.join(root, 'assets/pet/third-party/7paws/christmas-scene.png');
  const websiteBackdropPath = path.join(root, 'docs/demo/christmas-scene.png');
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  assert.match(model, /christmasSceneImage\.className = 'christmas-scene-backdrop'/);
  assert.match(model, /new URL\('\.\/christmas-scene\.png', sceneScriptUrl\)/);
  assert.match(model, /christmasDecorVisible = options\.christmasDecor !== false/);
  assert.match(model, /christmasSceneImage\.hidden = !christmasDecorVisible/);
  assert.match(model, /christmasDecorVisible\(\) \{ return christmasDecorVisible; \}/);
  assert.doesNotMatch(model, /christmas-rug|rugSnowflake/);
  assert.deepEqual(fs.readFileSync(backdropPath).subarray(0, 8), pngSignature);
  assert.deepEqual(fs.readFileSync(websiteBackdropPath), fs.readFileSync(backdropPath));
  assert.match(appStyle, /\.christmas-scene-backdrop/);
  assert.match(site, /\.christmas-scene-backdrop/);
  assert.equal((renderer.match(/christmasDecor: preferences\.christmasDecor !== false/g) || []).length, 2);
  assert.match(settings, /christmasDecor: true/);
  assert.match(tray, /toggle\('圣诞场景', 'christmasDecor'\)/);
  assert.match(rustSettings, /pub christmas_decor: bool/);
  assert.match(rustSettings, /christmas_decor: true/);
  assert.match(rustSettings, /"christmasDecor" => value\.as_bool\(\)/);
  assert.match(nativeTray, /"toggle:christmasDecor"/);
});

test('GitHub Pages demo serves the same Christmas-enabled model as the desktop app', () => {
  assert.equal(
    read('docs/demo/7paws.js'),
    read('assets/pet/third-party/7paws/7paws.js')
  );
  assert.match(read('docs/index.html'), /\.\/demo\/7paws\.js/);
});
