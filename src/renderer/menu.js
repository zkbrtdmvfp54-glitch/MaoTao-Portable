const api = window.maotao;

const COATS = [
  { id: 'solidblack', name: '液态黑猫', full: '液态黑猫', bg: 'radial-gradient(circle at 38% 42%, #ffffff 0 15%, #111111 20% 100%)' },
  { id: 'maotao', name: '灰白毛桃', full: '灰白虎斑（毛桃）', bg: 'linear-gradient(135deg, #c9c9c6 45%, #727471 46%, #f5eddd 82%)' },
  { id: 'calico', name: '三花猫', full: '三花猫', bg: 'conic-gradient(from 25deg, #faf7ef 0deg 145deg, #e48b3b 145deg 250deg, #262426 250deg 360deg)' },
  { id: 'ragdoll', name: '双色布偶', full: '双色布偶猫', bg: 'linear-gradient(135deg, #5f4b41 36%, #fcfaf5 38% 68%, #9c887b 70%)' },
  { id: 'orange', name: '暖橘虎斑', full: '暖橘虎斑猫', bg: 'linear-gradient(135deg, #ebb064 46%, #c97b34 48%, #fff7e8 84%)' },
  { id: 'black', name: '黑白奶牛', full: '黑白奶牛猫', bg: 'linear-gradient(135deg, #1b1a1c 52%, #f6f1e8 53%)' },
  { id: 'siamese', name: '暹罗猫', full: '暹罗猫', bg: 'radial-gradient(circle at 50% 50%, #49332d 0 38%, #f0dfc4 42% 100%)' },
  { id: 'white', name: '异瞳白猫', full: '异瞳白猫', bg: 'linear-gradient(90deg, #faf8f2 35%, #45a3dc 36% 50%, #e6b839 51% 65%, #faf8f2 66%)' }
];

const EYES = [
  { id: 'auto', title: '默认瞳色', bg: 'conic-gradient(#45a3e5, #e8b838, #5ec27e, #e688a8, #45a3e5)' },
  { id: 'blue', title: '蓝宝石', bg: '#45a3e5' },
  { id: 'amber', title: '琥珀金', bg: '#e8b838' },
  { id: 'emerald', title: '祖母绿', bg: '#5ec27e' },
  { id: 'violet', title: '紫罗兰', bg: '#9a7ee0' },
  { id: 'rose', title: '樱花粉', bg: '#e688a8' },
  { id: 'odd', title: '异瞳蓝金', bg: 'linear-gradient(90deg, #45a3e5 50%, #e8b838 50%)' }
];

const ACCESSORIES = [
  { id: 'none', label: '无配饰' },
  { id: 'crown', label: '迷你皇冠' },
  { id: 'headphones', label: '经典头戴' },
  { id: 'retro', label: '复古细梁' },
  { id: 'bell', label: '铃铛项圈' },
  { id: 'fish', label: '嘴叼鱼干' },
  { id: 'scarf', label: '暖冬围巾' },
  { id: 'wizard', label: '巫师尖帽' },
  { id: 'star', label: '伴星发卡' },
  { id: 'shades', label: '酷盖墨镜' },
  { id: 'beret', label: '贝雷帽' },
  { id: 'sprout', label: '小嫩芽' },
  { id: 'halo', label: '天使光环' }
];

const ACC_COLORS = [
  { id: 'auto', title: '默认原色', bg: 'conic-gradient(#f4c44e, #d6453d, #2d3561, #77a687, #f4c44e)' },
  { id: 'sage', title: '鼠尾草绿', bg: '#6fa382' },
  { id: 'obsidian', title: '极夜黑', bg: '#232220' },
  { id: 'cream', title: '奶油白', bg: '#f3ede0' },
  { id: 'caramel', title: '焦糖橘', bg: '#eb8c34' },
  { id: 'mist', title: '雾霾蓝', bg: '#6d8fb3' },
  { id: 'sakura', title: '樱花粉', bg: '#e89bb0' }
];

const KB_STYLES = [
  { id: 'cream', label: '奶油复古', dots: ['#1c1d1a', '#fbfbf3', '#f2b25c'] },
  { id: 'matcha', label: '抹茶拿铁', dots: ['#2d3b32', '#f7f9f2', '#96b992'] },
  { id: 'sakura', label: '樱花奶白', dots: ['#4a3538', '#fff8f9', '#e8869a'] },
  { id: 'obsidian', label: '极夜暗黑', dots: ['#141518', '#2c2f36', '#e5a44d'] }
];

