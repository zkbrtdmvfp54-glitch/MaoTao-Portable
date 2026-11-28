const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  if (typeof callback !== 'function') return;
  ipcRenderer.on(channel, (_event, value) => callback(value));
}

contextBridge.exposeInMainWorld('maotao', Object.freeze({
  getPreferences: () => ipcRenderer.invoke('pet:preferences'),
  setHitMask: bytes => {
    if (bytes instanceof Uint8Array && bytes.length === 8925) ipcRenderer.send('pet:mask', bytes);
  },
  dragStart: point => {
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) ipcRenderer.send('pet:drag-start', point);
  },
  dragStartFromEdgePeek: () => ipcRenderer.send('pet:edge-peek-drag-start'),
  edgePeekPress: held => ipcRenderer.send('pet:edge-peek-press', Boolean(held)),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  exitEdgePeek: () => ipcRenderer.send('pet:edge-peek-exit'),
  openMenu: () => ipcRenderer.send('pet:menu'),
  count: kind => {
    if (kind === 'keys' || kind === 'clicks') ipcRenderer.send('pet:count', kind);
  },
  finishFocus: () => ipcRenderer.send('pet:focus-complete'),
  tryKey: (code, key) => {
    if (typeof code === 'string' && code.length <= 32 && typeof key === 'string' && key.length <= 12) {
      ipcRenderer.send('try:key', { code, key });
    }
  },
  getMenuState: () => ipcRenderer.invoke('menu:state'),
  setAutostart: enabled => ipcRenderer.invoke('menu:autostart', Boolean(enabled)),
  onMenuState: callback => on('menu:state', callback),
  menuCommand: cmd => {
    if (cmd && typeof cmd.type === 'string') ipcRenderer.send('menu:command', cmd);
  },
  menuDragStart: () => ipcRenderer.send('menu:drag-start'),
  menuDragEnd: () => ipcRenderer.send('menu:drag-end'),
  closeMenu: () => ipcRenderer.send('menu:close'),
  onPreferences: callback => on('pet:preferences', callback),
  onCursor: callback => on('pet:cursor', callback),
  onDragMove: callback => on('pet:drag-move', callback),
  onEdgePeek: callback => on('pet:edge-peek', callback),
  onInput: callback => on('pet:input', callback),
  onAction: callback => on('pet:action', callback)
}));

