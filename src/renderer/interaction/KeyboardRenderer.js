import { lerp } from '../geometry.js';

export class KeyboardRenderer {
  constructor(layout) {
    this.art = layout;
    // 两种模式：'cat'（默认：真实180°面向猫咪，QWER在画面右侧/猫左手，UIOP在画面左侧/猫右手）
    //         'mirror'（镜像左右：视觉从左到右排列，空格键依然稳居面向猫咪的最上排）
    this.mode = 'cat';

    // 透视桌面尺寸（围绕键盘中心点 centerX, centerY）
    [this.centerX, this.centerY] = layout.center;
    [this.topWidth, this.bottomWidth, this.height] = layout.size;

    this.keys = [];
    this.codeMap = new Map();
    this.buildLayout();
  }

  setMode(mode) {
    this.mode = mode;
    this.buildLayout();
  }

  setBox(box) {
    if (!Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isFinite(value))) return;
    this.art.box = box;
    this.positionCaps();
  }

  /**
   * 将键盘内部归一化坐标 u∈[-1, 1], v∈[0, 1] 投影为宠物局部坐标 (x, y)
   * v = 0 为紧贴猫咪的空格键一侧，v = 1 为靠近观看者的数字行一侧
   */
  project(u, v) {
    const halfW = lerp(this.topWidth, this.bottomWidth, v) * 0.5;
    return {
      x: this.centerX + u * halfW,
      y: this.centerY - this.height * 0.5 + v * this.height
    };
  }

  /** 构建完整 5 排键盘：最上排(row 0)=空格行，向下依次 Z-M、A-L、Q-P、数字行 */
  buildLayout() {
    this.keys = [];
    this.codeMap.clear();

    // 标准顺序（从左到右，空格行已置于最上排 row 0）
    const mirrorRows = [
      // Row 0（最上方，面向猫咪）：空格键居中！
      [
        { id: 'ControlLeft', label: 'Ctrl', w: 1.45, type: 'mod', codes: ['ControlLeft'] },
        { id: 'MetaLeft', label: '⌘', w: 1.25, type: 'mod', codes: ['MetaLeft'] },
        { id: 'AltLeft', label: 'Alt', w: 1.25, type: 'mod', codes: ['AltLeft'] },
        { id: 'Space', label: 'SPACE', w: 5.8, type: 'space', codes: ['Space'] },
        { id: 'AltRight', label: 'Alt', w: 1.25, type: 'mod', codes: ['AltRight', 'MetaRight'] },
        { id: 'Fn', label: 'Fn', w: 1.25, type: 'mod', codes: ['ContextMenu', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'] },
        { id: 'ControlRight', label: 'Ctrl', w: 1.45, type: 'mod', codes: ['ControlRight'] }
      ],
      // Row 1：Z - M 行
      [
        { id: 'ShiftLeft', label: 'Shift', w: 2.15, type: 'mod', codes: ['ShiftLeft'] },
        { id: 'KeyZ', label: 'Z', w: 1, codes: ['KeyZ'] },
        { id: 'KeyX', label: 'X', w: 1, codes: ['KeyX'] },
        { id: 'KeyC', label: 'C', w: 1, codes: ['KeyC'] },
        { id: 'KeyV', label: 'V', w: 1, codes: ['KeyV'] },
        { id: 'KeyB', label: 'B', w: 1, codes: ['KeyB'] },
        { id: 'KeyN', label: 'N', w: 1, codes: ['KeyN'] },
        { id: 'KeyM', label: 'M', w: 1, codes: ['KeyM'] },
        { id: 'Comma', label: ',', w: 1, codes: ['Comma'] },
        { id: 'Period', label: '.', w: 1, codes: ['Period'] },
        { id: 'Slash', label: '/', w: 1, codes: ['Slash'] },
        { id: 'ShiftRight', label: 'Shift', w: 2.15, type: 'mod', codes: ['ShiftRight'] }
      ],
      // Row 2：A - L 行
      [
        { id: 'CapsLock', label: 'Caps', w: 1.75, type: 'mod', codes: ['CapsLock'] },
        { id: 'KeyA', label: 'A', w: 1, codes: ['KeyA'] },
        { id: 'KeyS', label: 'S', w: 1, codes: ['KeyS'] },
        { id: 'KeyD', label: 'D', w: 1, codes: ['KeyD'] },
        { id: 'KeyF', label: 'F', w: 1, codes: ['KeyF'] },
        { id: 'KeyG', label: 'G', w: 1, codes: ['KeyG'] },
        { id: 'KeyH', label: 'H', w: 1, codes: ['KeyH'] },
        { id: 'KeyJ', label: 'J', w: 1, codes: ['KeyJ'] },
        { id: 'KeyK', label: 'K', w: 1, codes: ['KeyK'] },
        { id: 'KeyL', label: 'L', w: 1, codes: ['KeyL'] },
        { id: 'Semicolon', label: ';', w: 1, codes: ['Semicolon'] },
        { id: 'Quote', label: "'", w: 1, codes: ['Quote'] },
        { id: 'Enter', label: '↵', w: 2.05, type: 'accent', codes: ['Enter'] }
      ],
      // Row 3：Q - P 行
      [
        { id: 'Tab', label: 'Tab', w: 1.5, type: 'mod', codes: ['Tab'] },
        { id: 'KeyQ', label: 'Q', w: 1, codes: ['KeyQ'] },
        { id: 'KeyW', label: 'W', w: 1, codes: ['KeyW'] },
        { id: 'KeyE', label: 'E', w: 1, codes: ['KeyE'] },
        { id: 'KeyR', label: 'R', w: 1, codes: ['KeyR'] },
        { id: 'KeyT', label: 'T', w: 1, codes: ['KeyT'] },
        { id: 'KeyY', label: 'Y', w: 1, codes: ['KeyY'] },
        { id: 'KeyU', label: 'U', w: 1, codes: ['KeyU'] },
        { id: 'KeyI', label: 'I', w: 1, codes: ['KeyI'] },
        { id: 'KeyO', label: 'O', w: 1, codes: ['KeyO'] },
        { id: 'KeyP', label: 'P', w: 1, codes: ['KeyP'] },
        { id: 'BracketLeft', label: '[', w: 1, codes: ['BracketLeft'] },
        { id: 'BracketRight', label: ']', w: 1, codes: ['BracketRight'] },
        { id: 'Backslash', label: '\\', w: 1.3, type: 'mod', codes: ['Backslash'] }
      ],
      // Row 4（最下方，靠近观看者）：数字行
      [
        { id: 'Escape', label: 'Esc', w: 1.25, type: 'accent', codes: ['Escape', 'Backquote'] },
        { id: 'Digit1', label: '1', w: 1, codes: ['Digit1', 'F1'] },
        { id: 'Digit2', label: '2', w: 1, codes: ['Digit2', 'F2'] },
        { id: 'Digit3', label: '3', w: 1, codes: ['Digit3', 'F3'] },
        { id: 'Digit4', label: '4', w: 1, codes: ['Digit4', 'F4'] },
        { id: 'Digit5', label: '5', w: 1, codes: ['Digit5', 'F5'] },
        { id: 'Digit6', label: '6', w: 1, codes: ['Digit6', 'F6'] },
        { id: 'Digit7', label: '7', w: 1, codes: ['Digit7', 'F7'] },
        { id: 'Digit8', label: '8', w: 1, codes: ['Digit8', 'F8'] },
        { id: 'Digit9', label: '9', w: 1, codes: ['Digit9', 'F9'] },
        { id: 'Digit0', label: '0', w: 1, codes: ['Digit0', 'F10'] },
        { id: 'Minus', label: '-', w: 1, codes: ['Minus', 'F11'] },
        { id: 'Equal', label: '=', w: 1, codes: ['Equal', 'F12'] },
        { id: 'Backspace', label: '⌫', w: 1.55, type: 'mod', codes: ['Backspace', 'Delete'] }
      ]
    ];

    // 如果是「猫咪视角（默认）」，每行左右 180° 翻转，使猫咪左手对应 QWER/ASDF/ZXCV，右手对应 UIOP/HJKL/NM 与鼠标
    const activeRows = this.mode === 'cat'
      ? mirrorRows.map((row) => [...row].reverse())
      : mirrorRows;

    const padU = 0.055;
    const padV = 0.075;
    const usableU = 2 - padU * 2;
    const usableV = 1 - padV * 2;
    const rowV = usableV / activeRows.length;
    const gapU = 0.014;
    const gapV = 0.022;

    activeRows.forEach((row, rIdx) => {
      const totalUnits = row.reduce((s, k) => s + k.w, 0);
      let curU = -1 + padU;
      const v0 = padV + rIdx * rowV + gapV * 0.5;
      const v1 = padV + (rIdx + 1) * rowV - gapV * 0.5;

      row.forEach((k) => {
        const du = (k.w / totalUnits) * usableU;
        const u0 = curU + gapU * 0.5;
        const u1 = curU + du - gapU * 0.5;
        const uCenter = (u0 + u1) * 0.5;
        const vCenter = (v0 + v1) * 0.5;
        const centerPt = this.project(uCenter, vCenter);

        const keyObj = {
          id: k.id,
          label: k.label,
          row: rIdx,
          type: k.type || 'normal',
          u0, u1, v0, v1,
          uCenter, vCenter,
          cx: centerPt.x,
          cy: centerPt.y,
          press: 0,    // 实时下压量 0..1
          glow: 0,     // 暖水彩高亮 0..1
          quad: [
            this.project(u0, v0),
            this.project(u1, v0),
            this.project(u1, v1),
            this.project(u0, v1)
          ]
        };

        this.keys.push(keyObj);
        k.codes.forEach((c) => this.codeMap.set(c, keyObj));
        curU += du;
      });
    });
    this.positionCaps();
  }

  /** 根据按键 code 或字符精确找到对应键帽 */
  resolveKey(code, charText = '') {
    if (code && this.codeMap.has(code)) {
      return this.codeMap.get(code);
    }
    if (charText) {
      const ch = charText.slice(-1);
      const upper = ch.toUpperCase();
      if (/^[A-Z]$/.test(upper) && this.codeMap.has('Key' + upper)) {
        return this.codeMap.get('Key' + upper);
      }
      if (/^[0-9]$/.test(upper) && this.codeMap.has('Digit' + upper)) {
        return this.codeMap.get('Digit' + upper);
      }
      if (ch === ' ') return this.codeMap.get('Space');

      // 中文或其他符号：稳定映射到字母主键区（row 1~3）
      const letterKeys = this.keys.filter((k) => k.row >= 1 && k.row <= 3 && k.type === 'normal');
      if (letterKeys.length > 0) {
        return letterKeys[ch.charCodeAt(0) % letterKeys.length];
      }
    }
    return this.codeMap.get('Space') || this.keys[0];
  }

  pressKey(keyObj) {
    if (!keyObj) return;
    keyObj.press = 1.0;
    keyObj.glow = 1.0;
  }

  update(dt) {
    for (const k of this.keys) {
      if (k.press > 0) k.press = Math.max(0, k.press - dt * 7.2);
      if (k.glow > 0) k.glow = Math.max(0, k.glow - dt * 3.1);
    }
  }

  positionCaps() {
    // Centers and widths are measured on the supplied, unrotated art.
    const pictureRows = [
      { y: 171, h: 65, keys: [[316,84],[440,84],[568,86],[700,85],[826,85],[957,86],
        [1091,86],[1225,88],[1360,89],[1500,93],[1642,101],[1815,138]] },
      { y: 267, h: 69, keys: [[335,178],[525,86],[651,87],[780,86],[910,88],[1042,89],
        [1175,87],[1310,90],[1448,93],[1591,92],[1733,95],[1882,99]] },
      { y: 373, h: 70, keys: [[278,128],[438,101],[578,96],[718,95],[855,96],[992,92],
        [1132,90],[1275,94],[1421,97],[1573,100],[1715,96],[1864,125]] },
      { y: 484, h: 70, keys: [[230,104],[382,103],[526,104],[1018,676],[1504,91],
        [1650,104],[1795,103],[1936,104]] }
    ];
    const [x, y, width, height] = this.art.box;
    const physicalRows = pictureRows.map((row, rowIndex) => row.keys.map(([center, w], index) => ({
      x: x + (2094 - center) * width / 2016,
      y: y + (660 - row.y) * height / 564,
      w: w * width / 2016, h: row.h * height / 564,
      space: rowIndex === 3 && index === 3
    })).reverse()).reverse();
    [0, 1, 2, 3, 3].forEach((source, logicalRow) => {
      const logical = this.keys.filter(key => key.row === logicalRow);
      const caps = physicalRows[source];
      const available = logicalRow === 0 ? caps.filter(cap => !cap.space) : caps;
      const visibleSpace = caps.find(cap => cap.space);
      const regular = logical.filter(key => key.id !== 'Space');
      const split = logicalRow === 0 ? caps.indexOf(visibleSpace) : 0;
      const left = logicalRow === 0 ? logical.findIndex(key => key.id === 'Space') : 0;
      for (const [index, key] of regular.entries()) {
        let target = Math.round(index * (available.length - 1) / Math.max(1, regular.length - 1));
        if (logicalRow === 0) {
          target = index < left
            ? Math.max(0, split - left + index)
            : Math.min(available.length - 1, split + index - left);
        }
        key.cap = available[target];
      }
      for (const key of logical) {
        if (key.id === 'Space') key.cap = visibleSpace;
        key.cx = key.cap.x;
        key.cy = key.cap.y;
      }
    });
  }

  draw(ctx) {
    const { image, box } = this.art;
    ctx.drawImage(image, ...box);
    const highlighted = new Map();
    for (const key of this.keys) {
      if (key.glow <= 0.025) continue;
      if (key.glow > (highlighted.get(key.cap)?.glow ?? 0)) highlighted.set(key.cap, key);
    }
    for (const [cap, key] of highlighted) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cap.x - cap.w / 2, cap.y - cap.h / 2 + key.press * 1.3, cap.w, cap.h, 2.2);
      ctx.fillStyle = `rgba(245, 177, 62, ${key.glow * 0.43})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(153, 89, 38, ${key.press * 0.62})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}
