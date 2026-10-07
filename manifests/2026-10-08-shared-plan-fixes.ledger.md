# Ledger: shared plan, round 1 review fixes (2026-10-08)

Builder ledger for the targeted auth/live-data review findings on round 1 of
`manifests/2026-10-07-shared-plan.md`. Serial, one commit per fix. The main
session folds this into the manifest.

Baseline at 7cc3481: check.sh OK; sync.mjs passed; sync-ui.mjs passed;
relay cargo test 45/45.

## Fixes

- [x] 1. An older client can erase a newer room's op log (appliedSeq, read-only on ops) — check.sh OK; sync.mjs passed; sync-ui 144 ok / 0 FAIL (8 new checks FAIL on the old app.js)
- [ ] 2. A second tab does not follow carcoord:v1
- [ ] 3. Push race: recheck after the awaited seals
- [ ] 4. Unescaped date in previewHtml; esc audit
- [ ] 5. Version body and label bound by name + nonce; plan schemaVersion checked
- [ ] 6. Relay disk-cap wedge: snapshot allowed over the cap; incremental vacuum
- [ ] 7. A failed Create after `created` says so honestly

## Decisions and deviations
- Fix 1: the invite offer also refuses Take for a room holding ops (same "Update the app to join it" as a newer schema): its snapshot alone is not the room's plan. A live `op` frame also sets read-only. Create sends its snapshot at a literal seq 0.
