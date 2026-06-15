# iMessage Exporter GUI 0.1.1 开发与发布情况说明

本文档记录 `iMessage Exporter GUI` 在 `v0.1.1` 发布前后的主要开发工作、问题修复、验证流程和 GitHub 发布状态。它适合作为后续维护、复盘、用户问题排查和 release 交接材料使用。

## 1. 项目当前状态

- 项目名称：`imessage-exporter-gui`
- 当前发布版本：`v0.1.1`
- GitHub 仓库：<https://github.com/A1mAssist/imessage-exporter-gui>
- 最新 release：<https://github.com/A1mAssist/imessage-exporter-gui/releases/tag/v0.1.1>
- 最新 release 对应提交：`2bee823a788ccd0ac4c33d9303984e06e53143af`
- 已删除旧版本：`v0.1.0` release 和远端 tag
- 发布工作流：`Release Installers`
- 发布工作流结果：成功
- 本地验证过的 exporter 本体：`iMessage Exporter 4.1.0`

## 2. 本轮开发背景

最初目标是把 `imessage-exporter` 命令行工具包装成一个更容易使用的桌面 GUI，重点降低普通用户导出 iOS 备份中 iMessage 数据的门槛。

在前期界面迭代中，主要围绕以下几个方向展开：

- 让用户能清楚选择 iOS 备份路径和导出目录。
- 让导出选项更像真实应用，而不是命令行参数表单。
- 加入诊断步骤，提前发现备份、密码、转换器和导出引擎问题。
- 加入会话选择、日期选择器、预设导出方案、日志查看、诊断报告和结果打开入口。
- 支持中文和英文界面。
- 支持 Windows 安装包、本地 smoke 和 GitHub release 自动打包。

在准备 release 之后，实际用户反馈了一个关键问题：朋友使用安装包后导出报错，错误信息类似：

```text
Option --no-progress is enabled, which requires --format
```

这个问题说明 mock UI 和普通测试虽然能跑通，但真实 `imessage-exporter` 本体并没有被充分覆盖。后续工作重点转向“必须用真实 exporter 本体验证 GUI 会生成的命令”。

## 3. 关键问题与根因

### 3.1 用户遇到的问题

朋友实际运行 GUI 时，导出或诊断流程报错，核心错误为：

```text
Option --no-progress is enabled, which requires --format
```

这个错误来自 `imessage-exporter` 本体，而不是 GUI 前端 mock。

### 3.2 根因定位

后端命令生成逻辑位于：

- `src-tauri/src/cli.rs`

其中 `diagnostics_args()` 原本会生成类似：

```text
imessage-exporter -d -p <backup> -a iOS --no-progress
```

但 `--no-progress` 在 `imessage-exporter 4.1.0` 中要求必须和 `--format` 一起使用。诊断模式 `-d` 并不会传 `-f/--format`，因此该组合被 exporter 本体判定为非法。

导出命令则不同，它会传：

```text
-f html
```

或：

```text
-f txt
```

所以导出命令继续保留 `--no-progress` 是合理的。

### 3.3 修复方式

修复点：

- `diagnostics_args()` 移除 `--no-progress`
- `export_args()` 保留 `--no-progress`
- Rust 单测同步更新诊断命令期望
- 增加静态检查，防止诊断命令再次带上 `--no-progress`

对应文件：

- `src-tauri/src/cli.rs`
- `scripts/sanity-check.mjs`

## 4. 真实 exporter 本体验证

### 4.1 为什么要加真实本体验证

这次问题的教训是：mock 只能证明 GUI 流程和页面状态没明显坏掉，不能证明真实 `imessage-exporter` 接受 GUI 生成的参数。

因此本轮加入了新的验证目标：

> GUI 后端会生成的每类命令，都必须交给真实 `imessage-exporter` 本体跑一遍，至少确认参数能被真实 CLI 正确解析，并进入备份校验阶段。

### 4.2 新增 smoke 脚本

新增文件：

- `scripts/smoke-exporter-cli.ps1`

新增 npm script：

```json
"smoke:exporter-cli": "powershell -ExecutionPolicy Bypass -File scripts/smoke-exporter-cli.ps1"
```

