import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import type {
  AppDiagnostics,
  BackupCandidate,
  ConversationCandidate,
  DiagnosticDetails,
  EnvironmentStatus,
  ExportConfig,
  ExportFormat,
  ExportPathStatus,
  JsonlSearchMatch,
  JobEvent,
  JobStarted,
  SourceConfig,
  SourceInspection,
  UpdateInfo,
} from "../types";

type Unlisten = () => void;

const mockListeners = new Set<(event: JobEvent) => void>();
const mockTimers = new Map<string, number[]>();
const deletedMockInterruptedExports = new Set<string>();
let pendingUpdate: Update | null = null;
type MockLine = string | { kind: Exclude<JobEvent["kind"], "progress">; text: string };

function usingMockApi() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("mock") || !("__TAURI_INTERNALS__" in window);
}

export function getEnvironment() {
  if (usingMockApi()) return Promise.resolve(mockEnvironment());
  return invoke<EnvironmentStatus>("get_environment");
}

export function getAppDiagnostics() {
  if (usingMockApi()) return Promise.resolve(mockAppDiagnostics());
  return invoke<AppDiagnostics>("get_app_diagnostics");
}

export async function checkForAppUpdate(): Promise<UpdateInfo> {
  if (usingMockApi()) return mockUpdateInfo();
  const update = await check({ timeout: 15000 });
  pendingUpdate = update;
  if (!update) return { available: false };
  return {
    available: true,
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
  };
}

export async function installAvailableUpdate(onProgress?: (event: DownloadEvent) => void) {
  if (usingMockApi()) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    return;
  }
  if (!pendingUpdate) {
    throw new Error("No update has been selected. Check for updates first.");
  }
  await pendingUpdate.downloadAndInstall(onProgress);
  await pendingUpdate.close();
  pendingUpdate = null;
  await relaunch();
}

export function scanIosBackups() {
  if (usingMockApi()) return Promise.resolve(mockBackups());
  return invoke<BackupCandidate[]>("scan_ios_backups");
}

