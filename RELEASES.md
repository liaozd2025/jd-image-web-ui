# 下载 / Releases

当前正式版本：[v0.6.1](https://github.com/kadevin/ilab-gpt-conjure/releases/tag/v0.6.1)

## 版本说明

当前版本：`v0.6.1`。本版集中修复生成页刷新、窗口缩放和复杂任务库下的卡顿问题，重新建立连续响应式布局，并新增输出参数锁定与生成中双弧动效。强烈建议所有用户尽快更新，尤其是任务记录、最近上传、公共图库或提示词模板较多，以及经常调整窗口尺寸、使用笔记本短屏或高分辨率屏幕的用户。

本版重点：0.6.1 重点修复生成页刷新和窗口缩放卡顿，减少首屏任务数据、图片节点和 DOM 数量，并移除预览区域的 JavaScript 高度测量链路；同时新增输出参数锁定，避免连续生成或浏览历史任务时误改设置。

本版详情：

### 升级必读

- 已安装 `0.5.7` 或更新版本标准 App 的用户可以通过“检查更新”获取 `0.6.1` 标准包下载入口；仍在使用 `0.5.6` 标准 App 的用户需要从 Release 页面手动下载 `0.6.1` 覆盖安装。
- `v0.5.4` 及更早 portable 用户首次升级到 `0.5.5` 或更新版本时，建议手动下载完整标准包或完整 portable 包；旧 updater 只保证升级 WebUI/依赖，不保证安装新的小兔子启动器、标准 `.app` / `.exe` 入口和迁移助手。
- 新用户建议优先下载标准包。标准包把用户数据写入系统应用数据目录；portable 包继续把数据写在同级 `data/`，用于老用户过渡、调试和临时工作流。
- 本次更新不改变任务数据库、输出目录和用户设置的数据结构，无需迁移现有任务或图片。
- 标准包检查更新会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载；未签名 `.app` 和 Windows ZIP 的静默自替换更新器延后，避免扩大文件替换风险。
- macOS 标准 DMG 和 portable zip 都暂未签名、未 notarize，首次启动可能需要右键或 Control-click 选择 Open。

### 性能与响应速度

- 生成页实时事件由最多 200 条历史任务缩减为最近 50 条，同时确保排队中和运行中的任务不会遗漏。
- 最近上传改为 12 个一批按需渲染；公共图库和提示词模板的完整图片列表只在打开对应抽屉后创建。
- 图片统一使用延迟加载与异步解码，最近上传使用统一事件委托，减少首屏图片解码和事件监听开销。
- 移除预览区域的 JavaScript 高度测量与同步写入，避免刷新或连续调整窗口尺寸时反复触发布局计算。
- 在同一份本地任务库回归样本中，生成页事件快照由约 347 KB 降至 81 KB，首屏图片节点由 62 个降至 14 个，首屏 DOM 元素减少约 25%。实际效果会随任务库和素材数量变化。

### 生成工作台响应式修复

- 生成工作区改为根据真实可用宽度选择宽松双栏、紧凑双栏或单栏，不再依赖多组相互覆盖的固定视口规则。
- 控制区和预览区由同一个 CSS Grid 统一高度，修复短屏下输出设置溢出、预览越界、两栏底部不齐和顶部工具组错位。
- 短屏密度改为连续压缩，避免特定高度下突然切换整套布局或隐藏板块标题。
- 超宽屏限制工作区和控制列最大宽度；平板与窄屏保持预览区域可滚动到达并具有最低可用高度。

### 新增输出参数锁定

- 输出设置新增锁定功能，可固定当前生成参数，避免连续生成或浏览历史任务时误触、误改设置。
- 锁定后以只读摘要展示关键参数，需要调整时可随时解锁；锁定和解锁不会改变输出设置或预览区域的布局高度。
- 切换历史任务不会覆盖当前锁定参数，也可以主动选择“使用此任务参数”。
- 参数锁定不会改变系统设置中的 Image、Responses、API 供应商或调用方式。
- 锁定摘要的信息层级和浅色、深色主题显示同步优化；新增文案已覆盖全部 13 种界面语言。

### 生成中动效

- 生成页主预览和左侧运行中任务缩略图统一采用新的双弧接力动效，改善旧版转圈动画呆板和不流畅的问题。
- 动画只改变 transform 和透明度，不参与布局计算；系统开启“减少动态效果”后会自动停止旋转并保留静态状态提示。

### 文案与可用性

- “参考输入”调整为“参考输入（可选）”，更明确地区分必填与可选内容。
- 输出摘要中的“联网”调整为更准确的“搜索”。

### portable 与标准 App

- 继续提供 Windows x64、macOS Apple Silicon、macOS Intel 三种 portable zip，以及 macOS 双架构 DMG 和 Windows 标准 App ZIP。
- `latest.json` 同时服务 portable 自动更新和标准 App 下载；portable 使用 Ed25519 与 SHA256 校验并保留本地 `data/`，标准 App 仍不在运行中静默替换自身。

### 发布工作流

- Release workflow 同时构建并上传 macOS Apple Silicon DMG、macOS Intel DMG、Windows 标准 App ZIP、Windows x64 portable、macOS Apple Silicon portable、macOS Intel portable、所有 `.sha256.txt` 和 signed `latest.json`。
- `latest.json` 同时服务 portable 自动更新和标准 App 下载新版安装包；标准 App 仍不做静默自覆盖。

## 推荐下载

| 平台 | 推荐给 | 下载 | SHA256 |
| --- | --- | --- | --- |
| macOS Apple Silicon | 新用户，M1/M2/M3/M4 | [iLab-GPT-CONJURE-macos-arm64-0.6.1.dmg](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-macos-arm64-0.6.1.dmg) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-macos-arm64-0.6.1.dmg.sha256.txt) |
| macOS Intel | 新用户，Intel x64 | [iLab-GPT-CONJURE-macos-x64-0.6.1.dmg](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-macos-x64-0.6.1.dmg) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-macos-x64-0.6.1.dmg.sha256.txt) |
| Windows x64 | 新用户，Windows 10/11 x64 | [iLab-GPT-CONJURE-windows-x64_0.6.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-windows-x64_0.6.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/iLab-GPT-CONJURE-windows-x64_0.6.1.zip.sha256.txt) |