该脚本负责：

- 查找本地 `imessage-exporter` 可执行文件。
- 优先使用传入的 `-ExporterPath`。
- 其次使用环境变量 `IMESSAGE_EXPORTER_PATH`。
- 再尝试 PATH 中的 `imessage-exporter`。
- 最后尝试用户 Downloads 目录中最近的 `imessage-exporter*.exe`。
- 找到 exporter 后，设置 `IMESSAGE_EXPORTER_REAL_SMOKE_PATH`。
- 调用 Rust 后端测试 `real_exporter_accepts_gui_generated_command_matrix`。

CI 中的 Windows job 会下载固定版本 `imessage-exporter 4.1.0`：

```text
https://github.com/ReagentX/imessage-exporter/releases/download/4.1.0/imessage-exporter-x86_64-pc-windows-gnu.exe
```

下载后的路径通过 `scripts/smoke-exporter-cli.ps1 -ExporterPath <path>` 传入。这样 PR 的必过 `windows` 检查不再只跑 mock，而是会用真实 exporter 本体验证 GUI 生成的 25 组命令矩阵。Release workflow 暂不改变；当前先把 PR CI 做成硬门槛。

### 4.3 为什么矩阵放在 Rust 测试里

最开始曾经在 PowerShell 脚本里手写参数矩阵，但这样有一个风险：脚本里手写的参数可能和真实 GUI 后端生成逻辑漂移。

最终改成：

- PowerShell 只负责定位 exporter 和启动测试。
- 命令矩阵由 `src-tauri/src/cli.rs` 内部的真实后端逻辑生成。
- 测试调用同一套 `diagnostics_args()` 和 `export_args()`。

这样能保证测试的不是“脚本模仿出来的一组参数”，而是“GUI 后端实际会生成的参数”。

### 4.4 当前真实 CLI 矩阵覆盖范围

真实 exporter smoke 当前覆盖 25 个 GUI 生成命令组合：

1. 普通诊断
2. 加密备份诊断，带 `--cleartext-password`
3. HTML + disabled 附件策略
4. HTML + disabled + no-lazy
5. HTML + clone 附件策略
6. HTML + clone + no-lazy
7. HTML + basic 附件策略
8. HTML + basic + no-lazy
9. HTML + full 附件策略
10. HTML + full + no-lazy
11. TXT + disabled 附件策略
12. TXT + clone 附件策略
13. TXT + basic 附件策略
14. TXT + full 附件策略
15. 导出加密备份密码
16. 仅开始日期
17. 仅结束日期
18. 开始日期 + 结束日期
19. 会话筛选
20. 自定义显示名称
21. 使用 caller ID 显示
22. 忽略磁盘空间警告
23. 自定义名称组合选项
24. caller ID 组合选项
25. TXT 格式下确认不会错误传 HTML-only 的 `-l`

### 4.5 验证策略说明

真实 smoke 使用一个不存在的临时备份目录，不读取用户真实聊天数据。

预期行为不是完整导出成功，而是：

- exporter 能正常解析 GUI 生成的参数。
- 不出现 CLI 参数兼容性错误。
- 命令继续执行到备份校验阶段。
- 输出中出现 `Manifest.plist` 或 `Manifest.db` 相关校验错误。

这样可以在不触碰真实用户数据的情况下验证参数兼容性。

### 4.6 明确防止的错误

真实 smoke 会拦截以下类型的问题：

```text
requires --format
Invalid command line options
Invalid options
unexpected argument
unrecognized option
```

这覆盖了本轮用户实际遇到的 `--no-progress` 兼容性问题，也能提前发现后续参数映射错误。

## 5. 前端与体验改动概览

本轮除了真实 exporter 验证，也包含了一系列前端体验改动。这些改动来自逐步看界面、截图反馈和实际使用感受。

### 5.1 导航与步骤文案

早期界面把几个 tab 表达成类似 step 1/2/3，但实际流程并不是严格线性步骤。因此调整为工作区导航，而不是误导性的数字步骤。

改动目标：

