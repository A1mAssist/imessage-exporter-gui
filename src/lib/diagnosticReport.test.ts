import { describe, expect, it } from "vitest";
import { defaultExportConfig } from "./exportConfig";
import { summarizeDiagnostics } from "./diagnostics";
import { buildDiagnosticReport, redactSensitiveText } from "./diagnosticReport";

describe("diagnostic reports", () => {
  it("includes environment, backup state, diagnostics, command, and redacted logs", () => {
    const report = buildDiagnosticReport({
      generatedAt: new Date("2026-06-12T01:30:00.000Z"),
      environment: {
        exporterAvailable: true,
        exporterVersion: "imessage-exporter 4.1.0",
        exporterPath: "C:\\Tools\\imessage-exporter.exe",
        verifiedExporterVersion: "4.1.0",
        exporterVersionStatus: "verified",
        ffmpegAvailable: false,
        imagemagickAvailable: false,
        defaultBackupRoots: [],
        warnings: ["mock warning"],
      },
      backup: {
        path: "C:\\Backup",
        displayName: "A1mAssist 的 iPhone",
        hasManifestDb: true,
        hasInfoPlist: true,
        encrypted: true,
        valid: true,
      },
      config: {
        ...defaultExportConfig,
        backupPath: "C:\\Backup",
        encrypted: true,
        cleartextPassword: "super-secret",
      },
      diagnostics: summarizeDiagnostics("Message diagnostic data: Total messages: 12\nConverter diagnostic data: ffmpeg missing"),
      preview: {
        executable: "imessage-exporter",
        args: [],
        redacted: "imessage-exporter --cleartext-password [redacted]",
      },
      logs: [{ id: "1", kind: "stderr", text: "failed with super-secret", timestamp: 1 }],
    });

    expect(report).toContain("iMessage Exporter GUI 诊断报告");
    expect(report).toContain("imessage-exporter 4.1.0");
    expect(report).toContain("A1mAssist 的 iPhone");
    expect(report).toContain("12 条消息");
    expect(report).toContain("[redacted]");
    expect(report).not.toContain("super-secret");
  });

  it("redacts password-like command fragments", () => {
    expect(redactSensitiveText('run --cleartext-password "abc 123"', [])).toContain("--cleartext-password [redacted]");
  });
});