const coatGrid = document.querySelector('#coat-grid');
const eyeRow = document.querySelector('#eye-row');
const accRow = document.querySelector('#acc-row');
const accColorRow = document.querySelector('#acc-color-row');
const accColorLabel = document.querySelector('#acc-color-label');
const kbStyleRow = document.querySelector('#kb-style-row');
const coatLabel = document.querySelector('#coat-label');
const eyeLabel = document.querySelector('#eye-label');
const brandDot = document.querySelector('#brand-dot');
const dockCompanionDot = document.querySelector('#dock-companion-dot');
const dockFocusDot = document.querySelector('#dock-focus-dot');
const dockFocusLabel = document.querySelector('#dock-focus-label');
const statusDot = document.querySelector('#status-dot');
const statusText = document.querySelector('#status-text');
const statsText = document.querySelector('#stats-text');
const versionTag = document.querySelector('#version-tag');
const focusBadge = document.querySelector('#focus-badge');
const focusClock = document.querySelector('#focus-clock');
const focusRounds = document.querySelector('#focus-rounds');
const btnFocusMain = document.querySelector('#btn-focus-main');
const btnFocusSkip = document.querySelector('#btn-focus-skip');
const btnFocusReset = document.querySelector('#btn-focus-reset');
const rhythmMeta = document.querySelector('#rhythm-meta');
const inputFocusMin = document.querySelector('#input-focus-min');
const inputBreakMin = document.querySelector('#input-break-min');
const scaleSlider = document.querySelector('#scale-slider');
const scaleReadout = document.querySelector('#scale-readout');
const pillLink = document.querySelector('#pill-link');
const volumeSlider = document.querySelector('#volume-slider');
const volumeVal = document.querySelector('#volume-val');
const chipTop = document.querySelector('#chip-top');
const btnVisible = document.querySelector('#btn-visible');

