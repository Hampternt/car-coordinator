//! The long-poll fallback, PROTOCOL.md §9: the connection `/rooms/{roomId}/ws`
//! makes, carried over plain HTTPS requests instead, for networks whose proxy
//! lets ordinary requests through but not a WebSocket. Each session runs the
//! same `ws::connection` as a WebSocket does, so frames, close codes, rate
//! limits and fan-out are the WebSocket's exactly; only the carrying differs.
//!
//! Every request is a POST with a text body, which a browser sends across
//! origins without a preflight. The session id travels in the body, never in
//! the path, so access logs never hold it.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::ws::{Message, Utf8Bytes};
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use tokio::sync::{Notify, mpsc, watch};

use crate::AppState;
use crate::auth;
use crate::ws::{self, Incoming, Live, Socket};

/// Frames waiting for the client's next `recv`.
const QUEUE: usize = 256;
/// A `recv` answer stops adding frames past this many bytes; the rest wait
/// for the next one. It always carries at least one.
const ANSWER_BYTES: usize = 1024 * 1024;
/// Random bytes in a session id.
const ID_BYTES: usize = 16;

/// What the connection hands a `recv`.
enum Out {
    Frame(Utf8Bytes),
    Close(u16),
}

/// Open sessions by id.
#[derive(Default)]
pub struct Polls {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

struct Session {
    room: String,
    /// `Limits::poll_idle`: a session with no `recv` open for this long has
    /// lost its client, as a dropped TCP connection would say.
    idle: Duration,
    /// Frames from `send` to the connection. Taken on removal, which the
    /// connection reads as the client going away.
    inbox: Mutex<Option<mpsc::Sender<Incoming>>>,
    /// Held by the one `recv` in flight.
    outbox: tokio::sync::Mutex<mpsc::Receiver<Out>>,
    /// Held while a `send` queues its frames, so two cannot interleave.
    sending: tokio::sync::Mutex<()>,
    seen: Mutex<Seen>,
    /// A `recv` has carried the close away.
    delivered: Notify,
}

struct Seen {
    /// `recv`s in flight.
    polling: usize,
    /// When the last one ended.
    last: Instant,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // Nothing under these locks is left half done by a panic.
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Polls {
    fn get(&self, room: &str, id: &str) -> Option<Arc<Session>> {
        lock(&self.sessions).get(id).filter(|s| s.room == room).cloned()
    }

    /// Takes the session out, and with it the way into its connection.
    fn remove(&self, id: &str) {
        if let Some(session) = lock(&self.sessions).remove(id) {
            lock(&session.inbox).take();
        }
    }
}

impl Session {
    /// Time since the last `recv` ended; zero while one is in flight.
    fn idle(&self) -> Duration {
        let seen = lock(&self.seen);
        if seen.polling > 0 { Duration::ZERO } else { seen.last.elapsed() }
    }
}

/// Counts a `recv` in flight for as long as it is held.
struct Polling(Arc<Session>);

impl Polling {
    fn new(session: &Arc<Session>) -> Polling {
        lock(&session.seen).polling += 1;
        Polling(session.clone())
    }
}

impl Drop for Polling {
    fn drop(&mut self) {
        let mut seen = lock(&self.0.seen);
        seen.polling -= 1;
        seen.last = Instant::now();
    }
}

/// The relay's end of one session, owned by its connection. Dropping it ends
/// the session.
pub struct Side {
    id: String,
    session: Arc<Session>,
    polls: Arc<Polls>,
    inbox: mpsc::Receiver<Incoming>,
    outbox: mpsc::Sender<Out>,
}

impl Side {
    /// The next frame `send` delivered, or `Gone` once the client closed the
    /// session or stopped polling for `IDLE`.
    pub(crate) async fn recv(&mut self) -> Incoming {
        loop {
            let idle = self.session.idle();
            if idle >= self.session.idle {
                return Incoming::Gone;
            }
            tokio::select! {
                incoming = self.inbox.recv() => return incoming.unwrap_or(Incoming::Gone),
                _ = tokio::time::sleep(self.session.idle - idle) => {}
            }
        }
    }

