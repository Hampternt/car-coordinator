# Ledger: shared plan, round 2 (pack 3, live updates)

Builder ledger for Round 2 of `manifests/2026-10-07-shared-plan.md`. Serial,
one builder, in this worktree on `claude/car-coordinator-encryption-c717c5`.
The main session folds this into the manifest.

Baseline at fd1f914 (2026-10-08): check.sh OK; sync.mjs passed; sync-ui.mjs
passed (about 44 s for the three).

## Items

- [x] 1. Diff and apply — check.sh OK; sync.mjs passed, 156 ok (37 new: 300 seeded random edit sequences round-trip byte for byte; 150 two/three-browser relay simulations (5850 ops) and 150 with dropped connections end identical; collisions found alike on both); sync-ui 182 ok
- [ ] 2. Send
- [ ] 3. Receive
- [ ] 4. Catch up with changes
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
