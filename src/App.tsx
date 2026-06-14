import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileArchive,
  MessageSquareText,
  Search,
  Settings2,
} from "lucide-react";

import { terminalOutcome } from "./components/CommonUi";
import type { JobOutcome } from "./components/CommonUi";
import { AboutDialog, EnvironmentDialog, OnboardingDialog } from "./components/Dialogs";
import type { UpdateCheckState } from "./components/Dialogs";
import { EnvironmentPanel, TopBar } from "./components/ShellPanels";
import type { SettingsSaveState } from "./components/ShellPanels";
import {
  DiagnosticsStep,
  OptionsStep,
  RunStep,
  SourceStep,
  blockingExportPathErrors,
  needsExportPathConfirmation,
  sourceDiagnosticsBlockers,
  sourceSelectionBlockers,
} from "./components/WorkspaceSteps";
import {
  cancelJob,
  checkForAppUpdate,
  getAppDiagnostics,
  getEnvironment,
  installAvailableUpdate,
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
  scanConversations,
  scanIosBackups,
  startExport,
  validateBackupPath,
} from "./api/tauri";
import { tx, useAppLanguage, useDocumentLocalization } from "./i18n";
import { useAppTheme } from "./theme";
import { timestampedArchiveSequence } from "./lib/archivePath";
import { converterWarnings, defaultExportConfig, normalizeConfig, validateExportConfig } from "./lib/exportConfig";
import { summarizeDiagnostics } from "./lib/diagnostics";
import { applyExportPreset } from "./lib/exportPresets";
import type { ExportPresetId } from "./lib/exportPresets";
import { clearPersistedExportConfig, loadPersistedExportConfig, persistExportConfig } from "./lib/persistence";
import type {
  AppDiagnostics,
  BackupCandidate,
  CommandPreview,
  ConversationCandidate,
  EnvironmentStatus,
  ExportConfig,
  ExportPathStatus,
  JobEvent,
  JobStarted,
  LogLine,
  SourceConfig,
  WorkspaceSectionId,
} from "./types";

const workspaceSections: Array<{ id: WorkspaceSectionId; label: string; icon: typeof Database }> = [
  { id: "source", label: "数据源", icon: Database },
  { id: "diagnostics", label: "诊断", icon: Search },
  { id: "options", label: "选项", icon: Settings2 },
  { id: "run", label: "导出", icon: FileArchive },
];

const maxArchivePathAttempts = 50;
const exporterDownloadUrl = "https://github.com/ReagentX/imessage-exporter/releases/latest";
const onboardingStorageKey = "imessage-exporter-gui.oobe.dismissed.v1";

type WorkspaceSectionAccess = { disabled: boolean; reason?: string };

