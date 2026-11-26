const { uIOhook, UiohookKey } = require('uiohook-napi');

const rightHand = new Set([... 'YUIOPHJKLNM67890'].map(key => UiohookKey[key]));
for (const key of ['BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Enter',
  'Comma', 'Period', 'Slash', 'ShiftRight', 'CtrlRight', 'AltRight', 'MetaRight',
  'Backspace', 'Minus', 'Equal', 'Delete', 'ArrowRight', 'ArrowDown', 'ArrowUp',
  'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) rightHand.add(UiohookKey[key]);
const digits = new Set(Object.entries(UiohookKey)
  .filter(([key]) => /^(?:\d|Numpad\d|F\d+)$/.test(key)).map(([, code]) => code));

const keyCodeTable = new Map();
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  if (UiohookKey[ch] != null) keyCodeTable.set(UiohookKey[ch], { code: `Key${ch}`, label: ch });
}
for (const d of '0123456789') {
  if (UiohookKey[d] != null) keyCodeTable.set(UiohookKey[d], { code: `Digit${d}`, label: d });
  if (UiohookKey[`Numpad${d}`] != null) keyCodeTable.set(UiohookKey[`Numpad${d}`], { code: `Numpad${d}`, label: d });
}
for (const [uKey, code, label] of [
  ['Space', 'Space', 'Space'], ['Enter', 'Enter', '⏎'], ['Backspace', 'Backspace', '⌫'],
  ['Tab', 'Tab', 'Tab'], ['Escape', 'Escape', 'Esc'], ['CapsLock', 'CapsLock', 'Caps'],
  ['Shift', 'ShiftLeft', 'Shift'], ['ShiftRight', 'ShiftRight', 'Shift'],
  ['Ctrl', 'ControlLeft', 'Ctrl'], ['CtrlRight', 'ControlRight', 'Ctrl'],
  ['Alt', 'AltLeft', 'Alt'], ['AltRight', 'AltRight', 'Alt'],
  ['Meta', 'MetaLeft', 'Win'], ['MetaRight', 'MetaRight', 'Win'],
  ['Minus', 'Minus', '-'], ['Equal', 'Equal', '='], ['Backquote', 'Backquote', '`'],
  ['BracketLeft', 'BracketLeft', '['], ['BracketRight', 'BracketRight', ']'], ['Backslash', 'Backslash', '\\'],
  ['Semicolon', 'Semicolon', ';'], ['Quote', 'Quote', "'"],
  ['Comma', 'Comma', ','], ['Period', 'Period', '.'], ['Slash', 'Slash', '/'],
  ['Delete', 'Delete', 'Del'], ['ArrowUp', 'ArrowUp', '↑'], ['ArrowDown', 'ArrowDown', '↓'],
  ['ArrowLeft', 'ArrowLeft', '←'], ['ArrowRight', 'ArrowRight', '→']
]) {
  if (UiohookKey[uKey] != null) keyCodeTable.set(UiohookKey[uKey], { code, label });
}

function classify(keycode) {
  if (keycode === UiohookKey.Space) return { kind: 'key', category: 'space' };
  return {
    kind: 'key',
    category: digits.has(keycode) ? 'number' : 'key',
    side: rightHand.has(keycode) ? 'right' : 'left'
  };
}
function mapLiveKey(keycode) {
  const mapped = keyCodeTable.get(keycode);
  return mapped ? { ...classify(keycode), code: mapped.code, label: mapped.label } : classify(keycode);
}
class InputHook {
  constructor(isLocal, publish, isPrivacy = () => false) {
    this.isLocal = isLocal;
    this.publish = publish;
    this.isPrivacy = isPrivacy;
    this.active = false;
    this.last = new Map();
    this.onKey = event => {
      if (this.active && !isLocal('key')) {
        const payload = this.isPrivacy() ? classify(event.keycode) : mapLiveKey(event.keycode);
        this.emit(payload, 20);
      }
    };
    this.onMouse = event => {
      if (this.active && !isLocal('mouse')) this.emit({
        kind: 'mouse', side: event.button === 2 ? 'right' : 'left'
      }, 45);
    };
  }
  emit(input, interval) {
    const type = input.kind + (input.code ?? ((input.side ?? '') + (input.category ?? '')));
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