- 避免让用户误以为三个 tab 必须按 1、2、3 顺序完成。
- 让“数据准备 / 诊断 / 导出设置 / 执行导出”更像工作区。
- 已经配置好的导出引擎不再反复用过重文案提示。

相关文件：

- `src/App.tsx`
- `src/components/ShellPanels.tsx`
- `src/components/WorkspaceSteps.tsx`
- `src/i18n.ts`
- `src/styles.css`

### 5.2 日期选择器

之前日期范围是用户直接输入文本，容易出现格式错误。已改成日期选择器。

改动目标：

- 降低 `YYYY-MM-DD` 手动输入错误。
- 保留前后端双重日期校验。
- 前端拒绝不存在日期，例如 `2025-02-30`。
- 后端也校验真实日期和起止日期顺序。

相关文件：

- `src/components/ExportOptionFields.tsx`
- `src/lib/exportConfig.ts`
- `src-tauri/src/cli.rs`

### 5.3 会话筛选选择器

之前会话筛选更偏命令行思路，需要用户手动填文本。现在优先扫描并列出会话，让用户选择。

改动目标：

- 先扫描 iOS 备份中的 Messages 数据库。
- 列出会话标题、参与者、消息数量、最近消息时间。
- 支持搜索和排序。
- 只有扫描不可用时才回退到手动输入筛选值。

相关文件：

- `src-tauri/src/conversations.rs`
- `src-tauri/src/commands.rs`
- `src/components/ExportOptionFields.tsx`
- `src/App.tsx`

### 5.4 侧栏与环境面板布局

用户反馈侧栏滚动条不好看，也不希望关键信息放在滚动底部看不到。因此调整为：

- 侧栏固定高度，不出现丑的独立滚动条。
- 环境状态面板放在更靠前位置。
- 主工作区承担主要滚动。
- 环境详情通过弹窗展示，避免侧栏堆太长。

相关文件：

- `src/App.tsx`
- `src/components/ShellPanels.tsx`
- `src/components/Dialogs.tsx`
- `src/styles.css`

### 5.5 选中态按钮视觉修复

用户反馈部分按钮左右不对称、左边线条显得更粗。对应调整了选项卡、分段按钮、预设按钮的选中态样式。

改动目标：

- 避免使用导致视觉偏重的 inset 边线。
- hover 和 selected 状态保持左右对称。
- 让控件看起来更像应用界面，而不是临时表单。

相关文件：

- `src/styles.css`
- `scripts/sanity-check.mjs`

### 5.6 导出引擎设置和环境详情

增加或优化了：

- 导出引擎设置卡片。
- 环境详情弹窗。
- 支持摘要。
- About 与诊断信息。
- 更新检查与安装入口。
- 许可证和第三方声明资源入口。

相关文件：

- `src/components/Dialogs.tsx`
- `src/components/ShellPanels.tsx`
- `src/api/tauri.ts`
- `src-tauri/src/commands.rs`
- `src-tauri/src/models.rs`

### 5.7 exporter 版本兼容提示与失败恢复

环境检测现在会记录“已验证 exporter 版本”和“当前版本兼容状态”。当前只声明 `imessage-exporter 4.1.0` 已验证；当前版本低于 4.1.0 或无法识别时，只显示 warning，不阻断诊断或导出。侧栏环境摘要、环境详情、关于与诊断支持摘要、诊断报告都会带上这些信息，便于用户反馈问题。

失败恢复提示也补充了 CLI 参数兼容错误识别：

```text
requires --format
Invalid command line options
Invalid options
unexpected argument
unrecognized option
```

这些错误会归类为“导出引擎参数不兼容”，提示用户更新 GUI 或 `imessage-exporter`，并复制诊断报告反馈。

## 6. 后端与 Tauri 改动概览

### 6.1 CLI 参数映射

核心文件：

- `src-tauri/src/cli.rs`

当前后端负责将 GUI 配置转换为 exporter 参数：

- 备份路径：`-p`
- 平台：`-a iOS`
- 输出路径：`-o`
- 格式：`-f html` 或 `-f txt`
- 附件策略：`-c disabled|clone|basic|full`
- 禁用进度：`--no-progress`，仅导出命令使用
- 加密备份密码：`--cleartext-password`
- 开始日期：`-s`
- 结束日期：`-e`
- 会话筛选：`-t`
- HTML no-lazy：`-l`
- 自定义名称：`-m`
- caller ID：`-i`
- 忽略磁盘警告：`-b`

