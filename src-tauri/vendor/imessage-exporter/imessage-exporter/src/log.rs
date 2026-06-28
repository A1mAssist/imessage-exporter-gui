use std::cell::RefCell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogStream {
    Stdout,
    Stderr,
}

type LogSink = Box<dyn FnMut(LogStream, String)>;

thread_local! {
    static LOG_SINK: RefCell<Option<LogSink>> = const { RefCell::new(None) };
}

pub fn with_log_sink<F, R>(sink: F, run: impl FnOnce() -> R) -> R
where
    F: FnMut(LogStream, String) + 'static,
{
    LOG_SINK.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(sink));
    });

    let result = run();

    LOG_SINK.with(|slot| {
        *slot.borrow_mut() = None;
    });

    result
}

pub fn emit(stream: LogStream, line: String) {
    let handled = LOG_SINK.with(|slot| {
        let mut sink = slot.borrow_mut();
        if let Some(sink) = sink.as_mut() {
            sink(stream, line.clone());
            true
        } else {
            false
        }
    });

    if handled {
        return;
    }

    match stream {
        LogStream::Stdout => std::println!("{line}"),
        LogStream::Stderr => std::eprintln!("{line}"),
    }
}
