//! The long-poll fallback, PROTOCOL.md §9: the same connection as a
//! WebSocket, over plain POSTs.

mod common;

use std::time::Duration;

use common::*;
use serde_json::json;

#[tokio::test]
async fn a_room_is_made_and_joined_over_long_poll() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = Poller::open(relay.addr, &room(1), json!({"type": "create", "token": token(1), "createCode": CODE})).await;
    assert_eq!(a.recv().await, json!({"type": "created"}));
    assert_eq!(a.recv().await, json!({"type": "welcome", "seq": 0}));
    let mut b = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(b.recv().await, json!({"type": "welcome", "seq": 0}));
    assert_ne!(a.id, b.id, "every session has its own id");
    relay.shutdown().await;
}

#[tokio::test]
async fn a_poller_and_a_websocket_share_a_room() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut ws = create(relay.addr, &room(1), &token(1)).await;
    let mut p = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(p.recv().await, json!({"type": "welcome", "seq": 0}));

    // Several frames in one send keep their order, and each is answered.
    let ops: Vec<String> = (0..3).map(|i| json!({"type": "op", "body": format!("fromP{i}")}).to_string()).collect();
    assert_eq!(p.send_lines(&ops).await, 204);
    for seq in 1..=3 {
        assert_eq!(p.recv().await, json!({"type": "ack", "seq": seq}));
        assert_eq!(ws.recv().await, json!({"type": "op", "seq": seq, "body": format!("fromP{}", seq - 1)}));
    }
    ws.send(json!({"type": "op", "body": "fromWs"})).await;
    assert_eq!(ws.recv().await, json!({"type": "ack", "seq": 4}));
    assert_eq!(p.recv().await, json!({"type": "op", "seq": 4, "body": "fromWs"}));

    // Presence crosses both ways, and catchup answers as it does on a socket.
    p.send(json!({"type": "presence", "body": "aGVyZQ"})).await;
    assert_eq!(ws.recv().await, json!({"type": "presence", "body": "aGVyZQ"}));
    p.send(json!({"type": "catchup", "since": 2})).await;
    let c = p.recv().await;
    assert_eq!((c["type"].as_str(), c["seq"].as_u64(), c["ops"].as_array().map(Vec::len)), (Some("catchup"), Some(4), Some(2)));
    relay.shutdown().await;
}

#[tokio::test]
async fn refusals_close_the_session_with_the_websockets_codes() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;

    let mut wrong = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(2)})).await;
    assert_eq!(wrong.expect_close().await, 4401);
    assert_eq!(wrong.poll().await.status, 404, "a closed session is gone");
    assert_eq!(wrong.send_lines(&[json!({"type": "catchup", "since": 0}).to_string()]).await, 404);

    let mut code = Poller::open(relay.addr, &room(2), json!({"type": "create", "token": token(2), "createCode": "nope"})).await;
    assert_eq!(code.expect_close().await, 4403);

    let mut bad = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(bad.recv().await["type"], "welcome");
    assert_eq!(bad.send_lines(&["not json".to_string()]).await, 204);
    assert_eq!(bad.expect_close().await, 4400);
    relay.shutdown().await;
}

#[tokio::test]
async fn the_checks_before_a_session_are_the_websockets() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let hello = json!({"type": "hello", "token": token(1)}).to_string();
    let open = |room: String| format!("/rooms/{room}/poll/open");

    assert_eq!(http_post(relay.addr, &open("short".into()), Some(ORIGIN), &hello).await.status, 404);
    assert_eq!(http_post(relay.addr, &open(room(1)), Some("https://evil.example"), &hello).await.status, 403);
    let a = http_post(relay.addr, &open(room(1)), Some(ORIGIN), &hello).await;
    assert_eq!(a.status, 200);
    assert_eq!(a.header("access-control-allow-origin"), Some(ORIGIN), "the page may read the answer");
    assert_eq!(a.header("cache-control"), Some("no-store"));
    let t = http_post(relay.addr, &open(room(1)), Some("http://tauri.localhost"), &hello).await;
    assert_eq!(t.header("access-control-allow-origin"), Some("http://tauri.localhost"));
    let none = http_post(relay.addr, &open(room(1)), None, &hello).await;
    assert_eq!((none.status, none.header("access-control-allow-origin")), (200, None), "no Origin is allowed");

    let recv = format!("/rooms/{}/poll/recv", room(1));
    assert_eq!(http_post(relay.addr, &recv, Some(ORIGIN), "AAAAAAAAAAAAAAAAAAAAAA").await.status, 404, "an unknown session");
    let elsewhere = format!("/rooms/{}/poll/recv", room(2));
    assert_eq!(http_post(relay.addr, &elsewhere, Some(ORIGIN), &a.body).await.status, 404, "a session belongs to its room");
    assert_eq!(http_get(relay.addr, &recv).await.0, 405, "the poll paths take POST only");
    relay.shutdown().await;
}

