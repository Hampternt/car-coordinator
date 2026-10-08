# Ledger: shared plan, round 2 (pack 3, live updates)

Builder ledger for Round 2 of `manifests/2026-10-07-shared-plan.md`. Serial,
one builder, in this worktree on `claude/car-coordinator-encryption-c717c5`.
The main session folds this into the manifest.

Baseline at fd1f914 (2026-10-08): check.sh OK; sync.mjs passed; sync-ui.mjs
passed (about 44 s for the three).

## Items

- [x] 1. Diff and apply — check.sh OK; sync.mjs passed, 156 ok (37 new: 300 seeded random edit sequences round-trip byte for byte; 150 two/three-browser relay simulations (5850 ops) and 150 with dropped connections end identical; collisions found alike on both); sync-ui 182 ok
- [x] 2. Send — one commit with 3 and 4 (see below); check.sh OK; sync.mjs passed; sync-ui 216 ok / 0 FAIL (34 new); a driver typed in one browser is on the other's screen in under a second (fake relay)
- [x] 3. Receive — same commit; both browsers edit different routes at once (writes held at the relay, then let go) and end identical, saved alike
- [x] 4. Catch up with changes — same commit; a newcomer's Take gets every op since the snapshot and follows live; ops of a newer schema or unreadable keep it read-only (offer and live)
- [ ] 5. Offline and reload
- [ ] 6. Remote changes never disturb you
- [ ] 7. Removed while you edit
- [ ] 8. Collision flags
- [ ] 9. Replace-everything in a room says so in its existing confirm
- [ ] 10. Other tabs follow quietly
- [ ] 11. Compaction
- [ ] 12. Announce and cut 0.16.0

## Round-1 checks that change by design (replaced, never dropped)

- "a room holding ops offered: Update the app, and no Take" and "in a room
  holding ops: the bar says Update the app": this build applies ops. Replaced
  by: Take gets every op since the snapshot; a room holding ops is live. The
  read-only rule stays for ops of a newer schema (new checks), and a
  0.15.0 copy served from git still goes read-only in a room with ops.
- "A live op from another browser makes a room read-only": replaced by the
  op being applied; a newer-schema op still makes it read-only.
- Push: "the other browser's plan is untouched by it": a push sends nothing
  new to the other plan, but the edit before it now reaches it live.
- Pull: "Restore sent nothing to the room": Restore now changes the shared
  plan for both (item 9).
- Second tab: the blocking "Reload this tab" modal goes (item 10).

## Decisions and deviations
- Item 1: besides `diff`/`apply`, sync.js carries the whole client engine as pure code, `Sync.replica(seq, plan)` (confirmed, queue of own batches, inbox applied strictly in seq order, a graveyard of removed items), so the convergence rules are tested in node without a browser. app.js only wires it to the connection and the screen.
- Item 1: change shapes are the manifest's four plus `was` (what the sender saw before), which is how collisions are found: applying a change whose `was` differs from what is there overwrote something its sender never saw. Every replica applying the same ops in relay order finds the same collisions, so both screens show the same flag. An op is `{schema, oid, changes}`; `oid` lets a sender recognise its own op in a catchup after a dropped ack.
- Item 1: apply is idempotent (add of an existing id, remove/set of a missing one, order naming gone ids: no-ops); an order keeps items it does not name after the item they followed and never brings a removed one back. A list with a missing or duplicate id travels whole as a meta set. Unknown change shapes throw, so the app can go read-only instead of diverging.
- Items 2-4 landed as one commit: Send alone makes every receiving browser go read-only under round 1's rule (any op = read-only), which breaks the round-1 Push/Pull checks, and Receive needs the catchup to hold ops. The three done-when checks are each in sync-ui's "Round 2: live edits" section.
- Items 2-4, a gap in the manifest: a browser in a room with no record of the room's plan (joined under 0.15.0, or its kept base lost). It follows the room live only when its own plan is the room's (read as this build reads it; a date moved on open counts either way). Otherwise it is "Not live" (pill, and a card line with "Take the shared plan…", which opens the existing offer: preview, Backup first). It sends no ops and no snapshot, applies none, Push sends a version only, Restore stays local. Rejected: treating the room's snapshot as its base and sending its differences (the advisor's suggestion): the round-1 Pull section is exactly that case (a browser with another PC's plan in the room), and it would have written its whole plan over the other manager's, with no collision flagged because the other's plan *was* the snapshot. Flag for the live-data review.
- Push now snapshots the room's confirmed plan at the seq it has applied, never the screen (which holds unconfirmed edits). Following live, it first sends what is on screen and waits up to 3 s for the acks, so the snapshot holds the pushed plan when the connection is good. A browser not following live sends no snapshot.
- Frames are read one at a time in arrival order (a promise chain): the catchup's awaits could otherwise let a later op be read before it.
- A field being typed in that the room changes is held: the box keeps the typed text, its edits stay out of what is sent, and on leaving it the text goes out with `was` = the value before the room's change (so both screens flag the collision); if nothing was typed the box takes the room's value. Edits are gathered for 300 ms before sending.
- Round-1 checks changed by design: Push's "the other browser's plan is untouched by it" became "the edit made before it reached the other browser live, and the push sent no op of its own"; Leave's "a second tab is in the room too" accepts the pill Not live (that profile's plan differs from the room's after the live sections). The ops-room and live-op read-only checks stand unchanged: their ops (`{made:'up'}`) are ones no build can apply.
- Fake relay: `holdWrites()`/`releaseWrites()` hold every frame a welcomed client sends, read later in arrival order (per-connection order kept, §4.5).
