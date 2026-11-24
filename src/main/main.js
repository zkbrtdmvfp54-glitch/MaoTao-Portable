const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, net, protocol, session, dialog, powerMonitor } = require('electron');
const { PetWindow, restrictContents, webOptions } = require('./window');
const { SettingsStore } = require('./settings');
const { setupTray, buildMenu } = require('./tray');

const ORIGIN = 'maotao://app';
const PET_URL = ORIGIN + '/src/renderer/index.html';
const TRY_URL = ORIGIN + '/src/renderer/typing.html';
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
  let pet, tray, store, hook, typing, menu, quitting = false;
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
  function updateMenu() {
    if (!pet || !tray || quitting) return;
    menu = buildMenu(store, actions, hook?.active ?? false, pet.win.isVisible(), inputUnavailableReason());

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
      if (key === 'top') pet.setTopmost(value);
      if (key === 'size') pet.place(store.prefs.position ? 'restore' : 'dock');
      sendPrefs();
    },
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
    tray.on('right-click', () => { updateMenu(); tray.popUpContextMenu(menu); });
    try {
      const { InputHook } = require('./input-hook');
      hook = new InputHook(kind => (kind === 'mouse' ? !pet.ignored : pet.win.isFocused()) || Boolean(typing?.isFocused()), input => {
        if (store.prefs.standbyMode) return;
        store.count(input.kind === 'mouse' ? 'clicks' : 'keys');
        pet.send('pet:input', input);
      });
    } catch {
      // Native input is optional and the desktop interactions keep working.
    }
    ipcMain.handle('pet:preferences', event =>
      fromWindow(event, pet.win, PET_URL) ? store.prefs : null);
    const petEvents = {
      'pet:mask': mask => pet.setMask(mask),
      'pet:drag-start': point => pet.startDrag(point),
      'pet:drag-end': () => pet.endDrag(),
      'pet:menu': () => { updateMenu(); menu?.popup({ window: pet.win }); },
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
    updateMenu();
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox('毛桃启动失败', '无法启动桌面窗口。');
    app.quit();
  });
}



