//! The WebSocket handler and per-room fan-out. PROTOCOL.md §3-4.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use tokio::sync::Notify;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;

use crate::AppState;

/// The connections open per room, for fan-out. Writes to one room are
/// sequenced under its entry so `op`s and `ack`s leave in `seq` order (§4.5).
#[derive(Default)]
pub struct Rooms {
    open: Mutex<HashMap<String, Room>>,
    /// Upgraded connections still running, so shutdown can wait for them.
    live: AtomicUsize,
    all_closed: Notify,
}

impl Rooms {
    /// Waits until every connection counted by `Live` has ended.
    pub async fn wait_until_closed(&self) {
        loop {
            let notified = self.all_closed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.live.load(Ordering::SeqCst) == 0 {
                return;
            }
            notified.await;
        }
    }
}

/// Counts one connection as live for as long as it is held.
pub struct Live(Arc<Rooms>);

impl Live {
    pub fn new(rooms: &Arc<Rooms>) -> Live {
        rooms.live.fetch_add(1, Ordering::SeqCst);
        Live(rooms.clone())
    }
}

impl Drop for Live {
    fn drop(&mut self) {
        if self.0.live.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.0.all_closed.notify_waiters();
        }
    }
}

/// One room's open connections. Pack 1 picks the channel type.
pub struct Room {}

/// `GET /rooms/{roomId}/ws`: 404 for a malformed room id, 403 for an Origin
/// not on the allow list, else upgrade with `Limits::max_frame`.
pub async fn room_ws(
    State(state): State<AppState>,
    Path(room): Path<String>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    todo!("pack 1: checks, then upgrade into the connection loop")
}
