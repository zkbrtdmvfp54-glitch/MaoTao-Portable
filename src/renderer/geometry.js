export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 在任意凸四边形（用于透视键盘底座与键帽）上绘制柔和圆角路径
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number}>} pts 顺时针4个顶点 [tl, tr, br, bl]
 * @param {number} radius 圆角半径
 */
export function traceRoundedQuad(ctx, pts, radius) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const curr = pts[i];
    const next = pts[(i + 1) % 4];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const len1 = Math.hypot(v1x, v1y) || 1;

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y) || 1;

    const r = Math.min(radius, len1 * 0.42, len2 * 0.42);
    const startX = curr.x + (v1x / len1) * r;
    const startY = curr.y + (v1y / len1) * r;
    const endX = curr.x + (v2x / len2) * r;
    const endY = curr.y + (v2y / len2) * r;

    if (i === 0) {
      ctx.moveTo(startX, startY);
    } else {
      ctx.lineTo(startX, startY);
    }
    ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
  }
  ctx.closePath();
}
