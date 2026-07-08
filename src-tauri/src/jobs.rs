use std::{
    collections::HashMap,
    fs::{self, File},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    app::now_millis,
    engine,
    models::{JobEvent, JobEventKind, JobStarted},
};

const CHECKPOINT_FILE: &str = ".imessage-exporter-gui-checkpoint.json";

trait JobEventSink: Clone + Send + 'static {
    fn emit_job_event(&self, event: JobEvent);
}

#[derive(Clone)]
struct TauriJobEventSink {
    app: AppHandle,
}

impl JobEventSink for TauriJobEventSink {
    fn emit_job_event(&self, event: JobEvent) {
        let _ = self.app.emit("job:event", event);
    }
}

#[derive(Clone, Default)]
struct LogRedactor {
    secrets: Arc<Vec<String>>,
}

impl LogRedactor {
    fn from_secret(secret: Option<&str>) -> Self {
        let secrets = secret
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| vec![value.to_string()])
            .unwrap_or_default();
        Self {
            secrets: Arc::new(secrets),
        }
    }

    fn redact(&self, text: String) -> String {
        self.secrets.iter().fold(text, |current, secret| {
            current.replace(secret, "[redacted]")
        })
    }
}

#[derive(Default)]
pub struct JobRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl JobRegistry {
    pub fn spawn_engine(
        &self,
        app: AppHandle,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        self.spawn_engine_with_sink(TauriJobEventSink { app }, options)
    }

    pub fn spawn_export(
        &self,
        app: AppHandle,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        self.spawn_export_with_sink(TauriJobEventSink { app }, options)
    }

    fn spawn_engine_with_sink<S: JobEventSink>(
        &self,
        sink: S,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        self.spawn_engine_job(sink, options, None)
    }

    fn spawn_export_with_sink<S: JobEventSink>(
        &self,
        sink: S,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        let final_path = options.export_path.clone();
        self.spawn_engine_job(
            sink,
            options,
            Some(Box::new(move |job_id, options| {
                let staging = choose_export_staging(&final_path, job_id, options);
                let stage_path = staging.stage_path.clone();
                if stage_path.exists() {
                    if !staging.resumed {
                        return Err(format!(
                            "Temporary export directory already exists: {}",
                            stage_path.display()
                        ));
                    }
                } else if let Some(parent) = stage_path.parent() {
                    fs::create_dir_all(parent).map_err(|err| {
                        format!("Failed to prepare temporary export parent: {err}")
                    })?;
                    fs::create_dir_all(&stage_path).map_err(|err| {
                        format!("Failed to prepare temporary export directory: {err}")
                    })?;
                }

                options.export_path = stage_path.clone();
                options.resume_export = true;
                Ok(staging)
            })),
        )
    }

    fn spawn_engine_job<S: JobEventSink>(
        &self,
        sink: S,
        mut options: imessage_exporter::Options,
        staging_factory: Option<StagingFactory>,
    ) -> Result<JobStarted, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Job registry is poisoned".to_string())?;

        if !guard.is_empty() {
            return Err("A diagnostic or export job is already running".to_string());
        }

        let redactor = LogRedactor::from_secret(options.cleartext_password.as_deref());
        let job_id = Uuid::new_v4().to_string();
        let staging = staging_factory
            .map(|factory| factory(&job_id, &mut options))
            .transpose()?;
        let cancel_flag = Arc::new(AtomicBool::new(false));
        guard.insert(job_id.clone(), Arc::clone(&cancel_flag));
        drop(guard);

        self.spawn_engine_runner(
            sink,
            redactor,
            job_id.clone(),
            cancel_flag,
            options,
            staging,
        );

