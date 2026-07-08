import type { ExportHistoryEntry } from "../types";

export const EXPORT_HISTORY_STORAGE_KEY = "imessage-exporter-gui.exportHistory.v1";
const maxHistoryEntries = 8;

export function loadExportHistory(storage: Storage | undefined = safeLocalStorage()): ExportHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeEntry).filter(Boolean).slice(0, maxHistoryEntries) as ExportHistoryEntry[];
  } catch {
    return [];
  }
}

export function recordExportHistory(entry: ExportHistoryEntry, storage: Storage | undefined = safeLocalStorage()): ExportHistoryEntry[] {
  const next = [entry, ...loadExportHistory(storage).filter((item) => item.exportPath !== entry.exportPath)].slice(0, maxHistoryEntries);
  if (storage) {
    try {
      storage.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota/private-mode failures; history is convenience only.
    }
  }
  return next;
}

function sanitizeEntry(value: unknown): ExportHistoryEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Partial<ExportHistoryEntry>;
  if (!entry.id || !entry.exportPath || !entry.finishedAt) return undefined;
  if (entry.format !== "html" && entry.format !== "txt" && entry.format !== "jsonl") return undefined;
  return {
    id: String(entry.id),
    exportPath: String(entry.exportPath),
    format: entry.format,
    conversationLabel: entry.conversationLabel ? String(entry.conversationLabel) : undefined,
    messageCount: Number.isFinite(entry.messageCount) ? entry.messageCount : undefined,
    finishedAt: String(entry.finishedAt),
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