let current = null;

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function catAvatarSvg(id) {
  const cfgs = {
    solidblack: { head: '#161616', earL: '#161616', earR: '#161616', inner: '#2e2a2c', eyeL: '#f4cc58', eyeR: '#f4cc58', nose: '#3a3538', extra: '' },
    maotao: { head: '#cbc7be', earL: '#b8b4ab', earR: '#b8b4ab', inner: '#e8b8b8', eyeL: '#63a8d9', eyeR: '#63a8d9', nose: '#e08e8a', extra: '<path d="M11 8.5v3.2M14 8v3.8M17 8.5v3.2" stroke="#6d6a63" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="14" cy="20.5" rx="5.5" ry="3.4" fill="#f7f2e8"/>' },
    calico: { head: '#fbf7ef', earL: '#e58d3c', earR: '#262426', inner: '#f0bcc0', eyeL: '#e5a93c', eyeR: '#e5a93c', nose: '#e5928e', extra: '<path d="M5 13c1.5-4 5-5.5 7-4.5-1 3-3 5-6.5 5.5z" fill="#e58d3c"/><path d="M23 13c-1.5-4-5-5.5-7-4.5 1 3 3 5 6.5 5.5z" fill="#262426"/>' },
    ragdoll: { head: '#fcfaf5', earL: '#6a554b', earR: '#6a554b', inner: '#e8c4c0', eyeL: '#5da6e3', eyeR: '#5da6e3', nose: '#e09692', extra: '<path d="M6 12c2-3.5 5-4.5 8-1.5 3-3 6-2 8 1.5v3c-2.5 0-5.5-1.5-8-4-2.5 2.5-5.5 4-8 4z" fill="#7d675c" opacity="0.72"/>' },
    orange: { head: '#eda95c', earL: '#e29642', earR: '#e29642', inner: '#f3c3be', eyeL: '#d9982c', eyeR: '#d9982c', nose: '#e08d86', extra: '<path d="M11 8.5v3.2M14 8v3.8M17 8.5v3.2" stroke="#c27225" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="14" cy="20.5" rx="5.2" ry="3.2" fill="#fff6e6"/>' },
    black: { head: '#faf7f0', earL: '#1d1c1e', earR: '#1d1c1e', inner: '#4a4548', eyeL: '#8ec45c', eyeR: '#8ec45c', nose: '#e09290', extra: '<path d="M4.8 14.5C5.2 9.5 9.2 7.5 14 7.5s8.8 2 9.2 7c-2.8-.6-6-1.2-9.2-3.2-3.2 2-6.4 2.6-9.2 3.2z" fill="#1d1c1e"/>' },
    siamese: { head: '#efe0c6', earL: '#4d362f', earR: '#4d362f', inner: '#6e5248', eyeL: '#52b0f0', eyeR: '#52b0f0', nose: '#3a2620', extra: '<ellipse cx="14" cy="17.5" rx="6.2" ry="4.8" fill="#523a32" opacity="0.88"/>' },
    white: { head: '#ffffff', earL: '#ffffff', earR: '#ffffff', inner: '#f2b8be', eyeL: '#4da8e8', eyeR: '#e8b63a', nose: '#eb9ba0', extra: '' }
  };
  const c = cfgs[id] || cfgs.maotao;
  return `<svg viewBox="0 0 28 28" width="22" height="22" style="flex-shrink:0;display:block" aria-hidden="true">` +
    `<path d="M5.5 13L4.5 4.8l6.2 3.8z" fill="${c.earL}" stroke="#3a322d" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M22.5 13l1-8.2-6.2 3.8z" fill="${c.earR}" stroke="#3a322d" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M6.6 11.2L6.2 6.8l3.4 2.2z" fill="${c.inner}"/><path d="M21.4 11.2l.4-4.4-3.4 2.2z" fill="${c.inner}"/>` +
    `<ellipse cx="14" cy="16" rx="9.5" ry="8.2" fill="${c.head}" stroke="#3a322d" stroke-width="1.4"/>` +
    `${c.extra}` +
    `<circle cx="10.4" cy="15.8" r="2.1" fill="${c.eyeL}"/><circle cx="10.4" cy="15.8" r="1.05" fill="#141414"/>` +
    `<circle cx="17.6" cy="15.8" r="2.1" fill="${c.eyeR}"/><circle cx="17.6" cy="15.8" r="1.05" fill="#141414"/>` +
    `<ellipse cx="14" cy="18.2" rx="1.2" ry="0.85" fill="${c.nose}"/></svg>`;
}

for (const coat of COATS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'skin-pill';
  btn.dataset.coat = coat.id;
  const avatar = document.createElement('span');
  avatar.className = 'skin-avatar';
  avatar.innerHTML = catAvatarSvg(coat.id);
  const label = document.createElement('span');
  label.textContent = coat.name;
  btn.append(avatar, label);
  btn.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'coat', value: coat.id }));
  coatGrid.appendChild(btn);
}

for (const eye of EYES) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'eye-dot';
  dot.dataset.eye = eye.id;
  dot.title = eye.title;
  dot.style.background = eye.bg;
  dot.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'eyeColor', value: eye.id }));
  eyeRow.appendChild(dot);
}

for (const acc of ACCESSORIES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill-btn';
  btn.dataset.acc = acc.id;
  btn.textContent = acc.label;
  btn.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'accessory', value: acc.id }));
  accRow.appendChild(btn);
}

for (const col of ACC_COLORS) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'eye-dot';
  dot.dataset.acccol = col.id;
  dot.title = col.title;
  dot.style.background = col.bg;
  dot.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'accessoryColor', value: col.id }));
  accColorRow.appendChild(dot);
}

for (const st of KB_STYLES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-pill';
  btn.dataset.kb = st.id;
  const text = document.createElement('span');
  text.textContent = st.label;
  const dots = document.createElement('span');
  dots.className = 'palette-dots';
  for (const hex of st.dots) {
    const i = document.createElement('i');
    i.style.background = hex;
    dots.appendChild(i);
  }
  btn.append(text, dots);
  btn.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'keyboardStyle', value: st.id }));
  kbStyleRow.appendChild(btn);
}

for (const tabBtn of document.querySelectorAll('.dock-trigger')) {
  tabBtn.addEventListener('click', () => {
    const target = tabBtn.dataset.tab;
    for (const b of document.querySelectorAll('.dock-trigger')) b.classList.toggle('active', b === tabBtn);
    for (const p of document.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.dataset.panel === target);
  });
}

