import { describe, expect, it } from "vitest";
import type { LogLine } from "../types";
import { recoveryHintForFailure } from "./recoveryHints";

function line(text: string, kind: LogLine["kind"] = "stderr"): LogLine {
  return { id: text, kind, text, timestamp: 1 };
}

describe("recoveryHintForFailure", () => {
  it("classifies known failure modes", () => {
    expect(recoveryHintForFailure([line("Incorrect password while decrypting backup")]).category).toBe("password");
    expect(recoveryHintForFailure([line("Manifest.db was not found")]).category).toBe("backup");
    expect(recoveryHintForFailure([line("Access is denied while creating output")]).category).toBe("permission");
    expect(recoveryHintForFailure([line("failed to spawn exporter: ENOENT")]).category).toBe("exporter");
    expect(recoveryHintForFailure([line("ffmpeg missing for attachment conversion")]).category).toBe("converter");
  });

  it("falls back to a generic hint", () => {
    const hint = recoveryHintForFailure([line("unknown export failure")]);
    expect(hint.category).toBe("generic");
    expect(hint.action).toContain("复制诊断报告");
  });

  it("classifies exporter option compatibility failures before missing-exporter hints", () => {
    for (const message of [
      "Option --no-progress is enabled, which requires --format",
      "Invalid command line options",
      "error: unexpected argument '--no-progress'",
    ]) {
      const hint = recoveryHintForFailure([line(message)]);
      expect(hint.category).toBe("exporter");
      expect(hint.title).toBe("导出引擎选项不兼容");
      expect(hint.action).toContain("复制诊断报告");
    }
  });
});
