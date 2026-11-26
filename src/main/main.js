const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, net, protocol, session, dialog, powerMonitor, globalShortcut } = require('electron');
const { PetWindow, restrictContents, webOptions } = require('./window');
const { MenuWindow } = require('./menu-window');
const { SettingsStore } = require('./settings');
const { setupTray, buildMenu } = require('./tray');
const pkg = require('../../package.json');

const ORIGIN = 'maotao://app';
const PET_URL = ORIGIN + '/src/renderer/index.html';
const TRY_URL = ORIGIN + '/src/renderer/typing.html';
const MENU_URL = ORIGIN + '/src/renderer/menu.html';
const APP_DIR = path.join(__dirname, '../..');

protocol.registerSchemesAsPrivileged([{ scheme: 'maotao', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true
} }]);
app.setName('MAOTAO Desktop Pet');
app.setAppUserModelId('studio.maotao.desktop.pet');
if (!app.isPackaged && process.env.MAOTAO_DEV_PROFILE) {
  app.setPath('userData', path.resolve(process.env.MAOTAO_DEV_PROFILE));
}
// This local application synthesizes short sounds for explicitly enabled input.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function serveLocal(request) {
  const url = new URL(request.url);
  const resource = url.pathname;
  const segments = resource.split('/').filter(Boolean);
  const rendererResource = /^\/src\/renderer\/[A-Za-z0-9_/.-]+\.(?:html|js|css)$/.test(resource);
  const petResource = /^\/assets\/pet\/(?:manifest\.json|(?:processed|animations)\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:png|svg)|third-party\/7paws\/[A-Za-z0-9_.-]+\.js)$/.test(resource);
  if (request.method !== 'GET' || url.host !== 'app' || (!rendererResource && !petResource) ||
      segments.some(segment => segment === '.' || segment === '..')) {
    return new Response(null, { status: 404 });
  }
  return net.fetch(pathToFileURL(path.join(APP_DIR, ...segments)).href);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let pet, tray, store, hook, typing, menu, menuWin, quitting = false;
  const pomodoro = { phase: 'idle', paused: false, remainingSec: 25 * 60, rounds: 0, timer: null };
  function clearPomodoroTimer() {
    if (pomodoro.timer) { clearInterval(pomodoro.timer); pomodoro.timer = null; }
  }
  function syncPomodoroIdleDuration() {
    if (pomodoro.phase === 'idle') {
      pomodoro.remainingSec = (store?.prefs?.focusMinutes || 25) * 60;
    }
  }
  function startPomodoroTick() {
    clearPomodoroTimer();
    pomodoro.timer = setInterval(() => {
      if (pomodoro.phase === 'idle' || pomodoro.paused) return;
      pomodoro.remainingSec = Math.max(0, pomodoro.remainingSec - 1);
      if (pomodoro.remainingSec <= 0) {
        if (pomodoro.phase === 'focus') {
          pomodoro.rounds += 1;
          pomodoro.phase = 'break';
          pomodoro.remainingSec = (store.prefs.breakMinutes || 5) * 60;
          store.set('focusMode', false);
          pet?.send('pet:preferences', store.prefs);
          pet?.send('pet:action', 'yarn');
        } else {
          pomodoro.phase = 'focus';
          pomodoro.remainingSec = (store.prefs.focusMinutes || 25) * 60;
          store.set('focusMode', true);
          pet?.send('pet:preferences', store.prefs);
        }
      }
      menuWin?.pushState();
    }, 1000);
  }
  function startFocusSession() {
    if (pomodoro.phase === 'idle') {
      pomodoro.phase = 'focus';
      pomodoro.remainingSec = (store.prefs.focusMinutes || 25) * 60;
    }
    pomodoro.paused = false;
    if (store.prefs.standbyMode) store.set('standbyMode', false);
    store.set('focusMode', pomodoro.phase === 'focus');
    startPomodoroTick();
    sendPrefs();
  }
  function pauseFocusSession() {
    if (pomodoro.phase === 'idle') return;
    pomodoro.paused = !pomodoro.paused;
    menuWin?.pushState();
  }
  function skipFocusSession() {
    if (pomodoro.phase === 'idle') return;
    if (pomodoro.phase === 'focus') {
      pomodoro.rounds += 1;
      pomodoro.phase = 'break';
      pomodoro.remainingSec = (store.prefs.breakMinutes || 5) * 60;
      store.set('focusMode', false);
      pet?.send('pet:action', 'yarn');
    } else {
      pomodoro.phase = 'focus';
      pomodoro.remainingSec = (store.prefs.focusMinutes || 25) * 60;
      store.set('focusMode', true);
    }
    pomodoro.paused = false;
    startPomodoroTick();
    sendPrefs();
  }
  function resetFocusSession() {
    clearPomodoroTimer();
    pomodoro.phase = 'idle';
    pomodoro.paused = false;
    pomodoro.remainingSec = (store.prefs.focusMinutes || 25) * 60;
    if (store.prefs.focusMode) store.set('focusMode', false);
    sendPrefs();
  }
  const waylandSession = process.platform === 'linux' && (
    process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
    (Boolean(process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY)
  );
  function inputUnavailableReason() {
    if (!hook) return '当前系统没有可用的原生输入监听模块。';
    if (hook.failed) return '输入监听启动失败；请检查系统权限后重启应用。';
    if (waylandSession) {
      return '当前桌面使用 Wayland，会话安全策略不允许此程序读取其他应用的全局键鼠事件。请登录 X11 会话后再启用。';
    }
    return '';
  }
  const inputReady = () => !inputUnavailableReason();
  function inputFailureDetail() {
    if (process.platform === 'darwin') {
      return 'macOS 阻止了全局输入监听。请在“系统设置 → 隐私与安全性 → 输入监控”中允许 MAOTAO Desktop Pet，然后重启应用。';
    }
    if (process.platform === 'linux') {
      return inputUnavailableReason() || '请确认当前使用 X11 桌面会话，并允许桌面环境访问输入设备。';
    }
    return 'Windows 输入监听启动失败。应用内互动仍可使用。';
  }
  function getMenuState() {
    store.rollover();
    syncPomodoroIdleDuration();
    return {
      prefs: store.prefs,
      stats: store.stats,
      pomodoro: {
        phase: pomodoro.phase,
        paused: pomodoro.paused,
        remainingSec: pomodoro.remainingSec,
        rounds: pomodoro.rounds
      },
      listening: hook?.active ?? false,
      visible: pet?.win?.isVisible() ?? false,
      unavailableReason: inputUnavailableReason(),
      version: pkg.version,
      waylandSession
    };
  }
  function updateMenu() {
    if (!pet || !tray || quitting) return;
    menu = buildMenu(store, actions, hook?.active ?? false, pet.win.isVisible(), inputUnavailableReason());
    menuWin?.pushState();
  }
  function sendPrefs() {
    pet.send('pet:preferences', store.prefs);
    updateMenu();
  }
  function stopInput() {
    const wasActive = hook?.active;
    hook?.stop();
    if (pet) pet.globalInput = false;
    if (wasActive) pet.send('pet:action', 'input-off');
    updateMenu();
  }
  const actions = {
    set(key, value) {
      if (key === 'standbyMode' && value) {
        stopInput();
        if (store.prefs.focusMode) store.set('focusMode', false);
      }
      store.set(key, value);
      if (key === 'focusMinutes') syncPomodoroIdleDuration();
      if (key === 'top') pet.setTopmost(value);
      if (key === 'size' || key === 'scale') pet.place(store.prefs.position ? 'restore' : 'dock');
      if (key === 'clickThrough') pet.pollMouse();
      sendPrefs();
    },
    openMenu() { updateMenu(); menuWin?.showNear(); },
    dock(side) {
      store.set('dock', side);
      store.set('position', null);
      pet.place('dock');
      sendPrefs();
    },
    center() {
      pet.place('center');
      const { x, y } = pet.win.getBounds();
      store.set('position', { x, y });
      pet.show();
    },
    reset() {
      store.set('position', null);
      pet.place('primary');
      pet.show();
    },
    toggle() {
      if (pet.win.isVisible()) pet.hide();
      else pet.show();
    },
    async toggleInput() {
      if (!inputReady() || store.prefs.standbyMode) return;
      if (hook.active) return stopInput();
      if (actions.confirming) return;
      actions.confirming = true;
      try {
        const { response } = await dialog.showMessageBox({
          type: 'question', title: '跨应用输入联动', message: '开启本次跨应用输入联动？',
          detail: '毛桃只用键鼠方向与类别播放动画，不读取或保存输入文字。隐藏宠物、锁屏或退出时自动暂停。' +
            (process.platform === 'darwin' ? '\n首次使用需在 macOS 的“隐私与安全性 → 输入监控”中授权。' : ''),
          buttons: ['暂停', '开启联动'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (response === 1 && pet.win.isVisible() && !quitting && !store.prefs.standbyMode) {
          try {
            hook.start();
            pet.globalInput = true;
            pet.send('pet:action', 'input-on');
          } catch {
            dialog.showErrorBox('联动暂不可用', inputFailureDetail() + ' 应用内互动仍可使用。');
          }
        }
      } finally {
        actions.confirming = false;
        updateMenu();
      }
    },
    perform(action) { pet.show(); pet.send('pet:action', action); },
    typing() {
      pet.show();
      if (typing && !typing.isDestroyed()) return typing.focus();
      typing = new BrowserWindow({ width: 380, height: 178, resizable: false,
        maximizable: false, minimizable: false, autoHideMenuBar: true,
        title: '毛桃 · 中英文试打', webPreferences: webOptions() });
      typing.removeMenu();
      restrictContents(typing);
      typing.loadURL(TRY_URL);
    },
    quit() { app.quit(); }
  };
  function fromWindow(event, win, expected) {
    return win && !win.isDestroyed() && event.sender === win.webContents
      && event.senderFrame === win.webContents.mainFrame && event.senderFrame?.url === expected;
  }
  app.on('second-instance', () => pet?.show());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    clearPomodoroTimer();
    try { globalShortcut.unregisterAll(); } catch {}
    menuWin?.destroy();
    pet?.destroy();
    hook?.stop();
    store?.flush();
    tray?.destroy();
  });
  app.whenReady().then(async () => {
    protocol.handle('maotao', serveLocal);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_request, callback) => callback({ cancel: true }));
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    store = new SettingsStore(app.getPath('userData'));
    pet = new PetWindow(store, visible => {
      if (!visible) stopInput();
      else updateMenu();
    }, actions.quit);
    tray = setupTray(actions);
    menuWin = new MenuWindow(MENU_URL, getMenuState);
    tray.on('right-click', () => { updateMenu(); tray.popUpContextMenu(menu); });
    try {
      const { InputHook } = require('./input-hook');
      hook = new InputHook(
        kind => (kind === 'mouse' ? !pet.ignored : pet.win.isFocused()) || Boolean(typing?.isFocused()),
        input => {
          if (store.prefs.standbyMode) return;
          store.count(input.kind === 'mouse' ? 'clicks' : 'keys');
          pet.send('pet:input', input);
        },
        () => Boolean(store?.prefs?.privacyMode)
      );
    } catch {
      // Native input is optional and the desktop interactions keep working.
    }
    ipcMain.handle('pet:preferences', event =>
      fromWindow(event, pet.win, PET_URL) ? store.prefs : null);
    ipcMain.handle('menu:state', event =>
      fromWindow(event, menuWin?.win, MENU_URL) ? getMenuState() : null);
    ipcMain.on('menu:close', event => {
      if (fromWindow(event, menuWin?.win, MENU_URL)) menuWin.hide();
    });
    ipcMain.on('menu:drag-start', event => {
      if (fromWindow(event, menuWin?.win, MENU_URL)) menuWin.startDrag();
    });
    ipcMain.on('menu:drag-end', event => {
      if (fromWindow(event, menuWin?.win, MENU_URL)) menuWin.endDrag();
    });
    ipcMain.on('menu:command', (event, cmd) => {
      if (!fromWindow(event, menuWin?.win, MENU_URL) || !cmd) return;
      switch (cmd.type) {
        case 'set': actions.set(cmd.key, cmd.value); break;
        case 'dock': actions.dock(cmd.value); break;
        case 'center': actions.center(); break;
        case 'reset': actions.reset(); break;
        case 'toggle': actions.toggle(); break;
        case 'toggleInput': actions.toggleInput(); break;
        case 'perform': actions.perform(cmd.value); break;
        case 'focusStart': startFocusSession(); break;
        case 'focusPause': pauseFocusSession(); break;
        case 'focusSkip': skipFocusSession(); break;
        case 'focusReset': resetFocusSession(); break;
        case 'typing': actions.typing(); break;
        case 'quit': actions.quit(); break;
      }
      menuWin.pushState();
    });
    const petEvents = {
      'pet:mask': mask => pet.setMask(mask),
      'pet:drag-start': point => pet.startDrag(point),
      'pet:drag-end': () => pet.endDrag(),
      'pet:menu': () => { updateMenu(); menuWin.toggleNear(); },
      'pet:focus-complete': () => {
        if (store.prefs.focusMode) {
          store.set('focusMode', false);
          sendPrefs();
        }
      },
      'pet:count': kind => store.count(kind)
    };
    for (const [channel, callback] of Object.entries(petEvents)) {
      ipcMain.on(channel, (event, value) => {
        if (fromWindow(event, pet.win, PET_URL)) callback(value);
      });
    }
    ipcMain.on('try:key', (event, input) => {
      if (!fromWindow(event, typing, TRY_URL) || typeof input?.code !== 'string' ||
          input.code.length > 32 || typeof input.key !== 'string' || input.key.length > 12) return;
      if (store.prefs.standbyMode) return;
      pet.send('pet:input', { kind: 'local', code: input.code, key: input.key });
      store.count('keys');
    });
    for (const event of ['lock-screen', 'suspend', 'shutdown', 'user-did-resign-active']) {
      powerMonitor.on(event, stopInput);
    }
    if (inputReady() && !store.prefs.standbyMode && !hook.active) {
      try {
        hook.start();
        pet.globalInput = true;
      } catch {
        // Gracefully keep local desktop interactions working if OS permission is missing.
      }
    }
    try {
      globalShortcut.register('Alt+Shift+P', () => {
        if (!store || quitting) return;
        actions.set('privacyMode', !store.prefs.privacyMode);
      });
      globalShortcut.register('Alt+Shift+L', () => {
        if (!store || quitting) return;
        actions.set('clickThrough', !store.prefs.clickThrough);
      });
    } catch {
      // Global shortcuts are best-effort if already claimed by another app.
    }
    updateMenu();
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox('毛桃启动失败', '无法启动桌面窗口。');
    app.quit();
  });
}



