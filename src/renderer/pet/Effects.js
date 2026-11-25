import { clamp, lerp, smoothstep } from '../geometry.js';

export class Effects {
  constructor() {
    this.particles = [];
    this.floatingLetters = [];
    this.keyRipples = [];
    this.mouseClicks = [];
    this.theme = 'cream';
    this.heartSequenceUntil = 0;
    this.lastLetterAt = 0;
    this.lastLetterX = null;
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
    const palette = keyType === 'space'
      ? { fg: '#8A5628', bg: 'rgba(255, 244, 212, 0.88)', border: 'rgba(138, 86, 40, 0.45)', glow: 'rgba(252, 214, 128, 0.48)', fade: 'rgba(244, 184, 134, 0.72)' }
      : keyType === 'accent'
        ? { fg: '#8F3E2E', bg: 'rgba(255, 234, 224, 0.88)', border: 'rgba(143, 62, 46, 0.42)', glow: 'rgba(248, 178, 152, 0.48)', fade: 'rgba(244, 165, 158, 0.72)' }
        : { fg: '#4A352A', bg: 'rgba(255, 251, 242, 0.88)', border: 'rgba(74, 53, 42, 0.38)', glow: 'rgba(255, 226, 158, 0.45)', fade: 'rgba(156, 198, 232, 0.72)' };

    const now = performance.now();
    let spawnX = x + (Math.random() - 0.5) * 14;
    if (this.lastLetterX !== null && now - this.lastLetterAt < 220 && Math.abs(spawnX - this.lastLetterX) < 16) {
      spawnX += (spawnX >= this.lastLetterX ? 1 : -1) * (14 + Math.random() * 8);
    }
    this.lastLetterAt = now;
    this.lastLetterX = spawnX;

    if (this.floatingLetters.length >= 32) this.floatingLetters.shift();
    this.floatingLetters.push({
      label,
      x: spawnX,
      y: y - 4,
      startX: spawnX,
      startY: y - 4,
      age: 0,
      duration: 1.18 + Math.random() * 0.22,
      tilt: (Math.random() - 0.5) * 0.30,
      baseScale: 0.88 + Math.random() * 0.20,
      driftX: (Math.random() - 0.5) * 18,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 4.5 + Math.random() * 4.0,
      swayFreq: 3.8 + Math.random() * 1.4,
      riseDist: 36 + Math.random() * 14,
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

  /** 鼠标点击时的轻盈暖色反馈特效（无青色） */
  spawnMouseClick(x, y, side = 'left') {
    const count = 6;
    const rays = [];
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.28;
      rays.push({ ang, len: 5 + Math.random() * 4.5 });
    }
    if (this.mouseClicks.length >= 16) this.mouseClicks.shift();
    this.mouseClicks.push({
      x: x + (side === 'right' ? 5 : -3),
      y: y - 3,
      age: 0,
      duration: 0.36,
      color: side === 'right' ? '#ec9383' : '#f2b85c',
      rays
    });
  }

  update(dt, now) {
    for (let i = this.mouseClicks.length - 1; i >= 0; i--) {
      const mc = this.mouseClicks[i];
      mc.age += dt;
      if (mc.age >= mc.duration) this.mouseClicks.splice(i, 1);
    }
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
      x: fl.startX + xOffset + (fl.driftX || 0) * smoothstep(0, 1, p),
      y: fl.startY + yOffset,
      scale: scale * (fl.baseScale || 1),
      alpha: alpha * 0.9,
      rot,
      glowAlpha,
      fadeMix: smoothstep(0.68, 1.0, p)
    };
  }

  drawKeyRipples(ctx) {
    void ctx;
  }

  drawMouseClicks(ctx) {
    for (const mc of this.mouseClicks) {
      const p = clamp(mc.age / mc.duration, 0, 1);
      const ease = 1 - Math.pow(1 - p, 2.4);
      const alpha = 1 - smoothstep(0.22, 1, p);
      const radius = lerp(5, 24, ease);
      ctx.save();
      ctx.translate(mc.x, mc.y);
      ctx.globalAlpha = alpha * 0.95;

      // Soft warm expanding ring
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = mc.color;
      ctx.lineWidth = Math.max(1.2, 2.8 * (1 - p * 0.55));
      ctx.stroke();

      // Inner tap flash
      if (p < 0.5) {
        ctx.beginPath();
        ctx.arc(0, 0, lerp(7, 2, p / 0.5), 0, Math.PI * 2);
        ctx.fillStyle = mc.color;
        ctx.globalAlpha = (1 - p / 0.5) * 0.48;
        ctx.fill();
      }

      // Crisp short radial click ticks
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeStyle = mc.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.0;
      for (const ray of mc.rays) {
        const r0 = lerp(7, 17, ease);
        const r1 = r0 + ray.len * 1.2 * (1 - p * 0.45);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ray.ang) * r0, Math.sin(ray.ang) * r0);
        ctx.lineTo(Math.cos(ray.ang) * r1, Math.sin(ray.ang) * r1);
        ctx.stroke();
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
      ctx.font = `700 ${isLong ? 11 : 14}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
      const textW = ctx.measureText(fl.label).width;
      const pillW = Math.max(22, textW + 11);
      const pillH = 21;

      if (tf.glowAlpha > 0.02) {
        const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, pillW * 0.78);
        halo.addColorStop(0, fl.palette.glow);
        halo.addColorStop(1, 'rgba(255, 232, 180, 0)');
        ctx.save();
        ctx.globalAlpha = tf.alpha * tf.glowAlpha;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, pillW * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.roundRect(-pillW * 0.5, -pillH * 0.5, pillW, pillH, 8.5);
      ctx.fillStyle = tf.fadeMix > 0.35 ? fl.palette.fade : fl.palette.bg;
      ctx.fill();
      ctx.strokeStyle = fl.palette.border || 'rgba(62, 43, 35, 0.38)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = tf.fadeMix > 0.5 ? '#FFFDF8' : fl.palette.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fl.label, 0, 0.6);

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
