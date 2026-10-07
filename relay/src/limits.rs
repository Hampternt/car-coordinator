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
        RateLimiter { burst, per_sec, tokens: f64::from(burst), last: now }
    }

    /// Refills for the time since the last call, then takes one token.
    /// False when the bucket is empty (close 4429).
    pub fn allow(&mut self, now: Instant) -> bool {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.last = now;
        self.tokens = (self.tokens + elapsed * f64::from(self.per_sec)).min(f64::from(self.burst));
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Summed size of the regular files directly in `dir`.
pub fn disk_usage(dir: &Path) -> std::io::Result<u64> {
    let mut total = 0;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        // `DirEntry::file_type` does not follow symlinks: only regular files count.
        if entry.file_type()?.is_file() {
            total += entry.metadata()?.len();
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn the_bucket_starts_full_and_refills_up_to_its_burst() {
        let start = Instant::now();
        let mut bucket = RateLimiter::new(3, 10, start);
        assert!((0..3).all(|_| bucket.allow(start)));
        assert!(!bucket.allow(start));
        assert!(bucket.allow(start + Duration::from_millis(100)), "one token per 100 ms");
        assert!(!bucket.allow(start + Duration::from_millis(100)));
        let later = start + Duration::from_secs(60);
        assert_eq!((0..10).filter(|_| bucket.allow(later)).count(), 3, "never more than the burst");
    }

    #[test]
    fn disk_usage_sums_the_regular_files_directly_in_the_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a"), [0; 100]).unwrap();
        std::fs::write(dir.path().join("b"), [0; 23]).unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub").join("c"), [0; 1000]).unwrap();
        assert_eq!(disk_usage(dir.path()).unwrap(), 123);
    }
}