同时包含校验：

- 备份路径不能为空。
- 导出路径不能为空。
- 导出路径不能等于备份路径。
- 导出路径不能在备份路径内部。
- 日期必须为真实 `YYYY-MM-DD`。
- 结束日期不能早于开始日期。
- 自定义名称和 caller ID 不能同时启用。
- TXT 格式不会传 HTML-only 的 `-l`。

### 6.2 作业与日志

后端作业系统负责：

- 启动 exporter 子进程。
- 发送 stdout/stderr/exit 事件给前端。
- 阻止同时运行多个导出或诊断任务。
- 支持取消任务。
- 对日志和预览中的 cleartext password 做脱敏。

相关文件：

- `src-tauri/src/jobs.rs`
- `src-tauri/src/commands.rs`

### 6.3 输出结果定位

增加了打开首个结果文件的能力：

- HTML 导出后打开首个 `.html` 或 `.htm`
- TXT 导出后打开首个 `.txt`

相关文件：

- `src-tauri/src/commands.rs`
- `src/api/tauri.ts`
- `src/components/WorkspaceSteps.tsx`

## 7. 验证与测试情况

### 7.1 本地验证

本轮本地已执行并通过：

```powershell
npm run smoke:exporter-cli
npm run check:static
npm run build
cargo fmt --check
cargo test
npm run package:windows
```

其中 `npm run package:windows` 包含：

- 静态检查
- TypeScript build
- Vitest 单测
- npm audit
- Mock UI smoke
- Rust format
- Rust metadata
- 真实 exporter CLI compatibility smoke
- Rust tests
- Rust check
- Tauri Windows bundle
- NSIS 安装包静默安装和启动 smoke

### 7.2 本地真实 exporter smoke

本地测试使用的 exporter：

```text
C:\Users\18366\Downloads\imessage-exporter-x86_64-pc-windows-gnu.exe
```

版本：

```text
iMessage Exporter 4.1.0
```

结果：

- GUI-generated command matrix：25 cases
- 25/25 通过
- 未再出现 `requires --format`
- 未出现无效命令行参数错误

### 7.3 本地安装包 smoke

本地 `npm run package:windows` 成功生成：

- `dist-installers/iMessage Exporter GUI_0.1.1_x64-setup.exe`
- `dist-installers/iMessage Exporter GUI_0.1.1_x64_zh-CN.msi`
- `dist-installers/SHA256SUMS.txt`

并完成：

- NSIS 安装包静默安装
- 安装后的 `imessage-exporter-gui.exe` 启动成功

### 7.4 GitHub CI

PR：

- <https://github.com/A1mAssist/imessage-exporter-gui/pull/7>

CI run：

- <https://github.com/A1mAssist/imessage-exporter-gui/actions/runs/27502277348>

结果：

- `windows` job 成功
- 静态检查成功
- 前端测试成功
- 前端构建成功
- Mock UI smoke 成功
- Rust format 成功
- Rust tests 成功
- Rust check 成功

### 7.5 GitHub Release workflow

Release run：

- <https://github.com/A1mAssist/imessage-exporter-gui/actions/runs/27502531360>

结果：

- Windows release job 成功
- macOS release job 成功
- GitHub Release job 成功
- `v0.1.1` release 已发布

## 8. GitHub 发布操作记录

### 8.1 PR 与合并

由于 `main` 是受保护分支，不能直接 push。GitHub 拒绝直接推送，并提示：

```text
Protected branch update failed
Changes must be made through a pull request.
Required status check "windows" is expected.
```

因此采用以下流程：

1. 创建分支：`codex/validate-exporter-commands-0.1.1`
2. 推送分支到 GitHub
3. 创建 PR #7
4. 等待 CI `windows` 检查通过
5. squash merge 到 `main`
6. 删除远端开发分支

合并后的远端 main 提交：

```text
2bee823a788ccd0ac4c33d9303984e06e53143af
```

### 8.2 重建 v0.1.1 release

