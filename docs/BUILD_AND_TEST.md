# 跨平台构建与复验

## 共用准备

三平台均使用 Node.js 24、npm、Electron 45.4.1 与 electron-builder 26.18.0。项目锁定依赖，首次构建先运行 `npm ci`。`uiohook-napi` 的各平台预构建模块会在安装包中解包到 Electron 可加载的位置。

## Windows 10/11 x64

在 Windows x64 上运行：

```powershell
npm ci
pwsh -File scripts/build-win.ps1
npm test
node scripts/run-electron-check.cjs shell-check
node scripts/run-electron-check.cjs audio-check
node scripts/run-electron-check.cjs external-check
node scripts/release-check.cjs dist\MAOTAO-Portable-1.0.0-x64.exe
```

产物为 `dist/MAOTAO-Portable-1.0.0-x64.exe` 和 `dist/MAOTAO-Setup-1.0.0-x64.exe`。Portable 可直接运行；Setup 为每用户 NSIS 安装器。脚本校验本地 Electron 版本，或可用 `-ElectronDist <官方 Windows x64 Electron ZIP>` 指定经 SHA-256 校验的运行时。EXE 未签名。

外壳检查会短暂移动鼠标并发送固定测试键，覆盖透明点击穿透、模型/花色、托盘、拖动、多屏、睡眠、输入联动、隐私和进程退出；也确认跨应用按键驱动击键动作、隐藏键盘会阻止同步、待机会屏蔽输入。外部联动检查只有在确认专用 WinForms 测试窗体位于命中位置后才发送输入。`MAOTAO_TEST_OUTPUT` 可设为截图目录。

## macOS Intel 与 Apple Silicon

必须在 macOS 上运行：

```bash
npm ci
bash scripts/build-macos.sh
```

生成 x64 与 arm64 两种架构的 `.dmg` 和 `.zip`。构建脚本在没有 Developer ID 证书时关闭 Hardened Runtime，生成未签名调试/分发包；macOS 会对未签名应用显示安全提示。正式公开分发时，在 Mac 或 CI 的安全变量中配置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`CSC_NAME` 和 Apple 公证凭证 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，脚本会为签名构建启用 Hardened Runtime。

首次启用跨应用键鼠联动时，用户需在“系统设置 → 隐私与安全性 → 输入监控”允许 MAOTAO Desktop Pet，并重启应用。权限拒绝时，应用内的宠物、动画、拖动、托盘和专注模式仍可用。

## 麒麟 Linux x64/ARM64

在 Linux 构建机上运行；Debian/Ubuntu 构建机先安装 AppImage 工具依赖：

```bash
sudo apt-get update
sudo apt-get install -y libopenjp2-tools
npm ci
bash scripts/build-kylin.sh
```

生成 x64 `.AppImage`、x64 `.deb` 和 arm64 `.deb`。Kylin V10 系列若提供 Debian 包管理，可安装对应架构的 DEB；AppImage 面向 Kylin x64。此配置不包含 LoongArch 包。由于桌面环境权限模型不同，跨应用键鼠联动和窗口置顶在 Wayland 会话中不可用；菜单会标出限制，切换至 X11 会话后才可使用完整桌宠交互。桌宠本身不依赖全局输入监听。

## 多平台构建入口

仓库中的 `.github/workflows/package-platforms.yml` 可从 GitHub Actions 手动运行。它在 Windows、macOS、Ubuntu 三种原生 runner 上分别构建并上传包，不会发布到 GitHub Release。提供 Apple Developer ID 和公证相关 Secrets 后，macOS 工作流可以生成签名并公证的安装包。

构建 Linux 和 macOS 包需要各自的宿主环境；本 Windows 工作站无法进行它们的原生启动、安装和权限复验。跨平台配置与构建命令可以复现，原生系统验收结果见 [ACCEPTANCE_REPORT.md](ACCEPTANCE_REPORT.md)。Windows 10、macOS、麒麟 Linux 实机安装验证应在相应版本设备完成。
