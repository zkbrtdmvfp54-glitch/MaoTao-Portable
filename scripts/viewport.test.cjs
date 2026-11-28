const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FULL_VIEWPORT,
  CAT_VIEWPORT,
  viewportFor,
  windowPointToScene,
  scenePointToWindow,
  sceneOriginFromWindow
} = require('../src/main/viewport.js');
const { visiblePeekWidth } = require('../src/main/edge-peek.js');

test('single-cat viewport trims empty margins while keyboard mode keeps the full scene', () => {
  assert.deepEqual(viewportFor(false), CAT_VIEWPORT);
  assert.deepEqual(viewportFor(true), FULL_VIEWPORT);
  assert.equal(CAT_VIEWPORT.width, 180);
  assert.equal(CAT_VIEWPORT.height, 260);
  assert.ok(CAT_VIEWPORT.x > 0 && CAT_VIEWPORT.x + CAT_VIEWPORT.width < FULL_VIEWPORT.width);
  assert.ok(CAT_VIEWPORT.y > 0 && CAT_VIEWPORT.y + CAT_VIEWPORT.height < FULL_VIEWPORT.height);
});

test('compact-window pointer coordinates map back to the full scene in both directions', () => {
  const viewport = CAT_VIEWPORT;
  const bounds = { x: 1000, y: 400, width: 225, height: 375 };
  const scenePoint = { x: 210, y: 170 };
  const windowPoint = scenePointToWindow(scenePoint, bounds, viewport);
  assert.deepEqual(windowPoint, { x: 1112.5, y: 587.5 });
  const mapped = windowPointToScene(windowPoint, bounds, viewport);
  assert.ok(Math.abs(mapped.x - scenePoint.x) < 1e-9);
  assert.ok(Math.abs(mapped.y - scenePoint.y) < 1e-9);
});

test('switching between full and compact views preserves the original scene position', () => {
  const origin = { x: 500, y: 240 };
  const fullBounds = { x: origin.x, y: origin.y, width: 420, height: 340 };
  const compactBounds = { x: origin.x + CAT_VIEWPORT.x, y: origin.y + CAT_VIEWPORT.y, width: 180, height: 260 };
  assert.deepEqual(sceneOriginFromWindow(fullBounds, FULL_VIEWPORT), origin);
  assert.deepEqual(sceneOriginFromWindow(compactBounds, CAT_VIEWPORT), origin);
});

test('compact edge tuck exposes exactly the clipped cat area on either side', () => {
  const bounds = { x: 0, y: 0, width: CAT_VIEWPORT.width, height: CAT_VIEWPORT.height };
  assert.equal(visiblePeekWidth(bounds, 96, CAT_VIEWPORT.width), 96);
});
