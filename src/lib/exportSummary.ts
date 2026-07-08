import type { CopyMethod, ExportFormat, JobProgress, LogLine } from "../types";

export type ExportSummaryStatus = "pending" | "running" | "succeeded" | "cancelled" | "failed";

export type ExportSummary = {
  status: ExportSummaryStatus;
  statusLabel: string;
  format: string;
  copyMethod: string;
  outputPath: string;
  itemCountLabel: string;
  durationLabel: string;
  nextStep: string;
  detail: string;
};

export type ExportProgress = {
  value: number;
  label: string;
  detail: string;
  current?: number;
  total?: number;
  elapsedLabel?: string;
  remainingLabel?: string;
};

export type ExportSummaryInput = {
  logs: LogLine[];
  running: boolean;
  outcome: { kind: ExportSummaryStatus | "idle"; code?: number; message?: string };
  format: ExportFormat;
  copyMethod: CopyMethod;
  exportPath: string;
};

export function summarizeExportResult(input: ExportSummaryInput): ExportSummary {
  const logText = input.logs.map((line) => line.text).join("\n");
  const status = exportStatus(input.running, input.outcome.kind);
  const outputPath = parseOutputPath(logText) ?? input.exportPath.trim() ?? "未设置";

  return {
    status,
    statusLabel: statusLabel(status, input.outcome.code),
    format: input.format.toUpperCase(),
    copyMethod: input.copyMethod,
    outputPath,
    itemCountLabel: itemCountLabel(logText),
    durationLabel: durationLabel(input.logs),
    nextStep: nextStep(status, input.format),
    detail: summaryDetail(status, logText, input.outcome.message),
  };
}

export function exportProgress(
  logs: LogLine[],
  running: boolean,
  outcome: ExportSummaryInput["outcome"]["kind"],
  exact?: JobProgress,
): ExportProgress | undefined {
  if (!running && outcome !== "succeeded") return undefined;
  if (exact && exact.total > 0) {
    const current = Math.min(Math.max(0, exact.current), exact.total);
    const done = outcome === "succeeded" && !running;
    return {
      value: done ? 100 : Math.min(99, Math.round((current / exact.total) * 100)),
      label: done ? "导出完成" : "写入导出文件",
      detail: `${current.toLocaleString()} / ${exact.total.toLocaleString()} 条消息`,
      current,
      total: exact.total,
    };
  }
  const logText = logs.map((line) => line.text).join("\n");
  const lower = logText.toLowerCase();
  let value = running ? 6 : 100;
  let label = running ? "准备导出" : "导出完成";

  const backupStep = lower.match(/\[(\d+)\/5\]\s+(?:deriving|resolving|decrypting)/);
  if (lower.includes("decrypting ios backup")) {
    value = Math.max(value, 8);
    label = "解密备份";
  }
  if (backupStep?.[1]) {
    value = Math.max(value, 8 + Number(backupStep[1]) * 3);
    label = "解密备份";
  }
  const cacheStep = lower.match(/\[(\d+)\/5\]\s+caching/);
  if (lower.includes("building cache")) {
    value = Math.max(value, 24);
    label = "读取消息索引";
  }
  if (cacheStep?.[1]) {
    value = Math.max(value, 24 + Number(cacheStep[1]) * 6);
    label = "读取消息索引";
  }
  if (lower.includes("cache built")) {
    value = Math.max(value, 56);
    label = "准备写入";
  }
  if (lower.includes("detected converters")) {
    value = Math.max(value, 58);
    label = "检查附件转换器";
  }
  if (lower.includes("exporting to") || /exporting\s+[\d,]+\s+/.test(lower)) {
    value = Math.max(value, 68);
    label = "写入导出文件";
  }
  if (lower.includes("writing html footers")) {
    value = Math.max(value, 90);
    label = "收尾 HTML";
  }
  if (lower.includes("done!")) {
    value = Math.max(value, 96);
    label = "发布结果";
  }
  if (lower.includes("export complete") || outcome === "succeeded") {
    value = 100;
    label = "导出完成";
  }

  return {
    value: Math.min(100, Math.max(0, Math.round(value))),
    label,
    detail: latestMeaningfulLine(logText) ?? "正在启动内置导出引擎。",
  };
}

