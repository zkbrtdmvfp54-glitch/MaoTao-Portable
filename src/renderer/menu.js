const api = window.maotao;

const COATS = [
  { id: 'maotao', name: '毛桃', full: '灰白虎斑（毛桃）', bg: 'linear-gradient(135deg, #c9c9c6 45%, #727471 46%, #f5eddd 82%)' },
  { id: 'calico', name: '三花', full: '三花猫', bg: 'conic-gradient(from 25deg, #faf7ef 0deg 145deg, #e48b3b 145deg 250deg, #262426 250deg 360deg)' },
  { id: 'ragdoll', name: '布偶', full: '双色布偶猫', bg: 'linear-gradient(135deg, #5f4b41 36%, #fcfaf5 38% 68%, #9c887b 70%)' },
  { id: 'orange', name: '橘猫', full: '暖橘虎斑猫', bg: 'linear-gradient(135deg, #ebb064 46%, #c97b34 48%, #fff7e8 84%)' },
  { id: 'black', name: '奶牛', full: '黑白奶牛猫', bg: 'linear-gradient(135deg, #1b1a1c 52%, #f6f1e8 53%)' },
  { id: 'siamese', name: '暹罗', full: '暹罗猫', bg: 'radial-gradient(circle at 50% 50%, #49332d 0 38%, #f0dfc4 42% 100%)' },
  { id: 'white', name: '白猫', full: '异瞳白猫', bg: 'linear-gradient(90deg, #faf8f2 35%, #45a3dc 36% 50%, #e6b839 51% 65%, #faf8f2 66%)' },
  { id: 'solidblack', name: '纯黑', full: '纯黑猫', bg: 'radial-gradient(circle at 38% 42%, #fffdf8 0 13%, #151416 17% 100%)' }
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
  { id: 'crown', label: '小皇冠' },
  { id: 'sprout', label: '小嫩芽' },
  { id: 'beret', label: '贝雷帽' },
  { id: 'halo', label: '天使光环' }
];

const coatGrid = document.querySelector('#coat-grid');
const eyeRow = document.querySelector('#eye-row');
const accRow = document.querySelector('#acc-row');
const coatLabel = document.querySelector('#coat-label');
const eyeLabel = document.querySelector('#eye-label');
const statusDot = document.querySelector('#status-dot');
const statusText = document.querySelector('#status-text');
const statsText = document.querySelector('#stats-text');
const versionTag = document.querySelector('#version-tag');
const rowLink = document.querySelector('#row-link');
const linkDesc = document.querySelector('#link-desc');
const volumeSlider = document.querySelector('#volume-slider');
const volumeVal = document.querySelector('#volume-val');
const chipTop = document.querySelector('#chip-top');
const btnVisible = document.querySelector('#btn-visible');

let current = null;

for (const coat of COATS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'coat-card';
  btn.dataset.coat = coat.id;
  const dot = document.createElement('span');
  dot.className = 'swatch';
  dot.style.background = coat.bg;
  const label = document.createElement('span');
  label.textContent = coat.name;
  btn.append(dot, label);
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
  btn.className = 'acc-btn';
  btn.dataset.acc = acc.id;
  btn.textContent = acc.label;
  btn.addEventListener('click', () => api.menuCommand({ type: 'set', key: 'accessory', value: acc.id }));
  accRow.appendChild(btn);
}

for (const tabBtn of document.querySelectorAll('.tab-btn')) {
  tabBtn.addEventListener('click', () => {
    const target = tabBtn.dataset.tab;
    for (const b of document.querySelectorAll('.tab-btn')) b.classList.toggle('active', b === tabBtn);
    for (const p of document.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.dataset.panel === target);
  });
}

function render(state) {
  if (!state) return;
  current = state;
  const { prefs, stats, listening, visible, unavailableReason, version, waylandSession } = state;

  if (version) versionTag.textContent = `v${version}`;
  statsText.textContent = `今日 ${stats?.keys ?? 0} 键 / ${stats?.clicks ?? 0} 击`;

  statusDot.className = 'status-dot' + (listening ? ' active' : prefs.focusMode ? ' focus' : '');
  statusText.textContent = prefs.standbyMode ? '待机中'
    : prefs.focusMode ? '专注中'
      : listening ? '跨应用联动中' : '就绪';

  const activeCoat = COATS.find(c => c.id === prefs.coat) || COATS[0];
  coatLabel.textContent = activeCoat.full;
  for (const el of coatGrid.querySelectorAll('.coat-card')) {
    el.classList.toggle('active', el.dataset.coat === prefs.coat);
  }

  const eyeId = prefs.eyeColor || 'auto';
  const activeEye = EYES.find(e => e.id === eyeId) || EYES[0];
  eyeLabel.textContent = activeEye.title;
  for (const el of eyeRow.querySelectorAll('.eye-dot')) {
    el.classList.toggle('active', el.dataset.eye === eyeId);
  }

  const accId = prefs.accessory || 'none';
  for (const el of accRow.querySelectorAll('.acc-btn')) {
    el.classList.toggle('active', el.dataset.acc === accId);
  }

  for (const el of document.querySelectorAll('[data-toggle]')) {
    const key = el.dataset.toggle;
    const on = Boolean(prefs[key]);
    el.classList.toggle('on', on);
    el.classList.toggle('active', on);
  }

  rowLink.classList.toggle('on', Boolean(listening));
  rowLink.disabled = Boolean(unavailableReason || prefs.standbyMode);
  linkDesc.textContent = prefs.standbyMode ? '待机模式下暂停跨应用联动'
    : unavailableReason ? unavailableReason
      : listening ? '正在同步外部键鼠，不记录输入文字' : '仅同步方向与类别，不记录文字';

  for (const group of document.querySelectorAll('.segmented')) {
    const key = group.dataset.group;
    for (const btn of group.querySelectorAll('button')) {
      btn.classList.toggle('active', String(prefs[key]) === String(btn.dataset.value));
    }
  }

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
  if (btn.dataset.toggle && current) {
    const key = btn.dataset.toggle;
    return api.menuCommand({ type: 'set', key, value: !current.prefs[key] });
  }
  if (btn.dataset.set) {
    const key = btn.dataset.set;
    const raw = btn.dataset.value;
    const value = key === 'sleepMinutes' ? Number(raw) : raw;
    return api.menuCommand({ type: 'set', key, value });
  }
  if (btn.dataset.action) {
    const type = btn.dataset.action;
    const value = btn.dataset.value;
    api.menuCommand({ type, value });
    if (type === 'typing' || type === 'toggle' || type === 'quit') api.closeMenu();
  }
});

volumeSlider.addEventListener('input', () => {
  const pct = Number(volumeSlider.value);
  volumeVal.textContent = `${pct}%`;
  api.menuCommand({ type: 'set', key: 'volume', value: Math.round(pct) / 100 });
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
