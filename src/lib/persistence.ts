import type { ExportConfig } from "../types";

export const SETTINGS_STORAGE_KEY = "imessage-exporter-gui.exportSettings.v1";

type PersistedExportSettings = Omit<ExportConfig, "cleartextPassword"> & {
  savedAt: string;
};

const persistedKeys: Array<keyof Omit<ExportConfig, "cleartextPassword">> = [
  "kind",
  "backupPath",
  "encrypted",
  "exportPath",
  "format",
  "copyMethod",
  "startDate",
  "endDate",
  "conversationFilter",
  "noLazy",
  "customName",
  "useCallerId",
  "ignoreDiskWarning",
  "autoClearPassword",
];

export function loadPersistedExportConfig(base: ExportConfig, storage: Storage | undefined = safeLocalStorage()): ExportConfig {
  if (!storage) return base;

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return base;

    const parsed = JSON.parse(raw) as Partial<PersistedExportSettings>;
    return sanitizeLoadedConfig({
      ...base,
      ...pickPersistedConfig(parsed),
      cleartextPassword: "",
    });
  } catch {
    return base;
  }
}

export function persistExportConfig(config: ExportConfig, storage: Storage | undefined = safeLocalStorage()): boolean {
  if (!storage) return false;

  try {
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...pickPersistedConfig(config),
        savedAt: new Date().toISOString(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedExportConfig(storage: Storage | undefined = safeLocalStorage()): boolean {
  if (!storage) return false;

  try {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function pickPersistedConfig(source: Partial<ExportConfig>): Partial<PersistedExportSettings> {
  const picked: Partial<PersistedExportSettings> = {};
  for (const key of persistedKeys) {
    const value = source[key];
    if (value !== undefined) {
      (picked as Record<string, unknown>)[key] = value;
    }
  }
  return picked;
}

function sanitizeLoadedConfig(config: ExportConfig): ExportConfig {
  return {
    ...config,
    kind: "iosBackup",
    exporterPath: "",
    cleartextPassword: "",
    noLazy: config.format === "html" ? config.noLazy : false,
    customName: config.useCallerId ? "" : config.customName,
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
