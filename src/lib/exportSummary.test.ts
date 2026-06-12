import { describe, expect, it } from "vitest";
import type { LogLine } from "../types";
import { summarizeExportResult } from "./exportSummary";

function line(text: string, kind: LogLine["kind"] = "stdout"): LogLine {
  return { id: text, kind, text, timestamp: 1 };
}

describe("summarizeExportResult", () => {
  it("summarizes successful HTML exports from logs and config", () => {
    const summary = summarizeExportResult({
      logs: [line("Copied attachments with clone strategy."), line("Export complete: C:\\Messages Export")],
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
});
