const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { edgeSide, peekBounds, interpolateBounds, visiblePeekWidth } = require('./edge-peek');
const { SCENE_WIDTH, SCENE_HEIGHT, viewportFor, windowPointToScene, scenePointToWindow, sceneOriginFromWindow } = require('./viewport');

const WIDTH = SCENE_WIDTH;
const HEIGHT = SCENE_HEIGHT;
const MASK_WIDTH = 105;
const MASK_HEIGHT = 85;
const sizes = { small: 0.76, medium: 1, large: 1.26 };

function fitPosition(bounds, work) {
  return {
    x: Math.max(work.x, Math.min(bounds.x, work.x + work.width - bounds.width)),
    y: Math.max(work.y, Math.min(bounds.y, work.y + work.height - bounds.height)),
    width: bounds.width,
    height: bounds.height
  };
}
function restrictContents(win) {
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
function webOptions() {
  return {
    preload: path.join(__dirname, '../preload/preload.js'),
    contextIsolation: true, sandbox: true, nodeIntegration: false,
    spellcheck: false, backgroundThrottling: false
  };
}

class PetWindow {
  constructor(store, onVisibility, onQuit) {
    Object.assign(this, { store, onVisibility, onQuit });
    this.edgePeek = null;
    this.edgePeekPressHeld = false;
    this.win = new BrowserWindow({
      show: false, transparent: true, frame: false, resizable: false,
      skipTaskbar: true, hasShadow: false, fullscreenable: false,
      backgroundColor: '#00000000', title: '毛桃桌面宠物',
      webPreferences: webOptions()
    });
    restrictContents(this.win);
    this.place('restore');
    this.setIgnored(true);
    this.win.once('ready-to-show', () => this.show());
    this.win.on('close', event => {
      if (this.quitting) return;
      event.preventDefault();
      if (this.store.prefs.hideOnClose) this.hide();
      else onQuit();
    });
    this.win.on('blur', () => this.endDrag());
    this.win.on('hide', () => this.endDrag());
    this.win.on('closed', () => clearInterval(this.timer));
    this.win.loadURL('maotao://app/src/renderer/index.html');
    this.timer = setInterval(() => this.pollMouse(), 16);
    this.displayChanged = () => this.place('restore');
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(event, this.displayChanged);
    }
  }
  place(mode) {
    if (this.edgePeek) this.exitEdgePeek();
    const saved = this.store.prefs.position;
    const viewport = viewportFor(this.store.prefs.keyboard);
    this.viewport = viewport;
    const rawScale = Number.isFinite(this.store.prefs.scale) ? this.store.prefs.scale : (sizes[this.store.prefs.size] || 1);
    const old = this.win.getBounds();
    const screens = screen.getAllDisplays();
    const preferred = mode === 'restore' && saved && {
      x: saved.x + viewport.x * rawScale,
      y: saved.y + viewport.y * rawScale,
      width: viewport.width * rawScale,
      height: viewport.height * rawScale
    };
    const matched = preferred && screens.some(display => {
      const work = display.workArea;
      return preferred.x < work.x + work.width && preferred.x + preferred.width > work.x
        && preferred.y < work.y + work.height && preferred.y + preferred.height > work.y;
    });
    const display = matched ? screen.getDisplayMatching(preferred)
      : mode === 'primary' || mode === 'restore' ? screen.getPrimaryDisplay()
        : screen.getDisplayMatching(old);
    const work = display.workArea;
    const scale = Math.min(rawScale, work.width / WIDTH, work.height / HEIGHT);
    const width = Math.round(viewport.width * scale);
    const height = Math.round(viewport.height * scale);
    const x = mode === 'center' ? work.x + Math.round((work.width - width) / 2)
      : matched ? saved.x + viewport.x * scale : this.store.prefs.dock === 'left' ? work.x + 8 : work.x + work.width - width - 8;
    const y = mode === 'center' ? work.y + Math.round((work.height - height) / 2)
      : matched ? saved.y + viewport.y * scale : work.y + work.height - height - 4;
    this.win.setBounds(fitPosition({ x, y, width, height }, work));
    this.lastPoint = null;
  }
  show() {
    if (this.edgePeek) this.exitEdgePeek();
    this.win.showInactive();
    this.setTopmost(this.store.prefs.top);
    this.onVisibility(true);
  }
  setTopmost(enabled) {
    const level = enabled ? 'pop-up-menu' : 'normal';
    this.win.setAlwaysOnTop(Boolean(enabled), level);
  }
  hide() {
    if (this.edgePeek) this.exitEdgePeek();
    this.win.hide();
    this.setIgnored(true);
    this.onVisibility(false);
  }
  send(channel, value) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, value);
  }
  setIgnored(ignored) {
    if (this.ignored === ignored || this.win.isDestroyed()) return;
    this.ignored = ignored;
    this.win.setIgnoreMouseEvents(ignored);
  }
  setMask(mask) {
    if (!(mask instanceof Uint8Array) || mask.length !== MASK_WIDTH * MASK_HEIGHT) return;
    this.mask = mask;
    this.pollMouse();
  }
  sceneOrigin() {
    return sceneOriginFromWindow(this.win.getBounds(), this.viewport || viewportFor(this.store.prefs.keyboard));
  }
  startDrag(point) {
    if (!this.win.isVisible() || this.drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)
        || point.x < 0 || point.x > WIDTH || point.y < 0 || point.y > HEIGHT) return;
    const content = this.win.getContentBounds();
    const viewport = this.viewport || viewportFor(this.store.prefs.keyboard);
    if (point.x < viewport.x || point.x > viewport.x + viewport.width || point.y < viewport.y || point.y > viewport.y + viewport.height) return;
    const cursor = scenePointToWindow(point, content, viewport);
    const bounds = this.win.getBounds();
    this.setIgnored(false);
    this.drag = { cursor, bounds, fromEdgePeek: false };
  }
  startDragFromEdgePeek() {
    const peek = this.edgePeek;
    if (!peek || this.drag || !this.win.isVisible() || this.win.isDestroyed()) return false;
    const bounds = { ...peek.normalBounds };
    const cursor = screen.getCursorScreenPoint();
    this.edgePeek = null;
    this.edgePeekPressHeld = false;
    this.win.setBounds(bounds);
    this.setIgnored(false);
    this.lastPoint = null;
    this.drag = { cursor, bounds, fromEdgePeek: true };
    this.send('pet:edge-peek', null);
    return true;
  }
  setEdgePeekPress(held) {
    if (!this.edgePeek) return;
    this.edgePeekPressHeld = held;
    if (held) this.setIgnored(false);
    else this.pollMouse();
  }
  endDrag() {
    if (!this.drag) return;
    const drag = this.drag;
    this.edgePeekPressHeld = false;
    if (this.win.isVisible()) this.pollMouse();
    this.drag = null;
    const bounds = this.win.getBounds();
    this.store.set('position', this.sceneOrigin());
    if (drag.fromEdgePeek) {
      const cursor = screen.getCursorScreenPoint();
      if (Math.hypot(cursor.x - drag.cursor.x, cursor.y - drag.cursor.y) < 20) return;
    }
    const display = screen.getDisplayMatching(bounds);
    const side = edgeSide(bounds, display.workArea);
    if (side) this.enterEdgePeek(bounds, display.workArea, side);
  }
  enterEdgePeek(bounds, workArea, side) {
    this.edgePeek = { side, normalBounds: { ...bounds }, workArea: { ...workArea } };
    this.send('pet:edge-peek', side);
    const viewport = this.viewport || viewportFor(this.store.prefs.keyboard);
    const visibleBase = viewport.x === 0 && viewport.width === WIDTH
      ? 220
      : side === 'right' ? Math.max(1, 216 - viewport.x) : Math.max(1, viewport.x + viewport.width - 204);
    this.animateBounds(peekBounds(bounds, workArea, side, visiblePeekWidth(bounds, visibleBase, viewport.width)));
  }
  animateBounds(target) {
    if (this.win.isDestroyed()) return;
    const from = this.win.getBounds();
    const start = Date.now();
    const duration = 240;
    const step = () => {
      if (!this.edgePeek || this.win.isDestroyed()) return;
      const progress = Math.min(1, (Date.now() - start) / duration);
      this.win.setBounds(interpolateBounds(from, target, progress));
      if (progress < 1) setTimeout(step, 16);
      else this.lastPoint = null;
    };
    step();
  }
  exitEdgePeek() {
    const peek = this.edgePeek;
    if (!peek) return false;
    this.edgePeek = null;
    if (!this.win.isDestroyed()) {
      this.win.setBounds(peek.normalBounds);
      this.setIgnored(false);
      this.lastPoint = null;
      this.send('pet:edge-peek', null);
      this.pollMouse();
    }
    return true;
  }
  pollMouse() {
    if (!this.win.isVisible()) return;
    const point = screen.getCursorScreenPoint();
    if (this.drag) {
      const { cursor, bounds } = this.drag;
      const display = screen.getDisplayNearestPoint(point);
      const next = fitPosition({
        ...bounds, x: Math.round(bounds.x + point.x - cursor.x), y: Math.round(bounds.y + point.y - cursor.y)
      }, display.workArea);
      const current = this.win.getBounds();
      if (current.x !== next.x || current.y !== next.y) {
        this.win.setBounds(next);
        this.send('pet:drag-move', { dx: next.x - current.x, dy: next.y - current.y });
      }
      return;
    }
    if (this.edgePeekPressHeld && this.edgePeek) return;
    const bounds = this.win.getContentBounds();
    const viewport = this.viewport || viewportFor(this.store.prefs.keyboard);
    const { x, y } = windowPointToScene(point, bounds, viewport);
    const localX = point.x - bounds.x;
    const localY = point.y - bounds.y;
    const inside = localX >= 0 && localX < bounds.width && localY >= 0 && localY < bounds.height;
    let onOccupiedDisplay = true;
    if (this.edgePeek) {
      const { side, workArea } = this.edgePeek;
      const boundary = side === 'right'
        ? workArea.x + workArea.width - bounds.x
        : workArea.x - bounds.x;
      const logicalBoundary = viewport.x + boundary * viewport.width / bounds.width;
      onOccupiedDisplay = side === 'right' ? x < logicalBoundary : x >= logicalBoundary;
    }
    const index = Math.floor(y / 4) * MASK_WIDTH + Math.floor(x / 4);
    const insidePet = inside && onOccupiedDisplay;
    this.setIgnored(Boolean(this.store.prefs.clickThrough) || !insidePet || !this.mask?.[index]);
    if (this.lastPoint?.x === x && this.lastPoint?.y === y) return;
    this.lastPoint = { x, y };
    const now = Date.now();
    if (now - (this.lastSent ?? 0) < 16) {
      return;
    }
    this.lastSent = now;
    this.send('pet:cursor', { x, y, inside: insidePet, screenX: point.x, screenY: point.y });
  }
  destroy() {
    if (this.edgePeek) this.exitEdgePeek();
    this.quitting = true;
    clearInterval(this.timer);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.off(event, this.displayChanged);
    }
  }
}
module.exports = { PetWindow, restrictContents, webOptions, fitPosition };