        Ok(JobStarted { job_id })
    }

    pub fn cancel(&self, job_id: &str) -> Result<(), String> {
        let cancel_flag = {
            let guard = self
                .inner
                .lock()
                .map_err(|_| "Job registry is poisoned".to_string())?;
            guard
                .get(job_id)
                .cloned()
                .ok_or_else(|| "No running job found".to_string())?
        };

        cancel_flag.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn has_active(&self) -> bool {
        self.inner
            .lock()
            .map(|guard| !guard.is_empty())
            .unwrap_or(false)
    }

    fn spawn_engine_runner<S: JobEventSink>(
        &self,
        sink: S,
        redactor: LogRedactor,
        job_id: String,
        cancel_flag: Arc<AtomicBool>,
        options: imessage_exporter::Options,
        staging: Option<ExportStaging>,
    ) {
        let registry = ArcJobRegistry {
            inner: Arc::clone(&self.inner),
        };

        thread::spawn(move || {
            emit_event(
                &sink,
                &redactor,
                &job_id,
                JobEventKind::Stderr,
                Some(format!("Starting {}...", engine::ENGINE_LABEL)),
                None,
            );
            if let Some(staging) = staging.as_ref().filter(|staging| staging.resumed) {
                emit_event(
                    &sink,
                    &redactor,
                    &job_id,
                    JobEventKind::Stderr,
                    Some(format!(
                        "Resuming incomplete export at {}",
                        staging.stage_path.display()
                    )),
                    None,
                );
            }

            let log_sink = sink.clone();
            let log_redactor = redactor.clone();
            let log_job_id = job_id.clone();
            let progress_sink = sink.clone();
            let progress_job_id = job_id.clone();
            let result = engine::run_with_logger_and_progress(
                options,
                move |stream, line| {
                    let kind = match stream {
                        imessage_exporter::LogStream::Stdout => JobEventKind::Stdout,
                        imessage_exporter::LogStream::Stderr => JobEventKind::Stderr,
                    };
                    emit_event(
                        &log_sink,
                        &log_redactor,
                        &log_job_id,
                        kind,
                        Some(line),
                        None,
                    );
                },
                move |current, total| {
                    emit_progress_event(&progress_sink, &progress_job_id, current, total);
                },
                Arc::clone(&cancel_flag),
            );
            let was_cancelled = cancel_flag.load(Ordering::SeqCst);

            match result {
                Err(imessage_exporter::RuntimeError::Cancelled) | Ok(()) if was_cancelled => {
                    emit_incomplete_export(&sink, &redactor, &job_id, staging.as_ref());
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some("Job cancelled by user request.".to_string()),
                        None,
                    );
                }
                Ok(()) => match staging.as_ref().map(finalize_export).transpose() {
                    Ok(_) => {
                        emit_event(&sink, &redactor, &job_id, JobEventKind::Exit, None, Some(0));
                    }
                    Err(err) => {
                        emit_incomplete_export(&sink, &redactor, &job_id, staging.as_ref());
                        emit_event(
                            &sink,
                            &redactor,
                            &job_id,
                            JobEventKind::Error,
                            Some(err),
                            None,
                        );
                    }
                },
                Err(err) => {
                    emit_incomplete_export(&sink, &redactor, &job_id, staging.as_ref());
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some(err.to_string()),
                        None,
                    );
                }
            }

            registry.remove(&job_id);
        });
    }
}

type StagingFactory =
    Box<dyn FnOnce(&str, &mut imessage_exporter::Options) -> Result<ExportStaging, String> + Send>;

struct ExportStaging {
    final_path: PathBuf,
    stage_path: PathBuf,
    resumed: bool,
}

fn choose_export_staging(
    final_path: &Path,
    job_id: &str,
    options: &imessage_exporter::Options,
) -> ExportStaging {
    let resumable_path = resumable_staging_export_path(final_path);
    if is_resume_checkpoint_compatible(
        &resumable_path,
        export_format_label(options).as_deref(),
        options.resume_fingerprint.as_deref(),
    ) {
        return ExportStaging {
            final_path: final_path.to_path_buf(),
            stage_path: resumable_path,
            resumed: true,
        };
    }

    let stage_path = if resumable_path.exists() {
        staging_export_path(final_path, job_id)
    } else {
        resumable_path
    };

    ExportStaging {
        final_path: final_path.to_path_buf(),
        stage_path,
        resumed: false,
    }
}

fn resumable_staging_export_path(final_path: &Path) -> PathBuf {
    let name = final_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("export");
    let stage_name = format!(".imessage-exporter-gui-{name}.partial");
    final_path
        .parent()
        .map(|parent| parent.join(&stage_name))
        .unwrap_or_else(|| PathBuf::from(stage_name))
}

