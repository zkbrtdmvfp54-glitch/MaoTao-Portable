const { uIOhook, UiohookKey } = require('uiohook-napi');

const rightHand = new Set([... 'YUIOPHJKLNM67890'].map(key => UiohookKey[key]));
for (const key of ['BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Enter',
  'Comma', 'Period', 'Slash', 'ShiftRight', 'CtrlRight', 'AltRight', 'MetaRight',
  'Backspace', 'Minus', 'Equal', 'Delete', 'ArrowRight', 'ArrowDown', 'ArrowUp',
  'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) rightHand.add(UiohookKey[key]);
const digits = new Set(Object.entries(UiohookKey)
  .filter(([key]) => /^(?:\d|Numpad\d|F\d+)$/.test(key)).map(([, code]) => code));

function classify(keycode) {
  if (keycode === UiohookKey.Space) return { kind: 'key', category: 'space' };
  return {
    kind: 'key',
    category: digits.has(keycode) ? 'number' : 'key',
    side: rightHand.has(keycode) ? 'right' : 'left'
  };
}
class InputHook {
  constructor(isLocal, publish) {
    this.isLocal = isLocal;
    this.publish = publish;
    this.active = false;
    this.last = new Map();
    this.onKey = event => {
    if (this.active && !isLocal('key')) this.emit(classify(event.keycode), 22);
    };
    this.onMouse = event => {
      if (this.active && !isLocal('mouse')) this.emit({
        kind: 'mouse', side: event.button === 2 ? 'right' : 'left'
      }, 45);
    };
  }
  emit(input, interval) {
    const type = input.kind + (input.side ?? '') + (input.category ?? '');
    const now = performance.now();
    if (now - (this.last.get(type) ?? -Infinity) < interval) return;
    this.last.set(type, now);
    this.publish(input);
  }
  start() {
    if (this.active) return;
    uIOhook.on('keydown', this.onKey);
    uIOhook.on('mousedown', this.onMouse);
    try {
      uIOhook.start();
      this.active = true;
    } catch (error) {
      this.removeListeners();
      this.failed = true;
      throw error;
    }
  }
  removeListeners() {
    uIOhook.off('keydown', this.onKey);
    uIOhook.off('mousedown', this.onMouse);
    this.last.clear();
  }
  stop() {
    if (!this.active) return;
    this.active = false;
    this.removeListeners();
    uIOhook.stop();
  }
}
module.exports = { InputHook, classify };
