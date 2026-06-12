use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    app::now_millis,
    cli,
    models::{JobEvent, JobEventKind, JobStarted},
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
    inner: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl JobRegistry {
    pub fn spawn(
        &self,
        app: AppHandle,
        executable: std::path::PathBuf,
        args: Vec<String>,
    ) -> Result<JobStarted, String> {
        self.spawn_with_sink(TauriJobEventSink { app }, executable, args)
    }

    fn spawn_with_sink<S: JobEventSink>(
        &self,
        sink: S,
        executable: std::path::PathBuf,
        args: Vec<String>,
    ) -> Result<JobStarted, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Job registry is poisoned".to_string())?;

        if !guard.is_empty() {
            return Err("A diagnostic or export job is already running".to_string());
        }

        let preview = cli::preview(executable.display().to_string(), &args);
        let redactor = LogRedactor::from_args(&args);
        let mut child = Command::new(&executable)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| format!("Failed to start imessage-exporter: {err}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let job_id = Uuid::new_v4().to_string();
        let child = Arc::new(Mutex::new(child));

        guard.insert(job_id.clone(), Arc::clone(&child));
        drop(guard);

        if let Some(stdout) = stdout {
            spawn_reader(
                sink.clone(),
                redactor.clone(),
                job_id.clone(),
                JobEventKind::Stdout,
                stdout,
            );
        }
        if let Some(stderr) = stderr {
            spawn_reader(
                sink.clone(),
                redactor.clone(),
                job_id.clone(),
                JobEventKind::Stderr,
                stderr,
            );
        }

        self.spawn_waiter(sink, redactor, job_id.clone(), child);

        Ok(JobStarted { job_id, preview })
    }

    pub fn cancel(&self, job_id: &str) -> Result<(), String> {
        let child = {
            let guard = self
                .inner
                .lock()
                .map_err(|_| "Job registry is poisoned".to_string())?;
            guard
                .get(job_id)
                .cloned()
                .ok_or_else(|| "No running job found".to_string())?
        };

        let mut child = child
            .lock()
            .map_err(|_| "Job state is poisoned".to_string())?;
        child
            .kill()
            .map_err(|err| format!("Failed to cancel job: {err}"))?;
        Ok(())
    }

    fn remove(&self, job_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(job_id);
        }
    }

    fn spawn_waiter<S: JobEventSink>(
        &self,
        sink: S,
        redactor: LogRedactor,
        job_id: String,
        child: Arc<Mutex<Child>>,
    ) {
        let registry = ArcJobRegistry {
            inner: Arc::clone(&self.inner),
        };
        thread::spawn(move || loop {
            let status = {
                let Ok(mut child) = child.lock() else {
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some("Job state is poisoned".to_string()),
                        None,
                    );
                    registry.remove(&job_id);
                    return;
                };
                match child.try_wait() {
                    Ok(Some(status)) => Some(Ok(status.code().unwrap_or(-1))),
                    Ok(None) => None,
                    Err(err) => Some(Err(err.to_string())),
                }
            };

            match status {
                Some(Ok(code)) => {
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Exit,
                        None,
                        Some(code),
                    );
                    registry.remove(&job_id);
                    return;
                }
                Some(Err(err)) => {
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some(err),
                        None,
                    );
                    registry.remove(&job_id);
                    return;
                }
                None => thread::sleep(Duration::from_millis(150)),
            }
        });
    }
}

struct ArcJobRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl ArcJobRegistry {
    fn remove(&self, job_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(job_id);
        }
    }
}

