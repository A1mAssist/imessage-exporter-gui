import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  FolderOpen,
  RefreshCcw,
  Search,
  Settings2,
} from "lucide-react";

import type { DiagnosticFinding } from "../lib/diagnostics";
import { recoveryHintForFailure } from "../lib/recoveryHints";
import type { CommandPreview, JobEvent, LogLine } from "../types";

export type JobOutcome = { kind: "idle" | "running" | "succeeded" | "failed" | "cancelled"; code?: number; message?: string };

export type RecoveryActions = {
  onChooseBackup?: () => void;
  onBackToSource?: () => void;
  onBackToOptions?: () => void;
  onRetry?: () => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogKeyboard(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableDialogElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutsideDialog = !active || !dialog.contains(active);
      const focusIsDialogContainer = active === dialog;

      if (event.shiftKey) {
        if (focusIsOutsideDialog || focusIsDialogContainer || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (focusIsOutsideDialog || focusIsDialogContainer || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return dialogRef;
}

function getFocusableDialogElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return element.getClientRects().length > 0 || document.activeElement === element;
  });
}

export function terminalOutcome(event: JobEvent, cancelRequested: boolean): JobOutcome {
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

export function resultStripClass(kind: JobOutcome["kind"]) {
  if (kind === "running") return "running";
  if (kind === "succeeded") return "success";
  if (kind === "failed") return "failed";
  if (kind === "cancelled") return "cancelled";
  return "";
}

export function jobOutcomeLabel(outcome: JobOutcome, context: "diagnostics" | "export") {
  const action = context === "diagnostics" ? "诊断" : "导出";
  if (outcome.kind === "running") return `${action}运行中`;
  if (outcome.kind === "succeeded") return `${action}完成`;
  if (outcome.kind === "cancelled") return `${action}已取消`;
  if (outcome.kind === "failed") return outcome.code === undefined ? `${action}失败` : `${action}失败，代码 ${outcome.code}`;
  return "尚未开始";
}

export function JobOutcomeNotice({
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

export function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="page-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

export function PathField({ label, value, onBrowse }: { label: string; value: string; onBrowse: () => void }) {
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

export function SegmentedControl<T extends string>({
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

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Badge({ children, tone }: { children: string; tone: "ok" | "warn" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function DiagnosticTile({ label, status }: { label: string; status: DiagnosticFinding }) {
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

export function CommandBox({ preview }: { preview: CommandPreview }) {
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

export function DiagnosticReportActions({ report, disabled }: { report: string; disabled?: boolean }) {
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

export function LogPanel({ logs, running, exitCode, outcome }: { logs: LogLine[]; running: boolean; exitCode?: number; outcome: JobOutcome }) {
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

export function CopyButton({ label, value, disabled, title }: { label: string; value: string; disabled?: boolean; title?: string }) {
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

export function FooterActions({
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
  secondaryDisabled,
}: {
  primaryLabel: string;
  primaryIcon: ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryIcon?: ReactNode;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
}) {
  return (
    <footer className="footer-actions">
      {secondaryLabel && onSecondary ? (
        <button className="secondary-button" type="button" onClick={onSecondary} disabled={secondaryDisabled}>
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
