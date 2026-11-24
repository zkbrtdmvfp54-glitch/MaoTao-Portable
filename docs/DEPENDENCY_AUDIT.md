# 依赖与上游源码审查

| 用途 | 锁定版本/来源 | 许可证 | 平台与运行方式 |
| --- | --- | --- | --- |
| 桌面壳、透明窗口、托盘、Canvas/Web Audio | Electron 45.4.1 | MIT；Chromium 等组件遵循各自随包许可证 | 配置 Windows x64、macOS x64/arm64、Linux x64/arm64 运行时；本工作区实测 Windows 11 x64，其他平台须原生验收。 |
| 角色与键鼠场景 | [`7wdn/7paws`](https://github.com/7wdn/7paws)，提交 `65d5ecdce5ede0f7927be319ee2c657f8e070189` | MIT；原文保存在 `assets/pet/third-party/7paws/LICENSE-7PAWS` | 上游 JavaScript 模型、动画、键盘布局、输入映射和 MIT 来源文件离线随项目分发。本项目未把网页远程加载作为运行依赖。 |
| 3D 场景引擎 | Three.js r128 (`REVISION=128`) | MIT；`LICENSE-THREE` | 与固定的 7paws 本地资源一同打包，浏览器端 WebGL；文件与上游版本 SHA-256 一致。 |
| 全局键鼠监听 | uiohook-napi 1.5.5 | npm 封装 MIT；libUIOHook LGPL-3.0-or-later | 包含 Windows、macOS、Linux x64/arm64 N-API 预构建；默认关闭、用户确认后才注册。macOS 需输入监控授权；Linux Wayland 会话关闭该功能。 |
| 原生模块定位 | node-gyp-build 4.8.4 | MIT | 在目标 Electron 中加载随包的 N-API 预构建，运行时无需编译。 |
| 多平台构建与安装器 | electron-builder / app-builder-lib 26.18.0；NSIS 3.12 | MIT / NSIS 与组件各自许可证 | Windows portable/NSIS x64；macOS DMG/ZIP x64/arm64；麒麟 Linux AppImage x64 和 DEB x64/arm64。 |
| 素材处理 | Python 3.12、Pillow 13.0.0 | PSF / HPND | 仅开发时用于原始素材预处理，不是应用运行依赖。 |
| 构建时 JavaScript | Node.js 24、npm 11 | Node MIT 及第三方条款 / npm Artistic-2.0 | 仅源码安装依赖和构建时需要；发行包内含对应 Electron 运行时。 |

## 本地 7paws 衍生改动

原始 `7paws.js` 依其 MIT 许可证保留在 `assets/pet/third-party/7paws/7paws.js`，并作本项目必要改动：增加 PNG 帧缓冲读取；调整圆头、短躯干、宽胸、肩部与爪腿比例；提供奶牛、三花、暹罗、灰白虎斑毛桃、异瞳白及纯黑白爪六种可切换材质；奶牛猫脸部白色三角开脸边缘渐变，颜色直接复用肚皮色；纯黑猫仅四爪为白色；灰白虎斑根据 `assets/pet/reference/毛桃虎斑优化参考.png` 更新银灰底、三道额纹、水平脸侧纹、浅色脸部/胸腹、柔化躯干条纹与环纹尾巴。参考图用于校准，仍由 7paws 模型和 Canvas 纹理渲染角色；参考图不打入发行包。头身纹理分离，色纹以渐变透明度与柔边融合，避免硬色块拼接。宠物整体缩至此前大小的 80%，键盘、鼠标不缩放。三花脸部用橘黑两团柔边晕染并保留白色中线；暹罗脸部椭圆缩小，面罩、前腿与尾巴都以渐变过渡，取消额部小点；为异瞳白猫设置双眼不同颜色；连续快速打字触发靠近左耳的小型怒气符号、收窄内压的怒目和拍尾，待机时增加舔爪与摆尾，默认五分钟无活动后睡眠；把空格键输入映射成双爪；移除与严格 CSP 冲突的动态行内样式，并关闭键帽字符标签。Three.js 保持上游字节版本。上游 MIT 文件和 Three.js MIT 文件随发行目录一并打包。

应用外部输入只由 `uiohook-napi` 的事件回调映射成 `key`/`mouse` 类别和左/右爪侧，短暂送入渲染器；不持久化按键码、文字、剪贴板、窗口标题或原始事件序列，不联网发送。确认对话框打开前不创建钩子；锁屏、隐藏窗口、退出或用户关闭联动时停止钩子。

完整传递依赖及锁定完整性见 `package-lock.json`。本地 7paws 上游克隆、固定提交与下载副本保存在本次开发归档 `_临时`，用于审计；发布应用运行时只读取打包到 `assets/pet/third-party/7paws/` 的本地文件。
