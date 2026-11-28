(() => {
  if (window.maotao || !window.__TAURI__) return;
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  function on(channel, callback) {
    if (typeof callback !== 'function') return;
    listen(channel, event => callback(event.payload));
  }

  window.maotao = Object.freeze({
    getPreferences: () => invoke('pet_get_preferences'),
    setHitMask: bytes => {
      if (bytes instanceof Uint8Array && bytes.length === 8925) {
        invoke('pet_set_mask', { mask: Array.from(bytes) }).catch(() => {});
      }
    },
    dragStart: point => {
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
        invoke('pet_drag_start', { point }).catch(() => {});
      }
    },
    dragStartFromEdgePeek: () => { invoke('pet_drag_start_from_edge_peek').catch(() => {}); },
    edgePeekPress: held => { invoke('pet_edge_peek_press', { held: Boolean(held) }).catch(() => {}); },
    dragEnd: () => { invoke('pet_drag_end').catch(() => {}); },
    exitEdgePeek: () => { invoke('pet_exit_edge_peek').catch(() => {}); },
    openMenu: () => { invoke('pet_open_menu').catch(() => {}); },
    count: kind => {
      if (kind === 'keys' || kind === 'clicks') {
        invoke('pet_count', { kind }).catch(() => {});
      }
    },
    finishFocus: () => { invoke('pet_finish_focus').catch(() => {}); },
    tryKey: (code, key) => {
      if (typeof code === 'string' && code.length <= 32 && typeof key === 'string' && key.length <= 12) {
        invoke('try_key', { input: { code, key } }).catch(() => {});
      }
    },
    getMenuState: () => invoke('menu_get_state'),
    setAutostart: enabled => invoke('menu_set_autostart', { enabled: Boolean(enabled) }),
    onMenuState: callback => on('menu:state', callback),
    menuCommand: cmd => {
      if (cmd && typeof cmd.type === 'string') {
        invoke('menu_command', { cmd }).catch(() => {});
      }
    },
    menuDragStart: () => { invoke('menu_drag_start').catch(() => {}); },
    menuDragEnd: () => { invoke('menu_drag_end').catch(() => {}); },
    closeMenu: () => { invoke('menu_close').catch(() => {}); },
    onPreferences: callback => on('pet:preferences', callback),
    onCursor: callback => on('pet:cursor', callback),
    onDragMove: callback => on('pet:drag-move', callback),
    onEdgePeek: callback => on('pet:edge-peek', callback),
    onInput: callback => on('pet:input', callback),
    onAction: callback => on('pet:action', callback)
  });
})();
