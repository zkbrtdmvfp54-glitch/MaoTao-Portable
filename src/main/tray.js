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
    choice('液态黑猫', 'coat', 'solidblack'), choice('灰白虎斑（毛桃）', 'coat', 'maotao'),
    choice('三花猫', 'coat', 'calico'), choice('双色布偶猫', 'coat', 'ragdoll'),
    choice('橘猫', 'coat', 'orange'), choice('黑白奶牛猫', 'coat', 'black'),
    choice('暹罗猫', 'coat', 'siamese'), choice('异瞳白猫', 'coat', 'white')
  ];
  const eyeMenu = [
    choice('默认瞳色', 'eyeColor', 'auto'), choice('蓝宝石', 'eyeColor', 'blue'),
    choice('琥珀金', 'eyeColor', 'amber'), choice('祖母绿', 'eyeColor', 'emerald'),
    choice('紫罗兰', 'eyeColor', 'violet'), choice('樱花粉', 'eyeColor', 'rose'),
    choice('异瞳蓝金', 'eyeColor', 'odd')
  ];
  const accessoryMenu = [
    choice('无配饰', 'accessory', 'none'),
    choice('迷你小皇冠', 'accessory', 'crown'), choice('经典头戴耳机', 'accessory', 'headphones'),
    choice('复古细梁耳机', 'accessory', 'retro'), choice('招财铃铛项圈', 'accessory', 'bell'),
    choice('嘴叼小鱼干', 'accessory', 'fish'), choice('暖冬小红围巾', 'accessory', 'scarf'),
    choice('迷你巫师尖帽', 'accessory', 'wizard'), choice('伴星发卡', 'accessory', 'star'),
    choice('酷盖墨镜', 'accessory', 'shades'), choice('画家贝雷帽', 'accessory', 'beret'),
    choice('小嫩芽', 'accessory', 'sprout')
  ];
  const sizeMenu = [choice('小', 'size', 'small'), choice('中', 'size', 'medium'), choice('大', 'size', 'large')];
  const interactMenu = [
    { label: '摸摸头', click: () => actions.perform('pet') },
    { label: '戳鼻子', click: () => actions.perform('poke') },
    { type: 'separator' },
    { label: '玩毛线球', click: () => actions.perform('yarn') },
    { label: '捉蝴蝶', click: () => actions.perform('butterfly') },
    { label: '舔爪洗脸', click: () => actions.perform('wash') },
    { type: 'separator' },
    { label: '睡觉 / 唤醒', click: () => actions.perform('sleep') }
  ];
  const windowMenu = [
    { label: visible ? '隐藏宠物' : '显示宠物', click: actions.toggle },
    { type: 'separator' },
    { label: '瞳色', submenu: eyeMenu },
    { label: '头部配饰', submenu: accessoryMenu },
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
    { label: '键盘样式', submenu: [
      choice('经典奶白', 'keyboardStyle', 'cream'),
      choice('抹茶青白', 'keyboardStyle', 'matcha'),
      choice('樱花粉白', 'keyboardStyle', 'sakura'),
      choice('曜石暗夜', 'keyboardStyle', 'obsidian')
    ] },
    { label: '键盘视角', submenu: [choice('猫咪视角', 'view', 'cat'), choice('镜像左右', 'view', 'mirror')] },
    { label: '自动休眠', submenu: [2, 5, 10].map(value => choice(value + ' 分钟', 'sleepMinutes', value)) },
    { type: 'separator' },
    { label: '中英文试打…', click: actions.typing }
  ];
  store.rollover();
  return Menu.buildFromTemplate([
    { label: '毛桃桌面宠物', enabled: false },
    { label: '打开控制面板…', click: () => actions.openMenu?.() },
    { type: 'separator' },
    { label: '更换花色', submenu: coatMenu },
    toggle('专注模式（25 分钟）', 'focusMode'),
    toggle('隐私模式 (Alt+Shift+P)', 'privacyMode'),
    toggle('锁定点击穿透 (Alt+Shift+L)', 'clickThrough'),
    toggle('显示键盘与鼠标', 'keyboard'),
    toggle('左手鼠标', 'leftMouse'),
    toggle('数字键盘 (98%)', 'numpad'),
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
