export type ExportFormat = "html" | "txt";
export type CopyMethod = "disabled" | "clone" | "basic" | "full";

export type SourceConfig = {
  kind: "iosBackup";
  backupPath: string;
  exporterPath?: string;
  encrypted: boolean;
  cleartextPassword?: string;
};

export type ExportConfig = SourceConfig & {
  exportPath: string;
  format: ExportFormat;
  copyMethod: CopyMethod;
  startDate?: string;
  endDate?: string;
  conversationFilter?: string;
  noLazy?: boolean;
  customName?: string;
  useCallerId?: boolean;
  ignoreDiskWarning?: boolean;
  autoClearPassword?: boolean;
};

export type EnvironmentStatus = {
  exporterAvailable: boolean;
  exporterVersion?: string;
  exporterPath?: string;
  verifiedExporterVersion: string;
  exporterVersionStatus: "verified" | "older" | "unknown";
  ffmpegAvailable: boolean;
  imagemagickAvailable: boolean;
  defaultBackupRoots: string[];
  warnings: string[];
};

export type AppDiagnostics = {
  name: string;
  version: string;
  identifier: string;
  authors: string;
  description: string;
  os: string;
  arch: string;
  family: string;
};

export type UpdateInfo = {
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  body?: string;
};

export type BackupCandidate = {
  path: string;
  displayName: string;
  deviceName?: string;
  lastModified?: string;
  hasManifestDb: boolean;
  hasInfoPlist: boolean;
  encrypted?: boolean;
  valid: boolean;
};

export type ConversationCandidate = {
  id: string;
  title: string;
  subtitle?: string;
  filterValue: string;
  service?: string;
  messageCount: number;
  lastMessageAt?: string;
  isGroup: boolean;
};

export type ExportPathStatus = {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  parentExists: boolean;
  entryCount?: number;
  containsHtml: boolean;
  containsTxt: boolean;
  containsAttachments: boolean;
  warnings: string[];
  error?: string;
};

export type CommandPreview = {
  executable: string;
  args: string[];
  redacted: string;
};

export type JobStarted = {
  jobId: string;
  preview: CommandPreview;
};

export type JobEvent = {
  jobId: string;
  kind: "stdout" | "stderr" | "exit" | "error";
  text?: string;
  code?: number;
  timestamp: number;
};

export type LogLine = {
  id: string;
  kind: JobEvent["kind"];
  text: string;
  timestamp: number;
};

export type WorkspaceSectionId = "source" | "diagnostics" | "options" | "run";
