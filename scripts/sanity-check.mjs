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
  "src-tauri/src/cli.rs",
  "src-tauri/src/jobs.rs",
  "src-tauri/src/commands.rs",
  "src-tauri/src/models.rs",
  "scripts/doctor.ps1",
  "scripts/setup-windows.ps1",
  "scripts/package-release.ps1",
  "scripts/package-windows.ps1",
  "scripts/generate-icons.mjs",
  "scripts/render-preview.mjs",
  "scripts/render-preview.ps1",
  "scripts/serve-dist.mjs",
  "scripts/smoke-mock-ui.mjs",
  "scripts/verify.ps1",
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
check("app has Chinese UX copy", ["选择 iOS 备份", "运行诊断", "开始导出", "打开输出目录"].every((text) => app.includes(text)));
check("app has no Unicode replacement chars", !app.includes("\uFFFD"));
check("app uses topbar status overview", app.includes("function TopBar") && app.includes("quick-stats"));
check("app exposes first result action", app.includes("打开首个 HTML") && app.includes("打开首个 TXT") && app.includes("openFirstResult"));
check("app gates first result action on successful export", app.includes('format === "html"') && app.includes('outcome.kind !== "succeeded"'));
check("app exposes copy actions", app.includes("复制命令") && app.includes("复制日志") && app.includes("function CopyButton"));
check("app supports log tail follow control", app.includes("ArrowDownToLine") && app.includes("followTail") && app.includes("滚动到最新日志"));
check("app reports clipboard copy failure", app.includes("复制失败") && app.includes("Clipboard API unavailable"));
check("app warns before exporting into non-empty output folders", app.includes("ExportPathNotice") && app.includes("输出目录已有内容") && app.includes("needsExportPathConfirmation"));
check("app shows explicit cancelled and failed job outcomes", app.includes("type JobOutcome") && app.includes("JobOutcomeNotice") && app.includes("resultStripClass"));
check("app renders export summary panel", app.includes("ExportSummaryPanel") && app.includes("导出摘要") && app.includes("summarizeExportResult"));
check("app renders first-run checklist", app.includes("function FirstRunGuide") && app.includes("首次导出清单") && app.includes("准备导出引擎"));
check("app renders first-run OOBE dialog", app.includes("function OnboardingDialog") && app.includes("首次设置指引") && app.includes("onboardingStorageKey"));
check("app keeps preferences compact in topbar", app.includes("topbar-utilities") && app.includes("设置向导") && !app.includes("preference-controls"));
check("app remounts shell on language changes", app.includes('key={language}'));
check("app hides exporter version in environment status line", app.includes('label="导出引擎" value={environment?.exporterAvailable ? "可用" : "未找到"}'));
check("app renders diagnostic summary panel", app.includes("function DiagnosticSummaryPanel") && app.includes("诊断摘要") && app.includes("附件转换"));
check("app renders recovery action buttons", app.includes("function RecoveryActionRow") && app.includes("下载导出引擎") && app.includes("回到数据源") && app.includes("回到选项"));
check("app exposes generated archive directory action", app.includes("新建归档目录") && app.includes("timestampedArchiveSequence") && app.includes("生成带时间戳的新文件夹"));
check("app increments generated archive directory collisions", app.includes("nextAvailableArchivePath") && app.includes("无法生成未占用的归档目录"));
check("app wires export presets", app.includes("exportPresets.map") && app.includes("onApplyPreset") && app.includes("applyExportPreset"));
check("app shows recovery hints for failed jobs", app.includes("recoveryHintForFailure") && app.includes("hint?.action") && app.includes("job-outcome-notice"));
check("app supports log search and kind filters", app.includes("搜索日志") && app.includes("enabledKinds") && app.includes("log-filters"));
check("app exports diagnostic reports", app.includes("DiagnosticReportActions") && app.includes("复制诊断报告") && app.includes("下载诊断报告 .txt") && app.includes("buildDiagnosticReport"));
check("app exposes path copy actions and tooltips", app.includes("复制路径") && app.includes("复制完整") && app.includes("title={value}"));
check("app shows first-use backup empty guidance", app.includes("没有自动发现本机 iOS 备份") && app.includes("Apple Devices") && app.includes("%USERPROFILE%\\Apple\\MobileSync\\Backup"));
check("app shows startup readiness checks", app.includes("function ReadinessBand") && app.includes("就绪检查") && app.includes("导出引擎"));
check("app blocks diagnostics for incomplete backups", app.includes("sourceDiagnosticsBlockers") && app.includes("备份目录需要同时包含 Manifest.db 和 Info.plist") && app.includes("source-blockers"));
check("app renders diagnostic detail text", app.includes("DiagnosticFinding") && app.includes("status.detail"));
check("app summarizes export before running", app.includes("function ExportReview") && app.includes("导出前复核") && app.includes("exportReviewNotes"));
check("app persists only non-sensitive settings", app.includes("loadPersistedExportConfig(defaultExportConfig)") && app.includes("persistExportConfig(config)") && app.includes("不保存备份密码"));
check("app exposes password clearing controls", app.includes("清除密码") && app.includes("任务结束后自动清除密码") && app.includes("autoClearPasswordRef"));
check("app validates saved manual backup path on startup", app.includes("validateBackupPath(config.backupPath)") && app.includes("candidate.encrypted ?? current.encrypted"));
check("app disables HTML-only print mode for TXT", app.includes('format === "txt" ? { format, noLazy: false }') && app.includes('disabled={config.format !== "html"}'));
check("app blocks export when exporter is missing", app.includes("environmentExportBlockers") && app.includes("缺少 imessage-exporter 导出引擎"));
check("app reports open result failures", app.includes("function openOutputPath") && app.includes("function openFirstResultFile") && app.includes("setError(String(err))"));
check("app shows environment fix commands", app.includes("function EnvironmentFixList") && app.includes("setup-windows.ps1 -Install -InstallOptionalTools"));
check("app links bundled license resources", app.includes("function ResourceLinks") && app.includes("GPL 许可证") && app.includes("openResourceFile"));

