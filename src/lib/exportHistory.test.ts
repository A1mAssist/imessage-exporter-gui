import { describe, expect, it } from "vitest";
import { EXPORT_HISTORY_STORAGE_KEY, loadExportHistory, recordExportHistory } from "./exportHistory";

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

describe("export history", () => {
  it("stores recent successful exports without duplicating paths", () => {
    const storage = new MemoryStorage();
    const first = {
      id: "1",
      exportPath: "D:/Messages Export",
      format: "html" as const,
      conversationLabel: "Alex",
      messageCount: 42,
      finishedAt: "2026-07-08T10:00:00.000Z",
    };
    const second = {
      ...first,
      id: "2",
      format: "jsonl" as const,
      finishedAt: "2026-07-08T11:00:00.000Z",
    };

    recordExportHistory(first, storage);
    const history = recordExportHistory(second, storage);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: "2", format: "jsonl" });
    expect(storage.getItem(EXPORT_HISTORY_STORAGE_KEY)).toContain("D:/Messages Export");
  });

  it("drops corrupt history", () => {
    const storage = new MemoryStorage();
    storage.setItem(EXPORT_HISTORY_STORAGE_KEY, "{bad-json");

    expect(loadExportHistory(storage)).toEqual([]);
  });
});
