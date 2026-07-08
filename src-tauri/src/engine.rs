use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

use imessage_database::util::{platform::Platform, query_context::QueryContext};
use imessage_exporter::{
    app::{
        compatibility::attachment_manager::{AttachmentManager, AttachmentManagerMode},
        export_type::ExportType,
        options::FilenameMode as EngineFilenameMode,
    },
    run_with_options_logger_progress_and_cancel, AtomicCancellationToken, LogStream, Options,
    RuntimeError,
};

use crate::models::{CopyMethod, ExportConfig, ExportFilenameMode, ExportFormat, SourceConfig};

pub const ENGINE_LABEL: &str = "built-in imessage-exporter";
pub const ENGINE_VERSION: &str = "4.1.0 + JSONL";

pub fn diagnostics_options(config: &SourceConfig) -> Result<Options, String> {
    validate_source(config)?;

    Ok(base_options(config, None, None, true)?)
}

pub fn export_options(config: &ExportConfig) -> Result<Options, String> {
    validate_export(config)?;

    let source = SourceConfig {
        kind: config.kind.clone(),
        backup_path: config.backup_path.clone(),
        exporter_path: config.exporter_path.clone(),
        attachment_root: config.attachment_root.clone(),
        contacts_path: config.contacts_path.clone(),
        encrypted: config.encrypted,
        cleartext_password: config.cleartext_password.clone(),
    };
    let mut options = base_options(
        &source,
        Some(config.export_path.clone()),
        Some(&config.format),
        false,
    )?;
    options.attachment_manager = AttachmentManager::from(copy_method(config));
    options.no_lazy =
        matches!(config.format, ExportFormat::Html) && config.no_lazy.unwrap_or(false);
    options.custom_name = clean(config.custom_name.as_deref());
    options.use_caller_id = config.use_caller_id.unwrap_or(false);
    options.filename_mode = filename_mode(config);
    options.ignore_disk_space = config.ignore_disk_warning.unwrap_or(false);
    options.resume_fingerprint = Some(export_resume_fingerprint(config));
    if let Some(conversation_ids) = selected_conversation_ids(config) {
        options
            .query_context
            .set_selected_chat_ids(conversation_ids);
    } else {
        options.conversation_filter = clean(config.conversation_filter.as_deref());
    }

    if let Some(start) = clean(config.start_date.as_deref()) {
        options
            .query_context
            .set_start(&start)
            .map_err(|err| format!("Start date is invalid: {err}"))?;
    }
    if let Some(end) = clean(config.end_date.as_deref()) {
        options
            .query_context
            .set_end(&end)
            .map_err(|err| format!("End date is invalid: {err}"))?;
    }

    Ok(options)
}

pub fn run_with_logger_and_progress<F, P>(
    options: Options,
    sink: F,
    progress: P,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), RuntimeError>
where
    F: FnMut(LogStream, String) + 'static,
    P: FnMut(u64, u64) + 'static,
{
    run_with_options_logger_progress_and_cancel(
        options,
        sink,
        progress,
        Arc::new(AtomicCancellationToken::new(cancel_flag)),
    )
}

fn base_options(
    source: &SourceConfig,
    export_path: Option<String>,
    export_format: Option<&ExportFormat>,
    diagnostic: bool,
) -> Result<Options, String> {
    let platform = match source.kind {
        crate::models::SourceKind::IosBackup => Platform::iOS,
        crate::models::SourceKind::MacosChatDb => Platform::macOS,
    };
    let cleartext_password = if source.encrypted {
        if !matches!(platform, Platform::iOS) {
            return Err("Only iOS backups can be encrypted.".to_string());
        }
        Some(
            clean(source.cleartext_password.as_deref())
                .ok_or_else(|| "Encrypted backups require a password".to_string())?,
        )
    } else {
        None
    };
    let is_macos = matches!(&platform, Platform::macOS);

    Ok(Options {
        db_path: PathBuf::from(source.backup_path.trim()),
        attachment_root: source
            .attachment_root
            .as_deref()
            .and_then(|value| clean(Some(value)))
            .filter(|_| is_macos),
        attachment_manager: AttachmentManager::from(AttachmentManagerMode::Disabled),
        diagnostic,
        export_type: export_format.map(export_type),
        export_path: export_path
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("imessage-exporter-gui-diagnostics")),
        query_context: QueryContext::default(),
        no_lazy: false,
        custom_name: None,
        use_caller_id: false,
        filename_mode: EngineFilenameMode::ContactName,
        platform,
        ignore_disk_space: false,
        conversation_filter: None,
        cleartext_password,
        contacts_path: source
            .contacts_path
            .as_deref()
            .and_then(|value| clean(Some(value)))
            .filter(|_| is_macos)
            .map(PathBuf::from),
        show_progress: false,
        resume_export: false,
        resume_fingerprint: None,
    })
}

