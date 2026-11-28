export const KEY_SWITCH_PROFILES = Object.freeze({
  blue: Object.freeze({ pitch: 1.08, bodyGain: 0.12, bodyEnd: 126, bodyDuration: 0.052, clickGain: 0.145, clickFrequency: 2550, clickQ: 2.5, noiseTail: 0.2 }),
  brown: Object.freeze({ pitch: 1, bodyGain: 0.13, bodyEnd: 112, bodyDuration: 0.048, clickGain: 0.09, clickFrequency: 1950, clickQ: 1.9, noiseTail: 0.25 }),
  red: Object.freeze({ pitch: 0.92, bodyGain: 0.12, bodyEnd: 92, bodyDuration: 0.043, clickGain: 0.045, clickFrequency: 1380, clickQ: 1.35, noiseTail: 0.34 }),
  silentRed: Object.freeze({ pitch: 0.84, bodyGain: 0.075, bodyEnd: 78, bodyDuration: 0.038, clickGain: 0.018, clickFrequency: 920, clickQ: 1.1, noiseTail: 0.45 }),
  silver: Object.freeze({ pitch: 1.22, bodyGain: 0.12, bodyEnd: 142, bodyDuration: 0.038, clickGain: 0.11, clickFrequency: 3150, clickQ: 2.8, noiseTail: 0.16 }),
  starPink: Object.freeze({ pitch: 1.04, bodyGain: 0.11, bodyEnd: 138, bodyDuration: 0.058, clickGain: 0.085, clickFrequency: 2860, clickQ: 2.2, noiseTail: 0.3, sparkle: true })
});