GitHub 上原本已有一个旧的 `v0.1.1` release，但它指向的是修复前提交，资产也是修复前构建。

处理步骤：

1. 删除旧 `v0.1.1` release 和 tag。
2. 重新创建 `v0.1.1` tag，指向 `origin/main` 的 `2bee823`。
3. 推送 tag 触发 `Release Installers` workflow。
4. workflow 成功后自动创建新的 GitHub release。
5. 补充 release notes。

当前 `v0.1.1` tag 指向：

```text
2bee823a788ccd0ac4c33d9303984e06e53143af
```

### 8.3 删除 v0.1.0

用户要求删除 GitHub 上的 `0.1.0`。实际 tag 和 release 名称为：

```text
v0.1.0
```

已执行：

- 删除 `v0.1.0` GitHub release
- 删除远端 `v0.1.0` tag

最终确认：

- `gh release list` 只显示 `v0.1.1`
- `git ls-remote --tags origin v0.1.0` 不再返回结果
- `git ls-remote --tags origin v0.1.1` 返回 `2bee823`

## 9. v0.1.1 Release 资产

当前 release 页面：

- <https://github.com/A1mAssist/imessage-exporter-gui/releases/tag/v0.1.1>

当前 release 资产包括：

| 文件 | 用途 |
| --- | --- |
| `iMessage.Exporter.GUI_0.1.1_x64-setup.exe` | Windows NSIS 安装包，推荐普通用户使用 |
| `iMessage.Exporter.GUI_0.1.1_x64-setup.exe.sig` | Windows NSIS 更新签名 |
| `iMessage.Exporter.GUI_0.1.1_x64_zh-CN.msi` | Windows MSI 安装包，适合托管部署 |
| `iMessage.Exporter.GUI_0.1.1_x64_zh-CN.msi.sig` | Windows MSI 更新签名 |
| `iMessage.Exporter.GUI_0.1.1_aarch64.dmg` | macOS Apple Silicon 安装包 |
| `latest.json` | Tauri updater manifest |
| `SHA256SUMS-windows.txt` | Windows 资产校验和 |
| `SHA256SUMS-macos.txt` | macOS 资产校验和 |

GitHub release 中记录的主要 SHA256 digest：

| 文件 | SHA256 |
| --- | --- |
| `iMessage.Exporter.GUI_0.1.1_x64-setup.exe` | `3efe30ac89ba070840570a8e50d4ce0bb4d5fede0de9272a756c58257f7a67d6` |
| `iMessage.Exporter.GUI_0.1.1_x64_zh-CN.msi` | `b756c142fb514854cb9981cb77940a52ed6f5235bf57d71dedd39b8e136b9cb7` |
| `iMessage.Exporter.GUI_0.1.1_aarch64.dmg` | `1197ca86c8a8d283a235dabcdf4f2b72cd942e58fbba6cae8359616b60c49211` |
| `latest.json` | `dd5845015273889f96a7b3e5575197e1b7afd4a1071d9880e34f08a490a2327a` |

## 10. 本轮重要文件变更

### 10.1 后端

- `src-tauri/src/cli.rs`
  - 修复诊断命令错误传 `--no-progress`。
  - 增加真实 exporter 命令矩阵测试。
  - 强化日期、路径、参数互斥等校验。

- `src-tauri/src/commands.rs`
  - 支持会话扫描、输出路径检查、打开首个结果文件等后端命令。

- `src-tauri/src/conversations.rs`
  - 从 iOS 备份 Manifest 中定位 `sms.db`，扫描会话列表。

- `src-tauri/src/jobs.rs`
  - 负责 exporter 子进程、日志事件、取消任务和密码脱敏。

### 10.2 前端

- `src/App.tsx`
  - 组织主流程状态、任务状态、环境状态、导航状态和持久化设置。

- `src/components/WorkspaceSteps.tsx`
  - 主要工作区页面：数据准备、诊断、选项、执行导出。

- `src/components/ExportOptionFields.tsx`
  - 日期选择器、会话选择器、导出选项控件。

- `src/components/ShellPanels.tsx`
  - 侧栏、顶栏、环境摘要、资源链接。