fn staging_export_path(final_path: &Path, job_id: &str) -> PathBuf {
    let name = final_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("export");
    let stage_name = format!(".imessage-exporter-gui-{name}-{job_id}.partial");
    final_path
        .parent()
        .map(|parent| parent.join(&stage_name))
        .unwrap_or_else(|| PathBuf::from(stage_name))
}

fn finalize_export(staging: &ExportStaging) -> Result<(), String> {
    if !staging.stage_path.is_dir() {
        return Err(format!(
            "Temporary export directory was not created: {}",
            staging.stage_path.display()
        ));
    }
    remove_staging_checkpoint(&staging.stage_path)?;

    if !staging.final_path.exists() {
        fs::rename(&staging.stage_path, &staging.final_path)
            .map_err(|err| format!("Failed to publish export: {err}"))?;
        return Ok(());
    }

    if staging.final_path.is_dir()
        && fs::read_dir(&staging.final_path)
            .map_err(|err| format!("Failed to inspect export directory: {err}"))?
            .next()
            .is_none()
    {
        fs::remove_dir(&staging.final_path)
            .map_err(|err| format!("Failed to replace empty export directory: {err}"))?;
        fs::rename(&staging.stage_path, &staging.final_path)
            .map_err(|err| format!("Failed to publish export: {err}"))?;
        return Ok(());
    }

    publish_into_existing_directory(&staging.stage_path, &staging.final_path)
}

fn export_format_label(options: &imessage_exporter::Options) -> Option<String> {
    options.export_type.as_ref().map(|export_type| {
        match export_type {
            imessage_exporter::app::export_type::ExportType::Html => "html",
            imessage_exporter::app::export_type::ExportType::Jsonl => "jsonl",
            imessage_exporter::app::export_type::ExportType::Txt => "txt",
        }
        .to_string()
    })
}

fn is_resume_checkpoint_compatible(
    stage_path: &Path,
    format: Option<&str>,
    fingerprint: Option<&str>,
) -> bool {
    let Some(format) = format else {
        return false;
    };
    let checkpoint_path = stage_path.join(CHECKPOINT_FILE);
    if !checkpoint_path.is_file() {
        return false;
    }
    let Ok(file) = File::open(checkpoint_path) else {
        return false;
    };
    let Ok(value) = serde_json::from_reader::<_, Value>(file) else {
        return false;
    };
    value.get("version").and_then(Value::as_u64) == Some(1)
        && value.get("format").and_then(Value::as_str) == Some(format)
        && value.get("fingerprint").and_then(Value::as_str) == fingerprint
}

fn publish_into_existing_directory(stage_path: &Path, final_path: &Path) -> Result<(), String> {
    if !final_path.is_dir() {
        return Err("Export path exists but is not a directory.".to_string());
    }

    let entries = fs::read_dir(stage_path)
        .map_err(|err| format!("Failed to read temporary export: {err}"))?
        .map(|entry| {
            let entry =
                entry.map_err(|err| format!("Failed to read temporary export entry: {err}"))?;
            Ok((entry.path(), final_path.join(entry.file_name())))
        })
        .collect::<Result<Vec<_>, String>>()?;

    for (_, destination) in &entries {
        if destination.exists() {
            return Err(format!(
                "Export result already exists at {}; temporary export was kept at {}",
                destination.display(),
                stage_path.display()
            ));
        }
    }

    for (source, destination) in entries {
        fs::rename(source, destination)
            .map_err(|err| format!("Failed to publish export entry: {err}"))?;
    }
    fs::remove_dir(stage_path)
        .map_err(|err| format!("Failed to remove temporary export directory: {err}"))?;
    Ok(())
}

fn remove_staging_checkpoint(stage_path: &Path) -> Result<(), String> {
    let checkpoint = stage_path.join(CHECKPOINT_FILE);
    if checkpoint.exists() {
        fs::remove_file(&checkpoint).map_err(|err| {
            format!(
                "Failed to remove temporary export checkpoint {}: {err}",
                checkpoint.display()
            )
        })?;
    }
    Ok(())
}

