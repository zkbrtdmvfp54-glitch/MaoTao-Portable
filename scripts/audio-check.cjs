const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
require('../src/main/main');
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(resolve => {
    if (!win.webContents.isLoading()) resolve();
    else win.webContents.once('did-finish-load', resolve);
  });
  const result = await win.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const { SoundManager } = await import('/src/renderer/audio/SoundManager.js');
    const sound = new SoundManager();
    sound.ensure();
    await sound.ctx.resume();
    const meter = sound.ctx.createAnalyser();
    meter.fftSize = 2048;
    sound.output.connect(meter);
    const samples = new Float32Array(2048);
    async function measure(play) {
      play();
      let peak = 0;
      for (let i = 0; i < 21; i++) {
        await wait(22);
        meter.getFloatTimeDomainData(samples);
        peak = Math.max(peak, ...samples.map(Math.abs));
      }
      return peak;
    }
    await measure(() => sound.playKeyClick());
    await wait(45);
    const audio = {
      key: await measure(() => sound.playKeyClick()),
      mouse: await measure(() => sound.playMouseClick()),
      meow: await measure(() => sound.playMeow()),
      surprised: await measure(() => sound.playMeow('surprised')),
      purr: await measure(() => sound.playPurr())
    };
    sound.configure({ sound: true, keySound: false, volume: 0.7 });
    audio.keyDisabled = await measure(() => sound.playKeyClick());
    sound.configure({ sound: false, keySound: true, volume: 1 });
    audio.muted = await measure(() => sound.playMeow());
    await sound.ctx.close();
    return audio;
  })()`);
  for (const key of ['key', 'mouse', 'meow', 'surprised', 'purr']) assert.ok(result[key] > 0.002, JSON.stringify(result));
  assert.ok(result.keyDisabled < 0.001);
  assert.ok(result.muted < 0.001);
  console.log(JSON.stringify(result));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
