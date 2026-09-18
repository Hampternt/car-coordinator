# Pack: Day-plan left rail, driver roster with day groups, position/round split

**Status:** 🚧 in flight
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

## Items

- [ ] **1. Schema: `round`, `drivers`, `driverGroups`.** Bump `schemaVersion`; extend `normalise()` so existing `carcoord:v1` data loads clean with `round: ''`, `drivers: []`, `driverGroups: []`.
      *Done when:* existing localStorage loads with no repair notice and the new fields default.
- [ ] **2. Split the day-plan column.** Header `Packing round` → `Position` | `Round`. Position select unchanged; Round is a free-text field committing on blur like `driver`.
      *Done when:* both fields edit and persist per route.
- [ ] **3. ⚠️ Clash rule absorbs `round`.** Position clashes key on position **and** round; a blank round is its own bucket; `multi` ("many cars") positions stay exempt.
      *Done when:* the same spot in two different rounds no longer warns, and the same spot in the same round still does — on screen and under "Check before posting".
      **Risky — review this item individually.** It changes the app's headline feature.
- [ ] **4. Printed sheet: fold Round in.** Position cell renders `name · round`. Sheet stays four columns; `gapBefore` spacer colspan stays 4.
      *Done when:* A4 print preview shows the round with column widths unchanged.
- [ ] **5. Left rail: cars panel.** Compact list — reg + status colour chip + route number when assigned (reuse the `assign` string at `app.js:194`). Removes the Free/Parked pools below the table.
      *Done when:* every car shows with status in the rail, nothing renders below the table, and the print stylesheet is untouched.
- [ ] **6. Driver roster + rail panel.** Editable list (add / rename / delete / reorder), starts empty. Day-plan driver field backed by a `<datalist>` of the roster.
      *Done when:* roster edits persist and roster names are pickable on the day plan while still typeable.
- [ ] **7. Driver day groups.** Named groups holding a subset of the roster; create, rename, delete, apply. Applying sets the day's available drivers in the rail.
      *Done when:* a group can be built, saved, and applied, and survives a reload. See the assumption above.
- [ ] **8. Share payload carries the new fields.** `round` is per-route, so it rides with **"Just the day plan"**; the driver roster and groups go only in **"Everything"**. The decoder accepts a payload missing any of them rather than hard-failing.
      *Done when:* a code produced by the current build imports cleanly into the new build, and vice versa.
- [ ] **9. Tests + screenshots.** `scripts/smoke.mjs` covers the split column, the new clash rule and the rail; `scripts/screens.mjs` captures the rail.
      *Done when:* `npm test` green with no console errors.

## Gates

- **Item gate:** `node --check` on changed files + the targeted smoke case for the item.
- **Pack gate:** `npm install && npm test && npm run screens`, plus a real browser walkthrough of the Day plan and the print preview.

## Ledger

<details>
<summary>Progress log</summary>

- Go given 2026-09-18. Branch `day-plan-rail-and-round` cut from `main` at 7b8b1fd.
- Pre-item commit 55a1b23: made the web app runnable from a checkout (`npm run dev` served `docs/`), so the pack gate's browser walkthrough has something to run.

</details>
