import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const previewDir = join(root, "preview");
const port = Number(process.env.MOCK_UI_PORT || 1421);
const baseUrl = `http://127.0.0.1:${port}/?mock=1&lang=zh-CN`;

mkdirSync(previewDir, { recursive: true });

const build = spawnSync(process.execPath, [viteScript(), "build", "--configLoader", "runner"], {
  cwd: root,
  env: { ...process.env, BROWSER: "none" },
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const vite = spawn(process.execPath, [viteScript(), "preview", "--configLoader", "runner", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: { ...process.env, BROWSER: "none" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
vite.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({
    headless: true,
    executablePath: findBrowser(),
  });
  console.log("smoke: browser started");
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  let sawOutputConfirm = false;
  page.on("dialog", async (dialog) => {
    if (!dialog.message().includes("输出目录已有内容")) {
      throw new Error(`Unexpected dialog: ${dialog.message()}`);
    }
    sawOutputConfirm = true;
    await dialog.accept();
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertHealthyApp(page, "source desktop");
  await assertReadinessBand(page);
  await assertFirstRunGuide(page);
  await assertThemeToggle(page);
  await assertEnvironmentFixList(page);
  await assertResourceLinks(page);
  await assertSettingsPersistenceStatus(page);
  await assertInitialStepNavigation(page);
  await assertIncompleteBackupBlocksDiagnostics(page);
  await assertPasswordClearControls(page);
  await page.screenshot({ path: join(previewDir, "react-mock-source.png"), fullPage: true });
  console.log("smoke: source desktop passed");

  await page.setViewportSize({ width: 720, height: 1000 });
  await assertHealthyApp(page, "source compact");
  await page.screenshot({ path: join(previewDir, "react-mock-source-compact.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("smoke: source compact passed");

  await page.getByLabel("备份密码").fill("mock-password");
  await assertReadyStepNavigation(page);
  await assertPersistedSettingsDoNotLeak(page, "mock-password");
  await sourceDiagnosticsButton(page).click();
  await waitForExitZero(page);
  await assertHealthyApp(page, "diagnostics");
  await assertNoVisibleTextLeak(page, "mock-password");
  await assertCommandIsRedacted(page);
  await assertDiagnosticSummaryPanel(page);
  await assertDiagnosticDetails(page);
  await assertCopyActions(page);
  await page.screenshot({ path: join(previewDir, "react-mock-diagnostics.png"), fullPage: true });
  console.log("smoke: diagnostics passed");

  await page.getByRole("button", { name: /继续设置/ }).click();
  await page.getByRole("button", { name: /选择输出目录/ }).click();
  await assertHealthyApp(page, "options");
  await assertCommandIsRedacted(page);
  await assertPersistedSettingsDoNotLeak(page, "mock-password");
  await assertOutputDirectoryIsSafe(page);
  await assertOutputDirectoryWarning(page);
  await assertExportReview(page);
  await assertFormatSpecificControls(page);
  await page.screenshot({ path: join(previewDir, "react-mock-options.png"), fullPage: true });
  await page.setViewportSize({ width: 720, height: 1000 });
  await assertHealthyApp(page, "options compact");
  await assertExportReview(page);
  await page.screenshot({ path: join(previewDir, "react-mock-options-compact.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("smoke: options passed");

  await page.getByRole("button", { name: /^开始导出$/ }).click();
  await page.locator(".result-strip.running").waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /取消导出/ }).click();
  await page.locator(".result-strip.cancelled").waitFor({ timeout: 5000 });
  await assertHealthyApp(page, "cancelled export");
  await assertCancelledOutcome(page);
  await assertExportSummary(page, ["导出已取消", "HTML", "clone"]);
  await assertNoVisibleTextLeak(page, "mock-password");
  await page.screenshot({ path: join(previewDir, "react-mock-cancelled.png"), fullPage: true });
  console.log("smoke: cancellation passed");

  await page.getByRole("button", { name: /重新导出/ }).click();
  await page.locator(".result-strip.success").waitFor({ timeout: 10000 });
  if (!sawOutputConfirm) throw new Error("Output directory confirmation was not shown");
  await assertHealthyApp(page, "results");
  await assertNoVisibleTextLeak(page, "mock-password");
  await assertPersistedSettingsDoNotLeak(page, "mock-password");
  await assertCommandIsRedacted(page);
  await assertExportSummary(page, ["导出完成", "HTML", "clone", "Messages Export"]);
  await assertCopyActions(page);
  await page.screenshot({ path: join(previewDir, "react-mock-results.png"), fullPage: true });
  console.log("smoke: successful export passed");

  await assertSavedManualBackupIsValidated(browser);
  console.log("smoke: saved manual backup passed");
  await assertMissingExporterBlocksExport(browser);
  console.log("smoke: missing exporter passed");
  await assertTxtResultsExposeTxtAction(browser);
  console.log("smoke: txt result passed");
  await assertGeneratedArchiveDirectory(browser);
  console.log("smoke: archive directory passed");
  await assertExportPresets(browser);
  console.log("smoke: presets passed");
  await assertFailureRecoveryHint(browser);
  console.log("smoke: recovery hint passed");
  await assertLogSearchAndFilter(browser);
  console.log("smoke: log search/filter passed");
  await assertDiagnosticReportDoesNotLeak(browser);
  console.log("smoke: diagnostic report passed");
  await assertPathCopyActions(browser);
  console.log("smoke: path copy passed");
  await assertFirstUseEmptyState(browser);
  console.log("smoke: empty state passed");
  await assertAutoClearPasswordAfterDiagnostics(browser);
  console.log("smoke: auto-clear passed");
  await browser.close();
  browser = undefined;
  console.log("Mock UI smoke passed.");
} catch (error) {
  console.error(serverOutput);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  await stopProcessTree(vite);
}

function viteScript() {
  const script = join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(script)) throw new Error(`Vite script not found: ${script}`);
  return script;
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error("Chrome or Edge was not found.");
  return browser;
}

async function assertHealthyApp(page, label) {
  const state = await page.evaluate(() => {
    const text = document.querySelector(".app-shell")?.textContent ?? "";
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasReplacement: text.includes("\uFFFD"),
      hasShell: Boolean(document.querySelector(".app-shell")),
    };
  });

  if (!state.hasShell) throw new Error(`${label}: app shell was not rendered`);
  if (state.hasReplacement) throw new Error(`${label}: app text contains Unicode replacement characters`);
  if (state.scrollWidth > state.clientWidth + 1) {
    throw new Error(`${label}: horizontal overflow ${state.scrollWidth}px > ${state.clientWidth}px`);
  }
}

async function assertNoVisibleTextLeak(page, secret) {
  const leaked = await page.evaluate((value) => {
    const text = document.querySelector(".app-shell")?.textContent ?? "";
    return text.includes(value);
  }, secret);
  if (leaked) throw new Error("Visible app text leaked the cleartext password");
}

async function assertCommandIsRedacted(page) {
  const commandText = await page.locator(".command-box code").textContent();
  if (!commandText?.includes("[redacted]")) throw new Error("Command preview did not redact the password");
  if (commandText.includes("mock-password")) throw new Error("Command preview leaked the cleartext password");
}

async function assertOutputDirectoryIsSafe(page) {
  const commandText = await page.locator(".command-box code").textContent();
  if (!commandText?.includes("Messages Export")) throw new Error("Mock output directory was not selected");
  if (commandText.includes("-o C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup\\00008110-demo")) {
    throw new Error("Mock output directory points at the backup directory");
  }
}

async function assertOutputDirectoryWarning(page) {
  const warning = await page.locator(".path-inspection.warn").textContent();
  if (!warning?.includes("疑似旧导出文件")) {
    throw new Error("Output directory warning was not rendered");
  }
}

async function assertReadinessBand(page) {
  const text = await page.locator(".readiness-band").textContent();
  if (!text?.includes("就绪检查")) throw new Error("Readiness band was not rendered");
  if (!text.includes("导出引擎")) throw new Error("Readiness band did not show exporter status");
}

async function assertFirstRunGuide(page) {
  const text = await page.locator(".first-run-guide").textContent();
  if (!text?.includes("首次导出清单")) throw new Error("First-run checklist was not rendered");
  for (const expected of ["准备导出引擎", "选择 iOS 备份", "运行诊断"]) {
    if (!text.includes(expected)) throw new Error(`First-run checklist did not include ${expected}`);
  }
}

async function assertThemeToggle(page) {
  await page.getByRole("button", { name: /深色/ }).click();
  const darkTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (darkTheme !== "dark") throw new Error(`Theme toggle did not switch to dark mode: ${darkTheme}`);
  await page.getByRole("button", { name: /系统/ }).click();
}

async function assertEnvironmentFixList(page) {
  const text = await page.locator(".env-fix-list").textContent();
  if (!text?.includes("缺失项处理")) throw new Error("Environment fix list was not rendered");
  if (!text.includes("setup-windows.ps1")) throw new Error("Environment fix list did not show converter install command");
}

async function assertResourceLinks(page) {
  const text = await page.locator(".resource-links").textContent();
  if (!text?.includes("GPL")) throw new Error("Resource links did not include the GPL license");
  if (!text.includes("第三方声明")) throw new Error("Resource links did not include third-party notices");
}

async function assertSettingsPersistenceStatus(page) {
  const text = await page.locator(".settings-save-line").textContent();
  if (!text?.includes("不保存备份密码")) {
    throw new Error("Settings persistence status did not mention password exclusion");
  }
}

async function assertPasswordClearControls(page) {
  const secret = "manual-clear-password";
  const passwordInput = page.getByLabel("备份密码");
  const clearButton = page.getByRole("button", { name: "清除密码" });

  if (!(await clearButton.isDisabled())) {
    throw new Error("Clear password action should be disabled when the password is empty");
  }

  await passwordInput.fill(secret);
  if (await clearButton.isDisabled()) {
    throw new Error("Clear password action should be enabled after a password is entered");
  }
  await assertPersistedSettingsDoNotLeak(page, secret);
  await assertNoVisibleTextLeak(page, secret);

  await clearButton.click();
  if ((await passwordInput.inputValue()) !== "") {
    throw new Error("Clear password action did not empty the password field");
  }
  if (!(await clearButton.isDisabled())) {
    throw new Error("Clear password action should be disabled after clearing the password");
  }
  const diagnosticsButton = sourceDiagnosticsButton(page);
  if (!(await diagnosticsButton.isDisabled())) {
    throw new Error("Diagnostics should be disabled after clearing the encrypted backup password");
  }
  await assertPersistedSettingsDoNotLeak(page, secret);
  await assertNoVisibleTextLeak(page, secret);
}

async function assertInitialStepNavigation(page) {
  const nav = page.locator(".step-list");
  const source = nav.getByRole("button", { name: /数据源/ });
  const diagnostics = nav.getByRole("button", { name: /诊断/ });
  const options = nav.getByRole("button", { name: /^选项$/ });
  const run = nav.getByRole("button", { name: /导出/ });

  if ((await source.getAttribute("aria-current")) !== "step") {
    throw new Error("Source step should be marked as the current step");
  }
  if (!(await diagnostics.isDisabled())) {
    throw new Error("Diagnostics step should be disabled until the encrypted backup password is entered");
  }
  if (await options.isDisabled()) {
    throw new Error("Options step should remain reachable once a valid backup is selected");
  }
  if (!(await run.isDisabled())) {
    throw new Error("Run step should be disabled before an export job has started");
  }
  if ((await run.getAttribute("aria-disabled")) !== "true") {
    throw new Error("Disabled run step should expose aria-disabled=true");
  }
}

async function assertReadyStepNavigation(page) {
  const nav = page.locator(".step-list");
  const diagnostics = nav.getByRole("button", { name: /^诊断$/ });
  const options = nav.getByRole("button", { name: /^选项$/ });
  const run = nav.getByRole("button", { name: /导出/ });

  if (await diagnostics.isDisabled()) {
    throw new Error("Diagnostics step should be reachable after entering the encrypted backup password");
  }
  if (await options.isDisabled()) {
    throw new Error("Options step should be reachable after source setup");
  }
  if (!(await run.isDisabled())) {
    throw new Error("Run step should stay disabled until an export job has started");
  }
}

async function assertIncompleteBackupBlocksDiagnostics(page) {
  await page.getByRole("button", { name: /iPhone 旧备份/ }).click();
  const blockers = await page.locator(".source-blockers").textContent();
  if (!blockers?.includes("Manifest.db") || !blockers.includes("Info.plist")) {
    throw new Error("Incomplete backup blocker was not shown");
  }
  const diagnosticsButton = sourceDiagnosticsButton(page);
  if (!(await diagnosticsButton.isDisabled())) {
    throw new Error("Diagnostics should be disabled for incomplete backups");
  }
  const nav = page.locator(".step-list");
  if (!(await nav.getByRole("button", { name: /选项/ }).isDisabled())) {
    throw new Error("Options step should be disabled for incomplete backups");
  }
  if (!(await nav.getByRole("button", { name: /导出/ }).isDisabled())) {
    throw new Error("Run step should be disabled for incomplete backups");
  }
  await page.getByRole("button", { name: /A1mAssist 的 iPhone/ }).click();
}

async function assertPersistedSettingsDoNotLeak(page, secret) {
  await page.waitForTimeout(500);
  const leaked = await page.evaluate((value) => {
    return Object.entries(window.localStorage).some(([key, raw]) => {
      return key.includes("imessage-exporter-gui") && String(raw).includes(value);
    });
  }, secret);
  if (leaked) throw new Error("Persisted settings leaked the cleartext password");
}

async function assertSavedManualBackupIsValidated(browser) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.setItem(
      "imessage-exporter-gui.exportSettings.v1",
      JSON.stringify({
        kind: "iosBackup",
        backupPath: "D:\\Archives\\Custom iOS Backup",
        encrypted: false,
        exportPath: "D:\\Messages Export",
        format: "html",
        copyMethod: "clone",
        noLazy: false,
        useCallerId: false,
        ignoreDiskWarning: false,
        savedAt: new Date().toISOString(),
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });

  const backupStatus = await page.locator(".fact-list").textContent();
  if (!backupStatus?.includes("Manifest.db") || !backupStatus.includes("Info.plist") || !backupStatus.includes("存在")) {
    throw new Error("Saved manual backup path was not validated on startup");
  }
  const pathValue = await page.locator(".path-field input").first().inputValue();
  if (pathValue !== "D:\\Archives\\Custom iOS Backup") {
    throw new Error(`Saved manual backup path was not restored: ${pathValue}`);
  }
  await page.close();
}

async function assertMissingExporterBlocksExport(browser) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}&missingExporter=1`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^选项$/ }).click();

  const text = await page.locator(".app-shell").textContent();
  if (!text?.includes("缺少 imessage-exporter 导出引擎")) {
    throw new Error("Missing exporter export blocker was not shown");
  }
  const startButton = page.getByRole("button", { name: /^开始导出$/ });
  if (!(await startButton.isDisabled())) {
    throw new Error("Export should be disabled when the exporter is missing");
  }
  await page.close();
}

async function assertExportReview(page) {
  const text = await page.locator(".review-panel").textContent();
  if (!text?.includes("导出前复核")) throw new Error("Export review panel was not rendered");
  if (!text.includes("HTML") || !text.includes("附件 clone")) {
    throw new Error("Export review panel did not summarize format and attachment options");
  }
}

async function assertFormatSpecificControls(page) {
  await page.getByRole("button", { name: /^TXT/ }).click();
  const printFriendly = page.getByLabel("HTML 打印友好模式");
  if (!(await printFriendly.isDisabled())) {
    throw new Error("HTML print-friendly mode should be disabled for TXT exports");
  }
  await page.waitForFunction(() => document.querySelector(".command-box code")?.textContent?.includes("-f txt"));
  const txtCommand = await page.locator(".command-box code").textContent();
  if (!txtCommand?.includes("-f txt")) throw new Error("Command preview did not switch to TXT format");
  if (txtCommand.includes(" -l")) throw new Error("TXT command preview should not include the HTML no-lazy flag");

  await page.getByRole("button", { name: /^HTML/ }).click();
  await page.waitForFunction(() => document.querySelector(".command-box code")?.textContent?.includes("-f html"));
}

async function assertDiagnosticDetails(page) {
  const gridText = await page.locator(".diagnostic-grid").textContent();
  if (!gridText?.includes("128482 条消息")) throw new Error("Diagnostic summary did not show the message count");
  if (!gridText.includes("9421 个附件")) throw new Error("Diagnostic summary did not show the attachment count");
  if (!gridText.includes("联系人解析可用")) throw new Error("Diagnostic summary did not show contact detail");
  if (!gridText.includes("缺少 ffmpeg / ImageMagick")) throw new Error("Diagnostic summary did not show converter warning detail");

  const databaseTileClass = await page.locator(".diagnostic-tile").filter({ hasText: "数据库" }).getAttribute("class");
  if (!databaseTileClass?.includes("ok")) {
    throw new Error("Converter warnings should not contaminate the database diagnostic status");
  }
}

async function assertDiagnosticSummaryPanel(page) {
  const text = await page.locator(".diagnostic-summary-panel").textContent();
  if (!text?.includes("诊断摘要")) throw new Error("Diagnostic summary panel was not rendered");
  for (const expected of ["备份目录", "导出引擎", "诊断结果", "附件转换"]) {
    if (!text.includes(expected)) throw new Error(`Diagnostic summary panel did not include ${expected}`);
  }
}

async function assertCancelledOutcome(page) {
  const text = await page.locator(".job-outcome-notice").textContent();
  if (!text?.includes("导出已取消")) throw new Error("Cancelled export outcome was not rendered");
  const logState = await page.locator(".log-state").textContent();
  if (!logState?.includes("已取消")) throw new Error("Log state did not show cancellation");
  const firstHtmlDisabled = await page.getByRole("button", { name: /打开首个 HTML/ }).isDisabled();
  if (!firstHtmlDisabled) throw new Error("Open first HTML action should be disabled after cancellation");
}

async function assertTxtResultsExposeTxtAction(browser) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  page.on("dialog", async (dialog) => {
    if (!dialog.message().includes("输出目录已有内容")) {
      throw new Error(`Unexpected dialog in TXT flow: ${dialog.message()}`);
    }
    await dialog.accept();
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("备份密码").fill("txt-password");
  await sourceDiagnosticsButton(page).click();
  await waitForExitZero(page);
  await page.getByRole("button", { name: /继续设置/ }).click();
  await page.getByRole("button", { name: /选择输出目录/ }).click();
  await page.getByRole("button", { name: /^TXT/ }).click();
  await page.getByRole("button", { name: /^开始导出$/ }).click();
  await page.locator(".result-strip.success").waitFor({ timeout: 10000 });
  await assertExportSummary(page, ["导出完成", "TXT", "clone", "Messages Export"]);

  const txtButton = page.getByRole("button", { name: /打开首个 TXT/ });
  if (await txtButton.isDisabled()) {
    throw new Error("Open first TXT action should be enabled after a successful TXT export");
  }
  if ((await page.getByRole("button", { name: /打开首个 HTML/ }).count()) !== 0) {
    throw new Error("TXT exports should not render the first HTML action");
  }

  await page.close();
}

async function assertGeneratedArchiveDirectory(browser) {
  const secret = "archive-password";
  const page = await openOptionsPage(browser, `${baseUrl}&archiveCollision=1`, secret);
  await assertOutputDirectoryWarning(page);

  await page.getByRole("button", { name: "新建归档目录" }).click();
  await page.waitForFunction(() => /Messages Export \d{4}-\d{2}-\d{2} \d{4} \(2\)/.test(document.querySelector(".path-field input")?.value ?? ""));
  const generatedPath = await page.locator(".path-field input").inputValue();
  if (!/Messages Export \d{4}-\d{2}-\d{2} \d{4} \(2\)/.test(generatedPath)) {
    throw new Error(`Generated archive directory did not skip the occupied timestamped path: ${generatedPath}`);
  }
  await page.getByRole("button", { name: "新建归档目录" }).click();
  await page.waitForFunction(() => /Messages Export \d{4}-\d{2}-\d{2} \d{4} \(3\)/.test(document.querySelector(".path-field input")?.value ?? ""));
  const regeneratedPath = await page.locator(".path-field input").inputValue();
  if (!/Messages Export \d{4}-\d{2}-\d{2} \d{4} \(3\)/.test(regeneratedPath)) {
    throw new Error(`Repeated archive generation did not increment the suffix: ${regeneratedPath}`);
  }
  await page.getByText("目录当前不存在", { exact: false }).waitFor({ timeout: 5000 });
  if ((await page.locator(".path-inspection.warn").count()) !== 0) {
    throw new Error("Generated archive directory should not keep the old-output warning");
  }
  await page.waitForFunction(
    (path) => document.querySelector(".command-box code")?.textContent?.includes(path),
    regeneratedPath,
    { timeout: 5000 },
  );
  const commandText = await page.locator(".command-box code").textContent();
  if (!commandText?.includes(regeneratedPath)) {
    throw new Error("Command preview did not use the generated archive directory");
  }
  await assertPersistedSettingsDoNotLeak(page, secret);
  await page.close();
}

async function assertExportPresets(browser) {
  const secret = "preset-password";
  const page = await openOptionsPage(browser, baseUrl, secret);

  await page.getByRole("button", { name: /轻量文本/ }).click();
  await page.waitForFunction(() => document.querySelector(".command-box code")?.textContent?.includes("-f txt"));
  let commandText = await page.locator(".command-box code").textContent();
  if (!commandText?.includes("-c disabled")) throw new Error("Text preset did not switch attachment strategy to disabled");
  if (commandText.includes(" -l")) throw new Error("Text preset should not keep no-lazy mode");

  await page.getByRole("button", { name: /打印准备/ }).click();
  await page.waitForFunction(() => document.querySelector(".command-box code")?.textContent?.includes("-l"));
  commandText = await page.locator(".command-box code").textContent();
  if (!commandText?.includes("-f html") || !commandText.includes("-c clone")) {
    throw new Error("Print preset did not switch to HTML + clone");
  }

  await page.getByRole("button", { name: /快速归档/ }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector(".command-box code")?.textContent ?? "";
    return text.includes("-f html") && text.includes("-c clone") && !text.includes(" -l");
  });
  await page.getByRole("button", { name: /^数据源/ }).click();
  const passwordValue = await page.getByLabel("备份密码").inputValue();
  if (passwordValue !== secret) throw new Error("Preset switching should not overwrite the backup password");
  const backupPath = await page.locator(".path-field input").inputValue();
  if (!backupPath.includes("MobileSync\\Backup\\00008110-demo")) {
    throw new Error("Preset switching should not overwrite the backup path");
  }
  await assertPersistedSettingsDoNotLeak(page, secret);
  await page.close();
}

async function assertFailureRecoveryHint(browser) {
  const secret = "wrong-password";
  const page = await openOptionsPage(browser, `${baseUrl}&fail=password`, secret);
  page.on("dialog", async (dialog) => {
    if (!dialog.message().includes("输出目录已有内容")) {
      throw new Error(`Unexpected dialog in failure flow: ${dialog.message()}`);
    }
    await dialog.accept();
  });

  await page.getByRole("button", { name: /^开始导出$/ }).click();
  await page.locator(".result-strip.failed").waitFor({ timeout: 10000 });
  const notice = await page.locator(".job-outcome-notice").textContent();
  if (!notice?.includes("备份密码可能不正确") || !notice.includes("回到数据源")) {
    throw new Error("Password failure recovery hint was not rendered");
  }
  await assertNoVisibleTextLeak(page, secret);
  await assertPersistedSettingsDoNotLeak(page, secret);
  await page.close();
}

async function assertLogSearchAndFilter(browser) {
  const page = await openOptionsPage(browser, `${baseUrl}&fail=password`, "log-filter-password");
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: /^开始导出$/ }).click();
  await page.locator(".result-strip.failed").waitFor({ timeout: 10000 });

  const allLines = await page.locator(".log-line").count();
  if (allLines < 3) throw new Error(`Expected multiple log lines before filtering, got ${allLines}`);
  await page.getByLabel("搜索日志").fill("Incorrect password");
  await page.waitForFunction(() => document.querySelectorAll(".log-line").length === 1);
  await page.getByLabel("搜索日志").fill("");
  await page.getByRole("button", { name: "stdout" }).click();
  const filteredLines = await page.locator(".log-line").count();
  if (filteredLines >= allLines) throw new Error("Log kind filter did not reduce the visible line count");
  await page.close();
}

async function assertDiagnosticReportDoesNotLeak(browser) {
  const secret = "report-password";
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("备份密码").fill(secret);
  await sourceDiagnosticsButton(page).click();
  await waitForExitZero(page);

  if ((await page.getByRole("button", { name: "复制诊断报告" }).count()) !== 1) {
    throw new Error("Copy diagnostic report action was not rendered");
  }
  if ((await page.getByRole("button", { name: "下载诊断报告 .txt" }).count()) !== 1) {
    throw new Error("Download diagnostic report action was not rendered");
  }
  const report = await page.locator(".report-buffer").inputValue();
  if (!report.includes("诊断报告") || !report.includes("脱敏命令") || !report.includes("[redacted]")) {
    throw new Error("Diagnostic report did not include the expected redacted sections");
  }
  if (report.includes(secret)) throw new Error("Diagnostic report leaked the cleartext password");
  await assertNoVisibleTextLeak(page, secret);
  await page.close();
}

async function assertPathCopyActions(browser) {
  const page = await openOptionsPage(browser, baseUrl, "path-copy-password");
  if ((await page.getByRole("button", { name: "复制路径" }).count()) < 1) {
    throw new Error("Output path copy action was not rendered");
  }
  const outputTitle = await page.getByRole("button", { name: "复制路径" }).first().getAttribute("title");
  if (!outputTitle?.includes("Messages Export")) throw new Error("Path copy action did not expose the full path tooltip");

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: /^开始导出$/ }).click();
  await page.locator(".result-strip.success").waitFor({ timeout: 10000 });
  if ((await page.getByRole("button", { name: "复制路径" }).count()) < 1) {
    throw new Error("Result path copy action was not rendered");
  }
  await page.getByRole("button", { name: /^数据源/ }).click();
  if ((await page.getByRole("button", { name: "复制路径" }).count()) < 1) {
    throw new Error("Backup path copy action was not rendered");
  }
  const backupTitle = await page.getByRole("button", { name: "复制路径" }).first().getAttribute("title");
  if (!backupTitle?.includes("MobileSync\\Backup")) throw new Error("Backup path copy action did not expose the full path tooltip");
  await page.close();
}

async function assertFirstUseEmptyState(browser) {
  const context = await browser.newContext({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}&emptyBackups=1`, { waitUntil: "networkidle" });
  const text = await page.locator(".backup-empty-guidance").textContent();
  if (!text?.includes("没有自动发现本机 iOS 备份") || !text.includes("Apple Devices") || !text.includes("iTunes")) {
    throw new Error("First-use empty state did not show Apple Devices/iTunes guidance");
  }
  if (!text.includes("Apple\\MobileSync\\Backup") || !text.includes("Apple Computer\\MobileSync\\Backup")) {
    throw new Error("First-use empty state did not show the expected backup paths");
  }
  await context.close();
}

async function assertExportSummary(page, expectedTexts) {
  const text = await page.locator(".export-summary-panel").textContent();
  if (!text?.includes("导出摘要")) throw new Error("Export summary panel was not rendered");
  for (const expected of ["项目", "耗时", "下一步"]) {
    if (!text.includes(expected)) throw new Error(`Export summary did not include ${expected}`);
  }
  for (const expected of expectedTexts) {
    if (!text.includes(expected)) throw new Error(`Export summary did not include ${expected}`);
  }
}

async function assertAutoClearPasswordAfterDiagnostics(browser) {
  const secret = "auto-clear-password";
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("备份密码").fill(secret);
  await page.getByLabel("任务结束后自动清除密码").check();
  await assertPersistedSettingsDoNotLeak(page, secret);
  await sourceDiagnosticsButton(page).click();
  await waitForExitZero(page);
  await page.getByRole("button", { name: /^数据源/ }).click();

  const passwordValue = await page.getByLabel("备份密码").inputValue();
  if (passwordValue !== "") {
    throw new Error("Auto-clear password option did not clear the password after diagnostics ended");
  }
  await assertPersistedSettingsDoNotLeak(page, secret);
  await assertNoVisibleTextLeak(page, secret);
  await page.close();
}

async function assertCopyActions(page) {
  const commandButtons = await page.getByRole("button", { name: "复制命令" }).count();
  const logButtons = await page.getByRole("button", { name: "复制日志" }).count();
  if (commandButtons < 1) throw new Error("Copy command action was not rendered");
  if (logButtons < 1) throw new Error("Copy log action was not rendered");
}

async function openOptionsPage(browser, url, secret) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByLabel("备份密码").fill(secret);
  await sourceDiagnosticsButton(page).click();
  await waitForExitZero(page);
  await page.getByRole("button", { name: /继续设置/ }).click();
  await page.getByRole("button", { name: /选择输出目录/ }).click();
  await assertCommandIsRedacted(page);
  await assertPersistedSettingsDoNotLeak(page, secret);
  return page;
}

function sourceDiagnosticsButton(page) {
  return page.locator(".footer-actions").getByRole("button", { name: /^运行诊断$/ });
}

async function waitForExitZero(page) {
  await page.waitForFunction(
    () => {
      const state = document.querySelector(".log-state")?.textContent ?? "";
      const exitLines = Array.from(document.querySelectorAll(".log-line.exit pre")).map((node) => node.textContent ?? "");
      return state.includes("0") || exitLines.some((text) => text.includes("0"));
    },
    undefined,
    { timeout: 10000 },
  );
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep waiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child) {
  if (!child?.pid) return;

  child.stdout?.destroy();
  child.stderr?.destroy();
  try {
    child.kill();
  } catch {
    // Fall through to taskkill/process.kill fallback.
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1500);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 5000 });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
}
