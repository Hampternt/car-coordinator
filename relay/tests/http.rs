//! HTTP surface and the checks before an upgrade, PROTOCOL.md §3.

mod common;

use common::*;
use serde_json::json;

#[tokio::test]
async fn health_answers_ok() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    assert_eq!(http_get(relay.addr, "/health").await, (200, "ok".to_string()));
    relay.shutdown().await;
}

#[tokio::test]
async fn any_other_path_is_404() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    assert_eq!(http_get(relay.addr, "/").await.0, 404);
    assert_eq!(http_get(relay.addr, "/rooms").await.0, 404);
    relay.shutdown().await;
}

#[tokio::test]
async fn a_malformed_room_id_is_404_before_upgrade() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    assert_eq!(refused_status(try_connect(relay.addr, "short", Some(ORIGIN)).await), 404);
    let bad = format!("{}=", &room(1)[..21]);
    assert_eq!(refused_status(try_connect(relay.addr, &bad, Some(ORIGIN)).await), 404);
    relay.shutdown().await;
}

#[tokio::test]
async fn an_origin_not_on_the_list_is_403_before_upgrade() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    assert_eq!(refused_status(try_connect(relay.addr, &room(1), Some("https://evil.example")).await), 403);
    // Exact match only: a prefix of an allowed origin is not allowed.
    assert_eq!(refused_status(try_connect(relay.addr, &room(1), Some("http://127.0.0.1:51730")).await), 403);
    relay.shutdown().await;
}

#[tokio::test]
async fn an_allowed_origin_and_a_missing_origin_are_let_in() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let mut c = try_connect(relay.addr, &room(1), None).await.expect("no Origin is allowed");
    c.send(json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(c.recv().await, json!({"type": "welcome", "seq": 0}));
    let mut t = try_connect(relay.addr, &room(1), Some("http://tauri.localhost")).await.expect("the Tauri origin is allowed");
    t.send(json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(t.recv().await["type"], "welcome");
    relay.shutdown().await;
}