fn export_type(format: &ExportFormat) -> ExportType {
    match format {
        ExportFormat::Html => ExportType::Html,
        ExportFormat::Txt => ExportType::Txt,
        ExportFormat::Jsonl => ExportType::Jsonl,
    }
}

fn copy_method(config: &ExportConfig) -> AttachmentManagerMode {
    if !matches!(config.format, ExportFormat::Html) {
        return AttachmentManagerMode::Disabled;
    }

    match config.copy_method {
        CopyMethod::Disabled => AttachmentManagerMode::Disabled,
        CopyMethod::Clone => AttachmentManagerMode::Clone,
        CopyMethod::Basic => AttachmentManagerMode::Basic,
        CopyMethod::Full => AttachmentManagerMode::Full,
    }
}

fn filename_mode(config: &ExportConfig) -> EngineFilenameMode {
    match config.filename_mode.as_ref() {
        Some(ExportFilenameMode::ContactNameWithCallerId) => {
            EngineFilenameMode::ContactNameWithCallerId
        }
        Some(ExportFilenameMode::ChatIdentifier) => EngineFilenameMode::ChatIdentifier,
        _ => EngineFilenameMode::ContactName,
    }
}

fn selected_conversation_ids(config: &ExportConfig) -> Option<BTreeSet<i32>> {
    let ids = config
        .conversation_ids
        .as_ref()
        .map(|values| {
            values
                .iter()
                .copied()
                .filter(|id| *id > 0)
                .collect::<BTreeSet<_>>()
        })
        .filter(|values| !values.is_empty())
        .or_else(|| {
            config
                .conversation_id
                .filter(|id| *id > 0)
                .map(|id| BTreeSet::from([id]))
        })?;
    Some(ids)
}

fn export_resume_fingerprint(config: &ExportConfig) -> String {
    let mut conversation_ids = config.conversation_ids.clone().unwrap_or_default();
    if let Some(conversation_id) = config.conversation_id {
        conversation_ids.push(conversation_id);
    }
    conversation_ids.sort_unstable();
    conversation_ids.dedup();

    [
        format!("kind={:?}", config.kind),
        format!("backup={}", config.backup_path.trim()),
        format!(
            "attachmentRoot={}",
            clean(config.attachment_root.as_deref()).unwrap_or_default()
        ),
        format!(
            "contacts={}",
            clean(config.contacts_path.as_deref()).unwrap_or_default()
        ),
        format!("format={:?}", config.format),
        format!("copy={:?}", config.copy_method),
        format!(
            "start={}",
            clean(config.start_date.as_deref()).unwrap_or_default()
        ),
        format!(
            "end={}",
            clean(config.end_date.as_deref()).unwrap_or_default()
        ),
        format!(
            "filter={}",
            clean(config.conversation_filter.as_deref()).unwrap_or_default()
        ),
        format!("conversationIds={conversation_ids:?}"),
        format!("noLazy={}", config.no_lazy.unwrap_or(false)),
        format!(
            "customName={}",
            clean(config.custom_name.as_deref()).unwrap_or_default()
        ),
        format!("useCallerId={}", config.use_caller_id.unwrap_or(false)),
        format!("filenameMode={:?}", filename_mode(config)),
        format!("ignoreDisk={}", config.ignore_disk_warning.unwrap_or(false)),
    ]
    .join("\n")
}

