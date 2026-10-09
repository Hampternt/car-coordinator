# Ledger: shared plan, round 3, pack 5 (offline work reviewed before it is sent)

Unit ledger for Round 3, Pack 5 of `manifests/2026-10-07-shared-plan.md`.
Parallel wave: one builder in `.wt/pack5` on `shared-plan-r3-pack5`, cut from
the scaffold commit f28c7ec. The main session folds this into the manifest.

Baseline at f28c7ec (2026-10-09): check.sh OK; sync.mjs passed, 163 ok;
sync-ui.mjs passed, 412 ok (2 min 43 s).

## Items

- [x] 1. Times: every op carries `at` — check.sh OK; sync.mjs passed, 175 ok (12 new); sync-ui passed, 431 ok (19 new): an op's `at` is the sender's clock; an edit made offline at 09:14 (A's clock fixed), reloaded at 10:30 and sent on reconnect goes out with 09:14; a 0.16.0 copy served from git (fce442f) follows a room whose ops carry `at`, applies them, and its own untimed ops are applied here
- [ ] 2. Overlap detection (pure, sync.js)
- [ ] 3. Hold on reconnect (persisted beside the base)
- [ ] 4. The review bar and the pill note
- [ ] 5. Look first
- [ ] 6. Send my changes / Keep them on this PC only
- [ ] 7. Edge cases

## Decisions and deviations

- Item 1, the 0.16.0 consequence: 0.16.0's `opUsable` checks only `schema <= SCHEMA` and `Array.isArray(changes)`, and `Sync.check` looks only at each change, so a top-level `at` is ignored and the op applied as before: no read-only, no mis-apply (tested against fce442f served from git). The other way round, a 0.16.0 peer's ops carry no `at`: `opTime()` reads it as null, and the review must show such a time as unknown. No schema bump.
- Item 1: `at` is the batch's, stamped when it is taken (`capture`). To make it the edit's time and not the reconnect's, `roomFlush` now takes the edits while not sending too (offline, or before the catchup is read) instead of returning first; the batch waits in the queue as before. Times of edits taken while not sending are also kept per edit (`r.times`, by `Sync.changeKey`) beside the base (`times` in carcoord:roomBase), so the first batch after a reload, which rebuilds them, takes their own times (its `at` the latest). Cleared once the queue is empty.
- Item 1: `drain()` now also returns the ops it applied (`{seq, oid, at, own, changes}`), and a flag carries its op's time as `opAt` only when the op had one (an exact-match round-2 check on flags stays as it was). `take()` gained a 4th parameter, the op's time.
- Fake relay: `cut(context)`/`mend(context)` take one browser offline while the others carry on.
