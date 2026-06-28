use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    app::now_millis,
    engine,
    models::{CommandPreview, JobEvent, JobEventKind, JobStarted},
};

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
    fn from_args(args: &[String]) -> Self {
        let mut secrets = Vec::new();
        let mut capture_next = false;

        for arg in args {
            if capture_next {
                let secret = arg.trim();
                if !secret.is_empty() {
                    secrets.push(secret.to_string());
                }
                capture_next = false;
                continue;
            }

            if arg == "--cleartext-password" {
                capture_next = true;
            }
        }

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
        preview: CommandPreview,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        self.spawn_engine_with_sink(TauriJobEventSink { app }, preview, options)
    }

    fn spawn_engine_with_sink<S: JobEventSink>(
        &self,
        sink: S,
        preview: CommandPreview,
        options: imessage_exporter::Options,
    ) -> Result<JobStarted, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Job registry is poisoned".to_string())?;

        if !guard.is_empty() {
            return Err("A diagnostic or export job is already running".to_string());
        }

        let redactor = LogRedactor::from_args(&preview.args);
        let job_id = Uuid::new_v4().to_string();
        let cancel_flag = Arc::new(AtomicBool::new(false));
        guard.insert(job_id.clone(), Arc::clone(&cancel_flag));
        drop(guard);

        self.spawn_engine_runner(sink, redactor, job_id.clone(), cancel_flag, options);

        Ok(JobStarted { job_id, preview })
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

    fn spawn_engine_runner<S: JobEventSink>(
        &self,
        sink: S,
        redactor: LogRedactor,
        job_id: String,
        cancel_flag: Arc<AtomicBool>,
        options: imessage_exporter::Options,
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

            let log_sink = sink.clone();
            let log_redactor = redactor.clone();
            let log_job_id = job_id.clone();
            let result = engine::run_with_logger(
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
                Arc::clone(&cancel_flag),
            );
            let was_cancelled = cancel_flag.load(Ordering::SeqCst);

            match result {
                Err(imessage_exporter::RuntimeError::Cancelled) | Ok(()) if was_cancelled => {
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some("Job cancelled by user request.".to_string()),
                        None,
                    );
                }
                Ok(()) => {
                    emit_event(&sink, &redactor, &job_id, JobEventKind::Exit, None, Some(0));
                }
                Err(err) => {
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
        timestamp: now_millis(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{cli, engine, models::SourceConfig};
    use std::{
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
            encrypted: false,
            cleartext_password: None,
        }
    }

    #[test]
    fn engine_job_emits_start_log_and_error() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let source = missing_backup_source();
        let preview = cli::preview(
            engine::ENGINE_LABEL,
            &[
                "-d".to_string(),
                "-p".to_string(),
                source.backup_path.clone(),
            ],
        );
        let options = engine::diagnostics_options(&source).unwrap();

        let job = registry
            .spawn_engine_with_sink(sink, preview, options)
            .unwrap();
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
        let preview = cli::preview(engine::ENGINE_LABEL, &[]);
        let source = missing_backup_source();
        let options = engine::diagnostics_options(&source).unwrap();
        let error = registry
            .spawn_engine_with_sink(sink, preview, options)
            .unwrap_err();
        assert_eq!(error, "A diagnostic or export job is already running");
    }

    #[test]
    fn redacts_cleartext_password_from_engine_events() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let mut source = missing_backup_source();
        source.encrypted = true;
        source.cleartext_password = Some("super-secret".to_string());
        let preview = cli::preview(
            engine::ENGINE_LABEL,
            &cli::diagnostics_args(&source).unwrap(),
        );
        let options = engine::diagnostics_options(&source).unwrap();

        let job = registry
            .spawn_engine_with_sink(sink, preview, options)
            .unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);
        let output = events
            .iter()
            .filter_map(|event| event.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(!output.contains("super-secret"));
    }
}