    /// Queues a frame for the next `recv`. Pings have no meaning here: every
    /// `recv` answers within `Limits::poll_wait`, which keeps proxies from
    /// timing out.
    pub(crate) async fn send(&mut self, message: Message) -> bool {
        let out = match message {
            Message::Text(text) => Out::Frame(text),
            Message::Close(frame) => Out::Close(frame.map_or(1000, |f| f.code)),
            _ => return true,
        };
        matches!(tokio::time::timeout(ws::SEND_WAIT, self.outbox.send(out)).await, Ok(Ok(())))
    }

    /// Queues the close, then waits for a `recv` to carry it away, as a
    /// WebSocket's close waits for the reply (PROTOCOL.md §5).
    pub(crate) async fn close(self, code: u16, mut shutdown: watch::Receiver<bool>) {
        if self.outbox.try_send(Out::Close(code)).is_err() {
            return;
        }
        let cut_short = async {
            ws::stopping(&mut shutdown).await;
            tokio::time::sleep(ws::SHUTDOWN_CLOSE_WAIT).await;
        };
        tokio::select! {
            _ = tokio::time::timeout(ws::CLOSE_WAIT, self.session.delivered.notified()) => {}
            _ = cut_short => {}
        }
    }
}

impl Drop for Side {
    fn drop(&mut self) {
        self.polls.remove(&self.id);
    }
}

fn new_id() -> String {
    let mut bytes = [0u8; ID_BYTES];
    getrandom::fill(&mut bytes).expect("the system's random source");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// 404 for a malformed room id, 403 for an Origin not on the allow list, as
/// for a WebSocket (PROTOCOL.md §3). Otherwise the headers every answer
/// carries: the allowed Origin echoed, so the browser lets the page read it.
fn check(state: &AppState, room: &str, headers: &HeaderMap) -> Result<HeaderMap, StatusCode> {
    if !auth::valid_room_id(room) {
        return Err(StatusCode::NOT_FOUND);
    }
    if !ws::origin_allowed(headers, &state.config.origins) {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut out = HeaderMap::new();
    out.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    out.insert(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(origin) = headers.get(header::ORIGIN) {
        out.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
    }
    Ok(out)
}

fn reply(headers: HeaderMap, status: StatusCode, body: String) -> Response {
    let mut response = (status, headers, body).into_response();
    let text = HeaderValue::from_static("text/plain; charset=utf-8");
    response.headers_mut().insert(header::CONTENT_TYPE, text);
    response
}

fn incoming(line: &str, max_frame: usize) -> Incoming {
    if line.len() > max_frame { Incoming::TooBig } else { Incoming::Text(Utf8Bytes::from(line.to_string())) }
}

fn utf8(body: &Bytes) -> Option<&str> {
    std::str::from_utf8(body).ok()
}

/// `POST /rooms/{roomId}/poll/open`, the body the opening frame: starts a
/// connection and answers its session id.
pub async fn open(State(state): State<AppState>, Path(room): Path<String>, headers: HeaderMap, body: Bytes) -> Response {
    let out = match check(&state, &room, &headers) {
        Ok(out) => out,
        Err(refused) => return refused.into_response(),
    };
    let Some(first) = utf8(&body) else {
        return reply(out, StatusCode::BAD_REQUEST, String::new());
    };
    let first = incoming(first, state.config.limits.max_frame);

    let (inbox_tx, inbox) = mpsc::channel(QUEUE);
    let (outbox, outbox_rx) = mpsc::channel(QUEUE);
    let _ = inbox_tx.try_send(first);
    let id = new_id();
    let session = Arc::new(Session {
        room: room.clone(),
        idle: state.config.limits.poll_idle,
        inbox: Mutex::new(Some(inbox_tx)),
        outbox: tokio::sync::Mutex::new(outbox_rx),
        sending: tokio::sync::Mutex::new(()),
        seen: Mutex::new(Seen { polling: 0, last: Instant::now() }),
        delivered: Notify::new(),
    });
    lock(&state.polls.sessions).insert(id.clone(), session.clone());
    let side = Side { id: id.clone(), session, polls: state.polls.clone(), inbox, outbox };

    let live = Live::new(&state.rooms);
    tokio::spawn(async move {
        let _live = live;
        ws::connection(Socket::Poll(side), state, room).await;
    });
    reply(out, StatusCode::OK, id)
}

/// `POST /rooms/{roomId}/poll/recv`, the body the session id: waits up to
/// `Limits::poll_wait` for frames and answers them one JSON object per line, or none.
/// A last line `{"type":"close","code":N}` ends the session. 404 for a session
/// that is not open.
pub async fn recv(State(state): State<AppState>, Path(room): Path<String>, headers: HeaderMap, body: Bytes) -> Response {
    let out = match check(&state, &room, &headers) {
        Ok(out) => out,
        Err(refused) => return refused.into_response(),
    };
    let Some(session) = utf8(&body).and_then(|id| state.polls.get(&room, id.trim())) else {
        return reply(out, StatusCode::NOT_FOUND, String::new());
    };
    let _polling = Polling::new(&session);
    let wait = state.config.limits.poll_wait;
    let mut shutdown = state.shutdown.clone();
    // One `recv` at a time; a second waits its turn rather than splitting frames.
    let Ok(mut outbox) = tokio::time::timeout(wait, session.outbox.lock()).await else {
        return reply(out, StatusCode::OK, String::new());
    };
    let cut_short = async {
        ws::stopping(&mut shutdown).await;
        tokio::time::sleep(ws::SHUTDOWN_CLOSE_WAIT).await;
    };
    let first = tokio::select! {
        first = outbox.recv() => first,
        _ = tokio::time::sleep(wait) => return reply(out, StatusCode::OK, String::new()),
        _ = cut_short => return reply(out, StatusCode::OK, String::new()),
    };

    let mut lines = String::new();
    let mut next = Some(first);
    loop {
        match next {
            Some(Some(Out::Frame(text))) => {
                lines.push_str(text.as_str());
                lines.push('\n');
            }
            Some(Some(Out::Close(code))) => {
                lines.push_str(&close_line(code));
                session.delivered.notify_one();
                break;
            }
            // The connection ended without a close: as a dropped WebSocket.
            Some(None) => {
                lines.push_str(&close_line(1006));
                break;
            }
            None => break,
        }
        if lines.len() >= ANSWER_BYTES {
            break;
        }
        next = match outbox.try_recv() {
            Ok(out) => Some(Some(out)),
            Err(mpsc::error::TryRecvError::Disconnected) => Some(None),
            Err(mpsc::error::TryRecvError::Empty) => None,
        };
    }
    reply(out, StatusCode::OK, lines)
}

fn close_line(code: u16) -> String {
    format!("{{\"type\":\"close\",\"code\":{code}}}\n")
}

/// `POST /rooms/{roomId}/poll/send`, the body the session id, then the
/// client's frames, one per line, in order. 204 once they are queued; 404 for
/// a session that is not open.
pub async fn send(State(state): State<AppState>, Path(room): Path<String>, headers: HeaderMap, body: Bytes) -> Response {
    let out = match check(&state, &room, &headers) {
        Ok(out) => out,
        Err(refused) => return refused.into_response(),
    };
    let Some(text) = utf8(&body) else {
        return reply(out, StatusCode::BAD_REQUEST, String::new());
    };
    let (id, frames) = text.split_once('\n').unwrap_or((text, ""));
    let Some(session) = state.polls.get(&room, id.trim()) else {
        return reply(out, StatusCode::NOT_FOUND, String::new());
    };
    let _sending = session.sending.lock().await;
    let Some(inbox) = lock(&session.inbox).clone() else {
        return reply(out, StatusCode::NOT_FOUND, String::new());
    };
    let max_frame = state.config.limits.max_frame;
    for line in frames.split('\n').filter(|line| !line.is_empty()) {
        if inbox.send(incoming(line, max_frame)).await.is_err() {
            return reply(out, StatusCode::NOT_FOUND, String::new());
        }
    }
    reply(out, StatusCode::NO_CONTENT, String::new())
}

/// `POST /rooms/{roomId}/poll/close`, the body the session id: the client is
/// leaving. 204 whether or not the session was open.
pub async fn close(State(state): State<AppState>, Path(room): Path<String>, headers: HeaderMap, body: Bytes) -> Response {
    let out = match check(&state, &room, &headers) {
        Ok(out) => out,
        Err(refused) => return refused.into_response(),
    };
    if let Some(id) = utf8(&body).map(str::trim) {
        if state.polls.get(&room, id).is_some() {
            state.polls.remove(id);
        }
    }
    reply(out, StatusCode::NO_CONTENT, String::new())
}
