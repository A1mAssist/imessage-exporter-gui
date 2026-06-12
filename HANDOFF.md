# iMessage Exporter GUI Handoff

交接日期: 2026-06-12  
项目路径: `C:\Users\yancy\Documents\imessage-exporter-gui`  
产品方向: Windows-first Tauri v2 + React + TypeScript 桌面 GUI，用向导方式调用 `imessage-exporter` 导出本机 iOS 备份。

## 一句话状态

这个项目已经是一个基本可用的 v1 GUI 原型：前端向导、Tauri/Rust 后端命令、sidecar 配置、mock 浏览器验证、GitHub Actions Windows 打包流程都已搭好。当前机器没有本机 Windows 原生打包环境和 sidecar 二进制，native installer 交给 GitHub Actions 或另一台装好 MSVC/Windows SDK 的机器完成。

## 当前已完成

- Tauri v2 桌面项目脚手架，Windows NSIS/MSI bundle 目标已配置。
- React + TypeScript 中文工具型向导 UI，四步流程:
  - 数据源: 选择/扫描 iOS backup 根目录，检查 `Manifest.db` 和 `Info.plist`。
  - 诊断: 运行 sidecar 诊断，展示数据库、附件、联系人、转换器状态。
  - 选项: 选择 HTML/TXT、附件 copy method、日期范围、会话筛选、显示名、输出目录。
  - 导出/结果: 流式日志、取消、摘要、打开输出目录、打开首个 HTML/TXT。
- Rust Tauri commands 负责启动 sidecar，不让前端拼 shell 命令。
- 命令预览和日志 redaction，包括 encrypted backup password。
- 密码只在内存中，支持手动清除和任务结束后自动清除。
- 非敏感设置持久化到 localStorage，密码明确排除。
- 输出目录检查: 阻止写进 backup 目录，提示非空/旧导出目录。
- 一键生成时间戳归档目录，例如 `Messages Export 2026-06-12 0130`。
- 三个导出预设:
  - 快速归档: HTML + clone
  - 轻量文本: TXT + disabled
  - 打印准备: HTML + clone + no-lazy
- 导出完成摘要面板: 成功、取消、失败状态分开显示。
- 失败恢复提示分类:
  - 密码错误
  - 备份不完整
  - 输出目录权限
  - sidecar 缺失
  - 转换器缺失
- 日志搜索和 stdout/stderr/error 过滤。
- 诊断报告复制/下载 `.txt`，包含环境、备份状态、诊断摘要、脱敏命令、脱敏日志。
- 备份路径、输出路径、结果路径的复制按钮和完整路径 tooltip。
- 首次使用空状态会提示 Apple Devices/iTunes 的常见 backup 路径。
- Chrome/Edge headless mock smoke 覆盖主流程和新增打磨点。
- GitHub Actions:
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - release workflow 会在 `windows-latest` + MSVC shell 下构建 sidecar、验证、打包 installers。

## 当前没有完成或有意不在本机完成

- 本机 native Tauri build 没有跑通，因为当前机器缺:
  - `link.exe`
  - Windows SDK libs，例如 `kernel32.lib`
  - `src-tauri\binaries\imessage-exporter-x86_64-pc-windows-msvc.exe`
- 本机 Rust tests 没作为最终完成条件，因为 native linker 缺失。`verify.ps1 -SkipAudit` 会跑 Rust format 和 metadata，不跑 native build。
- `ffmpeg` 和 ImageMagick 没有内置，也没在当前机器安装；这是产品设计决定。UI 会提示 basic/full 需要它们。
- v1 不做 macOS `chat.db`、越狱 `sms.db`、原生 PDF 导出、导出后全文搜索/浏览器。

## 最后验证结果

最后一轮在当前机器通过:

```powershell
.\.tools\node-v22.22.3-win-x64\node.exe scripts\sanity-check.mjs
.\.tools\node-v22.22.3-win-x64\node.exe .\node_modules\typescript\bin\tsc --noEmit
.\.tools\node-v22.22.3-win-x64\node.exe .\node_modules\vitest\vitest.mjs run --configLoader runner
.\.tools\node-v22.22.3-win-x64\node.exe scripts\smoke-mock-ui.mjs
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipAudit
```

结果摘要:

- `sanity-check.mjs`: passed
- `tsc --noEmit`: passed
- `vitest`: 8 test files, 30 tests passed
- `smoke-mock-ui.mjs`: passed，走完 source、diagnostics、options、cancel、success、TXT、archive directory、presets、failure hints、log search/filter、diagnostic report、path copy、empty state、auto-clear password
- `verify.ps1 -SkipAudit`: passed
- `verify.ps1 -SkipAudit` 的 doctor 部分仍会报告 native build blockers，这是预期:
  - missing `link`
  - missing Windows SDK libs
  - missing sidecar exe

