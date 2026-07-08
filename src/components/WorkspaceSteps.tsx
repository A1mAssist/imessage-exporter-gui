import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  CalendarDays,
  CheckCircle2,
  CircleStop,
  Database,
  ExternalLink,
  FileArchive,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  MessagesSquare,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  TerminalSquare,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  Badge,
  CopyButton,
  DiagnosticReportActions,
  DiagnosticTile,
  Fact,
  FooterActions,
  Header,
  JobOutcomeNotice,
  PathField,
  SegmentedControl,
  jobOutcomeLabel,
  resultStripClass,
} from "./CommonUi";
import type { JobOutcome } from "./CommonUi";
import { ConversationPicker, DateRangeField } from "./ExportOptionFields";
import { compactPath } from "./ShellPanels";
import { localizeMultiline } from "../i18n";
import { buildDiagnosticReport } from "../lib/diagnosticReport";
import { archiveNameModes, copyMethods, exportFormats, filenameModes } from "../lib/exportConfig";
import { summarizeDiagnostics } from "../lib/diagnostics";
import { exportPresets } from "../lib/exportPresets";
import type { ExportPresetId } from "../lib/exportPresets";
import { exportProgress, exportProgressTiming, summarizeExportResult } from "../lib/exportSummary";
import type { ExportProgress, ExportSummary } from "../lib/exportSummary";
import type {
  BackupCandidate,
  ConversationCandidate,
  DiagnosticDetails,
  EnvironmentStatus,
  ExportConfig,
  ExportHistoryEntry,
  ExportPathStatus,
  JobStarted,
  JobProgress,
  JsonlSearchMatch,
  LogLine,
  SourceInspection,
} from "../types";

export function blockingExportPathErrors(status?: ExportPathStatus): string[] {
  if (!status) return [];
  if (status.error) return [status.error];
  if (status.exists && !status.isDirectory) return ["输出路径已存在，但它不是文件夹。"];
  if (!status.parentExists) return ["输出目录的上级目录不存在，请重新选择。"];
  if (status.writable === false) return ["输出目录不可写，请选择有写入权限的新文件夹。"];
  return [];
}

export function needsExportPathConfirmation(status?: ExportPathStatus): boolean {
  if (!status) return false;
  if (status.interruptedExports.length > 0) return true;
  if (!status.exists || !status.isDirectory) return false;
  return Boolean((status.entryCount ?? 0) > 0 || status.containsHtml || status.containsTxt || status.containsAttachments);
}

const sourceKindOptions: Array<{ value: ExportConfig["kind"]; label: string; description: string }> = [
  { value: "iosBackup", label: "iOS 备份", description: "Apple Devices 或 iTunes 本地备份。" },
  { value: "macosChatDb", label: "macOS chat.db", description: "直接读取 Messages 的 chat.db 文件。" },
];


