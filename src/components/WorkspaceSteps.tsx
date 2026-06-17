import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  CalendarDays,
  CheckCircle2,
  CircleStop,
  Database,
  Download,
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
  UserRound,
} from "lucide-react";

import {
  Badge,
  CommandBox,
  CopyButton,
  DiagnosticReportActions,
  DiagnosticTile,
  Fact,
  FooterActions,
  Header,
  JobOutcomeNotice,
  LogPanel,
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
import { copyMethods, exportFormats } from "../lib/exportConfig";
import { summarizeDiagnostics } from "../lib/diagnostics";
import { exportPresets } from "../lib/exportPresets";
import type { ExportPresetId } from "../lib/exportPresets";
import { summarizeExportResult } from "../lib/exportSummary";
import type { ExportSummary } from "../lib/exportSummary";
import type {
  BackupCandidate,
  CommandPreview,
  ConversationCandidate,
  EnvironmentStatus,
  ExportConfig,
  ExportPathStatus,
  JobStarted,
  LogLine,
} from "../types";

export function blockingExportPathErrors(status?: ExportPathStatus): string[] {
  if (!status) return [];
  if (status.error) return [status.error];
  if (status.exists && !status.isDirectory) return ["输出路径已存在，但它不是文件夹。"];
  if (!status.parentExists) return ["输出目录的上级目录不存在，请重新选择。"];
  return [];
}

export function needsExportPathConfirmation(status?: ExportPathStatus): boolean {
  if (!status?.exists || !status.isDirectory) return false;
  return Boolean((status.entryCount ?? 0) > 0 || status.containsHtml || status.containsTxt || status.containsAttachments);
}


export function SourceStep({
  backups,
  selectedBackup,
  config,
  environment,
  loadingEnvironment,
  diagnosticsSucceeded,
  onChooseBackup,
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
      <Header eyebrow="数据准备" title="选择 iOS 备份" description="从 Apple Devices 或 iTunes 的本地备份导出 Messages 数据，不修改原始备份。" />

      <FirstRunGuide
        backup={selectedBackup}
        config={config}
        environment={environment}
        diagnosticsSucceeded={diagnosticsSucceeded}
        diagnosticsBlockers={diagnosticsBlockers}
        onChooseBackup={onChooseBackup}
        onRunDiagnostics={onRunDiagnostics}
      />

      <EngineSetupCard
        environment={environment}
        loading={loadingEnvironment}
        onRefreshEnvironment={onRefreshEnvironment}
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
                密码只在本次任务中传给内置导出引擎，命令预览和日志会脱敏。
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
  onChooseBackup,
  onRunDiagnostics,
}: {
  backup?: BackupCandidate;
  config: ExportConfig;
  environment?: EnvironmentStatus;
  diagnosticsSucceeded: boolean;
  diagnosticsBlockers: string[];
  onChooseBackup: () => void;
  onRunDiagnostics: () => void;
}) {
  const engineReady = Boolean(environment?.exporterAvailable);
  const backupReady = Boolean(config.backupPath.trim() && backup?.valid);
  const passwordReady = !config.encrypted || Boolean(config.cleartextPassword?.trim());
  const canRunDiagnostics = diagnosticsBlockers.length === 0;
  const items: Array<{ label: string; detail: string; done: boolean; actions: ReactNode }> = [
    {
      label: "内置导出引擎",
      detail: engineReady ? environment?.exporterVersion ?? "内置 imessage-exporter 已就绪" : "正在读取引擎状态",
      done: engineReady,
      actions: (
        <span className="engine-inline-status">
          <CheckCircle2 size={15} />
          已内置
        </span>
      ),
    },
    {
      label: "选择 iOS 备份",
      detail: backupReady ? backup?.displayName ?? "备份目录已就绪" : "选择包含 Manifest.db 和 Info.plist 的 iOS 备份根目录",
      done: backupReady && passwordReady,
      actions: (
        <button className="ghost-button" type="button" onClick={onChooseBackup}>
          <Database size={15} />
          选择
        </button>
      ),
    },
    {
      label: "运行诊断",
      detail: diagnosticsSucceeded ? "诊断已通过，可以继续设置导出选项" : "确认数据库、附件、联系人和转换器状态",
      done: diagnosticsSucceeded,
      actions: (
        <button className="ghost-button" type="button" onClick={onRunDiagnostics} disabled={!canRunDiagnostics}>
          <Search size={15} />
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

function EngineSetupCard({
  environment,
  loading,
  onRefreshEnvironment,
}: {
  environment?: EnvironmentStatus;
  loading: boolean;
  onRefreshEnvironment: () => void;
}) {
  const ready = Boolean(environment?.exporterAvailable);
  const engineItems = [
    { label: "模式", done: ready, detail: "应用内置 imessage-exporter，无需选择外部 exe", icon: <TerminalSquare size={15} /> },
    { label: "版本", done: ready, detail: environment?.exporterVersion ?? "正在检测", icon: <Info size={15} /> },
    { label: "兼容性", done: ready, detail: ready ? "已验证内置 Rust 引擎" : "等待环境检测完成", icon: <CheckCircle2 size={15} /> },
  ];

  return (
    <section className="content-band engine-setup-card" aria-label="内置导出引擎">
      <div className="section-heading">
        <div>
          <h2>内置导出引擎</h2>
          <p>GUI 已直接集成 imessage-exporter 源码，命令预览仅用于核对参数。</p>
        </div>
        <Badge tone={ready ? "ok" : "warn"}>{ready ? "已就绪" : "检测中"}</Badge>
      </div>
      <div className="engine-setup-steps">
        {engineItems.map((item) => (
          <span className={item.done ? "done" : ""} key={item.label}>
            <strong>{item.done ? <CheckCircle2 size={16} /> : item.icon}</strong>
            <em>
              {item.label}
              <small>{item.detail}</small>
            </em>
          </span>
        ))}
      </div>
      <div className="panel-actions">
        <button className="ghost-button" type="button" onClick={onRefreshEnvironment} disabled={loading}>
          {loading ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
          重新检测
        </button>
      </div>
    </section>
  );
}

export function sourceDiagnosticsBlockers(config: ExportConfig, backup?: BackupCandidate, environment?: EnvironmentStatus): string[] {
  const blockers: string[] = [];

  if (!environment?.exporterAvailable) blockers.push("内置导出引擎暂未就绪，暂时不能运行诊断。");
  blockers.push(...sourceSelectionBlockers(config, backup));
  if (config.encrypted && !config.cleartextPassword?.trim()) blockers.push("加密备份需要输入密码。");

  return blockers;
}

export function sourceSelectionBlockers(config: ExportConfig, backup?: BackupCandidate): string[] {
  const blockers: string[] = [];

  if (!config.backupPath.trim()) {
    blockers.push("请选择 iOS 备份根目录。");
  } else if (!backup?.valid) {
    blockers.push("备份目录需要同时包含 Manifest.db 和 Info.plist。");
  }

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
          : "内置导出引擎暂未就绪，请重新检测环境",
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

export function DiagnosticsStep({
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
      <Header eyebrow="诊断检查" title="诊断备份" description="先让 imessage-exporter 检查数据库、附件、联系人和转换器状态。" />
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

export function OptionsStep({
  config,
  environment,
  warnings,
  errors,
  preview,
  exportPathStatus,
  checkingExportPath,
  conversations,
  loadingConversations,
  conversationError,
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
  conversations: ConversationCandidate[];
  loadingConversations: boolean;
  conversationError?: string;
  onChange: (patch: Partial<ExportConfig>) => void;
  onChooseExport: () => void;
  onGenerateExport: () => void;
  onApplyPreset: (presetId: ExportPresetId) => void;
  onStart: () => void;
}) {
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
          onChange={(format) => onChange(format === "html" ? { format } : { format, noLazy: false })}
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
        <DateRangeField config={config} onChange={onChange} />
        <ConversationPicker
          value={config.conversationFilter ?? ""}
          conversations={conversations}
          loading={loadingConversations}
          error={conversationError}
          onChange={(conversationFilter) => onChange({ conversationFilter })}
        />
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

export function RunStep({
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
        <Header eyebrow="运行结果" title="导出与结果" description="实时查看 imessage-exporter 输出，导出完成后打开结果目录。" />
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
      <Header eyebrow="运行结果" title="导出与结果" description="实时查看 imessage-exporter 输出，导出完成后打开结果目录。" />
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
          onBackToSource,
          onBackToOptions,
          onRetry: onStart,
        }}
      />
      <div className="result-actions">
        <button className="secondary-button" type="button" onClick={onOpenFirstResult} disabled={!exportPath.trim() || running || outcome.kind !== "succeeded"}>
          <ExternalLink size={17} />
          {`打开首个 ${resultFileLabel(format)}`}
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

function resultFileLabel(format: ExportConfig["format"]): string {
  if (format === "jsonl") return "JSONL";
  if (format === "txt") return "TXT";
  return "HTML";
}
