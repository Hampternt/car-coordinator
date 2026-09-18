# Pack: Offer to split the round out of existing spot names

**Status:** 🚧 in flight — items 1-2 done
**Date:** 2026-09-18
**Branch:** `spot-round-migration`, cut from `main` at `9c427cf`

## Why this exists before the change ships

`9c427cf` took the round out of the seeded position names. That commit is safe
for people who already have data — `defaults()` only runs on a first run
(`store.js:26`), so nobody's names are touched — but it leaves them on the old
model with no way back onto the new one except renaming by hand, and the moment
one of the two managers renames, **share codes break silently**: positions are
matched by name (`share.js:199`), and an unmatched one is blanked on every route
and reported only as "Left blank: …".

So `9c427cf` does not ship until this does. They release together.

## What the migration actually is — and why it is not a rename

`Spot 1/1` and `Spot 1/2` are two separate positions today. Splitting the round
out makes both of them `Spot 1`, so this is a **merge**, not a rename:

| Today | After |
|---|---|
| `Spot 1/1` (a position) | `Spot 1` + every route on it gets round `1` |
| `Spot 1/2` (a position) | the **same** `Spot 1` + those routes get round `2` |

Which means routes have to be re-pointed at the surviving position, and two
positions that merge may disagree about their "many cars" flag, status label or
note. That is the part worth getting right.

## Decisions taken

| Decision | Choice |
|---|---|
| Trigger | Offered, never applied. Raised on load when any position name ends in `/<digits>`. |
| What the offer says | The **explicit list**, line by line: every `old name → new name, round N`, how many routes are affected, what merges into what. The user agrees to a stated list, not a description. |
| A route that already has a round | **Never overwritten.** It keeps what was typed; the offer counts these separately and says they will be left alone. |
| Merge conflicts | If merging positions disagree on "many cars", status or note, the offer names the conflict and the surviving position keeps the values of the **lowest-numbered round** — stated in the offer, not silent. |
| Safety | `Store.snapshot()` before anything is written, so Backups can undo the whole thing in one click. |
| Dismissal | Dismissing leaves everything alone; the offer returns next load. No "never ask again" in this pack. |
| Two managers | The offer says both PCs should do it before swapping share codes again. |
| `schemaVersion` | **No bump.** Only values change, not the shape — a bump would make older builds warn about something that cannot hurt them. |

## Items

- [x] **1. Describe the migration, change nothing.** A pure function over state returning the plan: splits, merges, routes gaining a round, routes keeping one they already have, and conflicts. Returns empty when nothing matches.
      *Done when:* it is unit-tested against a fixture with merges, an already-filled round and a conflicting "many cars" flag, and never mutates its input.
- [x] **2. Offer it on load, spelled out.** When the plan is non-empty, raise a notice listing every line of it plus the two-manager warning, with one button to apply and dismissal that changes nothing.
      *Done when:* the notice names each `old → new, round N` line, the counts are right, and dismissing leaves state byte-identical.
- [ ] **3. ⚠️ Apply it.** `Store.snapshot()` first, then merge positions, re-point routes, fill blank rounds only, and report what was done.
      *Done when:* applying produces exactly the plan that was shown, an already-filled round is untouched, and restoring the backup returns the old names.
      **Risky — review individually.** It rewrites positions and routes together.
- [ ] **4. Tests.** Including the case that motivates the pack: PC A migrates, PC B does not, and a share code between them is shown to break — then both migrate and it works.
      *Done when:* `npm test` and `npm run screens` pass, with the two-PC case asserted both ways.

## Gates

- **Item gate:** `./scripts/check.sh` + the targeted smoke case.
- **Pack gate:** `CHROMIUM_PATH=/usr/bin/google-chrome npm test` and `npm run screens`, plus a browser walkthrough of the offer on data that has the old names.

## Ledger

<details>
<summary>Progress log</summary>

- Plan written 2026-09-18, before any code, per the standing rule that a change
  to saved state gets its migration plan first.
- **Item 1** `d4cce83` — `spotRoundPlan()` in `docs/app.js`, pure, plus its
  fixture tests in `scripts/smoke.mjs`. Gate: `./scripts/check.sh` OK;
  `CHROMIUM_PATH=/usr/bin/google-chrome npm test` — all checks passed
  (9 new checks in the "round inside a spot's name" section).
- **Deviation (item 1):** the plan covers **day templates** as well as routes.
  They hold a `positionId` and a `round` per route exactly as the day plan
  does, so leaving them out would blank the spot on every saved template at
  the next load (`store.js` reports it as "pointed at a position that is
  gone"). Counted separately, and the offer will say so.
- **Item 2** `e49e944` — `offerSpotRoundSplit()` raises the offer from
  `start()`; a notice can now carry a list (`note()` takes `lines`, rendered
  as an escaped `<ul>` inside `.notice .say`). Gate: `./scripts/check.sh` OK;
  `npm test` — all checks passed (10 new checks, including the offer's exact
  lines and "dismissing leaves the saved data byte for byte").
- **Note (item 2):** clicking the weekday template question still clears this
  offer along with it (`dropOffers()`, one live offer at a time). Nothing is
  changed by that and the offer returns on the next load, so it was left as
  the existing rule has it.
- **Decided while planning item 1:** a position already named `Spot 1` sitting
  beside `Spot 1/2` survives the merge and keeps its own name and settings;
  its routes gain no round, because its name never spelled one out.

</details>
