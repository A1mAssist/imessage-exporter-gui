import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  CalendarDays,
  CheckCircle2,
  CircleStop,
  Clipboard,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  MessageSquareText,
  MessagesSquare,
  Monitor,
  Moon,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sun,
  TerminalSquare,
  X,
  UserRound,
} from "lucide-react";

import {
  cancelJob,
  getEnvironment,
  inspectExportPath,
  onJobEvent,
  openFirstResult,
  openPath,
  openResourceFile,
  openUrl,
  pickDirectory,
  pickExporterFile,
  previewExportCommand,
  runDiagnostics,
  scanIosBackups,
  startExport,
  validateBackupPath,
} from "./api/tauri";
import { localizeMultiline, tx, useAppLanguage, useDocumentLocalization } from "./i18n";
import { useAppTheme } from "./theme";
import { timestampedArchiveSequence } from "./lib/archivePath";
import { buildDiagnosticReport } from "./lib/diagnosticReport";
import { copyMethods, converterWarnings, defaultExportConfig, exportFormats, normalizeConfig, validateExportConfig } from "./lib/exportConfig";
import { summarizeDiagnostics } from "./lib/diagnostics";
import type { DiagnosticFinding } from "./lib/diagnostics";
import { applyExportPreset, exportPresets } from "./lib/exportPresets";
import type { ExportPresetId } from "./lib/exportPresets";
import { summarizeExportResult } from "./lib/exportSummary";
import type { ExportSummary } from "./lib/exportSummary";
import { clearPersistedExportConfig, loadPersistedExportConfig, persistExportConfig } from "./lib/persistence";
import { recoveryHintForFailure } from "./lib/recoveryHints";
import type {
  BackupCandidate,
  CommandPreview,
  EnvironmentStatus,
  ExportConfig,
  ExportPathStatus,
  JobEvent,
  JobStarted,
  LogLine,
  SourceConfig,
  WizardStep,
} from "./types";

const steps: Array<{ id: WizardStep; label: string; icon: typeof Database }> = [
  { id: "source", label: "数据源", icon: Database },
  { id: "diagnostics", label: "诊断", icon: Search },
  { id: "options", label: "选项", icon: Settings2 },
  { id: "run", label: "导出", icon: FileArchive },
];

const maxArchivePathAttempts = 50;
const exporterDownloadUrl = "https://github.com/ReagentX/imessage-exporter/releases/latest";
const onboardingStorageKey = "imessage-exporter-gui.oobe.dismissed.v1";

type SettingsSaveState = "saved" | "saving" | "failed" | "cleared";
type JobOutcome = { kind: "idle" | "running" | "succeeded" | "failed" | "cancelled"; code?: number; message?: string };
type StepAccess = { disabled: boolean; reason?: string };