fn spawn_reader<S: JobEventSink, T: std::io::Read + Send + 'static>(
    sink: S,
    redactor: LogRedactor,
    job_id: String,
    kind: JobEventKind,
    stream: T,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(text) => emit_event(&sink, &redactor, &job_id, kind.clone(), Some(text), None),
                Err(err) => {
                    emit_event(
                        &sink,
                        &redactor,
                        &job_id,
                        JobEventKind::Error,
                        Some(err.to_string()),
                        None,
                    );
                    break;
                }
            }
        }
    });
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
    use crate::models::JobEvent;
    use std::{
        path::PathBuf,
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

    fn shell_command(script: &str) -> (PathBuf, Vec<String>) {
        if cfg!(windows) {
            (
                PathBuf::from("cmd.exe"),
                vec!["/C".to_string(), script.to_string()],
            )
        } else {
            (
                PathBuf::from("sh"),
                vec!["-c".to_string(), script.to_string()],
            )
        }
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
                        drain_job_events(receiver, job_id, &mut events);
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

    fn drain_job_events(receiver: &Receiver<JobEvent>, job_id: &str, events: &mut Vec<JobEvent>) {
        let deadline = Instant::now() + Duration::from_millis(750);
        while Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
                Ok(event) if event.job_id == job_id => events.push(event),
                Ok(_) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    }

    #[test]
    fn streams_stdout_stderr_and_exit_code() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let script = if cfg!(windows) {
            "echo stdout-line && echo stderr-line 1>&2 && exit /B 7"
        } else {
            "echo stdout-line && echo stderr-line 1>&2 && exit 7"
        };
        let (executable, args) = shell_command(script);

        let job = registry.spawn_with_sink(sink, executable, args).unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);

        assert!(events.iter().any(|event| {
            event.kind == JobEventKind::Stdout && event.text.as_deref() == Some("stdout-line")
        }));
        assert!(events.iter().any(|event| {
            event.kind == JobEventKind::Stderr && event.text.as_deref() == Some("stderr-line")
        }));
        assert!(events
            .iter()
            .any(|event| event.kind == JobEventKind::Exit && event.code == Some(7)));
    }

    #[test]
    fn rejects_second_active_job() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let (executable, args) = long_running_command();

        let job = registry
            .spawn_with_sink(sink.clone(), executable, args)
            .unwrap();

        let (second_executable, second_args) = shell_command("echo second");
        let error = registry
            .spawn_with_sink(sink, second_executable, second_args)
            .unwrap_err();
        assert_eq!(error, "A diagnostic or export job is already running");

        registry.cancel(&job.job_id).unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);
        assert!(events
            .iter()
            .any(|event| event.kind == JobEventKind::Exit || event.kind == JobEventKind::Error));
    }

    #[test]
    fn cancellation_emits_terminal_event() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let (executable, args) = long_running_command();

        let job = registry.spawn_with_sink(sink, executable, args).unwrap();
        registry.cancel(&job.job_id).unwrap();

        let events = collect_until_terminal(&receiver, &job.job_id);
        assert!(events
            .iter()
            .any(|event| event.kind == JobEventKind::Exit || event.kind == JobEventKind::Error));
    }

    #[test]
    fn redacts_cleartext_password_from_output_events() {
        let registry = JobRegistry::default();
        let (sink, receiver) = test_sink();
        let secret = "super-secret";
        let (executable, args) = password_echo_command(secret);

        let job = registry.spawn_with_sink(sink, executable, args).unwrap();
        let events = collect_until_terminal(&receiver, &job.job_id);
        let output = events
            .iter()
            .filter_map(|event| event.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(!output.contains(secret));
        assert!(output.contains("[redacted]"));
    }

    fn long_running_command() -> (PathBuf, Vec<String>) {
        if cfg!(windows) {
            (
                PathBuf::from("powershell.exe"),
                vec![
                    "-NoProfile".to_string(),
                    "-Command".to_string(),
                    "Start-Sleep -Seconds 5".to_string(),
                ],
            )
        } else {
            shell_command("sleep 5")
        }
    }

    fn password_echo_command(secret: &str) -> (PathBuf, Vec<String>) {
        if cfg!(windows) {
            (
                PathBuf::from("powershell.exe"),
                vec![
                    "-NoProfile".to_string(),
                    "-Command".to_string(),
                    format!("Write-Output '{secret}'; [Console]::Error.WriteLine('{secret}')"),
                    "--cleartext-password".to_string(),
                    secret.to_string(),
                ],
            )
        } else {
            let (executable, mut args) =
                shell_command(&format!("echo {secret}; echo {secret} 1>&2"));
            args.extend(["--cleartext-password".to_string(), secret.to_string()]);
            (executable, args)
        }
    }
}
