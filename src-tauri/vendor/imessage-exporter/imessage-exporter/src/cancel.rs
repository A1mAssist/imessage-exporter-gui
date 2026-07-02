//! Cooperative cancellation hooks for embedded callers.

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

/// Shared cancellation hook checked at export phase boundaries and in message loops.
pub trait CancellationToken: Send + Sync {
    fn is_cancelled(&self) -> bool;
}

/// Default token for CLI callers that do not support cancellation.
#[derive(Debug, Default)]
pub struct NoopCancellationToken;

impl CancellationToken for NoopCancellationToken {
    fn is_cancelled(&self) -> bool {
        false
    }
}

/// Cancellation token backed by an [`AtomicBool`].
#[derive(Debug, Clone)]
pub struct AtomicCancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl AtomicCancellationToken {
    pub fn new(cancelled: Arc<AtomicBool>) -> Self {
        Self { cancelled }
    }
}

impl CancellationToken for AtomicCancellationToken {
    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}
