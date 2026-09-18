# Pack: Day-plan left rail, driver roster with day groups, position/round split

**Status:** 🚧 all items committed, pack gate green — awaiting the browser walkthrough and item 3's review
**Date:** 2026-09-18
**Branch:** `day-plan-rail-and-round`

## Goal

Open the Day plan and the left side carries two small panels — drivers and
cars with status — the driver roster is editable with reusable day groups
(e.g. a Monday group), and the single "Packing round" column is split into
**Position** and **Round**. The printed A4 sheet keeps its four columns, with
the round folded into the position cell.

## Agent brief

Read first, in order:
- `HANDOFF.md` — context, data model, the "printout must match the paper list" constraint (§C).
- This manifest.
- `docs/store.js:45-90` — `normalise()` / `schemaVersion` migration pattern.
- `docs/app.js:15` (`newRoute`), `:77` (clash bucketing), `:119-182` (`renderPlan`), `:343-370` (`renderSheet`).
- `docs/share.js` — name/reg-based matching; the payload must tolerate version skew.

No dependency on other packs. `npm install` has not been run in this checkout —
`npm test` (smoke.mjs) and `npm run screens` both need it.

Parallelism: none. Every item touches `docs/app.js`; this is a shared file set,
so items run in sequence in one worktree.

## Decisions taken

| Decision | Choice |
|---|---|
| Seeded driver names | None. Roster starts empty, same reason the car list does (public repo). |
| Round on the printed sheet | Folded into the position cell (`Spot 1/1 · 2`). Sheet keeps four columns. |
| Round's values | Free text, like `driver`. Cheapest to revise later. |
| Manifest location | Repo root `manifests/`, not `docs/` — `docs/` is the Pages-published folder and `serve.mjs`'s ROOT. |
| Left rail vs pools | The rail **replaces** the Free/Parked pools below the table. |

## ⚠️ Assumptions to confirm

**Driver field (item 6).** `driver` stays a free-text string, with the roster
offered through a `<datalist>` so names are pickable but still typeable. That is
my call, not yours — it avoids a schema migration and any change to name
matching in `share.js`. Say so if you want real driver records instead.

