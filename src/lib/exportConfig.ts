import type { CopyMethod, EnvironmentStatus, ExportConfig, ExportFormat } from "../types";

export const defaultExportConfig: ExportConfig = {
  kind: "iosBackup",
  backupPath: "",
  encrypted: false,
  cleartextPassword: "",
  exportPath: "",
  format: "html",
  copyMethod: "clone",
  startDate: "",
  endDate: "",
  conversationFilter: "",
  noLazy: false,
  customName: "",
  useCallerId: false,
  ignoreDiskWarning: false,
  autoClearPassword: false,
};

export const exportFormats: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: "html", label: "HTML", description: "保留更多富文本和附件引用，适合归档与打印。" },
  { value: "txt", label: "TXT", description: "纯文本输出，更轻量，适合检索和长期保存。" },
];

export const copyMethods: Array<{ value: CopyMethod; label: string; description: string }> = [
  { value: "disabled", label: "disabled", description: "不复制附件，导出最快，输出最轻。" },
  { value: "clone", label: "clone", description: "复制原始附件，Windows 第一版推荐。" },
  { value: "basic", label: "basic", description: "基础转换，需要 ffmpeg/ImageMagick。" },
  { value: "full", label: "full", description: "完整转换，需要 ffmpeg/ImageMagick，耗时更久。" },
];

export function normalizeConfig(config: ExportConfig): ExportConfig {
  return {
    ...config,
    cleartextPassword: trimOrUndefined(config.cleartextPassword),
    startDate: trimOrUndefined(config.startDate),
    endDate: trimOrUndefined(config.endDate),
    conversationFilter: trimOrUndefined(config.conversationFilter),
    noLazy: config.format === "html" ? config.noLazy : false,
    customName: config.useCallerId ? undefined : trimOrUndefined(config.customName),
  };
}

export function validateExportConfig(config: ExportConfig): string[] {
  const errors: string[] = [];
  if (!config.backupPath.trim()) errors.push("请选择 iOS 备份根目录。");
  if (!config.exportPath.trim()) errors.push("请选择导出输出目录。");
  if (config.backupPath.trim() && config.exportPath.trim()) {
    if (samePath(config.exportPath, config.backupPath)) {
      errors.push("输出目录不能是 iOS 备份目录本身。");
    } else if (isChildPath(config.exportPath, config.backupPath)) {
      errors.push("输出目录不能放在 iOS 备份目录内部，请选择独立文件夹。");
    }
  }
  if (config.encrypted && !config.cleartextPassword?.trim()) errors.push("加密备份需要输入密码。");
  if (config.customName?.trim() && config.useCallerId) errors.push("自定义显示名和 Caller ID 只能选择一个。");
  if (!validDate(config.startDate)) errors.push("开始日期必须是 YYYY-MM-DD。");
  if (!validDate(config.endDate)) errors.push("结束日期必须是 YYYY-MM-DD。");
  if (validDate(config.startDate) && validDate(config.endDate) && reversedDateRange(config.startDate, config.endDate)) {
    errors.push("结束日期不能早于开始日期。");
  }
  return errors;
}

export function converterWarnings(copyMethod: CopyMethod, environment?: EnvironmentStatus): string[] {
  if (!environment) return [];
  if (copyMethod !== "basic" && copyMethod !== "full") return [];

  const warnings: string[] = [];
  if (!environment.ffmpegAvailable) warnings.push("未检测到 ffmpeg，音视频转换可能失败。");
  if (!environment.imagemagickAvailable) warnings.push("未检测到 ImageMagick，HEIC 等图片转换可能失败。");
  return warnings;
}

function trimOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validDate(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function reversedDateRange(startDate?: string, endDate?: string): boolean {
  const start = startDate?.trim();
  const end = endDate?.trim();
  return Boolean(start && end && end < start);
}

function samePath(candidate: string, base: string): boolean {
  return normalizePath(candidate) === normalizePath(base);
}

function isChildPath(candidate: string, base: string): boolean {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedBase = normalizePath(base);
  return normalizedCandidate.startsWith(`${normalizedBase}/`);
}

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}
