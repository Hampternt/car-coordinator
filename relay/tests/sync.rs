//! Ops, snapshots, versions, catchup, presence and persistence,
//! PROTOCOL.md §4.2-4.5.

mod common;

use common::*;
use serde_json::json;

#[tokio::test]
async fn two_clients_see_each_others_ops_in_order_with_acks() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    let (mut b, _) = hello(relay.addr, &room(1), &token(1)).await;
    let a_bodies: Vec<String> = (0..5).map(|i| format!("fromA{i}")).collect();
    let b_bodies: Vec<String> = (0..5).map(|i| format!("fromB{i}")).collect();
    for i in 0..5 {
        a.send(json!({"type": "op", "body": a_bodies[i]})).await;
        b.send(json!({"type": "op", "body": b_bodies[i]})).await;
    }
    for (name, client, own, other) in [("A", &mut a, &a_bodies, &b_bodies), ("B", &mut b, &b_bodies, &a_bodies)] {
        let mut seqs = Vec::new();
        let mut acks = 0;
        let mut seen = Vec::new();
        for _ in 0..10 {
            let f = client.recv().await;
            let seq = f["seq"].as_u64().unwrap_or_else(|| panic!("{name}: {f} has no seq"));
            match f["type"].as_str() {
                Some("ack") => acks += 1,
                Some("op") => seen.push(f["body"].as_str().unwrap().to_string()),
                _ => panic!("{name}: unexpected {f}"),
            }
            seqs.push(seq);
        }
        assert_eq!(seqs, (1..=10).collect::<Vec<u64>>(), "{name}: acks and ops arrive in seq order, no gaps");
        assert_eq!(acks, 5, "{name}: one ack per own op");
        assert_eq!(&seen, other, "{name}: the other's ops, in the order sent");
        assert!(seen.iter().all(|s| !own.contains(s)), "{name}: never its own op back");
    }
    relay.shutdown().await;
}

#[tokio::test]
async fn catchup_after_a_snapshot_has_only_the_ops_after_it() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    for i in 1..=3 {
        a.send(json!({"type": "op", "body": format!("op{i}")})).await;
        assert_eq!(a.recv().await, json!({"type": "ack", "seq": i}));
    }
    a.send(json!({"type": "snapshot", "seq": 2, "body": "snapTwo"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 2}));

    let (mut b, seq) = hello(relay.addr, &room(1), &token(1)).await;
    assert_eq!(seq, 3);
    b.send(json!({"type": "catchup", "since": 0})).await;
    assert_eq!(
        b.recv().await,
        json!({"type": "catchup", "seq": 3, "snapshot": {"seq": 2, "body": "snapTwo"}, "ops": [{"seq": 3, "body": "op3"}], "versions": []})
    );
    b.send(json!({"type": "catchup", "since": 3})).await;
    assert_eq!(b.recv().await["ops"], json!([]));
    b.send(json!({"type": "catchup", "since": 99})).await;
    let past = b.recv().await;
    assert_eq!((past["seq"].clone(), past["ops"].clone()), (json!(3), json!([])), "since above the room's seq is not an error");
    relay.shutdown().await;
}

#[tokio::test]
async fn snapshot_seq_rules() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    // A fresh room takes a snapshot at seq 0: this is how Create seeds it.
    a.send(json!({"type": "snapshot", "seq": 0, "body": "seed"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 0}));
    for i in 1..=3 {
        a.send(json!({"type": "op", "body": format!("op{i}")})).await;
        assert_eq!(a.recv().await["seq"], i);
    }
    a.send(json!({"type": "snapshot", "seq": 2, "body": "snapTwo"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 2}));
    // Stale: not stored, and the ack says which one is.
    a.send(json!({"type": "snapshot", "seq": 1, "body": "snapOne"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 2}));
    a.send(json!({"type": "catchup", "since": 0})).await;
    assert_eq!(a.recv().await["snapshot"], json!({"seq": 2, "body": "snapTwo"}));
    // Equal replaces.
    a.send(json!({"type": "snapshot", "seq": 2, "body": "snapTwoAgain"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 2}));
    a.send(json!({"type": "catchup", "since": 0})).await;
    let c = a.recv().await;
    assert_eq!(c["snapshot"], json!({"seq": 2, "body": "snapTwoAgain"}));
    assert_eq!(c["ops"], json!([{"seq": 3, "body": "op3"}]));
    // Up to the latest drops every op; the seq stays.
    a.send(json!({"type": "snapshot", "seq": 3, "body": "snapThree"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 3}));
    a.send(json!({"type": "catchup", "since": 0})).await;
    let c = a.recv().await;
    assert_eq!((c["seq"].clone(), c["ops"].clone()), (json!(3), json!([])));
    a.send(json!({"type": "op", "body": "op4"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 4}), "the seq never goes down");
    // Beyond the latest is a bad frame.
    a.send(json!({"type": "snapshot", "seq": 9, "body": "future"})).await;
    assert_eq!(a.expect_close().await, 4400);
    relay.shutdown().await;
}