function render(state) {
  if (!state) return;
  current = state;
  const { prefs, stats, pomodoro, listening, visible, unavailableReason, version, waylandSession } = state;

  if (version) versionTag.textContent = `v${version}`;
  statsText.textContent = `今日 ${stats?.keys ?? 0} 键 / ${stats?.clicks ?? 0} 击`;

  const pom = pomodoro || { phase: 'idle', paused: false, remainingSec: (prefs.focusMinutes || 25) * 60, rounds: 0 };
  const clockStr = formatClock(pom.remainingSec);

  statusDot.className = 'status-dot' + (prefs.privacyMode ? ' privacy' : pom.phase === 'break' ? ' break' : (listening || pom.phase === 'focus') ? ' active' : '');
  statusText.textContent = prefs.privacyMode ? '隐私模式'
    : pom.phase === 'focus' ? (pom.paused ? '专注已暂停' : `专注中 ${clockStr}`)
      : pom.phase === 'break' ? `休息中 ${clockStr}`
        : listening ? '跨应用联动中' : '就绪';

  const activeCoat = COATS.find(c => c.id === prefs.coat) || COATS[0];
  coatLabel.textContent = activeCoat.full;
  brandDot.style.background = activeCoat.bg;
  dockCompanionDot.style.background = activeCoat.bg;
  for (const el of coatGrid.querySelectorAll('.skin-pill')) {
    el.classList.toggle('active', el.dataset.coat === prefs.coat);
  }

  const eyeId = prefs.eyeColor || 'auto';
  const activeEye = EYES.find(e => e.id === eyeId) || EYES[0];
  eyeLabel.textContent = activeEye.title;
  for (const el of eyeRow.querySelectorAll('.eye-dot')) {
    el.classList.toggle('active', el.dataset.eye === eyeId);
  }

  const accId = prefs.accessory || 'none';
  for (const el of accRow.querySelectorAll('.pill-btn')) {
    el.classList.toggle('active', el.dataset.acc === accId);
  }

  const accColId = prefs.accessoryColor || 'auto';
  const activeAccCol = ACC_COLORS.find(c => c.id === accColId) || ACC_COLORS[0];
  accColorLabel.textContent = activeAccCol.title;
  for (const el of accColorRow.querySelectorAll('.eye-dot')) {
    el.classList.toggle('active', el.dataset.acccol === accColId);
  }

  const kbId = prefs.keyboardStyle || 'cream';
  for (const el of kbStyleRow.querySelectorAll('.theme-pill')) {
    el.classList.toggle('active', el.dataset.kb === kbId);
  }

  // Pomodoro tab & dock indicator
  dockFocusDot.className = 'dock-status-dot' + (pom.phase === 'focus' ? ' focus' : pom.phase === 'break' ? ' break' : '');
  dockFocusLabel.textContent = pom.phase === 'idle' ? '专注' : `专注 ${clockStr}`;
  focusBadge.className = 'status-badge' + (pom.phase === 'focus' ? ' focus' : pom.phase === 'break' ? ' break' : '');
  focusBadge.textContent = pom.phase === 'focus' ? (pom.paused ? '已暂停' : '专注中') : pom.phase === 'break' ? '休息中' : '待机';
  focusClock.textContent = clockStr;
  focusRounds.textContent = `今日 ${pom.rounds ?? 0} 轮`;
  btnFocusMain.textContent = pom.phase === 'idle' ? '▶ 开始专注' : (pom.paused ? '▶ 继续专注' : '⏸ 暂停');
  btnFocusSkip.disabled = pom.phase === 'idle';
  btnFocusReset.disabled = pom.phase === 'idle';

  const fMin = prefs.focusMinutes || 25;
  const bMin = prefs.breakMinutes || 5;
  rhythmMeta.textContent = `${fMin}/${bMin} 分`;
  if (document.activeElement !== inputFocusMin) inputFocusMin.value = String(fMin);
  if (document.activeElement !== inputBreakMin) inputBreakMin.value = String(bMin);
  for (const btn of document.querySelectorAll('[data-rhythm]')) {
    btn.classList.toggle('active', btn.dataset.rhythm === `${fMin},${bMin}`);
  }

  // Scale slider & ticks
  const scalePct = Math.round((Number.isFinite(prefs.scale) ? prefs.scale : 1) * 100);
  scaleSlider.value = String(scalePct);
  scaleReadout.textContent = `${scalePct}%`;
  for (const tick of document.querySelectorAll('[data-scale]')) {
    tick.classList.toggle('active', Math.round(Number(tick.dataset.scale) * 100) === scalePct);
  }

  for (const el of document.querySelectorAll('[data-toggle]')) {
    const key = el.dataset.toggle;
    const on = Boolean(prefs[key]);
    el.classList.toggle('on', on);
    el.classList.toggle('active', on);
  }

  pillLink.classList.toggle('active', Boolean(listening));
  pillLink.disabled = Boolean(unavailableReason || prefs.standbyMode);

  const volPct = Math.round((prefs.volume ?? 0.7) * 100);
  volumeSlider.value = String(volPct);
  volumeVal.textContent = `${volPct}%`;

  chipTop.disabled = Boolean(waylandSession);
  btnVisible.textContent = visible ? '隐藏宠物' : '显示宠物';
}

