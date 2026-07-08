import { describe, expect, it } from "vitest";
import { summarizeDiagnostics } from "./diagnostics";

describe("summarizeDiagnostics", () => {
  it("marks mentioned healthy sections as ok", () => {
    const summary = summarizeDiagnostics("Database checked.\nAttachments checked.\nContacts checked.\nffmpeg available.");

    expect(summary.database.status).toBe("ok");
    expect(summary.attachments.status).toBe("ok");
    expect(summary.contacts.status).toBe("ok");
    expect(summary.converters.status).toBe("ok");
  });

  it("marks missing converter as warning", () => {
    expect(summarizeDiagnostics("ImageMagick missing").converters).toMatchObject({
      status: "warn",
      detail: "缺少 ImageMagick",
    });
  });

  it("keeps converter warnings from contaminating other sections", () => {
    const summary = summarizeDiagnostics(
      [
        "Message diagnostic data: Total messages: 128482",
        "Attachment diagnostic data: Total attachments: 9421",
        "Contact diagnostic data: resolved contacts from iOS backup",
        "Converter diagnostic data: ffmpeg missing, ImageMagick missing",
      ].join("\n"),
    );

    expect(summary.database).toEqual({ status: "ok", detail: "128482 条消息" });
    expect(summary.attachments).toEqual({ status: "ok", detail: "9421 个附件" });
    expect(summary.contacts).toEqual({ status: "ok", detail: "联系人解析可用" });
    expect(summary.converters).toEqual({ status: "warn", detail: "缺少 ffmpeg / ImageMagick" });
  });

  it("uses structured diagnostic details when available", () => {
    const summary = summarizeDiagnostics("ffmpeg available", {
      handles: { totalHandles: 3, totalDuplicated: 0 },
      messages: {
        totalMessages: 12,
        messagesWithoutChat: 0,
        messagesInMultipleChats: 0,
      },
      attachments: {
        totalAttachments: 5,
        totalBytesReferenced: 100,
        totalBytesOnDisk: 80,
        missingFiles: 2,
        noPathProvided: 1,
        noFileLocated: 1,
      },
      chats: {
        totalChats: 2,
        totalDuplicated: 0,
        chatsWithNoHandles: 0,
      },
      contacts: {
        resolvedNames: 1,
        totalParticipants: 3,
      },
      warnings: [],
    });

    expect(summary.database).toEqual({ status: "ok", detail: "12 条消息 · 2 个会话" });
    expect(summary.attachments).toEqual({ status: "warn", detail: "5 个附件，缺失 2 个" });
    expect(summary.contacts).toEqual({ status: "ok", detail: "联系人解析可用 · 1/3" });
  });
});