- `src/components/Dialogs.tsx`
  - 关于、环境详情、首次设置、更新等弹窗。

- `src/styles.css`
  - 布局、按钮、选中态、侧栏滚动策略、弹窗和响应式样式。

### 10.3 验证与发布脚本

- `scripts/smoke-exporter-cli.ps1`
  - 新增真实 exporter CLI compatibility smoke。

- `scripts/verify.ps1`
  - 将真实 exporter smoke 接入验证链路。
  - 支持本地无签名 Tauri 构建。

- `scripts/package-windows.ps1`
  - Windows 打包后运行安装包 smoke。
  - 本地无签名构建时跳过 `latest.json` 生成。

- `scripts/sanity-check.mjs`
  - 增加静态断言，防止关键能力回退。

- `.github/workflows/release.yml`
  - 负责 tag push 后打 Windows/macOS 安装包并创建 release。

## 11. 当前已知限制

### 11.1 真实 smoke 不做完整真实数据导出

真实 exporter smoke 目前只验证命令行参数兼容性，不读取真实用户 iOS 备份，也不验证完整导出结果内容。

原因：

- 真实 iOS 备份可能包含隐私数据。
- CI 环境没有真实备份。
- 参数兼容性问题可以通过缺失备份路径进入 Manifest 校验阶段来验证。

后续如果要做端到端真实导出测试，建议准备脱敏的最小 iOS 备份 fixture。

### 11.2 macOS 本地未在当前 Windows 机器上手动安装测试

macOS `.dmg` 由 GitHub Actions 在 `macos-latest` 上构建完成。当前 Windows 本地无法手动安装验证 macOS 包。

### 11.3 updater 依赖签名资产

GitHub release workflow 会生成签名和 `latest.json`。本地 `package:windows` 如果没有设置 Tauri 签名私钥，会构建 unsigned installers，并跳过本地 `latest.json` 生成。

这属于预期行为。

## 12. 后续建议

### 12.1 增加最小真实备份 fixture

建议后续准备一个不含真实隐私数据的最小 iOS backup fixture，用于验证：

- 能扫描会话。
- 能成功导出 HTML。
- 能成功导出 TXT。
- 能打开首个结果文件。
- 会话筛选能真的筛出目标会话。

### 12.2 对 exporter 版本做兼容矩阵

当前真实验证使用 `iMessage Exporter 4.1.0`。建议后续记录和测试多个版本：

- 当前推荐版本
- 最低支持版本
- 未来新版本

可以在环境检测中提示用户当前 exporter 版本是否在已验证范围内。

### 12.3 增加 release 前 checklist

建议 release 前固定执行：

```powershell
npm run check:static
npm run test
npm run build
npm run smoke:exporter-cli
npm run package:windows
```

并确认：

- GitHub CI 成功。
- Release workflow 成功。
- release tag 指向最新 main。
- release 资产下载链接存在。
- `latest.json` 存在并包含当前版本。
- 旧错误版本 release 已按需下架。

### 12.4 继续改善失败诊断

本轮已经能把 CLI 参数错误提前拦住。后续可以继续加强：

- 密码错误识别。
- 备份损坏识别。
- 权限不足识别。
- 磁盘空间不足识别。
- ffmpeg/ImageMagick 缺失提示。
- exporter 版本过低提示。

## 13. 本轮结论

`v0.1.1` 已完成重新发布。相比原先版本，当前版本最关键的变化是：

- 修复了真实用户遇到的 exporter 参数兼容性错误。
- 把真实 exporter 本体验证接入开发和打包流程。
- 25 个 GUI 后端生成的命令组合已在 `iMessage Exporter 4.1.0` 上通过参数兼容性测试。
- Windows 本地安装包已通过安装和启动 smoke。
- GitHub Actions 已重新构建 Windows/macOS release 资产。
- 旧 `v0.1.0` 已从 GitHub 删除。

后续如果再出现“mock 正常但真实 exporter 失败”的问题，应优先把失败命令纳入 `real_exporter_accepts_gui_generated_command_matrix` 或更高阶的真实备份 fixture 测试中，而不是只在前端 mock 层修补表现。
