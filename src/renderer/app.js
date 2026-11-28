import { loadAssets } from './pet/AssetLoader.js';
import { PetRenderer } from './pet/PetRenderer.js';
import { PetStateMachine } from './pet/PetStateMachine.js';
import { Effects } from './pet/Effects.js';
import { KeyboardRenderer } from './interaction/KeyboardRenderer.js';
import { InteractionController } from './interaction/InteractionController.js';
import { SoundManager } from './audio/SoundManager.js';
import { SevenPawsRenderer } from './pet/SevenPawsRenderer.js';

const api = window.maotao;
const status = document.querySelector('#status');
const scene = document.querySelector('#pet-scene');
const SCENE_WIDTH = 420;
const SCENE_HEIGHT = 340;
const CAT_VIEWPORT = { x: 120, y: 40, width: 180, height: 260 };
let activePreferences = null;
let renderer = null;
function applyViewport(prefs) {
  const viewport = prefs.keyboard ? { x: 0, y: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT } : CAT_VIEWPORT;
  const measuredScale = window.innerWidth / viewport.width;
  const scale = measuredScale >= 0.7 && measuredScale <= 1.75
    ? measuredScale
    : Number.isFinite(prefs.scale) ? prefs.scale : 1;
  scene.style.width = `${SCENE_WIDTH * scale}px`;
  scene.style.height = `${SCENE_HEIGHT * scale}px`;
  scene.style.left = `${-viewport.x * scale}px`;
  scene.style.top = `${-viewport.y * scale}px`;
}
window.addEventListener('resize', () => {
  if (!activePreferences) return;
  applyViewport(activePreferences);
  renderer?.scale();
});
let statusTimeout;
function notify(message) {
  status.textContent = message;
  status.classList.add('visible');
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => status.classList.remove('visible'), 1500);
}

async function start() {
  const [assets, prefs] = await Promise.all([loadAssets(), api.getPreferences()]);
  activePreferences = prefs;
  applyViewport(prefs);
  const canvas = document.querySelector('#pet');
  let model = null;
  try {
    model = new SevenPawsRenderer(document.querySelector('#pet-scene'), prefs);
  } catch (error) {
    console.error('7paws 3D 模型启动失败，切换到图片模式', error);
  }
  if (model) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  const keyboard = new KeyboardRenderer(assets.layers.keyboard);
  const state = new PetStateMachine(assets, keyboard, new SoundManager(), new Effects(), notify);
  state.setModel(model);
  state.onFocusComplete = () => api.finishFocus();
  renderer = new PetRenderer(canvas, assets, state, model);
  let maskRevision = 0;
  const refreshMask = () => {
    const revision = ++maskRevision;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (revision !== maskRevision || !model) return;
      const regions = model.regions();
      if (regions[3]) keyboard.setBox(regions[3]);
      api.setHitMask(renderer.silhouette());
    }));
  };
  const configure = next => {
    const updateMask = !renderer.mask || next.keyboard !== state.prefs.keyboard || next.view !== state.prefs.view || next.leftMouse !== state.prefs.leftMouse || next.numpad !== state.prefs.numpad;
    activePreferences = next;
    status.dataset.theme = next.theme;
    applyViewport(next);
    model?.setPreferences(next);
    state.configure(next);
    renderer.scale();
    if (updateMask) {
      if (model) refreshMask();
      else api.setHitMask(renderer.silhouette());
    }
  };
  configure(prefs);
  api.onPreferences(configure);
  api.onEdgePeek?.(() => {
    refreshMask();
    setTimeout(refreshMask, 320);
  });
  new InteractionController(canvas, renderer, state, api);
  window.addEventListener('beforeunload', () => model?.destroy(), { once: true });
  let previous = performance.now();
  let previousToyVisible = model?.toyVisible?.() ?? false;
  let lastToyMaskAt = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    const toyVisible = model?.toyVisible?.() ?? false;
    if (toyVisible !== previousToyVisible || (toyVisible && now - lastToyMaskAt > 200)) {
      previousToyVisible = toyVisible;
      lastToyMaskAt = now;
      refreshMask();
    }
    const elapsed = now - previous;
    if (elapsed < state.frameInterval(now)) return;
    previous = now;
    state.update(Math.min(0.085, elapsed / 1000), now);
    renderer.draw(now);
  }
  renderer.draw(previous);
  requestAnimationFrame(tick);
}
start().catch(error => {
  console.error('宠物素材或界面启动失败', error);
  notify('宠物素材载入失败');
});