document.addEventListener('click', event => {
  const btn = event.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'btn-close') return api.closeMenu();
  if (btn.id === 'btn-focus-main') {
    const idle = !current?.pomodoro || current.pomodoro.phase === 'idle';
    return api.menuCommand({ type: idle ? 'focusStart' : 'focusPause' });
  }
  if (btn.id === 'btn-focus-skip') return api.menuCommand({ type: 'focusSkip' });
  if (btn.id === 'btn-focus-reset') return api.menuCommand({ type: 'focusReset' });
  if (btn.dataset.rhythm) {
    const [f, b] = btn.dataset.rhythm.split(',').map(Number);
    api.menuCommand({ type: 'set', key: 'focusMinutes', value: f });
    api.menuCommand({ type: 'set', key: 'breakMinutes', value: b });
    return;
  }
  if (btn.dataset.scale) {
    return api.menuCommand({ type: 'set', key: 'scale', value: Number(btn.dataset.scale) });
  }
  if (btn.dataset.toggle && current) {
    const key = btn.dataset.toggle;
    return api.menuCommand({ type: 'set', key, value: !current.prefs[key] });
  }
  if (btn.dataset.action) {
    const type = btn.dataset.action;
    const value = btn.dataset.value;
    api.menuCommand({ type, value });
    if (type === 'typing' || type === 'toggle' || type === 'quit') api.closeMenu();
  }
});

scaleSlider.addEventListener('input', () => {
  const pct = Number(scaleSlider.value);
  scaleReadout.textContent = `${pct}%`;
  api.menuCommand({ type: 'set', key: 'scale', value: Math.round(pct) / 100 });
});

volumeSlider.addEventListener('input', () => {
  const pct = Number(volumeSlider.value);
  volumeVal.textContent = `${pct}%`;
  api.menuCommand({ type: 'set', key: 'volume', value: Math.round(pct) / 100 });
});

inputFocusMin.addEventListener('change', () => {
  const val = Math.max(1, Math.min(120, Math.round(Number(inputFocusMin.value) || 25)));
  api.menuCommand({ type: 'set', key: 'focusMinutes', value: val });
});
inputBreakMin.addEventListener('change', () => {
  const val = Math.max(1, Math.min(60, Math.round(Number(inputBreakMin.value) || 5)));
  api.menuCommand({ type: 'set', key: 'breakMinutes', value: val });
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') api.closeMenu();
});

const headerEl = document.querySelector('.header');
let draggingMenu = false;
const stopMenuDrag = () => {
  if (!draggingMenu) return;
  draggingMenu = false;
  headerEl?.classList.remove('dragging');
  api.menuDragEnd?.();
};
headerEl?.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return;
  draggingMenu = true;
  headerEl.classList.add('dragging');
  try { headerEl.setPointerCapture(event.pointerId); } catch {}
  api.menuDragStart?.();
});
headerEl?.addEventListener('pointerup', stopMenuDrag);
headerEl?.addEventListener('lostpointercapture', stopMenuDrag);
window.addEventListener('blur', stopMenuDrag);

api.onMenuState(render);
api.getMenuState().then(render);
