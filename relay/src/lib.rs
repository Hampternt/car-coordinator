//! carsync relay: stores and forwards ciphertext for Car Coordinator's shared
//! plan. It never sees a key and never decrypts. The wire contract is
//! `relay/PROTOCOL.md`.
//!
//! The contract the tests hold this crate to is small: `Config`, `Limits`,
//! `start` and `Relay`, plus the wire protocol. Everything inside the modules
//! below is pack 1's own and may be reshaped freely.

pub mod auth;
pub mod config;
pub mod limits;
pub mod protocol;
pub mod storage;
pub mod ws;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::get;
use tokio::sync::watch;
use tokio::task::JoinHandle;

pub use config::{Config, ConfigError, Limits};

pub type StartError = Box<dyn std::error::Error + Send + Sync>;

/// A running relay. Dropping it without `shutdown` leaves the server task
/// running until the runtime ends.
pub struct Relay {
    /// The address actually bound (`Config::bind` may ask for port 0).
    pub addr: SocketAddr,
    stop: watch::Sender<bool>,
    server: JoinHandle<std::io::Result<()>>,
    rooms: Arc<ws::Rooms>,
}

/// Opens the storage in `config.data_dir`, binds `config.bind` and starts
/// serving in a background task. Returns once the listener is bound.
pub async fn start(config: Config) -> Result<Relay, StartError> {
    std::fs::create_dir_all(&config.data_dir)?;
    let storage = Arc::new(storage::Storage::open(&config.data_dir)?);
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    let addr = listener.local_addr()?;
    let (stop, shutdown) = watch::channel(false);
    let rooms = Arc::new(ws::Rooms::default());
    let state = AppState { config: Arc::new(config), storage, rooms: rooms.clone(), shutdown: shutdown.clone() };

    let mut signal = shutdown;
    let app = router(state);
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = signal.wait_for(|stopping| *stopping).await;
            })
            .await
    });
    Ok(Relay { addr, stop, server, rooms })
}

impl Relay {
    /// Closes every open WebSocket with 1001, stops the listener and releases
    /// the database, so a new `start` on the same directory sees every write.
    pub async fn shutdown(self) {
        let _ = self.stop.send(true);
        match self.server.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => eprintln!("carsync-relay: server error: {e}"),
            Err(e) => eprintln!("carsync-relay: server task failed: {e}"),
        }
        self.rooms.wait_until_closed().await;
    }
}

/// Shared by every connection.
#[derive(Clone)]
pub struct AppState {
    pub config: std::sync::Arc<Config>,
    pub storage: std::sync::Arc<storage::Storage>,
    pub rooms: std::sync::Arc<ws::Rooms>,
    /// Turns true once on shutdown; every connection then closes with 1001.
    pub shutdown: watch::Receiver<bool>,
}

/// `GET /health` and `GET /rooms/{roomId}/ws`; everything else 404.
pub fn router(state: AppState) -> axum::Router {
    axum::Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/rooms/{room}/ws", get(ws::room_ws))
        .with_state(state)
}