export default function App() {
  const { language, setLanguage } = useAppLanguage();
  const { theme, setTheme } = useAppTheme();
  useDocumentLocalization(language);
  const [step, setStep] = useState<WizardStep>("source");
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingDismissed());
  const [environment, setEnvironment] = useState<EnvironmentStatus>();
  const [backups, setBackups] = useState<BackupCandidate[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupCandidate>();
  const [config, setConfig] = useState<ExportConfig>(() => loadPersistedExportConfig(defaultExportConfig));
  const [preview, setPreview] = useState<CommandPreview>();
  const [exportPathStatus, setExportPathStatus] = useState<ExportPathStatus>();
  const [checkingExportPath, setCheckingExportPath] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [diagnosticJob, setDiagnosticJob] = useState<JobStarted>();
  const [exportJob, setExportJob] = useState<JobStarted>();
  const [diagnosticsSucceeded, setDiagnosticsSucceeded] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string>();
  const [lastExitCode, setLastExitCode] = useState<number>();
  const [jobOutcome, setJobOutcome] = useState<JobOutcome>({ kind: "idle" });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [settingsSaveState, setSettingsSaveState] = useState<SettingsSaveState>("saved");
  const activeLogJobIdRef = useRef<string>();
  const diagnosticJobIdRef = useRef<string>();
  const cancelRequestedJobIdRef = useRef<string>();
  const didHydrateSettingsRef = useRef(false);
  const autoClearPasswordRef = useRef(Boolean(config.autoClearPassword));
  const generatedArchivePathsRef = useRef(new Set<string>());

  useEffect(() => {
    refreshEnvironment();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    onJobEvent(handleJobEvent).then((handler) => {
      unsubscribe = handler;
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!didHydrateSettingsRef.current) {
      didHydrateSettingsRef.current = true;
      return;
    }

    setSettingsSaveState("saving");
    const timeout = window.setTimeout(() => {
      setSettingsSaveState(persistExportConfig(config) ? "saved" : "failed");
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [config]);

  useEffect(() => {
    autoClearPasswordRef.current = Boolean(config.autoClearPassword);
  }, [config.autoClearPassword]);

  useEffect(() => {
    setDiagnosticsSucceeded(false);
    setDiagnosticJob(undefined);
    diagnosticJobIdRef.current = undefined;
  }, [config.backupPath, config.encrypted]);

  useEffect(() => {
    if (!config.backupPath.trim() || !config.exportPath.trim()) {
      setPreview(undefined);
      return;
    }

    const timeout = window.setTimeout(() => {
      previewExportCommand(normalizeConfig(config))
        .then(setPreview)
        .catch(() => setPreview(undefined));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [config]);

  useEffect(() => {
    const path = config.exportPath.trim();
    setExportPathStatus(undefined);
    if (!path) {
      setCheckingExportPath(false);
      return;
    }

    let cancelled = false;
    setCheckingExportPath(true);
    const timeout = window.setTimeout(() => {
      inspectExportPath(path)
        .then((status) => {
          if (!cancelled) setExportPathStatus(status);
        })
        .catch((err) => {
          if (!cancelled) {
            setExportPathStatus({
              path,
              exists: false,
              isDirectory: false,
              parentExists: false,
              containsHtml: false,
              containsTxt: false,
              containsAttachments: false,
              warnings: ["无法检查输出目录，请重新选择或确认权限。"],
              error: String(err),
            });
          }
        })
        .finally(() => {
          if (!cancelled) setCheckingExportPath(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [config.exportPath]);

  const source: SourceConfig = useMemo(
    () => ({
      kind: "iosBackup",
      backupPath: config.backupPath,
      exporterPath: config.exporterPath,
      encrypted: config.encrypted,
      cleartextPassword: config.cleartextPassword,
    }),
    [config.backupPath, config.exporterPath, config.encrypted, config.cleartextPassword],
  );

  const validationErrors = useMemo(() => validateExportConfig(config), [config]);
  const exportPathErrors = useMemo(() => blockingExportPathErrors(exportPathStatus), [exportPathStatus]);
  const environmentErrors = useMemo(() => environmentExportBlockers(environment), [environment]);
  const allValidationErrors = useMemo(
    () => [...validationErrors, ...exportPathErrors, ...environmentErrors],
    [validationErrors, exportPathErrors, environmentErrors],
  );
  const warnings = useMemo(() => converterWarnings(config.copyMethod, environment), [config.copyMethod, environment]);
  const diagnosticsText = useMemo(() => logs.map((line) => line.text).join("\n"), [logs]);
  const diagnostics = useMemo(() => summarizeDiagnostics(diagnosticsText), [diagnosticsText]);
  const activeStepIndex = steps.findIndex((candidate) => candidate.id === step);
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const sourceSelectionErrors = useMemo(() => sourceSelectionBlockers(config, selectedBackup), [config.backupPath, selectedBackup]);
  const diagnosticsNavErrors = useMemo(
    () => sourceDiagnosticsBlockers(config, selectedBackup, environment),
    [config.backupPath, config.encrypted, config.cleartextPassword, selectedBackup, environment],
  );
  const stepAccess = useMemo(
    () => stepAccessMap(sourceSelectionErrors, diagnosticsNavErrors, Boolean(exportJob)),
    [sourceSelectionErrors, diagnosticsNavErrors, exportJob],
  );
  const stepCompletion = useMemo(
    () => stepCompletionMap(sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, Boolean(exportJob), jobOutcome),
    [sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, exportJob, jobOutcome],
  );

  useEffect(() => {
    if ((step === "diagnostics" || step === "options") && sourceSelectionErrors.length > 0) {
      setStep("source");
    } else if (step === "run" && !exportJob) {
      setStep(sourceSelectionErrors.length ? "source" : "options");
    }
  }, [step, sourceSelectionErrors.length, exportJob]);

  async function refreshEnvironment(exporterPathOverride?: unknown) {
    const nextExporterPath = typeof exporterPathOverride === "string" ? exporterPathOverride : config.exporterPath;
    setLoading(true);
    setError(undefined);
    try {
      const [env, candidates] = await Promise.all([getEnvironment(nextExporterPath), scanIosBackups()]);
      setEnvironment(env);
      setBackups(candidates);
      const savedBackup = candidates.find((candidate) => sameConfigPath(candidate.path, config.backupPath));
      if (savedBackup) {
        setSelectedBackup(savedBackup);
        setConfig((current) => ({
          ...current,
          backupPath: savedBackup.path,
          encrypted: savedBackup.encrypted ?? current.encrypted,
        }));
      } else if (config.backupPath.trim()) {
        const candidate = await validateBackupPath(config.backupPath);
        setSelectedBackup(candidate);
        setConfig((current) => ({
          ...current,
          backupPath: candidate.path,
          encrypted: candidate.encrypted ?? current.encrypted,
        }));
      } else if (!config.backupPath && candidates[0]) {
        applyBackup(candidates[0]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function chooseExporterPath() {
    const selected = await pickExporterFile(config.exporterPath || environment?.exporterPath);
    if (!selected) return;
    updateConfig({ exporterPath: selected });
    await refreshEnvironment(selected);
  }

  async function clearExporterPath() {
    updateConfig({ exporterPath: "" });
    await refreshEnvironment("");
  }

  async function openExporterDownload() {
    setError(undefined);
    try {
      await openUrl(exporterDownloadUrl);
    } catch (err) {
      setError(String(err));
    }
  }

  function handleJobEvent(event: JobEvent) {
    if (activeLogJobIdRef.current && event.jobId !== activeLogJobIdRef.current) {
      return;
    }

    setLogs((current) => [
      ...current,
      {
        id: `${event.jobId}-${event.timestamp}-${current.length}`,
        kind: event.kind,
        text: event.text ?? (event.kind === "exit" ? `进程退出，代码 ${event.code ?? "unknown"}` : ""),
        timestamp: event.timestamp,
      },
    ]);

    if (event.kind === "exit" || event.kind === "error") {
      setRunningJobId(undefined);
      setLastExitCode(event.code);
      setJobOutcome(terminalOutcome(event, cancelRequestedJobIdRef.current === event.jobId));
      if (event.jobId === diagnosticJobIdRef.current) {
        setDiagnosticsSucceeded(event.kind === "exit" && event.code === 0 && cancelRequestedJobIdRef.current !== event.jobId);
      }
      if (autoClearPasswordRef.current) {
        clearPassword();
      }
      if (cancelRequestedJobIdRef.current === event.jobId) cancelRequestedJobIdRef.current = undefined;
    }
  }

  async function chooseBackupPath() {
    const selected = await pickDirectory(config.backupPath || environment?.defaultBackupRoots[0], "backup");
    if (!selected) return;
    const candidate = await validateBackupPath(selected);
    applyBackup(candidate);
  }

  async function chooseExportPath() {
    const selected = await pickDirectory(config.exportPath, "export");
    if (selected) updateConfig({ exportPath: selected });
  }

  async function generateArchiveExportPath() {
    setError(undefined);
    const sequence = timestampedArchiveSequence({
      exportPath: config.exportPath,
      backupPath: config.backupPath,
    });

    try {
      const nextPath = await nextAvailableArchivePath(sequence.stem, sequence.startSuffix, generatedArchivePathsRef.current);
      generatedArchivePathsRef.current.add(nextPath);
      updateConfig({ exportPath: nextPath });
    } catch (err) {
      setError(String(err));
    }
  }

  function applyPreset(presetId: ExportPresetId) {
    setConfig((current) => applyExportPreset(current, presetId));
  }

  function applyBackup(candidate: BackupCandidate) {
    setSelectedBackup(candidate);
    setConfig((current) => ({
      ...current,
      backupPath: candidate.path,
      encrypted: candidate.encrypted ?? current.encrypted,
    }));
  }

  function updateConfig(patch: Partial<ExportConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function clearPassword() {
    setConfig((current) => (current.cleartextPassword ? { ...current, cleartextPassword: "" } : current));
  }

  function clearSavedSettings() {
    setSettingsSaveState(clearPersistedExportConfig() ? "cleared" : "failed");
  }

  async function startDiagnostics() {
    setError(undefined);
    setLogs([]);
    setLastExitCode(undefined);
    setJobOutcome({ kind: "idle" });
    cancelRequestedJobIdRef.current = undefined;
    const blockers = sourceDiagnosticsBlockers(config, selectedBackup, environment);
    if (blockers.length) {
      setError(blockers.join(" "));
      return;
    }
    try {
      const job = await runDiagnostics(source);
      setDiagnosticJob(job);
      diagnosticJobIdRef.current = job.jobId;
      activeLogJobIdRef.current = job.jobId;
      setRunningJobId(job.jobId);
      setJobOutcome({ kind: "running" });
      setDiagnosticsSucceeded(false);
      setStep("diagnostics");
    } catch (err) {
      setError(String(err));
    }
  }

  async function startExportJob() {
    setError(undefined);
    setLogs([]);
    setLastExitCode(undefined);
    setJobOutcome({ kind: "idle" });
    cancelRequestedJobIdRef.current = undefined;
    const errors = [...validateExportConfig(config), ...blockingExportPathErrors(exportPathStatus), ...environmentExportBlockers(environment)];
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    if (needsExportPathConfirmation(exportPathStatus)) {
      const ok = window.confirm(tx("输出目录已有内容或疑似旧导出文件。继续导出会把新结果写入同一个目录，是否继续？"));
      if (!ok) return;
    }

    try {
      const normalized = normalizeConfig(config);
      const job = await startExport(normalized);
      setExportJob(job);
      setPreview(job.preview);
      activeLogJobIdRef.current = job.jobId;
      setRunningJobId(job.jobId);
      setJobOutcome({ kind: "running" });
      setStep("run");
    } catch (err) {
      setError(String(err));
    }
  }

  async function openOutputPath() {
    setError(undefined);
    try {
      await openPath(config.exportPath);
    } catch (err) {
      setError(String(err));
    }
  }

  async function openFirstResultFile() {
    setError(undefined);
    try {
      await openFirstResult(config.exportPath, config.format);
    } catch (err) {
      setError(String(err));
    }
  }

  async function stopActiveJob() {
    if (!runningJobId) return;
    const jobId = runningJobId;
    cancelRequestedJobIdRef.current = jobId;
    try {
      await cancelJob(jobId);
    } catch (err) {
      if (cancelRequestedJobIdRef.current === jobId) cancelRequestedJobIdRef.current = undefined;
      setError(String(err));
    }
  }

  function dismissOnboarding() {
    saveOnboardingDismissed();
    setShowOnboarding(false);
  }

  function openOnboarding() {
    setShowOnboarding(true);
  }

  return (
    <main className="app-shell" key={language}>
      <aside className="sidebar">
        <div className="brand">
          <MessageSquareText size={28} />
          <div>
            <h1>iMessage Exporter</h1>
            <p>Windows iOS 备份导出向导</p>
          </div>
        </div>

        <nav className="step-list" aria-label="导出步骤">
          {steps.map((candidate) => {
            const Icon = candidate.icon;
            const active = candidate.id === step;
            const access = stepAccess[candidate.id];
            const disabled = access.disabled && !active;
            const complete = stepCompletion[candidate.id] && !active;
            return (
              <button
                key={candidate.id}
                className={`step-button ${active ? "active" : ""}`}
                onClick={() => {
                  if (!disabled) setStep(candidate.id);
                }}
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                aria-disabled={disabled}
                title={disabled ? access.reason : candidate.label}
              >
                <span className="step-icon">{complete ? <CheckCircle2 size={18} /> : <Icon size={18} />}</span>
                <span className="step-copy">
                  <span>{candidate.label}</span>
                  {disabled && access.reason ? <small>{access.reason}</small> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <EnvironmentPanel
          environment={environment}
          loading={loading}
          settingsSaveState={settingsSaveState}
          exporterPath={config.exporterPath}
          onChooseExporter={chooseExporterPath}
          onClearExporter={clearExporterPath}
          onOpenExporterDownload={openExporterDownload}
          onRefresh={() => refreshEnvironment()}
          onClearSettings={clearSavedSettings}
          onOpenResource={(file) => openResourceFile(file).catch((err) => setError(String(err)))}
        />
      </aside>

      <section className="workspace">
        <TopBar
          activeStepLabel={activeStep.label}
          backup={selectedBackup}
          exportPath={config.exportPath}
          environment={environment}
          running={Boolean(runningJobId)}
          language={language}
          onLanguageChange={setLanguage}
          theme={theme}
          onThemeChange={setTheme}
          onOpenOnboarding={openOnboarding}
        />

        {error ? (
          <div className="notice error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {step === "source" && (
          <SourceStep
            backups={backups}
            selectedBackup={selectedBackup}
            config={config}
            environment={environment}
            loadingEnvironment={loading}
            diagnosticsSucceeded={diagnosticsSucceeded}
            onChooseBackup={chooseBackupPath}
            onChooseExporter={chooseExporterPath}
            onOpenExporterDownload={openExporterDownload}
            onSelectBackup={applyBackup}
            onChange={updateConfig}
            onClearPassword={clearPassword}
            onRunDiagnostics={startDiagnostics}
            onRefreshEnvironment={refreshEnvironment}
          />
        )}

        {step === "diagnostics" && (
          <DiagnosticsStep
            logs={logs}
            diagnostics={diagnostics}
            job={diagnosticJob}
            config={config}
            language={language}
            backup={selectedBackup}
            environment={environment}
            running={Boolean(runningJobId)}
            exitCode={lastExitCode}
            outcome={jobOutcome}
            canContinue={diagnosticsSucceeded}
            onRunDiagnostics={startDiagnostics}
            onCancel={stopActiveJob}
            onNext={() => setStep("options")}
            onChooseExporter={chooseExporterPath}
            onOpenExporterDownload={openExporterDownload}
            onChooseBackup={chooseBackupPath}
            onBackToSource={() => setStep("source")}
          />
        )}

        {step === "options" && (
          <OptionsStep
            config={config}
            environment={environment}
            warnings={warnings}
            errors={allValidationErrors}
            preview={preview}
            exportPathStatus={exportPathStatus}
            checkingExportPath={checkingExportPath}
            onChange={updateConfig}
            onChooseExport={chooseExportPath}
            onGenerateExport={generateArchiveExportPath}
            onApplyPreset={applyPreset}
            onStart={startExportJob}
          />
        )}

        {step === "run" && (
          <RunStep
            logs={logs}
            preview={preview ?? exportJob?.preview}
            hasExportTask={Boolean(exportJob)}
            running={Boolean(runningJobId)}
            exitCode={lastExitCode}
            outcome={jobOutcome}
            exportPath={config.exportPath}
            format={config.format}
            copyMethod={config.copyMethod}
            onStart={startExportJob}
            onCancel={stopActiveJob}
            onBackToOptions={() => setStep("options")}
            onBackToSource={() => setStep("source")}
            onChooseExporter={chooseExporterPath}
            onOpenExporterDownload={openExporterDownload}
            onOpenOutput={openOutputPath}
            onOpenFirstResult={openFirstResultFile}
          />
        )}
      </section>

      {showOnboarding ? (
        <OnboardingDialog
          backup={selectedBackup}
          config={config}
          environment={environment}
          diagnosticsSucceeded={diagnosticsSucceeded}
          diagnosticsBlockers={sourceDiagnosticsBlockers(config, selectedBackup, environment)}
          onChooseExporter={chooseExporterPath}
          onOpenExporterDownload={openExporterDownload}
          onChooseBackup={chooseBackupPath}
          onRunDiagnostics={startDiagnostics}
          onClose={dismissOnboarding}
          onStart={() => {
            setStep("source");
            dismissOnboarding();
          }}
        />
      ) : null}
    </main>
  );
}

function blockingExportPathErrors(status?: ExportPathStatus): string[] {
  if (!status) return [];
  if (status.error) return [status.error];
  if (status.exists && !status.isDirectory) return ["输出路径已存在，但它不是文件夹。"];
  if (!status.parentExists) return ["输出目录的上级目录不存在，请重新选择。"];
  return [];
}

async function nextAvailableArchivePath(stem: string, startSuffix: number, generatedPaths: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < maxArchivePathAttempts; attempt += 1) {
    const suffix = startSuffix + attempt;
    const candidate = suffix <= 1 ? stem : `${stem} (${suffix})`;
    if (generatedPaths.has(candidate)) continue;

    const status = await inspectExportPath(candidate);
    if (!status.parentExists) throw new Error("归档目录的上级目录不存在，请先重新选择输出位置。");
    if (!status.exists) return candidate;
  }

  throw new Error("无法生成未占用的归档目录，请手动选择新的输出目录。");
}

function environmentExportBlockers(environment?: EnvironmentStatus): string[] {
  if (!environment || environment.exporterAvailable) return [];
  return ["缺少 imessage-exporter 导出引擎，暂时不能开始导出。"];
}

function sourceSelectionBlockers(config: ExportConfig, backup?: BackupCandidate): string[] {
  const blockers: string[] = [];

  if (!config.backupPath.trim()) {
    blockers.push("请选择 iOS 备份根目录。");
  } else if (!backup?.valid) {
    blockers.push("备份目录需要同时包含 Manifest.db 和 Info.plist。");
  }

  return blockers;
}

function stepAccessMap(sourceErrors: string[], diagnosticsErrors: string[], hasExportJob: boolean): Record<WizardStep, StepAccess> {
  const sourceReason = sourceErrors[0];
  return {
    source: { disabled: false },
    diagnostics: sourceReason ? { disabled: true, reason: sourceReason } : diagnosticsErrors[0] ? { disabled: true, reason: diagnosticsErrors[0] } : { disabled: false },
    options: sourceReason ? { disabled: true, reason: sourceReason } : { disabled: false },
    run: hasExportJob ? { disabled: false } : { disabled: true, reason: "开始导出后可查看结果。" },
  };
}

function stepCompletionMap(
  sourceErrors: string[],
  diagnosticsSucceeded: boolean,
  validationErrors: string[],
  hasExportJob: boolean,
  outcome: JobOutcome,
): Record<WizardStep, boolean> {
  return {
    source: sourceErrors.length === 0,
    diagnostics: diagnosticsSucceeded,
    options: validationErrors.length === 0,
    run: hasExportJob && outcome.kind === "succeeded",
  };
}

function needsExportPathConfirmation(status?: ExportPathStatus): boolean {
  if (!status?.exists || !status.isDirectory) return false;
  return Boolean((status.entryCount ?? 0) > 0 || status.containsHtml || status.containsTxt || status.containsAttachments);
}

function loadOnboardingDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(onboardingStorageKey) === "true";
  } catch {
    return false;
  }
}

function saveOnboardingDismissed() {
  try {
    window.localStorage.setItem(onboardingStorageKey, "true");
  } catch {
    // OOBE can still be dismissed for this session if storage is unavailable.
  }
}

function terminalOutcome(event: JobEvent, cancelRequested: boolean): JobOutcome {
  if (cancelRequested) {
    return { kind: "cancelled", code: event.code, message: event.text };
  }
  if (event.kind === "error") {
    return { kind: "failed", code: event.code, message: event.text };
  }
  if (event.code === 0) {
    return { kind: "succeeded", code: 0 };
  }
  return { kind: "failed", code: event.code, message: event.text };
}

function resultStripClass(kind: JobOutcome["kind"]) {
  if (kind === "running") return "running";
  if (kind === "succeeded") return "success";
  if (kind === "failed") return "failed";
  if (kind === "cancelled") return "cancelled";
  return "";
}

function jobOutcomeLabel(outcome: JobOutcome, context: "diagnostics" | "export") {
  const action = context === "diagnostics" ? "诊断" : "导出";
  if (outcome.kind === "running") return `${action}运行中`;
  if (outcome.kind === "succeeded") return `${action}完成`;
  if (outcome.kind === "cancelled") return `${action}已取消`;
  if (outcome.kind === "failed") return outcome.code === undefined ? `${action}失败` : `${action}失败，代码 ${outcome.code}`;
  return "尚未开始";
}

type RecoveryActions = {
  onChooseExporter?: () => void;
  onOpenExporterDownload?: () => void;
  onChooseBackup?: () => void;
  onBackToSource?: () => void;
  onBackToOptions?: () => void;
  onRetry?: () => void;
};

function JobOutcomeNotice({
  outcome,
  context,
  logs,
  actions,
}: {
  outcome: JobOutcome;
  context: "diagnostics" | "export";
  logs: LogLine[];
  actions?: RecoveryActions;
}) {
  if (outcome.kind === "idle" || outcome.kind === "running" || outcome.kind === "succeeded") return null;
  const label = jobOutcomeLabel(outcome, context);
  const hint = outcome.kind === "failed" ? recoveryHintForFailure(logs, outcome.message) : undefined;
  const title = hint?.title ?? label;
  const detail =
    outcome.kind === "cancelled"
      ? "任务已停止。可以调整选项后重新运行，已有日志会保留在本页。"
      : `${hint?.detail ?? outcome.message ?? "请查看 stderr/stdout 日志。"} ${hint?.action ?? "修正备份路径、密码、输出目录或转换器环境后重试。"}`;
  return (
    <div className={`notice ${outcome.kind === "cancelled" ? "warn" : "error"} job-outcome-notice`}>
      <AlertCircle size={17} />
      <span>
        <strong>{title}</strong>
        {hint ? <em>{label}</em> : null}
        <small>{outcome.message || detail}</small>
        {outcome.message && hint ? <small>{detail}</small> : null}
        <RecoveryActionRow hint={hint} actions={actions} />
      </span>
    </div>
  );
}

function RecoveryActionRow({ hint, actions }: { hint?: ReturnType<typeof recoveryHintForFailure>; actions?: RecoveryActions }) {
  if (!hint || !actions) return null;

  if (hint.category === "exporter") {
    return (
      <span className="recovery-actions">
        {actions.onOpenExporterDownload ? (
          <button className="ghost-button" type="button" onClick={actions.onOpenExporterDownload}>
            <ExternalLink size={15} />
            下载导出引擎
          </button>
        ) : null}
        {actions.onChooseExporter ? (
          <button className="ghost-button" type="button" onClick={actions.onChooseExporter}>
            <FolderOpen size={15} />
            选择导出引擎
          </button>
        ) : null}
      </span>
    );
  }

  if (hint.category === "backup" || hint.category === "password") {
    const sourceAction = hint.category === "backup" ? actions.onChooseBackup ?? actions.onBackToSource : actions.onBackToSource ?? actions.onChooseBackup;
    return (
      <span className="recovery-actions">
        {sourceAction ? (
          <button className="ghost-button" type="button" onClick={sourceAction}>
            <Database size={15} />
            回到数据源
          </button>
        ) : null}
        {actions.onRetry ? (
          <button className="ghost-button" type="button" onClick={actions.onRetry}>
            <RefreshCcw size={15} />
            重试
          </button>
        ) : null}
      </span>
    );
  }

  if (hint.category === "permission" || hint.category === "converter") {
    return (
      <span className="recovery-actions">
        {actions.onBackToOptions ? (
          <button className="ghost-button" type="button" onClick={actions.onBackToOptions}>
            <Settings2 size={15} />
            回到选项
          </button>
        ) : null}
        {actions.onRetry ? (
          <button className="ghost-button" type="button" onClick={actions.onRetry}>
            <RefreshCcw size={15} />
            重试
          </button>
        ) : null}
      </span>
    );
  }

  return actions.onRetry ? (
    <span className="recovery-actions">
      <button className="ghost-button" type="button" onClick={actions.onRetry}>
        <RefreshCcw size={15} />
        重试
      </button>
    </span>
  ) : null;
}

function TopBar({
  activeStepLabel,
  backup,
  exportPath,
  environment,
  running,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  onOpenOnboarding,
}: {
  activeStepLabel: string;
  backup?: BackupCandidate;
  exportPath: string;
  environment?: EnvironmentStatus;
  running: boolean;
  language: "en" | "zh-CN";
  onLanguageChange: (language: "en" | "zh-CN") => void;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  onOpenOnboarding: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <div>
          <span className="workspace-kicker">Export Workspace</span>
          <h2>{activeStepLabel}</h2>
        </div>
        <div className="topbar-utilities" aria-label="界面设置">
          <button className="guide-chip" type="button" onClick={onOpenOnboarding}>
            <Info size={15} />
            设置向导
          </button>
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
      </div>
      <div className="quick-stats" aria-label="当前导出状态">
        <QuickStat icon={<Database size={16} />} label="备份" value={backup?.displayName ?? "未选择"} tone={backup?.valid ? "ok" : "neutral"} />
        <QuickStat icon={<Archive size={16} />} label="输出" value={exportPath ? compactPath(exportPath) : "未设置"} tone={exportPath ? "ok" : "neutral"} />
        <QuickStat icon={<TerminalSquare size={16} />} label="导出引擎" value={environment?.exporterAvailable ? "就绪" : "缺失"} tone={environment?.exporterAvailable ? "ok" : "warn"} />
        <QuickStat icon={running ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} label="任务" value={running ? "运行中" : "空闲"} tone={running ? "accent" : "neutral"} />
      </div>
    </header>
  );
}

function QuickStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "accent" | "neutral";
}) {
  return (
    <div className={`quick-stat ${tone}`}>
      <span className="quick-stat-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function LanguageToggle({ language, onChange }: { language: "en" | "zh-CN"; onChange: (language: "en" | "zh-CN") => void }) {
  return (
    <div className="language-toggle" aria-label="Language">
      <button className={language === "en" ? "selected" : ""} type="button" onClick={() => onChange("en")} aria-label="English" aria-pressed={language === "en"}>
        EN
      </button>
      <button className={language === "zh-CN" ? "selected" : ""} type="button" onClick={() => onChange("zh-CN")} aria-label="中文" aria-pressed={language === "zh-CN"}>
        中文
      </button>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: "system" | "light" | "dark"; onChange: (theme: "system" | "light" | "dark") => void }) {
  const options: Array<{ value: "system" | "light" | "dark"; label: string; icon: ReactNode }> = [
    { value: "system", label: "系统", icon: <Monitor size={15} /> },
    { value: "light", label: "浅色", icon: <Sun size={15} /> },
    { value: "dark", label: "深色", icon: <Moon size={15} /> },
  ];

  return (
    <div className="theme-toggle" aria-label="主题">
      {options.map((option) => (
        <button
          aria-label={option.label}
          className={theme === option.value ? "selected" : ""}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={theme === option.value}
          title={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function EnvironmentPanel({
  environment,
  loading,
  settingsSaveState,
  exporterPath,
  onChooseExporter,
  onClearExporter,
  onOpenExporterDownload,
  onRefresh,
  onClearSettings,
  onOpenResource,
}: {
  environment?: EnvironmentStatus;
  loading: boolean;
  settingsSaveState: SettingsSaveState;
  exporterPath?: string;
  onChooseExporter: () => void;
  onClearExporter: () => void;
  onOpenExporterDownload: () => void;
  onRefresh: () => void;
  onClearSettings: () => void;
  onOpenResource: (file: "license" | "thirdPartyNotices") => void;
}) {
  const effectiveExporterPath = exporterPath?.trim() || environment?.exporterPath;
  return (
    <div className="env-panel">
      <div className="panel-title">
        <span>运行环境</span>
        <button className="icon-button" onClick={onRefresh} type="button" title="刷新环境">
          {loading ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
        </button>
      </div>
      <StatusLine ok={environment?.exporterAvailable} label="导出引擎" value={environment?.exporterAvailable ? "可用" : "未找到"} />
      <div className="engine-config">
        <small title={effectiveExporterPath || "未选择；会尝试从 PATH 检测"}>{effectiveExporterPath ? compactPath(effectiveExporterPath) : "未选择；会尝试从 PATH 检测"}</small>
        <p className="engine-help">GUI 不内置 imessage-exporter；请单独下载导出引擎，或选择本机已有的可执行文件。</p>
        <div className="engine-actions">
          <button className="ghost-button" type="button" onClick={onChooseExporter}>
            <FolderOpen size={15} />
            选择导出引擎
          </button>
          <button className="ghost-button" type="button" onClick={onOpenExporterDownload}>
            <ExternalLink size={15} />
            下载导出引擎
          </button>
          {exporterPath?.trim() ? (
            <button className="ghost-button" type="button" onClick={onClearExporter}>
              清除
            </button>
          ) : null}
        </div>
      </div>
      <StatusLine ok={environment?.ffmpegAvailable} label="ffmpeg" value={environment?.ffmpegAvailable ? "可用" : "未检测到"} />
      <StatusLine ok={environment?.imagemagickAvailable} label="ImageMagick" value={environment?.imagemagickAvailable ? "可用" : "未检测到"} />
      {environment?.warnings.map((warning) => (
        <p className="mini-warning" key={warning}>
          {warning}
        </p>
      ))}
      <EnvironmentFixList environment={environment} />
      <ResourceLinks onOpenResource={onOpenResource} />
      <div className={`settings-save-line ${settingsSaveState}`}>
        <Info size={15} />
        <span>
          <strong>{settingsStateLabel(settingsSaveState)}</strong>
          <small>仅保存路径和导出选项，不保存备份密码</small>
        </span>
        <button className="ghost-button" type="button" onClick={onClearSettings} disabled={settingsSaveState === "saving"}>
          清除
        </button>
      </div>
    </div>
  );
}

function ResourceLinks({
  onOpenResource,
}: {
  onOpenResource: (file: "license" | "thirdPartyNotices") => void;
}) {
  return (
    <div className="resource-links" aria-label="开源与版本资料">
      <button type="button" onClick={() => onOpenResource("license")}>
        GPL 许可证
      </button>
      <button type="button" onClick={() => onOpenResource("thirdPartyNotices")}>
        第三方声明
      </button>
    </div>
  );
}

function EnvironmentFixList({ environment }: { environment?: EnvironmentStatus }) {
  const fixes = environmentFixes(environment);
  if (!fixes.length) return null;

  return (
    <div className="env-fix-list" aria-label="环境修复建议">
      <strong>缺失项处理</strong>
      {fixes.map((fix) => (
        <div className="env-fix-item" key={fix.command}>
          <span>
            <small>{fix.label}</small>
            <code>{fix.command}</code>
          </span>
          <CopyButton label="复制" value={fix.command} />
        </div>
      ))}
    </div>
  );
}

function environmentFixes(environment?: EnvironmentStatus): Array<{ label: string; command: string }> {
  if (!environment) return [];
  const fixes: Array<{ label: string; command: string }> = [];

  if (!environment.exporterAvailable) {
    fixes.push({
      label: "下载 imessage-exporter 后选择可执行文件",
      command: exporterDownloadUrl,
    });
  }
  if (!environment.ffmpegAvailable || !environment.imagemagickAvailable) {
    fixes.push({
      label: "安装 basic/full 附件转换器",
      command: ".\\scripts\\setup-windows.ps1 -Install -InstallOptionalTools",
    });
  }

  return fixes;
}

function settingsStateLabel(state: SettingsSaveState): string {
  if (state === "saving") return "正在保存设置";
  if (state === "failed") return "设置保存失败";
  if (state === "cleared") return "已清除保存设置";
  return "设置已保存";
}

function compactPath(path: string) {
  if (path.length <= 32) return path;
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return path.slice(0, 29) + "...";
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}

function sameConfigPath(left?: string, right?: string): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  return normalizeConfigPath(left) === normalizeConfigPath(right);
}

function normalizeConfigPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function StatusLine({ ok, label, value }: { ok?: boolean; label: string; value: string }) {
  return (
    <div className="status-line">
      {ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SourceStep({
  backups,
  selectedBackup,
  config,
  environment,
  loadingEnvironment,
  diagnosticsSucceeded,
  onChooseBackup,
  onChooseExporter,
  onOpenExporterDownload,
  onSelectBackup,
  onChange,
  onClearPassword,
  onRunDiagnostics,
  onRefreshEnvironment,
}: {
  backups: BackupCandidate[];
  selectedBackup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  loadingEnvironment: boolean;
  diagnosticsSucceeded: boolean;
  onChooseBackup: () => void;
  onChooseExporter: () => void;
  onOpenExporterDownload: () => void;
  onSelectBackup: (backup: BackupCandidate) => void;
  onChange: (patch: Partial<ExportConfig>) => void;
  onClearPassword: () => void;
  onRunDiagnostics: () => void;
  onRefreshEnvironment: () => void;
}) {
  const diagnosticsBlockers = sourceDiagnosticsBlockers(config, selectedBackup, environment);
  const canRunDiagnostics = diagnosticsBlockers.length === 0;

  return (
    <div className="page">
      <Header eyebrow="Step 1" title="选择 iOS 备份" description="从 Apple Devices 或 iTunes 的本地备份导出 Messages 数据，不修改原始备份。" />

      <FirstRunGuide
        backup={selectedBackup}
        config={config}
        environment={environment}
        diagnosticsSucceeded={diagnosticsSucceeded}
        diagnosticsBlockers={diagnosticsBlockers}
        onChooseExporter={onChooseExporter}
        onOpenExporterDownload={onOpenExporterDownload}
        onChooseBackup={onChooseBackup}
        onRunDiagnostics={onRunDiagnostics}
      />

      <ReadinessBand
        backup={selectedBackup}
        config={config}
        environment={environment}
        loading={loadingEnvironment}
        onRefresh={onRefreshEnvironment}
      />

      <div className="toolbar">
        <PathField label="备份根目录" value={config.backupPath} onBrowse={onChooseBackup} />
      </div>

      <section className="content-band">
        <div className="section-heading">
          <h2>自动发现</h2>
          <p>常见 MobileSync Backup 目录中的候选备份。</p>
        </div>
        <div className="backup-grid">
          {backups.length ? (
            backups.map((backup) => (
              <button
                className={`backup-card ${backup.path === selectedBackup?.path ? "selected" : ""}`}
                key={backup.path}
                onClick={() => onSelectBackup(backup)}
                type="button"
              >
                <HardDrive size={21} />
                <span>
                  <strong>{backup.displayName}</strong>
                  <small>{backup.path}</small>
                </span>
                <Badge tone={backup.valid ? "ok" : "warn"}>{backup.valid ? "有效" : "不完整"}</Badge>
              </button>
            ))
          ) : (
            <div className="empty-state backup-empty-guidance">
              <strong>没有自动发现本机 iOS 备份</strong>
              <span>可以手动选择包含 Manifest.db 和 Info.plist 的备份根目录。</span>
              <code>%USERPROFILE%\Apple\MobileSync\Backup</code>
              <code>%APPDATA%\Apple Computer\MobileSync\Backup</code>
              <span>如果这两处都为空，先用 Apple Devices 或 iTunes 在本机创建一次加密备份。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-band two-columns">
        <div>
          <div className="section-heading">
            <h2>备份状态</h2>
          </div>
          <div className="fact-list">
            <Fact label="Manifest.db" value={selectedBackup?.hasManifestDb ? "存在" : "未确认"} />
            <Fact label="Info.plist" value={selectedBackup?.hasInfoPlist ? "存在" : "未确认"} />
            <Fact label="加密" value={config.encrypted ? "是" : "否或未知"} />
          </div>
        </div>
        <div>
          <label className="checkbox-row">
            <input type="checkbox" checked={config.encrypted} onChange={(event) => onChange({ encrypted: event.target.checked })} />
            <span>这是加密 iOS 备份</span>
          </label>
          {config.encrypted ? (
            <div className="password-block">
              <label>
                <span>备份密码</span>
                <div className="password-row">
                  <input
                    type="password"
                    value={config.cleartextPassword ?? ""}
                    onChange={(event) => onChange({ cleartextPassword: event.target.value })}
                    placeholder="只保存在当前内存中"
                  />
                  <button className="ghost-button" type="button" onClick={onClearPassword} disabled={!config.cleartextPassword?.trim()}>
                    清除密码
                  </button>
                </div>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(config.autoClearPassword)}
                  onChange={(event) => onChange({ autoClearPassword: event.target.checked })}
                />
                <span>任务结束后自动清除密码</span>
              </label>
              <p className="warning-text">
                <ShieldAlert size={15} />
                密码会临时传给 CLI，命令预览和日志会脱敏，但系统进程列表仍可能短暂看到。
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <FooterActions
        primaryLabel="运行诊断"
        primaryIcon={<Search size={17} />}
        onPrimary={onRunDiagnostics}
        primaryDisabled={!canRunDiagnostics}
      />
      {diagnosticsBlockers.length ? (
        <div className="source-blockers" aria-label="诊断前需要处理的问题">
          {diagnosticsBlockers.map((blocker) => (
            <span key={blocker}>
              <AlertCircle size={15} />
              {blocker}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FirstRunGuide({
  backup,
  config,
  environment,
  diagnosticsSucceeded,
  diagnosticsBlockers,
  onChooseExporter,
  onOpenExporterDownload,
  onChooseBackup,
  onRunDiagnostics,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  diagnosticsSucceeded: boolean;
  diagnosticsBlockers: string[];
  onChooseExporter: () => void;
  onOpenExporterDownload: () => void;
  onChooseBackup: () => void;
  onRunDiagnostics: () => void;
}) {
  const engineReady = Boolean(environment?.exporterAvailable);
  const backupReady = Boolean(config.backupPath.trim() && backup?.valid);
  const passwordReady = !config.encrypted || Boolean(config.cleartextPassword?.trim());
  const canRunDiagnostics = diagnosticsBlockers.length === 0;
  const items: Array<{ label: string; detail: string; done: boolean; actions: ReactNode }> = [
    {
      label: "准备导出引擎",
      detail: engineReady ? "已检测到 imessage-exporter，可以继续。" : "先下载 imessage-exporter，然后在这里选择可执行文件。",
      done: engineReady,
      actions: (
        <>
          <button className="ghost-button" type="button" onClick={onOpenExporterDownload}>
            <ExternalLink size={15} />
            下载
          </button>
          <button className="ghost-button" type="button" onClick={onChooseExporter}>
            <FolderOpen size={15} />
            选择
          </button>
        </>
      ),
    },
    {
      label: "选择 iOS 备份",
      detail: backupReady ? backup?.displayName ?? "备份目录已就绪。" : "选择包含 Manifest.db 和 Info.plist 的本机 iOS 备份根目录。",
      done: backupReady && passwordReady,
      actions: (
        <button className="ghost-button" type="button" onClick={onChooseBackup}>
          <Database size={15} />
          选择备份
        </button>
      ),
    },
    {
      label: "运行诊断",
      detail: diagnosticsSucceeded ? "诊断已通过，可以继续设置导出选项。" : "确认数据库、附件、联系人和可选转换器状态。",
      done: diagnosticsSucceeded,
      actions: (
        <button className="ghost-button" type="button" onClick={onRunDiagnostics} disabled={!canRunDiagnostics}>
          <Search size={15} />
          运行诊断
        </button>
      ),
    },
  ];

  return (
    <section className="content-band first-run-guide" aria-label="首次导出路线">
      <div className="section-heading">
        <div>
          <h2>首次导出清单</h2>
          <p>按顺序完成这三项，就能进入导出选项。</p>
        </div>
      </div>
      <div className="first-run-grid">
        {items.map((item, index) => (
          <div className={item.done ? "first-run-item done" : "first-run-item"} key={item.label}>
            <span className="first-run-index">{item.done ? <CheckCircle2 size={17} /> : index + 1}</span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="first-run-actions">{item.actions}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OnboardingDialog({
  backup,
  config,
  environment,
  diagnosticsSucceeded,
  diagnosticsBlockers,
  onChooseExporter,
  onOpenExporterDownload,
  onChooseBackup,
  onRunDiagnostics,
  onClose,
  onStart,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  diagnosticsSucceeded: boolean;
  diagnosticsBlockers: string[];
  onChooseExporter: () => void;
  onOpenExporterDownload: () => void;
  onChooseBackup: () => void;
  onRunDiagnostics: () => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const engineReady = Boolean(environment?.exporterAvailable);
  const backupReady = Boolean(config.backupPath.trim() && backup?.valid);
  const passwordReady = !config.encrypted || Boolean(config.cleartextPassword?.trim());
  const canRunDiagnostics = diagnosticsBlockers.length === 0;
  const items: Array<{ label: string; detail: string; done: boolean; icon: ReactNode }> = [
    {
      label: "准备导出引擎",
      detail: engineReady ? "已检测到 imessage-exporter，可以继续。" : "GUI 不内置导出引擎，请先下载或选择本机可执行文件。",
      done: engineReady,
      icon: <TerminalSquare size={17} />,
    },
    {
      label: "选择 iOS 备份",
      detail: backupReady ? backup?.displayName ?? "备份目录已就绪。" : "选择 Apple Devices 或 iTunes 创建的本机 iOS 备份根目录。",
      done: backupReady && passwordReady,
      icon: <Database size={17} />,
    },
    {
      label: "运行诊断",
      detail: diagnosticsSucceeded ? "诊断已通过，可以继续设置导出选项。" : "先确认数据库、附件、联系人和转换器状态。",
      done: diagnosticsSucceeded,
      icon: <Search size={17} />,
    },
  ];

  return (
    <div className="oobe-backdrop">
      <section className="oobe-dialog" role="dialog" aria-modal="true" aria-labelledby="oobe-title">
        <button className="icon-button oobe-close" type="button" onClick={onClose} aria-label="关闭首次设置指引">
          <X size={16} />
        </button>
        <div className="oobe-header">
          <span className="oobe-mark">
            <MessageSquareText size={22} />
          </span>
          <div>
            <span className="workspace-kicker">First Run</span>
            <h2 id="oobe-title">首次设置指引</h2>
            <p>按这条路线完成第一次导出；以后可以从顶部重新打开这个向导。</p>
          </div>
        </div>
        <div className="oobe-steps">
          {items.map((item, index) => (
            <div className={item.done ? "oobe-step done" : "oobe-step"} key={item.label}>
              <span className="oobe-step-icon">{item.done ? <CheckCircle2 size={17} /> : item.icon}</span>
              <span>
                <small>{index + 1}</small>
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
              </span>
            </div>
          ))}
        </div>
        <div className="oobe-actions" aria-label="首次设置操作">
          <button className="ghost-button" type="button" onClick={onOpenExporterDownload}>
            <ExternalLink size={15} />
            下载导出引擎
          </button>
          <button className="ghost-button" type="button" onClick={onChooseExporter}>
            <FolderOpen size={15} />
            选择导出引擎
          </button>
          <button className="ghost-button" type="button" onClick={onChooseBackup}>
            <Database size={15} />
            选择备份
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              onRunDiagnostics();
              onClose();
            }}
            disabled={!canRunDiagnostics}
          >
            <Search size={15} />
            运行诊断
          </button>
        </div>
        <footer className="oobe-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            稍后
          </button>
          <button className="primary-button" type="button" onClick={onStart}>
            开始设置
          </button>
        </footer>
      </section>
    </div>
  );
}

function sourceDiagnosticsBlockers(config: ExportConfig, backup?: BackupCandidate, environment?: EnvironmentStatus): string[] {
  const blockers: string[] = [];

  if (!environment?.exporterAvailable) blockers.push("缺少 imessage-exporter 导出引擎，暂时不能运行诊断。");
  blockers.push(...sourceSelectionBlockers(config, backup));
  if (config.encrypted && !config.cleartextPassword?.trim()) blockers.push("加密备份需要输入密码。");

  return blockers;
}

function ReadinessBand({
  backup,
  config,
  environment,
  loading,
  onRefresh,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  loading: boolean;
  onRefresh: () => void;
}) {
  const items: Array<{
    key: string;
    label: string;
    detail: string;
    tone: "ok" | "warn" | "error" | "neutral";
    icon: ReactNode;
  }> = [
    {
      key: "exporter",
      label: "导出引擎",
      detail: loading
        ? "正在检查"
        : environment?.exporterAvailable
          ? environment.exporterVersion ?? environment.exporterPath ?? "已就绪"
          : "未找到导出引擎，请下载或选择 imessage-exporter",
      tone: loading ? "neutral" : environment?.exporterAvailable ? "ok" : "error",
      icon: loading ? <Loader2 className="spin" size={17} /> : environment?.exporterAvailable ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />,
    },
    {
      key: "backup",
      label: "备份目录",
      detail: !config.backupPath.trim()
        ? "未选择"
        : backup?.valid
          ? backup.displayName
          : "需要包含 Manifest.db 和 Info.plist",
      tone: !config.backupPath.trim() ? "neutral" : backup?.valid ? "ok" : "warn",
      icon: backup?.valid ? <CheckCircle2 size={17} /> : <HardDrive size={17} />,
    },
    {
      key: "password",
      label: "加密密码",
      detail: config.encrypted
        ? config.cleartextPassword?.trim()
          ? config.autoClearPassword
            ? "已输入，任务结束后自动清除"
            : "已输入，仅保存在内存中"
          : "加密备份需要密码"
        : "未标记为加密备份",
      tone: config.encrypted ? (config.cleartextPassword?.trim() ? "ok" : "warn") : "neutral",
      icon: config.encrypted && !config.cleartextPassword?.trim() ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />,
    },
    {
      key: "converters",
      label: "附件转换",
      detail:
        environment?.ffmpegAvailable && environment?.imagemagickAvailable
          ? "basic/full 可用"
          : "clone 可直接导出，basic/full 需要 ffmpeg 和 ImageMagick",
      tone: environment?.ffmpegAvailable && environment?.imagemagickAvailable ? "ok" : "warn",
      icon: <Info size={17} />,
    },
  ];

  return (
    <section className="readiness-band" aria-label="启动就绪检查">
      <div className="readiness-title">
        <span>就绪检查</span>
        <button className="ghost-button" type="button" onClick={onRefresh}>
          <RefreshCcw size={15} />
          重新检查
        </button>
      </div>
      <div className="readiness-grid">
        {items.map((item) => (
          <div className={`readiness-item ${item.tone}`} key={item.key}>
            <span className="readiness-icon">{item.icon}</span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticSummaryPanel({
  diagnostics,
  backup,
  environment,
  canContinue,
}: {
  diagnostics: ReturnType<typeof summarizeDiagnostics>;
  backup?: BackupCandidate;
  environment?: EnvironmentStatus;
  canContinue: boolean;
}) {
  const diagnosticFindings = Object.values(diagnostics);
  const hasDiagnosticOutput = diagnosticFindings.some((finding) => finding.status !== "unknown");
  const hasDiagnosticWarning = diagnosticFindings.some((finding) => finding.status === "warn");
  const convertersReady = Boolean(environment?.ffmpegAvailable && environment?.imagemagickAvailable);
  const engineDetail = environment?.exporterAvailable ? environment.exporterVersion ?? environment.exporterPath ?? "导出引擎可用" : "未检测到导出引擎";
  const diagnosticDetail = canContinue ? "诊断已通过，可以继续设置导出选项。" : hasDiagnosticOutput ? "诊断已完成，但仍有项目需要处理。" : "运行诊断后会汇总检查结果。";
  const items: Array<{ label: string; value: string; detail: string; tone: "ok" | "warn" | "error" | "neutral"; icon: ReactNode }> = [
    {
      label: "备份目录",
      value: backup?.valid ? "已就绪" : "未就绪",
      detail: backup?.valid ? backup.displayName : "需要有效的 iOS 备份根目录",
      tone: backup?.valid ? "ok" : "warn",
      icon: <Database size={17} />,
    },
    {
      label: "导出引擎",
      value: environment?.exporterAvailable ? "可用" : "缺失",
      detail: engineDetail,
      tone: environment?.exporterAvailable ? "ok" : "error",
      icon: <TerminalSquare size={17} />,
    },
    {
      label: "诊断结果",
      value: canContinue ? "已通过" : hasDiagnosticOutput ? "需处理" : "待运行",
      detail: diagnosticDetail,
      tone: canContinue ? "ok" : hasDiagnosticWarning ? "warn" : "neutral",
      icon: canContinue ? <CheckCircle2 size={17} /> : <Search size={17} />,
    },
    {
      label: "附件转换",
      value: convertersReady ? "完整" : "可选缺失",
      detail: convertersReady ? "basic/full 附件转换可用" : "clone 可直接导出；basic/full 需要 ffmpeg 和 ImageMagick",
      tone: convertersReady ? "ok" : "warn",
      icon: <Archive size={17} />,
    },
  ];

  return (
    <section className="content-band diagnostic-summary-panel" aria-label="诊断摘要">
      <div className="section-heading">
        <div>
          <h2>诊断摘要</h2>
          <p>先看能否继续，再按下面的诊断卡片定位细节。</p>
        </div>
      </div>
      <div className="diagnostic-summary-grid">
        {items.map((item) => (
          <div className={`diagnostic-summary-item ${item.tone}`} key={item.label}>
            <span className="diagnostic-summary-icon">{item.icon}</span>
            <span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <em>{item.detail}</em>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticsStep({
  logs,
  diagnostics,
  job,
  config,
  language,
  backup,
  environment,
  running,
  exitCode,
  outcome,
  canContinue,
  onRunDiagnostics,
  onCancel,
  onNext,
  onChooseExporter,
  onOpenExporterDownload,
  onChooseBackup,
  onBackToSource,
}: {
  logs: LogLine[];
  diagnostics: ReturnType<typeof summarizeDiagnostics>;
  job?: JobStarted;
  config: ExportConfig;
  language: "en" | "zh-CN";
  backup?: BackupCandidate;
  environment?: EnvironmentStatus;
  running: boolean;
  exitCode?: number;
  outcome: JobOutcome;
  canContinue: boolean;
  onRunDiagnostics: () => void;
  onCancel: () => void;
  onNext: () => void;
  onChooseExporter: () => void;
  onOpenExporterDownload: () => void;
  onChooseBackup: () => void;
  onBackToSource: () => void;
}) {
  const report = useMemo(
    () =>
      localizeMultiline(
        language,
        buildDiagnosticReport({
          environment,
          backup,
          config,
          diagnostics,
          preview: job?.preview,
          logs,
          secrets: [config.cleartextPassword],
        }),
      ),
    [backup, config, diagnostics, environment, job?.preview, language, logs],
  );

  return (
    <div className="page">
      <Header eyebrow="Step 2" title="诊断备份" description="先让 imessage-exporter 检查数据库、附件、联系人和转换器状态。" />
      <DiagnosticSummaryPanel diagnostics={diagnostics} backup={backup} environment={environment} canContinue={canContinue} />
      <div className="diagnostic-grid">
        <DiagnosticTile label="数据库" status={diagnostics.database} />
        <DiagnosticTile label="附件" status={diagnostics.attachments} />
        <DiagnosticTile label="联系人" status={diagnostics.contacts} />
        <DiagnosticTile label="转换器" status={diagnostics.converters} />
      </div>
      {job?.preview ? <CommandBox preview={job.preview} /> : null}
      <LogPanel logs={logs} running={running} exitCode={exitCode} outcome={outcome} />
      <DiagnosticReportActions report={report} disabled={!logs.length && !job?.preview} />
      <JobOutcomeNotice
        outcome={outcome}
        context="diagnostics"
        logs={logs}
        actions={{
          onChooseExporter,
          onOpenExporterDownload,
          onChooseBackup,
          onBackToSource,
          onRetry: onRunDiagnostics,
        }}
      />
      <FooterActions
        secondaryLabel={running ? "取消诊断" : "重新诊断"}
        secondaryIcon={running ? <CircleStop size={17} /> : <RefreshCcw size={17} />}
        onSecondary={running ? onCancel : onRunDiagnostics}
        primaryLabel="继续设置"
        primaryIcon={<Settings2 size={17} />}
        onPrimary={onNext}
        primaryDisabled={running || !canContinue}
      />
      {!running && !canContinue ? (
        <div className="source-blockers" aria-label="继续设置前需要处理的问题">
          <span>
            <AlertCircle size={15} />
            请先成功完成一次诊断。
          </span>
        </div>
      ) : null}
    </div>
  );
}

function OptionsStep({
  config,
  environment,
  warnings,
  errors,
  preview,
  exportPathStatus,
  checkingExportPath,
  onChange,
  onChooseExport,
  onGenerateExport,
  onApplyPreset,
  onStart,
}: {
  config: ExportConfig;
  environment?: EnvironmentStatus;
  warnings: string[];
  errors: string[];
  preview?: CommandPreview;
  exportPathStatus?: ExportPathStatus;
  checkingExportPath: boolean;
  onChange: (patch: Partial<ExportConfig>) => void;
  onChooseExport: () => void;
  onGenerateExport: () => void;
  onApplyPreset: (presetId: ExportPresetId) => void;
  onStart: () => void;
}) {
  return (
    <div className="page">
      <Header eyebrow="Step 3" title="设置导出选项" description="选择输出格式、附件复制策略、日期范围和会话筛选。" />

      <section className="content-band preset-panel">
        <div className="section-heading">
          <h2>预设</h2>
          <p>只调整格式、附件策略和打印模式，不改备份路径、输出目录或密码。</p>
        </div>
        <div className="preset-grid">
          {exportPresets.map((preset) => (
            <button
              className={presetMatchesConfig(config, preset.id) ? "selected" : ""}
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              type="button"
            >
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="content-band">
        <div className="section-heading">
          <h2>输出</h2>
        </div>
        <PathField label="输出目录" value={config.exportPath} onBrowse={onChooseExport} />
        <div className="inline-actions">
          <button className="ghost-button" type="button" onClick={onGenerateExport}>
            <Archive size={15} />
            新建归档目录
          </button>
          <small>生成带时间戳的新文件夹，避免导出结果混入旧目录。</small>
        </div>
        <ExportPathNotice status={exportPathStatus} checking={checkingExportPath} />
        <SegmentedControl
          label="格式"
          value={config.format}
          options={exportFormats}
          onChange={(format) => onChange(format === "txt" ? { format, noLazy: false } : { format })}
        />
        <SegmentedControl
          label="附件"
          value={config.copyMethod}
          options={copyMethods}
          onChange={(copyMethod) => onChange({ copyMethod })}
        />
        {warnings.map((warning) => (
          <div className="notice warn" key={warning}>
            <AlertCircle size={17} />
            <span>{warning}</span>
          </div>
        ))}
        {config.copyMethod !== "clone" && environment && !environment.ffmpegAvailable ? (
          <p className="muted">Windows 第一版建议使用 clone；basic/full 依赖本机转换器。</p>
        ) : null}
      </section>

      <section className="content-band form-grid">
        <label>
          <span>开始日期</span>
          <input value={config.startDate ?? ""} onChange={(event) => onChange({ startDate: event.target.value })} placeholder="YYYY-MM-DD" />
        </label>
        <label>
          <span>结束日期</span>
          <input value={config.endDate ?? ""} onChange={(event) => onChange({ endDate: event.target.value })} placeholder="YYYY-MM-DD" />
        </label>
        <label>
          <span>会话筛选</span>
          <input value={config.conversationFilter ?? ""} onChange={(event) => onChange({ conversationFilter: event.target.value })} placeholder="联系人、手机号或聊天标识" />
        </label>
        <label>
          <span>自定义显示名</span>
          <input
            value={config.customName ?? ""}
            disabled={config.useCallerId}
            onChange={(event) => onChange({ customName: event.target.value })}
            placeholder="留空使用默认联系人解析"
          />
        </label>
      </section>

      <section className="content-band option-stack">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(config.noLazy)}
            disabled={config.format !== "html"}
            onChange={(event) => onChange({ noLazy: event.target.checked })}
          />
          <span>HTML 打印友好模式</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(config.useCallerId)} onChange={(event) => onChange({ useCallerId: event.target.checked, customName: "" })} />
          <span>使用 Caller ID 作为显示名</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(config.ignoreDiskWarning)} onChange={(event) => onChange({ ignoreDiskWarning: event.target.checked })} />
          <span>忽略磁盘空间警告</span>
        </label>
      </section>

      <ExportReview config={config} environment={environment} exportPathStatus={exportPathStatus} />

      {preview ? <CommandBox preview={preview} /> : null}
      {errors.map((message) => (
        <div className="notice error" key={message}>
          <AlertCircle size={17} />
          <span>{message}</span>
        </div>
      ))}

      <FooterActions primaryLabel="开始导出" primaryIcon={<Play size={17} />} onPrimary={onStart} primaryDisabled={errors.length > 0 || checkingExportPath} />
    </div>
  );
}

function ExportReview({
  config,
  environment,
  exportPathStatus,
}: {
  config: ExportConfig;
  environment?: EnvironmentStatus;
  exportPathStatus?: ExportPathStatus;
}) {
  const notes = exportReviewNotes(config, environment, exportPathStatus);
  const items: Array<{ label: string; value: string; icon: ReactNode }> = [
    {
      label: "来源",
      value: config.backupPath ? compactPath(config.backupPath) : "未选择",
      icon: <Database size={17} />,
    },
    {
      label: "输出",
      value: config.exportPath ? compactPath(config.exportPath) : "未设置",
      icon: <Archive size={17} />,
    },
    {
      label: "格式",
      value: `${config.format.toUpperCase()} · 附件 ${config.copyMethod}`,
      icon: <FileArchive size={17} />,
    },
    {
      label: "日期",
      value: dateRangeLabel(config),
      icon: <CalendarDays size={17} />,
    },
    {
      label: "会话",
      value: config.conversationFilter?.trim() || "全部会话",
      icon: <MessagesSquare size={17} />,
    },
    {
      label: "显示名",
      value: displayNameLabel(config),
      icon: <UserRound size={17} />,
    },
  ];

  return (
    <section className="content-band review-panel">
      <div className="section-heading">
        <div>
          <h2>导出前复核</h2>
          <p>确认这次任务会读取哪里、写到哪里，以及哪些选项会影响结果。</p>
        </div>
      </div>
      <div className="review-grid">
        {items.map((item) => (
          <div className="review-item" key={item.label}>
            <span className="review-icon">{item.icon}</span>
            <span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
      {notes.length ? (
        <div className="risk-list" aria-label="导出风险提示">
          {notes.map((note) => (
            <span className={`risk-pill ${note.tone}`} key={note.text}>
              {note.tone === "warn" ? <AlertCircle size={15} /> : <Info size={15} />}
              {note.text}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function dateRangeLabel(config: ExportConfig): string {
  const start = config.startDate?.trim();
  const end = config.endDate?.trim();
  if (start && end) return `${start} 至 ${end}`;
  if (start) return `${start} 之后`;
  if (end) return `${end} 之前`;
  return "全部日期";
}

function displayNameLabel(config: ExportConfig): string {
  if (config.useCallerId) return "使用 Caller ID";
  if (config.customName?.trim()) return config.customName.trim();
  return "默认联系人解析";
}

function exportReviewNotes(
  config: ExportConfig,
  environment?: EnvironmentStatus,
  exportPathStatus?: ExportPathStatus,
): Array<{ text: string; tone: "info" | "warn" }> {
  const notes: Array<{ text: string; tone: "info" | "warn" }> = [];

  if (config.encrypted) {
    notes.push({
      text: "加密备份密码只保存在内存中，但运行时仍可能短暂出现在系统进程列表。",
      tone: "warn",
    });
  }
  if (needsExportPathConfirmation(exportPathStatus)) {
    notes.push({
      text: "输出目录已有内容，继续导出前请确认旧文件可以保留。",
      tone: "warn",
    });
  }
  if ((config.copyMethod === "basic" || config.copyMethod === "full") && environment) {
    if (!environment.ffmpegAvailable || !environment.imagemagickAvailable) {
      notes.push({
        text: "basic/full 附件转换依赖 ffmpeg 和 ImageMagick，当前环境不完整。",
        tone: "warn",
      });
    }
  }
  if (config.format === "html" && config.noLazy) {
    notes.push({
      text: "HTML 打印友好模式会禁用懒加载，适合后续浏览器打印为 PDF。",
      tone: "info",
    });
  }
  if (config.ignoreDiskWarning) {
    notes.push({
      text: "已选择忽略磁盘空间警告，请确认输出磁盘有足够容量。",
      tone: "warn",
    });
  }

  return notes;
}

function presetMatchesConfig(config: ExportConfig, presetId: ExportPresetId): boolean {
  const preset = exportPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return false;
  return config.format === preset.settings.format && config.copyMethod === preset.settings.copyMethod && Boolean(config.noLazy) === preset.settings.noLazy;
}

function ExportPathNotice({ status, checking }: { status?: ExportPathStatus; checking: boolean }) {
  if (checking) {
    return (
      <div className="path-inspection neutral">
        <Loader2 className="spin" size={17} />
        <span>
          <strong>输出目录状态</strong>
          <small>正在检查目录内容和权限。</small>
        </span>
      </div>
    );
  }

  if (!status) return null;

  const blocking = blockingExportPathErrors(status).length > 0;
  const risky = needsExportPathConfirmation(status);
  const tone = blocking ? "error" : risky || status.warnings.length ? "warn" : "ok";
  const summary = exportPathSummary(status);

  return (
    <div className={`path-inspection ${tone}`}>
      {tone === "ok" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>
        <strong>输出目录状态</strong>
        <small>{summary}</small>
        {status.warnings.length ? (
          <ul>
            {status.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </span>
    </div>
  );
}

function exportPathSummary(status: ExportPathStatus): string {
  if (status.error) return status.error;
  if (status.exists && !status.isDirectory) return "当前路径不可用于导出。";
  if (!status.parentExists) return "上级目录不存在。";
  if (!status.exists) return "目录当前不存在，导出前请确认路径可创建。";
  if ((status.entryCount ?? 0) === 0) return "空文件夹，适合写入新的导出结果。";
  return `已有 ${status.entryCount ?? 0} 个项目。继续导出前建议确认这些文件可以保留。`;
}

function RunStep({
  logs,
  preview,
  hasExportTask,
  running,
  exitCode,
  outcome,
  exportPath,
  format,
  copyMethod,
  onStart,
  onCancel,
  onBackToOptions,
  onBackToSource,
  onChooseExporter,
  onOpenExporterDownload,
  onOpenOutput,
  onOpenFirstResult,
}: {
  logs: LogLine[];
  preview?: CommandPreview;
  hasExportTask: boolean;
  running: boolean;
  exitCode?: number;
  outcome: JobOutcome;
  exportPath: string;
  format: ExportConfig["format"];
  copyMethod: ExportConfig["copyMethod"];
  onStart: () => void;
  onCancel: () => void;
  onBackToOptions: () => void;
  onBackToSource: () => void;
  onChooseExporter: () => void;
  onOpenExporterDownload: () => void;
  onOpenOutput: () => void;
  onOpenFirstResult: () => void;
}) {
  const visualState = running ? "running" : outcome.kind;
  const Icon = visualState === "running" ? Loader2 : visualState === "succeeded" ? CheckCircle2 : visualState === "cancelled" ? CircleStop : TerminalSquare;
  const stripText = running ? "正在导出" : jobOutcomeLabel(outcome, "export");
  const summary = summarizeExportResult({ logs, running, outcome, format, copyMethod, exportPath });

  if (!hasExportTask) {
    return (
      <div className="page">
        <Header eyebrow="Step 4" title="导出与结果" description="实时查看 imessage-exporter 输出，导出完成后打开结果目录。" />
        <section className="content-band run-empty-state">
          <span className="run-empty-icon">
            <TerminalSquare size={22} />
          </span>
          <div>
            <h2>还没有开始导出</h2>
            <p>先在选项页确认输出目录、格式和命令预览，再启动导出任务。</p>
          </div>
        </section>
        <FooterActions primaryLabel="返回选项" primaryIcon={<Settings2 size={17} />} onPrimary={onBackToOptions} />
      </div>
    );
  }

  return (
    <div className="page">
      <Header eyebrow="Step 4" title="导出与结果" description="实时查看 imessage-exporter 输出，导出完成后打开结果目录。" />
      {preview ? <CommandBox preview={preview} /> : null}
      <div className={`result-strip ${resultStripClass(visualState)}`}>
        <Icon className={visualState === "running" ? "spin" : undefined} size={20} />
        <span>{stripText}</span>
      </div>
      <ExportSummaryPanel summary={summary} />
      <LogPanel logs={logs} running={running} exitCode={exitCode} outcome={outcome} />
      <JobOutcomeNotice
        outcome={outcome}
        context="export"
        logs={logs}
        actions={{
          onChooseExporter,
          onOpenExporterDownload,
          onBackToSource,
          onBackToOptions,
          onRetry: onStart,
        }}
      />
      <div className="result-actions">
        <button className="secondary-button" type="button" onClick={onOpenFirstResult} disabled={!exportPath.trim() || running || outcome.kind !== "succeeded"}>
          <ExternalLink size={17} />
          {format === "html" ? "打开首个 HTML" : "打开首个 TXT"}
        </button>
        <CopyButton label="复制路径" value={exportPath} disabled={!exportPath.trim()} title={exportPath ? `复制结果路径: ${exportPath}` : "复制结果路径"} />
      </div>
      <FooterActions
        secondaryLabel={running ? "取消导出" : "重新导出"}
        secondaryIcon={running ? <CircleStop size={17} /> : <RefreshCcw size={17} />}
        onSecondary={running ? onCancel : onStart}
        primaryLabel="打开输出目录"
        primaryIcon={<FolderOpen size={17} />}
        onPrimary={onOpenOutput}
        primaryDisabled={!exportPath.trim() || running}
      />
    </div>
  );
}

function ExportSummaryPanel({ summary }: { summary: ExportSummary }) {
  const tone = summary.status === "succeeded" ? "ok" : summary.status === "failed" ? "error" : summary.status === "cancelled" ? "warn" : "neutral";
  const items: Array<{ label: string; value: string; icon: ReactNode }> = [
    { label: "状态", value: summary.statusLabel, icon: summary.status === "succeeded" ? <CheckCircle2 size={16} /> : <Info size={16} /> },
    { label: "格式", value: summary.format, icon: <FileArchive size={16} /> },
    { label: "附件", value: summary.copyMethod, icon: <Archive size={16} /> },
    { label: "项目", value: summary.itemCountLabel, icon: <MessagesSquare size={16} /> },
    { label: "耗时", value: summary.durationLabel, icon: <CalendarDays size={16} /> },
    { label: "输出", value: compactPath(summary.outputPath), icon: <FolderOpen size={16} /> },
  ];

  return (
    <section className={`content-band export-summary-panel ${tone}`} aria-label="导出摘要">
      <div className="section-heading">
        <div>
          <h2>导出摘要</h2>
          <p>{summary.detail}</p>
        </div>
      </div>
      <div className="summary-grid">
        {items.map((item) => (
          <div className="summary-item" key={item.label} title={item.value}>
            <span className="summary-icon">{item.icon}</span>
            <span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="summary-next-step">
        <CheckCircle2 size={17} />
        <span>
          <strong>下一步</strong>
          <small>{summary.nextStep}</small>
        </span>
      </div>
    </section>
  );
}

function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="page-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function PathField({ label, value, onBrowse }: { label: string; value: string; onBrowse: () => void }) {
  return (
    <label className="path-field">
      <span>{label}</span>
      <div>
        <input value={value} readOnly placeholder="请选择目录" title={value} />
        <button type="button" onClick={onBrowse} title={`选择${label}`}>
          <FolderOpen size={18} />
        </button>
        <CopyButton label="复制路径" value={value} disabled={!value.trim()} title={value ? `复制完整${label}: ${value}` : `复制${label}`} />
      </div>
    </label>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      <span>{label}</span>
      <div className="segment-grid">
        {options.map((option) => (
          <button className={value === option.value ? "selected" : ""} key={option.value} onClick={() => onChange(option.value)} type="button">
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: "ok" | "warn" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function DiagnosticTile({ label, status }: { label: string; status: DiagnosticFinding }) {
  const text = status.status === "ok" ? "已确认" : status.status === "warn" ? "需注意" : "未解析";
  return (
    <div className={`diagnostic-tile ${status.status}`}>
      {status.status === "ok" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
      <span>{label}</span>
      <strong>{text}</strong>
      <small>{status.detail}</small>
    </div>
  );
}

function CommandBox({ preview }: { preview: CommandPreview }) {
  return (
    <section className="command-box">
      <div className="section-heading">
        <div>
          <h2>命令预览</h2>
          <p>密码和敏感值已脱敏。</p>
        </div>
        <CopyButton label="复制命令" value={preview.redacted} />
      </div>
      <code>{preview.redacted}</code>
    </section>
  );
}

function DiagnosticReportActions({ report, disabled }: { report: string; disabled?: boolean }) {
  function downloadReport() {
    if (disabled) return;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `imessage-exporter-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  return (
    <section className="content-band report-actions" aria-label="诊断报告">
      <div className="section-heading">
        <div>
          <h2>诊断报告</h2>
        </div>
        <span className="panel-actions">
          <CopyButton label="复制诊断报告" value={report} disabled={disabled} />
          <button className="ghost-button" type="button" onClick={downloadReport} disabled={disabled} title="下载诊断报告 .txt">
            <Download size={15} />
            下载诊断报告 .txt
          </button>
        </span>
      </div>
      <textarea className="report-buffer" value={report} readOnly aria-hidden="true" tabIndex={-1} />
    </section>
  );
}

function LogPanel({ logs, running, exitCode, outcome }: { logs: LogLine[]; running: boolean; exitCode?: number; outcome: JobOutcome }) {
  const logText = logs.map((line) => `[${line.kind}] ${line.text}`).join("\n");
  const logScrollerRef = useRef<HTMLDivElement>(null);
  const [followTail, setFollowTail] = useState(true);
  const [query, setQuery] = useState("");
  const [enabledKinds, setEnabledKinds] = useState<Record<"stdout" | "stderr" | "error", boolean>>({
    stdout: true,
    stderr: true,
    error: true,
  });
  const visibleLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((line) => {
      const kindVisible = line.kind === "exit" || enabledKinds[line.kind as "stdout" | "stderr" | "error"] !== false;
      const queryVisible = !needle || line.text.toLowerCase().includes(needle) || line.kind.toLowerCase().includes(needle);
      return kindVisible && queryVisible;
    });
  }, [enabledKinds, logs, query]);

  useEffect(() => {
    if (!followTail) return;
    const scroller = logScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [logs, followTail]);

  function handleLogScroll() {
    const scroller = logScrollerRef.current;
    if (!scroller) return;
    const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setFollowTail(distanceToBottom < 36);
  }

  function toggleKind(kind: "stdout" | "stderr" | "error") {
    setEnabledKinds((current) => ({ ...current, [kind]: !current[kind] }));
  }

  return (
    <section className="log-panel">
      <div className="panel-title">
        <span>日志</span>
        <span className="panel-actions">
          <button className="ghost-button" type="button" onClick={() => setFollowTail(true)} disabled={!logs.length || followTail} title="滚动到最新日志">
            <ArrowDownToLine size={15} />
            最新
          </button>
          <CopyButton label="复制日志" value={logText} disabled={!logs.length} />
          <span className="log-state">{logStateLabel(running, exitCode, outcome)}</span>
        </span>
      </div>
      <div className="log-tools">
        <label className="log-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索日志" placeholder="搜索日志" />
        </label>
        <div className="log-filters" aria-label="日志类型过滤">
          {(["stdout", "stderr", "error"] as const).map((kind) => (
            <button className={enabledKinds[kind] ? "selected" : ""} key={kind} type="button" aria-pressed={enabledKinds[kind]} onClick={() => toggleKind(kind)}>
              {kind}
            </button>
          ))}
        </div>
      </div>
      <div className="log-lines" ref={logScrollerRef} onScroll={handleLogScroll}>
        {visibleLogs.length ? (
          visibleLogs.map((line) => (
            <div className={`log-line ${line.kind}`} key={line.id}>
              <span>{line.kind}</span>
              <pre>{line.text}</pre>
            </div>
          ))
        ) : logs.length ? (
          <div className="empty-state">没有匹配的日志。</div>
        ) : (
          <div className="empty-state">任务日志会显示在这里。</div>
        )}
      </div>
    </section>
  );
}

function logStateLabel(running: boolean, exitCode: number | undefined, outcome: JobOutcome) {
  if (running) return "运行中";
  if (outcome.kind === "cancelled") return "已取消";
  if (outcome.kind === "failed") return exitCode === undefined ? "失败" : `退出 ${exitCode}`;
  if (outcome.kind === "succeeded") return "退出 0";
  return "待运行";
}

function CopyButton({ label, value, disabled, title }: { label: string; value: string; disabled?: boolean; title?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    if (disabled) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  }

  const displayLabel = status === "copied" ? "已复制" : status === "failed" ? "复制失败" : label;

  return (
    <button className="ghost-button" type="button" onClick={copy} disabled={disabled} title={title ?? label}>
      <Clipboard size={15} />
      {displayLabel}
    </button>
  );
}

function FooterActions({
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
}: {
  primaryLabel: string;
  primaryIcon: ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryIcon?: ReactNode;
  onSecondary?: () => void;
}) {
  return (
    <footer className="footer-actions">
      {secondaryLabel && onSecondary ? (
        <button className="secondary-button" type="button" onClick={onSecondary}>
          {secondaryIcon}
          {secondaryLabel}
        </button>
      ) : (
        <span />
      )}
      <button className="primary-button" type="button" onClick={onPrimary} disabled={primaryDisabled}>
        {primaryIcon}
        {primaryLabel}
      </button>
    </footer>
  );
}
