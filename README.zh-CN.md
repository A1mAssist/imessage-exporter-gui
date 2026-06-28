# iMessage Exporter GUI

[English](./README.md)

`iMessage Exporter GUI` 是内置 [`imessage-exporter`](https://github.com/ReagentX/imessage-exporter) Rust 引擎的桌面图形应用，用来把本机 iOS 备份里的短信/iMessage 导出为 HTML、TXT 或 JSONL。

它把常用导出流程做成了图形界面：选择 iOS 备份、检查备份状态、设置导出选项，然后一键导出并打开结果目录。

## 界面示例

![选择 iOS 备份](./preview/example-source-zh.png)

![导出完成](./preview/example-results-zh.png)

`example-*` 图片用于 README 展示；`react-mock-*` 图片由 mock UI 烟测生成，作为发布前 QA 截图保留。

## 下载安装

普通用户不需要拉取源码，也不需要安装 Node.js、Rust 或 Visual Studio Build Tools。直接从 GitHub Releases 下载当前安装包即可：

[下载当前版本](https://github.com/A1mAssist/imessage-exporter-gui/releases)

按系统选择文件：

- Windows：普通个人安装推荐下载 `.exe` 安装包。
- Windows 托管部署：如果公司设备管理、软件分发或管理员策略要求 MSI，请下载 `.msi`。
- macOS Apple Silicon 或 Intel：下载 `.dmg`。

当前安装包还没有代码签名，所以系统可能会弹出安全提示：

- Windows SmartScreen：点击“更多信息”，然后选择“仍要运行”。
- macOS Gatekeeper：如果提示无法打开，可以右键 App 选择“打开”，或到“系统设置 -> 隐私与安全性”允许打开。

安装包已经内置 imessage-exporter Rust 引擎，用户不需要再单独下载或选择 `imessage-exporter.exe`。安装版可以在“关于与诊断”面板里检查 GitHub Releases 更新；更新包会通过 updater 签名校验，但应用安装包本身目前仍未做代码签名。

## 基本使用

1. 用 Apple Devices 或 iTunes 在本机创建 iPhone/iPad 备份。
2. 打开 iMessage Exporter GUI。
3. 在“数据源”步骤选择或扫描本机 iOS 备份目录。
4. 如果备份已加密，输入备份密码。
5. 运行诊断，确认数据库、附件和可选转换工具状态。
6. 选择导出格式、附件策略、日期范围、会话筛选和输出目录。
7. 开始导出，等待完成后打开输出目录或第一个结果文件。

可以在“关于与诊断”面板里检查应用更新，并复制支持摘要；摘要会包含应用版本、平台、内置引擎版本和可选转换工具状态，便于反馈问题。

常见备份位置：

```txt
Windows: %APPDATA%\Apple Computer\MobileSync\Backup
macOS: ~/Library/Application Support/MobileSync/Backup
```

## 功能状态

已实现：

- 中英文向导式界面：数据源、诊断、导出选项、结果。
- 根据设备语言自动选择中文或英文；如果设备语言不是中文或英文，则默认英文。
- 支持浅色、深色和跟随系统主题。
- “关于与诊断”面板：显示应用版本、更新检查、引擎状态和可复制的支持摘要。
- 安装版支持通过 GitHub Releases 自动检查更新。
- 自动扫描本机 iOS 备份，也支持手动选择备份目录。
- 检查 `Manifest.db`、`Info.plist` 等备份关键文件。
- 内置 `imessage-exporter` Rust 引擎，并保留命令预览便于核对参数。
- HTML/TXT/JSONL 导出，支持附件复制策略、日期范围、会话筛选和显示名选项。
- 输出目录检查，避免误写入备份目录或旧导出目录。
- 一键生成带时间戳的导出目录，例如 `Messages Export 2026-06-12 0130`。
- 导出日志实时显示，支持搜索、stdout/stderr/error 过滤和取消任务。
- 诊断报告可复制或下载为 `.txt`。
- 密码不会写入本地设置；日志和诊断报告会隐藏敏感信息。
- 识别常见失败原因：备份密码错误、备份不完整、输出目录权限不足、引擎兼容性问题、转换工具缺失。
- 可选检测 `ffmpeg` 和 ImageMagick，用于部分附件转换模式。

当前限制：

- v1 只面向本机 iOS 备份导出。
- 当前安装包只面向 Windows 和 macOS。
- 暂不支持直接读取 macOS `chat.db`、越狱设备 `sms.db` 或独立附件目录。
- 暂不内置 `ffmpeg` 和 ImageMagick。
- 暂无原生 PDF 导出；可以先导出 HTML，再用浏览器打印为 PDF。
- 当前未做 Windows/macOS 代码签名，因此安装时可能有系统安全提示。

## 隐私与安全

- 加密备份密码只保存在应用运行状态里，不写入本地设置。
- 日志和诊断报告会隐藏密码。
- 内置 Rust 引擎只会在本次任务进程内接收密码，不再通过外部命令行传递。
- 导出目录不能是备份目录本身，也不能位于备份目录内部。
- 当前安装包未签名，安装时可能出现系统安全提示。

## 开发验证

内置 exporter 兼容性检查放在 Rust 测试里。测试会调用后端实际使用的 `diagnostics_args` 和 `export_args`，验证包含 JSONL 在内的 GUI 命令矩阵，避免 CI 只覆盖 mock UI。

```powershell
npm run check:static
npm test
npm run build
Push-Location src-tauri
cargo test
cargo check
Pop-Location
```

## 许可证

GPL-3.0-only。见 [LICENSE](./LICENSE) 和 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
