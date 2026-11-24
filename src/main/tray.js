const path = require('node:path');
const { Menu, Tray, nativeImage } = require('electron');

function setupTray(actions) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/pet/processed/tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('毛桃桌面宠物');
  tray.on('click', actions.toggle);
  return tray;
}
function buildMenu(store, actions, listening, visible, unavailableReason = '') {
  const prefs = store.prefs;
  const waylandSession = process.platform === 'linux' && (
    process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
    (Boolean(process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY)
  );
  const choice = (label, key, value) => ({
    label, type: 'radio', checked: prefs[key] === value, click: () => actions.set(key, value)
  });
  const toggle = (label, key) => ({
    label, type: 'checkbox', checked: prefs[key], click: item => actions.set(key, item.checked)
  });
  const coatMenu = [
    choice('黑白奶牛猫', 'coat', 'black'), choice('三花猫', 'coat', 'calico'),
    choice('暹罗猫', 'coat', 'siamese'), choice('灰白虎斑（毛桃）', 'coat', 'maotao'),
    choice('橘猫', 'coat', 'orange'), choice('异瞳白猫', 'coat', 'white'),
    choice('纯黑猫', 'coat', 'solidblack')
  ];
  const sizeMenu = [choice('小', 'size', 'small'), choice('中', 'size', 'medium'), choice('大', 'size', 'large')];
  const interactMenu = [
    { label: '摸摸头', click: () => actions.perform('pet') },
    { label: '戳鼻子', click: () => actions.perform('poke') },
    { type: 'separator' },
    { label: '玩毛线球', click: () => actions.perform('yarn') },
    { label: '捉蝴蝶', click: () => actions.perform('butterfly') },
    { type: 'separator' },
    { label: '睡觉 / 唤醒', click: () => actions.perform('sleep') }
  ];
  const windowMenu = [
    { label: visible ? '隐藏宠物' : '显示宠物', click: actions.toggle },
    { type: 'separator' },
    { label: '大小', submenu: sizeMenu },
    { label: '位置', submenu: [
      { label: '停靠左下', click: () => actions.dock('left') },
      { label: '停靠右下', click: () => actions.dock('right') },
      { label: '居中', click: actions.center },
      { label: '复位到主屏', click: actions.reset }
    ] },
    { type: 'separator' },
    { ...toggle(waylandSession ? '常驻置顶（Wayland 不支持）' : '常驻置顶', 'top'), enabled: !waylandSession },
    toggle('关闭时隐藏至托盘', 'hideOnClose')
  ];
  const soundMenu = [
    toggle('音效', 'sound'),
    toggle('键盘音效', 'keySound'),
    { label: '音量', submenu: [0, 0.25, 0.5, 0.7, 1].map(value => choice(Math.round(value * 100) + '%', 'volume', value)) },
    { label: '反馈主题', submenu: [
      choice('暖米', 'theme', 'cream'), choice('薄荷', 'theme', 'mint'),
      choice('星夜', 'theme', 'night'), choice('青绿', 'theme', 'green')
    ] }
  ];
  const inputMenu = [
    { label: '跨应用输入联动' + (prefs.standbyMode ? '（待机中）' : unavailableReason.includes('Wayland') ? '（Wayland 暂不可用）' : unavailableReason ? '（暂不可用）' : listening ? '（监听中）' : '（已暂停）'),
      type: 'checkbox', checked: listening, enabled: !unavailableReason && !prefs.standbyMode, click: actions.toggleInput },
    { type: 'separator' },
    { label: '键盘视角', submenu: [choice('猫咪视角', 'view', 'cat'), choice('镜像左右', 'view', 'mirror')] },
    { label: '自动休眠', submenu: [2, 5, 10].map(value => choice(value + ' 分钟', 'sleepMinutes', value)) },
    { type: 'separator' },
    { label: '中英文试打…', click: actions.typing }
  ];
  store.rollover();
  return Menu.buildFromTemplate([
    { label: '毛桃桌面宠物', enabled: false },
    { type: 'separator' },
    { label: prefs.standbyMode ? '退出待机' : '进入待机', type: 'checkbox', checked: Boolean(prefs.standbyMode),
      click: () => actions.set('standbyMode', !prefs.standbyMode) },
    { label: '更换花色', submenu: coatMenu },
    toggle('专注模式（25 分钟）', 'focusMode'),
    toggle('显示键盘与鼠标', 'keyboard'),
    { type: 'separator' },
    { label: '互动动作', submenu: interactMenu },
    { label: '外观与窗口', submenu: windowMenu },
    { label: '声音与反馈', submenu: soundMenu },
    { label: '键盘与输入', submenu: inputMenu },
    { type: 'separator' },
    { label: '退出程序', click: actions.quit }
  ]);
}
module.exports = { setupTray, buildMenu };