## 新电脑恢复开发

### 1. 解压

把 zip 解压到任意开发目录，例如:

```powershell
Expand-Archive .\imessage-exporter-gui-handoff.zip -DestinationPath C:\dev
cd C:\dev\imessage-exporter-gui
```

### 2. 安装 Node 依赖

如果 zip 中没有 `node_modules`，运行:

```powershell
npm install
```

项目有 `package-lock.json`，也可以用:

```powershell
npm ci
```

### 3. 跑 mock UI

不需要 Tauri 或 sidecar 就能先看产品:

```powershell
npm run dev:mock
```

打开:

```txt
http://127.0.0.1:1421/?mock=1
```

可用 mock 参数:

```txt
?mock=1
?mock=1&missingSidecar=1
?mock=1&emptyBackups=1
?mock=1&fail=password
?mock=1&fail=backup
?mock=1&fail=permission
?mock=1&fail=sidecar
?mock=1&fail=converter
```

### 4. 跑验证

有完整 Node/npm 环境时:

```powershell
npm run check:static
npm test
npm run smoke:mock-ui
npm run verify:offline
```

如果 PowerShell 拦截 `npm.ps1`:

```powershell
npm.cmd run verify:offline
```

### 5. 本机 Tauri/native 开发

需要:

- Node.js 20+
- Rust stable + Cargo
- Microsoft WebView2 Runtime
- Visual Studio Build Tools 2022 + Desktop development with C++ workload
- Windows SDK libs

先检查:

```powershell
.\scripts\doctor.ps1
```

安装辅助脚本:

```powershell
.\scripts\setup-windows.ps1
.\scripts\setup-windows.ps1 -Install
```

可选 converter:

```powershell
.\scripts\setup-windows.ps1 -Install -InstallOptionalTools
```

### 6. 构建 sidecar

native build 前必须有:

```txt
src-tauri\binaries\imessage-exporter-x86_64-pc-windows-msvc.exe
```

构建:

```powershell
.\scripts\build-sidecar.ps1
```

sidecar 固定版本见 [SIDE_CAR.md](./SIDE_CAR.md)，当前锁定 `imessage-exporter` `4.1.0`。

### 7. 打包 Windows installer

推荐走 GitHub Actions，不要求开发机安装 native toolchain:

1. 推送代码到 GitHub。
2. 进入 Actions。
3. 运行 `Release Windows Installers` workflow。
4. 下载 `imessage-exporter-gui-windows` artifact。

本机 native 环境齐全后也可以:

```powershell
.\scripts\verify.ps1 -Native
npm run tauri build
npm run package:windows
```

## 关键文件地图

### 前端

- [src/App.tsx](./src/App.tsx): 主 UI 和向导状态，包含四步页面、日志面板、预设接线、诊断报告接线、失败提示接线。
- [src/styles.css](./src/styles.css): 全部 UI 样式，工具型工作台风格，响应式布局。
- [src/types.ts](./src/types.ts): 共享 TS 类型。
- [src/main.tsx](./src/main.tsx): React entry。

### 前端 helper

- [src/lib/exportConfig.ts](./src/lib/exportConfig.ts): 默认配置、格式/附件选项、日期校验、配置 normalize。
- [src/lib/persistence.ts](./src/lib/persistence.ts): localStorage 持久化，明确排除 `cleartextPassword`。
- [src/lib/diagnostics.ts](./src/lib/diagnostics.ts): 诊断日志摘要解析。
- [src/lib/exportSummary.ts](./src/lib/exportSummary.ts): 导出结果摘要解析。
- [src/lib/archivePath.ts](./src/lib/archivePath.ts): 生成时间戳归档目录。
- [src/lib/exportPresets.ts](./src/lib/exportPresets.ts): 三个 v1 导出预设。
- [src/lib/recoveryHints.ts](./src/lib/recoveryHints.ts): 失败恢复提示分类。
- [src/lib/diagnosticReport.ts](./src/lib/diagnosticReport.ts): 诊断报告生成和敏感文本脱敏。

### Mock/Tauri API bridge

- [src/api/tauri.ts](./src/api/tauri.ts): 浏览器 mock API 和真实 Tauri invoke/listen bridge。
  - mock backups
  - mock diagnostics/export jobs
  - mock failure scenarios
  - mock output path inspection

### Rust/Tauri 后端

