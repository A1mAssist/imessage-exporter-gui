use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};

use imessage_database::util::{platform::Platform, query_context::QueryContext};
use imessage_exporter::{
    app::{
        compatibility::attachment_manager::{AttachmentManager, AttachmentManagerMode},
        export_type::ExportType,
    },
    run_with_options_logger_and_cancel, AtomicCancellationToken, LogStream, Options, RuntimeError,
};

use crate::{
    cli,
    models::{CopyMethod, ExportConfig, ExportFormat, SourceConfig},
};

pub const ENGINE_LABEL: &str = "built-in imessage-exporter";
pub const ENGINE_VERSION: &str = "4.1.0 + JSONL";

pub fn diagnostics_options(config: &SourceConfig) -> Result<Options, String> {
    cli::validate_backup_path_string(&config.backup_path)?;

    Ok(base_options(config, None, None, true)?)
}

pub fn export_options(config: &ExportConfig) -> Result<Options, String> {
    let _ = cli::export_args(config)?;

    let source = SourceConfig {
        kind: config.kind.clone(),
        backup_path: config.backup_path.clone(),
        exporter_path: config.exporter_path.clone(),
        encrypted: config.encrypted,
        cleartext_password: config.cleartext_password.clone(),
    };
    let mut options = base_options(
        &source,
        Some(config.export_path.clone()),
        Some(&config.format),
        false,
    )?;
    options.attachment_manager = AttachmentManager::from(copy_method(&config.copy_method));
    options.no_lazy =
        matches!(config.format, ExportFormat::Html) && config.no_lazy.unwrap_or(false);
    options.custom_name = clean(config.custom_name.as_deref());
    options.use_caller_id = config.use_caller_id.unwrap_or(false);
    options.ignore_disk_space = config.ignore_disk_warning.unwrap_or(false);
    options.conversation_filter = clean(config.conversation_filter.as_deref());

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

pub fn run_with_logger<F>(
    options: Options,
    sink: F,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), RuntimeError>
where
    F: FnMut(LogStream, String) + 'static,
{
    run_with_options_logger_and_cancel(
        options,
        sink,
        Arc::new(AtomicCancellationToken::new(cancel_flag)),
    )
}

fn base_options(
    source: &SourceConfig,
    export_path: Option<String>,
    export_format: Option<&ExportFormat>,
    diagnostic: bool,
) -> Result<Options, String> {
    let cleartext_password = if source.encrypted {
        Some(
            clean(source.cleartext_password.as_deref())
                .ok_or_else(|| "Encrypted backups require a password".to_string())?,
        )
    } else {
        None
    };

    Ok(Options {
        db_path: PathBuf::from(source.backup_path.trim()),
        attachment_root: None,
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
        platform: Platform::iOS,
        ignore_disk_space: false,
        conversation_filter: None,
        cleartext_password,
        contacts_path: None,
        show_progress: false,
    })
}

fn export_type(format: &ExportFormat) -> ExportType {
    match format {
        ExportFormat::Html => ExportType::Html,
        ExportFormat::Txt => ExportType::Txt,
        ExportFormat::Jsonl => ExportType::Jsonl,
    }
}

fn copy_method(method: &CopyMethod) -> AttachmentManagerMode {
    match method {
        CopyMethod::Disabled => AttachmentManagerMode::Disabled,
        CopyMethod::Clone => AttachmentManagerMode::Clone,
        CopyMethod::Basic => AttachmentManagerMode::Basic,
        CopyMethod::Full => AttachmentManagerMode::Full,
    }
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
    use std::sync::atomic::Ordering;

    #[test]
    fn run_with_logger_honors_pre_cancelled_flag() {
        let source = SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: std::env::temp_dir()
                .join("imessage-exporter-gui-cancelled")
                .display()
                .to_string(),
            exporter_path: None,
            encrypted: false,
            cleartext_password: None,
        };
        let options = diagnostics_options(&source).unwrap();
        let cancel_flag = Arc::new(AtomicBool::new(true));

        let err = run_with_logger(options, |_stream, _line| {}, Arc::clone(&cancel_flag))
            .expect_err("pre-cancelled run should stop before opening the data source");

        assert!(matches!(err, RuntimeError::Cancelled));
        assert!(cancel_flag.load(Ordering::SeqCst));
    }
}
