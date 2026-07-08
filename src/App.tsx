import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  Loader2,
  MessageSquareText,
  Search,
  Settings2,
  X,
} from "lucide-react";

import { terminalOutcome } from "./components/CommonUi";
import type { JobOutcome } from "./components/CommonUi";
import { AboutDialog, EnvironmentDialog, OnboardingDialog } from "./components/Dialogs";
import type { UpdateCheckState } from "./components/Dialogs";
import { TopBar } from "./components/ShellPanels";
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
  deleteInterruptedExport,
  getAppDiagnostics,
  getEnvironment,
  installAvailableUpdate,
  inspectDiagnostics,
  inspectExportPath,
  inspectSource,
  onAppQuitBlocked,
  onJobEvent,
  openFirstResult,
  openPath,
  openResourceFile,
  pickDirectory,
  runDiagnostics,
  searchJsonlResult,
  scanConversations,
  scanIosBackups,
  startExport,
  validateBackupPath,
} from "./api/tauri";
import { tx, useAppLanguage, useDocumentLocalization } from "./i18n";
import { useAppTheme } from "./theme";
import { timestampedArchiveSequence } from "./lib/archivePath";
import { converterWarnings, defaultExportConfig, normalizeConfig, resolveConversationSelection, validateExportConfig } from "./lib/exportConfig";
import { loadExportHistory, recordExportHistory } from "./lib/exportHistory";
import { summarizeDiagnostics } from "./lib/diagnostics";
import { applyExportPreset } from "./lib/exportPresets";
import type { ExportPresetId } from "./lib/exportPresets";
import { clearPersistedExportConfig, loadPersistedExportConfig, persistExportConfig } from "./lib/persistence";
import type {
  AppDiagnostics,
  BackupCandidate,
  ConversationCandidate,
  DiagnosticDetails,
  EnvironmentStatus,
  ExportConfig,
  ExportHistoryEntry,
  ExportPathStatus,
  JobEvent,
  JobProgress,
  JobStarted,
  LogLine,
  SourceConfig,
  SourceInspection,
  WorkspaceSectionId,
} from "./types";

const workspaceSections: Array<{ id: WorkspaceSectionId; label: string; icon: typeof Database }> = [
  { id: "source", label: "数据源", icon: Database },
  { id: "diagnostics", label: "诊断", icon: Search },
  { id: "options", label: "选项", icon: Settings2 },
  { id: "run", label: "导出", icon: FileArchive },
];

const maxArchivePathAttempts = 50;
const onboardingStorageKey = "imessage-exporter-gui.oobe.dismissed.v1";

