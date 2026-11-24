// Check a built launcher or installed executable on an interactive Windows desktop.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const script = path.join(__dirname, 'windows-input.ps1');
function input(action, args = []) {
  return execFileSync('pwsh.exe', ['-NoProfile', '-File', script, '-Action', action, ...args], {
    windowsHide: true, encoding: 'utf8'
  }).trim();
}
const findWindow = () => JSON.parse(input('find', ['-Title', '毛桃桌面宠物']));
const complete = (process, ms) => Promise.race([
  new Promise(resolve => process.once('exit', resolve)),
  wait(ms).then(() => { throw new Error('Packaged process did not exit after the menu command'); })
]);
async function run() {
  const executable = path.resolve(process.argv[2]);
  const profile = process.env.MAOTAO_RELEASE_PROFILE;
  assert.ok(fs.statSync(executable).isFile());
  assert.equal(findWindow(), null, 'Close any previous MAOTAO window first');
  const args = ['--host-resolver-rules=MAP * ~NOTFOUND'];
  if (profile) args.push(`--user-data-dir=${path.resolve(profile)}`);
  const launcher = spawn(executable, args);
  const launchFailed = new Promise((_, reject) => launcher.once('error', reject));
  let bounds;
  const until = Date.now() + 90000;
  while (!bounds && Date.now() < until) {
    bounds = await Promise.race([Promise.resolve(findWindow()), launchFailed]);
    if (bounds) break;
    if (launcher.exitCode !== null) throw new Error('Launcher exited before opening the pet: ' + launcher.exitCode);
    await wait(850);
  }
  assert.ok(bounds?.width > 150 && bounds.width < 1050);
  input('right', ['-X', String(Math.round(bounds.x + bounds.width * 0.47)),
    '-Y', String(Math.round(bounds.y + bounds.height * 0.355))]);
  await wait(390);
  input('exit-menu');
  if (launcher.exitCode === null) assert.equal(await complete(launcher, 12000), 0);
  else assert.equal(launcher.exitCode, 0);
  await wait(300);
  assert.equal(findWindow(), null);
  const remaining = execFileSync('pwsh.exe', ['-NoProfile', '-Command',
    "@(Get-Process -Name MAOTAO -ErrorAction SilentlyContinue).Count"], {
    windowsHide: true, encoding: 'utf8'
  }).trim();
  assert.equal(remaining, '0');
  console.log(JSON.stringify({ executable, ...bounds, menuExit: true, remaining: 0, dnsDisabled: true }));
}
run().catch(error => { console.error(error); process.exitCode = 1; });


