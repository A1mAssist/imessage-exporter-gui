import type { CopyMethod, ExportFormat, LogLine } from "../types";

export type ExportSummaryStatus = "pending" | "running" | "succeeded" | "cancelled" | "failed";

export type ExportSummary = {
  status: ExportSummaryStatus;
  statusLabel: string;
  format: string;
  copyMethod: string;
  outputPath: string;
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
  if (status === "running") return latestMeaningfulLine(logText) ?? "正在等待 imessage-exporter 输出。";
  if (status === "succeeded") return latestMeaningfulLine(logText) ?? "任务已成功结束。";
  if (status === "cancelled") return "任务已停止，已保留当前日志。";
  if (status === "failed") return message || latestMeaningfulLine(logText) || "请查看日志中的错误信息。";
  return "开始导出后会在这里汇总结果。";
}

function parseOutputPath(logText: string): string | undefined {
  const patterns = [/Export complete:\s*(.+)$/im, /Exported.+?\s(?:to|at)\s+(.+)$/im];
  for (const pattern of patterns) {
    const match = logText.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function latestMeaningfulLine(logText: string): string | undefined {
  const lines = logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^进程退出/.test(line));
  return lines[lines.length - 1];
}