export function scanConversations(source: SourceConfig) {
  if (usingMockApi()) {
    try {
      return Promise.resolve(mockConversations(source.backupPath));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return invoke<ConversationCandidate[]>("scan_conversations", { source });
}

export function inspectSource(source: SourceConfig) {
  if (usingMockApi()) return Promise.resolve(mockSourceInspection(source));
  return invoke<SourceInspection>("inspect_source", { source });
}

export function inspectDiagnostics(source: SourceConfig) {
  if (usingMockApi()) return Promise.resolve(mockDiagnosticDetails());
  return invoke<DiagnosticDetails>("inspect_diagnostics", { source });
}

export function validateBackupPath(path: string) {
  if (usingMockApi()) {
    return Promise.resolve({
      path,
      displayName: path.split(/[\\/]/).filter(Boolean).pop() || "手动选择的备份",
      deviceName: undefined,
      hasManifestDb: true,
      hasInfoPlist: true,
      encrypted: false,
      valid: true,
    });
  }
  return invoke<BackupCandidate>("validate_backup_path", { path });
}

export function runDiagnostics(source: SourceConfig) {
  if (usingMockApi()) return startMockDiagnostics(source);
  return invoke<JobStarted>("run_diagnostics", { source });
}

export function startExport(config: ExportConfig) {
  if (usingMockApi()) return startMockExport(config);
  return invoke<JobStarted>("start_export", { config });
}

export function cancelJob(jobId: string) {
  if (usingMockApi()) {
    cancelMockJob(jobId);
    return Promise.resolve();
  }
  return invoke<void>("cancel_job", { jobId });
}

export function openPath(path: string) {
  if (usingMockApi()) {
    console.info("[mock] open path", path);
    return Promise.resolve();
  }
  return invoke<void>("open_path", { path });
}

export function openUrl(url: string) {
  if (usingMockApi()) {
    console.info("[mock] open url", url);
    return Promise.resolve();
  }
  return invoke<void>("open_url", { url });
}

export function openFirstResult(exportPath: string, format: ExportFormat) {
  if (usingMockApi()) {
    console.info("[mock] open first result", format, exportPath);
    return Promise.resolve();
  }
  return invoke<void>("open_first_result", { exportPath, format });
}

export type ResourceFile = "license" | "thirdPartyNotices";

export function openResourceFile(file: ResourceFile) {
  if (usingMockApi()) {
    console.info("[mock] open resource file", file);
    return Promise.resolve();
  }
  return invoke<void>("open_resource_file", { file });
}

export function inspectExportPath(path: string) {
  if (usingMockApi()) return Promise.resolve(mockExportPathStatus(path));
  return invoke<ExportPathStatus>("inspect_export_path", { path });
}

export function deleteInterruptedExport(path: string) {
  if (usingMockApi()) {
    console.info("[mock] delete interrupted export", path);
    deletedMockInterruptedExports.add(path);
    return Promise.resolve();
  }
  return invoke<void>("delete_interrupted_export", { path });
}

export function onJobEvent(handler: (event: JobEvent) => void) {
  if (usingMockApi()) {
    mockListeners.add(handler);
    return Promise.resolve(() => {
      mockListeners.delete(handler);
    });
  }
  return listen<JobEvent>("job:event", (event) => handler(event.payload));
}

export function onAppQuitBlocked(handler: () => void) {
  if (usingMockApi()) return Promise.resolve(() => {});
  return listen("app:quit-blocked", () => handler());
}

export async function pickDirectory(defaultPath?: string, purpose: "backup" | "export" | "sourceFile" | "attachmentRoot" | "contactsFile" = "backup"): Promise<string | undefined> {
  if (usingMockApi()) {
    if (purpose === "sourceFile") return "C:\\Users\\A1mAssist\\Library\\Messages\\chat.db";
    if (purpose === "attachmentRoot") return "C:\\Users\\A1mAssist\\Library\\Messages";
    if (purpose === "contactsFile") return "C:\\Users\\A1mAssist\\Library\\Application Support\\AddressBook\\Sources\\demo\\AddressBook-v22.abcddb";
    if (purpose === "export") return "C:\\Users\\A1mAssist\\Documents\\Messages Export";
    return defaultPath || "C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup\\00008110-demo";
  }

  const fileFilters =
    purpose === "sourceFile"
      ? [{ name: "Messages database", extensions: ["db"] }]
      : purpose === "contactsFile"
        ? [{ name: "Contacts database", extensions: ["abcddb", "sqlitedb", "db"] }]
        : undefined;
  const selected = await open({
    directory: purpose !== "sourceFile" && purpose !== "contactsFile",
    multiple: false,
    defaultPath,
    filters: fileFilters,
  });
  return typeof selected === "string" ? selected : undefined;
}

function mockExportPathStatus(path: string): ExportPathStatus {
  const params = new URLSearchParams(window.location.search);
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const looksLikeExport = normalized.includes("messages export");
  const generatedArchiveMatch = normalized.match(/messages export \d{4}-\d{2}-\d{2} \d{4}(?: \((\d+)\))?$/);
  const looksLikeGeneratedArchive = Boolean(generatedArchiveMatch);
  const collidesWithGeneratedArchive = params.has("archiveCollision") && looksLikeGeneratedArchive && !generatedArchiveMatch?.[1];
  const exists = looksLikeExport && (!looksLikeGeneratedArchive || collidesWithGeneratedArchive);
  const parentExists = /^[a-z]:\//.test(normalized) || normalized.startsWith("/");
  const interruptedExports =
    params.has("partialExport") && looksLikeExport
      ? [`C:\\Users\\A1mAssist\\Documents\\.imessage-exporter-gui-Messages Export-demo.partial`]
      : [];
  const visibleInterruptedExports = interruptedExports.filter((partial) => !deletedMockInterruptedExports.has(partial));
  if (visibleInterruptedExports.length !== interruptedExports.length) {
    interruptedExports.length = 0;
    interruptedExports.push(...visibleInterruptedExports);
  }
  return {
    path,
    exists,
    isDirectory: true,
    parentExists,
    writable: exists ? true : undefined,
    availableBytes: 240 * 1024 * 1024 * 1024,
    pathLength: path.length,
    entryCount: exists ? 3 : undefined,
    containsHtml: exists,
    containsTxt: false,
    containsAttachments: exists,
    interruptedExports: visibleInterruptedExports,
    warnings: [
      ...(exists ? ["输出目录已有 3 个项目，导出结果可能会与旧文件混在一起。", "检测到疑似旧导出文件，建议选择一个新的空目录。"] : []),
      ...interruptedExports.map((partial) => `检测到上次未完成的临时导出目录：${partial}。`),
    ],
  };
}

function mockEnvironment(): EnvironmentStatus {
  return {
    exporterAvailable: true,
    exporterVersion: "built-in imessage-exporter 4.1.0 + JSONL",
    exporterPath: undefined,
    verifiedExporterVersion: "4.1.0 + JSONL",
    exporterVersionStatus: "verified",
    ffmpegAvailable: false,
    imagemagickAvailable: false,
    defaultBackupRoots: [
      "C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup",
      "C:\\Users\\A1mAssist\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup",
    ],
    warnings: ["Mock 模式：未调用真实内置导出引擎。basic/full 附件转换仍会显示依赖提示。"],
  };
}

export function searchJsonlResult(exportPath: string, query: string, limit = 20) {
  if (usingMockApi()) return Promise.resolve(mockJsonlMatches(query, limit));
  return invoke<JsonlSearchMatch[]>("search_jsonl_result", { exportPath, query, limit });
}

function mockAppDiagnostics(): AppDiagnostics {
  return {
    name: "iMessage Exporter GUI",
    version: "0.2.0",
    identifier: "com.a1massist.imessage-exporter-gui",
    authors: "A1mAssist",
    description: "Desktop GUI for imessage-exporter",
    os: "windows",
    arch: "x86_64",
    family: "windows",
  };
}

function mockUpdateInfo(): Promise<UpdateInfo> {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("updateAvailable")) return Promise.resolve({ available: false, currentVersion: "0.2.0" });
  return Promise.resolve({
    available: true,
    currentVersion: "0.2.0",
    version: "0.2.1",
    date: "2026-06-17T00:00:00Z",
    body: "Mock update package for installer smoke and UI checks.",
  });
}

function mockBackups(): BackupCandidate[] {
  const params = new URLSearchParams(window.location.search);
  if (params.has("emptyBackups")) return [];

  return [
    {
      path: "C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup\\00008110-demo",
      displayName: "A1mAssist 的 iPhone",
      deviceName: "A1mAssist 的 iPhone",
      lastModified: "1781136000",
      hasManifestDb: true,
      hasInfoPlist: true,
      encrypted: true,
      valid: true,
    },
    {
      path: "C:\\Users\\A1mAssist\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup\\legacy",
      displayName: "iPhone 旧备份",
      deviceName: "iPhone 旧备份",
      lastModified: "1781049600",
      hasManifestDb: true,
      hasInfoPlist: false,
      encrypted: false,
      valid: false,
    },
  ];
}

function mockConversations(_backupPath: string): ConversationCandidate[] {
  const params = new URLSearchParams(window.location.search);
  if (params.has("conversationError")) throw new Error("无法读取 Messages 数据库，可能是备份已加密或数据库不可直接访问");
  if (params.has("emptyConversations")) return [];

  return [
    {
      id: "42",
      chatIds: [42, 43],
      title: "家庭群",
      subtitle: "+15551230001、+15551230002、mom@example.com",
      filterValue: "chat-42",
      service: "iMessage",
      messageCount: 18432,
      lastMessageAt: "2026-06-12T14:28:00Z",
      isGroup: true,
    },
    {
      id: "17",
      chatIds: [17],
      title: "Alex Chen",
      subtitle: "+15551234567",
      filterValue: "+15551234567",
      service: "iMessage",
      messageCount: 4280,
      lastMessageAt: "2026-06-09T09:11:00Z",
      isGroup: false,
    },
    {
      id: "18",
      chatIds: [18, 19],
      title: "Merged Caller",
      subtitle: "+15551230001",
      filterValue: "+15551230001",
      service: "iMessage + SMS",
      messageCount: 269795,
      lastMessageAt: "2026-07-07T08:00:00Z",
      isGroup: false,
    },
    {
      id: "8",
      chatIds: [8],
      title: "Bank Alerts",
      subtitle: "alerts@example.com",
      filterValue: "alerts@example.com",
      service: "SMS",
      messageCount: 96,
      lastMessageAt: "2026-05-30T18:45:00Z",
      isGroup: false,
    },
  ];
}

function startMockDiagnostics(source: SourceConfig): Promise<JobStarted> {
  const job = mockJob([
    "iMessage Database Diagnostics",
    "Message diagnostic data: Total messages: 128482",
    "Attachment diagnostic data: Total attachments: 9421",
    "Contact diagnostic data: resolved contacts from iOS backup",
    "Converter diagnostic data: ffmpeg missing, ImageMagick missing",
  ]);
  return Promise.resolve(job);
}

function startMockExport(config: ExportConfig): Promise<JobStarted> {
  const failure = mockFailureScenario();
  if (failure) {
    return Promise.resolve(mockJob(failure.lines, failure.code));
  }
  const copyMethod = config.format === "html" ? config.copyMethod : "disabled";

  return Promise.resolve(
    mockJob([
      "Building cache...",
      "  [1/5] Caching chats...",
      "  [2/5] Caching chatrooms...",
      "  [3/5] Caching participants...",
      `Exporting 42 conversations as ${config.format.toUpperCase()}...`,
      `Copied attachments with ${copyMethod} strategy.`,
      `Export complete: ${config.exportPath}`,
    ], 0, 1000),
  );
}

function mockFailureScenario(): { code: number; lines: MockLine[] } | undefined {
  const params = new URLSearchParams(window.location.search);
  const fail = params.get("fail");
  if (!fail) return undefined;

  if (fail === "password") {
    return {
      code: 2,
      lines: [
        "Building cache...",
        { kind: "stderr", text: "Incorrect password while decrypting iOS backup Manifest.db." },
      ],
    };
  }
  if (fail === "backup") {
    return {
      code: 3,
      lines: [{ kind: "stderr", text: "Backup is incomplete: Manifest.db or Info.plist was not found." }],
    };
  }
  if (fail === "permission") {
    return {
      code: 13,
      lines: [{ kind: "stderr", text: "Access is denied while creating the output directory." }],
    };
  }
  if (fail === "exporter") {
    return {
      code: 127,
      lines: [{ kind: "stderr", text: "Invalid command line options: unexpected argument --legacy-flag." }],
    };
  }
  if (fail === "converter") {
    return {
      code: 4,
      lines: [{ kind: "stderr", text: "ffmpeg missing for attachment conversion." }],
    };
  }
  return undefined;
}

function mockJob(lines: MockLine[], exitCode = 0, progressTotal = 0): JobStarted {
  const jobId = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timers: number[] = [];
  mockTimers.set(jobId, timers);

  lines.forEach((line, index) => {
    timers.push(
      window.setTimeout(() => {
        const eventLine = typeof line === "string" ? { kind: "stdout" as const, text: line } : line;
        emitMock({ jobId, kind: eventLine.kind, text: eventLine.text });
      }, 300 + index * 420),
    );
  });
  if (progressTotal > 0) {
    for (let current = 0; current <= progressTotal; current += 100) {
      timers.push(
        window.setTimeout(() => {
          emitMock({ jobId, kind: "progress", current, total: progressTotal });
        }, 1300 + current * 1.5),
      );
    }
  }
  timers.push(
    window.setTimeout(() => {
      emitMock({ jobId, kind: "exit", code: exitCode });
      mockTimers.delete(jobId);
    }, 450 + lines.length * 420),
  );

  return { jobId };
}

function mockSourceInspection(source: SourceConfig): SourceInspection {
  const params = new URLSearchParams(window.location.search);
  if (params.has("sourceNotReady")) {
    return {
      ready: false,
      databaseReadable: false,
      encrypted: source.encrypted,
      warnings: [],
      error: "无法读取 Messages 数据库，备份可能不完整或密码不正确",
    };
  }
  return {
    ready: true,
    databaseReadable: true,
    encrypted: source.encrypted,
    deviceName: "A1mAssist 的 iPhone",
    productVersion: source.encrypted ? "18.5" : undefined,
    messageCount: 128482,
    chatCount: 421,
    attachmentCount: 9421,
    attachmentBytes: 18 * 1024 * 1024 * 1024,
    warnings: [],
  };
}

function mockDiagnosticDetails(): DiagnosticDetails {
  return {
    handles: {
      totalHandles: 426,
      handlesWithMultipleIds: 18,
      totalDuplicated: 24,
    },
    messages: {
      totalMessages: 128482,
      messagesWithoutChat: 0,
      messagesInMultipleChats: 0,
      recoverableMessages: 12,
    },
    attachments: {
      totalAttachments: 9421,
      totalBytesReferenced: 18 * 1024 * 1024 * 1024,
      totalBytesOnDisk: 17.6 * 1024 * 1024 * 1024,
      missingFiles: 7,
      noPathProvided: 2,
      noFileLocated: 5,
      missingPercent: 0.07,
    },
    chats: {
      totalChats: 421,
      totalDuplicated: 28,
      chatsWithNoHandles: 0,
    },
    contacts: {
      resolvedNames: 318,
      totalParticipants: 402,
    },
    databaseBytes: 980 * 1024 * 1024,
    warnings: [],
  };
}

function mockJsonlMatches(query: string, limit: number): JsonlSearchMatch[] {
  const rows = [
    { lineNumber: 1, preview: '{"type":"message","sender":"Alex Chen","text":"Dinner at 7?"}' },
    { lineNumber: 2, preview: '{"type":"message","sender":"Me","text":"Yes, see you there."}' },
    { lineNumber: 3, preview: '{"type":"attachment","filename":"IMG_2042.HEIC","mime":"image/heic"}' },
  ];
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => !needle || row.preview.toLowerCase().includes(needle)).slice(0, limit);
}

function cancelMockJob(jobId: string) {
  for (const timer of mockTimers.get(jobId) ?? []) window.clearTimeout(timer);
  mockTimers.delete(jobId);
  emitMock({ jobId, kind: "error", text: "任务已取消" });
}

function emitMock(event: Omit<JobEvent, "timestamp">) {
  const payload = { ...event, timestamp: Date.now() } as JobEvent;
  for (const listener of mockListeners) listener(payload);
}
