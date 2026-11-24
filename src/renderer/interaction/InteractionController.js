const names = {
  ' ': 'Space', Enter: 'Enter', Backspace: '⌫', Delete: 'Del', Escape: 'Esc',
  Tab: 'Tab', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: '⌘',
  CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
};
function labelFor(key, code) {
  return Object.hasOwn(names, key) ? names[key]
    : /^(Key|Digit)/.test(code) ? code.replace(/^(Key|Digit)/, '')
    : key.length === 1 ? key.toUpperCase() : key.slice(0, 5);
}

export class InteractionController {
  constructor(canvas, renderer, state, api) {
    Object.assign(this, { canvas, renderer, state, api });
    this.lastKey = -Infinity;
    this.rubDistance = 0;
    canvas.addEventListener('pointerdown', event => this.down(event));
    canvas.addEventListener('pointermove', event => this.move(event));
    canvas.addEventListener('pointerup', event => this.up(event, true));
    canvas.addEventListener('lostpointercapture', event => this.up(event, false));
    canvas.addEventListener('pointerleave', () => { this.rub = null; this.rubDistance = 0; });
    canvas.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (renderer.zone(this.point(event)) !== 'none') api.openMenu();
    });
    window.addEventListener('keydown', event => this.keydown(event));
    api.onCursor(point => {
      // The main process sends cursor position only. This is independent of the
      // opt-in keyboard hook and lets the cat track the cursor across the desktop.
      state.cursor(point.x, point.y, true);
    });
    api.onInput(input => this.input(input));
    api.onAction(action => {
      if (action === 'input-on') this.globalInput = true;
      if (action === 'input-off') this.globalInput = false;
      state.perform(action);
    });
  }
  point(event) {
    return { x: event.offsetX * 420 / this.canvas.clientWidth, y: event.offsetY * 340 / this.canvas.clientHeight };
  }
  down(event) {
    if (event.button !== 0 || this.pointer) return;
    const point = this.point(event);
    const zone = this.renderer.zone(point);
    if (zone === 'none') return;
    this.api.count('clicks');
    if (zone === 'toy') return this.state.playToy();
    if (zone === 'mouse') return this.state.mouse(true);
    if (zone === 'nose') return this.state.poked('nose');
    if (zone === 'head') return this.state.pet(true);
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = { zone, point, id: event.pointerId, dragging: false };

  }
  beginDrag() {
    this.pointer.dragging = true;
    this.state.dragging = true;
    this.state.clearPaws();
    this.canvas.style.cursor = 'grabbing';
    this.api.dragStart(this.pointer.point);
  }
  move(event) {
    const point = this.point(event);
    if (this.pointer?.dragging) return;
    if (this.pointer) {
      const start = this.pointer.point;
      if (Math.hypot(point.x - start.x, point.y - start.y) > 7) this.beginDrag();
      return;
    }
    const zone = this.renderer.zone(point);
    this.canvas.style.cursor = zone === 'desk' || zone === 'mouse' ? 'grab' : zone === 'none' ? 'default' : 'pointer';
    this.state.cursor(point.x, point.y, zone === 'mouse');
    if (zone === 'head') {
      if (this.rub) this.rubDistance += Math.hypot(this.rub.x - point.x, this.rub.y - point.y);
      if (this.rubDistance >= 26) {
        this.state.pet(false);
        this.rubDistance = 0;
      }
      this.rub = point;
    } else {
      this.rub = null;
      this.rubDistance = 0;
    }
  }
  up(event, clicked) {
    if (this.pointer?.id !== event.pointerId) return;
    const { zone, dragging } = this.pointer;
    this.pointer = null;
    if (dragging) this.api.dragEnd();
    else if (clicked && zone === 'body') this.state.poked('belly');
    else if (clicked && zone === 'tail') this.state.poked('tail');
    this.state.dragging = false;
    this.state.lastActivity = performance.now();
    this.canvas.style.cursor = 'default';
  }
  keydown(event) {
    if (this.state.standbyMode) return;
    const now = performance.now();
    if (event.repeat && now - this.lastKey < 28) return;
    if ((event.isComposing || event.key === 'Process') && !event.code.startsWith('Key')) return;
    this.lastKey = now;
    this.api.count('keys');
    this.input({ kind: 'local', code: event.code, key: event.key });
  }
  input(input) {
    if (this.state.standbyMode) return;
    const kb = this.state.keyboard;
    if (input.kind === 'mouse') return this.state.mouse(true, input.side);
    if (input.kind === 'local') return this.state.key(
      kb.resolveKey(input.code, input.key), labelFor(input.key, input.code)
    );
    // Generic targets avoid revealing the physical key in another application.
    const code = input.category === 'space' ? 'Space'
      : input.category === 'number' ? input.side === 'left' ? 'Digit3' : 'Digit8'
      : input.side === 'left' ? 'KeyD' : 'KeyK';
    this.state.key(kb.resolveKey(code), null, true);
  }
}

