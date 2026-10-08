//! Rooms and auth: create, hello and bad frames, PROTOCOL.md §4.1.

mod common;

use common::*;
use serde_json::json;

#[tokio::test]
async fn create_with_the_right_code_opens_the_room() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut c = create(relay.addr, &room(1), &token(1)).await;
    // The creator is in, as after hello: it can ask for a catchup.
    c.send(json!({"type": "catchup", "since": 0})).await;
    assert_eq!(c.recv().await, json!({"type": "catchup", "seq": 0, "snapshot": null, "ops": [], "versions": []}));
    relay.shutdown().await;
}

#[tokio::test]
async fn create_with_a_wrong_code_is_4403_and_makes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut c = connect(relay.addr, &room(1)).await;
    c.send(json!({"type": "create", "token": token(1), "createCode": "guess"})).await;
    assert_eq!(c.expect_close().await, 4403);
    let mut h = connect(relay.addr, &room(1)).await;
    h.send(json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(h.expect_close().await, 4401);
    relay.shutdown().await;
}

#[tokio::test]
async fn without_a_create_code_every_create_is_4403() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = config(dir.path());
    config.create_code = None;
    let relay = start_with(config).await;
    for code in ["", CODE] {
        let mut c = connect(relay.addr, &room(1)).await;
        c.send(json!({"type": "create", "token": token(1), "createCode": code})).await;
        assert_eq!(c.expect_close().await, 4403, "createCode {code:?}");
    }
    relay.shutdown().await;
}

#[tokio::test]
async fn creating_an_existing_room_is_4409_and_keeps_the_first_token() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let mut again = connect(relay.addr, &room(1)).await;
    again.send(json!({"type": "create", "token": token(2), "createCode": CODE})).await;
    assert_eq!(again.expect_close().await, 4409);
    let (_c, seq) = hello(relay.addr, &room(1), &token(1)).await;
    assert_eq!(seq, 0);
    let mut intruder = connect(relay.addr, &room(1)).await;
    intruder.send(json!({"type": "hello", "token": token(2)})).await;
    assert_eq!(intruder.expect_close().await, 4401);
    relay.shutdown().await;
}

#[tokio::test]
async fn hello_with_the_right_token_is_welcomed_with_the_rooms_seq() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    for _ in 0..3 {
        a.send(json!({"type": "op", "body": "b3Bz"})).await;
        assert_eq!(a.recv().await["type"], "ack");
    }
    let (_b, seq) = hello(relay.addr, &room(1), &token(1)).await;
    assert_eq!(seq, 3);
    relay.shutdown().await;
}

#[tokio::test]
async fn hello_with_a_bad_token_or_no_room_is_4401() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let mut wrong = connect(relay.addr, &room(1)).await;
    wrong.send(json!({"type": "hello", "token": token(9)})).await;
    assert_eq!(wrong.expect_close().await, 4401);
    let mut nowhere = connect(relay.addr, &room(2)).await;
    nowhere.send(json!({"type": "hello", "token": token(1)})).await;
    assert_eq!(nowhere.expect_close().await, 4401);
    relay.shutdown().await;
}

#[tokio::test]
async fn a_malformed_token_is_4400() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let too_short = &token(1)[..42];
    let padded = format!("{}=", &token(1)[..42]);
    for bad in [too_short, padded.as_str(), "not a token at all, 43 characters long...."] {
        let mut c = connect(relay.addr, &room(1)).await;
        c.send(json!({"type": "hello", "token": bad})).await;
        assert_eq!(c.expect_close().await, 4400, "token {bad:?}");
    }
    let mut c = connect(relay.addr, &room(2)).await;
    c.send(json!({"type": "create", "token": too_short, "createCode": CODE})).await;
    assert_eq!(c.expect_close().await, 4400);
    relay.shutdown().await;
}

#[tokio::test]
async fn any_other_frame_before_welcome_is_4401() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    for frame in [
        json!({"type": "catchup", "since": 0}),
        json!({"type": "op", "body": "b3Bz"}),
        json!({"type": "presence", "body": "aGk"}),
    ] {
        let mut c = connect(relay.addr, &room(1)).await;
        c.send(frame.clone()).await;
        assert_eq!(c.expect_close().await, 4401, "{frame}");
    }
    relay.shutdown().await;
}

#[tokio::test]
async fn bad_json_before_welcome_is_4400() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut c = connect(relay.addr, &room(1)).await;
    c.send_text("{not json").await;
    assert_eq!(c.expect_close().await, 4400);
    let mut c = connect(relay.addr, &room(1)).await;
    c.send(json!({"type": "shout"})).await;
    assert_eq!(c.expect_close().await, 4400);
    relay.shutdown().await;
}

#[tokio::test]
async fn bad_frames_after_welcome_are_4400() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    create(relay.addr, &room(1), &token(1)).await.close().await;
    let cases: Vec<(&str, Box<dyn Fn() -> serde_json::Value>)> = vec![
        ("unknown type", Box::new(|| json!({"type": "shout"}))),
        ("not an object (serde would read this array as a catchup)", Box::new(|| json!(["catchup", 0]))),
        ("missing body", Box::new(|| json!({"type": "op"}))),
        ("body not a string", Box::new(|| json!({"type": "op", "body": 7}))),
        ("body empty", Box::new(|| json!({"type": "op", "body": ""}))),
        ("body not base64url", Box::new(|| json!({"type": "op", "body": "a b+c/"}))),
        ("negative since", Box::new(|| json!({"type": "catchup", "since": -1}))),
        ("fractional id", Box::new(|| json!({"type": "getVersion", "id": 1.5}))),
        ("version without label", Box::new(|| json!({"type": "version", "body": "dmVy"}))),
        ("second hello", Box::new(|| json!({"type": "hello", "token": token(1)}))),
        ("create after welcome", Box::new(|| json!({"type": "create", "token": token(1), "createCode": CODE}))),
    ];
    for (name, frame) in cases {
        let (mut c, _) = hello(relay.addr, &room(1), &token(1)).await;
        c.send(frame()).await;
        assert_eq!(c.expect_close().await, 4400, "{name}");
    }
    let (mut c, _) = hello(relay.addr, &room(1), &token(1)).await;
    c.send_binary(b"{\"type\":\"catchup\",\"since\":0}").await;
    assert_eq!(c.expect_close().await, 4400, "a binary frame");
    relay.shutdown().await;
}

#[tokio::test]
async fn unknown_fields_are_ignored() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut c = connect(relay.addr, &room(1)).await;
    c.send(json!({"type": "create", "token": token(1), "createCode": CODE, "client": "0.15.0"})).await;
    assert_eq!(c.recv().await, json!({"type": "created"}));
    assert_eq!(c.recv().await, json!({"type": "welcome", "seq": 0}));
    c.send(json!({"type": "op", "body": "b3Bz", "extra": true})).await;
    assert_eq!(c.recv().await, json!({"type": "ack", "seq": 1}));
    relay.shutdown().await;
}
