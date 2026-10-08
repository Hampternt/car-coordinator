//! Configuration from the environment (PROTOCOL.md §7) and the limits
//! (PROTOCOL.md §5).

use std::fmt;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

pub const DEFAULT_BIND: &str = "127.0.0.1:3010";
pub const DEFAULT_ORIGINS: &str = "https://hampternt.github.io,http://tauri.localhost";

#[derive(Debug, Clone)]
pub struct Config {
    pub bind: SocketAddr,
    pub data_dir: PathBuf,
    /// `None` when `RELAY_CREATE_CODE` is unset or empty: every create is
    /// refused with 4403.
    pub create_code: Option<String>,
    /// Exact `Origin` values allowed; a request with no `Origin` is allowed.
    pub origins: Vec<String>,
    pub limits: Limits,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Limits {
    /// Longest `body` string, in characters (= bytes, base64url is ASCII).
    pub max_body: usize,
    /// Longest `label` string.
    pub max_label: usize,
    /// Largest WebSocket text frame; must stay above `max_body` so an
    /// oversized body is answered 4413 rather than cut off by the library.
    pub max_frame: usize,
    /// Token bucket per connection: capacity, and tokens added per second.
    pub rate_burst: u32,
    pub rate_per_sec: u32,
    pub max_rooms: u64,
    /// Summed size of the regular files directly in `data_dir`.
    pub max_disk_bytes: u64,
    /// Versions kept per room; older ones are pruned.
    pub max_versions: usize,
    /// From upgrade to the first frame.
    pub hello_timeout: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            max_body: 512 * 1024,
            max_label: 1024,
            max_frame: 1024 * 1024,
            rate_burst: 120,
            rate_per_sec: 30,
            max_rooms: 20,
            max_disk_bytes: 2 * 1024 * 1024 * 1024,
            max_versions: 50,
            hello_timeout: Duration::from_secs(10),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConfigError {
    /// A required variable is unset or empty.
    Missing(&'static str),
    /// A variable is set but cannot be read.
    Invalid { name: &'static str, value: String },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Missing(name) => write!(f, "{name} must be set"),
            ConfigError::Invalid { name, value } => write!(f, "{name}={value:?} is not valid"),
        }
    }
}

impl std::error::Error for ConfigError {}

impl Config {
    pub fn from_env() -> Result<Config, ConfigError> {
        Config::from_lookup(|name| std::env::var(name).ok())
    }

    /// Reads `RELAY_BIND`, `RELAY_DATA`, `RELAY_CREATE_CODE`, `RELAY_ORIGINS`,
    /// `RELAY_MAX_ROOMS` and `RELAY_MAX_DISK_BYTES` through `get`, applying the
    /// defaults of PROTOCOL.md §7. Origins are split on commas and trimmed;
    /// empty entries are dropped. Other limits take `Limits::default()`.
    /// An empty value counts as unset.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Config, ConfigError> {
        let get = |name: &str| get(name).filter(|value| !value.trim().is_empty());

        let data_dir = get("RELAY_DATA").ok_or(ConfigError::Missing("RELAY_DATA"))?;
        let bind = parse_or("RELAY_BIND", get("RELAY_BIND"), DEFAULT_BIND)?;
        let origins = get("RELAY_ORIGINS").unwrap_or_else(|| DEFAULT_ORIGINS.to_string());
        let defaults = Limits::default();
        let limits = Limits {
            max_rooms: parse_or("RELAY_MAX_ROOMS", get("RELAY_MAX_ROOMS"), &defaults.max_rooms.to_string())?,
            max_disk_bytes: parse_or("RELAY_MAX_DISK_BYTES", get("RELAY_MAX_DISK_BYTES"), &defaults.max_disk_bytes.to_string())?,
            ..defaults
        };

        Ok(Config {
            bind,
            data_dir: PathBuf::from(data_dir),
            create_code: get("RELAY_CREATE_CODE"),
            origins: origins.split(',').map(str::trim).filter(|o| !o.is_empty()).map(String::from).collect(),
            limits,
        })
    }
}

fn parse_or<T: std::str::FromStr>(name: &'static str, value: Option<String>, default: &str) -> Result<T, ConfigError> {
    let value = value.unwrap_or_else(|| default.to_string());
    value.trim().parse().map_err(|_| ConfigError::Invalid { name, value })
}
