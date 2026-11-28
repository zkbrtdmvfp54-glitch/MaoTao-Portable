const EDGE_SNAP_DISTANCE = 26;
const PEEK_VISIBLE_WIDTH = 220;
const PET_BASE_WIDTH = 420;

function visiblePeekWidth(bounds, visibleWidth = PEEK_VISIBLE_WIDTH, baseWidth = PET_BASE_WIDTH) {
  const width = Number.isFinite(bounds?.width) ? Math.max(1, Math.round(bounds.width)) : PET_BASE_WIDTH;
  const visible = Math.round(visibleWidth * width / Math.max(1, baseWidth));
  return Math.max(1, Math.min(visible, width));
}

function edgeSide(bounds, workArea, threshold = EDGE_SNAP_DISTANCE) {
  const leftGap = Math.abs(bounds.x - workArea.x);
  const rightGap = Math.abs(bounds.x + bounds.width - workArea.x - workArea.width);
  const left = leftGap <= threshold;
  const right = rightGap <= threshold;
  if (!left && !right) return null;
  if (left && right) return leftGap <= rightGap ? 'left' : 'right';
  return left ? 'left' : 'right';
}

function peekBounds(bounds, workArea, side, visibleWidth = visiblePeekWidth(bounds)) {
  if (side !== 'left' && side !== 'right') throw new TypeError('side must be left or right');
  const visible = Math.max(1, Math.min(Math.round(visibleWidth), bounds.width));
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);
  return {
    ...bounds,
    x: side === 'left'
      ? workArea.x - bounds.width + visible
      : workArea.x + workArea.width - visible,
    y: Math.max(workArea.y, Math.min(bounds.y, maxY))
  };
}

function interpolateBounds(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  return {
    ...from,
    x: Math.round(from.x + (to.x - from.x) * eased),
    y: Math.round(from.y + (to.y - from.y) * eased)
  };
}

module.exports = { EDGE_SNAP_DISTANCE, PEEK_VISIBLE_WIDTH, visiblePeekWidth, edgeSide, peekBounds, interpolateBounds };
