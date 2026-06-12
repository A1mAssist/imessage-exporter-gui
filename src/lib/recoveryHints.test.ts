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
    expect(recoveryHintForFailure([line("failed to spawn sidecar: ENOENT")]).category).toBe("sidecar");
    expect(recoveryHintForFailure([line("ffmpeg missing for attachment conversion")]).category).toBe("converter");
  });

  it("falls back to a generic hint", () => {
    const hint = recoveryHintForFailure([line("unknown export failure")]);
    expect(hint.category).toBe("generic");
    expect(hint.action).toContain("stderr/stdout");
  });
});
