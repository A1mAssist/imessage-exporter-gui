export type ExportFormat = "html" | "txt";
export type CopyMethod = "disabled" | "clone" | "basic" | "full";

export type SourceConfig = {
  kind: "iosBackup";
  backupPath: string;
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
  sidecarAvailable: boolean;
  sidecarVersion?: string;
  ffmpegAvailable: boolean;
  imagemagickAvailable: boolean;
  defaultBackupRoots: string[];
  warnings: string[];
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

export type WizardStep = "source" | "diagnostics" | "options" | "run";
