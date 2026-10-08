# Ledger: shared plan, round 2 review fixes

Builder ledger for the review fixes to Round 2 (live updates) of
`manifests/2026-10-07-shared-plan.md`. Serial, one builder, in this worktree
on `claude/car-coordinator-encryption-c717c5` from 1a02443. The main session
folds this into the manifest.

Method: for each finding a test that fails on the current code first, then the
fix, test and fix in one commit. Line numbers in the findings refer to 7ff16fc.

Baseline at 1a02443 (2026-10-08): check.sh OK; sync.mjs passed; sync-ui.mjs
passed, 348 ok (2 min 8 s).

## Findings

- [x] 1. Base lags own acked edits (reopen resends stale pending) — reproduced: sync-ui `reopened after the other removed what it added: nothing is sent again` FAILED on 1a02443 (got the `add` of the route resent after B's remove) and `and the route stays removed on both screens` FAILED. Fixed: after a drain that applied anything, roomApply writes the base when the stored v1 is this screen (`storedIsScreen()`), so the base never lags this tab's confirmed edits and is never ahead of the stored plan. check.sh OK; sync.mjs passed; sync-ui 352 ok / 0 FAIL
- [x] 4. Restored-relay start-over misreads as newer — reproduced: sync-ui `a restored room with an op past its snapshot, holding this plan: followed again, not Update the app` FAILED on ad9fad0 (pill Update the app, ahead true) and `and an edit after it goes to the room at its next seq` FAILED. Fixed: the catchup that shows the room behind this browser is not read as the room's plan; the browser drops its replica, base and holds, asks `catchup since: 0`, and stays not caught up (sends and shows nothing, `ahead` untouched) until that reply is read. check.sh OK; sync.mjs passed; sync-ui 355 ok / 0 FAIL
- [x] 5. 0.15.0 snapshot clobber (no-change op after each snapshot) — reproduced in the served-0.15.0 section (`git archive b26529f`): `after this build's push, the room holds an op past its snapshot` FAILED (snap 1, no ops), `0.15.0 in a room this build pushed to: Update the app` FAILED (pill Connected) and `and its push sends nothing, leaving the pushed snapshot` FAILED (2 writes, snapshot replaced). Fixed: `roomMarkSnapshot` queues one batch `{oid, changes: []}` after every snapshot this build sends (Create, Push, compaction); it goes through the replica queue and the acks list in wire order, so a drop resends it. check.sh OK; sync.mjs passed; sync-ui 360 ok / 0 FAIL (the compaction section also checks each snapshot is followed by such an op)
- [x] 2. Edit to a removed item vanishes unmarked (empty graveyard) — reproduced: sync.mjs `a late edit to an item removed before a reload is still flagged, with what it set`, `reset to a snapshot without an item this browser edited: flagged, with its edit and place` and `its own edit coming back still carries the item, to put back` FAILED (got []); sync-ui (remover reloaded, then the other's edit arrives) `the remover, reloaded since, still flags the edit that arrived for the route`, `with what was set, and no route to put back` and `its card says so, offering only Dismiss` FAILED. Fixed in sync.js: a `gone` hit with no graveyard entry flags `removed` with `item: null` and the value set; `reset()` buries (graveyard) every item a queued set targets that the snapshot no longer holds, from this browser's pre-reset shadow, and the next drain returns its flag at once. App: an item-less flag reads "A route that was removed was changed after (its driver: …). It stays removed.", offers Dismiss only, and Put it back ignores it. check.sh OK; sync.mjs passed, 163 ok; sync-ui 366 ok / 0 FAIL
- [x] 6. Reload during a held field loses the other's value unflagged — reproduced: sync-ui `and the other's value is in the same flag on both screens` FAILED on 98f2777 (got [[],[]]); the added case `held with nothing typed since, reloaded: the room's value, and nothing sent over it` FAILED too (got ["Elin Before",1]: the stale box text was sent over the other's later value). Fixed: carcoord:roomBase now carries `holds` ({key, kind, id, field, base, out}) between seq and plan; they are kept as holds start and end (`roomHoldsKeep`, which leaves the stored seq and plan alone), a hold let go with typing stays until its batch is confirmed (`heldOut`), and Leave/forget clears them with the base. On opening, a hold whose box is unchanged since takes the room's value (as leaving it would); any other is rebuilt by the first capture with the hold's base as its `was`, so both screens flag it. check.sh OK; sync.mjs passed; sync-ui 373 ok / 0 FAIL
- [ ] 3. A frozen tab loses a queued edit; later typing dropped
- [ ] 7. Open an existing file / Keep the file in a room
- [ ] 8. Small: roomRelease guard, failed base write, Leave orphan base, oversize snapshot, Push wait loop, pagehide flush

## Decisions and deviations

- 5: Create's seq-0 snapshot leaves the same hole, so it gets the op too (the brief named compaction and Push; "every snapshot" covers Create). A browser that merely joins a room with no op past its snapshot sends none: that would change the round-2 check "neither sent anything just for joining", and the hole there closes with the first edit.
- 5, a round-2 check changed by design: Push's "and the push sent no op of its own" (exactly one op in the room) became "the push sent no change of its own: one op with none, after its snapshot".
