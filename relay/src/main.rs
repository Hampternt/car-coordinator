//! The relay binary: configuration from the environment (PROTOCOL.md §7),
//! then serve until SIGINT or SIGTERM (systemd stops services with SIGTERM).

use tokio::signal::unix::{SignalKind, signal};

#[tokio::main]
async fn main() {
    let config = match carsync_relay::Config::from_env() {
        Ok(config) => config,
        Err(e) => {
            eprintln!("carsync-relay: {e}");
            std::process::exit(2);
        }
    };
    let relay = match carsync_relay::start(config).await {
        Ok(relay) => relay,
        Err(e) => {
            eprintln!("carsync-relay: {e}");
            std::process::exit(1);
        }
    };
    eprintln!("carsync-relay listening on {}", relay.addr);
    let mut terminate = signal(SignalKind::terminate()).expect("a SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
    eprintln!("carsync-relay shutting down");
    relay.shutdown().await;
}