- [src-tauri/src/commands.rs](./src-tauri/src/commands.rs): Tauri commands。
- [src-tauri/src/jobs.rs](./src-tauri/src/jobs.rs): job 管理、stdout/stderr streaming、取消、log redaction。
- [src-tauri/src/cli.rs](./src-tauri/src/cli.rs): CLI arg builder、sidecar path resolution、preview redaction。
- [src-tauri/src/environment.rs](./src-tauri/src/environment.rs): 环境检测、backup scanning。
- [src-tauri/src/models.rs](./src-tauri/src/models.rs): Rust side models。
- [src-tauri/tauri.conf.json](./src-tauri/tauri.conf.json): Tauri bundle/sidecar/resources 配置。

### Scripts

- [scripts/sanity-check.mjs](./scripts/sanity-check.mjs): 静态项目健康检查。
- [scripts/smoke-mock-ui.mjs](./scripts/smoke-mock-ui.mjs): Chrome/Edge headless mock UI 测试。
- [scripts/verify.ps1](./scripts/verify.ps1): 一键验证。
- [scripts/doctor.ps1](./scripts/doctor.ps1): 本机环境诊断。
- [scripts/build-sidecar.ps1](./scripts/build-sidecar.ps1): 构建 `imessage-exporter` sidecar。
- [scripts/package-windows.ps1](./scripts/package-windows.ps1): 本机 Windows 打包收集 artifacts。
- [scripts/setup-windows.ps1](./scripts/setup-windows.ps1): Windows 开发依赖安装辅助。
- [scripts/render-preview.mjs](./scripts/render-preview.mjs): 静态 preview 截图。
- [scripts/serve-dist.mjs](./scripts/serve-dist.mjs): 静态 dist mock server。

### CI/CD

- [.github/workflows/ci.yml](./.github/workflows/ci.yml): CI。
- [.github/workflows/release.yml](./.github/workflows/release.yml): Windows installer release workflow。

### 文档/许可

- [README.md](./README.md): 用户/开发说明。
- [LICENSE](./LICENSE): GPL-3.0-only。
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md): 第三方声明。
- [SIDE_CAR.md](./SIDE_CAR.md): sidecar 版本锁定和来源说明。

## 产品行为注意点

- v1 只支持 iOS backup source。不要在 UI 暴露 `--attachment-root`，因为 upstream 对 iOS backup 说它无效。
- 所有 export 都应加 `--no-progress`，由 GUI 自己显示日志。
- encrypted backup password 使用 `--cleartext-password` 传给 CLI，UI 必须继续强调系统进程列表可能短暂可见。
- 命令预览、日志、诊断报告都必须 redacted。
- `customName` 和 `useCallerId` 互斥。
- TXT 导出不应带 `-l` / no-lazy。
- `basic` 和 `full` 依赖 ffmpeg/ImageMagick；不要内置它们。
- 输出目录不能是 backup 目录，也不能在 backup 目录内部。

## 当前测试覆盖

Vitest helper tests:

- export config validation and normalization
- persistence password exclusion
- diagnostic parser scoping
- export summary states
- archive path generation
- export presets preserving source/password
- recovery hint classification
- diagnostic report redaction

Chrome/Edge smoke:

- source page health and responsive compact layout
- readiness/environment/resource links
- incomplete backup blocking
- password manual clear and auto-clear
- diagnostics details and report redaction
- output directory inspection and warning
- generated archive directory
- format-specific HTML/TXT controls
- presets
- export cancellation and success
- result summary and first HTML/TXT action
- missing sidecar blocker
- failure recovery hint
- log search/filter
- path copy actions
- first-use empty state

## Known Local Environment Notes

- 当前机器有 bundled Node runtime under `.tools`, but the handoff zip intentionally does not need to include it. On a new machine, install Node normally.
- 当前机器 `git` 不在 PATH，所以最后没有生成 `git status`/`git diff` 输出。
- 当前机器没有 native linker/SDK, so do not treat local native build absence as product failure.

## Suggested Next Work

1. 在 GitHub 上跑 `Release Windows Installers` workflow，确认 sidecar 构建和 NSIS/MSI artifacts。
2. 在一台有真实 iOS encrypted backup 的 Windows 机器上跑真实 diagnostics/export acceptance:
   - select backup
   - run diagnostics
   - export HTML + clone
   - cancel a long run
   - open output folder and first HTML/TXT
3. 如果要继续产品打磨，优先做:
   - 会话筛选的可视化候选列表
   - 输出目录命名冲突递增，例如 `Messages Export 2026-06-12 0130 (2)`
   - 真实日志解析更多 upstream phrases
   - native app update/signing story
   - 更完整的 accessibility audit

## Zip 打包建议

交接 zip 应包含源码、锁文件、脚本、文档、CI、preview 截图和 Tauri config。

建议排除:

- `node_modules/`
- `dist/`
- `.tools/`
- `src-tauri/target/`
- `dist-installers/`
- `.git/`
- 临时 debug 截图，例如 `preview/debug-*.png`

解压后用 `npm install` 或 `npm ci` 恢复依赖。
