import type { CopyMethod, ExportFormat, LogLine } from "../types";

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
  return "等待导出";
}

function summaryDetail(status: ExportSummaryStatus, logText: string, message?: string): string {
  if (status === "running") return latestMeaningfulLine(logText) ?? "正在等待内置导出引擎输出。";
  if (status === "succeeded") return latestMeaningfulLine(logText) ?? "任务已成功结束。";
  if (status === "cancelled") return "任务已停止，已保留当前日志。";
  if (status === "failed") return message || latestMeaningfulLine(logText) || "请查看日志中的错误信息。";
  return "开始导出后会在这里汇总结论。";
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
  return "日志未报告";
}

function durationLabel(logs: LogLine[]): string {
  if (logs.length < 2) return "未报告";
  const first = logs[0]?.timestamp;
  const last = logs[logs.length - 1]?.timestamp;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return "未报告";
  const seconds = Math.max(1, Math.round((last - first) / 1000));
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
  return "开始导出后会显示下一步。";
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
