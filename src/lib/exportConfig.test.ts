import { describe, expect, it } from "vitest";
import { converterWarnings, defaultExportConfig, normalizeConfig, validateExportConfig } from "./exportConfig";

describe("export config helpers", () => {
  it("requires source and output paths", () => {
    expect(validateExportConfig(defaultExportConfig)).toContain("请选择 iOS 备份根目录。");
    expect(validateExportConfig(defaultExportConfig)).toContain("请选择导出输出目录。");
  });

  it("requires password for encrypted backups", () => {
    const errors = validateExportConfig({
      ...defaultExportConfig,
      backupPath: "C:/Backup",
      exportPath: "C:/Out",
      encrypted: true,
    });

    expect(errors).toContain("加密备份需要输入密码。");
  });

  it("rejects exporting into the iOS backup directory", () => {
    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:\\Backups\\device\\",
      }),
    ).toContain("输出目录不能是 iOS 备份目录本身。");

    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:/Backups/device/Messages Export",
      }),
    ).toContain("输出目录不能放在 iOS 备份目录内部，请选择独立文件夹。");

    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:/Backups/device-export",
      }),
    ).not.toContain("输出目录不能放在 iOS 备份目录内部，请选择独立文件夹。");
  });

  it("normalizes empty strings to undefined", () => {
    const normalized = normalizeConfig({
      ...defaultExportConfig,
      backupPath: " C:/Backup ",
      exportPath: "C:/Out",
      startDate: " ",
      conversationFilter: " chat ",
    });

    expect(normalized.startDate).toBeUndefined();
    expect(normalized.conversationFilter).toBe("chat");
  });

  it("drops HTML-only no-lazy mode for TXT exports", () => {
    const normalized = normalizeConfig({
      ...defaultExportConfig,
      backupPath: "C:/Backup",
      exportPath: "C:/Out",
      format: "txt",
      noLazy: true,
    });

    expect(normalized.noLazy).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "C:/Out",
        startDate: "2025-03-01",
        endDate: "2025-02-28",
      }),
    ).toContain("结束日期不能早于开始日期。");
  });

  it("rejects impossible calendar dates", () => {
    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "C:/Out",
        startDate: "2025-02-30",
      }),
    ).toContain("开始日期必须是 YYYY-MM-DD。");

    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "C:/Out",
        startDate: "2024-02-29",
      }),
    ).not.toContain("开始日期必须是 YYYY-MM-DD。");
  });

  it("warns about missing converter tools", () => {
    expect(
      converterWarnings("full", {
        sidecarAvailable: true,
        ffmpegAvailable: false,
        imagemagickAvailable: false,
        defaultBackupRoots: [],
        warnings: [],
      }),
    ).toHaveLength(2);
  });
});
