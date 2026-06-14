use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatus {
    pub exporter_available: bool,
    pub exporter_version: Option<String>,
    pub exporter_path: Option<String>,
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
pub struct ConversationCandidate {
    pub id: String,
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
    pub entry_count: Option<usize>,
    pub contains_html: bool,
    pub contains_txt: bool,
    pub contains_attachments: bool,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    pub kind: SourceKind,
    pub backup_path: String,
    pub exporter_path: Option<String>,
    pub encrypted: bool,
    pub cleartext_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    IosBackup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportConfig {
    pub kind: SourceKind,
    pub backup_path: String,
    pub exporter_path: Option<String>,
    pub encrypted: bool,
    pub cleartext_password: Option<String>,
    pub export_path: String,
    pub format: ExportFormat,
    pub copy_method: CopyMethod,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub conversation_filter: Option<String>,
    pub no_lazy: Option<bool>,
    pub custom_name: Option<String>,
    pub use_caller_id: Option<bool>,
    pub ignore_disk_warning: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Html,
    Txt,
}

impl ExportFormat {
    pub fn as_arg(&self) -> &'static str {
        match self {
            ExportFormat::Html => "html",
            ExportFormat::Txt => "txt",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CopyMethod {
    Disabled,
    Clone,
    Basic,
    Full,
}

impl CopyMethod {
    pub fn as_arg(&self) -> &'static str {
        match self {
            CopyMethod::Disabled => "disabled",
            CopyMethod::Clone => "clone",
            CopyMethod::Basic => "basic",
            CopyMethod::Full => "full",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPreview {
    pub executable: String,
    pub args: Vec<String>,
    pub redacted: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStarted {
    pub job_id: String,
    pub preview: CommandPreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub job_id: String,
    pub kind: JobEventKind,
    pub text: Option<String>,
    pub code: Option<i32>,
    pub timestamp: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobEventKind {
    Stdout,
    Stderr,
    Exit,
    Error,
}
