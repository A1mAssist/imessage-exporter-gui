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

export function summarizeDiagnostics(log: string): DiagnosticSummary {
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
