import { describe, expect, it } from "vitest";
import { formatArchiveTimestamp, sanitizePathSegment, timestampedArchivePath, timestampedArchiveSequence } from "./archivePath";

const now = new Date(2026, 5, 12, 1, 30);

describe("timestampedArchivePath", () => {
  it("creates a sibling archive directory from the current export path", () => {
    expect(
      timestampedArchivePath({
        exportPath: "C:\\Users\\me\\Documents\\Messages Export",
        backupPath: "C:\\Users\\me\\Apple\\MobileSync\\Backup\\device",
        now,
      }),
    ).toBe("C:\\Users\\me\\Documents\\Messages Export 2026-06-12 0130");
  });

  it("falls back to the Windows user Documents folder derived from the backup path", () => {
    expect(
      timestampedArchivePath({
        backupPath: "C:/Users/A1mAssist/Apple/MobileSync/Backup/00008110-demo",
        now,
      }),
    ).toBe("C:\\Users\\A1mAssist\\Documents\\Messages Export 2026-06-12 0130");
  });

  it("formats timestamps without path-hostile characters", () => {
    expect(formatArchiveTimestamp(now)).toBe("2026-06-12 0130");
    expect(timestampedArchivePath({ now })).toBe("Messages Export 2026-06-12 0130");
  });

  it("uses a safe conversation label for single-conversation archive folders", () => {
    expect(
      timestampedArchivePath({
        exportPath: "C:\\Users\\me\\Documents\\Messages Export",
        label: "Family/旅行:2026",
        now,
      }),
    ).toBe("C:\\Users\\me\\Documents\\Family_旅行_2026 - Messages Export 2026-06-12 0130");
  });

  it("continues from an existing timestamped archive path", () => {
    expect(
      timestampedArchiveSequence({
        exportPath: "C:\\Users\\me\\Documents\\Messages Export 2026-06-12 0130",
        backupPath: "C:\\Users\\me\\Apple\\MobileSync\\Backup\\device",
        now,
      }),
    ).toEqual({ stem: "C:\\Users\\me\\Documents\\Messages Export 2026-06-12 0130", startSuffix: 2 });
  });

  it("increments archive suffixes from repeated generated names", () => {
    expect(
      timestampedArchiveSequence({
        exportPath: "C:\\Users\\me\\Documents\\Messages Export 2026-06-12 0130 (2)",
        now,
      }),
    ).toEqual({ stem: "C:\\Users\\me\\Documents\\Messages Export 2026-06-12 0130", startSuffix: 3 });
  });

  it("continues from an existing labeled timestamped archive path", () => {
    expect(
      timestampedArchiveSequence({
        exportPath: "C:\\Users\\me\\Documents\\Alex Chen - Messages Export 2026-06-12 0130 (3)",
        now,
      }),
    ).toEqual({ stem: "C:\\Users\\me\\Documents\\Alex Chen - Messages Export 2026-06-12 0130", startSuffix: 4 });
  });

  it("sanitizes reserved and invalid path segment names", () => {
    expect(sanitizePathSegment("CON")).toBe("_CON");
    expect(sanitizePathSegment("Bank/Alerts:*?")).toBe("Bank_Alerts___");
    expect(sanitizePathSegment(" Family. ")).toBe("Family");
  });
});
