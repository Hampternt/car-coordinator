# Ledger: shared plan, pack 1 (Relay server)

Unit ledger for `manifests/2026-10-07-shared-plan.md`, pack 1. Builder: pack-implementer, unit mode,
in the shared worktree (owns `relay/` and this file only). Scaffold ea8f1f4, started from d10d2db.

## Items

- [x] **Crate and config** — `Config::from_lookup` (empty = unset), `start`/`shutdown` (watch signal, graceful serve, waits for live connections), `/health`, SIGTERM in `main`, `Storage::open` with migration 1 (WAL, synchronous FULL, busy_timeout). Gate: `tests/config` 6/6, `tests/http` health + 404 2/2; binary on 127.0.0.1:3019 answered `ok 200`, SIGTERM exit 0; clippy -D warnings clean.
- [x] **Rooms and auth** — `auth.rs` (token: 43 chars → 32 bytes → sha256, `subtle` compare; create code compared as sha256 of both sides so its length does not leak; a missing room is compared against a dummy hash so both 4401s take the same path), `protocol::parse`, the upgrade checks (404, 403, two `Origin` headers refused), hello/create/join, close-then-drain. Gate: lib unit tests 6/6 (incl. PROTOCOL §1 sha256(token) vector); `tests/http` 5/5; `tests/rooms` 8/11 — the 3 red ones (`create_with_the_right_code_opens_the_room`, `hello_..._welcomed_with_the_rooms_seq`, `unknown_fields_are_ignored`) need op/catchup from items 3-4; clippy clean.
- [ ] **Storage**
- [ ] **WebSocket fan-out**
- [ ] **Limits**
- [ ] **Deploy files**

## Notes and deviations

- `progress-now.json` lives in this worktree's git dir, which pack 2's builder shares, so the two
  builders overwrite each other's "now" file. Expected with one shared worktree.
- The scaffold tests overlap item boundaries (some rooms tests need `op`/`catchup`), so each item
  is gated on the tests it turns green, named below; the whole suite is green from item 5 on.
