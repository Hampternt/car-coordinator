//! Every limit and its close code, PROTOCOL.md §5. Limits are lowered through
//! `Config::limits` where the default would make the test slow.

mod common;

use std::time::Duration;

use common::*;
use serde_json::json;

#[tokio::test]
async fn a_body_over_512_kb_is_4413() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    a.send(json!({"type": "op", "body": sized_body(524_288)})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 1}), "exactly the limit is fine");
    a.send(json!({"type": "snapshot", "seq": 1, "body": sized_body(524_289)})).await;
    assert_eq!(a.expect_close().await, 4413);
    let (mut b, _) = hello(relay.addr, &room(1), &token(1)).await;
    b.send(json!({"type": "presence", "body": sized_body(524_289)})).await;
    assert_eq!(b.expect_close().await, 4413, "presence is held to the same limit");
    relay.shutdown().await;
}

#[tokio::test]
async fn a_label_over_1_kb_is_4413() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    a.send(json!({"type": "version", "body": "dmVy", "label": sized_body(1024)})).await;
    assert_eq!(a.recv().await["type"], "ack");
    a.send(json!({"type": "version", "body": "dmVy", "label": sized_body(1025)})).await;
    assert_eq!(a.expect_close().await, 4413);
    relay.shutdown().await;
}

#[tokio::test]
async fn too_many_frames_too_fast_is_4429() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.rate_burst = 5;
    config.limits.rate_per_sec = 1;
    let relay = start_with(config).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    for _ in 0..10 {
        if !a.try_send(json!({"type": "presence", "body": "aGk"})).await {
            break;
        }
    }
    assert_eq!(a.expect_close().await, 4429);
    relay.shutdown().await;
}

#[tokio::test]
async fn the_rate_limit_refills() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.rate_burst = 3;
    config.limits.rate_per_sec = 10;
    let relay = start_with(config).await;
    // create costs one token; then two catchups per round, with time to refill.
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    for _ in 0..4 {
        for _ in 0..2 {
            a.send(json!({"type": "catchup", "since": 0})).await;
            assert_eq!(a.recv().await["type"], "catchup");
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    relay.shutdown().await;
}

#[tokio::test]
async fn the_room_cap_is_4507() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.max_rooms = 2;
    let relay = start_with(config).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    create(relay.addr, &room(2), &token(2)).await.close().await;
    let mut c = connect(relay.addr, &room(3)).await;
    c.send(json!({"type": "create", "token": token(3), "createCode": CODE})).await;
    assert_eq!(c.expect_close().await, 4507);
    // The order of checks (PROTOCOL.md §4.1): an existing room is 4409 first.
    let mut c = connect(relay.addr, &room(1)).await;
    c.send(json!({"type": "create", "token": token(1), "createCode": CODE})).await;
    assert_eq!(c.expect_close().await, 4409);
    // And a wrong code is 4403 before either.
    let mut c = connect(relay.addr, &room(3)).await;
    c.send(json!({"type": "create", "token": token(3), "createCode": "guess"})).await;
    assert_eq!(c.expect_close().await, 4403);
    relay.shutdown().await;
}

#[tokio::test]
async fn the_disk_cap_is_4507() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.max_disk_bytes = 256 * 1024;
    let relay = start_with(config).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    let mut acked = 0;
    let mut code = None;
    // Send 100 KB ops until the relay refuses one.
    for _ in 0..20 {
        a.send(json!({"type": "op", "body": sized_body(100_000)})).await;
        match a.recv_or_close().await {
            Ok(frame) => {
                assert_eq!(frame["type"], "ack", "{frame}");
                acked += 1;
            }
            Err(c) => {
                code = Some(c);
                break;
            }
        }
    }
    assert!(acked >= 1, "the first 100 KB fits under 256 KB");
    assert_eq!(code, Some(4507), "an op past the cap is refused");
    let mut c = connect(relay.addr, &room(2)).await;
    c.send(json!({"type": "create", "token": token(2), "createCode": CODE})).await;
    assert_eq!(c.expect_close().await, 4507, "so is a new room");
    relay.shutdown().await;
}

#[tokio::test]
async fn a_snapshot_is_stored_over_the_disk_cap_and_frees_the_space() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.max_disk_bytes = 256 * 1024;
    let relay = start_with(config).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    let mut acked = 0;
    loop {
        a.send(json!({"type": "op", "body": sized_body(100_000)})).await;
        match a.recv_or_close().await {
            Ok(frame) => {
                assert_eq!(frame["type"], "ack", "{frame}");
                acked += 1;
                assert!(acked < 20, "the cap never refused an op");
            }
            Err(code) => {
                assert_eq!(code, 4507, "an op past the cap is refused");
                break;
            }
        }
    }
    // Over the cap, the snapshot that covers every op still goes in: refusing
    // it would wedge the room, since it is what frees the space.
    let (mut b, welcome) = hello(relay.addr, &room(1), &token(1)).await;
    assert_eq!(welcome, acked);
    b.send(json!({"type": "snapshot", "seq": acked, "body": "c25hcA"})).await;
    assert_eq!(b.recv().await, json!({"type": "ack", "seq": acked}));
    b.send(json!({"type": "op", "body": sized_body(100_000)})).await;
    assert_eq!(b.recv().await, json!({"type": "ack", "seq": acked + 1}), "the ops' space is free again");
    relay.shutdown().await;
}

#[tokio::test]
async fn no_hello_in_time_is_4408() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.limits.hello_timeout = Duration::from_millis(300);
    let relay = start_with(config).await;
    let mut c = connect(relay.addr, &room(1)).await;
    assert_eq!(c.expect_close().await, 4408);
    relay.shutdown().await;
}
