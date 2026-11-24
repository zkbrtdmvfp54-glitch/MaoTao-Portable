const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const WIDTH = 420;
const HEIGHT = 340;
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
    spellcheck: false
  };
}

class PetWindow {
  constructor(store, onVisibility, onQuit) {
    Object.assign(this, { store, onVisibility, onQuit });
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
    const saved = this.store.prefs.position;
    const old = this.win.getBounds();
    const screens = screen.getAllDisplays();
    const preferred = mode === 'restore' && saved && { ...old, ...saved };
    const matched = preferred && screens.some(display => {
      const work = display.workArea;
      return preferred.x < work.x + work.width && preferred.x + old.width > work.x
        && preferred.y < work.y + work.height && preferred.y + old.height > work.y;
    });
    const display = matched ? screen.getDisplayMatching(preferred)
      : mode === 'primary' || mode === 'restore' ? screen.getPrimaryDisplay()
        : screen.getDisplayMatching(old);
    const work = display.workArea;
    const scale = Math.min(sizes[this.store.prefs.size], work.width / WIDTH, work.height / HEIGHT);
    const width = Math.round(WIDTH * scale);
    const height = Math.round(HEIGHT * scale);
    const x = mode === 'center' ? work.x + Math.round((work.width - width) / 2)
      : matched ? saved.x : this.store.prefs.dock === 'left' ? work.x + 8 : work.x + work.width - width - 8;
    const y = mode === 'center' ? work.y + Math.round((work.height - height) / 2)
      : matched ? saved.y : work.y + work.height - height - 4;
    this.win.setBounds(fitPosition({ x, y, width, height }, work));
    this.lastPoint = null;
  }
  show() {
    this.win.showInactive();
    this.setTopmost(this.store.prefs.top);
    this.onVisibility(true);
  }
  setTopmost(enabled) {
    const level = enabled ? 'pop-up-menu' : 'normal';
    this.win.setAlwaysOnTop(Boolean(enabled), level);
  }
  hide() {
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
  startDrag(point) {
    if (!this.win.isVisible() || this.drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)
        || point.x < 0 || point.x > WIDTH || point.y < 0 || point.y > HEIGHT) return;
    const bounds = this.win.getBounds();
    const content = this.win.getContentBounds();
    const cursor = { x: content.x + point.x * content.width / WIDTH, y: content.y + point.y * content.height / HEIGHT };
    this.setIgnored(false);
    this.drag = { cursor, bounds };
  }
  endDrag() {
    if (!this.drag) return;
    if (this.win.isVisible()) this.pollMouse();
    this.drag = null;
    const { x, y } = this.win.getBounds();
    this.store.set('position', { x, y });
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
      if (current.x !== next.x || current.y !== next.y) this.win.setBounds(next);
      return;
    }
    const bounds = this.win.getContentBounds();
    const x = (point.x - bounds.x) * WIDTH / bounds.width;
    const y = (point.y - bounds.y) * HEIGHT / bounds.height;
    const inside = x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
    const index = Math.floor(y / 4) * MASK_WIDTH + Math.floor(x / 4);
    this.setIgnored(!inside || !this.mask?.[index]);
    if (this.lastPoint?.x === x && this.lastPoint?.y === y) return;
    this.lastPoint = { x, y };
    const now = Date.now();
    if (now - (this.lastSent ?? 0) < 16) {
      return;
    }
    this.lastSent = now;
    this.send('pet:cursor', { x, y, inside, screenX: point.x, screenY: point.y });
  }
  destroy() {
    this.quitting = true;
    clearInterval(this.timer);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.off(event, this.displayChanged);
    }
  }
}
module.exports = { PetWindow, restrictContents, webOptions, fitPosition };


