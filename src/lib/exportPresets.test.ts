import { describe, expect, it } from "vitest";
import { defaultExportConfig } from "./exportConfig";
import { applyExportPreset, exportPresets } from "./exportPresets";

describe("export presets", () => {
  it("exposes the v1 presets in the requested order", () => {
    expect(exportPresets.map((preset) => preset.label)).toEqual(["快速归档", "轻量文本", "打印准备"]);
  });

  it("applies format, attachment strategy, and no-lazy settings", () => {
    expect(applyExportPreset(defaultExportConfig, "quickArchive")).toMatchObject({
      format: "html",
      copyMethod: "clone",
      noLazy: false,
    });
    expect(applyExportPreset(defaultExportConfig, "textLite")).toMatchObject({
      format: "txt",
      copyMethod: "disabled",
      noLazy: false,
    });
    expect(applyExportPreset(defaultExportConfig, "printReady")).toMatchObject({
      format: "html",
      copyMethod: "clone",
      noLazy: true,
    });
  });

  it("does not overwrite source path, output path, or cleartext password", () => {
    const config = {
      ...defaultExportConfig,
      backupPath: "C:\\Backups\\device",
      exportPath: "D:\\Messages Export",
      encrypted: true,
      cleartextPassword: "secret",
    };

    const next = applyExportPreset(config, "textLite");

    expect(next.backupPath).toBe(config.backupPath);
    expect(next.exportPath).toBe(config.exportPath);
    expect(next.encrypted).toBe(true);
    expect(next.cleartextPassword).toBe("secret");
  });
});
