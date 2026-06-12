import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  BackupCandidate,
  CommandPreview,
  EnvironmentStatus,
  ExportConfig,
  ExportFormat,
  ExportPathStatus,
  JobEvent,
  JobStarted,
  SourceConfig,
} from "../types";

type Unlisten = () => void;

const mockListeners = new Set<(event: JobEvent) => void>();
const mockTimers = new Map<string, number[]>();
type MockLine = string | { kind: JobEvent["kind"]; text: string };

function usingMockApi() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("mock") || !("__TAURI_INTERNALS__" in window);
}

export function getEnvironment() {
  if (usingMockApi()) return Promise.resolve(mockEnvironment());
  return invoke<EnvironmentStatus>("get_environment");
}

export function scanIosBackups() {
  if (usingMockApi()) return Promise.resolve(mockBackups());
  return invoke<BackupCandidate[]>("scan_ios_backups");
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

export function openFirstResult(exportPath: string, format: ExportFormat) {
  if (usingMockApi()) {
    console.info("[mock] open first result", format, exportPath);
    return Promise.resolve();
  }
  return invoke<void>("open_first_result", { exportPath, format });
}

export type ResourceFile = "license" | "thirdPartyNotices" | "sidecarNotes";

export function openResourceFile(file: ResourceFile) {
  if (usingMockApi()) {
    console.info("[mock] open resource file", file);
    return Promise.resolve();
  }
  return invoke<void>("open_resource_file", { file });
}

export function previewExportCommand(config: ExportConfig) {
  if (usingMockApi()) return Promise.resolve(mockPreview(config));
  return invoke<CommandPreview>("preview_export_command", { config });
}

export function inspectExportPath(path: string) {
  if (usingMockApi()) return Promise.resolve(mockExportPathStatus(path));
  return invoke<ExportPathStatus>("inspect_export_path", { path });
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

export async function pickDirectory(defaultPath?: string, purpose: "backup" | "export" = "backup"): Promise<string | undefined> {
  if (usingMockApi()) {
    if (purpose === "export") return "C:\\Users\\A1mAssist\\Documents\\Messages Export";
    return defaultPath || "C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup\\00008110-demo";
  }

  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
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
  return {
    path,
    exists,
    isDirectory: true,
    parentExists,
    entryCount: exists ? 3 : undefined,
    containsHtml: exists,
    containsTxt: false,
    containsAttachments: exists,
    warnings: exists
      ? ["输出目录已有 3 个项目，导出结果可能会与旧文件混在一起。", "检测到疑似旧导出文件，建议选择一个新的空目录。"]
      : [],
  };
}

function mockEnvironment(): EnvironmentStatus {
  const params = new URLSearchParams(window.location.search);
  const missingSidecar = params.has("missingSidecar");
  return {
    sidecarAvailable: !missingSidecar,
    sidecarVersion: missingSidecar ? undefined : "imessage-exporter 4.1.0",
    ffmpegAvailable: false,
    imagemagickAvailable: false,
    defaultBackupRoots: [
      "C:\\Users\\A1mAssist\\Apple\\MobileSync\\Backup",
      "C:\\Users\\A1mAssist\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup",
    ],
    warnings: [
      missingSidecar ? "Mock 模式：模拟 sidecar 缺失，诊断和导出会被禁用。" : "Mock 模式：未调用真实 sidecar。basic/full 附件转换仍会显示依赖提示。",
    ],
  };
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

function startMockDiagnostics(source: SourceConfig): Promise<JobStarted> {
  const preview = mockPreview({
    ...source,
    exportPath: "diagnostics",
    format: "html",
    copyMethod: "disabled",
  });
  preview.redacted = [
    "imessage-exporter",
    "-d",
    "-p",
    quote(source.backupPath),
    "-a",
    "iOS",
    "--no-progress",
    ...(source.encrypted ? ["--cleartext-password", "[redacted]"] : []),
  ].join(" ");
  const job = mockJob(preview, [
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
    return Promise.resolve(mockJob(mockPreview(config), failure.lines, failure.code));
  }

  return Promise.resolve(
    mockJob(mockPreview(config), [
      "Building cache...",
      "  [1/5] Caching chats...",
      "  [2/5] Caching chatrooms...",
      "  [3/5] Caching participants...",
      `Exporting 42 conversations as ${config.format.toUpperCase()}...`,
      `Copied attachments with ${config.copyMethod} strategy.`,
      `Export complete: ${config.exportPath}`,
    ]),
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
  if (fail === "sidecar") {
    return {
      code: 127,
      lines: [{ kind: "stderr", text: "failed to spawn sidecar: imessage-exporter not found (ENOENT)." }],
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

function mockJob(preview: CommandPreview, lines: MockLine[], exitCode = 0): JobStarted {
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
  timers.push(
    window.setTimeout(() => {
      emitMock({ jobId, kind: "exit", code: exitCode });
      mockTimers.delete(jobId);
    }, 450 + lines.length * 420),
  );

  return { jobId, preview };
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

function mockPreview(config: ExportConfig): CommandPreview {
  const args = [
    "-p",
    config.backupPath,
    "-a",
    "iOS",
    "-o",
    config.exportPath,
    "-f",
    config.format,
    "-c",
    config.copyMethod,
    "--no-progress",
  ];

  if (config.encrypted) args.push("--cleartext-password", "[redacted]");
  if (config.startDate) args.push("-s", config.startDate);
  if (config.endDate) args.push("-e", config.endDate);
  if (config.conversationFilter) args.push("-t", config.conversationFilter);
  if (config.format === "html" && config.noLazy) args.push("-l");
  if (config.customName) args.push("-m", config.customName);
  if (config.useCallerId) args.push("-i");
  if (config.ignoreDiskWarning) args.push("-b");

  return {
    executable: "imessage-exporter",
    args,
    redacted: ["imessage-exporter", ...args.map(quote)].join(" "),
  };
}

function quote(value: string) {
  return /\s/.test(value) ? `"${value.replace(/"/g, "\\\"")}"` : value;
}
