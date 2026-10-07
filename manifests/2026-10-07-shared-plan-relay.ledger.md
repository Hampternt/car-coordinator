# Ledger: shared plan, pack 1 (Relay server)

Unit ledger for `manifests/2026-10-07-shared-plan.md`, pack 1. Builder: pack-implementer, unit mode,
in the shared worktree (owns `relay/` and this file only). Scaffold ea8f1f4, started from d10d2db.

## Items

- [x] **Crate and config** — `Config::from_lookup` (empty = unset), `start`/`shutdown` (watch signal, graceful serve, waits for live connections), `/health`, SIGTERM in `main`, `Storage::open` with migration 1 (WAL, synchronous FULL, busy_timeout). Gate: `tests/config` 6/6, `tests/http` health + 404 2/2; binary on 127.0.0.1:3019 answered `ok 200`, SIGTERM exit 0; clippy -D warnings clean.
- [ ] **Rooms and auth**
- [ ] **Storage**
- [ ] **WebSocket fan-out**
- [ ] **Limits**
- [ ] **Deploy files**

## Notes and deviations

- `progress-now.json` lives in this worktree's git dir, which pack 2's builder shares, so the two
  builders overwrite each other's "now" file. Expected with one shared worktree.
- The scaffold tests overlap item boundaries (some rooms tests need `op`/`catchup`), so each item
  is gated on the tests it turns green, named below; the whole suite is green from item 5 on.
