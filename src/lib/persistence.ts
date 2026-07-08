import type { ExportConfig } from "../types";

export const SETTINGS_STORAGE_KEY = "imessage-exporter-gui.exportSettings.v1";

type PersistedExportSettings = Omit<ExportConfig, "cleartextPassword"> & {
  savedAt: string;
};

const persistedKeys: Array<keyof Omit<ExportConfig, "cleartextPassword">> = [
  "kind",
  "backupPath",
  "attachmentRoot",
  "contactsPath",
  "encrypted",
  "exportPath",
  "format",
  "copyMethod",
  "startDate",
  "endDate",
  "conversationFilter",
  "conversationId",
  "conversationIds",
  "noLazy",
  "customName",
  "useCallerId",
  "filenameMode",
  "archiveNameMode",
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
    const picked = pickPersistedConfig(sanitizeLoadedConfig(config));
    if (Array.isArray(picked.conversationIds)) {
      picked.conversationIds = sanitizeConversationIds(picked.conversationIds);
    }
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...picked,
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
    kind: config.kind === "macosChatDb" ? "macosChatDb" : "iosBackup",
    exporterPath: "",
    attachmentRoot: config.kind === "macosChatDb" ? config.attachmentRoot : "",
    contactsPath: config.kind === "macosChatDb" ? config.contactsPath : "",
    cleartextPassword: "",
    encrypted: config.kind === "macosChatDb" ? false : config.encrypted,
    conversationIds: sanitizeConversationIds(config.conversationIds),
    copyMethod: config.format === "html" ? config.copyMethod : "disabled",
    noLazy: config.format === "html" ? config.noLazy : false,
    customName: config.useCallerId ? "" : config.customName,
    filenameMode:
      config.filenameMode === "chatIdentifier" || config.filenameMode === "contactNameWithCallerId"
        ? config.filenameMode
        : "contactName",
    archiveNameMode: config.archiveNameMode === "timestamp" ? "timestamp" : "conversationTimestamp",
  };
}

function sanitizeConversationIds(ids?: number[]): number[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const sanitized = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((left, right) => left - right);
  return sanitized.length ? sanitized : undefined;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
