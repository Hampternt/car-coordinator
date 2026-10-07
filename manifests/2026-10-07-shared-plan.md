# Container: Shared plan

**Status:** 🚧 ROUND 1 (packs 1 and 2) approved by the owner 2026-10-07 and building. Packs 3 and 4 drafted in outline.
**Date:** 2026-10-07
**Branch:** round 1 builds on `claude/car-coordinator-encryption-c717c5` (cut from `dev` at bd379ee) and goes back to `dev` through one PR. Later rounds cut from `dev` and comes back to `dev` through a PR. `main` only after the owner has tested the combined update on `dev` and said go.
**Scope:** Car Coordinator only. Breadify is untouched and nothing of it is synced.

## Goal

Two driver managers work on the same plan from any PC (work or home). They see each other's changes within a second, see who is editing what, and can push named versions to go back to. The plan is stored on the owner's Hetzner server, **encrypted in the browser with a key the server never sees** (option A, owner 2026-10-07).

<details><summary>Decisions so far (owner, 2026-10-07)</summary>

- **Two people**, wanting live updates, a sign that the other is editing, and Push for versions.
- **Option A, end-to-end.** The server stores and forwards only ciphertext. Losing every copy of the invite link means losing the shared copy; each PC's own local copy and Backups stay.
- **Invite link** carries the key, after the `#` so it never reaches a server.
- **Hetzner server** hosts the relay: the cx23 (x86_64, Ubuntu) behind `portfolio.dblo.net`, read from the drawingportfolio repo's `deploy/`. It runs nginx with certbot, and the portfolio is an axum binary on `127.0.0.1:3000` under systemd.
- **Live by default.** Every edit goes to the room while connected; **Push** saves a named version to go back to.
- **Everything syncs:** the day plan plus the setup (cars, positions, labels, drivers, crews, templates).
- **Supersedes HANDOFF.md decision 2** ("No data stored online, ever"). It becomes: nothing *readable* is stored online, and nothing at all unless the user joins a room. INVENTORY's **Local only** entry becomes **Local unless you join a shared plan**.

</details>

## Safety rules for every pack

These come from the repo's standing rule that an update never loses a user's data (`feedback-migration-plan-before-change`).

