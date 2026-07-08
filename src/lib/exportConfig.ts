import type { ConversationCandidate, CopyMethod, EnvironmentStatus, ExportArchiveNameMode, ExportConfig, ExportFilenameMode, ExportFormat } from "../types";

export const defaultExportConfig: ExportConfig = {
  kind: "iosBackup",
  backupPath: "",
  exporterPath: "",
  attachmentRoot: "",
  contactsPath: "",
  encrypted: false,
  cleartextPassword: "",
  exportPath: "",
  format: "html",
  copyMethod: "clone",
  startDate: "",
  endDate: "",
  conversationFilter: "",
  conversationId: undefined,
  conversationIds: undefined,
  noLazy: false,
  customName: "",
  useCallerId: false,
  filenameMode: "contactName",
  archiveNameMode: "conversationTimestamp",
  ignoreDiskWarning: false,
  autoClearPassword: false,
};

export const exportFormats: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: "html", label: "HTML", description: "保留更多富文本和附件引用，适合归档与打印。" },
  { value: "txt", label: "TXT", description: "纯文本输出，更轻量，适合检索和长期保存。" },
  { value: "jsonl", label: "JSONL", description: "逐行结构化 JSON，适合检索、分析和二次处理。" },
];

export const copyMethods: Array<{ value: CopyMethod; label: string; description: string }> = [
  { value: "disabled", label: "disabled", description: "不复制附件，导出最快，输出最轻。" },
  { value: "clone", label: "clone", description: "复制原始附件，不依赖本机转换器。" },
  { value: "basic", label: "basic", description: "基础转换，需要 ffmpeg/ImageMagick。" },
  { value: "full", label: "full", description: "完整转换，需要 ffmpeg/ImageMagick，耗时更久。" },
];

export const filenameModes: Array<{ value: ExportFilenameMode; label: string; description: string }> = [
  { value: "contactName", label: "联系人名", description: "按联系人或群聊名称命名，适合直接阅读归档。" },
  { value: "contactNameWithCallerId", label: "联系人名 + Caller ID", description: "同时保留可读名称和原始会话标识，适合人工核对。" },
  { value: "chatIdentifier", label: "Caller ID", description: "按原始会话标识命名，适合后续查验或脚本处理。" },
];

export const archiveNameModes: Array<{ value: ExportArchiveNameMode; label: string; description: string }> = [
  { value: "conversationTimestamp", label: "会话 + 时间", description: "新建总目录时，单会话导出带联系人或群聊名。" },
  { value: "timestamp", label: "仅时间", description: "新建总目录时，只使用 Messages Export 和时间戳。" },
];

export function normalizeConfig(config: ExportConfig): ExportConfig {
  return {
    ...config,
    exporterPath: trimOrUndefined(config.exporterPath),
    attachmentRoot: config.kind === "macosChatDb" ? trimOrUndefined(config.attachmentRoot) : undefined,
    contactsPath: config.kind === "macosChatDb" ? trimOrUndefined(config.contactsPath) : undefined,
    cleartextPassword: trimOrUndefined(config.cleartextPassword),
    startDate: trimOrUndefined(config.startDate),
    endDate: trimOrUndefined(config.endDate),
    conversationIds: normalizeConversationIds(config.conversationIds),
    conversationFilter: hasConversationIds(config) ? undefined : trimOrUndefined(config.conversationFilter),
    copyMethod: config.format === "html" ? config.copyMethod : "disabled",
    noLazy: config.format === "html" ? config.noLazy : false,
    customName: config.useCallerId ? undefined : trimOrUndefined(config.customName),
    filenameMode: isFilenameMode(config.filenameMode) ? config.filenameMode : "contactName",
    archiveNameMode: isArchiveNameMode(config.archiveNameMode) ? config.archiveNameMode : "conversationTimestamp",
  };
}

export function resolveConversationSelection(config: ExportConfig, conversations: ConversationCandidate[]): ExportConfig {
  if (config.conversationIds?.length) return config;
  const selected = conversations.find((conversation) => Number(conversation.id) === config.conversationId);
  if (!selected?.chatIds.length) return config;
  return { ...config, conversationIds: selected.chatIds };
}

function hasConversationIds(config: ExportConfig): boolean {
  return Boolean(config.conversationIds?.length || config.conversationId);
}

function normalizeConversationIds(ids?: number[]): number[] | undefined {
  const normalized = [...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0))].sort((left, right) => left - right);
  return normalized.length ? normalized : undefined;
}

function isFilenameMode(value?: string): value is ExportFilenameMode {
  return value === "contactName" || value === "contactNameWithCallerId" || value === "chatIdentifier";
}

function isArchiveNameMode(value?: string): value is ExportArchiveNameMode {
  return value === "conversationTimestamp" || value === "timestamp";
}

export function validateExportConfig(config: ExportConfig): string[] {
  const errors: string[] = [];
  if (!config.backupPath.trim()) errors.push(config.kind === "macosChatDb" ? "请选择 macOS chat.db 文件。" : "请选择 iOS 备份根目录。");
  if (!config.exportPath.trim()) errors.push("请选择导出输出目录。");
  if (config.backupPath.trim() && config.exportPath.trim()) {
    if (samePath(config.exportPath, config.backupPath)) {
      errors.push("输出目录不能和数据源路径相同。");
    } else if (isChildPath(config.exportPath, config.backupPath)) {
      errors.push("输出目录不能放在数据源目录内部，请选择独立文件夹。");
    }
  }
  if (config.kind === "iosBackup" && config.encrypted && !config.cleartextPassword?.trim()) errors.push("加密备份需要输入密码。");
  if (config.customName?.trim() && config.useCallerId) errors.push("我的显示名和 Caller ID 只能选择一个。");
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
