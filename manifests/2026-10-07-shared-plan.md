# Container: Shared plan

**Status:** 🚧 ROUND 1 (packs 1 and 2) built, reviewed and gated as 0.15.0. **Handed over for the owner's Test it yourself;** nothing is merged into `dev`. Packs 3 and 4 drafted in outline.
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
- **Quiet by default** (owner, 2026-10-08: data safety without disruptive or annoying interruptions). Being offline, reconnecting, catching up, a collision and a read-only room show as the status pill and small marks, never as a dialog. A dialog appears only before something replaces the whole plan, and that is the dialog such an action already has, with one more line, never a second step. Every replacement still goes to Backups first, and nothing is dropped without a mark saying so.
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

- [x] **Crate and config:** axum + tokio, configured by env (`RELAY_BIND`, `RELAY_DATA`, `RELAY_CREATE_CODE`, `RELAY_ORIGINS`, the Pages origin plus `http://tauri.localhost`). *Done when:* `cargo run --manifest-path relay/Cargo.toml` answers `/health`.
- [x] **Rooms and auth:** create gated by the owner's create code; the token is checked against its stored hash, in constant time. *Done when:* tests for a wrong create code, a duplicate room, a bad token and the right token pass.
- [x] **Storage:** SQLite holding the snapshot, the op log after it, and versions (last 50). *Done when:* a snapshot drops older ops, and a restart keeps everything.
- [x] **WebSocket fan-out:** sequencing, acks, catchup, presence forwarded but never written. *Done when:* a two-client test sees each other's ops in order, and presence never appears in the database.
- [x] **Limits:** body size, rate, room count, disk cap, each refused with a clear close code. *Done when:* a test hits each one.
- [x] **Deploy files:** `relay/deploy/carsync.service` (its own `carsync` user, `/opt/carsync`, `EnvironmentFile`, binding `127.0.0.1:3010`) and an nginx `location /carsync/` for the existing `portfolio.dblo.net` server block, with the WebSocket upgrade headers, `proxy_read_timeout 1h` and its own `limit_req` zone. That way there is no new DNS record or certificate. `relay/README.md` gives the steps, following drawingportfolio's deploying skill: build for x86_64, `127.0.0.1` not `localhost`, `diff -u` against the live nginx file before copying, apply with a backup and `nginx -t`. **The owner runs them.** Claude does not touch the server without asking. *Done when:* the README steps work against a local build and nginx in a container passes `nginx -t` with the snippet.

### Pack 2: Join, Push and Pull

`Agents: build 1 (medium) · review: auth + live-data lens (high) · verify 3 (high)`
`Agent brief:` this manifest's Safety rules and Wire protocol, `docs/store.js` (`Store.snapshot()`, `pref`), `docs/share.js` (preview and `#d=` handling to match), `scripts/smoke.mjs` style. Depends on: the scaffold. Owns `docs/sync.js`, `scripts/sync.mjs`, `scripts/stub-relay.mjs` (a node implementation of the protocol, for tests until pack 1 merges), and its own edits to `docs/app.js`, `docs/index.html`, `docs/style.css` and `docs/store.js`. Pack 1 touches none of them.