#[tokio::test]
async fn a_recv_with_nothing_to_say_answers_empty_after_the_wait() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.poll_wait = Duration::from_millis(300);
    let relay = start_with(config).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let mut p = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(p.recv().await["type"], "welcome");
    let started = std::time::Instant::now();
    let a = p.poll().await;
    assert_eq!((a.status, a.body.as_str()), (200, ""));
    assert!(started.elapsed() >= Duration::from_millis(250), "it waited");
    relay.shutdown().await;
}

#[tokio::test]
async fn a_session_nobody_polls_is_dropped_from_its_room() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.poll_idle = Duration::from_millis(300);
    let relay = start_with(config).await;
    let mut ws = create(relay.addr, &room(1), &token(1)).await;
    let mut p = Poller::open(relay.addr, &room(1), json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(p.recv().await["type"], "welcome");
    tokio::time::sleep(Duration::from_millis(800)).await;
    assert_eq!(p.poll().await.status, 404, "gone, as a dropped connection is");
    // The room carries on without it.
    ws.send(json!({"type": "op", "body": "c3RpbGw"})).await;
    assert_eq!(ws.recv().await, json!({"type": "ack", "seq": 1}));
    relay.shutdown().await;
}

#[tokio::test]
async fn close_ends_the_session() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut p = Poller::open(relay.addr, &room(1), json!({"type": "create", "token": token(1), "createCode": CODE})).await;
    assert_eq!(p.recv().await["type"], "created");
    assert_eq!(p.close().await, 204);
    assert_eq!(p.poll().await.status, 404);
    assert_eq!(p.close().await, 204, "closing twice is harmless");
    relay.shutdown().await;
}

#[tokio::test]
async fn limits_hold_as_on_a_websocket() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.max_frame = 200;
    config.limits.max_body = 100;
    config.limits.rate_burst = 5;
    config.limits.rate_per_sec = 1;
    let relay = start_with(config).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let hello = || json!({"type": "hello", "token": token(1)});

    let mut big = Poller::open(relay.addr, &room(1), hello()).await;
    assert_eq!(big.recv().await["type"], "welcome");
    big.send_lines(&["x".repeat(201)]).await;
    assert_eq!(big.expect_close().await, 1009, "a frame over the frame limit");

    let mut body = Poller::open(relay.addr, &room(1), hello()).await;
    assert_eq!(body.recv().await["type"], "welcome");
    body.send(json!({"type": "op", "body": sized_body(101)})).await;
    assert_eq!(body.expect_close().await, 4413);

    let mut fast = Poller::open(relay.addr, &room(1), hello()).await;
    assert_eq!(fast.recv().await["type"], "welcome");
    let burst: Vec<String> = (0..10).map(|_| json!({"type": "catchup", "since": 0}).to_string()).collect();
    fast.send_lines(&burst).await;
    assert_eq!(fast.expect_close().await, 4429, "every line costs a token, the opening frame included");
    relay.shutdown().await;
}

#[tokio::test]
async fn shutdown_closes_a_waiting_recv_with_1001() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut p = Poller::open(relay.addr, &room(1), json!({"type": "create", "token": token(1), "createCode": CODE})).await;
    assert_eq!(p.recv().await["type"], "created");
    assert_eq!(p.recv().await["type"], "welcome");
    let waiting = tokio::spawn(async move { p.expect_close().await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    let started = std::time::Instant::now();
    relay.shutdown().await;
    assert!(started.elapsed() < Duration::from_secs(3), "a long-poll does not hold the shutdown up");
    assert_eq!(waiting.await.unwrap(), 1001);
}