type WorkspaceSectionAccess = { disabled: boolean; reason?: string };
type PendingAction =
  | "refreshEnvironment"
  | "chooseBackup"
  | "chooseAttachmentRoot"
  | "chooseContactsPath"
  | "chooseExport"
  | "generateExport"
  | "startDiagnostics"
  | "startExport"
  | "cancelJob"
  | "openOutput"
  | "openFirstResult"
  | "deleteInterruptedExport"
  | "installUpdate";

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
  const [exportPathStatus, setExportPathStatus] = useState<ExportPathStatus>();
  const [checkingExportPath, setCheckingExportPath] = useState(false);
  const [conversations, setConversations] = useState<ConversationCandidate[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState<string>();
  const [sourceInspection, setSourceInspection] = useState<SourceInspection>();
  const [checkingSource, setCheckingSource] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<LogLine[]>([]);
  const [diagnosticDetails, setDiagnosticDetails] = useState<DiagnosticDetails>();
  const [exportLogs, setExportLogs] = useState<LogLine[]>([]);
  const [exportProgressCounts, setExportProgressCounts] = useState<JobProgress>();
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>(() => loadExportHistory());
  const [diagnosticJob, setDiagnosticJob] = useState<JobStarted>();
  const [exportJob, setExportJob] = useState<JobStarted>();
  const [diagnosticsSucceeded, setDiagnosticsSucceeded] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string>();
  const [diagnosticOutcome, setDiagnosticOutcome] = useState<JobOutcome>({ kind: "idle" });
  const [exportOutcome, setExportOutcome] = useState<JobOutcome>({ kind: "idle" });
  const [error, setError] = useState<string>();
  const [settingsSaveState, setSettingsSaveState] = useState<SettingsSaveState>("saved");
  const [appDiagnostics, setAppDiagnostics] = useState<AppDiagnostics>();
  const [showAbout, setShowAbout] = useState(false);
  const [showEnvironmentDetails, setShowEnvironmentDetails] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateCheckState>({ kind: "idle" });
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string>();
  const [pendingActions, setPendingActions] = useState<ReadonlySet<PendingAction>>(() => new Set());
  const [deletingInterruptedExportTarget, setDeletingInterruptedExportTarget] = useState<string>();
  const activeLogJobIdRef = useRef<string>();
  const diagnosticJobIdRef = useRef<string>();
  const exportJobIdRef = useRef<string>();
  const activeExportHistoryDraftRef = useRef<Omit<ExportHistoryEntry, "finishedAt">>();
  const cancelRequestedJobIdRef = useRef<string>();
  const sourceRef = useRef<SourceConfig>();
  const didHydrateSettingsRef = useRef(false);
  const autoClearPasswordRef = useRef(Boolean(config.autoClearPassword));
  const generatedArchivePathsRef = useRef(new Set<string>());
  const onboardingTriggerRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const environmentDetailsTriggerRef = useRef<HTMLButtonElement>(null);

  function isPending(action: PendingAction): boolean {
    return pendingActions.has(action);
  }

  async function withPending<T>(action: PendingAction, task: () => Promise<T>): Promise<T> {
    setPendingActions((current) => new Set(current).add(action));
    try {
      return await task();
    } finally {
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(action);
        return next;
      });
    }
  }

  useEffect(() => {
    refreshEnvironment();
    getAppDiagnostics()
      .then(setAppDiagnostics)
      .catch((err) => setError(String(err)));
    checkForUpdates();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    onJobEvent(handleJobEvent).then((handler) => {
      unsubscribe = handler;
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    onAppQuitBlocked(() => {
      setError("导出或诊断正在运行，已阻止退出；请先等待完成或取消任务。");
    }).then((handler) => {
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

  const source: SourceConfig = useMemo(
    () => ({
      kind: config.kind,
      backupPath: config.backupPath,
      attachmentRoot: config.attachmentRoot,
      contactsPath: config.contactsPath,
      encrypted: config.encrypted,
      cleartextPassword: config.cleartextPassword,
    }),
    [config.kind, config.backupPath, config.attachmentRoot, config.contactsPath, config.encrypted, config.cleartextPassword],
  );

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const backupPath = config.backupPath.trim();
    setConversations([]);
    setConversationError(undefined);
    if (!backupPath || !sourceInspection?.ready) {
      setLoadingConversations(false);
      return;
    }

    let cancelled = false;
    setLoadingConversations(true);
    scanConversations(source)
      .then((items) => {
        if (!cancelled) setConversations(items);
      })
      .catch((err) => {
        if (!cancelled) setConversationError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.backupPath, source, sourceInspection?.ready]);

  useEffect(() => {
    setDiagnosticsSucceeded(false);
    setDiagnosticJob(undefined);
    diagnosticJobIdRef.current = undefined;
    setDiagnosticLogs([]);
    setDiagnosticDetails(undefined);
    setDiagnosticOutcome({ kind: "idle" });
  }, [config.backupPath, config.kind, config.encrypted]);

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
              pathLength: path.length,
              containsHtml: false,
              containsTxt: false,
              containsAttachments: false,
              interruptedExports: [],
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

  useEffect(() => {
    setSourceInspection(undefined);
    const backupPath = config.backupPath.trim();
    if (!backupPath || (config.kind === "iosBackup" && !selectedBackup?.valid)) {
      setCheckingSource(false);
      return;
    }
    if (config.encrypted && !config.cleartextPassword?.trim()) {
      setCheckingSource(false);
      return;
    }

    let cancelled = false;
    setCheckingSource(true);
    inspectSource(source)
      .then((inspection) => {
        if (!cancelled) setSourceInspection(inspection);
      })
      .catch((err) => {
        if (!cancelled) {
          setSourceInspection({
            ready: false,
            databaseReadable: false,
            warnings: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingSource(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.kind, config.backupPath, config.encrypted, config.cleartextPassword, selectedBackup?.valid, source]);

  const validationErrors = useMemo(() => validateExportConfig(config), [config]);
  const exportPathErrors = useMemo(() => blockingExportPathErrors(exportPathStatus), [exportPathStatus]);
  const environmentErrors = useMemo(() => environmentExportBlockers(environment), [environment]);
  const allValidationErrors = useMemo(
    () => [...validationErrors, ...exportPathErrors, ...environmentErrors],
    [validationErrors, exportPathErrors, environmentErrors],
  );
  const warnings = useMemo(() => converterWarnings(config.copyMethod, environment), [config.copyMethod, environment]);
  const diagnosticsText = useMemo(() => diagnosticLogs.map((line) => line.text).join("\n"), [diagnosticLogs]);
  const diagnostics = useMemo(() => summarizeDiagnostics(diagnosticsText, diagnosticDetails), [diagnosticsText, diagnosticDetails]);
  const exportRunning = Boolean(exportJob && runningJobId === exportJob.jobId);
  const diagnosticsRunning = Boolean(diagnosticJob && runningJobId === diagnosticJob.jobId);
  const exportStartDisabled = Boolean(runningJobId) || checkingExportPath || allValidationErrors.length > 0;
  const activeSection = workspaceSections.find((candidate) => candidate.id === activeSectionId) ?? workspaceSections[0];
  const updateNoticeInfo = updateState.kind === "available" && updateState.info.version !== dismissedUpdateVersion ? updateState.info : undefined;
  const sourceSelectionErrors = useMemo(
    () => sourceSelectionBlockers(config, selectedBackup, sourceInspection, checkingSource),
    [config.kind, config.backupPath, selectedBackup, sourceInspection, checkingSource],
  );
  const diagnosticsNavErrors = useMemo(
    () => sourceDiagnosticsBlockers(config, selectedBackup, environment, sourceInspection, checkingSource),
    [config.kind, config.backupPath, config.encrypted, config.cleartextPassword, selectedBackup, environment, sourceInspection, checkingSource],
  );
  const sectionAccess = useMemo(
    () => workspaceSectionAccessMap(sourceSelectionErrors, diagnosticsNavErrors),
    [sourceSelectionErrors, diagnosticsNavErrors],
  );
  const sectionCompletion = useMemo(
    () => workspaceSectionCompletionMap(sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, Boolean(exportJob), exportOutcome),
    [sourceSelectionErrors, diagnosticsSucceeded, allValidationErrors, exportJob, exportOutcome],
  );

  useEffect(() => {
    if ((activeSectionId === "diagnostics" || activeSectionId === "options" || activeSectionId === "run") && sourceSelectionErrors.length > 0) {
      setActiveSectionId("source");
    }
  }, [activeSectionId, sourceSelectionErrors.length]);

  async function refreshEnvironment() {
    return withPending("refreshEnvironment", async () => {
      setError(undefined);
      try {
        const [env, candidates] = await Promise.all([getEnvironment(), scanIosBackups()]);
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
        } else if (config.kind === "iosBackup" && config.backupPath.trim()) {
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
      }
    });
  }

  function appendJobLog(event: JobEvent, setJobLogs: Dispatch<SetStateAction<LogLine[]>>) {
    if (event.kind === "progress") return;
    const kind: LogLine["kind"] = event.kind;
    setJobLogs((current) => [
      ...current,
      {
        id: `${event.jobId}-${event.timestamp}-${current.length}`,
        kind,
        text: event.text ?? (event.kind === "exit" ? `进程退出，代码 ${event.code ?? "unknown"}` : ""),
        timestamp: event.timestamp,
      },
    ]);
  }

  function handleJobEvent(event: JobEvent) {
    if (event.kind === "progress") {
      if (
        event.jobId === exportJobIdRef.current &&
        typeof event.current === "number" &&
        typeof event.total === "number"
      ) {
        setExportProgressCounts({ current: event.current, total: event.total });
      }
      return;
    }

    if (event.jobId === diagnosticJobIdRef.current) {
      appendJobLog(event, setDiagnosticLogs);
    } else if (event.jobId === exportJobIdRef.current) {
      appendJobLog(event, setExportLogs);
    } else if (activeLogJobIdRef.current && event.jobId !== activeLogJobIdRef.current) {
      return;
    }

    if (event.kind === "exit" || event.kind === "error") {
      const nextOutcome = terminalOutcome(event, cancelRequestedJobIdRef.current === event.jobId);
      setRunningJobId(undefined);
      if (event.jobId === diagnosticJobIdRef.current) {
        setDiagnosticOutcome(nextOutcome);
        const succeeded = event.kind === "exit" && event.code === 0 && cancelRequestedJobIdRef.current !== event.jobId;
        setDiagnosticsSucceeded(succeeded);
        if (succeeded) refreshDiagnosticDetails();
      }
      if (event.jobId === exportJobIdRef.current) {
        setExportOutcome(nextOutcome);
        if (nextOutcome.kind === "succeeded") {
          recordSuccessfulExport();
        }
      }
      if (autoClearPasswordRef.current) {
        clearPassword();
      }
      if (cancelRequestedJobIdRef.current === event.jobId) cancelRequestedJobIdRef.current = undefined;
    }
  }

  async function chooseBackupPath() {
    return withPending("chooseBackup", async () => {
      const selected = await pickDirectory(config.backupPath || environment?.defaultBackupRoots[0], config.kind === "macosChatDb" ? "sourceFile" : "backup");
      if (!selected) return;
      if (config.kind === "macosChatDb") {
        setSelectedBackup(undefined);
        updateConfig({ backupPath: selected, encrypted: false, cleartextPassword: "", conversationFilter: "", conversationId: undefined, conversationIds: undefined });
        return;
      }
      const candidate = await validateBackupPath(selected);
      applyBackup(candidate);
    });
  }

  async function chooseExportPath() {
    return withPending("chooseExport", async () => {
      const selected = await pickDirectory(config.exportPath, "export");
      if (selected) updateConfig({ exportPath: selected });
    });
  }

  async function chooseAttachmentRootPath() {
    return withPending("chooseAttachmentRoot", async () => {
      const selected = await pickDirectory(config.attachmentRoot, "attachmentRoot");
      if (selected) updateConfig({ attachmentRoot: selected });
    });
  }

  async function chooseContactsPath() {
    return withPending("chooseContactsPath", async () => {
      const selected = await pickDirectory(config.contactsPath, "contactsFile");
      if (selected) updateConfig({ contactsPath: selected });
    });
  }

  async function generateArchiveExportPath() {
    return withPending("generateExport", async () => {
      setError(undefined);
      const label =
        (config.archiveNameMode ?? "conversationTimestamp") === "timestamp"
          ? undefined
          : archiveLabelForConversation(config.conversationFilter, conversations, config.conversationId, config.conversationIds);
      const sequence = timestampedArchiveSequence({
        exportPath: config.exportPath,
        backupPath: config.backupPath,
        label,
      });

      try {
        const nextPath = await nextAvailableArchivePath(sequence.stem, sequence.startSuffix, generatedArchivePathsRef.current);
        generatedArchivePathsRef.current.add(nextPath);
        updateConfig({ exportPath: nextPath });
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function applyPreset(presetId: ExportPresetId) {
    setConfig((current) => applyExportPreset(current, presetId));
  }

  function applyBackup(candidate: BackupCandidate) {
    setSelectedBackup(candidate);
    setConfig((current) => ({
      ...current,
      kind: "iosBackup",
      backupPath: candidate.path,
      attachmentRoot: "",
      contactsPath: "",
      encrypted: candidate.encrypted ?? current.encrypted,
      conversationFilter: "",
      conversationId: undefined,
      conversationIds: undefined,
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
    return withPending("startDiagnostics", async () => {
      setError(undefined);
      if (runningJobId) {
        setError("另一个任务正在运行，请等待完成或先取消。");
        return;
      }
      setDiagnosticLogs([]);
      setDiagnosticDetails(undefined);
      setDiagnosticOutcome({ kind: "idle" });
      cancelRequestedJobIdRef.current = undefined;
      const blockers = sourceDiagnosticsBlockers(config, selectedBackup, environment, sourceInspection, checkingSource);
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
        setDiagnosticOutcome({ kind: "running" });
        setDiagnosticsSucceeded(false);
        setActiveSectionId("diagnostics");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function startExportJob() {
    return withPending("startExport", async () => {
      setError(undefined);
      if (runningJobId) {
        setError("另一个任务正在运行，请等待完成或先取消。");
        return;
      }

      const normalized = normalizeConfig(resolveConversationSelection(config, conversations));
      let latestExportPathStatus = exportPathStatus;
      if (normalized.exportPath.trim()) {
        try {
          latestExportPathStatus = await inspectExportPath(normalized.exportPath);
          setExportPathStatus(latestExportPathStatus);
        } catch (err) {
          latestExportPathStatus = {
            path: normalized.exportPath,
            exists: false,
            isDirectory: false,
            parentExists: false,
            pathLength: normalized.exportPath.length,
            containsHtml: false,
            containsTxt: false,
            containsAttachments: false,
            interruptedExports: [],
            warnings: ["无法检查输出目录，请重新选择或确认权限。"],
            error: String(err),
          };
          setExportPathStatus(latestExportPathStatus);
        }
      }

      const errors = [
        ...sourceSelectionBlockers(normalized, selectedBackup, sourceInspection, checkingSource),
        ...validateExportConfig(normalized),
        ...blockingExportPathErrors(latestExportPathStatus),
        ...environmentExportBlockers(environment),
      ];
      if (errors.length) {
        setError(errors.join(" "));
        return;
      }
      if (needsExportPathConfirmation(latestExportPathStatus)) {
        const interruptedCount = latestExportPathStatus?.interruptedExports.length ?? 0;
        const message =
          interruptedCount > 0
            ? "检测到上次未完成导出的临时目录。带断点记录且设置一致的会自动续写；旧半成品会保留供取回或删除。确认继续？"
            : "输出目录已有内容或疑似旧导出文件。继续导出会把新结果写入同一个目录，是否继续？";
        const ok = window.confirm(tx(message));
        if (!ok) return;
      }

      try {
        setExportLogs([]);
        setExportProgressCounts(undefined);
        setExportOutcome({ kind: "idle" });
        cancelRequestedJobIdRef.current = undefined;
        const job = await startExport(normalized);
        const selectedConversation = selectedConversationForExport(normalized, conversations);
        setExportJob(job);
        exportJobIdRef.current = job.jobId;
        activeExportHistoryDraftRef.current = {
          id: job.jobId,
          exportPath: normalized.exportPath,
          format: normalized.format,
          conversationLabel: selectedConversation?.title ?? normalized.conversationFilter,
          messageCount: selectedConversation?.messageCount,
        };
        activeLogJobIdRef.current = job.jobId;
        setRunningJobId(job.jobId);
        setExportOutcome({ kind: "running" });
        setActiveSectionId("run");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function openOutputPath() {
    return withPending("openOutput", async () => {
      setError(undefined);
      try {
        await openPath(config.exportPath);
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function deleteInterruptedExportPath(path: string) {
    setDeletingInterruptedExportTarget(path);
    try {
      return await withPending("deleteInterruptedExport", async () => {
        setError(undefined);
        try {
          await deleteInterruptedExport(path);
          if (config.exportPath.trim()) {
            setExportPathStatus(await inspectExportPath(config.exportPath));
          }
        } catch (err) {
          setError(String(err));
        }
      });
    } finally {
      setDeletingInterruptedExportTarget(undefined);
    }
  }

  async function openFirstResultFile() {
    return withPending("openFirstResult", async () => {
      setError(undefined);
      try {
        await openFirstResult(config.exportPath, config.format);
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function stopActiveJob() {
    if (!runningJobId) return;
    return withPending("cancelJob", async () => {
      const jobId = runningJobId;
      cancelRequestedJobIdRef.current = jobId;
      try {
        await cancelJob(jobId);
      } catch (err) {
        if (cancelRequestedJobIdRef.current === jobId) cancelRequestedJobIdRef.current = undefined;
        setError(String(err));
      }
    });
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

  async function searchJsonlResults(query: string) {
    try {
      return await searchJsonlResult(config.exportPath, query, 20);
    } catch (err) {
      setError(String(err));
      return [];
    }
  }

  function recordSuccessfulExport() {
    const draft = activeExportHistoryDraftRef.current;
    if (!draft) return;
    setExportHistory(recordExportHistory({ ...draft, finishedAt: new Date().toISOString() }));
    activeExportHistoryDraftRef.current = undefined;
  }

  async function refreshDiagnosticDetails() {
    try {
      setDiagnosticDetails(await inspectDiagnostics(sourceRef.current ?? source));
    } catch (err) {
      console.warn("Could not read structured diagnostics", err);
    }
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
      setUpdateState({ kind: "failed", source: "check", message: String(err) });
    }
  }

  async function installUpdate() {
    return withPending("installUpdate", async () => {
      if (updateState.kind !== "available") return;
      if (runningJobId) {
        setError("任务运行中不能安装更新；请先等待完成或取消任务。");
        return;
      }
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
        setUpdateState({ kind: "failed", source: "install", message: String(err) });
      }
    });
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
          running={Boolean(runningJobId)}
          language={language}
          onLanguageChange={setLanguage}
          theme={theme}
          onThemeChange={setTheme}
          onOpenOnboarding={openOnboarding}
          onboardingButtonRef={onboardingTriggerRef}
          onOpenAbout={openAbout}
          aboutButtonRef={aboutTriggerRef}
          onOpenEnvironmentDetails={openEnvironmentDetails}
          environmentDetailsButtonRef={environmentDetailsTriggerRef}
        />

        {error ? (
          <div className="notice error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {updateNoticeInfo ? (
          <div className="notice update" role="status">
            <Download size={18} />
            <span>
              发现新版本 {updateNoticeInfo.version ?? "unknown"}，当前版本 {updateNoticeInfo.currentVersion ?? appDiagnostics?.version ?? "unknown"}。
            </span>
            <div className="notice-actions">
              <button className="primary-button compact" type="button" onClick={installUpdate} disabled={isPending("installUpdate")} aria-busy={isPending("installUpdate") || undefined}>
                {isPending("installUpdate") ? <Loader2 className="spin" size={15} /> : null}
                下载并安装
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setDismissedUpdateVersion(updateNoticeInfo.version)}
                aria-label="稍后提醒"
                title="稍后提醒"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ) : null}

        {activeSectionId === "source" && (
          <SourceStep
            backups={backups}
            selectedBackup={selectedBackup}
            config={config}
            environment={environment}
            sourceInspection={sourceInspection}
            checkingSource={checkingSource}
            choosingBackup={isPending("chooseBackup")}
            choosingAttachmentRoot={isPending("chooseAttachmentRoot")}
            choosingContactsPath={isPending("chooseContactsPath")}
            refreshingEnvironment={isPending("refreshEnvironment")}
            startingDiagnostics={isPending("startDiagnostics")}
            diagnosticsSucceeded={diagnosticsSucceeded}
            onChooseBackup={chooseBackupPath}
            onChooseAttachmentRoot={chooseAttachmentRootPath}
            onChooseContactsPath={chooseContactsPath}
            onSelectBackup={applyBackup}
            onChange={updateConfig}
            onClearPassword={clearPassword}
            onRunDiagnostics={startDiagnostics}
            onRefreshEnvironment={refreshEnvironment}
          />
        )}

        {activeSectionId === "diagnostics" && (
          <DiagnosticsStep
            logs={diagnosticLogs}
            diagnostics={diagnostics}
            job={diagnosticJob}
            config={config}
            language={language}
            backup={selectedBackup}
            sourceInspection={sourceInspection}
            environment={environment}
            running={diagnosticsRunning}
            startingDiagnostics={isPending("startDiagnostics")}
            cancelling={isPending("cancelJob")}
            outcome={diagnosticOutcome}
            canContinue={diagnosticsSucceeded}
            onRunDiagnostics={startDiagnostics}
            onCancel={stopActiveJob}
            onNext={() => setActiveSectionId("options")}
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
            exportPathStatus={exportPathStatus}
            checkingExportPath={checkingExportPath}
            choosingExport={isPending("chooseExport")}
            generatingExportPath={isPending("generateExport")}
            startingExport={isPending("startExport")}
            conversations={conversations}
            loadingConversations={loadingConversations}
            conversationError={conversationError}
            diagnosticDetails={diagnosticDetails}
            onChange={updateConfig}
            onChooseExport={chooseExportPath}
            onGenerateExport={generateArchiveExportPath}
            onApplyPreset={applyPreset}
            onOpenPath={(path) => openPath(path).catch((err) => setError(String(err)))}
            deletingInterruptedExportPath={deletingInterruptedExportTarget}
            onDeleteInterruptedExport={deleteInterruptedExportPath}
            onStart={startExportJob}
          />
        )}

        {activeSectionId === "run" && (
          <RunStep
            logs={exportLogs}
            progressCounts={exportProgressCounts}
            hasExportTask={Boolean(exportJob)}
            running={exportRunning}
            startDisabled={exportStartDisabled}
            outcome={exportOutcome}
            config={config}
            exportPathStatus={exportPathStatus}
            exportHistory={exportHistory}
            conversations={conversations}
            startingExport={isPending("startExport")}
            cancelling={isPending("cancelJob")}
            openingOutput={isPending("openOutput")}
            openingFirstResult={isPending("openFirstResult")}
            onStart={startExportJob}
            onCancel={stopActiveJob}
            onBackToOptions={() => setActiveSectionId("options")}
            onBackToSource={() => setActiveSectionId("source")}
            onOpenOutput={openOutputPath}
            onOpenHistoryPath={(path) => openPath(path).catch((err) => setError(String(err)))}
            onOpenFirstResult={openFirstResultFile}
            onSearchJsonl={searchJsonlResults}
          />
        )}
      </section>

      {showOnboarding ? (
        <OnboardingDialog
          backup={selectedBackup}
          config={config}
          diagnosticsSucceeded={diagnosticsSucceeded}
          diagnosticsBlockers={sourceDiagnosticsBlockers(config, selectedBackup, environment, sourceInspection, checkingSource)}
          choosingBackup={isPending("chooseBackup")}
          startingDiagnostics={isPending("startDiagnostics")}
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
          onInstallUpdate={installUpdate}
          onOpenResource={(file) => openResourceFile(file).catch((err) => setError(String(err)))}
          onClose={closeAbout}
        />
      ) : null}
      {showEnvironmentDetails ? (
        <EnvironmentDialog
          environment={environment}
          settingsSaveState={settingsSaveState}
          refreshingEnvironment={isPending("refreshEnvironment")}
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

function archiveLabelForConversation(conversationFilter?: string, conversations: ConversationCandidate[] = [], conversationId?: number, conversationIds?: number[]): string | undefined {
  const selected = selectedConversationForExport({ conversationFilter, conversationId, conversationIds }, conversations);
  if (selected) return selected.title;
  const filter = conversationFilter?.trim();
  return filter || undefined;
}

function selectedConversationForExport(
  selection: Pick<ExportConfig, "conversationFilter" | "conversationId" | "conversationIds">,
  conversations: ConversationCandidate[] = [],
): ConversationCandidate | undefined {
  if (selection.conversationIds?.length) {
    const selected = conversations.find((conversation) => sameConversationIds(conversation.chatIds, selection.conversationIds));
    if (selected) return selected;
  }
  if (selection.conversationId !== undefined) {
    const selected = conversations.find((conversation) => Number(conversation.id) === selection.conversationId);
    if (selected) return selected;
  }
  const filter = selection.conversationFilter?.trim();
  if (!filter) return undefined;
  return conversations.find((conversation) => conversation.filterValue === filter);
}

function sameConversationIds(left: number[] = [], right: number[] = []): boolean {
  const leftSorted = [...left].sort((a, b) => a - b);
  const rightSorted = [...right].sort((a, b) => a - b);
  if (leftSorted.length !== rightSorted.length) return false;
  return leftSorted.every((value, index) => value === rightSorted[index]);
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
  if (!environment) return [];
  return [];
}

function workspaceSectionAccessMap(
  sourceErrors: string[],
  diagnosticsErrors: string[],
): Record<WorkspaceSectionId, WorkspaceSectionAccess> {
  const sourceReason = sourceErrors[0];
  return {
    source: { disabled: false },
    diagnostics: sourceReason ? { disabled: true, reason: sourceReason } : diagnosticsErrors[0] ? { disabled: true, reason: diagnosticsErrors[0] } : { disabled: false },
    options: sourceReason ? { disabled: true, reason: sourceReason } : { disabled: false },
    run: sourceReason ? { disabled: true, reason: sourceReason } : { disabled: false },
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
