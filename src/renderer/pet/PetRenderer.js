import { clamp } from '../geometry.js';

const CELL = 4;
const GRID_WIDTH = 105;
const GRID_HEIGHT = 85;
const inside = (x, y, [left, top, width, height]) =>
  x >= left && x < left + width && y >= top && y < top + height;

export class PetRenderer {
  constructor(canvas, assets, state, model = null) {
    this.canvas = canvas;
    this.assets = assets;
    this.state = state;
    this.model = model;
    this.context = canvas.getContext('2d', { alpha: true });
    this.scale();
    window.addEventListener('resize', () => this.scale());
  }
  scale() {
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio);
  }
  silhouette() {
    if (this.model?.canvas) {
      const sample = new OffscreenCanvas(GRID_WIDTH, GRID_HEIGHT);
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(this.model.canvas, 0, 0, GRID_WIDTH, GRID_HEIGHT);
      const rgba = context.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT).data;
      const regions = this.model.regions();
      this.modelRegions = regions;
      const keyboard = this.state.prefs.keyboard ? regions[3] : null;
      const mouse = this.state.prefs.keyboard ? regions[4] : null;
      const mask = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          if (rgba[(y * GRID_WIDTH + x) * 4 + 3] < 96) continue;
          const px = (x + 0.5) * CELL;
          const py = (y + 0.5) * CELL;
          const index = y * GRID_WIDTH + x;
          mask[index] = mouse && inside(px, py, mouse) ? 3
            : keyboard && inside(px, py, keyboard) ? 2 : 1;
        }
      }
      this.mask = mask;
      return mask;
    }
    const canvas = new OffscreenCanvas(GRID_WIDTH, GRID_HEIGHT);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const mask = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    const { mouse } = this.assets.layers;
    ctx.scale(1 / CELL, 1 / CELL);

    const add = (value, draw) => {
      ctx.clearRect(0, 0, 420, 340);
      draw();
      const rgba = ctx.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT).data;
      for (let i = 0; i < mask.length; i++) {
        if (rgba[i * 4 + 3] >= 120) mask[i] = value;
      }
    };
    add(1, () => {
      const { cat, tail } = this.assets.layers;
      if (tail) ctx.drawImage(tail.image, ...tail.box);
      ctx.drawImage(cat.image, ...cat.box);
    });
    if (this.state.prefs.keyboard) {
      add(2, () => this.state.keyboard.draw(ctx));
      add(3, () => ctx.drawImage(mouse.image, ...mouse.box));
    }
    this.mask = mask;
    return mask;
  }
  zone({ x, y }) {
    if (x < 0 || x >= 420 || y < 0 || y >= 340) return 'none';
    if (this.model?.pickToy?.(x, y)) return 'toy';
    const kind = this.mask?.[Math.floor(y / CELL) * GRID_WIDTH + Math.floor(x / CELL)];
    if (kind === 2) return 'desk';
    if (kind === 3) return 'mouse';
    if (this.model) {
      if (this.model.pickTail?.(x, y)) return 'tail';
      if (this.model.pickNose?.(x, y)) return 'nose';
      if (this.model.pickHead(x, y)) return 'head';
      return kind === 1 ? 'body' : 'none';
    }
    if (kind !== 1) return 'none';
    const [nx, ny, radius] = this.assets.hotspots.nose;
    if (Math.hypot(x - nx, y - ny) < radius) return 'nose';
    return y < this.assets.hotspots.headMaxY ? 'head' : 'body';
  }
  draw(now) {
    const ctx = this.context;
    const { width, height } = this.canvas;
    const [baseW, baseH] = this.assets.canvas;
    ctx.setTransform(width / baseW, 0, 0, height / baseH, 0, 0);
    ctx.clearRect(0, 0, baseW, baseH);
    if (this.model) {
      this.model.draw(ctx);
      if (this.state.prefs.keyboard && !this.state.dragging) {
        this.state.effects.drawKeyRipples(ctx);
        this.state.effects.drawMouseClicks?.(ctx);
      }
    } else {
      this.drawCat(ctx, now);
      if (this.state.prefs.keyboard && !this.state.dragging) {
        this.drawMouse(ctx);
        this.state.keyboard.draw(ctx);
        this.drawPaw(ctx, this.assets.layers.left, this.state.leftPaw);
        this.drawPaw(ctx, this.assets.layers.right, this.state.rightPaw);
      }
    }
    if (!this.model && this.state.prefs.keyboard && !this.state.dragging) {
      this.state.effects.drawKeyRipples(ctx);
      this.state.effects.drawMouseClicks?.(ctx);
    }
    this.drawFocusTimer(ctx);
    this.state.effects.drawFloatingLetters(ctx);
    this.state.effects.drawParticles(ctx);
    if (this.model?.host) {
      this.model.host.dataset.floatingLetters = String(this.state.effects.floatingLetters.length);
    }
  }
  drawFocusTimer(ctx) {
    const state = this.state;
    if (!state.focusMode) return;
    const total = Math.max(0, Math.ceil(state.focusRemaining));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const digits = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    const patterns = [
      [1, 1, 1, 1, 1, 1, 0], [0, 1, 1, 0, 0, 0, 0],
      [1, 1, 0, 1, 1, 0, 1], [1, 1, 1, 1, 0, 0, 1],
      [0, 1, 1, 0, 0, 1, 1], [1, 0, 1, 1, 0, 1, 1],
      [1, 0, 1, 1, 1, 1, 1], [1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 0, 1, 1]
    ];
    const digitW = 14, digitH = 24, thick = 3, gap = 3, colonW = 5;
    const width = digitW * 4 + gap * 3 + colonW + 8;
    let x = (420 - width) / 2;
    const y = 38;
    ctx.save();
    ctx.shadowColor = 'rgba(71, 223, 170, .55)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#76efba';
    const segments = [
      [thick, 0, digitW - thick * 2, thick],
      [digitW - thick, thick, thick, digitH / 2 - thick],
      [digitW - thick, digitH / 2, thick, digitH / 2 - thick],
      [thick, digitH - thick, digitW - thick * 2, thick],
      [0, digitH / 2, thick, digitH / 2 - thick],
      [0, thick, thick, digitH / 2 - thick],
      [thick, digitH / 2 - thick / 2, digitW - thick * 2, thick]
    ];
    for (const char of digits) {
      if (char === ':') {
        ctx.fillRect(x + 1, y + 6, 2, 2);
        ctx.fillRect(x + 1, y + 15, 2, 2);
        x += colonW + 5;
        continue;
      }
      for (let i = 0; i < 7; i++) {
        if (!patterns[Number(char)][i]) continue;
        const [sx, sy, sw, sh] = segments[i];
        ctx.beginPath();
        ctx.roundRect(x + sx, y + sy, sw, sh, Math.min(thick / 2, 1.2));
        ctx.fill();
      }
      x += digitW + gap;
    }
    ctx.restore();
  }
  drawCat(ctx, now) {
    const state = this.state;
    const { cat } = this.assets.layers;
    const [x, y, w, h] = cat.box;
    const [cx, cy] = cat.anchor;
    const jump = Math.sin(state.poke / 0.55 * Math.PI) * 10;
    const breathe = Math.sin(now / (state.sleeping ? 650 : 380)) * 0.005;
    const waking = state.wakeUntil > now ? Math.sin((state.wakeUntil - now) / 380 * Math.PI) * 3 : 0;
    ctx.save();
    ctx.translate(cx - state.lean * 3, cy + state.sleepBlend * 2 - jump - waking);
    ctx.rotate(state.tilt + state.sleepBlend * 0.035 + Math.sin(now / 115) * Math.min(1, state.petEnergy) * 0.014);
    ctx.scale(1 - jump * 0.0017, 1 + breathe - state.sleepBlend * 0.025 + jump * 0.0022);
    ctx.translate(-cx, -cy);
    const pose = state.sleeping ? 'sleep' : state.poke ? 'poke' : state.petEnergy > 0.12 ? 'pet'
      : waking ? 'wake' : state.leftPaw.timer ? 'type_left' : state.rightPaw.timer ? 'type_right'
      : state.lean > 0.1 ? 'mouse' : state.blink > 0 ? 'blink' : 'idle';
    if (pose !== this.pose) {
      this.pose = pose;
      this.poseStart = now;
    }
    const spec = this.assets.states[pose];
    if (spec.images.length) {
      const frame = Math.floor((now - this.poseStart) * spec.fps / 1000);
      const index = spec.loop ? frame % spec.images.length : Math.min(frame, spec.images.length - 1);
      const [ox, oy] = spec.offset ?? [0, 0];
      ctx.drawImage(spec.images[index], x + ox, y + oy, w, h);
      ctx.restore();
      return;
    }

    const { image } = cat;
    const tail = this.assets.layers.tail;
    if (tail) {
      const [tx, ty, tw, th] = tail.box;
      const [ax, ay] = tail.anchor;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.sin(state.tailPhase) * 0.055 + state.typeEnergy * Math.sin(now / 120) * 0.035);
      ctx.translate(-ax, -ay);
      ctx.drawImage(tail.image, tx, ty, tw, th);
      ctx.restore();
    }
    ctx.drawImage(image, x, y, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = this.fallbackPalette().fur;
    ctx.fillRect(x, y, w, h);
    this.drawCoatMarks(ctx);
    ctx.restore();
    this.drawFallbackEyes(ctx);
    this.drawFallbackNose(ctx);
    if (state.focusMode) this.drawFocusHeadphones(ctx);
    this.drawLids(ctx, clamp(Math.max(state.blink, state.sleepBlend, state.petEnergy * 0.9), 0, 1), state.petEnergy > 0.12);
    ctx.restore();
  }
  fallbackPalette() {
    const coats = {
      black: { fur: '#19181b', seam: '#343238', eye: ['#f7f4ed', '#f7f4ed'], nose: '#d89498' },
      calico: { fur: '#fffaf1', seam: '#5d5145', eye: ['#e4bd3d', '#e4bd3d'], nose: '#d98d87' },
      siamese: { fur: '#f1dfc5', seam: '#4a352f', eye: ['#46a9e8', '#46a9e8'], nose: '#9f6d5b' },
      maotao: { fur: '#c7c8c6', seam: '#777875', eye: ['#48a9e8', '#48a9e8'], nose: '#c98a8b' },
      orange: { fur: '#ebb064', seam: '#b87c3e', eye: ['#99b854', '#99b854'], nose: '#df918d' },
      ragdoll: { fur: '#fcfaf5', seam: '#6f5b50', eye: ['#3b8ee6', '#3b8ee6'], nose: '#e09fa6' },
      white: { fur: '#fbf9f4', seam: '#827b71', eye: ['#47a4df', '#e7bd39'], nose: '#dca1aa' },
      solidblack: { fur: '#121214', seam: '#35343a', eye: ['#fffdf8', '#fffdf8'], nose: '#f7f4ed' }
    };
    const base = coats[this.state.prefs.coat] ?? coats.solidblack;
    const eyeMap = {
      blue: ['#45a3e5', '#45a3e5'], amber: ['#e8b838', '#e8b838'], emerald: ['#5ec27e', '#5ec27e'],
      violet: ['#9a7ee0', '#9a7ee0'], rose: ['#e688a8', '#e688a8'], odd: ['#45a3e5', '#e8b838']
    };
    return eyeMap[this.state.prefs.eyeColor] ? { ...base, eye: eyeMap[this.state.prefs.eyeColor] } : base;
  }
  drawCoatMarks(ctx) {
    const coat = this.state.prefs.coat;
    const ellipse = (x, y, rx, ry, color, rotation = 0) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    if (coat === 'black') {
      ellipse(210, 188, 24, 45, '#f7f3e8');
      ellipse(180, 86, 14, 27, '#f7f3e8', -0.16);
    } else if (coat === 'calico') {
      ellipse(167, 63, 18, 28, '#e48b3b', -0.28);
      ellipse(154, 78, 12, 18, '#e48b3b', -0.42);
      ellipse(244, 66, 23, 34, '#262426', 0.24);
      ellipse(258, 82, 14, 20, '#262426', 0.36);
      ellipse(161, 174, 21, 34, '#e48b3b', -0.22);
      ellipse(176, 156, 12, 16, '#e48b3b', -0.1);
      ellipse(256, 185, 19, 30, '#262426', 0.22);
      ellipse(246, 204, 13, 16, '#262426', 0.12);
    } else if (coat === 'ragdoll') {
      ellipse(158, 66, 22, 34, '#6b554a', -0.26);
      ellipse(262, 66, 22, 34, '#6b554a', 0.26);
      ellipse(152, 178, 16, 28, '#9a8679', -0.18);
      ellipse(268, 178, 16, 28, '#9a8679', 0.18);
    } else if (coat === 'siamese') {
      ellipse(210, 101, 40, 34, '#49332d');
      ellipse(154, 48, 15, 33, '#49332d', -0.12);
      ellipse(265, 48, 15, 33, '#49332d', 0.12);
      ellipse(209, 220, 45, 14, '#49332d');
    } else if (coat === 'maotao') {
      ctx.save();
      ctx.strokeStyle = '#747572';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const [cx, cy, dx] of [[191, 51, -5], [210, 45, 0], [229, 51, 5]]) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + dx, cy + 13, cx + dx * 1.5, cy + 23); ctx.stroke();
      }
      for (const x of [151, 269]) {
        for (const y of [154, 173, 192]) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (x < 210 ? 8 : -8), y + 8, x + (x < 210 ? 17 : -17), y + 10); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  drawFallbackEyes(ctx) {
    const { eyes } = this.assets.hotspots;
    const palette = this.fallbackPalette();
    const pointer = this.state.lastPointer ?? { x: 210, y: 100 };
    eyes.forEach(([x, y, rx, ry], index) => {
      const dx = clamp((pointer.x - x) / 140, -1, 1) * rx * 0.42;
      const dy = clamp((pointer.y - y) / 130, -1, 1) * ry * 0.42;
      ctx.save();
      ctx.fillStyle = palette.eye[index] ?? palette.eye[0];
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#08090a';
      ctx.beginPath(); ctx.ellipse(x + dx, y + dy, rx * 0.43, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(216, 213, 207, 0.38)';
      ctx.beginPath(); ctx.arc(x + dx - rx * 0.14, y + dy - ry * 0.22, rx * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + dx + rx * 0.13, y + dy + ry * 0.2, rx * 0.065, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }
  drawFallbackNose(ctx) {
    const [x, y, radius] = this.assets.hotspots.nose;
    const { nose } = this.fallbackPalette();
    ctx.save();
    ctx.fillStyle = nose;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  drawFocusHeadphones(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    // Outlined slender headband arching lightly over the crown without pressing on it
    ctx.beginPath();
    ctx.moveTo(154, 102);
    ctx.bezierCurveTo(150, 48, 174, 34, 210, 34);
    ctx.bezierCurveTo(246, 34, 270, 48, 266, 102);
    ctx.strokeStyle = '#242326';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = '#83b29a';
    ctx.lineWidth = 6.5;
    ctx.stroke();
    // Compact rounded earcups seated on the lower temples
    for (const [cx, cy, rot] of [[154, 104, -0.1], [266, 104, 0.1]]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = '#83b29a';
      ctx.strokeStyle = '#242326';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.5, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  drawLids(ctx, closure, smile) {
    if (closure < 0.06) return;
    for (const [x, y, rx, ry, rotation] of this.assets.hotspots.eyes) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      const lid = -ry + 2 * ry * closure;
      ctx.fillStyle = this.fallbackPalette().fur;
      ctx.fillRect(-rx, -ry, 2 * rx, 2 * ry * closure + 0.6);
      const at = closure > 0.84 ? ry * 0.34 : lid;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.73, at);
      ctx.quadraticCurveTo(0, at + (smile ? -11 : 5), rx * 0.73, at);
      ctx.strokeStyle = this.fallbackPalette().seam;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }
  drawMouse(ctx) {
    const state = this.state;
    const { mouse } = this.assets.layers;
    const [x, y, w, h] = mouse.box;
    const [mx, my] = mouse.anchor;
    ctx.drawImage(mouse.image, x + state.mouseX - mx, y + state.mouseY - my + state.mousePress * 2, w, h - state.mousePress * 2);
  }
  drawPaw(ctx, layer, paw) {
    const dx = paw.x - paw.restX;
    const dy = paw.y - paw.restY;
    const [, , w, h] = layer.box;
    if (Math.hypot(dx, dy) < 2.5) return;
    const span = Math.hypot(dx, dy);
    ctx.save();
    const overlap = Math.min(16, span * 0.28);
    const angle = Math.atan2(dy, dx) - Math.PI / 2;
    ctx.translate(paw.restX, paw.restY - 4);
    ctx.rotate(angle);
    const reach = span + overlap;
    const furWidth = clamp(26 - span * 0.11, 13, 23);
    ctx.beginPath();
    ctx.moveTo(-furWidth * 0.46, 0);
    ctx.bezierCurveTo(-furWidth * 0.74, reach * 0.44, -furWidth * 0.42, reach * 0.78, -furWidth * 0.34, reach);
    ctx.lineTo(furWidth * 0.34, reach);
    ctx.bezierCurveTo(furWidth * 0.44, reach * 0.72, furWidth * 0.7, reach * 0.24, furWidth * 0.46, 0);
    ctx.closePath();
    ctx.fillStyle = this.fallbackPalette().fur;
    ctx.fill();
    ctx.strokeStyle = this.fallbackPalette().seam;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(paw.x, paw.y);
    ctx.scale(paw.squashX, paw.squashY);
    ctx.rotate(clamp(dx / 95, -0.38, 0.38) * -1);
    ctx.fillStyle = this.fallbackPalette().fur;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.36, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.fallbackPalette().seam;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, 2); ctx.quadraticCurveTo(-2, 5, -1, 6);
    ctx.moveTo(3, 2); ctx.quadraticCurveTo(2, 5, 1, 6);
    ctx.stroke();
    ctx.restore();
  }
}



