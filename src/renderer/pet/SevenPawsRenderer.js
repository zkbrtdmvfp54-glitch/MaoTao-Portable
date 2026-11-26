const WIDTH = 420;
const HEIGHT = 340;

export class SevenPawsRenderer {
  constructor(host, preferences) {
    if (typeof window.createCat !== 'function' || !window.THREE) {
      throw new Error('7paws 的本地 3D 渲染资源未加载');
    }
    this.host = host;
    this.api = window.createCat(host, {
      coat: preferences.coat || 'solidblack',
      eyeColor: preferences.eyeColor || 'auto',
      accessory: preferences.accessory || 'crown',
      accessoryColor: preferences.accessoryColor || 'auto',
      keyboardStyle: preferences.keyboardStyle || 'cream',
      sleepMinutes: preferences.sleepMinutes,
      focusMode: !!preferences.focusMode
    });
    if (!this.api) throw new Error('当前设备未能初始化 WebGL 3D 角色');
    this.canvas = [...host.querySelectorAll('canvas')].find(canvas => canvas.id !== 'pet');
    if (!this.canvas) throw new Error('7paws 没有创建 3D 画布');
    this.keys = new Set();
    this.buttons = new Set();
    this.keyTimers = new Map();
    this.buttonTimers = new Map();
    this.preferences = {};
    this.lastMouseSignal = 0;
    this.setPreferences(preferences);
  }

  setPreferences(preferences) {
    this.preferences = preferences;
    this.standbyMode = Boolean(preferences.standbyMode);
    this.privacyMode = Boolean(preferences.privacyMode);
    this.api.setOptions({
      showKeyboard: !!preferences.keyboard,
      showMouse: !!preferences.keyboard,
      followKeys: !!preferences.keyboard && !this.standbyMode && !this.privacyMode,
      showKeyLabels: false,
      leftMouse: !!preferences.leftMouse,
      coat: preferences.coat || 'solidblack',
      eyeColor: preferences.eyeColor || 'auto',
      accessory: preferences.accessory || 'none',
      accessoryColor: preferences.accessoryColor || 'auto',
      keyboardStyle: preferences.keyboardStyle || 'cream',
      sleepMinutes: preferences.sleepMinutes
    });
    this.api.setLayout(preferences.numpad ? '104' : '65');
    this.api.setFocusMode(!!preferences.focusMode);
    this.api.setStandbyMode?.(this.standbyMode);
    this.host.dataset.coat = preferences.coat || 'solidblack';
    if (!preferences.keyboard) this.clearInput();
  }

  regions() {
    const raw = this.api.hitRegions();
    this.headRegion = raw[0]?.map((value, index) => value * (index % 2 === 0 ? WIDTH : HEIGHT)) ?? null;
    return raw.map(([x, y, width, height]) => [
      x * WIDTH, y * HEIGHT, width * WIDTH, height * HEIGHT
    ]);
  }

  setCursor(x, y) {
    this.api.setPointerNdc(x / WIDTH * 2 - 1, 1 - y / HEIGHT * 2);
  }

  pointerMoved(dx, dy) {
    if (!this.preferences.keyboard) return;
    const now = performance.now();
    if (now - this.lastMouseSignal < 16) return;
    this.lastMouseSignal = now;
    this.api.mouseMoved(dx, dy);
  }

  setFocusMode(enabled) {
    this.api.setFocusMode(Boolean(enabled));
  }

  setDragging(enabled) {
    this.api.setDragging?.(Boolean(enabled));
  }

  dragImpulse(dx, dy) {
    this.api.dragImpulse?.(dx, dy);
  }

  pickToy(x, y) {
    return this.api.pickToy(x, y);
  }

  toyVisible() {
    return this.api.toyVisible();
  }

  playToy() {
    this.api.playToy();
  }

  playButterfly() {
    this.api.playButterfly?.();
  }

  playWash() {
    this.api.playWash?.();
  }

  pickTail(x, y) {
    return this.api.tailAt(x, y);
  }

  tapKey(code) {
    if (this.standbyMode || !this.preferences.keyboard || !/^[A-Za-z0-9]+$/.test(code)) return;
    if (this.privacyMode) {
      this.api.tap(Math.random() < 0.5 ? 'Left' : 'Right');
      return;
    }
    const codes = code === 'Space' ? ['Space', 'Space:second'] : [code];
    const repeated = codes.some(value => this.keys.has(value));
    if (repeated) {
      codes.forEach(value => this.keys.delete(value));
      this.api.setInput(new Set(this.keys), new Set(this.buttons));
    }
    codes.forEach(value => this.keys.add(value));
    this.api.setInput(new Set(this.keys), new Set(this.buttons));
    clearTimeout(this.keyTimers.get(code));
    this.keyTimers.set(code, setTimeout(() => {
      codes.forEach(value => this.keys.delete(value));
      this.keyTimers.delete(code);
      this.api.setInput(new Set(this.keys), new Set(this.buttons));
    }, 115));
  }

  tapMouse(side = 'left') {
    if (this.standbyMode) return;
    this.buttons.add(side);
    this.api.setInput(new Set(this.keys), new Set(this.buttons));
    this.api.setMouseActive();
    clearTimeout(this.buttonTimers.get(side));
    this.buttonTimers.set(side, setTimeout(() => {
      this.buttons.delete(side);
      this.buttonTimers.delete(side);
      this.api.setInput(new Set(this.keys), new Set(this.buttons));
    }, 135));
  }

  trigger(action) {
    if (action === 'sleep') this.api.fastForwardToSleep(false);
    else if (action === 'manual-sleep') this.api.fastForwardToSleep(true);
    else if (action === 'wake') this.api.wakeUp?.();
    else if (action === 'anger') this.api.anger();
    else if (action === 'pet') this.api.petHappy?.(1900);
    else {
      this.api.setMouseActive();
      if (action === 'poke') this.api.tap('Right');
    }
  }

  isSleeping() {
    return Boolean(this.api.isSleeping?.());
  }

  clearInput() {
    for (const timer of this.keyTimers.values()) clearTimeout(timer);
    for (const timer of this.buttonTimers.values()) clearTimeout(timer);
    this.keyTimers.clear();
    this.buttonTimers.clear();
    this.keys.clear();
    this.buttons.clear();
    this.api.clear();
  }

  pickHead(x, y) {
    if (this.api.headSideAt(x, y)) return true;
    const [left, top, width, height] = this.headRegion ?? [];
    return Number.isFinite(left) && x >= left && x <= left + width && y >= top && y <= top + height;
  }

  headTop() {
    return this.api.headTop();
  }

  pickNose(x, y) {
    return this.api.noseAt(x, y);
  }

  draw(context) {
    this.host.dataset.modelState = this.api.state();
    if (this.canvas.width && this.canvas.height) {
      context.drawImage(this.canvas, 0, 0, WIDTH, HEIGHT);
    }
  }

  destroy() {
    this.clearInput();
    this.api.destroy();
  }
}
