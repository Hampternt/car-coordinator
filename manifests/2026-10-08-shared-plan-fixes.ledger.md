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
- [ ] 4. Unescaped date in previewHtml; esc audit
- [ ] 5. Version body and label bound by name + nonce; plan schemaVersion checked
- [ ] 6. Relay disk-cap wedge: snapshot allowed over the cap; incremental vacuum
- [ ] 7. A failed Create after `created` says so honestly

## Decisions and deviations
- Fix 1: the invite offer also refuses Take for a room holding ops (same "Update the app to join it" as a newer schema): its snapshot alone is not the room's plan. A live `op` frame also sets read-only. Create sends its snapshot at a literal seq 0.
- Fix 2: chose the blocking dialog over reloading in place. Store's readLocal is not exported, and a reload in place would leave the undo history, a moved date (dateMove) and any open dialog pointing at the old plan. While in a room, a `carcoord:v1` storage event whose value differs from this tab's plan sets `planElsewhere`: save() writes nothing, Push/Restore/Take refuse, the pill says "Reload this tab", and a modal (Esc refused, reopened if Chrome force-closes it) offers Reload. Only while in a room, as the finding scoped it; outside a room tabs stay last-writer-wins as before.
- Fix 2 residual (not fixed): a save-file write this tab queued before the other tab's change can still be flushed on pagehide (the Reload). The other tab queues its own, newer write; ordering between the two is not guaranteed. Pre-existing multi-tab save-file behaviour, outside the shared plan.
- Fix 2 test harness: sync-ui's profile() now seeds storage from the first page only (page.addInitScript), so a second tab no longer clears and reseeds localStorage under the first, which the first would rightly take for a change. The socket counter stays context-wide.
