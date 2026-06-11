# 下载 / Releases

当前正式版本：[v0.3.1](https://github.com/kadevin/ilab-gpt-conjure/releases/tag/v0.3.1)

## 版本说明

当前版本：`v0.3.1`。这个版本提供 Windows x64、macOS Apple Silicon、macOS Intel 三种免安装一键包；下载对应平台的 zip 后解压即可启动本地 WebUI。

本版重点：继续完善历史库和任务栏体验，历史库改进 Eagle 风格缩略图网格、双向窗口化滚动、比例 / 方向筛选、主题滚动条和详情预览；主生成页任务栏恢复图生图双缩略图效果，增强选中态、批量选择、部分失败重试 / 接受成功结果后的状态和预览稳定性。

## 免安装一键包

| 平台 | 适用设备 | 下载 | SHA256 |
| --- | --- | --- | --- |
| Windows x64 | Windows 10/11 x64 | [ilab-gpt-conjure_windows_portable_x64_0.3.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_windows_portable_x64_0.3.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_windows_portable_x64_0.3.1.zip.sha256.txt) |
| macOS Apple Silicon | M1/M2/M3/M4 | [ilab-gpt-conjure_macos_portable_arm64_0.3.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_macos_portable_arm64_0.3.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_macos_portable_arm64_0.3.1.zip.sha256.txt) |
| macOS Intel | Intel x64 | [ilab-gpt-conjure_macos_portable_x64_0.3.1.zip](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_macos_portable_x64_0.3.1.zip) | [sha256](https://github.com/kadevin/ilab-gpt-conjure/releases/download/v0.3.1/ilab-gpt-conjure_macos_portable_x64_0.3.1.zip.sha256.txt) |

使用方式：

1. 下载对应平台的 zip。
2. 解压到普通用户目录，不要放在系统保护目录。
3. Windows 双击 `Start WebUI Portable.bat`；macOS 双击
   `Start WebUI Portable.command`。
4. 如果浏览器没有自动打开，访问 `http://127.0.0.1:8787/`。

macOS 包是未签名的 portable zip，不是已签名 `.app` 或 notarized DMG。
启动脚本会尝试在启动前移除当前解压目录内的 quarantine 标记。如果 macOS
仍然拦截启动脚本，可以右键或 Control-click `Start WebUI Portable.command`，
选择 Open，并在系统安全提示中再次确认。也可以对解压目录执行：

```bash
xattr -dr com.apple.quarantine /path/to/ilab-gpt-conjure_macos_portable_arm64
# 或：
xattr -dr com.apple.quarantine /path/to/ilab-gpt-conjure_macos_portable_x64
```

一键包内的 `data/` 目录会保存本地设置、公用图库、输入图、输出图、任务数据库和日志。
不要把这些本地数据、API key 或 OAuth 文件提交到 Git。
