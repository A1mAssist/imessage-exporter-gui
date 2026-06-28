#![forbid(unsafe_code)]
#![doc = include_str!("../README.md")]

macro_rules! println {
    () => {
        crate::log::emit(crate::log::LogStream::Stdout, String::new())
    };
    ($($arg:tt)*) => {
        crate::log::emit(crate::log::LogStream::Stdout, format!($($arg)*))
    };
}

macro_rules! eprintln {
    () => {
        crate::log::emit(crate::log::LogStream::Stderr, String::new())
    };
    ($($arg:tt)*) => {
        crate::log::emit(crate::log::LogStream::Stderr, format!($($arg)*))
    };
}

pub mod app;
pub mod cancel;
pub mod exporters;
pub mod log;

pub use app::{error::RuntimeError, options::Options, runtime::Config};
pub use cancel::{AtomicCancellationToken, CancellationToken, NoopCancellationToken};
pub use exporters::{html::HTML, jsonl::JSONL, txt::TXT};
pub use log::{LogStream, with_log_sink};

/// Run an export or diagnostics task using already-built options.
pub fn run_with_options(options: Options) -> Result<(), RuntimeError> {
    let mut app = Config::new(options)?;
    app.resolve_filtered_handles();
    app.start()
}

/// Run an export or diagnostics task with a cooperative cancellation token.
pub fn run_with_options_and_cancel(
    options: Options,
    cancellation: std::sync::Arc<dyn CancellationToken>,
) -> Result<(), RuntimeError> {
    let mut app = Config::new_with_cancel(options, cancellation)?;
    app.check_cancelled()?;
    app.resolve_filtered_handles();
    app.check_cancelled()?;
    app.start()
}

/// Run an export or diagnostics task and route exporter log lines to a callback.
pub fn run_with_options_and_logger<F>(options: Options, sink: F) -> Result<(), RuntimeError>
where
    F: FnMut(LogStream, String) + 'static,
{
    with_log_sink(sink, || run_with_options(options))
}

/// Run an export or diagnostics task with both log routing and cancellation.
pub fn run_with_options_logger_and_cancel<F>(
    options: Options,
    sink: F,
    cancellation: std::sync::Arc<dyn CancellationToken>,
) -> Result<(), RuntimeError>
where
    F: FnMut(LogStream, String) + 'static,
{
    with_log_sink(sink, || run_with_options_and_cancel(options, cancellation))
}
