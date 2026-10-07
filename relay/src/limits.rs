//! Rate limit and disk use. PROTOCOL.md §5.

use std::path::Path;
use std::time::Instant;

/// Token bucket, one per connection. Every text frame costs one token.
pub struct RateLimiter {
    burst: u32,
    per_sec: u32,
    tokens: f64,
    last: Instant,
}

impl RateLimiter {
    pub fn new(burst: u32, per_sec: u32, now: Instant) -> RateLimiter {
        todo!("pack 1: full bucket")
    }

    /// Refills for the time since the last call, then takes one token.
    /// False when the bucket is empty (close 4429).
    pub fn allow(&mut self, now: Instant) -> bool {
        todo!("pack 1: refill and take")
    }
}

/// Summed size of the regular files directly in `dir`.
pub fn disk_usage(dir: &Path) -> std::io::Result<u64> {
    todo!("pack 1: sum file sizes")
}