export function SourceStep({
  backups,
  selectedBackup,
  config,
  environment,
  sourceInspection,
  checkingSource,
  choosingBackup,
  choosingAttachmentRoot,
  choosingContactsPath,
  refreshingEnvironment,
  startingDiagnostics,
  diagnosticsSucceeded,
  onChooseBackup,
  onChooseAttachmentRoot,
  onChooseContactsPath,
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
  sourceInspection?: SourceInspection;
  checkingSource: boolean;
  choosingBackup?: boolean;
  choosingAttachmentRoot?: boolean;
  choosingContactsPath?: boolean;
  refreshingEnvironment?: boolean;
  startingDiagnostics?: boolean;
  diagnosticsSucceeded: boolean;
  onChooseBackup: () => void;
  onChooseAttachmentRoot: () => void;
  onChooseContactsPath: () => void;
  onSelectBackup: (backup: BackupCandidate) => void;
  onChange: (patch: Partial<ExportConfig>) => void;
  onClearPassword: () => void;
  onRunDiagnostics: () => void;
  onRefreshEnvironment: () => void;
}) {
  const diagnosticsBlockers = sourceDiagnosticsBlockers(config, selectedBackup, environment, sourceInspection, checkingSource);
  const canRunDiagnostics = diagnosticsBlockers.length === 0;

  return (
    <div className="page">
      <Header eyebrow="数据准备" title={config.kind === "macosChatDb" ? "选择 macOS chat.db" : "选择 iOS 备份"} description="选择 Messages 数据源，不修改原始数据。" />

      <FirstRunGuide
        backup={selectedBackup}
        config={config}
        diagnosticsSucceeded={diagnosticsSucceeded}
        diagnosticsBlockers={diagnosticsBlockers}
        choosingBackup={choosingBackup}
        startingDiagnostics={startingDiagnostics}
        onChooseBackup={onChooseBackup}
        onRunDiagnostics={onRunDiagnostics}
      />

      <ReadinessBand
        backup={selectedBackup}
        config={config}
        environment={environment}
        sourceInspection={sourceInspection}
        checkingSource={checkingSource}
        refreshing={refreshingEnvironment}
        onRefresh={onRefreshEnvironment}
      />

      <SegmentedControl
        label="数据源"
        value={config.kind}
        options={sourceKindOptions}
        onChange={(kind) => onChange({ kind, backupPath: "", attachmentRoot: "", contactsPath: "", encrypted: false, cleartextPassword: "", conversationFilter: "", conversationId: undefined, conversationIds: undefined })}
      />

      <div className="toolbar">
        <PathField label={config.kind === "macosChatDb" ? "chat.db 文件" : "备份根目录"} value={config.backupPath} onBrowse={onChooseBackup} loading={choosingBackup} />
      </div>

      {config.kind === "macosChatDb" ? (
        <section className="content-band form-grid">
          <PathField label="附件根目录（可选）" value={config.attachmentRoot ?? ""} onBrowse={onChooseAttachmentRoot} loading={choosingAttachmentRoot} />
          <PathField label="联系人数据库（可选）" value={config.contactsPath ?? ""} onBrowse={onChooseContactsPath} loading={choosingContactsPath} />
          <p className="muted">chat.db 从别的 Mac 拷出时，可以把 Messages 附件目录和 AddressBook 数据库一并指定给内置引擎。</p>
        </section>
      ) : null}

      {config.kind === "iosBackup" ? (
        <section className="content-band">
        <div className="section-heading">
          <h2>自动发现</h2>
          <p>常见 MobileSync Backup 目录中的候选备份。</p>
        </div>
        <div className="backup-grid">
          {backups.length ? (
            backups.map((backup) => {
              const checkingThisBackup = checkingSource && backup.path === selectedBackup?.path;
              return (
              <button
                className={`backup-card ${backup.path === selectedBackup?.path ? "selected" : ""}`}
                key={backup.path}
                onClick={() => onSelectBackup(backup)}
                type="button"
              >
                {checkingThisBackup ? <Loader2 className="spin" size={21} /> : <HardDrive size={21} />}
                <span>
                  <strong>{backup.displayName}</strong>
                  <small>{backup.path}</small>
                </span>
                <Badge tone={backup.valid ? "ok" : "warn"}>{backup.valid ? "有效" : "不完整"}</Badge>
              </button>
              );
            })
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
      ) : null}

      <section className="content-band two-columns">
        <div>
          <div className="section-heading">
            <h2>{config.kind === "macosChatDb" ? "数据库状态" : "备份状态"}</h2>
          </div>
          <div className="fact-list">
            {config.kind === "iosBackup" ? (
              <>
                <Fact label="Manifest.db" value={selectedBackup?.hasManifestDb ? "存在" : "未确认"} />
                <Fact label="Info.plist" value={selectedBackup?.hasInfoPlist ? "存在" : "未确认"} />
                <Fact label="加密" value={config.encrypted ? "是" : "否或未知"} />
              </>
            ) : (
              <Fact label="chat.db" value={config.backupPath ? "已选择" : "未选择"} />
            )}
            <Fact label="Messages DB" value={checkingSource ? "检查中" : sourceInspection?.ready ? "可读取" : sourceInspection?.error ? "不可读取" : "未检查"} />
            {sourceInspection?.messageCount !== undefined ? <Fact label="消息数" value={sourceInspection.messageCount.toLocaleString()} /> : null}
            {sourceInspection?.chatCount !== undefined ? <Fact label="会话数" value={sourceInspection.chatCount.toLocaleString()} /> : null}
            {sourceInspection?.attachmentCount !== undefined ? <Fact label="附件" value={`${sourceInspection.attachmentCount.toLocaleString()} 个 · ${formatBytes(sourceInspection.attachmentBytes ?? 0)}`} /> : null}
          </div>
        </div>
        <div>
          {config.kind === "iosBackup" ? (
            <label className="checkbox-row">
              <input type="checkbox" checked={config.encrypted} onChange={(event) => onChange({ encrypted: event.target.checked })} />
              <span>这是加密 iOS 备份</span>
            </label>
          ) : null}
          {config.kind === "iosBackup" && config.encrypted ? (
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
                密码只在本次任务中传给内置导出引擎，日志会脱敏。
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
        primaryLoading={startingDiagnostics || checkingSource}
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
  diagnosticsSucceeded,
  diagnosticsBlockers,
  choosingBackup,
  startingDiagnostics,
  onChooseBackup,
  onRunDiagnostics,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  diagnosticsSucceeded: boolean;
  diagnosticsBlockers: string[];
  choosingBackup?: boolean;
  startingDiagnostics?: boolean;
  onChooseBackup: () => void;
  onRunDiagnostics: () => void;
}) {
  const sourceReady = config.kind === "macosChatDb" ? Boolean(config.backupPath.trim()) : Boolean(config.backupPath.trim() && backup?.valid);
  const passwordReady = !config.encrypted || Boolean(config.cleartextPassword?.trim());
  const canRunDiagnostics = diagnosticsBlockers.length === 0;
  const items: Array<{ label: string; detail: string; done: boolean; actions: ReactNode }> = [
    {
      label: config.kind === "macosChatDb" ? "选择 macOS chat.db" : "选择 iOS 备份",
      detail: sourceReady
        ? config.kind === "macosChatDb"
          ? "chat.db 已选择"
          : backup?.displayName ?? "备份目录已就绪"
        : config.kind === "macosChatDb"
          ? "选择 Messages 的 chat.db 文件"
          : "选择包含 Manifest.db 和 Info.plist 的 iOS 备份根目录",
      done: sourceReady && passwordReady,
      actions: (
        <button className="ghost-button" type="button" onClick={onChooseBackup} disabled={choosingBackup} aria-busy={choosingBackup || undefined}>
          {choosingBackup ? <Loader2 className="spin" size={15} /> : <Database size={15} />}
          选择
        </button>
      ),
    },
    {
      label: "运行诊断",
      detail: diagnosticsSucceeded ? "诊断已通过，可以继续设置导出选项" : "确认数据库、附件、联系人和转换器状态",
      done: diagnosticsSucceeded,
      actions: (
        <button className="ghost-button" type="button" onClick={onRunDiagnostics} disabled={!canRunDiagnostics || startingDiagnostics} aria-busy={startingDiagnostics || undefined}>
          {startingDiagnostics ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
          运行
        </button>
      ),
    },
  ];

  return (
    <section className="content-band first-run-guide" aria-label="首次导出路线">
      <div className="section-heading">
        <div>
          <h2>首次导出路线</h2>
          <p>按这个顺序准备备份、确认诊断，再进入导出选项。</p>
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

export function sourceDiagnosticsBlockers(
  config: ExportConfig,
  backup?: BackupCandidate,
  environment?: EnvironmentStatus,
  sourceInspection?: SourceInspection,
  checkingSource = false,
): string[] {
  const blockers: string[] = [];

  if (!environment?.exporterAvailable) blockers.push("内置导出引擎暂未就绪，暂时不能运行诊断。");
  blockers.push(...sourceSelectionBlockers(config, backup, sourceInspection, checkingSource));
  if (config.encrypted && !config.cleartextPassword?.trim()) blockers.push("加密备份需要输入密码。");

  return blockers;
}

export function sourceSelectionBlockers(config: ExportConfig, backup?: BackupCandidate, sourceInspection?: SourceInspection, checkingSource = false): string[] {
  const blockers: string[] = [];

  if (!config.backupPath.trim()) {
    blockers.push(config.kind === "macosChatDb" ? "请选择 macOS chat.db 文件。" : "请选择 iOS 备份根目录。");
  } else if (config.kind === "iosBackup" && !backup?.valid) {
    blockers.push("备份目录需要同时包含 Manifest.db 和 Info.plist。");
  } else if (checkingSource) {
    blockers.push("正在检查 Messages 数据库，请稍候。");
  } else if (sourceInspection && !sourceInspection.ready) {
    blockers.push(sourceInspection.error ?? "Messages 数据库暂不可读取。");
  }

  return blockers;
}

function ReadinessBand({
  backup,
  config,
  environment,
  sourceInspection,
  checkingSource,
  refreshing,
  onRefresh,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  sourceInspection?: SourceInspection;
  checkingSource: boolean;
  refreshing?: boolean;
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
      key: "backup",
      label: config.kind === "macosChatDb" ? "chat.db 文件" : "备份目录",
      detail: !config.backupPath.trim()
        ? "未选择"
        : config.kind === "macosChatDb"
          ? compactPath(config.backupPath)
          : backup?.valid
          ? backup.displayName
          : "需要包含 Manifest.db 和 Info.plist",
      tone: !config.backupPath.trim() ? "neutral" : config.kind === "macosChatDb" || backup?.valid ? "ok" : "warn",
      icon: config.kind === "macosChatDb" || backup?.valid ? <CheckCircle2 size={17} /> : <HardDrive size={17} />,
    },
    {
      key: "messages-db",
      label: "Messages 数据",
      detail: checkingSource
        ? "正在检查数据库"
        : sourceInspection?.ready
          ? `${sourceInspection.messageCount?.toLocaleString() ?? 0} 条消息`
          : sourceInspection?.error ?? "等待备份目录确认",
      tone: sourceInspection?.ready ? "ok" : checkingSource ? "neutral" : "warn",
      icon: sourceInspection?.ready ? <CheckCircle2 size={17} /> : <Database size={17} />,
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
        <button className="ghost-button" type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined}>
          {refreshing ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
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
  config,
  backup,
  sourceInspection,
  environment,
  canContinue,
}: {
  diagnostics: ReturnType<typeof summarizeDiagnostics>;
  config: ExportConfig;
  backup?: BackupCandidate;
  sourceInspection?: SourceInspection;
  environment?: EnvironmentStatus;
  canContinue: boolean;
}) {
  const diagnosticFindings = Object.values(diagnostics);
  const hasDiagnosticOutput = diagnosticFindings.some((finding) => finding.status !== "unknown");
  const hasDiagnosticWarning = diagnosticFindings.some((finding) => finding.status === "warn");
  const convertersReady = Boolean(environment?.ffmpegAvailable && environment?.imagemagickAvailable);
  const sourceReady = config.kind === "macosChatDb" ? Boolean(sourceInspection?.ready) : Boolean(backup?.valid);
  const diagnosticDetail = canContinue ? "诊断已通过，可以继续设置导出选项。" : hasDiagnosticOutput ? "诊断已完成，但仍有项目需要处理。" : "运行诊断后会汇总检查结果。";
  const items: Array<{ label: string; value: string; detail: string; tone: "ok" | "warn" | "error" | "neutral"; icon: ReactNode }> = [
    {
      label: config.kind === "macosChatDb" ? "chat.db 文件" : "备份目录",
      value: sourceReady ? "已就绪" : "未就绪",
      detail: sourceReady
        ? config.kind === "macosChatDb"
          ? `${sourceInspection?.messageCount?.toLocaleString() ?? 0} 条消息`
          : backup?.displayName ?? "备份目录已就绪"
        : config.kind === "macosChatDb"
          ? "需要可读取的 macOS chat.db 文件"
          : "需要有效的 iOS 备份根目录",
      tone: sourceReady ? "ok" : "warn",
      icon: <Database size={17} />,
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

export function DiagnosticsStep({
  logs,
  diagnostics,
  job,
  config,
  language,
  backup,
  sourceInspection,
  environment,
  running,
  startingDiagnostics,
  cancelling,
  outcome,
  canContinue,
  onRunDiagnostics,
  onCancel,
  onNext,
  onChooseBackup,
  onBackToSource,
}: {
  logs: LogLine[];
  diagnostics: ReturnType<typeof summarizeDiagnostics>;
  job?: JobStarted;
  config: ExportConfig;
  language: "en" | "zh-CN";
  backup?: BackupCandidate;
  sourceInspection?: SourceInspection;
  environment?: EnvironmentStatus;
  running: boolean;
  startingDiagnostics?: boolean;
  cancelling?: boolean;
  outcome: JobOutcome;
  canContinue: boolean;
  onRunDiagnostics: () => void;
  onCancel: () => void;
  onNext: () => void;
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
          sourceInspection,
          config,
          diagnostics,
          logs,
          secrets: [config.cleartextPassword],
        }),
      ),
    [backup, config, diagnostics, environment, language, logs, sourceInspection],
  );

  return (
    <div className="page">
      <Header eyebrow="诊断检查" title="诊断备份" description="先让 imessage-exporter 检查数据库、附件、联系人和转换器状态。" />
      <DiagnosticSummaryPanel diagnostics={diagnostics} config={config} backup={backup} sourceInspection={sourceInspection} environment={environment} canContinue={canContinue} />
      <div className="diagnostic-grid">
        <DiagnosticTile label="数据库" status={diagnostics.database} />
        <DiagnosticTile label="附件" status={diagnostics.attachments} />
        <DiagnosticTile label="联系人" status={diagnostics.contacts} />
        <DiagnosticTile label="转换器" status={diagnostics.converters} />
      </div>
      <DiagnosticReportActions report={report} disabled={!logs.length} />
      <JobOutcomeNotice
        outcome={outcome}
        context="diagnostics"
        logs={logs}
        actions={{
          onChooseBackup,
          onBackToSource,
          onRetry: onRunDiagnostics,
        }}
      />
      <FooterActions
        secondaryLabel={running ? "取消诊断" : "重新诊断"}
        secondaryIcon={running ? <CircleStop size={17} /> : <RefreshCcw size={17} />}
        onSecondary={running ? onCancel : onRunDiagnostics}
        secondaryLoading={running ? cancelling : startingDiagnostics}
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

export function OptionsStep({
  config,
  environment,
  warnings,
  errors,
  exportPathStatus,
  checkingExportPath,
  choosingExport,
  generatingExportPath,
  startingExport,
  conversations,
  loadingConversations,
  conversationError,
  diagnosticDetails,
  onChange,
  onChooseExport,
  onGenerateExport,
  onApplyPreset,
  onOpenPath,
  deletingInterruptedExportPath,
  onDeleteInterruptedExport,
  onStart,
}: {
  config: ExportConfig;
  environment?: EnvironmentStatus;
  warnings: string[];
  errors: string[];
  exportPathStatus?: ExportPathStatus;
  checkingExportPath: boolean;
  choosingExport?: boolean;
  generatingExportPath?: boolean;
  startingExport?: boolean;
  conversations: ConversationCandidate[];
  loadingConversations: boolean;
  conversationError?: string;
  diagnosticDetails?: DiagnosticDetails;
  onChange: (patch: Partial<ExportConfig>) => void;
  onChooseExport: () => void;
  onGenerateExport: () => void;
  onApplyPreset: (presetId: ExportPresetId) => void;
  onOpenPath: (path: string) => void;
  deletingInterruptedExportPath?: string;
  onDeleteInterruptedExport: (path: string) => void;
  onStart: () => void;
}) {
  const selectedConversation = selectedConversationForConfig(config, conversations);
  const handlesAttachments = config.format === "html";

  return (
    <div className="page">
      <Header eyebrow="导出设置" title="设置导出选项" description="选择输出格式、附件复制策略、日期范围和会话筛选。" />

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
        <PathField label="输出目录" value={config.exportPath} onBrowse={onChooseExport} loading={choosingExport} />
        <div className="inline-actions">
          <button className="ghost-button" type="button" onClick={onGenerateExport} disabled={generatingExportPath} aria-busy={generatingExportPath || undefined}>
            {generatingExportPath ? <Loader2 className="spin" size={15} /> : <Archive size={15} />}
            新建归档目录
          </button>
          <small>{archivePathHint(config, selectedConversation)}</small>
        </div>
        <ExportPathNotice
          status={exportPathStatus}
          checking={checkingExportPath}
          onOpenPath={onOpenPath}
          deletingInterruptedExportPath={deletingInterruptedExportPath}
          onDeleteInterruptedExport={onDeleteInterruptedExport}
        />
        <SegmentedControl
          label="格式"
          value={config.format}
          options={exportFormats}
          onChange={(format) => onChange(format === "html" ? { format, copyMethod: "clone" } : { format, copyMethod: "disabled", noLazy: false })}
        />
        <SegmentedControl label="文件命名" value={config.filenameMode ?? "contactName"} options={filenameModes} onChange={(filenameMode) => onChange({ filenameMode })} />
        <SegmentedControl label="新建总目录命名" value={config.archiveNameMode ?? "conversationTimestamp"} options={archiveNameModes} onChange={(archiveNameMode) => onChange({ archiveNameMode })} />
        {handlesAttachments ? (
          <SegmentedControl
            label="附件"
            value={config.copyMethod}
            options={copyMethods}
            onChange={(copyMethod) => onChange({ copyMethod })}
          />
        ) : (
          <p className="muted">TXT 和 JSONL 只写文本/结构化记录，不处理附件文件。</p>
        )}
        {shouldProcessAttachments(config) ? <p className="muted">HTML 会按会话建立文件夹，HTML 文件和对应附件放在同一个会话文件夹内。</p> : null}
        {warnings.map((warning) => (
          <div className="notice warn" key={warning}>
            <AlertCircle size={17} />
            <span>{warning}</span>
          </div>
        ))}
        {shouldProcessAttachments(config) && config.copyMethod !== "clone" && environment && !environment.ffmpegAvailable ? (
          <p className="muted">clone 不依赖本机转换器；basic/full 需要 ffmpeg 和 ImageMagick。</p>
        ) : null}
      </section>

      <section className="content-band form-grid">
        <DateRangeField config={config} onChange={onChange} />
        <ConversationPicker
          value={config.conversationFilter ?? ""}
          selectedId={config.conversationId}
          conversations={conversations}
          loading={loadingConversations}
          error={conversationError}
          onChange={(conversationFilter, conversationId, conversationIds) => onChange({ conversationFilter, conversationId, conversationIds })}
        />
        <label>
          <span>我的显示名</span>
          <input
            value={config.customName ?? ""}
            disabled={config.useCallerId}
            onChange={(event) => onChange({ customName: event.target.value })}
            placeholder="只影响导出内容里自己的名字"
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
          <span>用 Caller ID 显示我自己</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(config.ignoreDiskWarning)} onChange={(event) => onChange({ ignoreDiskWarning: event.target.checked })} />
          <span>忽略磁盘空间警告</span>
        </label>
      </section>

      <ExportReview
        config={config}
        environment={environment}
        exportPathStatus={exportPathStatus}
        selectedConversation={selectedConversation}
        diagnosticDetails={diagnosticDetails}
      />

      {errors.map((message) => (
        <div className="notice error" key={message}>
          <AlertCircle size={17} />
          <span>{message}</span>
        </div>
      ))}

      <FooterActions
        primaryLabel="开始导出"
        primaryIcon={<Play size={17} />}
        onPrimary={onStart}
        primaryDisabled={errors.length > 0 || checkingExportPath}
        primaryLoading={startingExport || checkingExportPath}
      />
    </div>
  );
}

function ExportReview({
  config,
  environment,
  exportPathStatus,
  selectedConversation,
  diagnosticDetails,
}: {
  config: ExportConfig;
  environment?: EnvironmentStatus;
  exportPathStatus?: ExportPathStatus;
  selectedConversation?: ConversationCandidate;
  diagnosticDetails?: DiagnosticDetails;
}) {
  const notes = exportReviewNotes(config, environment, exportPathStatus, diagnosticDetails);
  const conversationName = conversationExportName(config.conversationFilter, selectedConversation);
  const items: Array<{ label: string; value: string; icon: ReactNode }> = [
    {
      label: "来源",
      value: config.backupPath ? compactPath(config.backupPath) : "未选择",
      icon: <Database size={17} />,
    },
    ...(config.kind === "macosChatDb" && config.attachmentRoot?.trim()
      ? [
          {
            label: "附件根目录",
            value: compactPath(config.attachmentRoot),
            icon: <Archive size={17} />,
          },
        ]
      : []),
    ...(config.kind === "macosChatDb" && config.contactsPath?.trim()
      ? [
          {
            label: "联系人数据库",
            value: compactPath(config.contactsPath),
            icon: <UserRound size={17} />,
          },
        ]
      : []),
    {
      label: "输出",
      value: config.exportPath ? compactPath(config.exportPath) : "未设置",
      icon: <Archive size={17} />,
    },
    {
      label: "格式",
      value: config.format === "html" ? `HTML · 附件 ${config.copyMethod}` : `${config.format.toUpperCase()} · 不导出附件`,
      icon: <FileArchive size={17} />,
    },
    {
      label: "命名",
      value: filenameModeLabel(config),
      icon: <UserRound size={17} />,
    },
    ...(shouldProcessAttachments(config)
      ? [
          {
            label: "新建总目录命名",
            value: archiveNameModeLabel(config),
            icon: <FolderOpen size={17} />,
          },
        ]
      : []),
    ...(diagnosticDetails
      ? [
          {
            label: "数据规模",
            value: `${diagnosticDetails.messages.totalMessages.toLocaleString()} 条 · ${formatBytes(diagnosticDetails.databaseBytes ?? 0)}`,
            icon: <Database size={17} />,
          },
          ...(shouldProcessAttachments(config)
            ? [
                {
                  label: "附件风险",
                  value: diagnosticAttachmentRiskLabel(diagnosticDetails),
                  icon: <Archive size={17} />,
                },
              ]
            : []),
        ]
      : []),
    {
      label: "日期",
      value: dateRangeLabel(config),
      icon: <CalendarDays size={17} />,
    },
    {
      label: "会话",
      value: conversationName,
      icon: <MessagesSquare size={17} />,
    },
    {
      label: "结果文件",
      value: resultFilenameLabel(config, selectedConversation),
      icon: <FileArchive size={17} />,
    },
    {
      label: "我的名字",
      value: displayNameLabel(config),
      icon: <UserRound size={17} />,
    },
  ];

  if (selectedConversation) {
    items.splice(-2, 0, {
      label: "预计导出",
      value: `${selectedConversation.messageCount.toLocaleString()} 条消息 · ${selectedConversation.chatIds.length} 个底层会话`,
      icon: <MessagesSquare size={17} />,
    });
  }

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
  return "默认解析";
}

function selectedConversationForConfig(config: ExportConfig, conversations: ConversationCandidate[] = []): ConversationCandidate | undefined {
  if (config.conversationIds?.length) {
    const selected = conversations.find((conversation) => sameConversationIds(conversation.chatIds, config.conversationIds));
    if (selected) return selected;
  }
  if (config.conversationId !== undefined) {
    const selected = conversations.find((conversation) => Number(conversation.id) === config.conversationId);
    if (selected) return selected;
  }
  return selectedConversationForFilter(config.conversationFilter, conversations);
}

function sameConversationIds(left: number[] = [], right: number[] = []): boolean {
  const leftSorted = [...left].sort((a, b) => a - b);
  const rightSorted = [...right].sort((a, b) => a - b);
  if (leftSorted.length !== rightSorted.length) return false;
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function selectedConversationForFilter(conversationFilter?: string, conversations: ConversationCandidate[] = []): ConversationCandidate | undefined {
  const filter = conversationFilter?.trim();
  if (!filter) return undefined;
  return conversations.find((conversation) => conversation.filterValue === filter);
}

function conversationExportName(conversationFilter?: string, selectedConversation?: ConversationCandidate): string {
  if (selectedConversation) return selectedConversation.title;
  return conversationFilter?.trim() || "全部会话";
}

function resultFilenameLabel(config: ExportConfig, selectedConversation?: ConversationCandidate): string {
  const extension = config.format === "jsonl" ? ".jsonl" : config.format === "txt" ? ".txt" : ".html";
  if ((config.filenameMode ?? "contactName") === "chatIdentifier") return `Caller ID${extension}`;
  if ((config.filenameMode ?? "contactName") === "contactNameWithCallerId") {
    if (selectedConversation) return `${selectedConversation.title} + Caller ID${extension}`;
    if (config.conversationFilter?.trim()) return `匹配会话名 + Caller ID${extension}`;
    return `联系人或群聊名称 + Caller ID${extension}`;
  }
  if (selectedConversation) return `${selectedConversation.title}${extension}`;
  if (config.conversationFilter?.trim()) return `匹配会话名${extension}`;
  return `联系人或群聊名称${extension}`;
}

function filenameModeLabel(config: ExportConfig): string {
  if ((config.filenameMode ?? "contactName") === "chatIdentifier") return "Caller ID";
  if ((config.filenameMode ?? "contactName") === "contactNameWithCallerId") return "联系人名 + Caller ID";
  return "联系人/群聊名";
}

function archiveNameModeLabel(config: ExportConfig): string {
  return (config.archiveNameMode ?? "conversationTimestamp") === "timestamp" ? "仅时间" : "会话 + 时间";
}

function archivePathHint(config: ExportConfig, selectedConversation?: ConversationCandidate): string {
  if ((config.archiveNameMode ?? "conversationTimestamp") === "timestamp") return "生成只带时间戳的新文件夹，避免目录名暴露联系人。";
  if (selectedConversation) return `生成带“${selectedConversation.title}”和时间戳的新文件夹。`;
  return "生成带时间戳的新文件夹，避免导出结果混入旧目录。";
}

function exportReviewNotes(
  config: ExportConfig,
  environment?: EnvironmentStatus,
  exportPathStatus?: ExportPathStatus,
  diagnosticDetails?: DiagnosticDetails,
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
  if (exportPathStatus?.interruptedExports.length) {
    notes.push({
      text: `检测到 ${exportPathStatus.interruptedExports.length} 个未完成导出的 .partial 临时目录；带断点记录且设置一致的会自动续写，旧半成品只保留供取回或删除。`,
      tone: "warn",
    });
  }
  if (shouldProcessAttachments(config) && (config.copyMethod === "basic" || config.copyMethod === "full") && environment) {
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
  if (shouldProcessAttachments(config) && diagnosticDetails?.attachments.missingFiles) {
    notes.push({
      text: `诊断发现 ${diagnosticDetails.attachments.missingFiles.toLocaleString()} 个附件缺失；导出会继续，但对应附件可能无法打开。`,
      tone: "warn",
    });
  }

  return notes;
}

function shouldProcessAttachments(config: ExportConfig): boolean {
  return config.format === "html" && config.copyMethod !== "disabled";
}

function diagnosticAttachmentRiskLabel(details: DiagnosticDetails): string {
  const total = details.attachments.totalAttachments.toLocaleString();
  if (details.attachments.missingFiles) {
    return `${total} 个，缺失 ${details.attachments.missingFiles.toLocaleString()} 个`;
  }
  return `${total} 个 · ${formatBytes(details.attachments.totalBytesReferenced)}`;
}

function presetMatchesConfig(config: ExportConfig, presetId: ExportPresetId): boolean {
  const preset = exportPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return false;
  return config.format === preset.settings.format && config.copyMethod === preset.settings.copyMethod && Boolean(config.noLazy) === preset.settings.noLazy;
}

function ExportPathNotice({
  status,
  checking,
  onOpenPath,
  deletingInterruptedExportPath,
  onDeleteInterruptedExport,
}: {
  status?: ExportPathStatus;
  checking: boolean;
  onOpenPath: (path: string) => void;
  deletingInterruptedExportPath?: string;
  onDeleteInterruptedExport: (path: string) => void;
}) {
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
  const visibleWarnings = status.interruptedExports.length
    ? status.warnings.filter((warning) => !warning.includes(".partial") && !warning.includes("未完成的临时导出目录"))
    : status.warnings;
  const tone = blocking ? "error" : risky || visibleWarnings.length ? "warn" : "ok";
  const summary = exportPathSummary(status);

  return (
    <div className={`path-inspection ${tone}`}>
      {tone === "ok" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>
        <strong>输出目录状态</strong>
        <small>{summary}</small>
        <ExportPathFacts status={status} />
        {visibleWarnings.length ? (
          <ul>
            {visibleWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <InterruptedExports
          exports={status.interruptedExports}
          onOpenPath={onOpenPath}
          deletingInterruptedExportPath={deletingInterruptedExportPath}
          onDeleteInterruptedExport={onDeleteInterruptedExport}
        />
      </span>
    </div>
  );
}

function InterruptedExports({
  exports,
  onOpenPath,
  deletingInterruptedExportPath,
  onDeleteInterruptedExport,
}: {
  exports: string[];
  onOpenPath: (path: string) => void;
  deletingInterruptedExportPath?: string;
  onDeleteInterruptedExport: (path: string) => void;
}) {
  if (!exports.length) return null;
  return (
    <div className="interrupted-export-list">
      <strong>未完成导出</strong>
      <small>带断点记录且设置一致的临时目录会自动续写；旧版半成品不会冒险续写，可打开取回或删除。</small>
      {exports.map((path) => (
        <div className="interrupted-export-item" key={path}>
          <code title={path}>{compactPath(path)}</code>
          <button className="ghost-button compact" type="button" onClick={() => onOpenPath(path)}>
            <ExternalLink size={14} />
            打开
          </button>
          <CopyButton label="复制路径" value={path} />
        </div>
      ))}
      <div className="interrupted-export-actions">
        {exports.map((path) => {
          const deleting = deletingInterruptedExportPath === path;
          return (
            <button
              className="ghost-button compact"
              type="button"
              key={`delete-${path}`}
              onClick={() => onDeleteInterruptedExport(path)}
              disabled={Boolean(deletingInterruptedExportPath)}
              aria-busy={deleting || undefined}
            >
              {deleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
              {deleting ? "正在删除" : `删除 ${compactPath(path)}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExportPathFacts({ status }: { status: ExportPathStatus }) {
  const facts = [
    status.pathLength ? `路径 ${status.pathLength} 字符` : undefined,
    status.availableBytes ? `可用空间 ${formatBytes(status.availableBytes)}` : undefined,
    status.writable === true ? "可写" : status.writable === false ? "不可写" : undefined,
  ].filter(Boolean);

  if (!facts.length) return null;
  return <small className="path-inspection-facts">{facts.join(" · ")}</small>;
}

function exportPathSummary(status: ExportPathStatus): string {
  if (status.error) return status.error;
  if (status.exists && !status.isDirectory) return "当前路径不可用于导出。";
  if (!status.parentExists) return "上级目录不存在。";
  if (status.writable === false) return "当前目录不可写。";
  if (status.interruptedExports.length) return `发现 ${status.interruptedExports.length} 个上次未完成导出的临时目录。`;
  if (!status.exists) return "目录当前不存在，导出前请确认路径可创建。";
  if ((status.entryCount ?? 0) === 0) return "空文件夹，适合写入新的导出结果。";
  return `已有 ${status.entryCount ?? 0} 个项目。继续导出前建议确认这些文件可以保留。`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (unit < units.length - 1 && value >= 1024) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function RunStep({
  logs,
  progressCounts,
  hasExportTask,
  running,
  startDisabled,
  outcome,
  config,
  exportPathStatus,
  exportHistory,
  conversations,
  startingExport,
  cancelling,
  openingOutput,
  openingFirstResult,
  onStart,
  onCancel,
  onBackToOptions,
  onBackToSource,
  onOpenOutput,
  onOpenHistoryPath,
  onOpenFirstResult,
  onSearchJsonl,
}: {
  logs: LogLine[];
  progressCounts?: JobProgress;
  hasExportTask: boolean;
  running: boolean;
  startDisabled: boolean;
  outcome: JobOutcome;
  config: ExportConfig;
  exportPathStatus?: ExportPathStatus;
  exportHistory: ExportHistoryEntry[];
  conversations: ConversationCandidate[];
  startingExport?: boolean;
  cancelling?: boolean;
  openingOutput?: boolean;
  openingFirstResult?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onBackToOptions: () => void;
  onBackToSource: () => void;
  onOpenOutput: () => void;
  onOpenHistoryPath: (path: string) => void;
  onOpenFirstResult: () => void;
  onSearchJsonl: (query: string) => Promise<JsonlSearchMatch[]>;
}) {
  const visualState = running ? "running" : outcome.kind;
  const Icon = visualState === "running" ? Loader2 : visualState === "succeeded" ? CheckCircle2 : visualState === "cancelled" ? CircleStop : TerminalSquare;
  const stripText = running ? "正在导出" : jobOutcomeLabel(outcome, "export");
  const selectedConversation = selectedConversationForConfig(config, conversations);
  const summary = summarizeExportResult({ logs, running, outcome, format: config.format, copyMethod: config.copyMethod, exportPath: config.exportPath });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const rawProgress = exportProgress(logs, running, outcome.kind, progressCounts);
  const progress = rawProgress ? exportProgressTiming(rawProgress, logs, now) : undefined;
  const phase = !hasExportTask ? "preview" : running ? "running" : "finished";
  const headingTitle = phase === "preview" ? "导出前预览" : phase === "running" ? "导出中" : "导出结果";
  const headingDescription =
    phase === "preview" ? "先确认导出设置、结果文件和输出位置，再开始导出。" : phase === "running" ? "正在处理导出任务。" : "查看导出摘要和结果入口。";
  const primaryActionLabel = running ? "取消导出" : startingExport ? "准备导出" : hasExportTask ? "重新导出" : "开始导出";
  const primaryActionIcon =
    cancelling || startingExport ? <Loader2 className="spin" size={17} /> : running ? <CircleStop size={17} /> : hasExportTask ? <RefreshCcw size={17} /> : <Play size={17} />;
  const primaryAction = running ? onCancel : onStart;

  return (
    <div className="page">
      <Header eyebrow="运行结果" title="导出与结果" description="导出完成后可打开结果目录或首个结果文件。" />
      <section className={`content-band export-preflight ${hasExportTask ? "has-task" : "idle"}`}>
        <div className="section-heading">
          <div>
            <h2>{headingTitle}</h2>
            <p>{headingDescription}</p>
          </div>
          <div className="export-preflight-actions">
            <button className="secondary-button" type="button" onClick={onBackToOptions}>
              <Settings2 size={17} />
              返回选项
            </button>
            <button className="primary-button" type="button" onClick={primaryAction} disabled={cancelling || startingExport || (!running && startDisabled)} aria-busy={cancelling || startingExport || undefined}>
              {primaryActionIcon}
              {primaryActionLabel}
            </button>
          </div>
        </div>
        <div className="export-preflight-grid">
          <div className="preflight-card summary-card">
            <div className="preflight-card-heading">
              <Info size={16} />
              <strong>{hasExportTask ? "结果总览" : "导出总览"}</strong>
            </div>
            {hasExportTask ? (
              <>
                <div className={`result-strip ${resultStripClass(visualState)}`}>
                  <Icon className={visualState === "running" ? "spin" : undefined} size={20} />
                  <span>{stripText}</span>
                </div>
                {progress ? <ExportProgressBar progress={progress} /> : null}
                <ExportSummaryPanel summary={summary} />
              </>
            ) : (
              <RunPreflightSummary config={config} selectedConversation={selectedConversation} summary={summary} />
            )}
          </div>
          <div className="preflight-card next-step-card">
            <div className="preflight-card-heading">
              <FolderOpen size={16} />
              <strong>{hasExportTask ? "下一步" : "开始前"}</strong>
            </div>
            {hasExportTask ? (
              <>
                <JobOutcomeNotice
                  outcome={outcome}
                  context="export"
                  logs={logs}
                  actions={{
                    onBackToSource,
                    onBackToOptions,
                    onRetry: startDisabled ? undefined : onStart,
                  }}
                />
                <JsonlPreview
                  enabled={!running && outcome.kind === "succeeded" && config.format === "jsonl"}
                  onSearch={onSearchJsonl}
                />
                <div className="result-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onOpenFirstResult}
                    disabled={!config.exportPath.trim() || running || outcome.kind !== "succeeded" || openingFirstResult}
                    aria-busy={openingFirstResult || undefined}
                  >
                    {openingFirstResult ? <Loader2 className="spin" size={17} /> : <ExternalLink size={17} />}
                    {`打开首个 ${resultFileLabel(config.format)}`}
                  </button>
                  <CopyButton label="复制路径" value={config.exportPath} disabled={!config.exportPath.trim()} title={config.exportPath ? `复制结果路径: ${config.exportPath}` : "复制结果路径"} />
                </div>
                <FooterActions
                  secondaryLabel={running ? "取消导出" : "重新导出"}
                  secondaryIcon={running ? <CircleStop size={17} /> : <RefreshCcw size={17} />}
                  onSecondary={running ? onCancel : onStart}
                  secondaryDisabled={!running && startDisabled}
                  secondaryLoading={running ? cancelling : startingExport}
                  primaryLabel="打开输出目录"
                  primaryIcon={<FolderOpen size={17} />}
                  onPrimary={onOpenOutput}
                  primaryDisabled={!config.exportPath.trim() || running}
                  primaryLoading={openingOutput}
                />
              </>
            ) : (
              <>
                <RunPreflightNextStep config={config} selectedConversation={selectedConversation} exportPathStatus={exportPathStatus} />
                <div className="result-actions">
                  <button className="secondary-button" type="button" onClick={onBackToSource}>
                    <Database size={17} />
                    回到数据源
                  </button>
                  <button className="primary-button" type="button" onClick={onStart} disabled={startDisabled || startingExport} aria-busy={startingExport || undefined}>
                    {startingExport ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                    {startingExport ? "准备导出" : "开始导出"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {exportHistory.length ? <ExportHistoryPanel history={exportHistory} onOpenPath={onOpenHistoryPath} /> : null}
      </section>
    </div>
  );
}

function ExportHistoryPanel({ history, onOpenPath }: { history: ExportHistoryEntry[]; onOpenPath: (path: string) => void }) {
  return (
    <section className="export-history" aria-label="最近导出">
      <div className="preflight-card-heading">
        <FolderOpen size={16} />
        <strong>最近导出</strong>
      </div>
      <div className="export-history-list">
        {history.slice(0, 5).map((entry) => (
          <div className="export-history-item" key={entry.id}>
            <span>
              <strong>{entry.conversationLabel?.trim() || "全部会话"}</strong>
              <small>
                {entry.format.toUpperCase()} · {entry.messageCount ? `${entry.messageCount.toLocaleString()} 条 · ` : ""}
                {formatHistoryTime(entry.finishedAt)}
              </small>
              <code title={entry.exportPath}>{compactPath(entry.exportPath)}</code>
            </span>
            <button className="ghost-button compact" type="button" onClick={() => onOpenPath(entry.exportPath)}>
              <ExternalLink size={14} />
              打开
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ExportProgressBar({ progress }: { progress: ExportProgress }) {
  const timeDetail = progress.elapsedLabel
    ? progress.value >= 100
      ? `耗时 ${progress.elapsedLabel}`
      : `已用 ${progress.elapsedLabel} · 预计还需 ${progress.remainingLabel ?? "计算中"}`
    : undefined;

  return (
    <div className="export-progress" role="group" aria-label="导出进度">
      <div className="export-progress-row">
        <strong>{progress.label}</strong>
        <span>{progress.value}%</span>
      </div>
      <progress value={progress.value} max={100} />
      <small>{progress.detail}</small>
      {timeDetail ? <small>{timeDetail}</small> : null}
    </div>
  );
}

function JsonlPreview({
  enabled,
  onSearch,
}: {
  enabled: boolean;
  onSearch: (query: string) => Promise<JsonlSearchMatch[]>;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<JsonlSearchMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      return;
    }
    void runSearch("");
  }, [enabled]);

  async function runSearch(nextQuery = query) {
    if (!enabled) return;
    setLoading(true);
    try {
      setMatches(await onSearch(nextQuery));
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="jsonl-preview" aria-label="JSONL 快速搜索">
      <div className="jsonl-search-row">
        <label>
          <span>JSONL 快速搜索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
            placeholder="搜索导出的 JSONL"
          />
        </label>
        <button className="ghost-button" type="button" onClick={() => void runSearch()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
          搜索
        </button>
      </div>
      <div className="jsonl-match-list">
        {matches.length ? (
          matches.map((match) => (
            <div className="jsonl-match" key={`${match.lineNumber}-${match.preview}`}>
              <small>第 {match.lineNumber.toLocaleString()} 行</small>
              <code>{match.preview}</code>
            </div>
          ))
        ) : (
          <small>{loading ? "正在读取 JSONL..." : "没有匹配结果"}</small>
        )}
      </div>
    </section>
  );
}

function RunPreflightSummary({
  config,
  selectedConversation,
  summary,
}: {
  config: ExportConfig;
  selectedConversation?: ConversationCandidate;
  summary: ExportSummary;
}) {
  const items: Array<{ label: string; value: string; icon: ReactNode; title?: string }> = [
    {
      label: "结果文件",
      value: resultFilenameLabel(config, selectedConversation),
      icon: <FileArchive size={16} />,
    },
    {
      label: "输出目录",
      value: compactPath(config.exportPath || summary.outputPath),
      title: config.exportPath || summary.outputPath,
      icon: <FolderOpen size={16} />,
    },
    ...(shouldProcessAttachments(config)
      ? [
          {
            label: "新建总目录命名",
            value: archiveNameModeLabel(config),
            icon: <FolderOpen size={16} />,
          },
        ]
      : []),
    {
      label: "会话",
      value: conversationExportName(config.conversationFilter, selectedConversation),
      icon: <MessagesSquare size={16} />,
    },
    {
      label: "日期",
      value: dateRangeLabel(config),
      icon: <CalendarDays size={16} />,
    },
    {
      label: "格式",
      value: summary.format === "HTML" ? `${summary.format} · 附件 ${summary.copyMethod}` : `${summary.format} · 不导出附件`,
      icon: <Archive size={16} />,
    },
    {
      label: "我的名字",
      value: displayNameLabel(config),
      icon: <UserRound size={16} />,
    },
  ];

  return (
    <div className="run-preflight-summary" aria-label="导出前总览">
      <div className="preflight-hero">
        <span className="run-empty-icon">
          <FileArchive size={22} />
        </span>
        <div>
          <h3>准备导出</h3>
          <p>{preflightFileDescription(config, selectedConversation)}</p>
        </div>
      </div>
      <div className="preflight-facts">
        {items.map((item) => (
          <div className="preflight-fact" key={item.label} title={item.title ?? item.value}>
            <span className="summary-icon">{item.icon}</span>
            <span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunPreflightNextStep({
  config,
  selectedConversation,
  exportPathStatus,
}: {
  config: ExportConfig;
  selectedConversation?: ConversationCandidate;
  exportPathStatus?: ExportPathStatus;
}) {
  const checks = [
    {
      label: "输出目录",
      value: config.exportPath ? compactPath(config.exportPath) : "未设置",
      icon: <FolderOpen size={16} />,
    },
    {
      label: "结果命名",
      value: preflightFileDescription(config, selectedConversation),
      icon: <FileArchive size={16} />,
    },
    ...(exportPathStatus?.interruptedExports.length
      ? [
          {
            label: "未完成导出",
            value: `发现 ${exportPathStatus.interruptedExports.length} 个 .partial 临时目录；可续写的会自动继续。`,
            icon: <ShieldAlert size={16} />,
          },
        ]
      : []),
  ];

  return (
    <div className="preflight-checklist" aria-label="开始导出前检查">
      {checks.map((check) => (
        <div className="preflight-check" key={check.label}>
          <span>{check.icon}</span>
          <div>
            <strong>{check.label}</strong>
            <small>{check.value}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportSummaryPanel({ summary }: { summary: ExportSummary }) {
  const tone = summary.status === "succeeded" ? "ok" : summary.status === "failed" ? "error" : summary.status === "cancelled" ? "warn" : "neutral";
  const isPending = summary.status === "pending";
  const items: Array<{ label: string; value: string; icon: ReactNode }> = [
    { label: "状态", value: summary.statusLabel, icon: summary.status === "succeeded" ? <CheckCircle2 size={16} /> : <Info size={16} /> },
    { label: "格式", value: summary.format, icon: <FileArchive size={16} /> },
    { label: "附件", value: summary.format === "HTML" ? summary.copyMethod : "不导出附件", icon: <Archive size={16} /> },
    { label: "项目", value: summary.itemCountLabel, icon: <MessagesSquare size={16} /> },
    { label: "耗时", value: summary.durationLabel, icon: <CalendarDays size={16} /> },
    { label: "输出", value: compactPath(summary.outputPath), icon: <FolderOpen size={16} /> },
  ];

  return (
    <section className={`content-band export-summary-panel ${tone}`} aria-label="导出摘要">
      <div className="section-heading">
        <div>
          <h2>导出摘要</h2>
          <p>{isPending ? "开始前先看一眼将要导出的设置和结果位置。" : summary.detail}</p>
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
      <div className={`summary-next-step ${isPending ? "pending" : ""}`}>
        {isPending ? <Play size={17} /> : <CheckCircle2 size={17} />}
        <span>
          <strong>{isPending ? "准备导出" : "下一步"}</strong>
          <small>{isPending ? "确认无误后开始导出。" : summary.nextStep}</small>
        </span>
      </div>
    </section>
  );
}

function resultFileLabel(format: ExportConfig["format"]): string {
  if (format === "jsonl") return "JSONL";
  if (format === "txt") return "TXT";
  return "HTML";
}

function preflightFileDescription(config: ExportConfig, selectedConversation?: ConversationCandidate): string {
  const filename = resultFilenameLabel(config, selectedConversation);
  if (selectedConversation || config.conversationFilter?.trim()) return `会按匹配到的会话生成 ${filename}`;
  return `每个合并后的会话各生成一个 ${filename}`;
}
