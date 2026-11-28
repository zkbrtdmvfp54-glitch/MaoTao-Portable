const fs = require('node:fs');
const path = require('node:path');

function desktopExec(value) {
  const escaped = String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$');
  return `"${escaped}"`;
}

function setAutostart(enabled, {
  app,
  platform = process.platform,
  fsImpl = fs,
  executable = process.execPath,
  appDataPath = app?.getPath?.('appData')
} = {}) {
  if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');

  if (platform === 'linux') {
    if (!appDataPath) throw new Error('Electron appData path is unavailable');
    const directory = path.join(appDataPath, 'autostart');
    const file = path.join(directory, 'maotao-desktop-pet.desktop');
    if (enabled) {
      fsImpl.mkdirSync(directory, { recursive: true });
      const contents = [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=\u6bdb\u6843\u684c\u9762\u5ba0\u7269',
        'Comment=\u6bdb\u6843\u684c\u9762\u5ba0\u7269',
        `Exec=${desktopExec(executable)}`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        ''
      ].join('\n');
      const temporary = file + '.tmp';
      fsImpl.writeFileSync(temporary, contents, 'utf8');
      fsImpl.renameSync(temporary, file);
    } else {
      try {
        fsImpl.unlinkSync(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return true;
  }

  if (platform !== 'win32' && platform !== 'darwin') {
    throw new Error(`Autostart is not supported on ${platform}`);
  }
  if (!app?.setLoginItemSettings || !app?.getLoginItemSettings) {
    throw new Error('Electron login item settings are unavailable');
  }

  const options = { openAtLogin: enabled };
  const query = {};
  if (platform === 'win32') {
    options.path = executable;
    options.args = [];
    query.path = executable;
    query.args = [];
  }
  app.setLoginItemSettings(options);
  if (Boolean(app.getLoginItemSettings(query).openAtLogin) !== enabled) {
    throw new Error('The operating system did not apply the startup setting');
  }
  return true;
}

module.exports = { desktopExec, setAutostart };
