const SCENE_WIDTH = 420;
const SCENE_HEIGHT = 340;

const FULL_VIEWPORT = Object.freeze({ x: 0, y: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT });
// The idle cat occupies the center of the original scene. Keep generous room
// for its crown, tail, and small idle motions while removing empty margins.
const CAT_VIEWPORT = Object.freeze({ x: 120, y: 40, width: 180, height: 260 });

function viewportFor(keyboardVisible) {
  return keyboardVisible ? FULL_VIEWPORT : CAT_VIEWPORT;
}

function windowPointToScene(point, bounds, viewport) {
  return {
    x: viewport.x + (point.x - bounds.x) * viewport.width / bounds.width,
    y: viewport.y + (point.y - bounds.y) * viewport.height / bounds.height
  };
}

function scenePointToWindow(point, bounds, viewport) {
  return {
    x: bounds.x + (point.x - viewport.x) * bounds.width / viewport.width,
    y: bounds.y + (point.y - viewport.y) * bounds.height / viewport.height
  };
}

function sceneOriginFromWindow(bounds, viewport) {
  const scale = bounds.width / viewport.width;
  return {
    x: Math.round(bounds.x - viewport.x * scale),
    y: Math.round(bounds.y - viewport.y * scale)
  };
}

module.exports = {
  SCENE_WIDTH,
  SCENE_HEIGHT,
  FULL_VIEWPORT,
  CAT_VIEWPORT,
  viewportFor,
  windowPointToScene,
  scenePointToWindow,
  sceneOriginFromWindow
};
