//! The WebSocket handler and per-room fan-out. PROTOCOL.md §3-4.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::ws::rejection::WebSocketUpgradeRejection;
use axum::extract::ws::{CloseFrame, Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use tokio::sync::{Notify, mpsc, watch};

use crate::AppState;
use crate::auth;
use crate::protocol::{self, ClientFrame, ServerFrame, close};

/// Frames queued for one connection before it counts as too far behind.
const QUEUE: usize = 1024;
/// How long a close waits for the client's close reply (PROTOCOL.md §5).
const CLOSE_WAIT: Duration = Duration::from_secs(5);
/// The same wait on shutdown, kept short so a restart is quick.
const SHUTDOWN_CLOSE_WAIT: Duration = Duration::from_secs(1);
/// A send that takes longer than this means the client has stopped reading.
const SEND_WAIT: Duration = Duration::from_secs(30);
/// PROTOCOL.md §6.
const PING_EVERY: Duration = Duration::from_secs(30);

/// Not a protocol code: a database failure, which the client cannot fix.
const INTERNAL_ERROR: u16 = 1011;

/// A close code and its short reason.
type Refusal = (u16, &'static str);

/// The connections open per room, for fan-out. Writes to one room are
/// sequenced under its entry so `op`s and `ack`s leave in `seq` order (§4.5).
#[derive(Default)]
pub struct Rooms {
    open: Mutex<HashMap<String, Arc<Mutex<Room>>>>,
    next_peer: AtomicU64,
    /// Held across a create's exists check and insert.
    creating: Mutex<()>,
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

/// One room's open connections, each with its outgoing queue. Every frame a
/// connection receives goes through its queue, its own acks included, so the
/// order frames are queued under this lock is the order they arrive in.
#[derive(Default)]
pub struct Room {
    peers: HashMap<u64, mpsc::Sender<Message>>,
}

impl Room {
    /// Queues `message` for `peer`. A peer whose queue is full has stopped
    /// reading; it is dropped from the room, and its connection closes once it
    /// has sent what was queued.
    fn send(&mut self, peer: u64, message: Message) {
        let full = match self.peers.get(&peer) {
            Some(queue) => queue.try_send(message).is_err(),
            None => false,
        };
        if full {
            self.peers.remove(&peer);
        }
    }

    fn send_to_others(&mut self, sender: u64, message: &Message) {
        let others: Vec<u64> = self.peers.keys().copied().filter(|&p| p != sender).collect();
        for peer in others {
            self.send(peer, message.clone());
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // Nothing under these locks is left half done by a panic.
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn encode(frame: &ServerFrame) -> Message {
    let json = serde_json::to_string(frame).expect("server frames serialize");
    Message::Text(Utf8Bytes::from(json))
}

/// `GET /rooms/{roomId}/ws`: 404 for a malformed room id, 403 for an Origin
/// not on the allow list, else upgrade with `Limits::max_frame`.
pub async fn room_ws(
    State(state): State<AppState>,
    Path(room): Path<String>,
    headers: HeaderMap,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    if !auth::valid_room_id(&room) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !origin_allowed(&headers, &state.config.origins) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let upgrade = match upgrade {
        Ok(upgrade) => upgrade,
        Err(rejection) => return rejection.into_response(),
    };
    let live = Live::new(&state.rooms);
    let max_frame = state.config.limits.max_frame;
    upgrade.max_message_size(max_frame).max_frame_size(max_frame).on_upgrade(move |socket| async move {
        let _live = live;
        connection(socket, state, room).await;
    })
}

/// No `Origin` is allowed (PROTOCOL.md §3); one must match an entry byte for
/// byte; more than one is refused.
fn origin_allowed(headers: &HeaderMap, allowed: &[String]) -> bool {
    let mut origins = headers.get_all(header::ORIGIN).iter();
    match (origins.next(), origins.next()) {
        (None, _) => true,
        (Some(origin), None) => allowed.iter().any(|a| a.as_bytes() == origin.as_bytes()),
        (Some(_), Some(_)) => false,
    }
}

enum Incoming {
    Text(Utf8Bytes),
    Binary,
    /// The client closed, or the connection broke.
    Gone,
}

async fn next_frame(socket: &mut WebSocket) -> Incoming {
    loop {
        match socket.recv().await {
            Some(Ok(Message::Text(text))) => return Incoming::Text(text),
            Some(Ok(Message::Binary(_))) => return Incoming::Binary,
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
            Some(Ok(Message::Close(_)) | Err(_)) | None => return Incoming::Gone,
        }
    }
}

/// Resolves once the relay is shutting down; never, if its `Relay` was dropped
/// without `shutdown`.
async fn stopping(shutdown: &mut watch::Receiver<bool>) {
    if shutdown.wait_for(|stopping| *stopping).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// Sends a close frame, then reads and discards until the client's close
/// reply or `wait`, so the close is not lost to a TCP reset (PROTOCOL.md §5).
async fn close(mut socket: WebSocket, (code, reason): Refusal, wait: Duration) {
    let frame = CloseFrame { code, reason: Utf8Bytes::from_static(reason) };
    let drain = async {
        socket.send(Message::Close(Some(frame))).await.ok()?;
        while let Some(Ok(message)) = socket.recv().await {
            if matches!(message, Message::Close(_)) {
                break;
            }
        }
        Some(())
    };
    let _ = tokio::time::timeout(wait, drain).await;
}

fn storage_failed(error: crate::storage::StorageError) -> Refusal {
    // The error names the failing statement, never the values bound to it.
    eprintln!("carsync-relay: storage error: {error}");
    (INTERNAL_ERROR, "storage error")
}

/// A connection that has been welcomed into a room.
struct Joined {
    room_id: String,
    room: Arc<Mutex<Room>>,
    peer: u64,
    outbox: mpsc::Receiver<Message>,
}

async fn connection(mut socket: WebSocket, state: AppState, room_id: String) {
    let limits = state.config.limits.clone();
    let mut shutdown = state.shutdown.clone();

    // §4.1: the first frame must arrive within the hello timeout.
    let first = tokio::select! {
        _ = stopping(&mut shutdown) => {
            return close(socket, (close::GOING_AWAY, "relay shutting down"), SHUTDOWN_CLOSE_WAIT).await;
        }
        first = tokio::time::timeout(limits.hello_timeout, next_frame(&mut socket)) => first,
    };
    let text = match first {
        Err(_) => return close(socket, (close::HELLO_TIMEOUT, "no hello in time"), CLOSE_WAIT).await,
        Ok(Incoming::Gone) => return,
        Ok(Incoming::Binary) => return close(socket, (close::BAD_FRAME, "binary frame"), CLOSE_WAIT).await,
        Ok(Incoming::Text(text)) => text,
    };
    let joined = match open(&state, &room_id, &text, &mut socket).await {
        Ok(joined) => joined,
        Err(refusal) => return close(socket, refusal, CLOSE_WAIT).await,
    };
    serve(socket, &state, joined, shutdown).await;
}

/// Handles the opening frame: `hello` or `create`, then joins the room.
async fn open(state: &AppState, room_id: &str, text: &str, socket: &mut WebSocket) -> Result<Joined, Refusal> {
    let frame = protocol::parse(text, &state.config.limits).map_err(|code| (code, "bad frame"))?;
    match frame {
        ClientFrame::Hello { token } => {
            let presented = auth::hash_token(&token).ok_or((close::BAD_FRAME, "malformed token"))?;
            let stored = state.storage.token_hash(room_id).map_err(storage_failed)?;
            // Compare even when there is no room, so both refusals take as long.
            let matches = auth::hash_matches(&stored.unwrap_or([0; 32]), &presented);
            if stored.is_none() || !matches {
                return Err((close::NOT_ALLOWED, "not allowed in"));
            }
        }
        ClientFrame::Create { token, create_code } => {
            let hash = auth::hash_token(&token).ok_or((close::BAD_FRAME, "malformed token"))?;
            if !auth::create_code_matches(state.config.create_code.as_deref(), &create_code) {
                return Err((close::WRONG_CREATE_CODE, "wrong create code"));
            }
            create(state, room_id, &hash)?;
            socket.send(encode(&ServerFrame::Created)).await.map_err(|_| (close::GOING_AWAY, "gone"))?;
        }
        _ => return Err((close::NOT_ALLOWED, "hello first")),
    }
    join(state, room_id)
}

/// §4.1 steps 3 and 4, under one lock so two creates cannot both pass them.
fn create(state: &AppState, room_id: &str, hash: &[u8; 32]) -> Result<(), Refusal> {
    let _creating = lock(&state.rooms.creating);
    if state.storage.token_hash(room_id).map_err(storage_failed)?.is_some() {
        return Err((close::ROOM_EXISTS, "room exists"));
    }
    match state.storage.create_room(room_id, hash).map_err(storage_failed)? {
        crate::storage::CreateOutcome::Created => Ok(()),
        crate::storage::CreateOutcome::Exists => Err((close::ROOM_EXISTS, "room exists")),
    }
}

/// Registers the connection and queues `welcome` under the room's lock, so no
/// op can land between the seq it reports and the first op it forwards.
fn join(state: &AppState, room_id: &str) -> Result<Joined, Refusal> {
    let (queue, outbox) = mpsc::channel(QUEUE);
    let peer = state.rooms.next_peer.fetch_add(1, Ordering::Relaxed);
    let mut open = lock(&state.rooms.open);
    let room = open.entry(room_id.to_string()).or_default().clone();
    let mut members = lock(&room);
    let seq = match state.storage.latest_seq(room_id) {
        Ok(seq) => seq,
        Err(e) => {
            if members.peers.is_empty() {
                drop(members);
                open.remove(room_id);
            }
            return Err(storage_failed(e));
        }
    };
    queue.try_send(encode(&ServerFrame::Welcome { seq })).expect("a new queue has room");
    members.peers.insert(peer, queue);
    drop(members);
    Ok(Joined { room_id: room_id.to_string(), room, peer, outbox })
}

/// Takes the connection out of its room, and the room out of the map once
/// nobody is left in it.
fn leave(state: &AppState, joined: &Joined) {
    let mut open = lock(&state.rooms.open);
    let mut members = lock(&joined.room);
    members.peers.remove(&joined.peer);
    if members.peers.is_empty() {
        drop(members);
        open.remove(&joined.room_id);
    }
}

async fn send(socket: &mut WebSocket, message: Message) -> bool {
    matches!(tokio::time::timeout(SEND_WAIT, socket.send(message)).await, Ok(Ok(())))
}

/// After `welcome`: forwards the queue to the socket and handles frames,
/// until either side closes.
async fn serve(mut socket: WebSocket, state: &AppState, mut joined: Joined, mut shutdown: watch::Receiver<bool>) {
    let limits = &state.config.limits;
    let mut ping = tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
    let (refusal, wait) = loop {
        tokio::select! {
            biased;
            _ = stopping(&mut shutdown) => break ((close::GOING_AWAY, "relay shutting down"), SHUTDOWN_CLOSE_WAIT),
            queued = joined.outbox.recv() => match queued {
                Some(message) => {
                    if !send(&mut socket, message).await {
                        return leave(state, &joined);
                    }
                }
                // Dropped from the room for not reading: reconnect and catch up.
                None => break ((close::GOING_AWAY, "too far behind"), CLOSE_WAIT),
            },
            incoming = next_frame(&mut socket) => match incoming {
                Incoming::Gone => return leave(state, &joined),
                Incoming::Binary => break ((close::BAD_FRAME, "binary frame"), CLOSE_WAIT),
                Incoming::Text(text) => {
                    let handled = protocol::parse(&text, limits)
                        .map_err(|code| (code, "bad frame"))
                        .and_then(|frame| handle(state, &joined, frame));
                    if let Err(refusal) = handled {
                        break (refusal, CLOSE_WAIT);
                    }
                }
            },
            _ = ping.tick() => {
                if !send(&mut socket, Message::Ping(Bytes::new())).await {
                    return leave(state, &joined);
                }
            }
        }
    };
    leave(state, &joined);
    close(socket, refusal, wait).await;
}

/// One frame after `welcome` (§4.2). Runs under the room's lock and never
/// awaits, so its writes and the frames they queue keep one order.
fn handle(state: &AppState, joined: &Joined, frame: ClientFrame) -> Result<(), Refusal> {
    let members = lock(&joined.room);
    if !members.peers.contains_key(&joined.peer) {
        return Err((close::GOING_AWAY, "too far behind"));
    }
    match frame {
        ClientFrame::Hello { .. } | ClientFrame::Create { .. } => Err((close::BAD_FRAME, "already in")),
        _ => todo!("pack 1, item 4: fan-out"),
    }
}