export default function App() {
  const { language, setLanguage } = useAppLanguage();
  const { theme, setTheme } = useAppTheme();
  useDocumentLocalization(language);
  const [activeSectionId, setActiveSectionId] = useState<WorkspaceSectionId>("source");
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingDismissed());
  const [environment, setEnvironment] = useState<EnvironmentStatus>();
  const [backups, setBackups] = useState<BackupCandidate[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupCandidate>();
  const [config, setConfig] = useState<ExportConfig>(() => loadPersistedExportConfig(defaultExportConfig));
  const [preview, setPreview] = useState<CommandPreview>();
  const [exportPathStatus, setExportPathStatus] = useState<ExportPathStatus>();
  const [checkingExportPath, setCheckingExportPath] = useState(false);
  const [conversations, setConversations] = useState<ConversationCandidate[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState<string>();
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
  const [appDiagnostics, setAppDiagnostics] = useState<AppDiagnostics>();
  const [showAbout, setShowAbout] = useState(false);
  const [showEnvironmentDetails, setShowEnvironmentDetails] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateCheckState>({ kind: "idle" });
  const activeLogJobIdRef = useRef<string>();
  const diagnosticJobIdRef = useRef<string>();
  const cancelRequestedJobIdRef = useRef<string>();
  const didHydrateSettingsRef = useRef(false);
  const autoClearPasswordRef = useRef(Boolean(config.autoClearPassword));
  const generatedArchivePathsRef = useRef(new Set<string>());
  const onboardingTriggerRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const environmentDetailsTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    refreshEnvironment();
    getAppDiagnostics()
      .then(setAppDiagnostics)
      .catch((err) => setError(String(err)));
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
    const backupPath = config.backupPath.trim();
    setConversations([]);
    setConversationError(undefined);
    if (!backupPath || !selectedBackup?.valid) {
      setLoadingConversations(false);
      return;
    }

    let cancelled = false;
    setLoadingConversations(true);
    scanConversations(backupPath)
      .then((items) => {
        if (!cancelled) setConversations(items);
      })
      .catch((err) => {
        if (!cancelled) setConversationError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.backupPath, selectedBackup?.valid]);

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
  const activeSection = workspaceSections.find((candidate) => candidate.id === activeSectionId) ?? workspaceSections[0];
  const sourceSelectionErrors = useMemo(() => sourceSelectionBlockers(config, selectedBackup), [config.backupPath, selectedBackup]);
  const diagnosticsNavErrors = useMemo(
    () => sourceDiagnosticsBlockers(config, selectedBackup, environment),
    [config.backupPath, config.encrypted, config.cleartextPassword, selectedBackup, environment],
  );
  const sectionAccess = useMemo(
    () => workspaceSectionAccessMap(sourceSelectionErrors, diagnosticsNavErrors, Boolean(exportJob)),
    [sourceSelectionErrors, diagnosticsNavErrors, exportJob],
  );
  const sectionCompletion = useMemo(
    () => workspaceSectionCompletionMap(sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, Boolean(exportJob), jobOutcome),
    [sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, exportJob, jobOutcome],
  );

  useEffect(() => {
    if ((activeSectionId === "diagnostics" || activeSectionId === "options") && sourceSelectionErrors.length > 0) {
      setActiveSectionId("source");
    } else if (activeSectionId === "run" && !exportJob) {
      setActiveSectionId(sourceSelectionErrors.length ? "source" : "options");
    }
  }, [activeSectionId, sourceSelectionErrors.length, exportJob]);

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

  async function copyText(value: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(value);
    } catch (err) {
      setError(String(err));
    }
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
      setActiveSectionId("diagnostics");
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
      setActiveSectionId("run");
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
    window.setTimeout(() => onboardingTriggerRef.current?.focus(), 0);
  }

  function openOnboarding() {
    setShowOnboarding(true);
  }

  function openAbout() {
    setShowAbout(true);
  }

  function closeAbout() {
    setShowAbout(false);
    window.setTimeout(() => aboutTriggerRef.current?.focus(), 0);
  }

  function openEnvironmentDetails() {
    setShowEnvironmentDetails(true);
  }

  function closeEnvironmentDetails() {
    setShowEnvironmentDetails(false);
    window.setTimeout(() => environmentDetailsTriggerRef.current?.focus(), 0);
  }

  async function checkForUpdates() {
    setUpdateState({ kind: "checking" });
    try {
      const info = await checkForAppUpdate();
      setUpdateState(info.available ? { kind: "available", info } : { kind: "current", info });
    } catch (err) {
      setUpdateState({ kind: "failed", message: String(err) });
    }
  }

  async function installUpdate() {
    if (updateState.kind !== "available") return;
    const info = updateState.info;
    setUpdateState({ kind: "installing", info, downloadedBytes: 0 });
    try {
      await installAvailableUpdate((event) => {
        if (event.event === "Started") {
          setUpdateState({ kind: "installing", info, downloadedBytes: 0, contentLength: event.data.contentLength });
        } else if (event.event === "Progress") {
          setUpdateState((current) =>
            current.kind === "installing"
              ? { ...current, downloadedBytes: current.downloadedBytes + event.data.chunkLength }
              : current,
          );
        }
      });
      setUpdateState({ kind: "installed", info });
    } catch (err) {
      setUpdateState({ kind: "failed", message: String(err) });
    }
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

        <EnvironmentPanel
          environment={environment}
          loading={loading}
          exporterPath={config.exporterPath}
          onChooseExporter={chooseExporterPath}
          onRefresh={() => refreshEnvironment()}
          onOpenDetails={openEnvironmentDetails}
          detailsButtonRef={environmentDetailsTriggerRef}
        />

        <nav className="workspace-nav" aria-label="工作区导航">
          {workspaceSections.map((candidate) => {
            const Icon = candidate.icon;
            const active = candidate.id === activeSectionId;
            const access = sectionAccess[candidate.id];
            const disabled = access.disabled && !active;
            const complete = sectionCompletion[candidate.id] && !active;
            return (
              <button
                key={candidate.id}
                className={`workspace-nav-button ${active ? "active" : ""}`}
                onClick={() => {
                  if (!disabled) setActiveSectionId(candidate.id);
                }}
                type="button"
                disabled={disabled}
                aria-current={active ? "page" : undefined}
                aria-disabled={disabled}
                title={disabled ? access.reason : candidate.label}
              >
                <span className="workspace-nav-icon">{complete ? <CheckCircle2 size={18} /> : <Icon size={18} />}</span>
                <span className="workspace-nav-copy">
                  <span>{candidate.label}</span>
                  {disabled && access.reason ? <small>{access.reason}</small> : null}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <TopBar
          activeSectionLabel={activeSection.label}
          backup={selectedBackup}
          exportPath={config.exportPath}
          environment={environment}
          running={Boolean(runningJobId)}
          language={language}
          onLanguageChange={setLanguage}
          theme={theme}
          onThemeChange={setTheme}
          onOpenOnboarding={openOnboarding}
          onboardingButtonRef={onboardingTriggerRef}
          onOpenAbout={openAbout}
          aboutButtonRef={aboutTriggerRef}
        />

        {error ? (
          <div className="notice error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {activeSectionId === "source" && (
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

        {activeSectionId === "diagnostics" && (
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
            onNext={() => setActiveSectionId("options")}
            onChooseExporter={chooseExporterPath}
            onOpenExporterDownload={openExporterDownload}
            onChooseBackup={chooseBackupPath}
            onBackToSource={() => setActiveSectionId("source")}
          />
        )}

        {activeSectionId === "options" && (
          <OptionsStep
            config={config}
            environment={environment}
            warnings={warnings}
            errors={allValidationErrors}
            preview={preview}
            exportPathStatus={exportPathStatus}
            checkingExportPath={checkingExportPath}
            conversations={conversations}
            loadingConversations={loadingConversations}
            conversationError={conversationError}
            onChange={updateConfig}
            onChooseExport={chooseExportPath}
            onGenerateExport={generateArchiveExportPath}
            onApplyPreset={applyPreset}
            onStart={startExportJob}
          />
        )}

        {activeSectionId === "run" && (
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
            onBackToOptions={() => setActiveSectionId("options")}
            onBackToSource={() => setActiveSectionId("source")}
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
            setActiveSectionId("source");
            dismissOnboarding();
          }}
        />
      ) : null}
      {showAbout ? (
        <AboutDialog
          appDiagnostics={appDiagnostics}
          environment={environment}
          config={config}
          updateState={updateState}
          onCheckUpdates={checkForUpdates}
          onInstallUpdate={installUpdate}
          onOpenExporterDownload={openExporterDownload}
          onChooseExporter={chooseExporterPath}
          onOpenResource={(file) => openResourceFile(file).catch((err) => setError(String(err)))}
          onClose={closeAbout}
        />
      ) : null}
      {showEnvironmentDetails ? (
        <EnvironmentDialog
          environment={environment}
          config={config}
          settingsSaveState={settingsSaveState}
          onChooseExporter={chooseExporterPath}
          onClearExporter={clearExporterPath}
          onOpenExporterDownload={openExporterDownload}
          onRefresh={() => refreshEnvironment()}
          onClearSettings={clearSavedSettings}
          onOpenResource={(file) => openResourceFile(file).catch((err) => setError(String(err)))}
          onCopy={copyText}
          onClose={closeEnvironmentDetails}
        />
      ) : null}
    </main>
  );
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

function workspaceSectionAccessMap(
  sourceErrors: string[],
  diagnosticsErrors: string[],
  hasExportJob: boolean,
): Record<WorkspaceSectionId, WorkspaceSectionAccess> {
  const sourceReason = sourceErrors[0];
  return {
    source: { disabled: false },
    diagnostics: sourceReason ? { disabled: true, reason: sourceReason } : diagnosticsErrors[0] ? { disabled: true, reason: diagnosticsErrors[0] } : { disabled: false },
    options: sourceReason ? { disabled: true, reason: sourceReason } : { disabled: false },
    run: hasExportJob ? { disabled: false } : { disabled: true, reason: "开始导出后可查看结果。" },
  };
}

function workspaceSectionCompletionMap(
  sourceErrors: string[],
  diagnosticsSucceeded: boolean,
  validationErrors: string[],
  hasExportJob: boolean,
  outcome: JobOutcome,
): Record<WorkspaceSectionId, boolean> {
  return {
    source: sourceErrors.length === 0,
    diagnostics: diagnosticsSucceeded,
    options: validationErrors.length === 0,
    run: hasExportJob && outcome.kind === "succeeded",
  };
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
