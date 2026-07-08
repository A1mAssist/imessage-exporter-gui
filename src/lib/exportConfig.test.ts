import { describe, expect, it } from "vitest";
import { converterWarnings, defaultExportConfig, normalizeConfig, resolveConversationSelection, validateExportConfig } from "./exportConfig";

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

  it("rejects exporting into the source directory", () => {
    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:\\Backups\\device\\",
      }),
    ).toContain("输出目录不能和数据源路径相同。");

    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:/Backups/device/Messages Export",
      }),
    ).toContain("输出目录不能放在数据源目录内部，请选择独立文件夹。");

    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backups/device",
        exportPath: "C:/Backups/device-export",
      }),
    ).not.toContain("输出目录不能放在数据源目录内部，请选择独立文件夹。");
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

  it("uses exact conversation ids instead of a text filter when present", () => {
    const normalized = normalizeConfig({
      ...defaultExportConfig,
      backupPath: "C:/Backup",
      exportPath: "C:/Out",
      conversationFilter: "Alex",
      conversationIds: [43, 42, 42],
    });

    expect(normalized.conversationIds).toEqual([42, 43]);
    expect(normalized.conversationFilter).toBeUndefined();
  });

  it("backfills merged chat ids from a saved primary conversation id", () => {
    const resolved = resolveConversationSelection(
      {
        ...defaultExportConfig,
        conversationId: 18,
      },
      [
        {
          id: "18",
          chatIds: [18, 19],
          title: "Merged Caller",
          filterValue: "+15551230001",
          messageCount: 269795,
          isGroup: false,
        },
      ],
    );

    expect(normalizeConfig(resolved).conversationIds).toEqual([18, 19]);
  });

  it("keeps macOS advanced paths only for macOS chat.db sources", () => {
    const macos = normalizeConfig({
      ...defaultExportConfig,
      kind: "macosChatDb",
      backupPath: "C:/Messages/chat.db",
      exportPath: "C:/Out",
      attachmentRoot: " C:/Messages ",
      contactsPath: " C:/AddressBook-v22.abcddb ",
    });
    const ios = normalizeConfig({
      ...macos,
      kind: "iosBackup",
    });

    expect(macos.attachmentRoot).toBe("C:/Messages");
    expect(macos.contactsPath).toBe("C:/AddressBook-v22.abcddb");
    expect(ios.attachmentRoot).toBeUndefined();
    expect(ios.contactsPath).toBeUndefined();
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

  it("forces attachment export off for TXT and JSONL exports", () => {
    for (const format of ["txt", "jsonl"] as const) {
      expect(
        normalizeConfig({
          ...defaultExportConfig,
          backupPath: "C:/Backup",
          exportPath: "C:/Out",
          format,
          copyMethod: "full",
        }).copyMethod,
      ).toBe("disabled");
    }
  });

  it("keeps a valid filename mode and falls back from invalid values", () => {
    expect(normalizeConfig({ ...defaultExportConfig, filenameMode: "chatIdentifier" }).filenameMode).toBe("chatIdentifier");
    expect(normalizeConfig({ ...defaultExportConfig, filenameMode: "contactNameWithCallerId" }).filenameMode).toBe("contactNameWithCallerId");
    expect(normalizeConfig({ ...defaultExportConfig, filenameMode: "bad" as never }).filenameMode).toBe("contactName");
  });

  it("keeps a valid archive name mode and falls back from invalid values", () => {
    expect(normalizeConfig({ ...defaultExportConfig, archiveNameMode: "timestamp" }).archiveNameMode).toBe("timestamp");
    expect(normalizeConfig({ ...defaultExportConfig, archiveNameMode: "bad" as never }).archiveNameMode).toBe("conversationTimestamp");
  });

  it("prevents conflicting self-name options", () => {
    expect(
      validateExportConfig({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "C:/Out",
        customName: "Me",
        useCallerId: true,
      }),
    ).toContain("我的显示名和 Caller ID 只能选择一个。");
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
        exporterAvailable: true,
        exporterVersion: "imessage-exporter 4.1.0",
        exporterPath: "C:\\Tools\\imessage-exporter.exe",
        verifiedExporterVersion: "4.1.0",
        exporterVersionStatus: "verified",
        ffmpegAvailable: false,
        imagemagickAvailable: false,
        defaultBackupRoots: [],
        warnings: [],
      }),
    ).toHaveLength(2);
  });
});