const api = read("src/api/tauri.ts");
check("API has browser mock runtime", api.includes("usingMockApi") && api.includes("startMockExport") && api.includes("startMockDiagnostics"));
check("mock API can simulate missing exporter", api.includes("missingExporter") && api.includes("模拟导出引擎缺失"));
check("mock export directory is outside backup", api.includes("Messages Export") && api.includes('purpose === "export"'));
check("API exposes export path inspection", api.includes("inspectExportPath") && api.includes("mockExportPathStatus"));
check("API opens bundled resource files", api.includes("openResourceFile") && api.includes("thirdPartyNotices"));
check("API opens first result file by format", api.includes("openFirstResult") && api.includes('"open_first_result"'));
check("mock API only maps no-lazy for HTML", api.includes('config.format === "html" && config.noLazy'));
check("mock API supports generated archive paths", api.includes("looksLikeGeneratedArchive") && api.includes("archiveCollision") && api.includes("messages export \\d{4}-\\d{2}-\\d{2} \\d{4}"));
check("mock API supports failure and empty-backup scenarios", api.includes('params.get("fail")') && api.includes('fail === "password"') && api.includes("emptyBackups"));

const persistence = read("src/lib/persistence.ts");
const persistedKeyEntries = persistence.match(/const persistedKeys[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
check("persistence storage key is versioned", persistence.includes("imessage-exporter-gui.exportSettings.v1"));
check("persistence clears password on load", persistence.includes('cleartextPassword: ""'));
check("persistence can save auto-clear password preference", persistence.includes('"autoClearPassword"') && read("src/lib/persistence.test.ts").includes("autoClearPassword"));
check("persistence can save exporter path", persistence.includes('"exporterPath"'));
check("persistence clears no-lazy for TXT", persistence.includes('noLazy: config.format === "html" ? config.noLazy : false'));
check("persistence omits password from saved key list", !persistedKeyEntries.includes('"cleartextPassword"'));
const persistenceTests = read("src/lib/persistence.test.ts");
check("persistence tests cover password exclusion", persistenceTests.includes("never writes the cleartext backup password") && persistenceTests.includes("legacy-secret"));
const exportConfig = read("src/lib/exportConfig.ts");
check("frontend rejects reversed date ranges", exportConfig.includes("reversedDateRange") && exportConfig.includes("结束日期不能早于开始日期"));
check("frontend rejects impossible dates", exportConfig.includes("Date.UTC") && read("src/lib/exportConfig.test.ts").includes("rejects impossible calendar dates"));
check("frontend normalizes no-lazy for TXT", exportConfig.includes('noLazy: config.format === "html" ? config.noLazy : false') && read("src/lib/exportConfig.test.ts").includes("drops HTML-only no-lazy mode for TXT exports"));
const diagnosticParser = read("src/lib/diagnostics.ts");
check("diagnostics parser scopes warnings to relevant lines", diagnosticParser.includes("relevant") && diagnosticParser.includes("hasWarning(line.lower)") && read("src/lib/diagnostics.test.ts").includes("keeps converter warnings from contaminating other sections"));
const exportSummary = read("src/lib/exportSummary.ts");
check("export summary parses result status, counts, duration, and output path", exportSummary.includes("Export complete") && exportSummary.includes("itemCountLabel") && exportSummary.includes("durationLabel") && read("src/lib/exportSummary.test.ts").includes("summarizes successful HTML exports"));
check("archive path helper creates timestamped output folders", read("src/lib/archivePath.ts").includes("Messages Export") && read("src/lib/archivePath.ts").includes("timestampedArchiveSequence") && read("src/lib/archivePath.test.ts").includes("startSuffix"));
check("export presets preserve source secrets", read("src/lib/exportPresets.ts").includes("quickArchive") && read("src/lib/exportPresets.test.ts").includes("does not overwrite source path"));
check("recovery hints classify known failure modes", read("src/lib/recoveryHints.ts").includes("备份密码可能不正确") && read("src/lib/recoveryHints.test.ts").includes("classifies known failure modes"));
check("diagnostic report builder redacts secrets", read("src/lib/diagnosticReport.ts").includes("redactSensitiveText") && read("src/lib/diagnosticReport.test.ts").includes("not.toContain"));

const pkg = JSON.parse(read("package.json"));
check("package exposes mock dev script", Boolean(pkg.scripts?.["dev:mock"]));
check("package exposes mock UI smoke script", Boolean(pkg.scripts?.["smoke:mock-ui"]));
check("package exposes preview screenshot script", Boolean(pkg.scripts?.["preview:screenshots"]));
check("package exposes static mock preview server", Boolean(pkg.scripts?.["serve:mock"]));
check("package exposes cross-platform release packaging script", Boolean(pkg.scripts?.["package:release"]));
check("package exposes Windows packaging script", Boolean(pkg.scripts?.["package:windows"]));
check("package exposes one-command verify script", Boolean(pkg.scripts?.verify));
check("package exposes offline verify script", Boolean(pkg.scripts?.["verify:offline"]));
check("package uses Vite runner config loader", ["dev", "dev:mock", "build", "preview", "test"].every((name) => pkg.scripts?.[name]?.includes("--configLoader runner")));
check("package pins @tauri-apps/api", isExactVersion(pkg.dependencies?.["@tauri-apps/api"]));
check("package pins @tauri-apps/plugin-dialog", isExactVersion(pkg.dependencies?.["@tauri-apps/plugin-dialog"]));
check("package pins @tauri-apps/cli", isExactVersion(pkg.devDependencies?.["@tauri-apps/cli"]));

const styles = read("src/styles.css");
check("styles define design tokens", styles.includes("--accent") && styles.includes("--shadow"));
check("app supports theme switching", app.includes("function ThemeToggle") && read("src/theme.ts").includes("prefers-color-scheme") && styles.includes('[data-theme="dark"]'));
check("styles avoid nested cards pattern", !styles.includes(".content-band .content-band"));
check("styles include keyboard focus states", styles.includes(":focus-visible") && styles.includes("outline-offset"));
check("styles respect reduced motion", styles.includes("prefers-reduced-motion") && styles.includes(".spin"));
check("styles support narrow browser layout", !styles.includes("min-width: 940px") && styles.includes("@media (max-width: 900px)"));
check("styles wrap dense panel actions", styles.includes("flex-wrap: wrap") && styles.includes(".panel-actions"));
check("styles include export path inspection states", styles.includes(".path-inspection.warn") && styles.includes(".path-inspection.error"));
check("styles include startup readiness band", styles.includes(".readiness-band") && styles.includes(".readiness-grid"));
check("styles include first-run and diagnostic summary panels", styles.includes(".first-run-guide") && styles.includes(".first-run-grid") && styles.includes(".diagnostic-summary-panel") && styles.includes(".diagnostic-summary-grid"));
check("styles include compact topbar controls and OOBE dialog", styles.includes(".topbar-utilities") && styles.includes(".guide-chip") && styles.includes(".oobe-dialog") && styles.includes(".oobe-backdrop"));
check("styles make language and theme controls discoverable", styles.includes("grid-template-columns: repeat(2, minmax(46px, auto))") && styles.includes("grid-template-columns: repeat(3, 38px)") && styles.includes("var(--accent-soft)"));
check("styles include diagnostic detail text", styles.includes(".diagnostic-tile small"));
check("styles include password clear row", styles.includes(".password-row") && styles.includes("grid-template-columns: minmax(0, 1fr) auto"));
check("styles include source blockers", styles.includes(".source-blockers") && styles.includes("#fff8e7"));
check("styles include export review panel", styles.includes(".review-panel") && styles.includes(".risk-pill"));
check("styles include settings persistence status", styles.includes(".settings-save-line"));
check("styles include environment fix list", styles.includes(".env-fix-list") && styles.includes(".env-fix-item"));
check("styles include resource link pills", styles.includes(".resource-links") && styles.includes("border-radius: 999px"));
check("styles include cancelled job state", styles.includes(".result-strip.cancelled") && styles.includes(".job-outcome-notice"));
check("styles include export summary panel", styles.includes(".export-summary-panel") && styles.includes(".summary-grid"));
check("styles include generated archive, preset, log, report, and empty-state polish", styles.includes(".inline-actions") && styles.includes(".preset-grid") && styles.includes(".log-tools") && styles.includes(".report-buffer") && styles.includes(".backup-empty-guidance"));

const cli = read("src-tauri/src/cli.rs");
check("CLI maps no-lazy to -l", cli.includes('args.push("-l".to_string())'));
check("CLI only maps no-lazy for HTML", cli.includes("ExportFormat::Html") && cli.includes("ignores_print_friendly_mode_for_txt_exports"));
check("CLI maps encrypted backup password", cli.includes('"--cleartext-password".to_string()'));
check("CLI redacts password preview", cli.includes('"[redacted]".to_string()'));
check("CLI never exposes attachment root for iOS v1", !cli.includes("attachment-root") && !cli.includes('"-r"'));
check("CLI rejects export inside backup", cli.includes("Export path cannot be inside the iOS backup directory"));
check("CLI rejects reversed date ranges", cli.includes("validate_date_range") && cli.includes("End date cannot be earlier than start date"));
check("CLI rejects impossible dates", cli.includes("valid_calendar_date") && cli.includes("Start date must use a real YYYY-MM-DD date"));
check("CLI resolves configured or PATH exporter", cli.includes("resolve_exporter_path") && cli.includes("find_on_path") && cli.includes("EXPORTER_BASENAME"));
check("CLI checks Windows executable candidates", cli.includes('format!("{name}.exe")') && cli.includes("executable_candidates"));
check("CLI no longer resolves bundled sidecar paths", !cli.includes("sidecar_path") && !cli.includes("sidecar_target_triple"));

const commands = read("src-tauri/src/commands.rs");
const models = read("src-tauri/src/models.rs");
check("backend can open first exported result file", commands.includes("open_first_result") && commands.includes("find_first_result_file"));
check("backend inspects export path before running", commands.includes("inspect_export_path") && commands.includes("contains_attachments"));
check("backend opens only known bundled resources", commands.includes("open_resource_file") && commands.includes("ResourceFile"));
check("backend has dev fallback for bundled resources", commands.includes("resolve_resource_file") && commands.includes('current_dir.join("..").join(file_name)'));

const jobs = read("src-tauri/src/jobs.rs");
check("backend redacts job log secrets", jobs.includes("struct LogRedactor") && jobs.includes("redact(&self") && jobs.includes("redacts_cleartext_password_from_output_events"));

const doctor = read("scripts/doctor.ps1");
check("doctor summarizes native packaging blockers", doctor.includes("Missing required item(s)") && doctor.includes(".\\scripts\\verify.ps1 -Native"));
const packageRelease = read("scripts/package-release.ps1");
check("release packaging script collects Windows and macOS artifacts only", packageRelease.includes("dist-release") && packageRelease.includes("SHA256SUMS") && packageRelease.includes("*.dmg") && packageRelease.includes("*.exe") && packageRelease.includes("*.msi") && !packageRelease.includes("*.deb") && !packageRelease.includes("*.AppImage"));
check("release packaging script writes platform checksums", packageRelease.includes("Get-ChecksumFileName") && packageRelease.includes("SHA256SUMS-") && packageRelease.includes('$_.Name -notlike "SHA256SUMS*.txt"'));
check("release packaging script builds Tauri bundles without sidecar", !packageRelease.includes("build-sidecar") && packageRelease.includes("npm run tauri build -- --bundles"));
check("release packaging script rejects unsupported Linux bundles", packageRelease.includes("Release packaging is only supported on Windows and macOS") && packageRelease.includes("Unsupported bundle target"));
const packageWindows = read("scripts/package-windows.ps1");
check("Windows packaging script collects installers", packageWindows.includes("dist-installers") && packageWindows.includes("SHA256SUMS.txt"));
check("Windows packaging script runs native verification", packageWindows.includes("scripts\\verify.ps1") && packageWindows.includes("-Native"));
const verifyScript = read("scripts/verify.ps1");
check("native verification runs Rust tests", verifyScript.includes('Invoke-Step "Rust tests"') && verifyScript.includes("& $Cargo test"));

const tauriConfig = read("src-tauri/tauri.conf.json");
const tauriConfigJson = JSON.parse(tauriConfig);
check("Tauri does not bundle imessage-exporter", !tauriConfig.includes('"externalBin"') && !tauriConfig.includes('"binaries/imessage-exporter"'));
check("Tauri keeps Windows local bundle defaults", tauriConfig.includes('"nsis"') && tauriConfig.includes('"msi"'));
check("Tauri has desktop platform icons", tauriConfig.includes('"icons/icon.ico"') && tauriConfig.includes('"icons/icon.icns"') && tauriConfig.includes('"icons/icon.png"'));
check("Tauri bundles license resources", tauriConfig.includes('"../LICENSE"') && tauriConfig.includes('"../THIRD_PARTY_NOTICES.md"') && !tauriConfig.includes('"../SIDE_CAR.md"'));
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
checkSameMajorMinor("@tauri-apps/api and tauri crate", pkg.dependencies?.["@tauri-apps/api"], cargoVersion(cargoToml, "tauri"));
checkSameMajorMinor("@tauri-apps/cli and tauri crate", pkg.devDependencies?.["@tauri-apps/cli"], cargoVersion(cargoToml, "tauri"));
checkSameMajorMinor(
  "dialog JS and Rust plugin",
  pkg.dependencies?.["@tauri-apps/plugin-dialog"],
  cargoVersion(cargoToml, "tauri-plugin-dialog"),
);

const preview = read("preview/index.html");
check("static preview links app stylesheet", preview.includes("../src/styles.css"));
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
check("smoke verifies TXT result file action", read("scripts/smoke-mock-ui.mjs").includes("assertTxtResultsExposeTxtAction") && read("scripts/smoke-mock-ui.mjs").includes("打开首个 TXT"));
check("smoke verifies missing exporter export blocking", read("scripts/smoke-mock-ui.mjs").includes("assertMissingExporterBlocksExport"));
check("smoke verifies theme switching", read("scripts/smoke-mock-ui.mjs").includes("assertThemeToggle"));
check("smoke verifies export cancellation", read("scripts/smoke-mock-ui.mjs").includes("assertCancelledOutcome") && read("scripts/smoke-mock-ui.mjs").includes(".result-strip.cancelled"));
check("smoke verifies export summary panel", read("scripts/smoke-mock-ui.mjs").includes("assertExportSummary") && read("scripts/smoke-mock-ui.mjs").includes("导出摘要"));
check("smoke verifies OOBE, language round-trip, and diagnostic summary panels", read("scripts/smoke-mock-ui.mjs").includes("assertOnboardingDialog") && read("scripts/smoke-mock-ui.mjs").includes("assertLanguageRoundTrip") && read("scripts/smoke-mock-ui.mjs").includes("assertDiagnosticSummaryPanel"));
check("smoke verifies English localization coverage", read("scripts/smoke-mock-ui.mjs").includes("assertEnglishLocalizationCoverage") && read("src/i18n.ts").includes("快速归档") && read("src/i18n.ts").includes("iMessage Exporter GUI 诊断报告"));
check(
  "smoke verifies goal polish features",
  [
    "assertGeneratedArchiveDirectory",
    "assertExportPresets",
    "assertFailureRecoveryHint",
    "assertLogSearchAndFilter",
    "assertDiagnosticReportDoesNotLeak",
    "assertPathCopyActions",
    "assertFirstUseEmptyState",
    "assertFirstRunGuide",
    "assertOnboardingDialog",
    "assertLanguageRoundTrip",
  ].every((name) => read("scripts/smoke-mock-ui.mjs").includes(name)),
);

const ci = read(".github/workflows/ci.yml");
check("CI runs npm audit", ci.includes("npm audit"));
check("CI runs mock UI smoke", ci.includes("npm run smoke:mock-ui"));
check("CI runs frontend production build", ci.includes("npm run build"));
check("CI runs Rust format", ci.includes("cargo fmt --check"));
check("CI activates MSVC shell for native Windows builds", ci.includes("ilammy/msvc-dev-cmd@v1") && ci.includes("arch: x64"));
const release = read(".github/workflows/release.yml");
check("release workflow packages Windows and macOS installers", release.includes("Release Installers") && release.includes("windows-latest") && release.includes("macos-latest") && !release.includes("ubuntu-22.04") && release.includes("scripts/package-release.ps1"));
check("release workflow requests supported bundle targets only", release.includes("bundles: nsis,msi") && release.includes("bundles: dmg") && !release.includes("bundles: deb,appimage"));
check("release workflow uploads supported platform artifacts only", release.includes("imessage-exporter-gui-windows") && release.includes("imessage-exporter-gui-macos") && !release.includes("imessage-exporter-gui-linux"));
check("release workflow publishes tagged releases", release.includes("softprops/action-gh-release") && release.includes("refs/tags/"));
check("release workflow marks beta tags as prereleases", release.includes("prerelease: ${{ contains(github.ref_name, '-') }}"));
check("release workflow can publish with GitHub token", release.includes("permissions:") && release.includes("contents: write"));
check("release workflow activates MSVC shell", release.includes("ilammy/msvc-dev-cmd@v1") && release.includes("arch: x64"));
check("release workflow does not install Linux Tauri dependencies", !release.includes("libwebkit2gtk") && !release.includes("libayatana-appindicator") && !release.includes("patchelf"));

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
