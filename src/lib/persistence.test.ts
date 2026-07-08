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
        kind: "macosChatDb",
        backupPath: "C:/Users/me/Apple/MobileSync/Backup/device",
        exporterPath: "C:/Tools/imessage-exporter.exe",
        attachmentRoot: "C:/Users/me/Library/Messages",
        contactsPath: "C:/Users/me/Library/Application Support/AddressBook/Sources/demo/AddressBook-v22.abcddb",
        encrypted: true,
        cleartextPassword: "do-not-store",
        exportPath: "D:/Messages Export",
        format: "html",
        copyMethod: "full",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        conversationFilter: "+15551234567",
        conversationId: 42,
        conversationIds: [43, 42],
        noLazy: true,
        customName: "Archive",
        filenameMode: "chatIdentifier",
        archiveNameMode: "timestamp",
        ignoreDiskWarning: true,
        autoClearPassword: true,
      },
      storage,
    );

    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}");

    expect(saved).toBe(true);
    expect(parsed.backupPath).toBe("C:/Users/me/Apple/MobileSync/Backup/device");
    expect(parsed.exporterPath).toBeUndefined();
    expect(parsed.attachmentRoot).toBe("C:/Users/me/Library/Messages");
    expect(parsed.contactsPath).toContain("AddressBook-v22.abcddb");
    expect(parsed.exportPath).toBe("D:/Messages Export");
    expect(parsed.format).toBe("html");
    expect(parsed.copyMethod).toBe("full");
    expect(parsed.filenameMode).toBe("chatIdentifier");
    expect(parsed.archiveNameMode).toBe("timestamp");
    expect(parsed.conversationId).toBe(42);
    expect(parsed.conversationIds).toEqual([42, 43]);
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

  it("drops legacy exporter paths while loading", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        exporterPath: "C:/Tools/imessage-exporter.exe",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.exporterPath).toBe("");
  });

  it("drops macOS advanced paths from iOS settings while loading", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        kind: "iosBackup",
        attachmentRoot: "C:/Users/me/Library/Messages",
        contactsPath: "C:/Users/me/AddressBook-v22.abcddb",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.attachmentRoot).toBe("");
    expect(loaded.contactsPath).toBe("");
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

  it("forces persisted TXT and JSONL settings to keep attachment export disabled", () => {
    for (const format of ["txt", "jsonl"] as const) {
      const storage = new MemoryStorage();
      persistExportConfig(
        {
          ...defaultExportConfig,
          backupPath: "C:/Backup",
          exportPath: "D:/Export",
          format,
          copyMethod: "full",
        },
        storage,
      );

      expect(loadPersistedExportConfig(defaultExportConfig, storage).copyMethod).toBe("disabled");
    }
  });

  it("sanitizes persisted conversation id groups while loading", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        conversationIds: [5, 4, 4, 0, -1],
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.conversationIds).toEqual([4, 5]);
  });

  it("falls back from invalid persisted filename modes", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        filenameMode: "bad",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.filenameMode).toBe("contactName");
  });

  it("keeps contact plus caller id persisted filename mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        filenameMode: "contactNameWithCallerId",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.filenameMode).toBe("contactNameWithCallerId");
  });

  it("falls back from invalid persisted archive name modes", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...defaultExportConfig,
        archiveNameMode: "bad",
      }),
    );

    const loaded = loadPersistedExportConfig(defaultExportConfig, storage);

    expect(loaded.archiveNameMode).toBe("conversationTimestamp");
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