export function exportProgressTiming(progress: ExportProgress, logs: LogLine[], now = Date.now()): ExportProgress {
  const firstTimestamp = logs.find((line) => Number.isFinite(line.timestamp))?.timestamp;
  if (!firstTimestamp) return progress;

  const finished = progress.value >= 100;
  const lastTimestamp = logs
    .slice()
    .reverse()
    .find((line) => Number.isFinite(line.timestamp))?.timestamp;
  const elapsedMs = Math.max(0, (finished ? lastTimestamp ?? now : now) - firstTimestamp);
  const elapsedLabel = formatDurationMs(elapsedMs);
  let remainingLabel: string | undefined;

  if (!finished && progress.current !== undefined && progress.total !== undefined && progress.current > 0 && progress.total > progress.current) {
    const remainingMs = (elapsedMs / progress.current) * (progress.total - progress.current);
    remainingLabel = formatDurationMs(remainingMs);
  }

  return { ...progress, elapsedLabel, remainingLabel };
}

function exportStatus(running: boolean, outcome: ExportSummaryInput["outcome"]["kind"]): ExportSummaryStatus {
  if (running) return "running";
  if (outcome === "succeeded" || outcome === "cancelled" || outcome === "failed") return outcome;
  return "pending";
}

function statusLabel(status: ExportSummaryStatus, code?: number): string {
  if (status === "running") return "导出运行中";
  if (status === "succeeded") return "导出完成";
  if (status === "cancelled") return "导出已取消";
  if (status === "failed") return code === undefined ? "导出失败" : `导出失败，代码 ${code}`;
  return "导出前预览";
}

function summaryDetail(status: ExportSummaryStatus, logText: string, message?: string): string {
  if (status === "running") return latestMeaningfulLine(logText) ?? "正在等待内置导出引擎输出。";
  if (status === "succeeded") return latestMeaningfulLine(logText) ?? "任务已成功结束。";
  if (status === "cancelled") return "任务已停止。";
  if (status === "failed") return message || latestMeaningfulLine(logText) || "请查看失败提示。";
  return "开始前先确认设置和输出位置。";
}

function parseOutputPath(logText: string): string | undefined {
  const patterns = [/Export complete:\s*(.+)$/im, /Exported.+?\s(?:to|at)\s+(.+)$/im];
  for (const pattern of patterns) {
    const match = logText.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function itemCountLabel(logText: string): string {
  const patterns = [
    /total messages:\s*([\d,]+)/i,
    /exporting\s+([\d,]+)\s+(?:conversations|messages|chats)/i,
    /exported\s+([\d,]+)\s+(?:conversations|messages|chats)/i,
  ];
  for (const pattern of patterns) {
    const match = logText.match(pattern);
    if (match?.[1]) return `${match[1]} 项`;
  }
  return "未报告结果";
}

function durationLabel(logs: LogLine[]): string {
  if (logs.length < 2) return "未报告";
  const first = logs[0]?.timestamp;
  const last = logs[logs.length - 1]?.timestamp;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return "未报告";
  return formatDurationMs(last - first);
}

function formatDurationMs(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
}

function nextStep(status: ExportSummaryStatus, format: ExportFormat): string {
  if (status === "succeeded") return `打开首个 ${resultFormatLabel(format)} 或输出目录检查结果。`;
  if (status === "failed") return "按失败提示修正后重新导出。";
  if (status === "cancelled") return "调整选项后可重新导出。";
  if (status === "running") return "保持窗口打开，必要时可取消任务。";
  return "确认无误后开始导出。";
}

function resultFormatLabel(format: ExportFormat): string {
  if (format === "html") return "HTML";
  if (format === "jsonl") return "JSONL";
  return "TXT";
}

function latestMeaningfulLine(logText: string): string | undefined {
  const lines = logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^进程退出/.test(line));
  return lines[lines.length - 1];
}