fn validate_source(config: &SourceConfig) -> Result<(), String> {
    validate_required_path("Source path", &config.backup_path)?;
    if matches!(config.kind, crate::models::SourceKind::MacosChatDb) && config.encrypted {
        return Err("macOS chat.db sources cannot be encrypted.".to_string());
    }
    if config.encrypted && clean(config.cleartext_password.as_deref()).is_none() {
        return Err("Encrypted backups require a password".to_string());
    }
    if matches!(config.kind, crate::models::SourceKind::MacosChatDb) {
        validate_optional_directory("Attachment root", config.attachment_root.as_deref())?;
        validate_optional_file("Contacts database", config.contacts_path.as_deref())?;
    }
    Ok(())
}

fn validate_export(config: &ExportConfig) -> Result<(), String> {
    validate_source(&SourceConfig {
        kind: config.kind.clone(),
        backup_path: config.backup_path.clone(),
        exporter_path: config.exporter_path.clone(),
        attachment_root: config.attachment_root.clone(),
        contacts_path: config.contacts_path.clone(),
        encrypted: config.encrypted,
        cleartext_password: config.cleartext_password.clone(),
    })?;
    validate_required_path("Export path", &config.export_path)?;
    validate_export_path(&config.backup_path, &config.export_path)?;
    if clean(config.custom_name.as_deref()).is_some() && config.use_caller_id.unwrap_or(false) {
        return Err("Custom name and Caller ID display cannot both be enabled".to_string());
    }
    if let (Some(start), Some(end)) = (
        clean(config.start_date.as_deref()),
        clean(config.end_date.as_deref()),
    ) {
        if end < start {
            return Err("End date cannot be earlier than start date".to_string());
        }
    }
    Ok(())
}

fn validate_required_path(label: &str, path: &str) -> Result<(), String> {
    if clean(Some(path)).is_some() {
        Ok(())
    } else {
        Err(format!("{label} is required"))
    }
}

fn validate_optional_directory(label: &str, path: Option<&str>) -> Result<(), String> {
    let Some(path) = clean(path) else {
        return Ok(());
    };
    if Path::new(&path).is_dir() {
        Ok(())
    } else {
        Err(format!("{label} must be an existing directory"))
    }
}

fn validate_optional_file(label: &str, path: Option<&str>) -> Result<(), String> {
    let Some(path) = clean(path) else {
        return Ok(());
    };
    if Path::new(&path).is_file() {
        Ok(())
    } else {
        Err(format!("{label} must be an existing file"))
    }
}

fn validate_export_path(backup_path: &str, export_path: &str) -> Result<(), String> {
    let backup_path = normalize_path(backup_path);
    let export_path = normalize_path(export_path);
    if backup_path == export_path {
        return Err("Export path cannot be the iOS backup directory".to_string());
    }
    if export_path.starts_with(&format!("{backup_path}/")) {
        return Err("Export path cannot be inside the iOS backup directory".to_string());
    }
    Ok(())
}

