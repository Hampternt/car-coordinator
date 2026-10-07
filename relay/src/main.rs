//! The relay binary: configuration from the environment (PROTOCOL.md §7),
//! then serve until killed.

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
    let _ = tokio::signal::ctrl_c().await;
    relay.shutdown().await;
}
