import { clamp, lerp, smoothstep } from '../geometry.js';

export class Effects {
  constructor() {
    this.particles = [];
    this.floatingLetters = [];
    this.keyRipples = [];
    this.theme = 'cream';
    this.heartSequenceUntil = 0;
  }

  spawnParticle(type, x, y, opts = {}) {
    if (this.particles.length >= 100) this.particles.shift();
    this.particles.push({
      type,
      x,
      y,
      delay: Math.max(0, opts.delay || 0),
      vx: opts.vx !== undefined ? opts.vx : (Math.random() - 0.5) * 26,
      vy: opts.vy !== undefined ? opts.vy : (type === 'zzz' ? -22 : -40 - Math.random() * 18),
      life: 1.0,
      decay: opts.decay || (type === 'stardust' ? 1.55 : type === 'zzz' ? 0.52 : 0.85),
      size: opts.size || (type === 'heart' ? 10 + Math.random() * 5 : type === 'stardust' ? 2.5 + Math.random() * 2.5 : 14),
      color: opts.color || '#F4978E',
      text: opts.text || '',
      expression: opts.expression || '',
      phase: Math.random() * Math.PI * 2,
      rot: (Math.random() - 0.5) * 0.5
    });
  }

  spawnHeadBubble(type, x, y, opts = {}) {
    const lifeSeconds = 1.58;
    return this.spawnParticle(type, x, y, {
      decay: 1 / lifeSeconds,
      vx: (Math.random() - 0.5) * 4,
      vy: -29 - Math.random() * 3,
      ...opts
    });
  }

  spawnHeartBubbles(x, y) {
    const now = performance.now();
    if (now < this.heartSequenceUntil) return;
    const spacing = 0.64;
    const lifeSeconds = 1.58;
    const offsets = [0, 4, -3];
    this.heartSequenceUntil = now + ((offsets.length - 1) * spacing + lifeSeconds) * 1000;
    offsets.forEach((offset, index) => this.spawnHeadBubble('heart', x + offset, y, {
      delay: spacing * index,
      color: '#f18aa9', size: 11.5 + Math.random() * 1.8
    }));
  }

  spawnKaomojiBubble(type, x, y, opts = {}) {
    return this.spawnHeadBubble(type, x, y, opts);
  }

  /**
   * 在键帽实际 (x, y) 坐标位置弹出三段式「敲击 -> 悬浮 -> 渐变消散」字母！
   */
  spawnFloatingLetter(label, x, y, keyType) {
    // 绘本粉彩主色调与渐隐水彩尾色
    const palette = keyType === 'space'
      ? { fg: '#8A5628', bg: '#FFF1C7', glow: 'rgba(252, 214, 128, 0.72)', fade: '#F4B886' }
      : keyType === 'accent'
        ? { fg: '#8F3E2E', bg: '#FFE4D8', glow: 'rgba(248, 178, 152, 0.72)', fade: '#F4A59E' }
        : { fg: '#4A352A', bg: '#FFFBF2', glow: 'rgba(255, 226, 158, 0.72)', fade: '#9CC6E8' };

    if (this.floatingLetters.length >= 35) this.floatingLetters.shift();
    this.floatingLetters.push({
      label,
      x,
      y: y - 2,
      startX: x,
      startY: y - 2,
      age: 0,
      duration: 1.48,
      tilt: (Math.random() - 0.5) * 0.34,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 7 + Math.random() * 5.5,
      swayFreq: 4.2 + Math.random() * 1.4,
      riseDist: 34 + Math.random() * 10,
      palette,
      stardustSpawned: false
    });
  }

  /** 在键帽敲击点绽放极细腻的手绘小星芒与水彩涟漪 */
  spawnKeyRipple(x, y, keyType) {
    const sparkCount = keyType === 'space' ? 5 : 4;
    const sparks = [];
    for (let i = 0; i < sparkCount; i++) {
      const ang = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.55;
      sparks.push({
        ang,
        dist: 11 + Math.random() * 10,
        size: 3 + Math.random() * 2.5
      });
    }
    if (this.keyRipples.length >= 25) this.keyRipples.shift();
    this.keyRipples.push({
      x,
      y,
      age: 0,
      duration: 0.42,
      color: { mint: '#8BC9A1', night: '#AAB8ED', green: '#74D690' }[this.theme]
        ?? (keyType === 'accent' ? '#F4A59E' : '#F3C669'),
      sparks
    });
  }

