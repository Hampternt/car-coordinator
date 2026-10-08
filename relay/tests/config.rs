//! Configuration from the environment, PROTOCOL.md §5 and §7. Never sets real
//! environment variables: tests run on parallel threads and the environment is
//! process-wide, so everything goes through `Config::from_lookup`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use carsync_relay::{Config, ConfigError, Limits};

fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: HashMap<String, String> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    move |name| map.get(name).cloned()
}

#[test]
fn default_limits_are_the_protocols() {
    let l = Limits::default();
    assert_eq!(l.max_body, 524_288);
    assert_eq!(l.max_label, 1024);
    assert_eq!(l.max_frame, 1_048_576);
    assert!(l.max_frame > l.max_body);
    assert_eq!((l.rate_burst, l.rate_per_sec), (120, 30));
    assert_eq!(l.max_rooms, 20);
    assert_eq!(l.max_disk_bytes, 2_147_483_648);
    assert_eq!(l.max_versions, 50);
    assert_eq!(l.hello_timeout, Duration::from_secs(10));
}

#[test]
fn only_the_data_dir_is_required() {
    let c = Config::from_lookup(lookup(&[("RELAY_DATA", "/var/lib/carsync")])).unwrap();
    assert_eq!(c.bind, "127.0.0.1:3010".parse().unwrap());
    assert_eq!(c.data_dir, PathBuf::from("/var/lib/carsync"));
    assert_eq!(c.create_code, None);
    assert_eq!(c.origins, vec!["https://hampternt.github.io", "http://tauri.localhost"]);
    assert_eq!(c.limits, Limits::default());
}

#[test]
fn a_missing_data_dir_is_refused() {
    assert_eq!(Config::from_lookup(lookup(&[])).unwrap_err(), ConfigError::Missing("RELAY_DATA"));
    assert_eq!(Config::from_lookup(lookup(&[("RELAY_DATA", "")])).unwrap_err(), ConfigError::Missing("RELAY_DATA"));
}

#[test]
fn every_variable_is_read() {
    let c = Config::from_lookup(lookup(&[
        ("RELAY_DATA", "/tmp/carsync"),
        ("RELAY_BIND", "127.0.0.1:4000"),
        ("RELAY_CREATE_CODE", "s3cret"),
        ("RELAY_ORIGINS", " http://a.example , ,http://b.example:8080"),
        ("RELAY_MAX_ROOMS", "3"),
        ("RELAY_MAX_DISK_BYTES", "1000"),
    ]))
    .unwrap();
    assert_eq!(c.bind, "127.0.0.1:4000".parse().unwrap());
    assert_eq!(c.create_code.as_deref(), Some("s3cret"));
    assert_eq!(c.origins, vec!["http://a.example", "http://b.example:8080"]);
    assert_eq!(c.limits.max_rooms, 3);
    assert_eq!(c.limits.max_disk_bytes, 1000);
    assert_eq!(c.limits.max_body, Limits::default().max_body);
}

#[test]
fn an_empty_create_code_disables_creation() {
    let c = Config::from_lookup(lookup(&[("RELAY_DATA", "/tmp/x"), ("RELAY_CREATE_CODE", "")])).unwrap();
    assert_eq!(c.create_code, None);
}

#[test]
fn unreadable_values_are_refused() {
    for (name, value) in [("RELAY_BIND", "nowhere"), ("RELAY_MAX_ROOMS", "many"), ("RELAY_MAX_DISK_BYTES", "-1")] {
        let err = Config::from_lookup(lookup(&[("RELAY_DATA", "/tmp/x"), (name, value)])).unwrap_err();
        assert_eq!(err, ConfigError::Invalid { name, value: value.to_string() }, "{name}={value}");
    }
}
