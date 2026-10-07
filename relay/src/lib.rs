//! carsync relay: stores and forwards ciphertext for Car Coordinator's shared
//! plan. It never sees a key and never decrypts. The wire contract is
//! `relay/PROTOCOL.md`.
//!
//! The contract the tests hold this crate to is small: `Config`, `Limits`,
//! `start` and `Relay`, plus the wire protocol. Everything inside the modules
//! below is pack 1's own and may be reshaped freely.

// Scaffold stubs: pack 1 removes this once the bodies are written.
#![allow(unused_variables, dead_code)]

pub mod auth;
pub mod config;
pub mod limits;
pub mod protocol;
pub mod storage;
pub mod ws;

use std::net::SocketAddr;

pub use config::{Config, ConfigError, Limits};

pub type StartError = Box<dyn std::error::Error + Send + Sync>;

/// A running relay. Dropping it without `shutdown` leaves the server task
/// running until the runtime ends.
pub struct Relay {
    /// The address actually bound (`Config::bind` may ask for port 0).
    pub addr: SocketAddr,
    // Pack 1 adds what it needs to stop the server (a task handle, a
    // shutdown signal).
}

/// Opens the storage in `config.data_dir`, binds `config.bind` and starts
/// serving in a background task. Returns once the listener is bound.
pub async fn start(config: Config) -> Result<Relay, StartError> {
    todo!("pack 1: open storage, bind, spawn axum::serve")
}

impl Relay {
    /// Closes every open WebSocket with 1001, stops the listener and releases
    /// the database, so a new `start` on the same directory sees every write.
    pub async fn shutdown(self) {
        todo!("pack 1: signal shutdown and await the server task")
    }
}

/// Shared by every connection.
#[derive(Clone)]
pub struct AppState {
    pub config: std::sync::Arc<Config>,
    pub storage: std::sync::Arc<storage::Storage>,
    pub rooms: std::sync::Arc<ws::Rooms>,
}

/// `GET /health` and `GET /rooms/{roomId}/ws`; everything else 404.
pub fn router(state: AppState) -> axum::Router {
    todo!("pack 1: routes")
}