- [x] **Crypto (`docs/sync.js`):** key generation, HKDF, AES-GCM with the AAD above, WebCrypto only. *Done when:* `scripts/sync.mjs` round-trips, and rejects a wrong key and a swapped `kind`.
- [x] **Connection and status:** connect, reconnect with backoff, catch up on reconnect; a status line (Connected / Offline, working locally / Update the app). CSP `connect-src` gains `wss://portfolio.dblo.net` (and `ws://127.0.0.1:*` for dev and tests; a CSP source without a port matches only the default one). *Done when:* killing the stub relay shows Offline and editing still works.
- [x] **Create a room:** Data tab → Shared plan → Create (asks for the owner's create code once), seeds the room from this plan, shows the invite link and QR. *Done when:* the room holds a snapshot that decrypts back to the plan.
- [x] **Join:** open the invite link → the fragment is stripped → preview of what changes → **Take the shared plan** (Backup first) or Not now. *Done when:* smoke covers both choices and checks the Backup.
- [x] **Push a version:** a named version ("Monday final") from the current plan. *Done when:* the other browser sees it in the list.
- [x] **Pull, look first, restore:** the version list with Look first (the existing preview) and Restore (Backup first); a client whose schema is older than the room's is read-only. *Done when:* smoke covers restore and the read-only case.
- [x] **Leave the room:** forgets the key on this PC; the local plan stays. *Done when:* after Leave, zero network calls and the plan unchanged.

## Test it yourself (round 1)

Everything runs on this PC; your Hetzner server is not involved yet. All test data is made up.

Made-up data only: `scripts/fixtures/dev-data.json` (the repo's invented fleet) and `scripts/fixtures/shared-plan-other-pc.json` (another PC's made-up plan: cars ZZ 90001 and ZZ 90002, template Holiday rota, day group Night crew, position Back yard).

1. Start the relay on this PC as `relay/README.md` § Run it locally says, allowing the dev server's origin:
   `RELAY_DATA=/tmp/carsync-dev RELAY_CREATE_CODE=dev RELAY_ORIGINS=https://hampternt.github.io,http://tauri.localhost,http://localhost:5173,http://127.0.0.1:5173 cargo run --manifest-path relay/Cargo.toml` (it serves 127.0.0.1:3010; `curl http://127.0.0.1:3010/health` says ok). Then `npm run dev` and open http://localhost:5173/ in a normal window (window 1) and in a private window (window 2).
2. In each window, point the app at the local relay: open the console (F12) and run `localStorage.setItem('carcoord:pref:relay', 'ws://127.0.0.1:3010')`, then reload. Until you create or join a shared plan, nothing changes and the top bar shows no Shared plan status.
3. Window 1: Data tab → Import a copy… → `scripts/fixtures/dev-data.json`. In Shared plan, type `dev` in Create code and press Create a shared plan. Expected: the top bar says "Shared plan: Connected", and the card shows the invite link and its QR. Try a wrong code first if you like: it says the code was not accepted, and nothing changes.
4. Window 2: Import `scripts/fixtures/shared-plan-other-pc.json`. Copy window 1's invite link (Copy the invite link), paste it into window 2's address bar and press Enter. Expected: the address bar loses the `#join=…` at once, and a dialog "Join this shared plan?" says the plan holds 15 routes. It also lists what is only on this PC (Cars: ZZ 90001, ZZ 90002; Positions: Back yard; Day groups: Night crew; Templates: Holiday rota, and more) as kept in the Backup.
5. Press Not now: nothing changes (same plan, Backups as before, no status in the bar). Paste the link again and press Take the shared plan. Expected: the plan is window 1's, the bar says Connected, and Data → Backups holds window 2's old plan (as "Before joining the shared plan", or as "Start of day" if that was the same plan).
6. Window 1: change a driver, type `Test 1` in the version name, Push a version. Expected: "Pushed “Test 1”", and Test 1 appears in window 2's Versions list without a reload.
7. Window 2: Look first on Test 1 shows the same kind of preview and changes nothing on Close. Restore it (two presses in the list, or Restore it in Look first): window 1's changed driver is on screen, and the plan before it is in Backups.
8. Stop the relay (Ctrl+C). Both bars say "Shared plan: Offline", and editing still works and is saved. Start it again (same command, same RELAY_DATA): both say Connected within about 30 seconds.
9. Window 2: Leave the shared plan (two presses). The status disappears, the plan stays as it is, and after a reload nothing connects (F12 → Network → WS stays empty).
10. Auth as a visitor: open the invite link with one character changed in a third browser profile (not another private window, which shares window 2's storage). Expected: "This invite link does not open a shared plan", Not now, nothing changes. A link cut short is stripped and ignored with no dialog.


---

## Round 2: Live updates (pack 3)

**Status:** 💭 drafted 2026-10-08 while the owner tests round 1. Building waits for their go.
`Agents: build 1 serial (medium) · review: concurrency + live-data lens (high) · verify 3 (high)`
`Agent brief:` this manifest's Safety rules, `relay/PROTOCOL.md` (§4.3 snapshot rule, op frames), `docs/sync.js`, the Shared plan code in `docs/app.js` (roomPush, roomFrame, catchup, read-only, `planElsewhere`), `save()` at `docs/app.js:366`, the `input` handler at `docs/app.js:2268`, `scripts/sync-ui.mjs` and `scripts/sync-fakerelay.mjs`. Depends on: round 1 merged into `dev`.
**Runs serial:** one unit, and every item writes `docs/app.js`.

**Goal:** while connected, every edit reaches the other person within about a second, and both screens end up identical. The relay already orders changes (round 1); this pack teaches the app to send and apply them.

<details><summary>Design: how edits become changes (no relay change needed)</summary>

- **Diff at save, not at every edit site.** Every edit path in `app.js` (the `input` handler and some 70 click actions) ends in `save()`. In a room, `save()` also compares the plan to the last state both sides agree on and sends the differences. Nothing can be missed by a forgotten edit site.
- **Change shapes**, each sealed as an `op`:
  - `set {kind, id, field, value}`: one field of one item (`kind` is route, car, position, label, driver, driverTag, driverGroup or template), or a top-level field such as the date with `kind: "meta"`;
  - `add {kind, item, after}`;
  - `remove {kind, id}`;
  - `order {kind, ids}`.
- **Converging:** each browser keeps *confirmed* (everything the relay has sequenced) and *pending* (its own changes not yet acked). The screen shows confirmed with pending on top. Changes are applied in the relay's order, so once everything is acked both sides hold the same plan.
- **Collisions:** an incoming change to a field this browser has pending, or one changed while offline, is flagged on both screens ("Also changed by the other manager: kept X"). The change that reached the relay last wins. Nothing is lost silently, and the losing value is in the flag.
- **Typing:** changes to a field are batched for about 300 ms. A field you are typing in is never rewritten under your cursor; it is flagged instead.
- **Offline:** the confirmed state is kept beside the plan (`carcoord:roomBase`, never in Backups or Export). On reconnect: catch up, then work out the pending changes from that base to the plan on screen and send them, flagging collisions. This survives a reload and a closed browser.
- **No schema bump:** a round-1 copy of the app already turns read-only when a room holds changes it can't apply (fix c262cb6).
- **Compaction:** after 200 changes, and on Push, a browser that has applied everything sends a snapshot at the seq it has applied.

</details>

**Items** (one commit each, item gate `check.sh` + `sync.mjs` + `sync-ui.mjs`; the full suite once at the end):
- [ ] **Diff and apply:** pure functions in `docs/sync.js`, `diff(prev, next) → ops` and `apply(plan, op) → plan`, covering every list and the meta fields. *Done when:* `sync.mjs` round-trips random edit sequences, and two replicas fed the same ops in relay order end identical.
- [ ] **Send:** `save()` in a room, while caught up and not read-only, batches and seals changes and keeps them pending until acked. *Done when:* a driver typed in one browser appears in the other within a second (fake relay).
- [ ] **Receive:** incoming changes go onto confirmed, pending is replayed on top, and the screen redraws keeping focus. *Done when:* both browsers edit different routes at once and end identical.
- [ ] **Catch up with changes:** catchup and Take apply the snapshot plus its changes, and round 1's "a room with changes is read-only" becomes "apply them" (still read-only for a newer schema). *Done when:* a newcomer's Take gets every edit made since the last snapshot.
- [ ] **Offline and reload:** the base is kept under `carcoord:roomBase`; on reconnect pending is rebuilt, sent and checked for collisions. *Done when:* an edit made with the relay down, then a reload, then reconnecting, reaches the other browser, and a field both changed is flagged.
- [ ] **Collision flags:** a mark on the field and a short list on the Shared plan card, with the kept and lost values and Dismiss. *Done when:* simultaneous edits to one field show the same flag in both browsers.
- [ ] **Replace-everything in a room says so in its existing confirm:** Import, Restore from Backups, Load a share code and Restore a version gain the line "This changes the shared plan for both of you" in the dialog they already show (each still Backups first). *Done when:* sync-ui covers each one, Cancel sends nothing, and no new dialog is added.
- [ ] **Other tabs follow quietly:** a second tab of the same browser in the room becomes one more receiver of the changes, so round 1's blocking "Reload this tab" dialog goes. It stays only as a fallback for a tab that cannot catch up, and even then as the pill, not a dialog. *Done when:* two tabs in one browser edit in turn with no dialog, and both end identical to the other PC.
- [ ] **Compaction:** a snapshot every 200 changes and on Push, never above the applied seq. *Done when:* after 250 changes the relay holds a snapshot and fewer than 200 changes, and a newcomer still gets the full plan.
- [ ] **Announce and cut 0.16.0**, `must: true`. *Done when:* `check.sh` passes, and the note says edits now reach the other person live and that both copies must be updated.

**Decided under "Quiet by default"** (owner, 2026-10-08):
- **Replace-everything** (Import, Restore from Backups, a share code, Restore a version) changes the plan for both of you. The confirm each already has gains the line "This changes the shared plan for both of you"; there is no extra dialog.
- **Collisions:** the last change to reach the server wins. It shows as a small mark on the field plus a line in the Shared plan card holding the losing value, with no popup.

**Test it yourself (round 2), outline:** two windows in the room; type in both at once; stop the relay, edit, restart; edit the same driver in both within a second and read the flag.

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
- 2026-10-08: round 1 took 123 min from the plan commit to handover, 37 commits (`wave-times.sh 2026-10-07T23:00`).
- 2026-10-08: **pack gate on a frozen copy of c702444:**
  - `npm test` exit 0: `VERSIONS OK`, `map checks passed`, `sync checks passed`, `sync-ui checks passed`; smoke `all checks passed` (3 groups skipped for the stored file handle, as before); breadify `all passed`.
  - `npm run screens` exit 0: `no console errors, 4 warnings raised and asserted`.
  - Relay `cargo test`: 48 passed, 0 failed.
  - `npm run upgrade` from `origin/main`: `upgrade check passed: 0.14.1 to 0.15.0`, including "no network call and no WebSocket" for every old profile. One mixed-files check assumed the old build predates weekday templates; it was guarded in the commit after c702444, and the check was rerun.
  - **Smoke in a real browser:** the dev server and the local relay; Create with code `dev` showed "Shared plan: Connected", the invite link and its QR, with no console errors.
- 2026-10-08: **targeted review** (auth + live data, on e389251). The relay's auth, the crypto and the secret's storage were clean. Seven findings were fixed in c262cb6…2d03a86, each with a test that fails against the old code:
  - **Medium:** an older client could erase a newer room's live edits. It now never snapshots above what it has applied, and treats a room holding edits it can't apply as read-only.
  - **Medium-low:** a second tab with a stale plan could push it. While in a room, it now blocks with "Reload this tab".
  - **Low:** Push now rechecks the room after encrypting, before sending.
  - **Low:** the date is escaped in the preview.
  - **Low:** a version's body is bound to its name with a nonce, and the plan's own schema is checked too.
  - **Low:** the relay accepts a snapshot over the disk cap and gives the space back (incremental vacuum).
  - **Low:** a half-failed Create now says so honestly.
  - Gates: `sync-ui` 182 ok, three runs in a row; relay 48/48; clippy clean.
  - Accepted as is: a connection with no `Origin` header, `ws://127.0.0.1:*` in the security policy, the create code throttled by nginx plus a long random code, pings not counted against the rate limit, and the secret in origin-wide localStorage.
  - Ledger: `manifests/archive/2026-10-08-shared-plan-fixes.ledger.md`. The review findings were checked against the code before fixing, and no separate verifier agents ran.
- 2026-10-08: the upgrade check gains "no network call and no WebSocket" for an old profile (f979a81). INVENTORY's Local only and HANDOFF's decision 2 were updated (c9df5c3). Announced and cut as 0.15.0.
- 2026-10-08: **round 1 built.** Both builders worked in this one worktree, as planned. Their unit ledgers are folded in below and kept in `manifests/archive/`.
  - **Separation:** the relay's 8 commits touch only `relay/` and its own ledger. None of the client's 10 commits touches `relay/`.
  - **Pack 1, the relay** (7c7224f…5c58d56): `cargo test` 45/45 (the 35 scaffold tests plus 10 new), five runs in a row; clippy clean; the README steps ran against a local release build. **`nginx -t` was not run:** this user can't reach Docker, so the owner runs the one-liner from the README. Close codes 1001 (too far behind) and 1011 (storage error) were added to the protocol in 41d1851.
  - **Pack 2, the client** (28069e1…e389251): `sync.mjs` 113 ok, `sync-ui.mjs` 131 ok, both against a fake relay built on `routeWebSocket`. The full `npm test` passed on 96ce69d after four smoke fixes.
    - Late fix e389251: Push now waits until the room has said what data version it holds, so an older build can never write to a newer room.
    - Outside its listed paths: `docs/qr.js` brought back from `6c44bb3^` (it had been removed), loaded only when there is an invite QR to draw; `recover.js` hides the room secret; one line each in `smoke.mjs`, `help.js` and `colour-guard.mjs`; a made-up fixture.
    - Decisions: Push also refreshes the room's snapshot; Restore stays local; read-only blocks only writes to the room; opening an invite connects before the answer, to show the preview; the create code is asked for every time and stored nowhere.
  - **Open for the owner:**
    - the Windows app cannot join yet, because its invite link would point at `tauri.localhost` and it has no address bar;
    - whether loading the QR encoder for the invite fits the earlier "QR gone for good";
    - a connection with no `Origin` header is allowed.
- 2026-10-07: scaffold ea8f1f4. Relay: 35 tests compile, and 34 fail on `todo!()`. `sync.mjs`: 12 checks fail on "not implemented", 8 pass. `check.sh` OK. The relay tests have never run against an implementation, so a wrong test goes back through the contract, never edited.
- 2026-10-07: owner said go on round 1 ("begin work on the manifest"). The WebSocket now carries room creation too, so the relay needs no CORS.
- 2026-10-07: owner chose live by default and everything synced. Server facts read from drawingportfolio's `deploy/` (nginx, certbot, axum on :3000).
