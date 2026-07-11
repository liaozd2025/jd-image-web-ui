# 下载 / Releases

当前正式版本：[v0.6.0](https://github.com/kadevin/ilab-gpt-conjure/releases/tag/v0.6.0)

## 版本说明

当前版本：`v0.6.0`。本版加入 GPT-5.6 主模型与 Responses 参考文件输入，升级历史库多图缩略图和大图浏览，并重新设计 API 供应商设置与提示词处理。新用户建议下载标准包：macOS 使用 DMG，Windows 使用独立 App ZIP；老用户和调试用户仍可下载 portable zip 继续沿用同目录 `data/` 工作流。

本版重点：0.6.0 新增 Responses 参考文件输入，加入 GPT-5.6 Sol、Terra、Luna 三个主模型，升级历史库多图任务浏览体验，并完成 API Responses 并发调度和 API 供应商设置重构。

本版详情：

### 升级必读

- 已安装 `0.5.7` 标准 App 的用户可以通过“检查更新”获取 `0.6.0` 标准包下载入口；仍在使用 `0.5.6` 标准 App 的用户需要从 Release 页面手动下载 `0.6.0` 覆盖安装。
- `v0.5.4` 及更早 portable 用户首次升级到 `0.5.5` 或更新版本时，建议手动下载完整标准包或完整 portable 包；旧 updater 只保证升级 WebUI/依赖，不保证安装新的小兔子启动器、标准 `.app` / `.exe` 入口和迁移助手。
- 新用户建议优先下载标准包。标准包把用户数据写入系统应用数据目录；portable 包继续把数据写在同级 `data/`，用于老用户过渡、调试和临时工作流。
- 标准包检查更新会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载；未签名 `.app` 和 Windows ZIP 的静默自替换更新器延后，避免扩大文件替换风险。
- macOS 标准 DMG 和 portable zip 都暂未签名、未 notarize，首次启动可能需要右键或 Control-click 选择 Open。

### GPT-5.6 主模型

- OpenAI 于 2026 年 7 月 9 日发布 GPT-5.6 模型系列；Responses 主模型列表新增 `gpt-5.6-sol`、`gpt-5.6-terra` 和 `gpt-5.6-luna`。

### Responses 参考文件输入

- 参考输入区支持图片与文件混合选择和拖放；Responses 主模型可以读取 PDF、Word、Excel、PowerPoint、Markdown、文本和常见代码文件后参与图像生成。
- 支持 65 种扩展名，每种格式使用专属 SVG 图标；缩略图空间充足时显示文件名摘要，输入过多时只保留图标。
- 历史任务可以恢复、显示并下载原始参考文件；文件任务会记录并显示真实执行供应商。
- 文件上传包含类型、签名、大小和损坏检测，Responses 错误与调试记录会自动隐藏文件正文和 Base64 数据。

### 历史库多图体验

- 多图任务使用一张真实封面加最多三层 D2 石墨灰实体底卡，无需加载额外底部缩略图即可表达相册层次。
- 双击多图任务进入非循环三槽轮播：相邻图片贴近屏幕边缘露出一部分，点击边缘图后与中央大图完成放大、缩小和位置交换。
- 大图模式下 `←/→` 切换同任务图片，`↑/↓` 切换上一条或下一条可预览任务，并自动跳过失败或无图任务。
- 历史库排序、筛选、三栏拖拽、任务标题、提示词排版和详情操作布局同步优化。

### API 设置与提示词处理

- API 设置区分供应商选择、只读详情和独立编辑状态；供应商超过 10 个时提供搜索并自动定位当前卡片。
- Base URL 按用户输入保存，不再隐式补 `/v1`；模型和并发移入默认收起的高级设置，最终请求地址独立展示。
- 旧版“提示词模式”的“原始 / 保真 / 创意”修正为“提示词处理”的“原文 / 保真 / 自动”，并分别说明 Images 直连与 Responses 主模型参与时的真实处理差异。

### 并发与任务状态修复

- API Responses 支持单任务多图并发；同一供应商的多个任务共享输出槽，不同供应商使用独立并发池。
- 修复任务尚未取得并发槽就提前显示运行、供应商满载阻塞其他供应商任务、重试等待时间被计入最终耗时等问题。
- 运行中任务卡新增实时耗时显示。

### portable 与标准 App

- 继续提供 Windows x64、macOS Apple Silicon、macOS Intel 三种 portable zip，以及 macOS 双架构 DMG 和 Windows 标准 App ZIP。
- `latest.json` 同时服务 portable 自动更新和标准 App 下载；portable 使用 Ed25519 与 SHA256 校验并保留本地 `data/`，标准 App 仍不在运行中静默替换自身。

### 发布工作流

- Release workflow 同时构建并上传 macOS Apple Silicon DMG、macOS Intel DMG、Windows 标准 App ZIP、Windows x64 portable、macOS Apple Silicon portable、macOS Intel portable、所有 `.sha256.txt` 和 signed `latest.json`。
- `latest.json` 同时服务 portable 自动更新和标准 App 下载新版安装包；标准 App 仍不做静默自覆盖。

## 推荐下载

| 平台 | 推荐给 | 下载 | SHA256 |
| --- | --- | --- | --- |
| macOS Apple Silicon | 新用户，M1/M2/M3/M4 | [iLab-GPT-CONJURE-macos-arm64-0.6.0.dmg](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-macos-arm64-0.6.0.dmg) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-macos-arm64-0.6.0.dmg.sha256.txt) |
| macOS Intel | 新用户，Intel x64 | [iLab-GPT-CONJURE-macos-x64-0.6.0.dmg](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-macos-x64-0.6.0.dmg) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-macos-x64-0.6.0.dmg.sha256.txt) |
| Windows x64 | 新用户，Windows 10/11 x64 | [iLab-GPT-CONJURE-windows-x64_0.6.0.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-windows-x64_0.6.0.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/iLab-GPT-CONJURE-windows-x64_0.6.0.zip.sha256.txt) |

标准包数据目录：

- macOS：`~/Library/Application Support/iLab GPT CONJURE/`
- Windows：`%APPDATA%\iLab GPT CONJURE\`

标准包的“检查更新”会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载。目前不对标准 `.app` 或 Windows 标准 ZIP 执行静默自动自替换。

## 免安装一键包

| 平台 | 适用设备 | 下载 | SHA256 |
| --- | --- | --- | --- |
| Windows x64 | Windows 10/11 x64 | [ilab-gpt-conjure_windows_portable_x64_0.6.0.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_windows_portable_x64_0.6.0.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_windows_portable_x64_0.6.0.zip.sha256.txt) |
| macOS Apple Silicon | M1/M2/M3/M4 | [ilab-gpt-conjure_macos_portable_arm64_0.6.0.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_macos_portable_arm64_0.6.0.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_macos_portable_arm64_0.6.0.zip.sha256.txt) |
| macOS Intel | Intel x64 | [ilab-gpt-conjure_macos_portable_x64_0.6.0.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_macos_portable_x64_0.6.0.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/ilab-gpt-conjure_macos_portable_x64_0.6.0.zip.sha256.txt) |

portable 自动更新 manifest：

- [latest.json](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.6.0/latest.json)

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
