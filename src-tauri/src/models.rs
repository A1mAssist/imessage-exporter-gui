use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatus {
    pub exporter_available: bool,
    pub exporter_version: Option<String>,
    pub exporter_path: Option<String>,
    pub verified_exporter_version: String,
    pub exporter_version_status: String,
    pub ffmpeg_available: bool,
    pub imagemagick_available: bool,
    pub default_backup_roots: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDiagnostics {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub authors: String,
    pub description: String,
    pub os: String,
    pub arch: String,
    pub family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResourceFile {
    License,
    ThirdPartyNotices,
}

impl ResourceFile {
    pub fn file_name(&self) -> &'static str {
        match self {
            ResourceFile::License => "LICENSE",
            ResourceFile::ThirdPartyNotices => "THIRD_PARTY_NOTICES.md",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupCandidate {
    pub path: String,
    pub display_name: String,
    pub device_name: Option<String>,
    pub last_modified: Option<String>,
    pub has_manifest_db: bool,
    pub has_info_plist: bool,
    pub encrypted: Option<bool>,
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInspection {
    pub ready: bool,
    pub database_readable: bool,
    pub encrypted: Option<bool>,
    pub device_name: Option<String>,
    pub product_version: Option<String>,
    pub message_count: Option<usize>,
    pub chat_count: Option<usize>,
    pub attachment_count: Option<usize>,
    pub attachment_bytes: Option<u64>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticDetails {
    pub handles: HandleDiagnosticDetails,
    pub messages: MessageDiagnosticDetails,
    pub attachments: AttachmentDiagnosticDetails,
    pub chats: ChatDiagnosticDetails,
    pub contacts: ContactDiagnosticDetails,
    pub database_bytes: Option<u64>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandleDiagnosticDetails {
    pub total_handles: usize,
    pub handles_with_multiple_ids: Option<usize>,
    pub total_duplicated: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDiagnosticDetails {
    pub total_messages: usize,
    pub messages_without_chat: usize,
    pub messages_in_multiple_chats: usize,
    pub recoverable_messages: Option<usize>,
    pub first_message_date: Option<i64>,
    pub last_message_date: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDiagnosticDetails {
    pub total_attachments: usize,
    pub total_bytes_referenced: u64,
    pub total_bytes_on_disk: u64,
    pub missing_files: usize,
    pub no_path_provided: usize,
    pub no_file_located: usize,
    pub missing_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDiagnosticDetails {
    pub total_chats: usize,
    pub total_duplicated: usize,
    pub chats_with_no_handles: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactDiagnosticDetails {
    pub resolved_names: usize,
    pub total_participants: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationCandidate {
    pub id: String,
    pub chat_ids: Vec<i32>,
    pub title: String,
    pub subtitle: Option<String>,
    pub filter_value: String,
    pub service: Option<String>,
    pub message_count: usize,
    pub last_message_at: Option<String>,
    pub is_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPathStatus {
    pub path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub parent_exists: bool,
    pub writable: Option<bool>,
    pub available_bytes: Option<u64>,
    pub path_length: usize,
    pub entry_count: Option<usize>,
    pub contains_html: bool,
    pub contains_txt: bool,
    pub contains_attachments: bool,
    pub interrupted_exports: Vec<String>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    pub kind: SourceKind,
    pub backup_path: String,
    pub exporter_path: Option<String>,
    pub attachment_root: Option<String>,
    pub contacts_path: Option<String>,
    pub encrypted: bool,
    pub cleartext_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    IosBackup,
    MacosChatDb,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportConfig {
    pub kind: SourceKind,
    pub backup_path: String,
    pub exporter_path: Option<String>,
    pub attachment_root: Option<String>,
    pub contacts_path: Option<String>,
    pub encrypted: bool,
    pub cleartext_password: Option<String>,
    pub export_path: String,
    pub format: ExportFormat,
    pub copy_method: CopyMethod,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub conversation_filter: Option<String>,
    pub conversation_id: Option<i32>,
    pub conversation_ids: Option<Vec<i32>>,
    pub no_lazy: Option<bool>,
    pub custom_name: Option<String>,
    pub use_caller_id: Option<bool>,
    pub filename_mode: Option<ExportFilenameMode>,
    pub ignore_disk_warning: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Html,
    Txt,
    Jsonl,
}

impl ExportFormat {
    pub fn as_arg(&self) -> &'static str {
        match self {
            ExportFormat::Html => "html",
            ExportFormat::Txt => "txt",
            ExportFormat::Jsonl => "jsonl",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFilenameMode {
    ContactName,
    ContactNameWithCallerId,
    ChatIdentifier,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CopyMethod {
    Disabled,
    Clone,
    Basic,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStarted {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonlSearchMatch {
    pub line_number: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub job_id: String,
    pub kind: JobEventKind,
    pub text: Option<String>,
    pub code: Option<i32>,
    pub current: Option<u64>,
    pub total: Option<u64>,
    pub timestamp: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobEventKind {
    Stdout,
    Stderr,
    Progress,
    Exit,
    Error,
}
