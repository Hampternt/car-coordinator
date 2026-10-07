# Ledger: Shared plan, pack 2 (Join, Push and Pull), unit ledger

Builder's own ledger for pack 2 of `manifests/2026-10-07-shared-plan.md`.
The main session folds it into the manifest at merge. Worktree shared with
pack 1 (relay/); this unit commits only its own paths.

## Items

- [x] **Crypto (`docs/sync.js`):** base64url, relayUrl/roomUrl, newSecret, HKDF deriveKeys, seal/open with AAD `roomId:kind`, inviteLink/readInvite. Gate: check.sh OK; sync.mjs 57 ok, 0 FAIL (2 checks added: open refuses a plaintext without schema, and a body shorter than iv+tag).
- [ ] **Connection and status**
- [ ] **Create a room**
- [ ] **Join**
- [ ] **Push a version**
- [ ] **Pull, look first, restore**
- [ ] **Leave the room**

## Decisions and deviations

- The progress "now" file is `<git-dir>/progress-now-pack2.json`, not `progress-now.json`: both builders share one git dir, and pack 1 already writes that name.
