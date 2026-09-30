# Pack: Weekday templates, Update from plan, and loading in parts

**Status:** IN PROGRESS. Owner said go 2026-09-30; building on branch `weekday-templates` (cut from `dev` at a84fdab).
**Branch:** its own, `weekday-templates`, cut from `dev` and merged back into `dev` when green. It ships as 0.13.0.

Observable: the shelf holds Monday to Friday templates. Each card has an **Update from plan** button. Loading one opens a question with ticks (Routes, Drivers, Cars, Positions and rounds, all ticked) and a sentence and a button that say exactly what will happen.

Agents: build 1 (medium; app.js and store.js are shared) · review 1 lens (data safety, item 1) + verify (high).

## Decisions (owner, 2026-09-30)

| Question | Answer |
|---|---|
| What the five hold at first | **Empty until saved.** Named Monday to Friday, no routes. An empty one reads "Not saved yet", and Load is not offered for it, so it can never wipe the plan. |
| Offer on its weekday | **Never.** The five start as "Never offer it", like every template: "dont offer on any day just make the load the list buttons easy to understand what it will doo". The per-card weekday select stays for anyone who wants it. |
| Existing users | **Added once, skipping a day whose name is already used.** A template already called Monday (or Mon, Mandag, Monday crew…, read as the week reads crews) is kept, and no second one is made. |
| Loading with parts unticked | **Match by route name.** With Routes ticked, the route list is replaced. With it unticked, the plan's routes stay and each is filled from the template's route of the same name. An unticked part keeps what the plan has now. |

## Migration plan (before any code)

**The shape:** no new field on a template, and no schema bump. One new plan field, `weekdayTemplates: true`, records that the five were added, so a template its owner deleted is never added again.

**The add-in:**
- It runs in `normalise` when the plan has no `weekdayTemplates`: for Monday to Friday, add an empty template unless a template's name already reads as that day.
- Ids are derived (`tpl-weekday-1` … `-5`), like the driver-tag move-over, so reloads before the first save give the same plan.
- It then sets `weekdayTemplates: true`.

| Who | What they see |
|---|---|
| Live users updating | Their templates are untouched. Up to five empty ones appear after them. The Archives copy holds the plan from before the update. |
| An older build | It keeps every template, the five included, and drops the unknown `weekdayTemplates` flag when it saves. A newer build then re-adds only the days whose names are missing, so a deleted default comes back after a round trip through an older copy. That is accepted, and the note says to update older copies. |
| Share codes | Unaffected: templates never travel in them. |

It is applied, not offered, because it only adds empty, clearly named templates; nothing existing changes.

## Items

- [x] **1. ⚠ Store: the five, added once.** `weekdayTemplates` in `normalise`, derived ids, name matching as the week reads crews, and new installs getting the same five. Done: a plan with a "Mandag" template gains only Tuesday to Friday; loading its output again changes nothing; a deleted Wednesday stays deleted.
- [ ] **2. The card says what it holds.** An empty template reads "Not saved yet — Update from plan fills it", with no Load. Every card gets **Update from plan**: it asks twice, takes a backup, and keeps the template's name and weekday. Done: an empty card cannot be loaded, and Update fills it.
- [ ] **3. Load in parts.** The load question gets four ticks, all on: Routes (the list, order, marks, gaps), Drivers, Cars, Positions and rounds.
  - A sentence under them says exactly what happens, for example "Replaces your 15 routes with Monday's 15, with their drivers, cars and positions", or "Keeps your 15 routes and puts in Monday's drivers, by route name; 2 of your routes are not in Monday and keep theirs".
  - The button says the same in short: "Load Monday: routes, drivers, cars, positions", or "Put in Monday's drivers".
  - A backup is taken first. With nothing ticked, there is no button.
  - Done: each combination does what its sentence says.
- [ ] **4. The template menu.** Right-click: Load… opens the same question, and "Replace with the plan as it is now" becomes "Update from plan", matching the card. Done: the menu and the card read the same.
- [ ] **5. Words.** The shelf hint, the tour's step 4 if it mentions templates, and the README. Done: nothing says templates start empty only when you save one.
- [ ] **6. The upgrade check** expects the five (fewer where names exist) and the flag as the one named change. Done: `npm run upgrade` from the live build passes.
- [ ] **7. Tests** for the above. Done: the car suite passes.
- [ ] **8. Announce and cut 0.13.0.** `must: true`, because the saved plan gains templates. Done: the version guard passes.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, and `npm run upgrade` from the build live on `main`.
- Item 1 gets one focused review by the main session.

## Ledger

- 2026-09-30: planned with the owner's four answers. Waiting for the go.
- 2026-09-30: go from the owner; build started on `weekday-templates`.
- 2026-09-30: item 1 done. `normalise` adds `tpl-weekday-1`…`-5` (Monday to Friday, `weekday: ''`, no routes) after the plan's own templates when `raw.weekdayTemplates !== true`, skipping a day a template's name reads as (`Store.weekdayOf`, a copy of `groupWeekday` and `DAY_NAMES`, comments on both copies) or whose id is already there; `weekdayTemplates: true` is always set. `defaults()` takes `Store.weekdayTemplates()` behind a `typeof` guard (a cached older store.js). Scratch harness, all ok: dev fixture gives Standard weekday, Saturday, Monday…Friday with no repairs; a Mandag plan gains Tuesday to Friday; Monday crew / tues / Onsdagsgjengen / THURSDAYS count as their days; reload and re-load of the same text give the same plan; a deleted Wednesday stays deleted; with the flag dropped only missing names come back, a renamed default is not duplicated; `weekdayOf` gives groupWeekday's tested answers. check.sh: CHECK OK. Awaiting the main session's review.
