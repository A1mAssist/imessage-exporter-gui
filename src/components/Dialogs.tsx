import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Search,
  TerminalSquare,
  X,
} from "lucide-react";

import { CopyButton, Fact, useDialogKeyboard } from "./CommonUi";
import { EnvironmentFixList, ResourceLinks, settingsStateLabel } from "./ShellPanels";
import type { SettingsSaveState } from "./ShellPanels";
import type { AppDiagnostics, BackupCandidate, EnvironmentStatus, ExportConfig, UpdateInfo } from "../types";

export type UpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; info: UpdateInfo }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo; downloadedBytes: number; contentLength?: number }
  | { kind: "installed"; info: UpdateInfo }
  | { kind: "failed"; message: string };

export function OnboardingDialog({
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
  const dialogRef = useDialogKeyboard(onClose);
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
      <section className="oobe-dialog" role="dialog" aria-modal="true" aria-labelledby="oobe-title" tabIndex={-1} ref={dialogRef}>
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

export function AboutDialog({
  appDiagnostics,
  environment,
  config,
  updateState,
  onCheckUpdates,
  onInstallUpdate,
  onOpenExporterDownload,
  onChooseExporter,
  onOpenResource,
  onClose,
}: {
  appDiagnostics?: AppDiagnostics;
  environment?: EnvironmentStatus;
  config: ExportConfig;
  updateState: UpdateCheckState;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
  onOpenExporterDownload: () => void;
  onChooseExporter: () => void;
  onOpenResource: (file: "license" | "thirdPartyNotices") => void;
  onClose: () => void;
}) {
  const currentVersion = appDiagnostics?.version ?? updateInfoFromState(updateState)?.currentVersion ?? "unknown";
  const snapshot = buildSupportSnapshot(appDiagnostics, environment, config, updateState);
  const updateBusy = updateState.kind === "checking" || updateState.kind === "installing";
  const dialogRef = useDialogKeyboard(onClose);

  return (
    <div className="about-backdrop">
      <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} ref={dialogRef}>
        <button className="icon-button about-close" type="button" onClick={onClose} aria-label="关闭关于与诊断">
          <X size={16} />
        </button>
        <header className="about-header">
          <span className="about-mark">
            <MessageSquareText size={24} />
          </span>
          <div>
            <span className="workspace-kicker">App Diagnostics</span>
            <h2 id="about-title">关于与诊断</h2>
            <p>查看版本、更新、导出引擎和运行环境信息；反馈问题时可以直接复制这份摘要。</p>
          </div>
        </header>

        <div className="about-grid">
          <section className="about-section">
            <div className="section-heading compact-heading">
              <h3>应用信息</h3>
            </div>
            <div className="fact-list dense">
              <Fact label="名称" value={appDiagnostics?.name ?? "iMessage Exporter GUI"} />
              <Fact label="版本" value={currentVersion} />
              <Fact label="标识符" value={appDiagnostics?.identifier ?? "com.a1massist.imessage-exporter-gui"} />
              <Fact label="平台" value={formatPlatform(appDiagnostics)} />
              <Fact label="作者" value={appDiagnostics?.authors ?? "A1mAssist"} />
            </div>
          </section>

          <section className="about-section update-section">
            <div className="section-heading compact-heading">
              <h3>自动更新</h3>
              <p>{updateStatusText(updateState, currentVersion)}</p>
            </div>
            {updateState.kind === "installing" ? (
              <div className="update-progress" aria-label="更新下载进度">
                <span>{updateProgressText(updateState)}</span>
                <progress value={updateState.downloadedBytes} max={updateState.contentLength ?? updateState.downloadedBytes + 1} />
              </div>
            ) : null}
            {updateState.kind === "failed" ? (
              <p className="mini-warning">
                <AlertCircle size={15} />
                {updateState.message}
              </p>
            ) : null}
            <div className="panel-actions">
              <button className="ghost-button" type="button" onClick={onCheckUpdates} disabled={updateBusy}>
                {updateState.kind === "checking" ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                检查更新
              </button>
              {updateState.kind === "available" ? (
                <button className="primary-button compact" type="button" onClick={onInstallUpdate}>
                  <Download size={15} />
                  下载并安装
                </button>
              ) : null}
            </div>
          </section>

          <section className="about-section engine-setup-section">
            <div className="section-heading compact-heading">
              <h3>导出引擎</h3>
              <p>{environment?.exporterAvailable ? "已检测到 imessage-exporter，诊断和导出可以继续运行。" : "未检测到 imessage-exporter；可以下载新版或选择本机已有文件。"}</p>
            </div>
            <div className="engine-setup-steps">
              <span className={environment?.exporterAvailable ? "done" : ""}>
                <strong>{environment?.exporterAvailable ? <CheckCircle2 size={16} /> : <Download size={15} />}</strong>
                获取 imessage-exporter
              </span>
              <span className={config.exporterPath?.trim() || environment?.exporterPath ? "done" : ""}>
                <strong>{config.exporterPath?.trim() || environment?.exporterPath ? <CheckCircle2 size={16} /> : <FolderOpen size={15} />}</strong>
                可执行文件位置
              </span>
              <span className={environment?.exporterAvailable ? "done" : ""}>
                <strong>{environment?.exporterAvailable ? <CheckCircle2 size={16} /> : <RefreshCcw size={15} />}</strong>
                可用性检测
              </span>
            </div>
            <div className="fact-list dense">
              <Fact label="状态" value={environment?.exporterAvailable ? "可用" : "未找到"} />
              <Fact label="版本" value={environment?.exporterVersion ?? "未检测到"} />
              <Fact label="路径" value={config.exporterPath?.trim() || environment?.exporterPath || "未选择；会检查 PATH"} />
            </div>
            <div className="panel-actions">
              <button className="ghost-button" type="button" onClick={onOpenExporterDownload}>
                <ExternalLink size={15} />
                打开下载页
              </button>
              <button className="ghost-button" type="button" onClick={onChooseExporter}>
                <FolderOpen size={15} />
                选择导出引擎
              </button>
            </div>
          </section>

          <section className="about-section support-section">
            <div className="section-heading compact-heading">
              <h3>支持摘要</h3>
              <p>复制这份信息可以快速说明版本、平台、引擎和依赖状态。</p>
            </div>
            <textarea className="support-snapshot" readOnly value={snapshot} aria-label="支持诊断摘要" />
            <div className="panel-actions">
              <CopyButton label="复制摘要" value={snapshot} />
              <ResourceLinks onOpenResource={onOpenResource} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function EnvironmentDialog({
  environment,
  config,
  settingsSaveState,
  onChooseExporter,
  onClearExporter,
  onOpenExporterDownload,
  onRefresh,
  onClearSettings,
  onOpenResource,
  onCopy,
  onClose,
}: {
  environment?: EnvironmentStatus;
  config: ExportConfig;
  settingsSaveState: SettingsSaveState;
  onChooseExporter: () => void;
  onClearExporter: () => void;
  onOpenExporterDownload: () => void;
  onRefresh: () => void;
  onClearSettings: () => void;
  onOpenResource: (file: "license" | "thirdPartyNotices") => void;
  onCopy: (value: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogKeyboard(onClose);
  const configuredExporterPath = config.exporterPath?.trim() ?? "";
  const effectiveExporterPath = configuredExporterPath || environment?.exporterPath || "未选择；会尝试从 PATH 检测";
  const attachmentReady = Boolean(environment?.ffmpegAvailable && environment?.imagemagickAvailable);
  const attachmentDetail = attachmentReady
    ? "basic/full 附件转换依赖已经齐备。"
    : "clone 可直接导出；basic/full 需要 ffmpeg 和 ImageMagick。";

  return (
    <div className="about-backdrop">
      <section className="about-dialog environment-dialog" role="dialog" aria-modal="true" aria-labelledby="environment-title" tabIndex={-1} ref={dialogRef}>
        <button className="icon-button about-close" type="button" onClick={onClose} aria-label="关闭运行环境详情">
          <X size={16} />
        </button>
        <header className="about-header">
          <span className="about-mark">
            <TerminalSquare size={24} />
          </span>
          <div>
            <span className="workspace-kicker">Environment</span>
            <h2 id="environment-title">运行环境详情</h2>
            <p>管理导出引擎、附件转换依赖和本机资源。侧栏只保留摘要，这里放完整处理入口。</p>
          </div>
        </header>

        <div className="environment-detail-grid">
          <section className="about-section environment-primary-section">
            <div className="section-heading compact-heading">
              <h3>导出引擎</h3>
              <p>GUI 不内置 imessage-exporter；请选择本机已有的可执行文件，或打开下载页获取最新版。</p>
            </div>
            <div className="fact-list dense">
              <Fact label="状态" value={environment?.exporterAvailable ? "可用" : "未找到"} />
              <Fact label="版本" value={environment?.exporterVersion ?? "未检测到"} />
              <Fact label="路径" value={effectiveExporterPath} />
            </div>
            <div className="panel-actions">
              <button className="ghost-button" type="button" onClick={onChooseExporter}>
                <FolderOpen size={15} />
                选择导出引擎
              </button>
              <button className="ghost-button" type="button" onClick={onOpenExporterDownload}>
                <ExternalLink size={15} />
                下载导出引擎
              </button>
              {configuredExporterPath ? (
                <button className="ghost-button" type="button" onClick={onClearExporter}>
                  清除
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={onRefresh}>
                <RefreshCcw size={15} />
                重新检测
              </button>
            </div>
          </section>

          <section className="about-section">
            <div className="section-heading compact-heading">
              <h3>附件转换</h3>
              <p>{attachmentDetail}</p>
            </div>
            <div className="fact-list dense">
              <Fact label="ffmpeg" value={environment?.ffmpegAvailable ? "可用" : "未检测到"} />
              <Fact label="ImageMagick" value={environment?.imagemagickAvailable ? "可用" : "未检测到"} />
            </div>
            {environment?.warnings.map((warning) => (
              <p className="mini-warning" key={warning}>
                <AlertCircle size={15} />
                {warning}
              </p>
            ))}
          </section>

          <section className="about-section">
            <EnvironmentFixList environment={environment} onCopy={onCopy} />
          </section>

          <section className="about-section environment-support-section">
            <div className={`settings-save-line ${settingsSaveState}`}>
              <AlertCircle size={15} />
              <span>
                <strong>{settingsStateLabel(settingsSaveState)}</strong>
                <small>仅保存路径和导出选项，不保存备份密码。</small>
              </span>
              <button className="ghost-button" type="button" onClick={onClearSettings} disabled={settingsSaveState === "saving"}>
                清除
              </button>
            </div>
            <ResourceLinks onOpenResource={onOpenResource} />
          </section>
        </div>
      </section>
    </div>
  );
}

function updateInfoFromState(state: UpdateCheckState): UpdateInfo | undefined {
  if (state.kind === "current" || state.kind === "available" || state.kind === "installing" || state.kind === "installed") {
    return state.info;
  }
  return undefined;
}

function formatPlatform(appDiagnostics?: AppDiagnostics): string {
  if (!appDiagnostics) return "unknown";
  return `${appDiagnostics.os} / ${appDiagnostics.arch}`;
}

function updateStatusText(state: UpdateCheckState, currentVersion: string): string {
  if (state.kind === "checking") return "正在连接 GitHub Release 检查新版本。";
  if (state.kind === "available") return `发现新版本 ${state.info.version ?? "unknown"}，当前版本 ${state.info.currentVersion ?? currentVersion}。`;
  if (state.kind === "installing") return `正在下载 ${state.info.version ?? "更新包"}，安装后会重启应用。`;
  if (state.kind === "installed") return "更新已安装，应用正在重启。";
  if (state.kind === "failed") return "更新检查失败。可以稍后重试，或从 GitHub Releases 手动下载。";
  if (state.kind === "current") return `当前已是最新版本 ${state.info.currentVersion ?? currentVersion}。`;
  return "手动检查 GitHub Releases 上是否有新版本。";
}

function updateProgressText(state: Extract<UpdateCheckState, { kind: "installing" }>): string {
  if (!state.contentLength) return `${formatBytes(state.downloadedBytes)} downloaded`;
  return `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.contentLength)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildSupportSnapshot(
  appDiagnostics: AppDiagnostics | undefined,
  environment: EnvironmentStatus | undefined,
  config: ExportConfig,
  updateState: UpdateCheckState,
): string {
  const updateInfo = updateInfoFromState(updateState);
  return [
    "iMessage Exporter GUI support snapshot",
    `App: ${appDiagnostics?.name ?? "unknown"} ${appDiagnostics?.version ?? "unknown"}`,
    `Identifier: ${appDiagnostics?.identifier ?? "unknown"}`,
    `Platform: ${formatPlatform(appDiagnostics)}`,
    `Updater: ${updateState.kind}${updateInfo?.version ? ` (${updateInfo.version})` : ""}`,
    `Exporter available: ${environment?.exporterAvailable ? "yes" : "no"}`,
    `Exporter version: ${environment?.exporterVersion ?? "unknown"}`,
    `Exporter path: ${config.exporterPath?.trim() || environment?.exporterPath || "PATH / not selected"}`,
    `ffmpeg available: ${environment?.ffmpegAvailable ? "yes" : "no"}`,
    `ImageMagick available: ${environment?.imagemagickAvailable ? "yes" : "no"}`,
    `Backup path set: ${config.backupPath.trim() ? "yes" : "no"}`,
    `Output path set: ${config.exportPath.trim() ? "yes" : "no"}`,
  ].join("\n");
}