#[tokio::test]
async fn versions_are_announced_fetched_and_kept_to_the_newest_50() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    let (mut b, _) = hello(relay.addr, &room(1), &token(1)).await;
    let before = now_ms();
    let mut last_at = 0;
    for i in 1..=55u64 {
        a.send(json!({"type": "version", "body": format!("verBody{i}"), "label": format!("label{i}")})).await;
        let ack = a.recv().await;
        assert_eq!((ack["type"].clone(), ack["id"].clone()), (json!("ack"), json!(i)), "{ack}");
        let at = ack["at"].as_u64().expect("at is an integer");
        assert!(at >= before.saturating_sub(1000) && at <= now_ms() + 1000, "at is unix ms: {at}");
        assert!(at >= last_at);
        last_at = at;
        assert_eq!(b.recv().await, json!({"type": "version", "id": i, "at": at, "label": format!("label{i}")}), "announced without body");
    }
    a.send(json!({"type": "catchup", "since": 0})).await;
    let c = a.recv().await;
    let versions = c["versions"].as_array().unwrap();
    assert_eq!(versions.iter().map(|v| v["id"].as_u64().unwrap()).collect::<Vec<_>>(), (6..=55).collect::<Vec<_>>());
    assert_eq!(versions[0]["label"], "label6");
    assert!(versions.iter().all(|v| v.get("body").is_none()), "the list carries no bodies");

    b.send(json!({"type": "getVersion", "id": 55})).await;
    let v = b.recv().await;
    assert_eq!((v["type"].clone(), v["id"].clone(), v["label"].clone(), v["body"].clone()), (json!("version"), json!(55), json!("label55"), json!("verBody55")));
    assert_eq!(v["at"], json!(last_at));
    b.send(json!({"type": "getVersion", "id": 3})).await;
    assert_eq!(b.recv().await, json!({"type": "noVersion", "id": 3}), "pruned");
    b.send(json!({"type": "getVersion", "id": 999})).await;
    assert_eq!(b.recv().await, json!({"type": "noVersion", "id": 999}), "never stored");

    // Ids are never reused after pruning.
    a.send(json!({"type": "version", "body": "verBody56", "label": "label56"})).await;
    assert_eq!(a.recv().await["id"], 56);
    relay.shutdown().await;
}

#[tokio::test]
async fn presence_is_forwarded_to_others_and_never_stored() {
    // base64url, 24 characters, so it also decodes cleanly: the scan below
    // looks for the text and for its decoded bytes.
    const MARKER: &str = "PresenceMarker7f3a9c0Zz_";
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    let (mut b, _) = hello(relay.addr, &room(1), &token(1)).await;
    a.send(json!({"type": "op", "body": "storedOp"})).await;
    assert_eq!(a.recv().await["type"], "ack");
    assert_eq!(b.recv().await["type"], "op");
    for _ in 0..3 {
        a.send(json!({"type": "presence", "body": MARKER})).await;
        assert_eq!(b.recv().await, json!({"type": "presence", "body": MARKER}));
    }
    // The sender does not get its own presence back: its next frame is the
    // catchup it asks for, which holds no presence either.
    a.send(json!({"type": "catchup", "since": 0})).await;
    let c = a.recv().await;
    assert_eq!(c["type"], "catchup");
    assert!(!c.to_string().contains(MARKER));
    a.close().await;
    b.close().await;
    relay.shutdown().await;

    let files = files_in(dir.path());
    assert!(!files.is_empty(), "the relay keeps its database in RELAY_DATA");
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, MARKER).unwrap();
    for (name, bytes) in files {
        assert!(!contains(&bytes, MARKER.as_bytes()), "presence text found in {name}");
        assert!(!contains(&bytes, &decoded), "presence bytes found in {name}");
    }
}

#[tokio::test]
async fn a_restart_keeps_every_room() {
    let dir = tempfile::tempdir().unwrap();
    let relay = start(dir.path()).await;
    let mut a = create(relay.addr, &room(1), &token(1)).await;
    a.send(json!({"type": "snapshot", "seq": 0, "body": "restartSnap"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 0}));
    a.send(json!({"type": "op", "body": "restartOp"})).await;
    assert_eq!(a.recv().await, json!({"type": "ack", "seq": 1}));
    a.send(json!({"type": "version", "body": "restartVer", "label": "restartLabel"})).await;
    let ack = a.recv().await;
    assert_eq!(ack["id"], 1);
    a.close().await;
    relay.shutdown().await;

    let relay = start(dir.path()).await;
    let (mut b, seq) = hello(relay.addr, &room(1), &token(1)).await;
    assert_eq!(seq, 1);
    b.send(json!({"type": "catchup", "since": 0})).await;
    assert_eq!(
        b.recv().await,
        json!({
            "type": "catchup", "seq": 1,
            "snapshot": {"seq": 0, "body": "restartSnap"},
            "ops": [{"seq": 1, "body": "restartOp"}],
            "versions": [{"id": 1, "at": ack["at"], "label": "restartLabel"}],
        })
    );
    b.send(json!({"type": "getVersion", "id": 1})).await;
    assert_eq!(b.recv().await["body"], "restartVer");
    b.send(json!({"type": "op", "body": "afterRestart"})).await;
    assert_eq!(b.recv().await, json!({"type": "ack", "seq": 2}));
    let mut wrong = connect(relay.addr, &room(1)).await;
    wrong.send(json!({"type": "hello", "token": token(2)})).await;
    assert_eq!(wrong.expect_close().await, 4401, "the token hash survives too");
    let mut dup = connect(relay.addr, &room(1)).await;
    dup.send(json!({"type": "create", "token": token(1), "createCode": CODE})).await;
    assert_eq!(dup.expect_close().await, 4409);
    relay.shutdown().await;
}