标准包数据目录：

- macOS：`~/Library/Application Support/iLab GPT CONJURE/`
- Windows：`%APPDATA%\iLab GPT CONJURE\`

标准包的“检查更新”会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载。目前不对标准 `.app` 或 Windows 标准 ZIP 执行静默自动自替换。

## 免安装一键包

| 平台 | 适用设备 | 下载 | SHA256 |
| --- | --- | --- | --- |
| Windows x64 | Windows 10/11 x64 | [ilab-gpt-conjure_windows_portable_x64_0.6.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_windows_portable_x64_0.6.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_windows_portable_x64_0.6.1.zip.sha256.txt) |
| macOS Apple Silicon | M1/M2/M3/M4 | [ilab-gpt-conjure_macos_portable_arm64_0.6.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_macos_portable_arm64_0.6.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_macos_portable_arm64_0.6.1.zip.sha256.txt) |
| macOS Intel | Intel x64 | [ilab-gpt-conjure_macos_portable_x64_0.6.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_macos_portable_x64_0.6.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/ilab-gpt-conjure_macos_portable_x64_0.6.1.zip.sha256.txt) |

portable 自动更新 manifest：

- [latest.json](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.1/latest.json)

使用方式：

1. 下载对应平台的 zip。
2. 解压到普通用户目录，不要放在系统保护目录。
3. Windows 双击 `Start iLab GPT CONJURE.exe`；macOS 双击
   `Start iLab GPT CONJURE.app`。旧的 `Start WebUI Portable.bat` /
   `Start WebUI Portable.command` 仍保留，用于终端调试。
4. 如果浏览器没有自动打开，访问 `http://127.0.0.1:8787/`。

一键包启动器不会后台自动访问 GitHub。更新已经解压的一键包时，可在托盘 / 菜单栏
菜单选择检查更新，并在发现新版本后确认 `安装更新`；也可以退出启动器后手动运行
Windows 的 `Update WebUI Portable.bat` 或 macOS 的 `Update WebUI Portable.command`。
更新脚本会读取带签名的 `latest.json`
manifest，先用启动器内置公钥校验 Ed25519 签名，再下载当前平台对应的最新
GitHub Release 资产，执行前显示所选资产和 manifest SHA256，校验下载 zip 的
SHA256，只替换一键包目录内由程序管理的文件，保留本地 `data/`，并把被替换文件备份到 `.backup/`。

macOS 标准 DMG 和 portable zip 都暂未签名、未 notarize。如果 macOS
拦截启动，可以右键或 Control-click App，选择 Open，并在系统安全提示中再次确认。
portable zip 也可以对解压目录执行：

```bash
xattr -dr com.apple.quarantine /path/to/ilab-gpt-conjure_macos_portable_arm64
# 或：
xattr -dr com.apple.quarantine /path/to/ilab-gpt-conjure_macos_portable_x64
```

一键包内的 `data/` 目录会保存本地设置、公用图库、输入图、输出图、任务数据库和日志。
不要把这些本地数据、API key 或 OAuth 文件提交到 Git。
