//! The WebSocket handler and per-room fan-out. PROTOCOL.md §3-4.

use std::collections::HashMap;
use std::sync::Mutex;

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
