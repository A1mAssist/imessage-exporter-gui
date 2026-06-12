import { describe, expect, it } from "vitest";
import { defaultExportConfig } from "./exportConfig";
import { clearPersistedExportConfig, loadPersistedExportConfig, persistExportConfig, SETTINGS_STORAGE_KEY } from "./persistence";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("export settings persistence", () => {
  it("persists non-sensitive export settings", () => {
    const storage = new MemoryStorage();

    const saved = persistExportConfig(
      {
        ...defaultExportConfig,
        backupPath: "C:/Users/me/Apple/MobileSync/Backup/device",
        exporterPath: "C:/Tools/imessage-exporter.exe",
        encrypted: true,
        cleartextPassword: "do-not-store",
        exportPath: "D:/Messages Export",
        format: "txt",
        copyMethod: "full",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        conversationFilter: "+15551234567",
        noLazy: true,
        customName: "Archive",
        ignoreDiskWarning: true,
        autoClearPassword: true,
      },
      storage,
    );

    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}");

    expect(saved).toBe(true);
    expect(parsed.backupPath).toBe("C:/Users/me/Apple/MobileSync/Backup/device");
    expect(parsed.exporterPath).toBe("C:/Tools/imessage-exporter.exe");
    expect(parsed.exportPath).toBe("D:/Messages Export");
    expect(parsed.format).toBe("txt");
    expect(parsed.copyMethod).toBe("full");
    expect(parsed.autoClearPassword).toBe(true);
    expect(parsed.savedAt).toEqual(expect.any(String));
  });

  it("never writes the cleartext backup password", () => {
    const storage = new MemoryStorage();

    persistExportConfig(
      {
        ...defaultExportConfig,
        cleartextPassword: "super-secret-backup-password",
      },
      storage,
    );

    const raw = storage.getItem(SETTINGS_STORAGE_KEY) ?? "";
    const parsed = JSON.parse(raw);

    expect(raw).not.toContain("super-secret-backup-password");
    expect(parsed.cleartextPassword).toBeUndefined();
  });

  it("drops a cleartext password from old or edited storage while loading", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "D:/Export",
        encrypted: true,
        cleartextPassword: "legacy-secret",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.backupPath).toBe("C:/Backup");
    expect(loaded.exportPath).toBe("D:/Export");
    expect(loaded.encrypted).toBe(true);
    expect(loaded.cleartextPassword).toBe("");
  });

  it("drops HTML-only no-lazy mode from persisted TXT settings", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        backupPath: "C:/Backup",
        exportPath: "D:/Export",
        format: "txt",
        noLazy: true,
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.format).toBe("txt");
    expect(loaded.noLazy).toBe(false);
  });

  it("falls back to the base config when storage is corrupt", () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, "{bad-json");

    expect(loadPersistedExportConfig(defaultExportConfig, storage)).toEqual(defaultExportConfig);
  });

  it("clears saved settings", () => {
    const storage = new MemoryStorage();
    persistExportConfig({ ...defaultExportConfig, exportPath: "D:/Export" }, storage);

    expect(clearPersistedExportConfig(storage)).toBe(true);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
