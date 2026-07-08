import { describe, expect, it } from "vitest";
import type { LogLine } from "../types";
import { exportProgress, exportProgressTiming, summarizeExportResult } from "./exportSummary";

function line(text: string, kind: LogLine["kind"] = "stdout", timestamp = 1): LogLine {
  return { id: text, kind, text, timestamp };
}

describe("summarizeExportResult", () => {
  it("summarizes successful HTML exports from logs and config", () => {
    const summary = summarizeExportResult({
      logs: [line("Exporting 42 conversations as HTML...", "stdout", 1_000), line("Export complete: C:\\Messages Export", "stdout", 4_400)],
      running: false,
      outcome: { kind: "succeeded", code: 0 },
      format: "html",
      copyMethod: "clone",
      exportPath: "D:\\Fallback",
    });

    expect(summary).toMatchObject({
      status: "succeeded",
      statusLabel: "导出完成",
      format: "HTML",
      copyMethod: "clone",
      outputPath: "C:\\Messages Export",
      itemCountLabel: "42 项",
      durationLabel: "3 秒",
      nextStep: "打开首个 HTML 或输出目录检查结果。",
      detail: "Export complete: C:\\Messages Export",
    });
  });

  it("summarizes TXT exports using the configured output path when logs omit it", () => {
    const summary = summarizeExportResult({
      logs: [line("Exporting 42 conversations as TXT...")],
      running: false,
      outcome: { kind: "succeeded", code: 0 },
      format: "txt",
      copyMethod: "disabled",
      exportPath: "D:\\Text Archive",
    });

    expect(summary.format).toBe("TXT");
    expect(summary.copyMethod).toBe("disabled");
    expect(summary.outputPath).toBe("D:\\Text Archive");
    expect(summary.nextStep).toBe("打开首个 TXT 或输出目录检查结果。");
  });

  it("keeps pending summaries as a preflight preview", () => {
    const summary = summarizeExportResult({
      logs: [],
      running: false,
      outcome: { kind: "idle" },
      format: "html",
      copyMethod: "clone",
      exportPath: "D:\\Preview",
    });

    expect(summary.statusLabel).toBe("导出前预览");
    expect(summary.detail).toBe("开始前先确认设置和输出位置。");
    expect(summary.nextStep).toBe("确认无误后开始导出。");
  });

  it("shows cancelled and failed states distinctly", () => {
    expect(
      summarizeExportResult({
        logs: [line("Caching chats...")],
        running: false,
        outcome: { kind: "cancelled", message: "任务已取消" },
        format: "html",
        copyMethod: "clone",
        exportPath: "D:\\Out",
      }).statusLabel,
    ).toBe("导出已取消");

    expect(
      summarizeExportResult({
        logs: [line("Permission denied", "stderr")],
        running: false,
        outcome: { kind: "failed", code: 13 },
        format: "html",
        copyMethod: "clone",
        exportPath: "D:\\Out",
      }).statusLabel,
    ).toBe("导出失败，代码 13");
  });

  it("derives coarse export progress from engine log phases", () => {
    expect(exportProgress([line("Building cache..."), line("  [3/5] Caching participants...")], true, "running")).toMatchObject({
      value: 42,
      label: "读取消息索引",
    });

    expect(exportProgress([line("Exporting to D:\\Out as html..."), line("Done!")], true, "running")).toMatchObject({
      value: 96,
      label: "发布结果",
    });

    expect(exportProgress([line("Export complete: D:\\Out")], false, "succeeded")).toMatchObject({
      value: 100,
      label: "导出完成",
    });
  });

  it("prefers exact message progress when the engine reports counts", () => {
    expect(exportProgress([line("Building cache...")], true, "running", { current: 250, total: 1000 })).toMatchObject({
      value: 25,
      label: "写入导出文件",
      detail: "250 / 1,000 条消息",
    });

    expect(exportProgress([], false, "succeeded", { current: 1000, total: 1000 })).toMatchObject({
      value: 100,
      label: "导出完成",
    });
  });

  it("adds elapsed and remaining time to exact progress", () => {
    const progress = exportProgress([line("Starting built-in engine...", "stderr", 1_000)], true, "running", { current: 250, total: 1000 });

    expect(progress && exportProgressTiming(progress, [line("Starting built-in engine...", "stderr", 1_000)], 11_000)).toMatchObject({
      elapsedLabel: "10 秒",
      remainingLabel: "30 秒",
    });
  });
});
