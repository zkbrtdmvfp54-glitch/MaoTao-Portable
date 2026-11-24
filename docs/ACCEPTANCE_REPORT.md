# 毛桃桌面宠物验收报告

## 本轮效果

- 耳机继续使用用户确认的一体 U 形模型，采用等宽扫掠曲线、圆角端头与有厚度的实体材质，避免头梁局部粗细突变；随机使用薄荷、雾蓝、薰衣草、珊瑚粉、暖杏纯色。
- 专注计时器使用小号、加粗的绿色数码管样式，移到窗口上方并与耳机拉开距离。
- 普通表情下眼白与瞳孔保持近圆形；专注姿势的鼠标侧前爪轻微弯曲并对准鼠标，键盘侧爪基本伸直并随按键短促抬落。
- 六种花色继续共用无嘴猫模型，只改变毛色、花纹、鼻点和规定的眼白颜色。保留鼠标视线追踪、打字方向回看、键盘双爪敲击、抚摸反馈、毛线球待机与心形气泡等功能。
- “常用”菜单提供更换花色与进入/退出待机。待机暂停全局输入和键盘同步，立即开始玩毛线球动作；隐藏键盘时会停止击键动画。跨应用按键现在绕过抚摸/戳击期间的普通按键抑制，并以 22 ms 降采样窗口接收重复按键。

## 验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 单元与配置测试 | 通过 | `node --test scripts/*.test.cjs`：14 项通过，0 项失败。 |
| 实时角色渲染 | 通过 | Electron 窗口实际渲染；[耳机、时钟与佩戴关系截图](验收截图-耳机佩戴关系.png)记录当前版本。 |
| Electron 桌面交互检查 | 通过 | `node scripts/run-electron-check.cjs shell-check` 全项通过，包括透明点击、前台窗口保持、默认关闭跨应用输入、启用后的原生按键动作、隐藏键盘拦截、待机拦截、专注锁定暂停、拖动、托盘显示、快速打字生气反馈、尾巴拍桌、休眠唤醒及多屏检查；渲染错误为 0。 |
| 音效检查 | 通过 | `node scripts/run-electron-check.cjs audio-check`：按键、鼠标、猫叫、惊讶、呼噜均有输出；关闭键盘音效与静音时峰值为 0。 |
| 外部 WinForms 联动专项 | 未完成 | 专用窗体未能被测试进程可靠识别为可见；该专项未向窗体发送按键。Electron 外壳检查已在另一个前台测试应用上验证真实系统按键联动。 |
| Windows x64 构建 | 通过 | `pwsh -NoProfile -File scripts/build-win.ps1`：Electron Builder 26.18.0 在 Windows 11 x64 生成 portable 与 NSIS 安装包。 |
| 便携版启动与退出 | 通过 | `node scripts/release-check.cjs dist\MAOTAO-Portable-1.0.0-x64.exe`：窗口启动、托盘退出成功；残留进程 0，离线 DNS 阻断检查通过。 |
| NSIS 安装/卸载 | 未执行 | 安装器已构建，未在本机执行安装和卸载。 |
| Windows 10 实机验证 | 未执行 | 当前实机验证环境为 Windows 11 x64。 |

## Windows 构建产物

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `dist/MAOTAO-Portable-1.0.0-x64.exe` | 112,021,790 bytes | `325F465ECD13362E6BF0E53365928CDB16B8DBA8BAE7D494BE1FCC7680FC3E4F` |
| `dist/MAOTAO-Setup-1.0.0-x64.exe` | 123,108,261 bytes | `B976065E48521FD8617D17DA9A5C5F8FC33BDEDF0AECEFA40362F7238CE5ECEF` |
| `dist/MAOTAO-Source-1.0.0.zip` | 完整工程与构建配置；不包含 `node_modules`、`dist` 和可执行文件。 |

## 多平台构建说明

- Windows x64：已实际构建 portable 与 NSIS 安装包。
- macOS x64/arm64：DMG 与 ZIP 目标以及构建脚本已配置，需在 macOS runner 构建；签名和公证需要 Apple Developer ID。
- 麒麟 Linux：x64 AppImage/DEB 与 arm64 DEB 目标以及构建脚本已配置，需在 Linux runner 构建。X11 支持全局键鼠联动；Wayland 按系统权限策略禁用。当前依赖没有 LoongArch 预编译输入钩子，因此不宣称支持龙芯架构。
- macOS、麒麟安装包未在本轮生成或实机验证。Windows 10 未实机复验。
- Windows 安装包未签名，SmartScreen 可能提示未知发行者。

## 复现构建

- 运行环境：Node 24.x、Electron 45.4.1、electron-builder 26.18.0；全新源码目录先运行 `npm ci`。
- Windows：`pwsh -NoProfile -File scripts/build-win.ps1`
- macOS：`bash scripts/build-macos.sh`
- 麒麟 Linux：`bash scripts/build-kylin.sh`
- 平台构建需在对应系统或原生 CI runner 上执行。
