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
- [ ] 5. 0.15.0 snapshot clobber (no-change op after each snapshot)
- [ ] 2. Edit to a removed item vanishes unmarked (empty graveyard)
- [ ] 6. Reload during a held field loses the other's value unflagged
- [ ] 3. A frozen tab loses a queued edit; later typing dropped
- [ ] 7. Open an existing file / Keep the file in a room
- [ ] 8. Small: roomRelease guard, failed base write, Leave orphan base, oversize snapshot, Push wait loop, pagehide flush

## Decisions and deviations

