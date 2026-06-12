import type { BackupCandidate, CommandPreview, EnvironmentStatus, ExportConfig, LogLine } from "../types";
import type { summarizeDiagnostics } from "./diagnostics";

type DiagnosticSummary = ReturnType<typeof summarizeDiagnostics>;

export type DiagnosticReportInput = {
  generatedAt?: Date;
  environment?: EnvironmentStatus;
  backup?: BackupCandidate;
  config: ExportConfig;
  diagnostics: DiagnosticSummary;
  preview?: CommandPreview;
  logs: LogLine[];
  secrets?: Array<string | undefined>;
};

export function buildDiagnosticReport(input: DiagnosticReportInput): string {
  const backup = input.backup;
  const environment = input.environment;
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const report = [
    "iMessage Exporter GUI 诊断报告",
    `生成时间: ${generatedAt}`,
    "",
    "环境",
    `- 导出引擎: ${environment?.exporterAvailable ? environment.exporterVersion ?? environment.exporterPath ?? "可用" : "缺失"}`,
    `- ffmpeg: ${environment?.ffmpegAvailable ? "可用" : "缺失"}`,
    `- ImageMagick: ${environment?.imagemagickAvailable ? "可用" : "缺失"}`,
    ...(environment?.warnings.length ? environment.warnings.map((warning) => `- warning: ${warning}`) : ["- warning: 无"]),
    "",
    "备份",
    `- 路径: ${input.config.backupPath || "未选择"}`,
    `- 名称: ${backup?.displayName ?? "未确认"}`,
    `- Manifest.db: ${backup?.hasManifestDb ? "存在" : "未确认或缺失"}`,
    `- Info.plist: ${backup?.hasInfoPlist ? "存在" : "未确认或缺失"}`,
    `- 加密: ${input.config.encrypted ? "是" : "否或未知"}`,
    `- 密码状态: ${input.config.encrypted ? (input.config.cleartextPassword?.trim() ? "已输入，未写入报告" : "未输入") : "不适用"}`,
    "",
    "诊断摘要",
    `- 数据库: ${input.diagnostics.database.detail}`,
    `- 附件: ${input.diagnostics.attachments.detail}`,
    `- 联系人: ${input.diagnostics.contacts.detail}`,
    `- 转换器: ${input.diagnostics.converters.detail}`,
    "",
    "脱敏命令",
    input.preview?.redacted ?? "未生成",
    "",
    "脱敏日志",
    input.logs.length ? input.logs.map((line) => `[${line.kind}] ${line.text}`).join("\n") : "暂无日志",
  ].join("\n");

  return redactSensitiveText(report, input.secrets ?? [input.config.cleartextPassword]);
}

export function redactSensitiveText(text: string, secrets: Array<string | undefined>): string {
  let redacted = text.replace(/(--cleartext-password\s+)(?:"[^"]+"|\S+)/gi, "$1[redacted]");
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value) continue;
    redacted = redacted.split(value).join("[redacted]");
  }
  return redacted;
}