- **No room, no network.** A browser that has not joined a room behaves exactly as 0.14.1 and makes zero network calls. The upgrade check opens a 0.14.1 profile in the new build and asserts both.
- **The key never enters `carcoord:v1`.** It lives under its own per-browser key (`carcoord:pref:room`), so Export JSON, Backups, Archives and `recover.html` never contain it.
- **The invite fragment is stripped on load** (`history.replaceState`, as `#d=` already is), so the key does not stay in history or reach a synced browser history.
- **Joining is a migration, offered, never forced.** Ids are random per PC, so joining means one side's ids win. The room's creator seeds it from their plan. A joiner chooses **Take the shared plan**, sees a preview of what changes (reusing `share.js`'s name-matching preview), and their own plan goes to Backups first. Templates, crews and cars that exist only on the joiner's PC are named in the preview as staying in that Backup.
- **Version skew is read-only, not lossy.** Every snapshot, version and change carries the schema version. A client older than the room's shows "Update the app to edit the shared plan" and never writes, so an older `normalise()` can never drop fields for both people.
- **Offline keeps working.** If the relay is unreachable the app works locally and says so; it never blocks editing.
- **Never synced:** per-browser preferences, Backups, Archives, the save-file link, and anything Breadify.

## Packs, in order

| # | Pack | Runs | Risky | Saved data |
|---|---|---|---|---|
| 1 | **Relay server** (Rust, `relay/`) | Round 1, parallel with 2 | Auth, abuse | None on PCs; ciphertext on the server |
| 2 | **Join, Push and Pull** | Round 1, parallel with 1 | Auth, live data | New `carcoord:pref:room`; joining replaces local state (offered, backed up) |
| 3 | **Live updates** | Round 2, after 1+2 merge | Concurrency, live data | Every edit goes to the room |
| 4 | **Who is editing** | Round 3, or with 3 if the owner's test round allows | None stored | None |

**Where they build.** This session started in a worktree the desktop app made, and such a session cannot write to sibling worktrees (`app-worktree-guard-blocks-builder-worktrees`). So both builders work in this one worktree on disjoint paths (`relay/` vs `docs/` and `scripts/`). Each stages and commits only its own paths (`git commit -- <paths>`, never `git add -A`) and retries if `index.lock` is busy. A deviation from the usual one-worktree-per-builder, recorded here.

**Why parallel for 1 and 2:** counted under the count rule. Pack 1 has 6 items in `relay/` and pack 2 has 7 in `docs/`. They share no file beyond claimed one-liners (`package.json`'s test script, `.github/workflows/build.yml`). Both build against one agreed wire protocol, which the scaffold commits first.

**Why 3 and 4 are serial:** both rewrite how `docs/app.js` reacts to every edit, and 4 needs 3's change stream.

---

## Round 1

### Scaffold (one commit, before the builders)

- `relay/PROTOCOL.md`: the wire protocol below, as the contract both builders work to.
- `relay/` crate skeleton with stub handlers (`todo!()`) and tests written from the protocol, failing by panic.
- `docs/sync.js` with stub functions and `scripts/sync.mjs` tests, failing.
- Claims the one-liners: `package.json` test script gains `node scripts/sync.mjs`; `build.yml`'s test job gains `cargo test --manifest-path relay/Cargo.toml`. `relay/` is a standalone crate (no workspace), its `target/` gitignored.
- `INVENTORY.md`: the 💭 Considered line moves to a 🚧 pointer under **Sharing**.

<details><summary>Wire protocol (the contract)</summary>

**`relay/PROTOCOL.md` is the contract from the scaffold (ea8f1f4) on.** It settles what the outline below left open:
- **Version names:** a version frame carries a separately sealed `label` (`{schema, name}`, AAD kind `label`), so the list shows names without fetching bodies.
- **Acks:** every snapshot, op and version is acked.
- **Missing versions:** `getVersion` answers `noVersion` for a pruned or unknown id.
- **Catchup** also carries the room's latest `seq`.
- **Close codes:** `4408` when no hello arrives within 10 s; a wrong token and a missing room give the same `4401`, so rooms can't be probed.
- **Version ids** are integers per room, never reused.
- **Rate limit:** a token bucket, burst 120 and 30 per second.
- **New settings:** `RELAY_MAX_ROOMS` and `RELAY_MAX_DISK_BYTES`.
- **Allowed origins** default to `https://hampternt.github.io` and `http://tauri.localhost`.

**Open for the auth review and the owner:** a connection with no `Origin` header is allowed. Every browser sends one, other clients can forge it anyway, and the token is the real gate. Refusing it instead is a one-line change.

The outline as first drafted:

**Keys.** The invite link is `…/#join=<secret>`, where `<secret>` is 32 random bytes, base64url. From it, HKDF-SHA256 derives:
- `roomId` (16 bytes): names the room on the server;
- `authToken` (32 bytes): proves the client holds the link; the server stores only `sha256(authToken)`;
- `encKey`: AES-GCM 256, never leaves the browser.

**Ciphertext.** `body = base64url(iv[12] ‖ AES-GCM(encKey, plaintext, aad = roomId ‖ kind))`. The plaintext is JSON and always contains `schema`. The server sees `roomId`, sizes, timestamps and sequence numbers, nothing else.

**Where.** The app's relay address is a constant in `docs/sync.js`, `wss://portfolio.dblo.net/carsync`, overridable on one PC by the pref `carcoord:pref:relay` (dev and tests use `ws://127.0.0.1:<port>`). nginx strips the `/carsync` prefix, so the relay itself serves `/health` and `/rooms/{roomId}/ws`. Everything goes over the WebSocket, so there is no CORS; the relay instead refuses an `Origin` that is not on its allow list (`RELAY_ORIGINS`).

**HTTP.** `GET /health` → `200 ok`. Nothing else.

**WebSocket** `GET /rooms/{roomId}/ws`. Every message is one JSON text frame. The first frame is either
- `{type:"hello", token}`: joins an existing room. A wrong token, or no such room, closes with `4401`.
- `{type:"create", token, createCode}`: makes the room, storing `sha256(token)`. A wrong create code closes with `4403`, an existing room with `4409`. Success is answered `{type:"created"}` and the connection stays open as if it had said hello.

After `hello` the server answers `{type:"welcome", seq}` (the room's latest seq). Bad JSON or an unknown type closes with `4400`.

| Client sends | Server does | Others receive |
|---|---|---|
| `{type:"snapshot", seq, body}` | stores as the room's base at `seq`, drops older changes | — |
| `{type:"op", body}` | assigns the next `seq`, stores it | `{type:"op", seq, body}` (sender gets an ack) |
| `{type:"version", body}` | stores with `id` and time; keeps the last 50 | `{type:"version", id, at}` |
| `{type:"getVersion", id}` | — | sender: `{type:"version", id, at, body}` |
| `{type:"catchup", since}` | — | sender: latest snapshot + ops after `since`, + version list |
| `{type:"presence", body}` | forwards, **never stores** | `{type:"presence", body}` |

Pack 2 uses snapshot, version, getVersion and catchup. Pack 3 adds op, pack 4 adds presence. The relay implements all of them in round 1, so packs 3 and 4 are client-only.

**Limits.** Body ≤ 512 KB (close `4413`), a per-connection rate limit (close `4429`), at most 20 rooms and 2 GB on disk (both close `4507`).

</details>

### Pack 1: Relay server

`Agents: scaffold 1 (medium, shared with pack 2) · build 1 (medium) · review: auth lens (high) · verify 3 (high)`
`Agent brief:` this manifest's Safety rules and Wire protocol, `relay/PROTOCOL.md`, `/home/hampter/.claude/CLAUDE.md` § Builder worktrees (its own target dir). Depends on: the scaffold only.

- [ ] **Crate and config:** axum + tokio, configured by env (`RELAY_BIND`, `RELAY_DATA`, `RELAY_CREATE_CODE`, `RELAY_ORIGINS`, the Pages origin plus `http://tauri.localhost`). *Done when:* `cargo run --manifest-path relay/Cargo.toml` answers `/health`.
- [ ] **Rooms and auth:** create gated by the owner's create code; the token is checked against its stored hash, in constant time. *Done when:* tests for a wrong create code, a duplicate room, a bad token and the right token pass.
- [ ] **Storage:** SQLite holding the snapshot, the op log after it, and versions (last 50). *Done when:* a snapshot drops older ops, and a restart keeps everything.
- [ ] **WebSocket fan-out:** sequencing, acks, catchup, presence forwarded but never written. *Done when:* a two-client test sees each other's ops in order, and presence never appears in the database.
- [ ] **Limits:** body size, rate, room count, disk cap, each refused with a clear close code. *Done when:* a test hits each one.
- [ ] **Deploy files:** `relay/deploy/carsync.service` (its own `carsync` user, `/opt/carsync`, `EnvironmentFile`, binding `127.0.0.1:3010`) and an nginx `location /carsync/` for the existing `portfolio.dblo.net` server block, with the WebSocket upgrade headers, `proxy_read_timeout 1h` and its own `limit_req` zone. That way there is no new DNS record or certificate. `relay/README.md` gives the steps, following drawingportfolio's deploying skill: build for x86_64, `127.0.0.1` not `localhost`, `diff -u` against the live nginx file before copying, apply with a backup and `nginx -t`. **The owner runs them.** Claude does not touch the server without asking. *Done when:* the README steps work against a local build and nginx in a container passes `nginx -t` with the snippet.

### Pack 2: Join, Push and Pull

`Agents: build 1 (medium) · review: auth + live-data lens (high) · verify 3 (high)`
`Agent brief:` this manifest's Safety rules and Wire protocol, `docs/store.js` (`Store.snapshot()`, `pref`), `docs/share.js` (preview and `#d=` handling to match), `scripts/smoke.mjs` style. Depends on: the scaffold. Owns `docs/sync.js`, `scripts/sync.mjs`, `scripts/stub-relay.mjs` (a node implementation of the protocol, for tests until pack 1 merges), and its own edits to `docs/app.js`, `docs/index.html`, `docs/style.css` and `docs/store.js`. Pack 1 touches none of them.

- [ ] **Crypto (`docs/sync.js`):** key generation, HKDF, AES-GCM with the AAD above, WebCrypto only. *Done when:* `scripts/sync.mjs` round-trips, and rejects a wrong key and a swapped `kind`.
- [ ] **Connection and status:** connect, reconnect with backoff, catch up on reconnect; a status line (Connected / Offline, working locally / Update the app). CSP `connect-src` gains `wss://portfolio.dblo.net` (and `ws://127.0.0.1:*` for dev and tests; a CSP source without a port matches only the default one). *Done when:* killing the stub relay shows Offline and editing still works.
- [ ] **Create a room:** Data tab → Shared plan → Create (asks for the owner's create code once), seeds the room from this plan, shows the invite link and QR. *Done when:* the room holds a snapshot that decrypts back to the plan.
- [ ] **Join:** open the invite link → the fragment is stripped → preview of what changes → **Take the shared plan** (Backup first) or Not now. *Done when:* smoke covers both choices and checks the Backup.
- [ ] **Push a version:** a named version ("Monday final") from the current plan. *Done when:* the other browser sees it in the list.
- [ ] **Pull, look first, restore:** the version list with Look first (the existing preview) and Restore (Backup first); a client whose schema is older than the room's is read-only. *Done when:* smoke covers restore and the read-only case.
- [ ] **Leave the room:** forgets the key on this PC; the local plan stays. *Done when:* after Leave, zero network calls and the plan unchanged.

<details><summary>Test it yourself (round 1)</summary>

Filled in at handover with the exact commands. The outline:
1. Start the relay locally and the dev server, then open two windows (a normal one and a private one).
2. Window 1 loads the seed fixture (made-up cars and drivers, committed with the pack), creates a room and copies the invite.
3. Window 2 opens the invite: check the preview, take the shared plan, and find its old plan in Backups.
4. Push "Test 1" from window 1, then look at it and restore it from window 2.
5. Stop the relay: both say Offline and keep working. Start it again: both reconnect.
6. Open the invite in a third window holding a 0.14.1-era plan and press Not now: nothing changes.

</details>

---

## Round 2: Live updates (pack 3)

Drafted in full while the owner tests round 1.

**Goal:** while connected, every edit reaches the other person within about a second, as one change per field (`route X, car = Y`), applied in the server's order so both screens end up identical. A change made offline is sent on reconnect. Two edits to the same field within a few seconds are flagged on both screens ("Kari also changed this"), never silently lost. The plan is snapshotted from time to time so a newcomer does not replay the whole history.
*Done when:* a two-browser smoke test edits simultaneously, offline and back, and both end identical, with the collision shown.
`Agents: build 1 serial (medium) · review: concurrency + live-data lens (high) · verify 3 (high)`

## Round 3: Who is editing (pack 4)

**Goal:** "Kari is here, on the Cars tab"; the field Kari is in is outlined in her colour with a name tag; a soft warning when you click into the same field (never a block); optional typing preview. Each person picks a display name and colour on this PC, sent only inside the encryption.
*Done when:* two-browser smoke sees focus, tab and leave events within a second, and the relay database holds no presence.
`Agents: build 1 serial (medium) · review: none beyond the smoke check (nothing stored)`

---

## Open questions for the owner

- The relay sits at `wss://portfolio.dblo.net/carsync/` (default). A subdomain such as `sync.dblo.net` is cleaner but needs DNS A and AAAA records and a certbot run; say if you prefer it.
- Room creation is gated by an owner create code, set on the server (default; say if you want otherwise).

## Ledger

- 2026-10-07: drafted after the design talk (options A/B, invite link, Hetzner).
- 2026-10-07: scaffold ea8f1f4. Relay: 35 tests compile, and 34 fail on `todo!()`. `sync.mjs`: 12 checks fail on "not implemented", 8 pass. `check.sh` OK. The relay tests have never run against an implementation, so a wrong test goes back through the contract, never edited.
- 2026-10-07: owner said go on round 1 ("begin work on the manifest"). The WebSocket now carries room creation too, so the relay needs no CORS.
- 2026-10-07: owner chose live by default and everything synced. Server facts read from drawingportfolio's `deploy/` (nginx, certbot, axum on :3000).
