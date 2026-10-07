# Ledger: Shared plan, pack 2 (Join, Push and Pull), unit ledger

Builder's own ledger for pack 2 of `manifests/2026-10-07-shared-plan.md`.
The main session folds it into the manifest at merge. Worktree shared with
pack 1 (relay/); this unit commits only its own paths.

## Items

- [x] **Crypto (`docs/sync.js`):** base64url, relayUrl/roomUrl, newSecret, HKDF deriveKeys, seal/open with AAD `roomId:kind`, inviteLink/readInvite. Gate: check.sh OK; sync.mjs 57 ok, 0 FAIL (2 checks added: open refuses a plaintext without schema, and a body shorter than iv+tag).
- [x] **Connection and status:** `Sync.connect` (hello/create, welcome, backoff 1 s doubling to 30 s with jitter, refused on 4400/4401/4403/4409/4413, an error with no close counts as offline after 1.5 s); app joins the room in `carcoord:pref:room` at start, catches up on every connect, status pill in the bar (only in a room) and a Shared plan card on the Data tab; CSP gains `wss://portfolio.dblo.net ws://127.0.0.1:*`; sync.js loaded before app.js. New `scripts/sync-fakerelay.mjs` (PROTOCOL.md in JS over `routeWebSocket`) and `scripts/sync-ui.mjs`, added to `npm test` after sync.mjs. Gate: check.sh OK; sync.mjs 104 ok, 0 FAIL; sync-ui.mjs 27 ok, 0 FAIL (no room = 0 sockets/requests; relay down = Offline and editing saved; real dead port through the real CSP = Offline; unknown room = Refused, no retry).
- [ ] **Create a room**
- [ ] **Join**
- [ ] **Push a version**
- [ ] **Pull, look first, restore**
- [ ] **Leave the room**

## Decisions and deviations

- The progress "now" file is `<git-dir>/progress-now-pack2.json`, not `progress-now.json`: both builders share one git dir, and pack 1 already writes that name.
- `connect()` gains two optional extras beside the contract's shape: `.closeCode` and `opts.retry {first, max}` (tests shorten the backoff). Nothing in the contract changes.
- Routed WebSockets bypass the page's CSP and never show in `page.on('websocket')` (probed). So sync-ui.mjs counts sockets inside the page (a wrapped constructor), and one case goes to a real dead port with no route, which proves the CSP lets `ws://127.0.0.1:*` through.
- **Outside the listed paths:** `scripts/smoke.mjs`'s Data-tab card list gains 'Shared plan' (one line); the card is new, so the old list could not pass. `docs/help.js` gains `data-shared` (smoke requires an entry per visible ⓘ).
- The status pill makes the bar wrap its tabs below 1400px (only when in a room, via `:has(.sync-pill)`); without a room the bar is unchanged.
