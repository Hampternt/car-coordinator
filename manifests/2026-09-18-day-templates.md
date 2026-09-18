# Pack: Day templates — save a plan, load it back

**Status:** 🚧 in flight
**Date:** 2026-09-18
**Branch:** `day-templates`, cut from `day-plan-rail-and-round` (which is unmerged)

## Goal

At the foot of the Day plan there is a **Save as template** button and a row of
saved templates. Clicking a template loads it over the current plan, after a
confirmation that names what is being replaced. Auto-applying a template because
of the calendar day is available but **off by default**, and even when on it
offers rather than replaces.

## Agent brief

Read first, in order:
- This manifest, then `manifests/2026-09-18-day-plan-rail-and-round.md` — the pack
  that just landed on the parent branch. Its ledger explains the round field, the
  driver roster, driver groups, and the redraw-on-keystroke pattern.
- `docs/store.js` — `normalise()` **whitelists its output** (store.js:98), so a new
  top-level field must be added there or it is silently dropped on every load.
  `Store.snapshot(state, label)` (store.js:157, exported at :365) is the existing
  backup-before-destruction helper.
- `docs/app.js` — `renderPlan()` for the Day plan, the `<dialog>` pattern used by
  the share dialog, and the armed two-click confirm buttons.

No worktree needed; no other session is writing to this repo. Items are sequential —
every one touches `docs/app.js`.

## Decisions taken

| Decision | Choice |
|---|---|
| What a template captures | Each route's `name`, `driver`, `carId`, `positionId`, `round`, `highlight`, `gapBefore`. **Not** the date. |
| Cars included? | Yes. If the usual car is in the workshop, loading warns — that is the app's existing "warn, don't block" behaviour doing its job, not a bug. |
| Where templates live | In state, so Export/Import carries them between the two managers for free. |
| Share codes | **Out of scope.** The user confirmed templates are private; exchange happens via the Export/Import JSON file. Do not touch `share.js`. |
| Auto-apply by weekday | Off by default. When on, it **offers** the template in a notice with one-click apply — it never replaces silently. |
| Driver groups | Left alone. Templates largely subsume them, but retiring groups is the user's call and is not in this pack. |

## Items

- [x] **1. Schema: `templates` on state.** `templates: [{ id, name, weekday, routes: [...] }]`, `weekday` empty by default. Add it to `normalise()`'s whitelist and repair loop; migrate existing saved data.
      *Done when:* data saved by the parent branch loads with `templates: []` and no repair notice.
- [ ] **2. Save as template.** A button at the foot of the Day plan that names and stores the current routes.
      *Done when:* saving produces a template that survives a reload, and a second save with the same name is handled deliberately (replace or refuse — pick one and say which in the ledger).
- [ ] **3. ⚠️ Load a template, behind a confirm.** Saved templates render as buttons beside Save. Clicking asks a confirmation that names what is being replaced (e.g. the route count), and calls `Store.snapshot()` **before** overwriting so the Data tab can undo it.
      *Done when:* loading replaces every route field the template carries, a cancel changes nothing at all, and the backup appears in the Data tab's backup list.
      **Risky — review individually.** This is the only destructive action in the app that is one click from the main screen.
- [ ] **4. Optional weekday auto-apply, default off.** A per-template weekday setting. When set, opening the app on that weekday raises a notice offering the template with one-click apply. Never applies on its own.
      *Done when:* default state raises no notice on any day; with a weekday set, the notice appears and applying it goes through the same confirm and snapshot as item 3.
- [ ] **5. Tests + screenshots.** `scripts/smoke.mjs` covers save, load, cancel-changes-nothing, the snapshot being taken, and the default-off behaviour. `scripts/screens.mjs` captures the template row.
      *Done when:* `npm test` and `npm run screens` pass with no console errors.

## Gates

- **Item gate:** `node --check` on changed files + the targeted smoke case.
- **Pack gate:** `npm test` and `npm run screens`. Note: the pinned Playwright Chromium cannot be downloaded in this sandbox — both scripts accept `CHROMIUM_PATH`, and `/usr/bin/google-chrome` works. Say so in the report; the suite has not run on the browser CI uses.

## Ledger

<details>
<summary>Progress log</summary>

- Go given 2026-09-18. Branch cut from `day-plan-rail-and-round` at its pack gate.

**Environment.** No `CLAUDE.md` at the repo root; conventions taken from the
code, `HANDOFF.md` and the parent manifest. `scripts/check.sh` (the item gate)
exists in the working tree but is **untracked** — left as found, not this
pack's to commit. Baseline before any edit:
`CHROMIUM_PATH=/usr/bin/google-chrome npm test` → exit 0, "all checks passed".
Plain `npm test` fails on the missing pinned Chromium; that is the sandbox, not
the code, and the suite has therefore not run on the browser CI uses.

**Confirm mechanism, decided before item 2 (affects items 3 and 4).** Loading a
template asks in a **notice**, not a `<dialog>` and not the armed two-click
button. Reasons: the notice can name the cost in a sentence ("replaces the 15
routes on the plan now"), which "Sure? Click again" cannot; `#notices` is
already hidden by `@media print`, so it steers clear of the open-dialog print
bug the manager flagged; and item 4's weekday offer needs a notice anyway, so
both entry points end in one confirm and one load path.

- [x] **1. Schema** — 7db427b. `templates` built and returned inside
  `normalise()`, `templates: []` in `defaults()`. A template's routes carry the
  seven fields the decisions table names and **no id** — a template is a copy to
  mint routes from, so ids are minted at load; that also makes "not the date"
  structural rather than a promise. `weekday` accepts `0`–`6` (`Date.getDay()`)
  and nothing else, so anything unrecognised means "no day".
  *Deviation from the parent pack's habit, deliberate:* **no `schemaVersion`
  bump** (stays 2). The item did not ask for one, v2 data loads with
  `templates: []` and no notice either way, and not bumping leaves the smoke
  suite's `schemaVersion === 2` assertion honest. ⚠️ **What that leaves quiet,
  for review:** a build from before this pack, handed an exported JSON file
  that has templates in it, drops them on the first change without a word — a
  bump to 3 is what would make it warn. Reversible in a later pack.
  Gate: `scripts/check.sh` OK, `CHROMIUM_PATH=... npm test` all checks passed,
  4 new cases — v2 data loads with an empty template list and no repair notice,
  a template keeps its routes but loses a car that is gone, that is said once
  rather than once per route, and a weekday that is not a day is no weekday.

</details>
