export type ExportFormat = "html" | "txt" | "jsonl";
export type CopyMethod = "disabled" | "clone" | "basic" | "full";
export type ExportFilenameMode = "contactName" | "contactNameWithCallerId" | "chatIdentifier";
export type ExportArchiveNameMode = "conversationTimestamp" | "timestamp";

export type SourceConfig = {
  kind: "iosBackup" | "macosChatDb";
  backupPath: string;
  exporterPath?: string;
  attachmentRoot?: string;
  contactsPath?: string;
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
  conversationId?: number;
  conversationIds?: number[];
  noLazy?: boolean;
  customName?: string;
  useCallerId?: boolean;
  filenameMode?: ExportFilenameMode;
  archiveNameMode?: ExportArchiveNameMode;
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
  chatIds: number[];
  title: string;
  subtitle?: string;
  filterValue: string;
  service?: string;
  messageCount: number;
  lastMessageAt?: string;
  isGroup: boolean;
};

export type SourceInspection = {
  ready: boolean;
  databaseReadable: boolean;
  encrypted?: boolean;
  deviceName?: string;
  productVersion?: string;
  messageCount?: number;
  chatCount?: number;
  attachmentCount?: number;
  attachmentBytes?: number;
  warnings: string[];
  error?: string;
};

export type DiagnosticDetails = {
  handles: {
    totalHandles: number;
    handlesWithMultipleIds?: number;
    totalDuplicated: number;
  };
  messages: {
    totalMessages: number;
    messagesWithoutChat: number;
    messagesInMultipleChats: number;
    recoverableMessages?: number;
    firstMessageDate?: number;
    lastMessageDate?: number;
  };
  attachments: {
    totalAttachments: number;
    totalBytesReferenced: number;
    totalBytesOnDisk: number;
    missingFiles: number;
    noPathProvided: number;
    noFileLocated: number;
    missingPercent?: number;
  };
  chats: {
    totalChats: number;
    totalDuplicated: number;
    chatsWithNoHandles: number;
  };
  contacts: {
    resolvedNames: number;
    totalParticipants: number;
  };
  databaseBytes?: number;
  warnings: string[];
};

export type ExportPathStatus = {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  parentExists: boolean;
  writable?: boolean;
  availableBytes?: number;
  pathLength: number;
  entryCount?: number;
  containsHtml: boolean;
  containsTxt: boolean;
  containsAttachments: boolean;
  interruptedExports: string[];
  warnings: string[];
  error?: string;
};

export type JobStarted = {
  jobId: string;
};

export type JobProgress = {
  current: number;
  total: number;
};

export type JsonlSearchMatch = {
  lineNumber: number;
  preview: string;
};

export type ExportHistoryEntry = {
  id: string;
  exportPath: string;
  format: ExportFormat;
  conversationLabel?: string;
  messageCount?: number;
  finishedAt: string;
};

export type JobEvent = {
  jobId: string;
  kind: "stdout" | "stderr" | "progress" | "exit" | "error";
  text?: string;
  code?: number;
  current?: number;
  total?: number;
  timestamp: number;
};

export type LogLine = {
  id: string;
  kind: Exclude<JobEvent["kind"], "progress">;
  text: string;
  timestamp: number;
};

export type WorkspaceSectionId = "source" | "diagnostics" | "options" | "run";
