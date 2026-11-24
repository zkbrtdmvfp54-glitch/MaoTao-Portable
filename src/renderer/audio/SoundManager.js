export class SoundManager {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastPurr = -Infinity;
    this.lastKey = -Infinity;
    this.lastMeow = -Infinity;
    this.lastClick = -Infinity;
    this.keyEnabled = true;
    this.volume = 0.7;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.output = this.ctx.createGain();
        this.output.gain.value = this.enabled ? this.volume : 0;
        this.output.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  configure(prefs) {
    this.enabled = prefs.sound;
    this.keyEnabled = prefs.keySound;
    this.volume = prefs.volume;
    if (this.output) this.output.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.012);
  }

  /**
   * 柔和奶油木轴机械键盘音：根据按键左右位置(normX)与行号微调温润音高
   */
  playKeyClick(normX = 0, row = 2, isSpace = false) {
    if (!this.enabled || !this.keyEnabled || performance.now() - this.lastKey < 36) return;
    this.lastKey = performance.now();
    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 左低右高微调，配合轻微自然音高抖动，敲字更有音乐律动感
    const baseFreq = isSpace ? 205 : (265 + normX * 42 + (2 - row) * 14);
    const jitter = 0.96 + Math.random() * 0.08;

    // 1) 温润木质低频 "Thock" 敲击体
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(isSpace ? 78 : 112, now + 0.042);

    gain.gain.setValueAtTime(isSpace ? 0.17 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

    osc.connect(gain).connect(this.output);
    osc.start(now);
    osc.stop(now + 0.052);

    // 2) 奶油轴体轻脆木片高音点缀
    const bufLen = Math.floor(this.ctx.sampleRate * 0.018);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((isSpace ? 1350 : 1950) * jitter, now);
    filter.Q.setValueAtTime(1.9, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.09, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    noise.connect(filter).connect(nGain).connect(this.output);
    noise.start(now);
  }

  /** 轻柔鼠标微动点击声 */
  playMouseClick() {
    if (!this.enabled || performance.now() - this.lastClick < 42) return;
    this.lastClick = performance.now();
    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.018);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain).connect(this.output);
    osc.start(now);
    osc.stop(now + 0.024);
  }

  /** 软萌小猫喵叫声 */
  playMeow(style = 'cute') {
    if (!this.enabled || performance.now() - this.lastMeow < 140) return;
    this.lastMeow = performance.now();
    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.4, now);

    if (style === 'surprised') {
      // 戳鼻子/肚子时的俏皮短促 "喵~!"
      osc1.frequency.setValueAtTime(540, now);
      osc1.frequency.exponentialRampToValueAtTime(980, now + 0.085);
      osc1.frequency.exponentialRampToValueAtTime(720, now + 0.19);
      osc2.frequency.setValueAtTime(1080, now);
      osc2.frequency.exponentialRampToValueAtTime(1480, now + 0.09);

      filter.frequency.setValueAtTime(1300, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.output);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.22);
      osc2.stop(now + 0.22);
    } else {
      // 温柔撒娇长喵
      osc1.frequency.setValueAtTime(560, now);
      osc1.frequency.exponentialRampToValueAtTime(840, now + 0.11);
      osc1.frequency.exponentialRampToValueAtTime(520, now + 0.34);
      osc2.frequency.setValueAtTime(1120, now);
      osc2.frequency.exponentialRampToValueAtTime(1260, now + 0.11);
      osc2.frequency.exponentialRampToValueAtTime(960, now + 0.34);

      filter.frequency.setValueAtTime(1050, now);
      filter.frequency.linearRampToValueAtTime(1600, now + 0.12);
      filter.frequency.linearRampToValueAtTime(900, now + 0.34);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.output);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    }
  }

  /** 抚摸时的轻柔呼噜声 */
  playPurr() {
    if (!this.enabled) return;
    const t = performance.now();
    if (t - this.lastPurr < 360) return;
    this.lastPurr = t;

    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const master = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58, now);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(23, now);
    lfoGain.gain.setValueAtTime(0.036, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190, now);

    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(0.052, now + 0.07);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    lfo.connect(lfoGain).connect(master.gain);
    osc.connect(filter).connect(master).connect(this.output);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.36);
    lfo.stop(now + 0.36);
  }
}
