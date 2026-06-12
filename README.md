# iMessage Exporter GUI

`iMessage Exporter GUI` 是 [`imessage-exporter`](https://github.com/ReagentX/imessage-exporter) 的桌面图形界面，用来把本机 iOS 备份里的短信/iMessage 导出为 HTML 或 TXT。

当前 v1 目标是让普通用户不用手写命令：选择 iOS 备份、运行诊断、配置导出选项、查看日志、取消长任务，并打开导出结果目录。

## 下载安装

普通用户不需要拉取源码，也不需要安装 Node.js、Rust 或 Visual Studio Build Tools。直接从 GitHub Releases 下载安装包即可：

[下载最新版](https://github.com/A1mAssist/imessage-exporter-gui/releases/latest)

按系统选择文件：

- Windows：下载 `.exe` 或 `.msi` 安装包。
- macOS：下载 `.dmg`。
- Linux：下载 `.AppImage` 或 `.deb`。

当前安装包还没有代码签名，所以系统可能会弹出安全提示：

- Windows SmartScreen：点击“更多信息”，然后选择“仍要运行”。
- macOS Gatekeeper：如果提示无法打开，可以右键 App 选择“打开”，或到“系统设置 -> 隐私与安全性”允许打开。
- Linux：如果 `.AppImage` 不能启动，先给它执行权限，例如 `chmod +x iMessage*.AppImage`。

## 基本使用

1. 用 Apple Devices 或 iTunes 在本机创建 iPhone/iPad 备份。
2. 打开 iMessage Exporter GUI。
3. 在“数据源”步骤选择或扫描本机 iOS 备份目录。
4. 如果备份已加密，输入备份密码。
5. 运行诊断，确认数据库、附件和可选转换工具状态。
6. 选择导出格式、附件策略、日期范围和输出目录。
7. 开始导出，等待完成后打开输出目录或第一个结果文件。

常见备份位置：

```txt
Windows: %APPDATA%\Apple Computer\MobileSync\Backup
macOS: ~/Library/Application Support/MobileSync/Backup
```

## 功能状态

已实现：

- 中文向导式界面：数据源、诊断、导出选项、结果。
- 自动扫描本机 iOS 备份，也支持手动选择备份目录。
- 检查 `Manifest.db`、`Info.plist` 等备份关键文件。
- 内置调用 `imessage-exporter` 导出引擎，不需要手动安装命令行工具。
- HTML/TXT 导出，支持附件复制策略、日期范围、会话筛选和显示名选项。
- 输出目录检查，避免误写入备份目录或旧导出目录。
- 一键生成带时间戳的导出目录，例如 `Messages Export 2026-06-12 0130`。
- 导出日志实时显示，支持搜索、stdout/stderr/error 过滤和取消任务。
- 诊断报告可复制或下载为 `.txt`。
- 密码不会写入本地设置；日志和诊断报告会隐藏敏感信息。
- 识别常见失败原因：备份密码错误、备份不完整、输出目录权限不足、导出引擎缺失、转换工具缺失。
- 可选检测 `ffmpeg` 和 ImageMagick，用于部分附件转换模式。

当前限制：

- v1 只面向本机 iOS 备份导出。
- 暂不支持直接读取 macOS `chat.db`、越狱设备 `sms.db` 或独立附件目录。
- 暂不内置 `ffmpeg` 和 ImageMagick。
- 暂无原生 PDF 导出；可以先导出 HTML，再用浏览器打印为 PDF。
- 当前未做 Windows/macOS 代码签名，因此安装时可能有系统安全提示。

## 隐私与安全

- 加密备份密码只保存在应用运行状态里，不写入本地设置。
- 日志和诊断报告会隐藏密码。
- 由于 upstream CLI 使用 `--cleartext-password` 参数，任务运行时密码仍可能短暂出现在系统进程列表里。
- 导出目录不能是备份目录本身，也不能位于备份目录内部。
- 当前安装包未签名，安装时可能出现系统安全提示。

## 许可证

GPL-3.0-only。见 [LICENSE](./LICENSE) 和 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