  update(dt, now) {
    for (let i = this.keyRipples.length - 1; i >= 0; i--) {
      const r = this.keyRipples[i];
      r.age += dt;
      if (r.age >= r.duration) this.keyRipples.splice(i, 1);
    }

    // 11) 更新三段式敲击悬浮字母（并在渐变消散期释放微小彩铅星尘）
    for (let i = this.floatingLetters.length - 1; i >= 0; i--) {
      const fl = this.floatingLetters[i];
      fl.age += dt;
      const p = fl.age / fl.duration;
      if (p >= 1) {
        this.floatingLetters.splice(i, 1);
        continue;
      }
      // 进入渐变消散阶段（70%）时绽放 2~3 颗彩铅星尘粒子
      if (p >= 0.70 && !fl.stardustSpawned) {
        fl.stardustSpawned = true;
        const cur = this.evaluateLetterTransform(fl);
        const count = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let s = 0; s < count; s++) {
          this.spawnParticle('stardust', cur.x + (Math.random() - 0.5) * 18, cur.y + (Math.random() - 0.5) * 10, {
            vx: (Math.random() - 0.5) * 34,
            vy: -16 - Math.random() * 24,
            color: s % 2 === 0 ? '#F3C669' : '#F4A59E'
          });
        }
      }
    }

