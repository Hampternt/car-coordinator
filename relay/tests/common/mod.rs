//! Shared by the relay's integration tests. Tests talk to the relay only over
//! the wire (PROTOCOL.md), through `start`/`Relay`; nothing here reaches into
//! the crate's modules, so pack 1 can shape its internals freely.
#![allow(dead_code)]

use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use carsync_relay::{Config, Limits, Relay};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{self, Message};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

pub const CODE: &str = "test-create-code";
pub const ORIGIN: &str = "http://127.0.0.1:5173";
/// Upper bound on any single wait, so a broken relay fails a test instead of
/// hanging it.
pub const WAIT: Duration = Duration::from_secs(5);

pub fn config(dir: &Path) -> Config {
    Config {
        bind: "127.0.0.1:0".parse().unwrap(),
        data_dir: dir.to_path_buf(),
        create_code: Some(CODE.to_string()),
        origins: vec![ORIGIN.to_string(), "http://tauri.localhost".to_string()],
        limits: Limits::default(),
    }
}

pub async fn start(dir: &Path) -> Relay {
    start_with(config(dir)).await
}

pub async fn start_with(config: Config) -> Relay {
    carsync_relay::start(config).await.expect("the relay starts")
}

pub fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// A well-formed room id (22 chars), distinct per `n`.
pub fn room(n: u8) -> String {
    b64(&[n; 16])
}

/// A well-formed token (43 chars), distinct per `n`.
pub fn token(n: u8) -> String {
    b64(&[n; 32])
}

/// A body made of base64url characters, `len` long.
pub fn sized_body(len: usize) -> String {
    "A".repeat(len)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64
}

pub struct Client {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
}

pub async fn try_connect(addr: SocketAddr, room: &str, origin: Option<&str>) -> Result<Client, tungstenite::Error> {
    let mut request = format!("ws://{addr}/rooms/{room}/ws").into_client_request().unwrap();
    if let Some(origin) = origin {
        request.headers_mut().insert("Origin", origin.parse().unwrap());
    }
    let (ws, _) = tokio::time::timeout(WAIT, connect_async(request)).await.expect("connect timed out")?;
    Ok(Client { ws })
}

/// Connects from the allowed test origin.
pub async fn connect(addr: SocketAddr, room: &str) -> Client {
    try_connect(addr, room, Some(ORIGIN)).await.expect("the upgrade is accepted")
}

/// The HTTP status of a refused upgrade.
pub fn refused_status(result: Result<Client, tungstenite::Error>) -> u16 {
    match result {
        Err(tungstenite::Error::Http(response)) => response.status().as_u16(),
        Err(e) => panic!("expected an HTTP refusal, got {e}"),
        Ok(_) => panic!("expected an HTTP refusal, the upgrade was accepted"),
    }
}

impl Client {
    pub async fn send(&mut self, frame: Value) {
        self.send_text(&frame.to_string()).await;
    }

    /// Sends without panicking: for bursts the relay may close part-way through.
    pub async fn try_send(&mut self, frame: Value) -> bool {
        self.ws.send(Message::Text(frame.to_string().into())).await.is_ok()
    }

    pub async fn send_text(&mut self, text: &str) {
        self.ws.send(Message::Text(text.to_string().into())).await.expect("send");
    }

    pub async fn send_binary(&mut self, bytes: &[u8]) {
        self.ws.send(Message::Binary(bytes.to_vec().into())).await.expect("send");
    }

    /// The next JSON frame. Panics on a close, naming its code.
    pub async fn recv(&mut self) -> Value {
        loop {
            let next = tokio::time::timeout(WAIT, self.ws.next()).await.expect("no frame within the wait");
            match next {
                Some(Ok(Message::Text(text))) => return serde_json::from_str(&text).expect("the relay sends JSON"),
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                Some(Ok(Message::Close(frame))) => {
                    panic!("closed with {:?} while a frame was expected", frame.map(|f| u16::from(f.code)))
                }
                Some(Ok(other)) => panic!("unexpected message {other:?}"),
                Some(Err(e)) => panic!("read error {e}"),
                None => panic!("stream ended while a frame was expected"),
            }
        }
    }

    /// The next JSON frame, or the close code if the relay closes instead.
    pub async fn recv_or_close(&mut self) -> Result<Value, u16> {
        loop {
            let next = tokio::time::timeout(WAIT, self.ws.next()).await.expect("nothing within the wait");
            match next {
                Some(Ok(Message::Text(text))) => return Ok(serde_json::from_str(&text).expect("the relay sends JSON")),
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                Some(Ok(Message::Close(Some(frame)))) => return Err(u16::from(frame.code)),
                Some(Ok(other)) => panic!("unexpected message {other:?}"),
                Some(Err(e)) => panic!("dropped without a close frame: {e}"),
                None => panic!("stream ended without a close frame"),
            }
        }
    }

    /// Reads until the relay closes, and returns the close code. Panics on a
    /// close with no code, or a connection dropped without a close frame.
    pub async fn expect_close(&mut self) -> u16 {
        loop {
            let next = tokio::time::timeout(WAIT, self.ws.next()).await.expect("no close within the wait");
            match next {
                Some(Ok(Message::Close(Some(frame)))) => return u16::from(frame.code),
                Some(Ok(Message::Close(None))) => panic!("closed without a code"),
                Some(Ok(_)) => continue,
                Some(Err(e)) => panic!("dropped without a close frame: {e}"),
                None => panic!("stream ended without a close frame"),
            }
        }
    }

