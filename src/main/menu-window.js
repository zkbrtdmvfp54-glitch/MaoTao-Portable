const { BrowserWindow, screen } = require('electron');
const { restrictContents, webOptions } = require('./window');

const MENU_W = 372;
const MENU_H = 568;

class MenuWindow {
  constructor(menuUrl, getState) {
    this.menuUrl = menuUrl;
    this.getState = getState;
    this.win = null;
    this.ready = false;
    this.positioned = false;
    this.dragTimer = null;
    this.dragState = null;
  }

  startDrag() {
    if (!this.win || this.win.isDestroyed()) return;
    this.endDrag();
    const cursor = screen.getCursorScreenPoint();
    const bounds = this.win.getBounds();
    this.dragState = { dx: bounds.x - cursor.x, dy: bounds.y - cursor.y, width: bounds.width, height: bounds.height };
    this.dragTimer = setInterval(() => {
      if (!this.dragState || !this.win || this.win.isDestroyed()) return this.endDrag();
      const pt = screen.getCursorScreenPoint();
      const nx = Math.round(pt.x + this.dragState.dx);
      const ny = Math.round(pt.y + this.dragState.dy);
      const cur = this.win.getBounds();
      if (cur.x !== nx || cur.y !== ny) {
        this.win.setBounds({ x: nx, y: ny, width: this.dragState.width, height: this.dragState.height });
      }
    }, 16);
  }

  endDrag() {
    if (this.dragTimer) {
      clearInterval(this.dragTimer);
      this.dragTimer = null;
    }
    this.dragState = null;
  }

  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.ready = false;
    this.positioned = false;
    this.win = new BrowserWindow({
      width: MENU_W,
      height: MENU_H,
      show: false,
      transparent: true,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: '毛桃桌面宠物 · 控制面板',
      webPreferences: webOptions()
    });
    restrictContents(this.win);
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    this.win.webContents.once('did-finish-load', () => {
      this.ready = true;
      this.pushState();
    });
    this.win.on('blur', () => this.endDrag());
    this.win.on('closed', () => {
      this.endDrag();
      this.win = null;
      this.ready = false;
      this.positioned = false;
    });
    this.win.loadURL(this.menuUrl);
    return this.win;
  }

  pushState() {
    if (!this.win || this.win.isDestroyed() || !this.ready) return;
    this.win.webContents.send('menu:state', this.getState());
  }

  positionNear(anchor) {
    const point = anchor || screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const work = display.workArea;
    let x = Math.round(point.x - MENU_W * 0.5);
    let y = Math.round(point.y - MENU_H + 30);
    if (y < work.y + 8) y = Math.round(point.y + 14);
    x = Math.max(work.x + 8, Math.min(x, work.x + work.width - MENU_W - 8));
    y = Math.max(work.y + 8, Math.min(y, work.y + work.height - MENU_H - 8));
    this.win.setBounds({ x, y, width: MENU_W, height: MENU_H });
    this.positioned = true;
  }

  showNear(anchor) {
    const win = this.ensure();
    if (!this.positioned) this.positionNear(anchor);
    this.pushState();
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.show();
    win.focus();
  }

  toggleNear(anchor) {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
      return;
    }
    this.showNear(anchor);
  }

  hide() {
    this.endDrag();
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide();
    }
  }

  destroy() {
    this.endDrag();
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }
}

module.exports = { MenuWindow };