**Groups (item 7).** "Custom groups of drivers … templates for days eg monday template" is read as:
a **group is a named set of drivers** (Monday's crew is these people), and
applying it sets who shows as available in the left rail. It is *not* read as a
template that maps drivers onto specific routes. If you meant the latter, item 7
changes shape and grows.

> **Answered 2026-09-18, and the answer was "both".** The user's day template is
> also meant to remember which driver is usually on which route. That half was
> **deliberately not built here** — it touches the route list, not just the
> roster, and is being scoped as its own pack. Item 7 shipped the narrow
> reading only; see the ledger.

## Items

- [x] **1. Schema: `round`, `drivers`, `driverGroups`.** Bump `schemaVersion`; extend `normalise()` so existing `carcoord:v1` data loads clean with `round: ''`, `drivers: []`, `driverGroups: []`.
      *Done when:* existing localStorage loads with no repair notice and the new fields default.
- [x] **2. Split the day-plan column.** Header `Packing round` → `Position` | `Round`. Position select unchanged; Round is a free-text field committing on blur like `driver`.
      *Done when:* both fields edit and persist per route.
- [x] **3. ⚠️ Clash rule absorbs `round`.** Position clashes key on position **and** round; a blank round is its own bucket; `multi` ("many cars") positions stay exempt.
      *Done when:* the same spot in two different rounds no longer warns, and the same spot in the same round still does — on screen and under "Check before posting".
      **Risky — review this item individually.** It changes the app's headline feature.
- [x] **4. Printed sheet: fold Round in.** Position cell renders `name · round`. Sheet stays four columns; `gapBefore` spacer colspan stays 4.
      *Done when:* A4 print preview shows the round with column widths unchanged.
- [x] **5. Left rail: cars panel.** Compact list — reg + status colour chip + route number when assigned (reuse the `assign` string at `app.js:194`). Removes the Free/Parked pools below the table.
      *Done when:* every car shows with status in the rail, nothing renders below the table, and the print stylesheet is untouched.
- [x] **6. Driver roster + rail panel.** Editable list (add / rename / delete / reorder), starts empty. Day-plan driver field backed by a `<datalist>` of the roster.
      *Done when:* roster edits persist and roster names are pickable on the day plan while still typeable.
- [x] **7. Driver day groups.** Named groups holding a subset of the roster; create, rename, delete, apply. Applying sets the day's available drivers in the rail.
      *Done when:* a group can be built, saved, and applied, and survives a reload. See the assumption above.
- [x] **8. Share payload carries the new fields.** `round` is per-route, so it rides with **"Just the day plan"**; the driver roster and groups go only in **"Everything"**. The decoder accepts a payload missing any of them rather than hard-failing.
      *Done when:* a code produced by the current build imports cleanly into the new build, and vice versa.
- [x] **9. Tests + screenshots.** `scripts/smoke.mjs` covers the split column, the new clash rule and the rail; `scripts/screens.mjs` captures the rail.
      *Done when:* `npm test` green with no console errors.

## Gates

- **Item gate:** `node --check` on changed files + the targeted smoke case for the item.
- **Pack gate:** `npm install && npm test && npm run screens`, plus a real browser walkthrough of the Day plan and the print preview.

## Ledger

<details>
<summary>Progress log</summary>

- Go given 2026-09-18. Branch `day-plan-rail-and-round` cut from `main` at 7b8b1fd.
- Pre-item commit 55a1b23: made the web app runnable from a checkout (`npm run dev` served `docs/`), so the pack gate's browser walkthrough has something to run.

**Environment.** No `CLAUDE.md` at the repo root; conventions taken from
`HANDOFF.md`, the existing code and this manifest. `npm install` ran clean, but
`npx playwright install chromium` cannot reach the download host from this
sandbox (request timeout), so both scripts run with
`CHROMIUM_PATH=/usr/bin/google-chrome`, the fallback they already support.
Baseline before any edit: `CHROMIUM_PATH=... npm test` — all checks passed.
Plain `npm test` with no `CHROMIUM_PATH` fails on the missing browser binary,
which is the environment, not the code.

- [x] **1. Schema** — 94b6de0. `SCHEMA` 1 → 2; `round` on routes, `drivers` and
  `driverGroups` on the state, all built and returned inside `normalise()`
  (which whitelists its output, so an unnamed field would round-trip to
  nothing). Gate: `node --check` on both files, `npm test` all checks passed,
  including two new cases — v1 data loads with no repair notice, and gains
  `round`/`drivers`/`driverGroups` at their defaults.
  *Decision, needed by item 7:* the day's availability is a per-driver
  `available` flag, defaulting to true, rather than an `activeGroupId` on the
  state — hand-toggling one driver in the rail would make a stored group id a
  lie. *Also in this commit:* `smoke.mjs`'s `schemaVersion === 1` assertion
  became `=== 2`; the bump invalidated it, so it belongs here rather than in
  item 9.

- [x] **2. Split the column** — c6dbaba. Header is `Position` | `Round`; the
  round is `field('route', …, 'round')`, so it commits per keystroke exactly as
  `driver` does. "Clear drivers, cars and positions" now clears rounds too, and
  says so.
  *Deviation from the item text, with evidence:* the item asked for a redraw
  when the field is left. Measured in Chromium: the browser blurs on mousedown,
  so a `change`-time `render()` lands between mousedown and mouseup and the
  click that ended the edit is swallowed (debug run: round kept, "Mark" never
  toggled; the same run inside the suite lost the round instead). Instead the
  plan redraws on the keystroke that moves the warnings — compared through a
  cheap `problemSig()` — and the caret is restored. `smoke.mjs` keeps the
  failing case as a regression: type a round, click another row's Mark, both
  must take.
  Gate: `node --check docs/app.js`, `npm test` all checks passed (6 new/round
  cases: split columns, free text, click-still-lands, survives reload, cleared
  by Clear, restored from a backup).

- [x] **3. Clash rule absorbs `round`** (⚠️ risky, still wants the individual
  review the item asks for) — 167630b. `usage()` returns two maps:
  `pos` (in use at all → status warnings, and the rail in item 5) and `spots`
  (keyed `positionId \u0000 roundKey` → double bookings). The status line stays
  on `pos`, so a marked spot used in two rounds is still reported once, not
  twice. The dropdown note reads `spots` against the row's own round.
  Round matching is trimmed and case-folded, like `share.js`'s registration
  matching — a warning silenced by a trailing space is worse than none.
  Gate: `npm test` all checks passed, with 11 new cases covering both
  directions of the rule — two rounds do not warn (banner, rows and dropdown
  note), one round still does (banner, rows and "Check before posting" on the
  sheet), two blanks still clash, blank vs filled does not, `' a '` vs `'A'`
  still clashes, a "many cars" spot never clashes, and typing a round clears
  the warning live without losing the caret. `npm run screens` also green: its
  exact-set assertion catches a duplicated status line, and raised the same 4
  warnings as before.

- [x] **4. Printed sheet folds Round in** — 2989db3. `spotCell()` joins the
  spot and the round with a middot; nothing else on the sheet moved, and the
  print stylesheet was not touched. Gate: `npm test` all checks passed, with
  three new cases — the cell reads `Spot 1/1 · 2`, the sheet still has four
  `<th>`s, and the `gapBefore` spacer still has `colspan=4`.

- [x] **5. Left rail, cars panel** — aa584b2. `#tab-plan` is now
  `.plan` = rail + table; `railCars()` draws reg, status dot and the route it
  is out on, reusing the `.assign` badge from the Cars tab. The Free/Parked
  pools and their now-dead `.pool`/`.tag` CSS are gone. The print stylesheet
  was not touched — the rail sits inside `main`, which `@media print` already
  hides. Rail stacks above the table under 980px.
  Gate: `npm test` all checks passed (5 new: every car listed, the assigned one
  shows its route, free ones read Free, no `.pool` left, and the rail lays out
  zero boxes in print media). `npm run screens` green, and
  `screens/02-day-plan-with-warnings.png` shows the rail beside the table.

**Held for item 8 (from the manager, 2026-09-18).** `share.js` has no reference
to `round` at all, so as of item 2 `Share.apply()` silently wipes the round on
every route of any code that is loaded — including one made on the same PC
minutes earlier. That is data loss, not version skew. Item 8 must: carry
`round` in the **day-plan** payload; keep `v: 1` (`decode()` hard-rejects
anything else, so a bump makes the payload unreadable to builds already in
use); apply a payload with no `round` cleanly, leaving it blank; and keep a
`smoke.mjs` round-trip that sets a round, encodes, applies and asserts it
survived.
*Not this pack, flagged by the manager and queued separately — do not fix
here:* `share-apply` assigns `Share.apply()`'s output straight to `state`
without `Store.normalise` (`app.js`), and `@media print` hides
`.topbar, main, #notices` but not `dialog`, so an open modal prints.

- [x] **6. Driver roster + rail panel** — e85771b. New **Drivers** tab (before
  Cars, matching the day plan's Route/Driver/Car order) with add-several,
  rename, reorder, delete and an In/Away toggle; `railDrivers()` panel above
  the cars panel; `<datalist id="driverNames">` in `index.html` — not in the
  plan's markup, which `renderPlan()` rebuilds wholesale — filled by
  `renderDriverList()`.
  *Two notes for review:* (a) the `available` flag is item 1's, and its UI
  (rail panel, In/Away chip) lands here rather than in item 7, because item 7
  only needs to write it; (b) `roundKey()` from item 3 was renamed `fold()` and
  is now shared with driver-name matching — one normaliser rather than two, and
  `share.js` already folds registrations the same way. `problems()` was left
  alone: nothing here warrants a new warning line.
  Deleting a driver removes them from every group and touches no route — the
  name typed into a route is the plan, not a reference to the roster.
  Gate: `npm test` all checks passed, 12 new cases including reorder, reload,
  case/space-insensitive matching into the rail, "away" hiding someone without
  touching their route, and delete leaving the typed name in place.

- [x] **7. Driver day groups** — 92c051b.
  **Done condition as built:** a named set of drivers can be created, applied
  and survives a reload. *Route↔driver memory ("who is usually on Monday's
  route 3") was deliberately deferred to a follow-up pack — the user's answer
  asked for it, it touches the route list rather than the roster, and building
  it here would have grown the item.* No tag field was added either: planning
  tags are transient ("sick", "coming later") and are a separate pack.
  Groups live under the roster on the
  Drivers tab (name, roster-as-chips membership, "Use for today", reorder,
  delete) and are applied from the rail, which is where the day gets set up.
  Built to the manifest's assumption: a group is a **named set of drivers**,
  and applying it only sets who is in today — it maps nobody onto a route.
  Applying is a write across the whole roster (in-group in, everyone else
  away), not an addition, or "in today" stops meaning anything by Friday; a
  notice says how the day now stands.
  Gate: `npm test` all checks passed, 10 new cases — two groups made, members
  ticked, apply sets the crew, a second apply *replaces* the first crew,
  crew and groups survive a reload, deleting a driver leaves every group and
  reloads with no repair notice, rename and delete. `npm run screens` green.

- [x] **8. Share payload** — 34da441. Fixes the data loss the manager found:
  `round` now rides in the **day-plan** payload as a sixth tuple slot, appended
  after the flags, `v: 1` untouched. Older build reads five slots and ignores
  the sixth; this build reads a five-slot route as one with a blank round. The
  roster (`dr`) and groups (`dg`, members by name) go only with "Everything",
  and every new key is read behind an `if (share.x)` so a payload without them
  applies rather than throwing. The import dialog counts the drivers it found.
  Gate: `npm test` all checks passed, 9 new cases — payload shape asserted
  (`v === 1`, six slots, round last), day code carries no roster, "everything"
  carries roster + group members by name, a hand-built five-slot `CC1U.` code
  from "before rounds" applies with a blank round, the round arrives on PC B in
  the plan *and* on its printed sheet, a day-plan import leaves PC B's roster
  alone, and "everything" merges roster, away flags and group membership.

- [x] **9. Tests + screenshots** — 52683e4. Most of the smoke coverage landed
  with the item it tests (that is the item gate); this item added the
  screenshot walkthrough: it builds a roster, groups it into a Monday crew,
  applies it, and asserts the rail actually holds 8 drivers and 6 cars — an
  empty rail photographs perfectly well. Rounds go in as a case worth reading:
  routes 1 and 5 share a spot in the same round and are flagged, route 8 shares
  it in round 2 and is not, and the exact-set assertion fails if that ever
  starts warning. Shots renumbered for the new Drivers tab.
  *Beyond the item text, flagged:* the README described a "packing round"
  column that is now two and said nothing about the roster, so its feature list
  was corrected in the same commit. `INVENTORY.md` was deliberately left alone
  — flipping 🚧 to ✅ belongs to the merge.

**Pack gate — green, 2026-09-18.** `npm install` clean.
`CHROMIUM_PATH=/usr/bin/google-chrome npm test` → exit 0, **125 checks ok, 0
failed, "all checks passed"**, no console errors on any of the four simulated
PCs. `CHROMIUM_PATH=... npm run screens` → exit 0, "no console errors, 4
warnings raised and asserted", 9 screenshots + the A4 PDF written.
The `CHROMIUM_PATH` is the environment, not the code: `npx playwright install
chromium` cannot reach the download host from this sandbox, and both scripts
already support the fallback. Plain `npm test` fails on the missing browser
binary alone.

**Left for the user:** the real-browser walkthrough of the Day plan and the
print preview, the individual review of item 3 (the clash rule), and flipping
this pack's 🚧 line in `INVENTORY.md` at merge.

</details>
