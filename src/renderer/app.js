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
let statusTimeout;
function notify(message) {
  status.textContent = message;
  status.classList.add('visible');
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => status.classList.remove('visible'), 1500);
}

async function start() {
  const [assets, prefs] = await Promise.all([loadAssets(), api.getPreferences()]);
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
  const renderer = new PetRenderer(canvas, assets, state, model);
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
    status.dataset.theme = next.theme;
    model?.setPreferences(next);
    state.configure(next);
    if (updateMask) {
      if (model) refreshMask();
      else api.setHitMask(renderer.silhouette());
    }
  };
  configure(prefs);
  api.onPreferences(configure);
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
