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
- [x] **2. Save as template.** A button at the foot of the Day plan that names and stores the current routes.
      *Done when:* saving produces a template that survives a reload, and a second save with the same name is handled deliberately (replace or refuse — pick one and say which in the ledger).
- [x] **3. ⚠️ Load a template, behind a confirm.** Saved templates render as buttons beside Save. Clicking asks a confirmation that names what is being replaced (e.g. the route count), and calls `Store.snapshot()` **before** overwriting so the Data tab can undo it.
      *Done when:* loading replaces every route field the template carries, a cancel changes nothing at all, and the backup appears in the Data tab's backup list.
      **Risky — review individually.** This is the only destructive action in the app that is one click from the main screen.
- [x] **4. Optional weekday auto-apply, default off.** A per-template weekday setting. When set, opening the app on that weekday raises a notice offering the template with one-click apply. Never applies on its own.
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

- [x] **2. Save as template** — be8b148. `renderTemplates()` draws a shelf at
  the foot of the Day plan: a name box, **Save as template**, and one card per
  template with its route count. `listFor` gained `template`, so the shelf
  reuses the existing machinery rather than growing its own.
  **The same-name decision, as asked for: replace.** Saving "Monday" again
  overwrites the Monday template (matched folded, so `monday` finds `Monday`) —
  the second save is a correction of the first, not a second Monday to pick
  between. It is an overwrite, so `Store.snapshot(state, 'Replacing the Monday
  template')` runs first and a notice says what happened. The template keeps
  the name it was given and the weekday it was given; only its routes change.
  *Beyond the item text, both on existing machinery, flagged rather than
  hidden:* a per-template delete (the generic two-click `del` action — a shelf
  with no way to clear it is a dead end), and deleting a car or position now
  scrubs it from every template, the way it already scrubs the plan. Without
  that, the next reload repairs a template nobody touched and says so.
  *Also:* the first-run assertion in `smoke.mjs` was scoped to `#tab-plan >
  .empty`; the shelf's own "no templates yet" message made the old selector
  match two elements. The bump belongs to the item that caused it.
  Gate: `scripts/check.sh` OK, `CHROMIUM_PATH=... npm test` all checks passed,
  **140 ok / 0 failed**, 11 new cases — the shelf, what the notice says, every
  route field carried with no date and no stored ids, reload, replace-not-add,
  the kept name, the backup the replace left, delete, and a deleted car
  leaving the template with a clean reload after it.

- [x] **3. ⚠️ Load a template, behind a confirm** (risky — still wants the
  individual review the item asks for) — 7236f8a. The shelf's name is a button;
  clicking it only ever **asks**. The question is a warn notice naming both
  counts — "replaces the 1 route there now with the template's 3. A backup is
  taken first, so Backups can undo it." — with a single `Load Monday` button
  inside it. `ask-template` asks, `load-template` writes, and nothing else
  writes: `Store.snapshot(state, 'Loading the Monday template')` runs before the
  overwrite, and dismissing the question leaves the plan and the backup list
  exactly as they were.
  *Why a notice and not a `<dialog>` or the armed two-click button:* the notice
  has room to name the cost in a sentence, which "Sure? Click again" has not;
  `#notices` is already hidden by `@media print` while `dialog` is not (the bug
  the manager flagged, untouched); and item 4's offer needs a notice regardless,
  so both entry points share one question and one load path. At most one offer
  is ever live — asking about Tuesday takes Monday's question away.
  *Detail worth the review's attention:* route ids are minted at load, not
  stored, so loading the same template twice cannot leave two rows sharing an id
  and editing as one. The date is never a template's to bring. A car that went
  to the workshop since the template was saved comes back with the usual amber
  warning rather than a refusal — the decisions table's call, asserted.
  *Also:* item 2's "survives a reload" assertion moved from `b` to the new
  button, markup this item changed.
  Gate: `scripts/check.sh` OK, `CHROMIUM_PATH=... npm test` all checks passed,
  **150 ok / 0 failed**, 10 new cases — the question names the cost, the plan is
  untouched while it stands, dismiss changes nothing (routes *and* backup count),
  every field lands with fresh distinct ids, the table shows it, the date does
  not move, the question is cleared by answering it, the backup is in the Data
  tab, restoring it brings the replaced plan back, and the workshop car warns.

- [x] **4. Weekday offer, default off** — 2c2fd1d. A `<select>` per template on
  the shelf, reading **"Never offer it"** until a day is picked, then "On
  Mondays"; stored as `Date.getDay()`'s `0`–`6`, so `WEEKDAYS[day]` is the only
  place a day is spelled. `offerTodaysTemplate()` runs once in `start()` and its
  entire job is to raise a notice with a `Use Monday` button in it — the same
  `ask-template` the shelf uses, so the offer reaches item 3's question, item
  3's snapshot and item 3's load, not a second path.
  *Reading of the item text, worth a line:* "one-click apply" is built as one
  click **to the question**, not one click to the overwrite, because the same
  done-condition says applying "goes through the same confirm and snapshot as
  item 3" and the pack exists because the user rejected templates that apply
  themselves. Two templates set for one day are allowed: the offer names the
  first and mentions the others rather than stacking questions.
  Gate: `scripts/check.sh` OK, `CHROMIUM_PATH=... npm test` all checks passed,
  **159 ok / 0 failed**, 9 new cases — saved with no day, nothing raised on any
  day, the weekday sticks, another day stays quiet today, today's template
  offers itself, nothing is loaded while it waits, the offer reaches the same
  question, only then does it replace (with `Loading the Monday template` at the
  top of Backups), and turning the day off again stops the offer.

</details>
