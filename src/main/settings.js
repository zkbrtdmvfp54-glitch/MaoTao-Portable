const fs = require('node:fs');
const path = require('node:path');

const defaults = Object.freeze({
  top: true, keyboard: true, sound: true, keySound: true, focusMode: false, standbyMode: false, volume: 0.7,
  size: 'medium', dock: 'right', view: 'cat', keyboardStyle: 'cream', theme: 'cream', coat: 'maotao', eyeColor: 'auto', accessory: 'none', sleepMinutes: 5,
  hideOnClose: true, position: null
});
const choices = {
  size: ['small', 'medium', 'large'],
  dock: ['left', 'right'],
  view: ['cat', 'mirror'],
  keyboardStyle: ['cream', 'matcha', 'sakura', 'obsidian'],
  coat: ['black', 'calico', 'siamese', 'maotao', 'orange', 'ragdoll', 'white', 'solidblack'],
  eyeColor: ['auto', 'blue', 'amber', 'emerald', 'violet', 'rose', 'odd'],
  accessory: ['none', 'crown', 'sprout', 'beret', 'halo'],
  theme: ['cream', 'mint', 'night', 'green'],
  sleepMinutes: [2, 5, 10]
};
function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
}
function validate(key, value) {
  if (choices[key]) return choices[key].includes(value);
  if (typeof defaults[key] === 'boolean') return typeof value === 'boolean';
  if (key === 'volume') return Number.isFinite(value) && value >= 0 && value <= 1;
  if (key === 'position') return value === null || (
    Number.isInteger(value?.x) && Number.isInteger(value?.y)
    && Math.abs(value.x) < 100000 && Math.abs(value.y) < 100000
  );
  return false;
}
class SettingsStore {
  constructor(directory) {
    this.file = path.join(directory, 'preferences.json');
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {};
    } catch {}
    this.prefs = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (validate(key, data.prefs?.[key])) this.prefs[key] = data.prefs[key];
    }
    this.stats = data.stats;
    this.rollover();
  }
  rollover() {
    const date = localDate();
    if (this.stats?.date !== date || !['keys', 'clicks'].every(key =>
      Number.isSafeInteger(this.stats[key]) && this.stats[key] >= 0)) {
      this.stats = { date, keys: 0, clicks: 0 };
    }
  }
  set(key, value) {
    if (!validate(key, value)) return;
    this.prefs[key] = value;
    this.schedule();
  }
  count(key) {
    this.rollover();
    if (key === 'keys' || key === 'clicks') {
      this.stats[key] = Math.min(Number.MAX_SAFE_INTEGER, this.stats[key] + 1);
      this.schedule();
    }
  }
  schedule() {
    this.pending ??= setTimeout(() => this.flush(), 1000);
  }
  flush() {
    clearTimeout(this.pending);
    this.pending = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ prefs: this.prefs, stats: this.stats }, null, 2));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (error) {
      console.error('毛桃设置写入失败', error.code);
    }
  }
}
module.exports = { SettingsStore, localDate };
