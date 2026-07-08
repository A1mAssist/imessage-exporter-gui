import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.error(`err ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function parseJson(path) {
  try {
    JSON.parse(read(path));
    check(`json ${path}`, true);
  } catch (error) {
    check(`json ${path}`, false, error.message);
  }
}

for (const path of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/capabilities/default.json",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
]) {
  if (path.endsWith(".json")) parseJson(path);
}

for (const path of [
  "src/App.tsx",
  "src/styles.css",
  "src/api/tauri.ts",
  "src/theme.ts",
  "src/lib/exportConfig.ts",
  "src/lib/archivePath.ts",
  "src/lib/archivePath.test.ts",
  "src/lib/diagnosticReport.ts",
  "src/lib/diagnosticReport.test.ts",
  "src/lib/exportPresets.ts",
  "src/lib/exportPresets.test.ts",
  "src/lib/recoveryHints.ts",
  "src/lib/recoveryHints.test.ts",
  "src/lib/persistence.ts",
  "src/lib/persistence.test.ts",
  "src-tauri/src/jobs.rs",
  "src-tauri/src/commands.rs",
  "src-tauri/src/models.rs",
  "scripts/doctor.ps1",
  "scripts/setup-windows.ps1",
  "scripts/package-release.ps1",
  "scripts/package-windows.ps1",
  "scripts/create-updater-manifest.ps1",
  "scripts/generate-icons.mjs",
  "scripts/render-preview.mjs",
  "scripts/render-preview.ps1",
  "scripts/serve-dist.mjs",
  "scripts/smoke-mock-ui.mjs",
  "scripts/smoke-installed-windows.ps1",
  "scripts/verify.ps1",
  "app-icon.png",
  "preview/index.html",
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/64x64.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/icon.png",
  "src-tauri/icons/icon.icns",
  "src-tauri/icons/icon.ico",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
]) {
  check(`exists ${path}`, existsSync(join(root, path)));
}

const app = read("src/App.tsx");
const commonUi = read("src/components/CommonUi.tsx");
const dialogs = read("src/components/Dialogs.tsx");
const shellPanels = read("src/components/ShellPanels.tsx");
const workspaceSteps = read("src/components/WorkspaceSteps.tsx");
check("app has Chinese UX copy", ["选择 iOS 备份", "运行诊断", "开始导出", "打开输出目录"].every((text) => app.includes(text) || workspaceSteps.includes(text)));
check("app has no Unicode replacement chars", !app.includes("\uFFFD"));
check("app keeps page components split out of App", workspaceSteps.includes("export function SourceStep") && workspaceSteps.includes("export function DiagnosticsStep") && workspaceSteps.includes("export function OptionsStep") && workspaceSteps.includes("export function RunStep") && !app.includes("function SourceStep") && app.length < 45000);
check("app uses topbar status overview", app.includes("TopBar") && shellPanels.includes("function TopBar") && shellPanels.includes("quick-stats"));
check("app exposes first result action", workspaceSteps.includes("resultFileLabel") && workspaceSteps.includes('"JSONL"') && workspaceSteps.includes('"TXT"') && app.includes("openFirstResult"));
check("app gates first result action on successful export", workspaceSteps.includes('format === "html"') && workspaceSteps.includes('outcome.kind !== "succeeded"'));
check("app exposes JSONL quick search only after successful JSONL export", workspaceSteps.includes("function JsonlPreview") && workspaceSteps.includes('config.format === "jsonl"') && workspaceSteps.includes('outcome.kind === "succeeded"') && app.includes("searchJsonlResult"));
check("app exposes copy actions without command or log chrome", commonUi.includes("function CopyButton") && commonUi.includes("复制路径") && !commonUi.includes("复制命令") && !commonUi.includes("复制日志"));
check("app keeps engine logs out of the visible UI", !workspaceSteps.includes("LogPanel") && !commonUi.includes("function LogPanel") && !read("src/styles.css").includes(".log-panel") && !commonUi.includes("stderr/stdout"));
check("app reports clipboard copy failure", commonUi.includes("复制失败") && commonUi.includes("Clipboard API unavailable"));
check("app warns before exporting into non-empty output folders", workspaceSteps.includes("ExportPathNotice") && workspaceSteps.includes("输出目录已有内容") && workspaceSteps.includes("needsExportPathConfirmation"));
check("app surfaces interrupted partial exports", workspaceSteps.includes("function InterruptedExports") && workspaceSteps.includes("interruptedExports") && workspaceSteps.includes(".partial") && read("src/types.ts").includes("interruptedExports: string[]"));
check("app confirms before starting over when partial exports exist", workspaceSteps.includes("status.interruptedExports.length > 0") && app.includes("检测到上次未完成导出的临时目录") && app.indexOf("inspectExportPath(normalized.exportPath)") < app.indexOf("needsExportPathConfirmation(latestExportPathStatus)"));
check("app rechecks export path before starting from Run", app.includes("latestExportPathStatus = await inspectExportPath(normalized.exportPath)") && app.indexOf("inspectExportPath(normalized.exportPath)") < app.indexOf("...validateExportConfig(normalized)"));
check("app isolates diagnostics and export job state", app.includes("diagnosticLogs") && app.includes("exportLogs") && app.includes("diagnosticOutcome") && app.includes("exportOutcome") && app.includes("exportJobIdRef"));
check("app disables export start while another job runs", app.includes("const exportStartDisabled = Boolean(runningJobId)") && app.includes("running={diagnosticsRunning}") && app.includes("running={exportRunning}") && app.includes("startDisabled={exportStartDisabled}"));
check("run step disables every start path when export preflight blocks", workspaceSteps.includes("startDisabled: boolean") && workspaceSteps.includes("(!running && startDisabled)") && workspaceSteps.includes("disabled={startDisabled || startingExport}") && workspaceSteps.includes("secondaryDisabled={!running && startDisabled}") && commonUi.includes("secondaryDisabled?: boolean"));
check("app shows explicit cancelled and failed job outcomes", commonUi.includes("type JobOutcome") && commonUi.includes("JobOutcomeNotice") && commonUi.includes("resultStripClass"));
check("app renders export summary panel", workspaceSteps.includes("ExportSummaryPanel") && workspaceSteps.includes("导出摘要") && workspaceSteps.includes("summarizeExportResult"));
check("app renders first-run route without built-in engine noise", workspaceSteps.includes("function FirstRunGuide") && workspaceSteps.includes("首次导出路线") && !workspaceSteps.includes('label: "内置导出引擎"'));
check("app renders first-run OOBE dialog", dialogs.includes("function OnboardingDialog") && dialogs.includes("首次设置指引") && app.includes("onboardingStorageKey"));
check("app dialogs support Escape, focus trap, and focus restore", dialogs.includes("useDialogKeyboard") && commonUi.includes('event.key === "Escape"') && commonUi.includes('event.key !== "Tab"') && commonUi.includes("getFocusableDialogElements") && app.includes("aboutTriggerRef") && app.includes("onboardingTriggerRef"));
check("app keeps preferences compact in topbar", shellPanels.includes("topbar-utilities") && shellPanels.includes("设置向导") && !app.includes("preference-controls"));
check("app exposes About and diagnostics dialog", dialogs.includes("function AboutDialog") && dialogs.includes("关于与诊断") && dialogs.includes("支持摘要") && dialogs.includes("buildSupportSnapshot"));
check("app exposes environment details dialog", dialogs.includes("function EnvironmentDialog") && dialogs.includes("运行环境详情") && app.includes("showEnvironmentDetails") && shellPanels.includes("onOpenEnvironmentDetails"));
check(
  "app shows verified exporter version compatibility state",
  read("src-tauri/src/models.rs").includes("verified_exporter_version") &&
    read("src-tauri/src/models.rs").includes("exporter_version_status") &&
    dialogs.includes("兼容状态") &&
    dialogs.includes("Verified exporter version") &&
    read("src/api/tauri.ts").includes("verifiedExporterVersion"),
);
check("app exposes automatic updater prompt", app.includes("checkForUpdates()") && app.includes('className="notice update"') && app.includes("dismissedUpdateVersion") && dialogs.includes("下载并安装") && !dialogs.includes("onCheckUpdates"));
check("app omits redundant built-in export engine setup card", !workspaceSteps.includes("function EngineSetupCard") && !workspaceSteps.includes(".engine-setup-card") && !workspaceSteps.includes("无需选择外部 exe"));
check("app remounts shell on language changes", app.includes('key={language}'));
check("app keeps sidebar environment summary free of exporter validation noise", !shellPanels.includes('label="导出引擎"') && !shellPanels.includes("env-version-line"));
check("app renders diagnostic summary panel", workspaceSteps.includes("function DiagnosticSummaryPanel") && workspaceSteps.includes("诊断摘要") && workspaceSteps.includes("附件转换"));
check("app renders recovery action buttons", commonUi.includes("function RecoveryActionRow") && commonUi.includes("回到数据源") && commonUi.includes("回到选项") && !commonUi.includes("下载导出引擎"));
check("app exposes generated archive directory action", workspaceSteps.includes("新建归档目录") && app.includes("timestampedArchiveSequence") && workspaceSteps.includes("生成带时间戳的新文件夹"));
check("app names single-conversation archive folders", app.includes("archiveLabelForConversation") && read("src/lib/archivePath.ts").includes("sanitizePathSegment") && read("src/lib/archivePath.test.ts").includes("Family_旅行_2026"));
check("app increments generated archive directory collisions", app.includes("nextAvailableArchivePath") && app.includes("无法生成未占用的归档目录"));
check("app wires export presets", workspaceSteps.includes("exportPresets.map") && workspaceSteps.includes("onApplyPreset") && app.includes("applyExportPreset"));
check("app shows recovery hints for failed jobs", commonUi.includes("recoveryHintForFailure") && commonUi.includes("hint?.action") && commonUi.includes("job-outcome-notice"));
check("app exports diagnostic reports", workspaceSteps.includes("DiagnosticReportActions") && commonUi.includes("复制诊断报告") && commonUi.includes("下载诊断报告 .txt") && workspaceSteps.includes("buildDiagnosticReport"));
check("app exposes path copy actions and tooltips", commonUi.includes("复制路径") && commonUi.includes("复制完整") && commonUi.includes("title={value}"));
check("app shows first-use backup empty guidance", workspaceSteps.includes("没有自动发现本机 iOS 备份") && workspaceSteps.includes("Apple Devices") && workspaceSteps.includes("%USERPROFILE%\\Apple\\MobileSync\\Backup"));
check("app shows startup readiness checks without exporter status", workspaceSteps.includes("function ReadinessBand") && workspaceSteps.includes("就绪检查") && !workspaceSteps.includes('label: "导出引擎"'));
check("app blocks diagnostics for incomplete backups", workspaceSteps.includes("sourceDiagnosticsBlockers") && workspaceSteps.includes("备份目录需要同时包含 Manifest.db 和 Info.plist") && workspaceSteps.includes("source-blockers"));
check("app renders diagnostic detail text", commonUi.includes("DiagnosticFinding") && commonUi.includes("status.detail"));
check("app summarizes export before running", workspaceSteps.includes("function ExportReview") && workspaceSteps.includes("function RunPreflightSummary") && workspaceSteps.includes("导出前复核") && workspaceSteps.includes("导出前总览") && workspaceSteps.includes("结果文件") && workspaceSteps.includes("preflightFileDescription"));
check("app persists only non-sensitive settings", app.includes("loadPersistedExportConfig(defaultExportConfig)") && app.includes("persistExportConfig(config)") && dialogs.includes("不保存备份密码"));
check("app exposes password clearing controls", workspaceSteps.includes("清除密码") && workspaceSteps.includes("任务结束后自动清除密码") && app.includes("autoClearPasswordRef"));
check("app validates saved manual backup path on startup", app.includes("validateBackupPath(config.backupPath)") && app.includes("candidate.encrypted ?? current.encrypted"));
check("app disables HTML-only print mode for non-HTML formats", workspaceSteps.includes('format === "html" ? { format, copyMethod: "clone" } : { format, copyMethod: "disabled", noLazy: false }') && workspaceSteps.includes('disabled={config.format !== "html"}'));
check("app forces TXT and JSONL attachment export off", workspaceSteps.includes('const handlesAttachments = config.format === "html"') && workspaceSteps.includes('TXT 和 JSONL 只写文本/结构化记录，不处理附件文件。') && workspaceSteps.includes('value={config.copyMethod}'));
check("app no longer blocks export on external exporter setup", app.includes("environmentExportBlockers") && !app.includes("缺少 imessage-exporter 导出引擎，暂时不能开始导出"));
check("app reports open result failures", app.includes("function openOutputPath") && app.includes("function openFirstResultFile") && app.includes("setError(String(err))"));
check("app keeps run section reachable after source is valid", app.includes("run: sourceReason ? { disabled: true, reason: sourceReason } : { disabled: false }") && app.includes('activeSectionId === "run"') && !app.includes('reason: "开始导出后可查看结果。"'));
check("app shows environment fix commands", shellPanels.includes("function EnvironmentFixList") && shellPanels.includes("setup-windows.ps1 -Install -InstallOptionalTools"));
check("app links bundled license resources", shellPanels.includes("function ResourceLinks") && shellPanels.includes("GPL 许可证") && app.includes("openResourceFile"));

const api = read("src/api/tauri.ts");
check("API has browser mock runtime", api.includes("usingMockApi") && api.includes("startMockExport") && api.includes("startMockDiagnostics"));
check("mock API exposes built-in exporter status", api.includes("built-in imessage-exporter 4.1.0 + JSONL") && !api.includes("missingExporter"));
check("mock export directory is outside backup", api.includes("Messages Export") && api.includes('purpose === "export"'));
check("API exposes export path inspection", api.includes("inspectExportPath") && api.includes("mockExportPathStatus"));
check("API opens bundled resource files", api.includes("openResourceFile") && api.includes("thirdPartyNotices"));
check("API opens first result file by format", api.includes("openFirstResult") && api.includes('"open_first_result"'));
check("API exposes app diagnostics and updater flow", api.includes("getAppDiagnostics") && api.includes("checkForAppUpdate") && api.includes("installAvailableUpdate") && api.includes("@tauri-apps/plugin-updater") && api.includes("@tauri-apps/plugin-process"));
check("API exposes conversation scanning", api.includes("scanConversations") && api.includes('"scan_conversations"') && api.includes("mockConversations"));
check("conversation picker preserves deduped chat id groups", read("src/types.ts").includes("chatIds: number[]") && read("src/types.ts").includes("conversationIds?: number[]") && workspaceSteps.includes("conversationIds") && read("src-tauri/src/engine.rs").includes("selected_conversation_ids"));
check("conversation picker searches the full scanned list without backend truncation", read("src/components/ExportOptionFields.tsx").includes("defaultConversationLimit") && read("src/components/ExportOptionFields.tsx").includes("searchedConversationLimit") && !read("src-tauri/src/conversations.rs").includes("conversations.truncate"));
check("conversation scan merges service-split direct caller ids", read("src-tauri/src/conversations.rs").includes("normalize_direct_identifier") && read("src-tauri/src/conversations.rs").includes("merges_direct_chats_with_same_caller_id_across_services_without_lookup") && api.includes("iMessage + SMS"));
check("mock API supports updater availability", api.includes("mockUpdateInfo") && api.includes("updateAvailable") && api.includes("0.2.0"));
check("mock API only maps no-lazy for HTML", read("src/lib/exportConfig.ts").includes('noLazy: config.format === "html" ? config.noLazy : false'));
check("mock API supports generated archive paths", api.includes("looksLikeGeneratedArchive") && api.includes("archiveCollision") && api.includes("messages export \\d{4}-\\d{2}-\\d{2} \\d{4}"));
check("mock API supports failure and empty-backup scenarios", api.includes('params.get("fail")') && api.includes('fail === "password"') && api.includes("emptyBackups"));

const persistence = read("src/lib/persistence.ts");
const persistedKeyEntries = persistence.match(/const persistedKeys[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
check("persistence storage key is versioned", persistence.includes("imessage-exporter-gui.exportSettings.v1"));
check("persistence clears password on load", persistence.includes('cleartextPassword: ""'));
check("persistence can save auto-clear password preference", persistence.includes('"autoClearPassword"') && read("src/lib/persistence.test.ts").includes("autoClearPassword"));
check("persistence drops legacy exporter paths", !persistedKeyEntries.includes('"exporterPath"') && persistence.includes('exporterPath: ""') && read("src/lib/persistence.test.ts").includes("drops legacy exporter paths"));
check("persistence clears no-lazy for TXT", persistence.includes('noLazy: config.format === "html" ? config.noLazy : false'));
check("persistence omits password from saved key list", !persistedKeyEntries.includes('"cleartextPassword"'));
const persistenceTests = read("src/lib/persistence.test.ts");
check("persistence clears attachment export for TXT and JSONL", persistence.includes('copyMethod: config.format === "html" ? config.copyMethod : "disabled"') && persistenceTests.includes("forces persisted TXT and JSONL settings"));
check("persistence tests cover password exclusion", persistenceTests.includes("never writes the cleartext backup password") && persistenceTests.includes("legacy-secret"));
const exportConfig = read("src/lib/exportConfig.ts");
const exportOptionFields = read("src/components/ExportOptionFields.tsx");
check("frontend rejects reversed date ranges", exportConfig.includes("reversedDateRange") && exportConfig.includes("结束日期不能早于开始日期"));
check("frontend rejects impossible dates", exportConfig.includes("Date.UTC") && read("src/lib/exportConfig.test.ts").includes("rejects impossible calendar dates"));
check("frontend uses date picker controls", workspaceSteps.includes("DateRangeField") && exportOptionFields.includes("function DateRangeField") && exportOptionFields.includes('type="date"') && exportOptionFields.includes("清除日期"));
check("frontend lists conversations before manual filtering", workspaceSteps.includes("ConversationPicker") && app.includes("scanConversations") && exportOptionFields.includes("function ConversationPicker") && exportOptionFields.includes("会话列表不可用") && exportOptionFields.includes("手动输入筛选值"));
check("frontend can search and sort conversations", exportOptionFields.includes("搜索会话") && exportOptionFields.includes("消息最多") && exportOptionFields.includes("最近消息") && exportOptionFields.includes("filterAndSortConversations"));
check("frontend clarifies self display name vs result filenames", workspaceSteps.includes("我的显示名") && workspaceSteps.includes("只影响导出内容里自己的名字") && !workspaceSteps.includes("自定义显示名"));
check("frontend normalizes no-lazy for TXT", exportConfig.includes('noLazy: config.format === "html" ? config.noLazy : false') && read("src/lib/exportConfig.test.ts").includes("drops HTML-only no-lazy mode for TXT exports"));
check("frontend normalizes attachment export for TXT and JSONL", exportConfig.includes('copyMethod: config.format === "html" ? config.copyMethod : "disabled"') && read("src/lib/exportConfig.test.ts").includes("forces attachment export off for TXT and JSONL exports"));
const diagnosticParser = read("src/lib/diagnostics.ts");
check("diagnostics parser scopes warnings to relevant lines", diagnosticParser.includes("relevant") && diagnosticParser.includes("hasWarning(line.lower)") && read("src/lib/diagnostics.test.ts").includes("keeps converter warnings from contaminating other sections"));
const exportSummary = read("src/lib/exportSummary.ts");
check("export summary parses result status, counts, duration, and output path", exportSummary.includes("Export complete") && exportSummary.includes("itemCountLabel") && exportSummary.includes("durationLabel") && read("src/lib/exportSummary.test.ts").includes("summarizes successful HTML exports"));
check("archive path helper creates timestamped output folders", read("src/lib/archivePath.ts").includes("Messages Export") && read("src/lib/archivePath.ts").includes("timestampedArchiveSequence") && read("src/lib/archivePath.test.ts").includes("startSuffix"));
check("export presets preserve source secrets", read("src/lib/exportPresets.ts").includes("quickArchive") && read("src/lib/exportPresets.test.ts").includes("does not overwrite source path"));
check("recovery hints classify known failure modes", read("src/lib/recoveryHints.ts").includes("备份密码可能不正确") && read("src/lib/recoveryHints.test.ts").includes("classifies known failure modes"));
check(
  "recovery hints classify exporter option compatibility failures",
  read("src/lib/recoveryHints.ts").includes("导出引擎选项不兼容") &&
    read("src/lib/recoveryHints.ts").includes("requires --format") &&
    read("src/lib/recoveryHints.ts").includes("unexpected argument") &&
    read("src/lib/recoveryHints.test.ts").includes("classifies exporter option compatibility failures"),
);
check("diagnostic report builder redacts secrets", read("src/lib/diagnosticReport.ts").includes("redactSensitiveText") && read("src/lib/diagnosticReport.test.ts").includes("not.toContain"));

const pkg = JSON.parse(read("package.json"));
check("package exposes mock dev script", Boolean(pkg.scripts?.["dev:mock"]));
check("package exposes mock UI smoke script", Boolean(pkg.scripts?.["smoke:mock-ui"]));
check("package exposes preview screenshot script", Boolean(pkg.scripts?.["preview:screenshots"]));
check("package exposes static mock preview server", Boolean(pkg.scripts?.["serve:mock"]));
check("package exposes cross-platform release packaging script", Boolean(pkg.scripts?.["package:release"]));
check("package exposes Windows packaging script", Boolean(pkg.scripts?.["package:windows"]));
check("package exposes updater manifest script", Boolean(pkg.scripts?.["manifest:updater"]));
check("package exposes installed Windows smoke script", Boolean(pkg.scripts?.["smoke:installed-windows"]));
check("package no longer exposes external exporter CLI smoke script", !Boolean(pkg.scripts?.["smoke:exporter-cli"]));
check("package exposes one-command verify script", Boolean(pkg.scripts?.verify));
check("package exposes offline verify script", Boolean(pkg.scripts?.["verify:offline"]));
check("package uses Vite runner config loader", ["dev", "dev:mock", "build", "preview", "test"].every((name) => pkg.scripts?.[name]?.includes("--configLoader runner")));
check("package uses A1mAssist author metadata", pkg.author === "A1mAssist");
check("package pins @tauri-apps/api", isExactVersion(pkg.dependencies?.["@tauri-apps/api"]));
check("package pins @tauri-apps/plugin-dialog", isExactVersion(pkg.dependencies?.["@tauri-apps/plugin-dialog"]));
check("package pins @tauri-apps/plugin-updater", isExactVersion(pkg.dependencies?.["@tauri-apps/plugin-updater"]));
check("package pins @tauri-apps/plugin-process", isExactVersion(pkg.dependencies?.["@tauri-apps/plugin-process"]));
check("package pins @tauri-apps/cli", isExactVersion(pkg.devDependencies?.["@tauri-apps/cli"]));

const styles = read("src/styles.css");
check("styles define design tokens", styles.includes("--accent") && styles.includes("--shadow"));
check("app supports theme switching", shellPanels.includes("function ThemeToggle") && read("src/theme.ts").includes("prefers-color-scheme") && styles.includes('[data-theme="dark"]'));
check("styles avoid nested cards pattern", !styles.includes(".content-band .content-band"));
check("styles include keyboard focus states", styles.includes(":focus-visible") && styles.includes("outline-offset"));
check("styles respect reduced motion", styles.includes("prefers-reduced-motion") && styles.includes(".spin"));
check("styles support narrow browser layout", !styles.includes("min-width: 940px") && styles.includes("@media (max-width: 900px)"));
check("styles wrap dense panel actions", styles.includes("flex-wrap: wrap") && styles.includes(".panel-actions"));
check("styles include export path inspection states", styles.includes(".path-inspection.warn") && styles.includes(".path-inspection.error"));
check("styles include export path inspection facts", styles.includes(".path-inspection-facts"));
check("styles include startup readiness band", styles.includes(".readiness-band") && styles.includes(".readiness-grid"));
check("styles include first-run and diagnostic summary panels", styles.includes(".first-run-guide") && styles.includes(".first-run-grid") && styles.includes(".diagnostic-summary-panel") && styles.includes(".diagnostic-summary-grid"));
check("styles include compact topbar controls and OOBE dialog", styles.includes(".topbar-utilities") && styles.includes(".guide-chip") && styles.includes(".oobe-dialog") && styles.includes(".oobe-backdrop"));
check("styles include About dialog and updater progress", styles.includes(".about-dialog") && styles.includes(".about-grid") && styles.includes(".support-snapshot") && styles.includes(".update-progress"));
check("styles omit redundant export engine setup card", !styles.includes(".engine-setup-card") && !styles.includes(".engine-setup-steps") && styles.includes(".primary-button.compact"));
check("styles make language and theme controls discoverable", styles.includes("grid-template-columns: repeat(2, minmax(46px, auto))") && styles.includes("grid-template-columns: repeat(3, 38px)") && styles.includes("var(--accent-soft)"));
check("styles keep topbar controls legible in dark mode", styles.includes(':root[data-theme="dark"] .language-toggle') && styles.includes(':root[data-theme="dark"] .theme-toggle button.selected'));
check("styles keep preflight cards on theme variables", !styles.includes(".preflight-card.command-card") && styles.includes(".preflight-card.summary-card") && styles.includes(".empty-state") && styles.includes("var(--surface-strong)"));
check("styles use wide desktop workspace", styles.includes("width: min(100%, 1480px)") && styles.includes("margin: 0 auto 24px"));
check("styles include diagnostic detail text", styles.includes(".diagnostic-tile small"));
check("styles include password clear row", styles.includes(".password-row") && styles.includes("grid-template-columns: minmax(0, 1fr) auto"));
check("styles include source blockers", styles.includes(".source-blockers") && styles.includes("#fff8e7"));
check("styles include export review panel", styles.includes(".review-panel") && styles.includes(".risk-pill"));
check("styles include run preflight summary", styles.includes(".run-preflight-summary") && styles.includes(".preflight-facts") && styles.includes(".preflight-checklist"));
check("styles omit command preview chrome", !styles.includes(".command-box") && !workspaceSteps.includes("命令预览") && workspaceSteps.includes("导出设置、结果文件和输出位置"));
check("styles include conversation picker", styles.includes(".conversation-picker") && styles.includes(".conversation-picker-tools") && styles.includes(".conversation-picker-warning") && styles.includes(".manual-conversation-filter") && styles.includes(".text-button"));
check("styles use workspace navigation naming", styles.includes(".workspace-nav") && styles.includes(".workspace-nav-button") && !styles.includes(".step-list") && !styles.includes(".step-button"));
check("styles keep selected option cards symmetric", !styles.includes("inset 0 -3px 0") && styles.includes(".segment-grid button.selected:hover") && styles.includes(".preset-grid button.selected:hover"));
check("app keeps environment details in topbar", app.includes("showEnvironmentDetails") && shellPanels.includes("environmentDetailsButtonRef") && shellPanels.includes("onOpenEnvironmentDetails"));
check("styles keep environment panel compact without sidebar scrolling", styles.includes("body:has(.app-shell)") && styles.includes("height: 100vh") && styles.includes(".sidebar") && styles.includes("overflow: hidden") && styles.includes(".workspace") && styles.includes("overflow: auto") && !styles.includes("max-height: calc(100vh - 124px)") && !styles.includes(".sidebar::-webkit-scrollbar"));
check("styles include settings persistence status", styles.includes(".settings-save-line"));
check("styles include environment fix list", styles.includes(".env-fix-list") && styles.includes(".env-fix-item"));
check("styles include resource link pills", styles.includes(".resource-links") && styles.includes("border-radius: 999px"));
check("styles include cancelled job state", styles.includes(".result-strip.cancelled") && styles.includes(".job-outcome-notice"));
check("styles include export summary panel", styles.includes(".export-summary-panel") && styles.includes(".summary-grid"));
check("styles centralize status colors for light and dark modes", styles.includes("--warn-bg") && styles.includes("--error-bg") && styles.includes("--ok-bg") && styles.includes(".interrupted-export-actions"));
check("styles include generated archive, preset, report, and empty-state polish", styles.includes(".inline-actions") && styles.includes(".preset-grid") && styles.includes(".report-buffer") && styles.includes(".backup-empty-guidance") && !styles.includes(".log-tools"));

const commands = read("src-tauri/src/commands.rs");
const models = read("src-tauri/src/models.rs");
const engine = read("src-tauri/src/engine.rs");
const lib = read("src-tauri/src/lib.rs");
check("backend removed legacy CLI preview module", !existsSync(join(root, "src-tauri/src/cli.rs")) && !lib.includes("mod cli") && !models.includes("CommandPreview"));
check("backend starts jobs from engine options directly", commands.includes("engine::diagnostics_options(&source)") && commands.includes("engine::export_options(&config)") && !commands.includes("preview_export_command"));
check("backend stages exports before publishing final results", read("src-tauri/src/jobs.rs").includes("staging_export_path") && read("src-tauri/src/jobs.rs").includes(".partial") && commands.includes("spawn_export(app, options)") && commands.includes("未完成的临时导出目录"));
check("backend preflights staged publish conflicts before moving entries", read("src-tauri/src/jobs.rs").includes("collect::<Result<Vec<_>, String>>()") && read("src-tauri/src/jobs.rs").includes("for (_, destination) in &entries") && read("src-tauri/src/jobs.rs").includes("a-new-chat.html"));
check("backend maps export formats into engine options", engine.includes("fn export_type") && engine.includes("ExportType::Html") && engine.includes("ExportType::Txt") && engine.includes("ExportType::Jsonl"));
check("backend maps attachment copy methods into engine options", engine.includes("fn copy_method") && engine.includes("AttachmentManagerMode::Disabled") && engine.includes("AttachmentManagerMode::Clone") && engine.includes("AttachmentManagerMode::Basic") && engine.includes("AttachmentManagerMode::Full"));
check("backend disables attachment export for TXT and JSONL", engine.includes("!matches!(config.format, ExportFormat::Html)") && engine.includes("export_options_disables_attachment_export_for_txt_and_jsonl"));
check("backend keeps engine validation instead of command validation", engine.includes("validate_source") && engine.includes("validate_export_path") && engine.includes("End date cannot be earlier than start date"));
check("backend can open first exported result file", commands.includes("open_first_result") && commands.includes("find_first_result_file"));
check("backend inspects export path before running", commands.includes("inspect_export_path") && commands.includes("contains_attachments"));
check("backend can safely delete unfinished partial exports", commands.includes("delete_interrupted_export") && commands.includes("is_interrupted_export_path") && read("src-tauri/src/lib.rs").includes("delete_interrupted_export"));
check("backend export path inspection probes write access and disk space", models.includes("available_bytes") && models.includes("writable") && commands.includes("probe_directory_writable") && commands.includes("available_space_for_path"));
check("backend hides Windows console windows for converter probes", read("src-tauri/src/environment.rs").includes("CREATE_NO_WINDOW") && read("src-tauri/vendor/imessage-exporter/imessage-exporter/src/app/compatibility/converters/common.rs").includes("CREATE_NO_WINDOW"));
check("backend opens only known bundled resources", commands.includes("open_resource_file") && commands.includes("ResourceFile"));
check("backend has dev fallback for bundled resources", commands.includes("resolve_resource_file") && commands.includes('current_dir.join("..").join(file_name)'));
check("backend exposes app diagnostics", commands.includes("get_app_diagnostics") && models.includes("struct AppDiagnostics") && read("src-tauri/src/lib.rs").includes("get_app_diagnostics"));

const jobs = read("src-tauri/src/jobs.rs");
check("backend redacts job log secrets", jobs.includes("struct LogRedactor") && jobs.includes("redact(&self") && jobs.includes("redacts_cleartext_password_from_engine_events"));
check("backend passes cancellation into the built-in exporter", jobs.includes("Arc::clone(&cancel_flag)") && read("src-tauri/src/engine.rs").includes("run_with_logger_honors_pre_cancelled_flag") && read("src-tauri/vendor/imessage-exporter/imessage-exporter/src/lib.rs").includes("run_with_options_logger_and_cancel"));

const doctor = read("scripts/doctor.ps1");
check("doctor summarizes native packaging blockers", doctor.includes("Missing required item(s)") && doctor.includes(".\\scripts\\verify.ps1 -Native"));
const packageRelease = read("scripts/package-release.ps1");
check("release packaging script collects Windows and macOS artifacts only", packageRelease.includes("dist-release") && packageRelease.includes("SHA256SUMS") && packageRelease.includes("*.dmg") && packageRelease.includes("*.exe") && packageRelease.includes("*.msi") && !packageRelease.includes("*.deb") && !packageRelease.includes("*.AppImage"));
check("release packaging script collects updater artifacts", packageRelease.includes("latest.json") && packageRelease.includes("*.sig") && packageRelease.includes("*.zip") && packageRelease.includes("*.tar.gz"));
check("release packaging script writes platform checksums", packageRelease.includes("Get-ChecksumFileName") && packageRelease.includes("SHA256SUMS-") && packageRelease.includes('$_.Name -notlike "SHA256SUMS*.txt"'));
check("release packaging script normalizes public asset names", packageRelease.includes("Get-PublicArtifactName") && packageRelease.includes('Replace(" ", ".")') && packageRelease.includes("Copied {0} as {1}"));
check("release packaging script builds Tauri bundles without sidecar", !packageRelease.includes("build-sidecar") && packageRelease.includes("npm run tauri build -- --bundles"));
check("release packaging script runs installed artifact smoke on Windows", packageRelease.includes("smoke-installed-windows.ps1") && packageRelease.includes("Installed artifact smoke test"));
check("release packaging script rejects unsupported Linux bundles", packageRelease.includes("Release packaging is only supported on Windows and macOS") && packageRelease.includes("Unsupported bundle target"));
check("release packaging script respects Cargo target dir", packageRelease.includes("CARGO_TARGET_DIR") && packageRelease.includes("Get-BundleRoot"));
check("release packaging script filters current app artifacts", packageRelease.includes("Get-ArtifactPrefix") && packageRelease.includes(".StartsWith($Prefix"));
const packageWindows = read("scripts/package-windows.ps1");
const verifyScript = read("scripts/verify.ps1");
check("Windows packaging script collects installers", packageWindows.includes("dist-installers") && packageWindows.includes("SHA256SUMS.txt"));
check("Windows packaging script collects updater artifacts", packageWindows.includes("latest.json") && packageWindows.includes("*.zip") && packageWindows.includes("*.sig"));
check("Windows packaging script writes updater manifest", packageWindows.includes("create-updater-manifest.ps1") && packageWindows.includes("latest.json"));
check("Windows packaging script normalizes public asset names", packageWindows.includes("Get-PublicArtifactName") && packageWindows.includes('Replace(" ", ".")') && packageWindows.includes("Copied {0} as {1}"));
check("Windows packaging script runs native verification", packageWindows.includes("scripts\\verify.ps1") && packageWindows.includes("-Native"));
check("Windows packaging script runs installed artifact smoke", packageWindows.includes("smoke-installed-windows.ps1") && packageWindows.includes("Installed artifact smoke test"));
check("Windows packaging supports local unsigned installer smoke", verifyScript.includes("--no-sign") && packageWindows.includes("latest.json generation skipped"));
check("Windows packaging script respects Cargo target dir", packageWindows.includes("CARGO_TARGET_DIR") && packageWindows.includes("Get-CargoTargetDir"));
check("Windows packaging script filters current app installers", packageWindows.includes("Get-ArtifactPrefix") && packageWindows.includes(".StartsWith($Prefix"));
const installedSmoke = read("scripts/smoke-installed-windows.ps1");
check("installed smoke installs and launches NSIS artifact", installedSmoke.includes("/S") && installedSmoke.includes("/D=$InstallDir") && installedSmoke.includes("Start-Process") && installedSmoke.includes("Installed executable launched successfully"));
check(
  "Rust tests cover direct engine option mapping",
  engine.includes("export_options_maps_gui_formats_to_engine_export_types") &&
    engine.includes("export_options_maps_copy_methods_to_attachment_manager_modes") &&
    engine.includes("export_options_keeps_no_lazy_html_only") &&
    !verifyScript.includes("smoke-exporter-cli.ps1"),
);
const updaterManifestScript = read("scripts/create-updater-manifest.ps1");
check("updater manifest script writes Tauri latest.json", updaterManifestScript.includes("platforms") && updaterManifestScript.includes("windows-$Arch-nsis") && updaterManifestScript.includes("signature") && updaterManifestScript.includes("releases/download"));
check("native verification runs Rust tests", verifyScript.includes('Invoke-Step "Rust tests"') && verifyScript.includes("& $Cargo test"));

const tauriConfig = read("src-tauri/tauri.conf.json");
const tauriConfigJson = JSON.parse(tauriConfig);
check("Tauri uses vendored Rust exporter instead of external sidecar", !tauriConfig.includes('"externalBin"') && !tauriConfig.includes('"binaries/imessage-exporter"') && read("src-tauri/Cargo.toml").includes('imessage-exporter = { path = "vendor/imessage-exporter/imessage-exporter" }'));
check("Tauri keeps Windows local bundle defaults", tauriConfig.includes('"nsis"') && tauriConfig.includes('"msi"'));
check("Tauri uses A1mAssist package identity", tauriConfigJson.identifier === "com.a1massist.imessage-exporter-gui" && tauriConfigJson.bundle?.publisher === "A1mAssist" && !tauriConfig.includes("com.reagentx"));
check("Tauri has desktop platform icons", tauriConfig.includes('"icons/icon.ico"') && tauriConfig.includes('"icons/icon.icns"') && tauriConfig.includes('"icons/icon.png"'));
check("Tauri bundles license resources", tauriConfig.includes('"../LICENSE"') && tauriConfig.includes('"../THIRD_PARTY_NOTICES.md"') && !tauriConfig.includes('"../SIDE_CAR.md"'));
check("Tauri enables updater artifacts and endpoint", tauriConfigJson.bundle?.createUpdaterArtifacts === true && tauriConfigJson.plugins?.updater?.endpoints?.[0]?.includes("latest.json") && Boolean(tauriConfigJson.plugins?.updater?.pubkey));
check("Tauri grants updater and process permissions", read("src-tauri/capabilities/default.json").includes("updater:default") && read("src-tauri/capabilities/default.json").includes("process:default"));
check("Tauri registers updater and process plugins", read("src-tauri/src/lib.rs").includes("tauri_plugin_updater") && read("src-tauri/src/lib.rs").includes("tauri_plugin_process"));
check("Tauri scans iOS backup conversations", read("src-tauri/src/lib.rs").includes("scan_conversations") && read("src-tauri/src/conversations.rs").includes("Library/SMS/sms.db") && read("src-tauri/Cargo.toml").includes("rusqlite"));
check(
  "Tauri maps bundled resources to root names",
  tauriConfigJson.bundle?.resources?.["../LICENSE"] === "LICENSE" &&
    tauriConfigJson.bundle?.resources?.["../THIRD_PARTY_NOTICES.md"] === "THIRD_PARTY_NOTICES.md" &&
    !tauriConfigJson.bundle?.resources?.["../SIDE_CAR.md"],
);
check(
  "resource file names match bundled targets",
  ["LICENSE", "THIRD_PARTY_NOTICES.md"].every((name) => models.includes(`=> "${name}"`)) && !models.includes("SIDE_CAR.md"),
);

const cargoToml = read("src-tauri/Cargo.toml");
check("Cargo uses A1mAssist author metadata", cargoToml.includes('authors = ["A1mAssist"]'));
checkSameMajorMinor("@tauri-apps/api and tauri crate", pkg.dependencies?.["@tauri-apps/api"], cargoVersion(cargoToml, "tauri"));
checkSameMajorMinor("@tauri-apps/cli and tauri crate", pkg.devDependencies?.["@tauri-apps/cli"], cargoVersion(cargoToml, "tauri"));
checkSameMajorMinor(
  "dialog JS and Rust plugin",
  pkg.dependencies?.["@tauri-apps/plugin-dialog"],
  cargoVersion(cargoToml, "tauri-plugin-dialog"),
);
checkSameMajorMinor(
  "updater JS and Rust plugin",
  pkg.dependencies?.["@tauri-apps/plugin-updater"],
  cargoVersion(cargoToml, "tauri-plugin-updater"),
);
checkSameMajorMinor(
  "process JS and Rust plugin",
  pkg.dependencies?.["@tauri-apps/plugin-process"],
  cargoVersion(cargoToml, "tauri-plugin-process"),
);

const preview = read("preview/index.html");
check("static preview links app stylesheet", preview.includes("../src/styles.css"));
check("static preview uses workspace navigation naming", preview.includes("workspace-nav") && preview.includes("数据准备") && !preview.includes("step-list") && !preview.includes("Step 1"));
check("static preview reflects built-in exporter direction", preview.includes("内置引擎") && preview.includes("4.1.0 + JSONL") && preview.includes("导出前总览") && !preview.includes("sidecar") && !preview.includes("Sidecar") && !preview.includes("临时传给 CLI"));
check("Chrome screenshot was generated", existsSync(join(root, "preview/preview-desktop.png")));
check("static mock preview server serves dist", read("scripts/serve-dist.mjs").includes("Serving dist") && read("scripts/serve-dist.mjs").includes("no-store"));
check("smoke generates mock options screenshot", read("scripts/smoke-mock-ui.mjs").includes("react-mock-options.png"));
check("smoke generates compact mock options screenshot", read("scripts/smoke-mock-ui.mjs").includes("react-mock-options-compact.png"));
check("smoke generates cancelled export screenshot", read("scripts/smoke-mock-ui.mjs").includes("react-mock-cancelled.png"));
check("smoke verifies persisted settings redaction", read("scripts/smoke-mock-ui.mjs").includes("assertPersistedSettingsDoNotLeak"));
check("smoke verifies environment fix list", read("scripts/smoke-mock-ui.mjs").includes("assertEnvironmentFixList"));
check("smoke verifies resource links", read("scripts/smoke-mock-ui.mjs").includes("assertResourceLinks"));
check("smoke verifies incomplete backup blocking", read("scripts/smoke-mock-ui.mjs").includes("assertIncompleteBackupBlocksDiagnostics"));
check("smoke verifies saved manual backup validation", read("scripts/smoke-mock-ui.mjs").includes("assertSavedManualBackupIsValidated"));
check("smoke verifies password clearing controls", read("scripts/smoke-mock-ui.mjs").includes("assertPasswordClearControls") && read("scripts/smoke-mock-ui.mjs").includes("assertAutoClearPasswordAfterDiagnostics"));
check("smoke verifies diagnostic details", read("scripts/smoke-mock-ui.mjs").includes("assertDiagnosticDetails") && read("scripts/smoke-mock-ui.mjs").includes("128482 条消息"));
check("smoke verifies format-specific controls", read("scripts/smoke-mock-ui.mjs").includes("assertFormatSpecificControls"));
check("smoke verifies conversation picker", read("scripts/smoke-mock-ui.mjs").includes("assertConversationPicker"));
check("smoke verifies TXT result file action", read("scripts/smoke-mock-ui.mjs").includes("assertTxtResultsExposeTxtAction") && read("scripts/smoke-mock-ui.mjs").includes("打开首个 TXT"));
check("smoke verifies JSONL quick search", read("scripts/smoke-mock-ui.mjs").includes("assertJsonlQuickSearch") && read("scripts/smoke-mock-ui.mjs").includes(".jsonl-preview") && read("src/api/tauri.ts").includes("mockJsonlMatches"));
check("smoke verifies built-in exporter status", read("scripts/smoke-mock-ui.mjs").includes("assertBuiltInExporterStatus") && !read("scripts/smoke-mock-ui.mjs").includes("assertMissingExporterBlocksExport"));
check("smoke verifies theme switching", read("scripts/smoke-mock-ui.mjs").includes("assertThemeToggle"));
check("smoke verifies engine logs stay hidden", read("scripts/smoke-mock-ui.mjs").includes("assertNoVisibleEngineLogs") && read("scripts/smoke-mock-ui.mjs").includes("Engine logs should not be visible"));
check("smoke verifies export cancellation", read("scripts/smoke-mock-ui.mjs").includes("assertCancelledOutcome") && read("scripts/smoke-mock-ui.mjs").includes(".result-strip.cancelled"));
check("smoke verifies export summary panel", read("scripts/smoke-mock-ui.mjs").includes("assertExportSummary") && read("scripts/smoke-mock-ui.mjs").includes("导出摘要"));
check("smoke verifies run preflight start guards", read("scripts/smoke-mock-ui.mjs").includes("assertRunStartBlockedWithoutExportPath") && read("scripts/smoke-mock-ui.mjs").includes("assertRunPageDoesNotTreatDiagnosticsAsExport"));
check("smoke verifies OOBE, language round-trip, and diagnostic summary panels", read("scripts/smoke-mock-ui.mjs").includes("assertOnboardingDialog") && read("scripts/smoke-mock-ui.mjs").includes("assertLanguageRoundTrip") && read("scripts/smoke-mock-ui.mjs").includes("assertDiagnosticSummaryPanel"));
check("smoke verifies About dialog and updater UI", read("scripts/smoke-mock-ui.mjs").includes("assertAboutAndUpdaterPanel") && read("scripts/smoke-mock-ui.mjs").includes("react-mock-about.png") && read("scripts/smoke-mock-ui.mjs").includes("updateAvailable=1"));
check("smoke verifies English localization coverage", read("scripts/smoke-mock-ui.mjs").includes("assertEnglishLocalizationCoverage") && read("src/i18n.ts").includes("快速归档") && read("src/i18n.ts").includes("iMessage Exporter GUI 诊断报告"));
check(
  "smoke verifies goal polish features",
  [
    "assertGeneratedArchiveDirectory",
    "assertExportPresets",
    "assertFailureRecoveryHint",
    "assertNoVisibleEngineLogs",
    "assertDiagnosticReportDoesNotLeak",
    "assertPathCopyActions",
    "assertFirstUseEmptyState",
    "assertFirstRunGuide",
    "assertOnboardingDialog",
    "assertLanguageRoundTrip",
  ].every((name) => read("scripts/smoke-mock-ui.mjs").includes(name)),
);

const ci = read(".github/workflows/ci.yml");
check("CI uses Node 24-capable official actions", ci.includes("actions/checkout@v6") && ci.includes("actions/setup-node@v6") && ci.includes("node-version: 24"));
check("CI runs npm audit", ci.includes("npm audit"));
check("CI runs mock UI smoke", ci.includes("npm run smoke:mock-ui"));
check(
  "CI relies on built-in exporter Rust tests",
  ci.includes("cargo test") &&
    ci.includes("cargo check") &&
    !ci.includes("smoke-exporter-cli.ps1") &&
    !ci.includes("IMESSAGE_EXPORTER_CI_PATH"),
);
check("CI runs frontend production build", ci.includes("npm run build"));
check("CI runs Rust format", ci.includes("cargo fmt --check"));
check("CI activates MSVC shell for native Windows builds", ci.includes("ilammy/msvc-dev-cmd@v1") && ci.includes("arch: x64"));
check("CI leaves signed Tauri packaging to release workflow", !ci.includes("npm run tauri build"));
const release = read(".github/workflows/release.yml");
check("release workflow uses Node 24-capable official actions", release.includes("actions/checkout@v6") && release.includes("actions/setup-node@v6") && release.includes("actions/upload-artifact@v6") && release.includes("actions/download-artifact@v7") && release.includes("node-version: 24"));
check("release workflow packages Windows and macOS installers", release.includes("Release Installers") && release.includes("windows-latest") && release.includes("macos-latest") && !release.includes("ubuntu-22.04") && release.includes("scripts/package-release.ps1"));
check("release workflow requests supported bundle targets only", release.includes("bundles: nsis,msi") && release.includes("bundles: dmg") && !release.includes("bundles: deb,appimage"));
check("release workflow uploads supported platform artifacts only", release.includes("imessage-exporter-gui-windows") && release.includes("imessage-exporter-gui-macos") && !release.includes("imessage-exporter-gui-linux"));
check("release workflow publishes tagged releases", release.includes("softprops/action-gh-release") && release.includes("refs/tags/"));
check("release workflow passes updater signing secrets", release.includes("TAURI_SIGNING_PRIVATE_KEY") && release.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD"));
check("release workflow creates updater manifest", release.includes("create-updater-manifest.ps1") && release.includes("dist-release/latest.json"));
check("release workflow marks beta tags as prereleases", release.includes("prerelease: ${{ contains(github.ref_name, '-') }}"));
check("release workflow can publish with GitHub token", release.includes("permissions:") && release.includes("contents: write"));
check("release workflow activates MSVC shell", release.includes("ilammy/msvc-dev-cmd@v1") && release.includes("arch: x64"));
check("release workflow does not install Linux Tauri dependencies", !release.includes("libwebkit2gtk") && !release.includes("libayatana-appindicator") && !release.includes("patchelf"));

const readmeEn = read("README.md");
const readmeZh = read("README.zh-CN.md");
check("README explains installer choices and updater", readmeEn.includes("recommended normal install") && readmeEn.includes("managed deployment") && readmeEn.includes("Check for updates") && readmeEn.includes("About dialog"));
check("README explains built-in export engine", readmeEn.includes("bundles the imessage-exporter Rust engine") && readmeEn.includes("JSONL"));
check("Chinese README explains installer choices and updater", readmeZh.includes("普通个人安装推荐") && readmeZh.includes("自动检查更新") && readmeZh.includes("关于与诊断"));
check("README labels preview screenshot assets", readmeEn.includes("react-mock-*") && readmeZh.includes("react-mock-*"));

if (failures.length) {
  console.error("\nSanity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nSanity check passed.");

function isExactVersion(version) {
  return typeof version === "string" && /^\d+\.\d+\.\d+/.test(version);
}

function cargoVersion(toml, crateName) {
  const escaped = crateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inline = toml.match(new RegExp(`${escaped}\\s*=\\s*\\{[^\\n]*version\\s*=\\s*"([^"]+)"`));
  if (inline) return inline[1];
  const bare = toml.match(new RegExp(`${escaped}\\s*=\\s*"([^"]+)"`));
  return bare?.[1];
}

function majorMinor(version) {
  return version?.replace(/^[^\d]*/, "").match(/^(\d+\.\d+)\./)?.[1];
}

function checkSameMajorMinor(name, left, right) {
  check(name, Boolean(majorMinor(left)) && majorMinor(left) === majorMinor(right), `${left ?? "missing"} vs ${right ?? "missing"}`);
}
