import { lerp } from '../geometry.js';

export function createPaw(restX, restY) {
  return {
    x: restX,
    y: restY,
    restX,
    restY,
    startX: restX,
    startY: restY,
    targetX: restX,
    targetY: restY,
    timer: 0,      // >0 表示正在执行三段式敲击动画（倒计时 1 -> 0）
    duration: 0.24,
    squashX: 1,
    squashY: 1,
    liftZ: 0
  };
}

export function strike(paw, tx, ty, duration = 0.25) {
  paw.startX = paw.x;
  paw.startY = paw.y;
  paw.targetX = tx;
  paw.targetY = ty - 2;
  paw.timer = 1.0;
  paw.duration = duration;
}

export function updatePaw(paw, dt, mouseOverride, isScreenLeft, lean, mouseClickPress) {
  if (mouseOverride && isScreenLeft) {
    const mx = mouseOverride.x + 2;
    const my = mouseOverride.y - 6 + mouseClickPress * 4.5;
    const gx = lerp(paw.restX, mx, lean);
    const gy = lerp(paw.restY, my, lean);
    paw.x += (gx - paw.x) * Math.min(1, dt * 22);
    paw.y += (gy - paw.y) * Math.min(1, dt * 22);
    paw.squashX = lerp(paw.squashX, 1 + mouseClickPress * 0.1, Math.min(1, dt * 22));
    paw.squashY = lerp(paw.squashY, 1 - mouseClickPress * 0.1, Math.min(1, dt * 22));
    paw.liftZ = 0;
    return;
  }

  if (paw.timer > 0) {
    paw.timer = Math.max(0, paw.timer - dt / paw.duration);
    const p = 1 - paw.timer; // 0 -> 1

    if (p < 0.22) {
      // 阶段1：预备轻抬（anticipation）
      const k = p / 0.22;
      const ease = Math.sin(k * Math.PI * 0.5);
      paw.x = lerp(paw.startX, lerp(paw.startX, paw.targetX, 0.45), ease);
      paw.y = lerp(paw.startY, paw.targetY - 22, ease);
      paw.liftZ = ease;
      paw.squashX = lerp(1, 0.90, ease);
      paw.squashY = lerp(1, 1.13, ease);
    } else if (p < 0.48) {
      // 阶段2：快速精准砸落到键帽 + 爪垫挤压（squash）
      const k = (p - 0.22) / 0.26;
      const ease = k * k * (3 - 2 * k);
      paw.x = lerp(lerp(paw.startX, paw.targetX, 0.45), paw.targetX, ease);
      paw.y = lerp(paw.targetY - 22, paw.targetY + 3.5, ease);
      paw.liftZ = 1 - ease;
      // 触键瞬间明显挤压弹性感
      const impact = Math.sin(k * Math.PI);
      paw.squashX = 1 + impact * 0.22;
      paw.squashY = 1 - impact * 0.18;
    } else {
      // 阶段3：弹性回弹归位
      const k = (p - 0.48) / 0.52;
      const bounce = Math.sin(k * Math.PI) * 11;
      const restX = paw.restX + (isScreenLeft ? 0 : -lean * 0.4 * 12);
      const restY = paw.restY;
      const ease = 1 - Math.pow(1 - k, 2.2);
      paw.x = lerp(paw.targetX, restX, ease);
      paw.y = lerp(paw.targetY + 3.5, restY, ease) - bounce;
      paw.liftZ = bounce / 18;
      paw.squashX = lerp(1.12, 1.0, ease);
      paw.squashY = lerp(0.89, 1.0, ease);
    }
  } else {
    const restX = paw.restX + (isScreenLeft ? 0 : -lean * 0.4 * 12);
    const restY = paw.restY;
    paw.x += (restX - paw.x) * Math.min(1, dt * 13);
    paw.y += (restY - paw.y) * Math.min(1, dt * 13);
    paw.squashX += (1 - paw.squashX) * Math.min(1, dt * 15);
    paw.squashY += (1 - paw.squashY) * Math.min(1, dt * 15);
    paw.liftZ += (0 - paw.liftZ) * Math.min(1, dt * 15);
  }
}
