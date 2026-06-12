export function timestampedArchivePath({
  exportPath,
  backupPath,
  now = new Date(),
}: {
  exportPath?: string;
  backupPath?: string;
  now?: Date;
}): string {
  const base = parentPath(exportPath) ?? documentsPathFromBackup(backupPath) ?? "";
  const name = buildArchiveStem(now);
  return base ? joinPath(base, name) : name;
}

export type TimestampedArchiveSequence = {
  stem: string;
  startSuffix: number;
};

export function timestampedArchiveSequence({
  exportPath,
  backupPath,
  now = new Date(),
}: {
  exportPath?: string;
  backupPath?: string;
  now?: Date;
}): TimestampedArchiveSequence {
  const current = archiveStemFromPath(exportPath);
  if (current) return current;
  return { stem: timestampedArchivePath({ exportPath, backupPath, now }), startSuffix: 1 };
}

export function formatArchiveTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}${minute}`;
}

function parentPath(path?: string): string | undefined {
  const trimmed = path?.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return undefined;
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index <= 0) return undefined;
  return trimmed.slice(0, index);
}

function archiveStemFromPath(path?: string): TimestampedArchiveSequence | undefined {
  const trimmed = path?.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return undefined;

  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  const parent = index >= 0 ? trimmed.slice(0, index) : "";
  const basename = index >= 0 ? trimmed.slice(index + 1) : trimmed;
  const match = basename.match(/^Messages Export \d{4}-\d{2}-\d{2} \d{4}(?: \((\d+)\))?$/);
  if (!match) return undefined;

  const stemName = basename.replace(/ \(\d+\)$/, "");
  return {
    stem: parent ? joinPath(parent, stemName) : stemName,
    startSuffix: match[1] ? Number(match[1]) + 1 : 2,
  };
}

function buildArchiveStem(now: Date): string {
  return `Messages Export ${formatArchiveTimestamp(now)}`;
}

function documentsPathFromBackup(path?: string): string | undefined {
  const normalized = path?.trim().replace(/\//g, "\\");
  if (!normalized) return undefined;
  const match = normalized.match(/^([A-Za-z]:\\Users\\[^\\]+)/);
  return match ? `${match[1]}\\Documents` : undefined;
}

function joinPath(base: string, child: string): string {
  const separator = base.includes("/") && !base.includes("\\") ? "/" : "\\";
  return `${base.replace(/[\\/]+$/, "")}${separator}${child}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