    // 12) 更新通用粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      if (pt.delay > 0) {
        pt.delay = Math.max(0, pt.delay - dt);
        continue;
      }
      const sharedFloat = pt.type === 'heart' || pt.type === 'purr' || pt.type === 'face';
      const floatDrift = sharedFloat ? 5 : 12;
      pt.x += pt.vx * dt + Math.sin(now * 0.005 + pt.phase) * floatDrift * dt;
      pt.y += pt.vy * dt;
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  evaluateLetterTransform(fl) {
    const p = clamp(fl.age / fl.duration, 0, 1);
    let yOffset = 0;
    let xOffset = 0;
    let scale = 1;
    let alpha = 1;
    let rot = fl.tilt;
    let glowAlpha = 0;

    if (p < 0.18) {
      // 阶段1：敲击弹出（0%~18%）——向上冲击 + 弹性缩放过冲 0.4 -> 1.28 -> 1.0
      const k = p / 0.18;
      const easeOut = 1 - Math.pow(1 - k, 3);
      yOffset = -easeOut * (fl.riseDist * 0.44);
      if (k < 0.62) {
        const sub = k / 0.62;
        scale = lerp(0.4, 1.28, 1 - Math.pow(1 - sub, 2.5));
      } else {
        const sub = (k - 0.62) / 0.38;
        scale = lerp(1.28, 1.0, smoothstep(0, 1, sub));
      }
      alpha = smoothstep(0, 0.25, k);
      rot = fl.tilt * (1.25 - k * 0.45);
      glowAlpha = Math.sin(k * Math.PI) * 0.95;
    } else if (p < 0.70) {
      // 阶段2：轻盈悬浮（18%~70%）——失重慢升 + 正弦波轻晃 + 呼吸微浮
      const k = (p - 0.18) / 0.52;
      const slowEase = 1 - Math.pow(1 - k, 1.45);
      yOffset = -(fl.riseDist * 0.44) - slowEase * (fl.riseDist * 0.38) + Math.sin(fl.age * 5.2 + fl.swayPhase) * 2.2;
      xOffset = Math.sin(fl.age * fl.swayFreq + fl.swayPhase) * fl.swayAmp * smoothstep(0, 0.2, k);
      scale = 1.0 + Math.sin(fl.age * 6.0 + fl.swayPhase) * 0.045;
      alpha = 1;
      rot = fl.tilt * 0.75 * Math.cos(fl.age * 3.1 + fl.swayPhase);
      glowAlpha = 0.28 * (1 - k * 0.5);
    } else {
      // 阶段3：渐变消散（70%~100%）——柔美渐隐 + 柔和淡出上飘
      const k = (p - 0.70) / 0.30;
      yOffset = -(fl.riseDist * 0.82) - k * (fl.riseDist * 0.22);
      xOffset = Math.sin(fl.age * fl.swayFreq + fl.swayPhase) * fl.swayAmp * (1 + k * 0.25);
      scale = lerp(1.0, 0.86, smoothstep(0, 1, k));
      alpha = 1 - smoothstep(0, 1, k);
      rot = fl.tilt * 0.5 * Math.cos(fl.age * 3.1 + fl.swayPhase);
      glowAlpha = 0.14 * (1 - k);
    }

    return {
      x: fl.startX + xOffset,
      y: fl.startY + yOffset,
      scale,
      alpha,
      rot,
      glowAlpha,
      fadeMix: smoothstep(0.68, 1.0, p)
    };
  }

  drawKeyRipples(ctx) {
    for (const r of this.keyRipples) {
      const p = clamp(r.age / r.duration, 0, 1);
      const alpha = 1 - smoothstep(0.15, 1, p);
      const rad = lerp(4, 23, 1 - Math.pow(1 - p, 2.5));

      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.globalAlpha = alpha * 0.78;

      // 柔和扩散水彩涟漪圈
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, rad * 0.62, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.0 * (1 - p * 0.6);
      ctx.stroke();

      // 绽放的小手绘四角星芒
      for (const sp of r.sparks) {
        const d = sp.dist * (0.25 + 0.85 * (1 - Math.pow(1 - p, 2)));
        const sx = Math.cos(sp.ang) * d;
        const sy = Math.sin(sp.ang) * d * 0.68 - p * 6;
        ctx.fillStyle = r.color;
        this.drawFourPointStar(ctx, sx, sy, sp.size * (1 - p * 0.55));
      }
      ctx.restore();
    }
  }

  drawFloatingLetters(ctx) {
    for (const fl of this.floatingLetters) {
      const tf = this.evaluateLetterTransform(fl);
      if (tf.alpha <= 0.01) continue;

      ctx.save();
      ctx.translate(tf.x, tf.y);
      ctx.rotate(tf.rot);
      ctx.scale(tf.scale, tf.scale);
      ctx.globalAlpha = tf.alpha;

      const isLong = fl.label.length > 2;
      ctx.font = `700 ${isLong ? 12.5 : 16.5}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
      const textW = ctx.measureText(fl.label).width;
      const pillW = Math.max(27, textW + 14);
      const pillH = 26;

      // 1) 柔和暖水彩光晕背景
      if (tf.glowAlpha > 0.02) {
        const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, pillW * 0.85);
        halo.addColorStop(0, fl.palette.glow);
        halo.addColorStop(1, 'rgba(255, 232, 180, 0)');
        ctx.save();
        ctx.globalAlpha = tf.alpha * tf.glowAlpha;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, pillW * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2) 手绘绘本小圆牌底色（渐隐期柔美过渡为暖粉彩）
      ctx.beginPath();
      ctx.roundRect(-pillW * 0.5, -pillH * 0.5, pillW, pillH, 10);
      ctx.fillStyle = tf.fadeMix > 0.35 ? fl.palette.fade : fl.palette.bg;
      ctx.fill();
      ctx.strokeStyle = '#3E2B23';
      ctx.lineWidth = 1.9;
      ctx.stroke();

      // 3) 清晰温柔字符
      ctx.fillStyle = tf.fadeMix > 0.5 ? '#FFFDF8' : fl.palette.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fl.label, 0, 0.8);

      ctx.restore();
    }
  }

  /** 8. 绘制彩铅星尘、水彩爱心、瞌睡 Zzz、惊吓叹号与对话气泡 */
  drawParticles(ctx) {
    for (const pt of this.particles) {
      if (pt.delay > 0) continue;
      ctx.save();
      ctx.globalAlpha = (pt.type === 'heart' || pt.type === 'purr' || pt.type === 'face')
        ? smoothstep(0, 1, clamp(pt.life, 0, 1))
        : clamp(pt.life, 0, 1);
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);

      if (pt.type === 'heart') {
        const s = pt.size * (0.86 + (1 - pt.life) * 0.16);
        const fill = ctx.createLinearGradient(-s * 0.6, -s * 0.7, s * 0.55, s * 0.85);
        fill.addColorStop(0, '#ffd9e5');
        fill.addColorStop(0.52, pt.color);
        fill.addColorStop(1, '#e96f94');
        ctx.shadowColor = 'rgba(232, 105, 145, .24)';
        ctx.shadowBlur = Math.max(2, s * 0.28);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.78);
        ctx.bezierCurveTo(-s * 0.12, s * 0.6, -s * 0.78, s * 0.18, -s * 0.62, -s * 0.14);
        ctx.bezierCurveTo(-s * 0.51, -s * 0.42, -s * 0.13, -s * 0.38, 0, -s * 0.1);
        ctx.bezierCurveTo(s * 0.13, -s * 0.38, s * 0.51, -s * 0.42, s * 0.62, -s * 0.14);
        ctx.bezierCurveTo(s * 0.78, s * 0.18, s * 0.12, s * 0.6, 0, s * 0.78);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 218, 231, .78)';
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, -s * 0.24, s * 0.075, s * 0.13, -0.48, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.type === 'purr') {
        this.drawKaomoji(ctx, '=^ω^=', pt, pt.size * (1.12 + (1 - pt.life) * 0.2));
      } else if (pt.type === 'face') {
        const s = pt.size * (0.9 + (1 - pt.life) * 0.18);
        const face = {
          happy: '>ω<', angry: '>_<', surprised: 'OvO',
          itchy: '≧ω≦', dizzy: '＠_＠', sleepy: '=ω='
        }[pt.expression] || 'OvO';
        this.drawKaomoji(ctx, face, pt, s);
      } else if (pt.type === 'stardust') {
        ctx.fillStyle = pt.color;
        this.drawFourPointStar(ctx, 0, 0, pt.size * (0.6 + pt.life * 0.6));
      } else if (pt.type === 'zzz') {
        const sc = 0.82 + (1 - pt.life) * 0.45;
        ctx.scale(sc, sc);
        ctx.font = '700 15px "Segoe UI", sans-serif';
        ctx.strokeStyle = '#FFFBF2';
        ctx.lineWidth = 3.5;
        ctx.strokeText(pt.text, 0, 0);
        ctx.fillStyle = '#6B88C8';
        ctx.fillText(pt.text, 0, 0);
      } else if (pt.type === 'exclaim') {
        const sc = 0.85 + Math.sin(pt.life * Math.PI) * 0.35;
        ctx.scale(sc, sc);
        ctx.font = '700 22px "Segoe UI", sans-serif';
        ctx.strokeStyle = '#FFFBF2';
        ctx.lineWidth = 4;
        ctx.strokeText('!', 0, 0);
        ctx.fillStyle = '#E87A64';
        ctx.fillText('!', 0, 0);
      } else if (pt.type === 'bubble') {
        ctx.font = '600 12px "Segoe UI", "Microsoft YaHei UI", sans-serif';
        const tw = ctx.measureText(pt.text).width;
        ctx.beginPath();
        ctx.roundRect(-tw * 0.5 - 9, -12, tw + 18, 23, 11);
        ctx.fillStyle = '#FFFBF2';
        ctx.fill();
        ctx.strokeStyle = '#3E2B23';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = '#4A352A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pt.text, 0, -0.5);
      }

      ctx.restore();
    }
  }

  drawKaomoji(ctx, text, pt, size) {
    const scale = 0.92 + Math.sin(performance.now() * 0.009 + pt.phase) * 0.035;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.font = `500 ${size}px "Segoe UI", Arial, "Microsoft YaHei UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pt.color;
    ctx.shadowColor = 'rgba(25, 20, 24, .25)';
    ctx.shadowBlur = 2;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /** 辅助绘制柔和手绘四角星芒 */
  drawFourPointStar(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
    ctx.closePath();
    ctx.fill();
  }
}
