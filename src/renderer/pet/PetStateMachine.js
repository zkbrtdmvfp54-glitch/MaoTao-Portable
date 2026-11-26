import { clamp, lerp } from '../geometry.js';
import { createPaw, strike, updatePaw } from './PawMotion.js';

export class PetStateMachine {
  constructor(assets, keyboard, sound, effects, status) {
    Object.assign(this, { assets, keyboard, sound, effects, status });
    const { layers } = assets;
    this.leftPaw = createPaw(...layers.left.anchor);
    this.rightPaw = createPaw(...layers.right.anchor);
    [this.mouseX, this.mouseY] = layers.mouse.anchor;
    this.targetMouseX = this.mouseX;
    this.targetMouseY = this.mouseY;
    this.prefs = {};
    this.lastActivity = performance.now();
    this.nextBlink = this.lastActivity + 2800;
    this.nextZzz = 0;
    this.tilt = this.targetTilt = 0;
    this.sleepBlend = this.poke = this.petEnergy = this.blink = this.lean = this.mousePress = 0;
    this.tailPhase = this.spaceToggle = this.typeEnergy = 0;
    this.lastMouse = -Infinity;
    this.wakeUntil = 0;
    this.sleeping = this.manualSleep = this.dragging = false;
    this.lastVisual = this.lastActivity;
    this.model = null;
    this.lastPointer = null;
    this.focusMode = false;
    this.standbyMode = false;
    this.focusRemaining = 25 * 60;
    this.onFocusComplete = null;
    this.lastLinkedLetter = '';
  }
  linkedVisualLabel(keyObj) {
    const leftPool = 'QWERASDFZXCVTGB';
    const rightPool = 'YUIOPHJKLNM';
    const allPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const pool = keyObj.id === 'Space' ? allPool
      : keyObj.uCenter < 0 ? leftPool : rightPool;
    let letter = pool[Math.floor(Math.random() * pool.length)];
    if (letter === this.lastLinkedLetter && pool.length > 1) {
      letter = pool[(pool.indexOf(letter) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length];
    }
    this.lastLinkedLetter = letter;
    return letter;
  }
  setModel(model) {
    this.model = model;
    this.model?.setOnHandoverStage?.(stage => {
      if (stage === 'argue-in') this.sound.playHandoverArgue?.('incoming');
      else if (stage === 'argue-out') this.sound.playHandoverArgue?.('outgoing');
    });
  }
  setDragging(enabled) {
    const next = Boolean(enabled);
    if (this.dragging === next) return;
    this.dragging = next;
    if (next) {
      this.effects.floatingLetters.length = 0;
      this.effects.keyRipples.length = 0;
    }
    this.model?.setDragging?.(next);
  }
  dragMove(dx, dy) {
    if (!this.dragging) return;
    this.model?.dragImpulse?.(dx, dy);
  }
  configure(prefs) {
    const wasFocusMode = this.focusMode;
    const wasStandbyMode = this.standbyMode;
    this.prefs = prefs;
    this.focusMode = Boolean(prefs.focusMode);
    this.standbyMode = Boolean(prefs.standbyMode);
    this.model?.setStandbyMode?.(this.standbyMode);
    if (this.standbyMode && !wasStandbyMode) {
      this.sleeping = false;
      this.clearPaws();
      this.keyboard.keys.forEach(key => { key.press = key.glow = 0; });
      this.effects.floatingLetters.length = 0;
      this.effects.keyRipples.length = 0;
    }
    if (this.focusMode !== wasFocusMode) {
      const mins = Number.isInteger(prefs.focusMinutes) ? prefs.focusMinutes : 25;
      this.focusRemaining = mins * 60;
      this.model?.setFocusMode(this.focusMode);
      if (this.focusMode) {
        this.wake();
        this.status(`专注模式开始 · ${String(mins).padStart(2, '0')}:00`);
      }
    }
    if (this.keyboard.mode !== prefs.view) this.keyboard.setMode(prefs.view);
    this.sound.configure(prefs);
    this.effects.theme = prefs.theme;
    if (!prefs.keyboard) {
      this.clearPaws();
      this.effects.floatingLetters.length = 0;
      this.effects.keyRipples.length = 0;
      for (const key of this.keyboard.keys) key.press = key.glow = 0;
    }
    this.lastVisual = performance.now();
  }
  petName() {
    return this.prefs.coat === 'maotao' ? '毛桃' : '猫咪';
  }
  clearPaws() {
    Object.assign(this.leftPaw, createPaw(this.leftPaw.restX, this.leftPaw.restY));
    Object.assign(this.rightPaw, createPaw(this.rightPaw.restX, this.rightPaw.restY));
    this.lean = this.mousePress = 0;
    this.lastMouse = -Infinity;
  }
  wake(now = performance.now()) {
    this.lastActivity = now;
    if (!this.sleeping && !this.model?.isSleeping?.()) return;
    this.manualSleep = false;
    this.model?.trigger('wake');
    this.sleeping = false;
    this.wakeUntil = now + 380;
    this.nextBlink = now + 1700;
    this.status(`${this.petName()}醒来啦`);
  }
  setSleep(manual = false) {
    this.manualSleep = Boolean(manual);
    this.model?.trigger(manual ? 'manual-sleep' : 'sleep');
    this.sleeping = true;
    this.poke = this.petEnergy = this.typeEnergy = 0;
    this.nextZzz = 0;
    this.clearPaws();
    this.status(`${this.petName()}睡着了`);
  }
  perform(action) {
    switch (action) {
      case 'pet': this.pet(true); break;
      case 'poke': this.poked('nose'); break;
      case 'yarn': this.playToy(); break;
      case 'butterfly': this.playButterfly(); break;
      case 'wash': this.playWash(); break;
      case 'sleep': (this.sleeping || this.model?.isSleeping?.()) ? this.wake() : this.setSleep(true); break;
      case 'input-on': this.status('跨应用联动已开启'); break;
      case 'input-off': this.status('跨应用联动已暂停'); break;
    }
  }
  pet(withMeow) {
    if (this.dragging) return;
    this.model?.trigger('pet');
    this.wake();
    this.poke = 0;
    this.petEnergy = clamp(this.petEnergy + 0.95, 1.15, 2.25);
    this.clearPaws();
    const [headX, headY] = this.model?.headTop?.() ?? [166, 102];
    this.effects.spawnHeartBubbles(headX, headY - 3);
    if (withMeow) {
      this.effects.spawnKaomojiBubble('face', headX + 2, headY - 3, {
        delay: 0.32, color: '#f3f0e9', size: 17, expression: 'happy'
      });
      this.effects.spawnKaomojiBubble('purr', headX - 2, headY - 3, {
        delay: 0.96, color: '#f3f0e9', size: 13
      });
      this.sound.playMeow();
    }
    this.sound.playPurr();
    this.status(`${this.petName()}眯起眼睛`);
  }
  poked(part) {
    const angry = part === 'belly' || part === 'tail';
    this.model?.trigger(angry ? 'anger' : 'poke');
    this.wake();
    this.petEnergy = 0;
    this.poke = 0.55;
    this.clearPaws();
    const [headX, headY] = this.model?.headTop?.() ?? [166, 102];
    this.effects.spawnKaomojiBubble('face', headX, headY - 3, {
      color: angry ? '#e8c4b1' : '#f3f0e9', size: 16,
      expression: angry ? 'angry' : 'surprised'
    });
    this.sound.playMeow('surprised');
    this.status(part === 'nose' ? '戳到了小鼻子' : '戳到了软肚子');
  }
  playToy() {
    if (this.dragging) return;
    this.wake();
    this.model?.playToy();
    this.sound.playPurr();
    const [headX, headY] = this.model?.headTop?.() ?? [166, 102];
    this.effects.spawnHeartBubbles(headX, headY - 3);
    this.status(`${this.petName()}追着毛线球玩`);
  }
  playButterfly() {
    if (this.dragging) return;
    this.wake();
    this.model?.playButterfly?.();
    this.sound.playPurr();
    const [headX, headY] = this.model?.headTop?.() ?? [166, 102];
    this.effects.spawnHeartBubbles(headX, headY - 3);
    this.status(`${this.petName()}追着蝴蝶玩`);
  }
  playWash() {
    if (this.dragging) return;
    this.wake();
    this.model?.playWash?.();
    this.sound.playPurr();
    this.status(`${this.petName()}舔爪子洗脸中`);
  }
  cursor(x, y, followMouse) {
    const now = performance.now();
    if (this.dragging) return;
    const moved = !this.lastPointer || Math.hypot(x - this.lastPointer.x, y - this.lastPointer.y) >= 1;
    if (moved) {
      if (!this.manualSleep) this.wake(now);
      this.lastVisual = now;
    }
    this.model?.setCursor(x, y);
    if (moved && this.lastPointer) {
      this.model?.pointerMoved(x - this.lastPointer.x, y - this.lastPointer.y);
    }
    if (moved) this.lastPointer = { x, y };
    this.targetTilt = clamp((x - 199) / 8000, -0.026, 0.026);
    if (followMouse && this.prefs.keyboard) {
      this.lastMouse = now;
      this.targetMouseX = 70 + clamp((x - 199) / 19, -7, 7);
      this.targetMouseY = 287 + clamp((y - 139) / 22, -5, 5);
    }
  }
  mouse(toyMouse, side = 'left') {
    const now = performance.now();
    this.wake(now);
    this.model?.tapMouse(side);
    this.sound.playMouseClick();
    this.lastVisual = now;
    if (!this.prefs.keyboard || !toyMouse || this.dragging || this.petEnergy > 0.12 || this.poke > 0) return;
    this.lastMouse = now;
    this.mousePress = 1;
    const mBox = this.model?.regions?.()?.[4];
    const mx = mBox ? mBox[0] + mBox[2] * 0.5 : this.mouseX;
    const my = mBox ? mBox[1] + mBox[3] * 0.42 : this.mouseY - 6;
    this.effects.spawnMouseClick?.(mx, my, side);
    this.effects.spawnKeyRipple(this.mouseX + (side === 'right' ? 7 : -4), this.mouseY - 6, 'accent');
  }
  key(keyObj, label, linked = false) {
    if (this.model?.host) this.model.host.dataset.keyGate = JSON.stringify({
      keyboard: !!this.prefs.keyboard, standby: this.standbyMode, dragging: this.dragging,
      linked, petting: this.petEnergy > 0.12, poked: this.poke > 0
    });
    if (!keyObj || this.standbyMode || this.dragging) return;
    this.wake();
    if (!this.prefs.keyboard) return;
    if (!linked && (this.petEnergy > 0.12 || this.poke > 0)) return;
    this.typeEnergy = 1;
    this.model?.tapKey(keyObj.id);
    const space = keyObj.id === 'Space';
    this.sound.playKeyClick(keyObj.uCenter, keyObj.row, space);
    this.keyboard.pressKey(keyObj);
    this.effects.spawnKeyRipple(keyObj.cx, keyObj.cy, keyObj.type);
    const allowChips = this.prefs.showKeyChips !== false && !this.prefs.privacyMode;
    const visualLabel = allowChips ? (label || (linked ? this.linkedVisualLabel(keyObj) : null)) : null;
    if (visualLabel) {
      const kbBox = this.assets.layers.keyboard.box;
      const spread = linked ? (Math.random() - 0.5) * kbBox[2] * 0.28 : (Math.random() - 0.5) * 10;
      const spawnX = clamp(keyObj.cx + spread, kbBox[0] + 18, kbBox[0] + kbBox[2] - 18);
      const spawnY = kbBox[1] + 2 + (Math.random() - 0.5) * 6;
      this.effects.spawnFloatingLetter(visualLabel, spawnX, spawnY, keyObj.type);
    }

    const fire = (paw, x) => {
      const side = paw === this.leftPaw ? 'left' : 'right';
      strike(paw, x, keyObj.cy, this.assets.states['type_' + side].duration);
    };
    const holdingMouse = this.lean > 0.34 || this.mousePress > 0;
    if (space) {
      if (holdingMouse) return fire(this.rightPaw, keyObj.cx + 14);
      this.spaceToggle = (this.spaceToggle + 1) % 3;
      if (this.spaceToggle !== 1) fire(this.leftPaw, keyObj.cx - 16);
      if (this.spaceToggle !== 0) fire(this.rightPaw, keyObj.cx + 16);
    } else {
      const left = keyObj.uCenter < (holdingMouse ? -0.42 : -0.02);
      fire(left ? this.leftPaw : this.rightPaw, keyObj.cx);
    }
  }
  update(dt, now) {
    if (this.focusMode) {
      this.focusRemaining = Math.max(0, this.focusRemaining - dt);
      if (this.focusRemaining === 0) {
        this.focusMode = false;
        this.model?.setFocusMode(false);
        this.status('专注时间结束，休息一下吧');
        this.onFocusComplete?.();
      }
    }
    if (!this.standbyMode && !this.focusMode && !this.sleeping && !this.dragging
        && now - this.lastActivity > this.prefs.sleepMinutes * 60000) this.setSleep();
    const blend = speed => Math.min(1, dt * speed);
    this.sleepBlend = lerp(this.sleepBlend, Number(this.sleeping), blend(5));
    this.tilt = lerp(this.tilt, this.targetTilt, blend(9));
    this.poke = Math.max(0, this.poke - dt);
    this.petEnergy = Math.max(0, this.petEnergy - 1.1 * dt);
    this.typeEnergy = Math.max(0, this.typeEnergy - 3 * dt);
    this.mousePress = Math.max(0, this.mousePress - 7 * dt);
    this.tailPhase += dt * (this.sleeping ? 0.8 : 2 + this.petEnergy + this.typeEnergy);
    const free = !this.sleeping && !this.dragging && this.petEnergy <= 0.12 && this.poke === 0;
    const wantsMouse = free && this.prefs.keyboard && now - this.lastMouse < 510 && this.typeEnergy === 0;
    this.lean = lerp(this.lean, Number(wantsMouse), blend(12));
    this.mouseX = lerp(this.mouseX, this.targetMouseX, blend(14));
    this.mouseY = lerp(this.mouseY, this.targetMouseY, blend(14));
    const mouseTarget = wantsMouse || this.lean > 0.04 ? { x: this.mouseX, y: this.mouseY } : null;
    updatePaw(this.leftPaw, dt, mouseTarget && this.leftPaw.timer <= 0 ? mouseTarget : null, true, this.lean, this.mousePress);
    updatePaw(this.rightPaw, dt, null, false, this.lean, this.mousePress);
    this.blink = 0;
    if (free && now >= this.nextBlink) {
      const p = (now - this.nextBlink) / 180;
      if (p >= 1) this.nextBlink = now + 2700 + Math.random() * 2900;
      else this.blink = Math.sin(p * Math.PI);
    }
    if (this.sleeping && now > this.nextZzz) {
      this.effects.spawnParticle('zzz', 257, 75, { text: 'Zzz' });
      this.nextZzz = now + 1550;
    }
    this.keyboard.update(dt);
    this.effects.update(dt, now);
  }
  frameInterval(now) {
    const active = this.dragging || this.poke || this.petEnergy || this.typeEnergy
      || this.focusMode || this.model?.isHandoverActive?.()
      || this.leftPaw.timer || this.rightPaw.timer || this.lean > 0.08 || now < this.wakeUntil
      || (now >= this.nextBlink && now < this.nextBlink + 190 && !this.sleeping)
      || this.effects.floatingLetters.length || (this.effects.mouseClicks?.length ?? 0) || now - this.lastVisual < 135;
    return active ? 15 : 30;
  }
}

