import type { DiagnosticDetails } from "../types";

export type DiagnosticStatus = "ok" | "warn" | "unknown";

export type DiagnosticFinding = {
  status: DiagnosticStatus;
  detail: string;
};

export type DiagnosticSummary = {
  database: DiagnosticFinding;
  attachments: DiagnosticFinding;
  contacts: DiagnosticFinding;
  converters: DiagnosticFinding;
};

export function summarizeDiagnostics(log: string, details?: DiagnosticDetails): DiagnosticSummary {
  if (details) return summarizeStructuredDiagnostics(log, details);

  const lines = log
    .split(/\r?\n/)
    .map((line) => ({ raw: line, lower: line.toLowerCase() }))
    .filter((line) => line.raw.trim());

  return {
    database: findingFrom(lines, ["chat.db", "sms.db", "database", "message diagnostic"], "数据库状态", [
      [/total messages:\s*([\d,]+)/i, (value) => `${value} 条消息`],
    ]),
    attachments: findingFrom(lines, ["attachment", "attachments"], "附件状态", [[/total attachments:\s*([\d,]+)/i, (value) => `${value} 个附件`]]),
    contacts: findingFrom(lines, ["contact", "contacts", "addressbook"], "联系人状态", [
      [/resolved contacts/i, () => "联系人解析可用"],
      [/contact diagnostic data/i, () => "联系人数据可用"],
    ]),
    converters: converterFinding(lines),
  };
}

function summarizeStructuredDiagnostics(log: string, details: DiagnosticDetails): DiagnosticSummary {
  return {
    database: {
      status: details.messages.messagesWithoutChat || details.messages.messagesInMultipleChats || details.chats.chatsWithNoHandles ? "warn" : "ok",
      detail: `${details.messages.totalMessages} 条消息 · ${details.chats.totalChats} 个会话`,
    },
    attachments: {
      status: details.attachments.missingFiles ? "warn" : "ok",
      detail: details.attachments.missingFiles
        ? `${details.attachments.totalAttachments} 个附件，缺失 ${details.attachments.missingFiles} 个`
        : `${details.attachments.totalAttachments} 个附件`,
    },
    contacts:
      details.contacts.totalParticipants > 0
        ? {
            status: details.contacts.resolvedNames ? "ok" : "warn",
            detail: details.contacts.resolvedNames
              ? `联系人解析可用 · ${details.contacts.resolvedNames}/${details.contacts.totalParticipants}`
              : `0/${details.contacts.totalParticipants} 个联系人已解析`,
          }
        : { status: "unknown", detail: "没有可解析联系人" },
    converters: converterFinding(
      log
        .split(/\r?\n/)
        .map((line) => ({ raw: line, lower: line.toLowerCase() }))
        .filter((line) => line.raw.trim()),
    ),
  };
}

function findingFrom(
  lines: Array<{ raw: string; lower: string }>,
  positiveNeedles: string[],
  fallbackLabel: string,
  detailPatterns: Array<[RegExp, (value: string) => string]> = [],
): DiagnosticFinding {
  const relevant = lines.filter((line) => positiveNeedles.some((needle) => line.lower.includes(needle)));
  if (!relevant.length) return { status: "unknown", detail: "等待诊断日志" };

  const status: DiagnosticStatus = relevant.some((line) => hasWarning(line.lower)) ? "warn" : "ok";
  const detail = detailFromPatterns(relevant.map((line) => line.raw).join("\n"), detailPatterns) ?? (status === "warn" ? `${fallbackLabel}需注意` : `${fallbackLabel}已确认`);
  return { status, detail };
}

function converterFinding(lines: Array<{ raw: string; lower: string }>): DiagnosticFinding {
  const relevant = lines.filter((line) => ["ffmpeg", "imagemagick", "magick", "converter"].some((needle) => line.lower.includes(needle)));
  if (!relevant.length) return { status: "unknown", detail: "等待转换器诊断" };

  const text = relevant.map((line) => line.lower).join("\n");
  const missing = [
    text.includes("ffmpeg") && hasWarning(text) ? "ffmpeg" : undefined,
    (text.includes("imagemagick") || text.includes("magick")) && hasWarning(text) ? "ImageMagick" : undefined,
  ].filter(Boolean);

  if (missing.length) return { status: "warn", detail: `缺少 ${missing.join(" / ")}` };
  return { status: "ok", detail: "转换器可用" };
}

function detailFromPatterns(text: string, patterns: Array<[RegExp, (value: string) => string]>): string | undefined {
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match?.[1] !== undefined) return format(match[1]);
    if (match) return format("");
  }
  return undefined;
}

function hasWarning(text: string): boolean {
  return ["error", "missing", "not found", "failed"].some((needle) => text.includes(needle));
}