fn normalize_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn clean(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SourceKind;
    use imessage_exporter::app::{
        compatibility::attachment_manager::AttachmentManagerMode as EngineAttachmentManagerMode,
        export_type::ExportType as EngineExportType,
    };
    use std::sync::atomic::Ordering;

    fn export_config() -> ExportConfig {
        ExportConfig {
            kind: SourceKind::IosBackup,
            backup_path: std::env::temp_dir()
                .join("imessage-exporter-gui-backup")
                .display()
                .to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
            export_path: std::env::temp_dir()
                .join("imessage-exporter-gui-export")
                .display()
                .to_string(),
            format: ExportFormat::Html,
            copy_method: CopyMethod::Clone,
            start_date: None,
            end_date: None,
            conversation_filter: None,
            conversation_id: None,
            conversation_ids: None,
            no_lazy: None,
            custom_name: None,
            use_caller_id: None,
            filename_mode: None,
            ignore_disk_warning: None,
        }
    }

    #[test]
    fn run_with_logger_honors_pre_cancelled_flag() {
        let source = SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: std::env::temp_dir()
                .join("imessage-exporter-gui-cancelled")
                .display()
                .to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        };
        let options = diagnostics_options(&source).unwrap();
        let cancel_flag = Arc::new(AtomicBool::new(true));

        let err = run_with_logger_and_progress(
            options,
            |_stream, _line| {},
            |_current, _total| {},
            Arc::clone(&cancel_flag),
        )
        .expect_err("pre-cancelled run should stop before opening the data source");

        assert!(matches!(err, RuntimeError::Cancelled));
        assert!(cancel_flag.load(Ordering::SeqCst));
    }

    #[test]
    fn export_options_prefers_exact_conversation_id() {
        let mut config = export_config();
        config.conversation_filter = Some("Alice".to_string());
        config.conversation_id = Some(42);

        let options = export_options(&config).unwrap();

        assert_eq!(
            options.query_context.selected_chat_ids,
            Some(BTreeSet::from([42]))
        );
        assert_eq!(options.conversation_filter, None);
    }

    #[test]
    fn export_options_prefers_exact_conversation_ids() {
        let mut config = export_config();
        config.conversation_filter = Some("Alice".to_string());
        config.conversation_id = Some(42);
        config.conversation_ids = Some(vec![42, 43]);

        let options = export_options(&config).unwrap();

        assert_eq!(
            options.query_context.selected_chat_ids,
            Some(BTreeSet::from([42, 43]))
        );
        assert_eq!(options.conversation_filter, None);
    }

    #[test]
    fn export_options_maps_gui_formats_to_engine_export_types() {
        for (format, expected) in [
            (ExportFormat::Html, EngineExportType::Html),
            (ExportFormat::Txt, EngineExportType::Txt),
            (ExportFormat::Jsonl, EngineExportType::Jsonl),
        ] {
            let mut config = export_config();
            config.format = format;

            let options = export_options(&config).unwrap();

            assert_eq!(options.export_type, Some(expected));
        }
    }

    #[test]
    fn export_options_maps_copy_methods_to_attachment_manager_modes() {
        for (method, expected) in [
            (CopyMethod::Disabled, EngineAttachmentManagerMode::Disabled),
            (CopyMethod::Clone, EngineAttachmentManagerMode::Clone),
            (CopyMethod::Basic, EngineAttachmentManagerMode::Basic),
            (CopyMethod::Full, EngineAttachmentManagerMode::Full),
        ] {
            let mut config = export_config();
            config.copy_method = method;

            let options = export_options(&config).unwrap();

            assert_eq!(options.attachment_manager.mode, expected);
        }
    }

    #[test]
    fn export_options_maps_filename_mode() {
        let mut config = export_config();
        config.filename_mode = Some(ExportFilenameMode::ChatIdentifier);

        let options = export_options(&config).unwrap();

        assert_eq!(options.filename_mode, EngineFilenameMode::ChatIdentifier);

        config.filename_mode = Some(ExportFilenameMode::ContactNameWithCallerId);
        let options = export_options(&config).unwrap();

        assert_eq!(
            options.filename_mode,
            EngineFilenameMode::ContactNameWithCallerId
        );
    }

    #[test]
    fn export_options_disables_attachment_export_for_txt_and_jsonl() {
        for format in [ExportFormat::Txt, ExportFormat::Jsonl] {
            let mut config = export_config();
            config.format = format;
            config.copy_method = CopyMethod::Full;

            let options = export_options(&config).unwrap();

            assert_eq!(
                options.attachment_manager.mode,
                EngineAttachmentManagerMode::Disabled
            );
        }
    }

    #[test]
    fn export_options_keeps_no_lazy_html_only() {
        let mut config = export_config();
        config.format = ExportFormat::Html;
        config.no_lazy = Some(true);
        assert!(export_options(&config).unwrap().no_lazy);

        config.format = ExportFormat::Txt;
        assert!(!export_options(&config).unwrap().no_lazy);
    }

    #[test]
    fn export_options_maps_macos_advanced_paths() {
        let root = tempfile::tempdir().unwrap();
        let chat_db = root.path().join("chat.db");
        let attachments = root.path().join("Messages");
        let contacts = root.path().join("AddressBook-v22.abcddb");
        std::fs::write(&chat_db, b"").unwrap();
        std::fs::create_dir(&attachments).unwrap();
        std::fs::write(&contacts, b"").unwrap();

        let mut config = export_config();
        config.kind = SourceKind::MacosChatDb;
        config.backup_path = chat_db.display().to_string();
        config.attachment_root = Some(attachments.display().to_string());
        config.contacts_path = Some(contacts.display().to_string());

        let options = export_options(&config).unwrap();

        assert_eq!(
            options.attachment_root,
            Some(attachments.display().to_string())
        );
        assert_eq!(options.contacts_path, Some(contacts));
    }
}