fn emit_incomplete_export<S: JobEventSink>(
    sink: &S,
    redactor: &LogRedactor,
    job_id: &str,
    staging: Option<&ExportStaging>,
) {
    if let Some(staging) = staging {
        emit_event(
            sink,
            redactor,
            job_id,
            JobEventKind::Stderr,
            Some(format!(
                "Incomplete export kept at {}",
                staging.stage_path.display()
            )),
            None,
        );
    }
}

struct ArcJobRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ArcJobRegistry {
    fn remove(&self, job_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(job_id);
        }
    }
}

fn emit_event<S: JobEventSink>(
    sink: &S,
    redactor: &LogRedactor,
    job_id: &str,
    kind: JobEventKind,
    text: Option<String>,
    code: Option<i32>,
) {
    sink.emit_job_event(JobEvent {
        job_id: job_id.to_string(),
        kind,
        text: text.map(|text| redactor.redact(text)),
        code,
        current: None,
        total: None,
        timestamp: now_millis(),
    });
}

fn emit_progress_event<S: JobEventSink>(sink: &S, job_id: &str, current: u64, total: u64) {
    sink.emit_job_event(JobEvent {
        job_id: job_id.to_string(),
        kind: JobEventKind::Progress,
        text: None,
        code: None,
        current: Some(current),
        total: Some(total),
        timestamp: now_millis(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine,
        models::{CopyMethod, ExportConfig, ExportFormat, SourceConfig, SourceKind},
    };
    use std::{
        fs,
        sync::atomic::AtomicBool,
        sync::mpsc::{self, Receiver, Sender},
        time::{Duration, Instant},
    };

    #[derive(Clone)]
    struct TestSink {
        sender: Sender<JobEvent>,
    }

    impl JobEventSink for TestSink {
        fn emit_job_event(&self, event: JobEvent) {
            let _ = self.sender.send(event);
        }
    }

    fn test_sink() -> (TestSink, Receiver<JobEvent>) {
        let (sender, receiver) = mpsc::channel();
        (TestSink { sender }, receiver)
    }

    fn collect_until_terminal(receiver: &Receiver<JobEvent>, job_id: &str) -> Vec<JobEvent> {
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut events = Vec::new();

        while Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match receiver.recv_timeout(remaining.min(Duration::from_millis(250))) {
                Ok(event) if event.job_id == job_id => {
                    let terminal =
                        event.kind == JobEventKind::Exit || event.kind == JobEventKind::Error;
                    events.push(event);
                    if terminal {
                        return events;
                    }
                }
                Ok(_) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }

        panic!("timed out waiting for terminal event for job {job_id}");
    }

    fn missing_backup_source() -> SourceConfig {
        SourceConfig {
            kind: crate::models::SourceKind::IosBackup,
            backup_path: std::env::temp_dir()
                .join(format!("imessage-exporter-gui-missing-{}", Uuid::new_v4()))
                .display()
                .to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        }
    }

    fn unique_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("imessage-exporter-gui-{name}-{}", Uuid::new_v4()))
    }

    fn export_config(export_path: PathBuf) -> ExportConfig {
        ExportConfig {
            kind: SourceKind::IosBackup,
            backup_path: std::env::temp_dir()
                .join(format!("imessage-exporter-gui-backup-{}", Uuid::new_v4()))
                .display()
                .to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
            export_path: export_path.display().to_string(),
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
    fn engine_job_emits_start_log_and_error() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let source = missing_backup_source();
        let options = engine::diagnostics_options(&source).unwrap();

        let job = registry.spawn_engine_with_sink(sink, options).unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);

        assert!(events.iter().any(|event| {
            event.kind == JobEventKind::Stderr
                && event
                    .text
                    .as_deref()
                    .is_some_and(|text| text.contains(engine::ENGINE_LABEL))
        }));
        assert!(events.iter().any(|event| event.kind == JobEventKind::Error));
    }

    #[test]
    fn rejects_second_active_engine_job() {
        let registry = JobRegistry::default();
        registry
            .inner
            .lock()
            .unwrap()
            .insert("active-job".to_string(), Arc::new(AtomicBool::new(false)));
        let (sink, _receiver) = test_sink();
        let source = missing_backup_source();
        let options = engine::diagnostics_options(&source).unwrap();
        let error = registry.spawn_engine_with_sink(sink, options).unwrap_err();
        assert_eq!(error, "A diagnostic or export job is already running");
    }

    #[test]
    fn redacts_cleartext_password_from_engine_events() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let mut source = missing_backup_source();
        source.encrypted = true;
        source.cleartext_password = Some("super-secret".to_string());
        let options = engine::diagnostics_options(&source).unwrap();

        let job = registry.spawn_engine_with_sink(sink, options).unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);
        let output = events
            .iter()
            .filter_map(|event| event.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(!output.contains("super-secret"));
    }

    #[test]
    fn finalize_export_publishes_staged_export_to_empty_target() {
        let root = unique_temp_dir("stage-success");
        let final_path = root.join("Messages Export");
        let stage_path = staging_export_path(&final_path, "job-1");
        fs::create_dir_all(&stage_path).unwrap();
        fs::write(stage_path.join("chat.html"), "ok").unwrap();
        fs::write(stage_path.join(CHECKPOINT_FILE), "{}").unwrap();

        finalize_export(&ExportStaging {
            final_path: final_path.clone(),
            stage_path: stage_path.clone(),
            resumed: false,
        })
        .unwrap();

        assert!(final_path.join("chat.html").is_file());
        assert!(!final_path.join(CHECKPOINT_FILE).exists());
        assert!(!stage_path.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn choose_export_staging_uses_stable_partial_when_available() {
        let root = unique_temp_dir("stage-stable");
        let final_path = root.join("Messages Export");
        let options = engine::export_options(&export_config(final_path.clone())).unwrap();

        let staging = choose_export_staging(&final_path, "job-1", &options);

        assert_eq!(
            staging.stage_path,
            resumable_staging_export_path(&final_path)
        );
        assert!(!staging.resumed);
    }

    #[test]
    fn choose_export_staging_reuses_matching_checkpoint_partial() {
        let root = unique_temp_dir("stage-resume");
        let final_path = root.join("Messages Export");
        let options = engine::export_options(&export_config(final_path.clone())).unwrap();
        let stage_path = resumable_staging_export_path(&final_path);
        fs::create_dir_all(&stage_path).unwrap();
        fs::write(
            stage_path.join(CHECKPOINT_FILE),
            format!(
                "{{\"version\":1,\"format\":\"html\",\"fingerprint\":{},\"completed\":100,\"last_rowid\":123,\"files\":{{}}}}",
                serde_json::to_string(&options.resume_fingerprint).unwrap()
            ),
        )
        .unwrap();

        let staging = choose_export_staging(&final_path, "job-2", &options);

        assert_eq!(staging.stage_path, stage_path);
        assert!(staging.resumed);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn choose_export_staging_avoids_old_partial_without_checkpoint() {
        let root = unique_temp_dir("stage-old");
        let final_path = root.join("Messages Export");
        let options = engine::export_options(&export_config(final_path.clone())).unwrap();
        let stable_stage = resumable_staging_export_path(&final_path);
        fs::create_dir_all(&stable_stage).unwrap();

        let staging = choose_export_staging(&final_path, "job-3", &options);

        assert_eq!(
            staging.stage_path,
            staging_export_path(&final_path, "job-3")
        );
        assert!(!staging.resumed);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finalize_export_keeps_partial_when_existing_target_would_conflict() {
        let root = unique_temp_dir("stage-conflict");
        let final_path = root.join("Messages Export");
        let stage_path = staging_export_path(&final_path, "job-2");
        fs::create_dir_all(&final_path).unwrap();
        fs::create_dir_all(&stage_path).unwrap();
        fs::write(stage_path.join("a-new-chat.html"), "new").unwrap();
        fs::write(final_path.join("chat.html"), "old").unwrap();
        fs::write(stage_path.join("chat.html"), "new").unwrap();

        let error = finalize_export(&ExportStaging {
            final_path: final_path.clone(),
            stage_path: stage_path.clone(),
            resumed: false,
        })
        .unwrap_err();

        assert!(error.contains("temporary export was kept"));
        assert_eq!(
            fs::read_to_string(final_path.join("chat.html")).unwrap(),
            "old"
        );
        assert!(!final_path.join("a-new-chat.html").exists());
        assert_eq!(
            fs::read_to_string(stage_path.join("a-new-chat.html")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(stage_path.join("chat.html")).unwrap(),
            "new"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
