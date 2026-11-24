// Launch the unchanged prototype in Electron while blocking outbound requests.
const { app, BrowserWindow, Menu, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', process.env.MAOTAO_DEV_PROFILE || path.join(require('node:os').tmpdir(), 'maotao-prototype-test'));
app.whenReady().then(async () => {
  const rejected = [];
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (request, callback) => {
    rejected.push(new URL(request.url).host);
    callback({ cancel: true });
  });
  const win = new BrowserWindow({ show: false, width: 860, height: 620 });
  const errors = [];
  win.webContents.on('preload-error', (_event, _script, error) => errors.push(error.message));
  win.webContents.on('console-message', event => {
    if (event.level === 'error' && /Uncaught|SyntaxError/.test(event.message)) errors.push(event.message);
  });
  const target = path.join(__dirname, '../reference/code_artifact.html');
  const source = fs.readFileSync(target, 'utf8');
  new (require('node:vm').Script)(source.split('<script>')[1].split('</script>')[0]);
  await win.loadFile(target);
  const state = await win.webContents.executeJavaScript(`(() => {
    const count = id => document.getElementById(id).textContent;
    const before = Number(count('stat-keys'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
    document.getElementById('btn-view-mode').click();
    document.getElementById('act-poke').click();
    document.getElementById('act-sleep').click();
    return { changed: Number(count('stat-keys')) === before + 1, view: count('view-mode-text'),
      status: count('guide-text'), canvas: document.querySelector('canvas').width };
  })()`);
  assert.deepEqual(errors, []);
  assert.equal(state.changed, true);
  assert.equal(state.view, '镜像左右');
  assert.match(state.status, /瞌睡/);
  assert.ok(state.canvas > 0);
  console.log(JSON.stringify({ state, rejected, errors }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
