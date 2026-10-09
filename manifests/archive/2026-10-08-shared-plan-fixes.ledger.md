# Ledger: shared plan, round 1 review fixes (2026-10-08)

Builder ledger for the targeted auth/live-data review findings on round 1 of
`manifests/2026-10-07-shared-plan.md`. Serial, one commit per fix. The main
session folds this into the manifest.

Baseline at 7cc3481: check.sh OK; sync.mjs passed; sync-ui.mjs passed;
relay cargo test 45/45.

## Fixes

- [x] 1. An older client can erase a newer room's op log (appliedSeq, read-only on ops) — check.sh OK; sync.mjs passed; sync-ui 144 ok / 0 FAIL (8 new checks FAIL on the old app.js)
- [x] 2. A second tab does not follow carcoord:v1 — check.sh OK; sync.mjs passed; sync-ui 154 ok / 0 FAIL (5 new checks FAIL on the old app.js)
- [x] 3. Push race: recheck after the awaited seals — check.sh OK; sync.mjs passed; sync-ui 157 ok / 0 FAIL (2 new checks FAIL on the old app.js)
- [x] 4. Unescaped date in previewHtml; esc audit — check.sh OK; sync.mjs passed; sync-ui 161 ok / 0 FAIL (3 new checks FAIL on the old app.js: the img was inserted; CSP blocked its handler)
- [x] 5. Version body and label bound by name + nonce; plan schemaVersion checked — check.sh OK; sync.mjs passed; sync-ui 173 ok / 0 FAIL (the new binding checks FAIL on the old app.js)
- [x] 6. Relay disk-cap wedge: snapshot allowed over the cap; incremental vacuum — cargo test 48/48 (3 new: limits a_snapshot_is_stored_over_the_disk_cap…, which FAILED before the fix; storage auto_vacuum and reclaim unit tests); `cargo clippy -- -D warnings` clean
- [x] 7. A failed Create after `created` says so honestly — check.sh OK; sync.mjs passed; sync-ui 182 ok / 0 FAIL (4 new checks FAIL on the old app.js)

## Decisions and deviations
- Fix 1: the invite offer also refuses Take for a room holding ops (same "Update the app to join it" as a newer schema): its snapshot alone is not the room's plan. A live `op` frame also sets read-only. Create sends its snapshot at a literal seq 0.
- Fix 2: chose the blocking dialog over reloading in place. Store's readLocal is not exported, and a reload in place would leave the undo history, a moved date (dateMove) and any open dialog pointing at the old plan. While in a room, a `carcoord:v1` storage event whose value differs from this tab's plan sets `planElsewhere`: save() writes nothing, Push/Restore/Take refuse, the pill says "Reload this tab", and a modal (Esc refused, reopened if Chrome force-closes it) offers Reload. Only while in a room, as the finding scoped it; outside a room tabs stay last-writer-wins as before.
- Fix 2 residual (not fixed): a save-file write this tab queued before the other tab's change can still be flushed on pagehide (the Reload). The other tab queues its own, newer write; ordering between the two is not guaranteed. Pre-existing multi-tab save-file behaviour, outside the shared plan.
- Fix 2 test harness: sync-ui's profile() now seeds storage from the first page only (page.addInitScript), so a second tab no longer clears and reseeds localStorage under the first, which the first would rightly take for a change. The socket counter stays context-wide.
- Fix 4 audit: every other string from the room already reaches innerHTML through esc(): version names in the list and in Look first's title, `when(at)`, version ids in data-id, the onlyHere lists (`names.map(esc)`), and notices (renderNotices escapes every line). The card's status texts and the offer's bodies are constants; the QR is drawn from this page's own invite link. The date was the only gap.
- Fix 5: version plaintext is now `{schema, plan, name, nonce}` and the label `{schema, name, nonce}` (nonce: 16 random bytes as hex, fresh per push); PROTOCOL.md §2 and the sync.js header say so. A fetched body is refused ("This version does not match its name, so nothing was changed.") unless its name and nonce equal the label that came with it AND the list entry the person clicked (so a relay cannot swap labels between the catchup and getVersion either). Look first's title now shows the fetched, verified name. A body without name/nonce is refused: round 1 has not shipped, so no older versions exist.
- Fix 5 test changes, required by the shape change, not weakening: the Push section's exact label/version plaintext checks now expect the name and nonce; the newer-room and markup fixtures seal versions through a `versionOf` helper that binds them as the app does.
- Fix 5: `planSchema()` takes the newer of the envelope's `schema` and the plan's own `schemaVersion`; it decides Look first's "newer", Restore's refusal, the offer's Take, and the room's read-only schema from its snapshot.
- Fix 6: migration 2 is `PRAGMA auto_vacuum = INCREMENTAL; VACUUM;`, run outside a transaction (VACUUM refuses one) through a new `Step::Alone`; it is safe to rerun if cut short. After a stored snapshot, `reclaim` steps `PRAGMA incremental_vacuum` until done (one step frees one page, and execute_batch steps once) and then `wal_checkpoint(TRUNCATE)`, since in WAL mode the freed pages stay in `-wal`, which the cap counts. A failure there is logged and the snapshot still acked. Runs after every stored snapshot, not only one that dropped ops (a replaced snapshot body frees pages too); costs one checkpoint per push.
- Fix 6 gate note: `cargo clippy --all-targets -- -D warnings` fails on a pre-existing `type_complexity` in relay/tests/rooms.rs:143 (untouched here); lib and bin are clean with `-D warnings`, and none of the touched files warn. `cargo fmt --check` differs across the crate (pre-existing; the crate is not kept rustfmt-default).
- Fix 7: a create connection reaching `connected` means the relay made the room (it welcomes a create only after `created`; sync.js does not pass `created` on), so any refusal or drop after that, a seal that throws, or a send that fails, says: "The shared plan was made on the server, but your plan did not reach it, so this browser is not using it. It may be on the server without its plan. Ask the server's owner to remove it, or try again. Your plan is unchanged." Nothing is remembered, as before. The fake relay gained `dropNext(type, code)` for the test.
- Fix 7 also: the existing path where the relay stored the plan but this browser would not keep the link now adds "The plan stays on the server unused: ask the server's owner to remove it, or try again."

## Final gates (after fix 7)

- `bash scripts/check.sh`: CHECK OK — every shipped script parses and the versions agree.
- `node scripts/sync.mjs`: sync checks passed.
- `node scripts/sync-ui.mjs`, three runs in a row: 182 ok / 0 FAIL each (144 after fix 1).
- `cargo test --manifest-path relay/Cargo.toml`, three runs in a row: 48 passed / 0 failed each (45 at baseline + 3 new).
- `cargo clippy --manifest-path relay/Cargo.toml -- -D warnings`: clean. (`--all-targets` fails only on the pre-existing tests/rooms.rs:143 type_complexity.)
- Full `npm test` not run here, as dispatched: the main session runs it.