    pub async fn close(mut self) {
        let _ = self.ws.close(None).await;
    }
}

/// Creates `room` with `token` and the right code; asserts `created` then
/// `welcome {seq: 0}`.
pub async fn create(addr: SocketAddr, room: &str, token: &str) -> Client {
    let mut c = connect(addr, room).await;
    c.send(serde_json::json!({"type": "create", "token": token, "createCode": CODE})).await;
    assert_eq!(c.recv().await, serde_json::json!({"type": "created"}));
    assert_eq!(c.recv().await, serde_json::json!({"type": "welcome", "seq": 0}));
    c
}

/// Says hello with `token`; asserts `welcome` and returns its seq.
pub async fn hello(addr: SocketAddr, room: &str, token: &str) -> (Client, u64) {
    let mut c = connect(addr, room).await;
    c.send(serde_json::json!({"type": "hello", "token": token})).await;
    let welcome = c.recv().await;
    assert_eq!(welcome["type"], "welcome", "got {welcome}");
    let seq = welcome["seq"].as_u64().expect("welcome carries seq");
    (c, seq)
}

/// A plain HTTP GET: the status and the body.
pub async fn http_get(addr: SocketAddr, path: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(WAIT, stream.read_to_end(&mut raw)).await.expect("http timed out").unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status = text.split(' ').nth(1).and_then(|s| s.parse().ok()).expect("a status line");
    let body = text.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or_default();
    (status, body)
}

/// An HTTP answer: status, headers (names lower-cased) and body.
pub struct Answer {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Answer {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
    }
}

/// A plain HTTP POST with a text body, as a browser's `fetch` of a string
/// sends it: no preflight, `Origin` when `origin` is given.
pub async fn http_post(addr: SocketAddr, path: &str, origin: Option<&str>, body: &str) -> Answer {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let origin = origin.map(|o| format!("Origin: {o}\r\n")).unwrap_or_default();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {addr}\r\n{origin}Content-Type: text/plain;charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(WAIT, stream.read_to_end(&mut raw)).await.expect("http timed out").unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let mut lines = head.split("\r\n");
    let status = lines.next().and_then(|l| l.split(' ').nth(1)).and_then(|s| s.parse().ok()).expect("a status line");
    let headers = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(n, v)| (n.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect();
    Answer { status, headers, body: body.to_string() }
}

/// A client on the long-poll fallback (PROTOCOL.md §9), from the allowed
/// test origin.
pub struct Poller {
    pub addr: SocketAddr,
    pub room: String,
    pub id: String,
    /// Frames from the last `recv` not handed out yet.
    pending: std::collections::VecDeque<Value>,
}

impl Poller {
    /// `open` with `first` as the opening frame; asserts it is accepted.
    pub async fn open(addr: SocketAddr, room: &str, first: Value) -> Poller {
        let a = http_post(addr, &format!("/rooms/{room}/poll/open"), Some(ORIGIN), &first.to_string()).await;
        assert_eq!(a.status, 200, "open: {}", a.body);
        assert_eq!(a.body.len(), 22, "a session id is 16 bytes of base64url");
        Poller { addr, room: room.to_string(), id: a.body, pending: Default::default() }
    }

    pub fn path(&self, what: &str) -> String {
        format!("/rooms/{}/poll/{what}", self.room)
    }

    /// One `recv`: every line of its answer, parsed.
    pub async fn poll(&self) -> Answer {
        http_post(self.addr, &self.path("recv"), Some(ORIGIN), &self.id).await
    }

    /// The next frame, polling as often as it takes. A close comes back as
    /// `{"type":"close","code":N}`, as it is on the wire.
    pub async fn recv(&mut self) -> Value {
        let deadline = tokio::time::Instant::now() + WAIT;
        while self.pending.is_empty() {
            assert!(tokio::time::Instant::now() < deadline, "no frame within the wait");
            let a = self.poll().await;
            assert_eq!(a.status, 200, "recv: {}", a.body);
            for line in a.body.lines() {
                self.pending.push_back(serde_json::from_str(line).expect("one JSON object per line"));
            }
        }
        self.pending.pop_front().unwrap()
    }

    /// Reads until the session closes, and returns the code.
    pub async fn expect_close(&mut self) -> u64 {
        loop {
            let f = self.recv().await;
            if f["type"] == "close" {
                return f["code"].as_u64().expect("a close carries its code");
            }
        }
    }

    /// One `send` with these frames, one per line; returns its status.
    pub async fn send_lines(&self, lines: &[String]) -> u16 {
        let body = format!("{}\n{}", self.id, lines.join("\n"));
        http_post(self.addr, &self.path("send"), Some(ORIGIN), &body).await.status
    }

    pub async fn send(&self, frame: Value) {
        assert_eq!(self.send_lines(&[frame.to_string()]).await, 204);
    }

    pub async fn close(&self) -> u16 {
        http_post(self.addr, &self.path("close"), Some(ORIGIN), &self.id).await.status
    }
}

/// Every regular file directly in `dir`, read whole.
pub fn files_in(dir: &Path) -> Vec<(String, Vec<u8>)> {
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| (e.file_name().to_string_lossy().to_string(), std::fs::read(e.path()).unwrap()))
        .collect()
}

pub fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}