export class SoundManager {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastPurr = -Infinity;
    this.lastKey = -Infinity;
    this.lastMeow = -Infinity;
    this.lastClick = -Infinity;
    this.keyEnabled = true;
    this.keySwitch = 'brown';
    this.volume = 0.7;
    this.handoverAudio = null;
    this.handoverAudioReady = false;
    if (typeof Audio !== 'undefined') {
      try {
        const src = new URL('../../../assets/pet/audio/handover-laowu.mp3', import.meta.url).href;
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.addEventListener('canplaythrough', () => { this.handoverAudioReady = true; }, { once: true });
        this.handoverAudio = audio;
      } catch {}
    }
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
    this.keySwitch = KEY_SWITCH_PROFILES[prefs.keySwitch] ? prefs.keySwitch : 'brown';
    this.volume = prefs.volume;
    if (this.output) this.output.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.012);
  }

  /** 选定键轴的机械声，按键位置会带来轻微音高变化。 */
  playKeyClick(normX = 0, row = 2, isSpace = false) {
    if (!this.enabled || !this.keyEnabled || performance.now() - this.lastKey < 36) return;
    this.lastKey = performance.now();
    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const profile = KEY_SWITCH_PROFILES[this.keySwitch] || KEY_SWITCH_PROFILES.brown;
    const baseFreq = (isSpace ? 205 : (265 + normX * 42 + (2 - row) * 14)) * profile.pitch;
    const jitter = 0.96 + Math.random() * 0.08;

    // 1) Low body. Profiles change pitch, attack weight and decay for each switch family.
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(isSpace ? profile.bodyEnd * 0.72 : profile.bodyEnd, now + profile.bodyDuration);

    gain.gain.setValueAtTime(isSpace ? profile.bodyGain * 1.24 : profile.bodyGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + profile.bodyDuration + 0.006);

    osc.connect(gain).connect(this.output);
    osc.start(now);
    osc.stop(now + profile.bodyDuration + 0.01);

    // 2) Filtered contact noise: crisp for blue/silver, restrained for red and silent red.
    const bufLen = Math.max(1, Math.floor(this.ctx.sampleRate * 0.024));
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * profile.noiseTail));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((isSpace ? profile.clickFrequency * 0.72 : profile.clickFrequency) * jitter, now);
    filter.Q.setValueAtTime(profile.clickQ, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(isSpace ? profile.clickGain * 0.7 : profile.clickGain, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);

    noise.connect(filter).connect(nGain).connect(this.output);
    noise.start(now);

    if (profile.sparkle) {
      const tone = this.ctx.createOscillator();
      const toneGain = this.ctx.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime((isSpace ? 760 : 980 + normX * 90) * jitter, now);
      tone.frequency.exponentialRampToValueAtTime(520, now + 0.085);
      toneGain.gain.setValueAtTime(isSpace ? 0.018 : 0.026, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      tone.connect(toneGain).connect(this.output);
      tone.start(now);
      tone.stop(now + 0.095);
    }
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

  /** 换花色接班时的“老吴老吴老吴”双猫对峙原声音效（带 Web Audio 兜底） */
  playHandoverArgue(role = 'incoming') {
    if (!this.enabled) return;
    if (this.handoverAudio) {
      if (role !== 'incoming') return; // 完整 2.4s 原声已涵盖新猫“老吴老吴老吴”与旧猫回怼
      try {
        this.handoverAudio.pause();
        this.handoverAudio.currentTime = 0;
        this.handoverAudio.volume = Math.max(0, Math.min(1, this.volume));
        const p = this.handoverAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => this._playHandoverSynth(role));
        return;
      } catch {}
    }
    this._playHandoverSynth(role);
  }

  _playHandoverSynth(role = 'incoming') {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.6, now);

    if (role === 'incoming') {
      // 新猫气势十足的连珠炮 "哇呜-哇呜-哇呜!"
      const dur = 0.68;
      osc1.frequency.setValueAtTime(490, now);
      osc1.frequency.exponentialRampToValueAtTime(760, now + 0.14);
      osc1.frequency.exponentialRampToValueAtTime(560, now + 0.34);
      osc1.frequency.exponentialRampToValueAtTime(820, now + 0.50);
      osc1.frequency.exponentialRampToValueAtTime(580, now + dur);

      osc2.frequency.setValueAtTime(980, now);
      osc2.frequency.exponentialRampToValueAtTime(1420, now + 0.16);
      osc2.frequency.exponentialRampToValueAtTime(1120, now + dur);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(11.5, now);
      lfoGain.gain.setValueAtTime(52, now);
      lfo.connect(lfoGain).connect(osc1.frequency);

      filter.frequency.setValueAtTime(1150, now);
      filter.frequency.linearRampToValueAtTime(1750, now + 0.22);
      filter.frequency.linearRampToValueAtTime(1250, now + dur);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.095, now + 0.05);
      gain.gain.setValueAtTime(0.088, now + dur - 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.output);
      osc1.start(now);
      osc2.start(now);
      lfo.start(now);
      osc1.stop(now + dur + 0.03);
      osc2.stop(now + dur + 0.03);
      lfo.stop(now + dur + 0.03);
    } else {
      // 旧猫不服气但逐渐认怂的拖长音 "嗷呜呜~"
      const dur = 0.62;
      osc1.frequency.setValueAtTime(420, now);
      osc1.frequency.exponentialRampToValueAtTime(640, now + 0.15);
      osc1.frequency.exponentialRampToValueAtTime(340, now + dur);

      osc2.frequency.setValueAtTime(840, now);
      osc2.frequency.exponentialRampToValueAtTime(1180, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(680, now + dur);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(8.5, now);
      lfoGain.gain.setValueAtTime(36, now);
      lfo.connect(lfoGain).connect(osc1.frequency);

      filter.frequency.setValueAtTime(980, now);
      filter.frequency.linearRampToValueAtTime(1420, now + 0.16);
      filter.frequency.linearRampToValueAtTime(820, now + dur);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
      gain.gain.setValueAtTime(0.08, now + dur - 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.output);
      osc1.start(now);
      osc2.start(now);
      lfo.start(now);
      osc1.stop(now + dur + 0.03);
      osc2.stop(now + dur + 0.03);
      lfo.stop(now + dur + 0.03);
    }
  }
}
