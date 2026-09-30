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
- [x] **2. The card says what it holds.** An empty template reads "Not saved yet — Update from plan fills it", with no Load. Every card gets **Update from plan**: it asks twice, takes a backup, and keeps the template's name and weekday. Done: an empty card cannot be loaded, and Update fills it.
- [x] **3. Load in parts.** The load question gets four ticks, all on: Routes (the list, order, marks, gaps), Drivers, Cars, Positions and rounds.
  - A sentence under them says exactly what happens, for example "Replaces your 15 routes with Monday's 15, with their drivers, cars and positions", or "Keeps your 15 routes and puts in Monday's drivers, by route name; 2 of your routes are not in Monday and keep theirs".
  - The button says the same in short: "Load Monday: routes, drivers, cars, positions", or "Put in Monday's drivers".
  - A backup is taken first. With nothing ticked, there is no button.
  - Done: each combination does what its sentence says.
- [x] **4. The template menu.** Right-click: Load… opens the same question, and "Replace with the plan as it is now" becomes "Update from plan", matching the card. Done: the menu and the card read the same.
- [x] **5. Words.** The shelf hint, the tour's step 4 if it mentions templates, and the README. Done: nothing says templates start empty only when you save one.
- [x] **6. The upgrade check** expects the five (fewer where names exist) and the flag as the one named change. Done: `npm run upgrade` from the live build passes.
- [x] **7. Tests** for the above. Done: the car suite passes.
- [x] **8. Announce and cut 0.13.0.** `must: true`, because the saved plan gains templates. Done: the version guard passes.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, and `npm run upgrade` from the build live on `main`.
- Item 1 gets one focused review by the main session.

## Ledger

- 2026-09-30: planned with the owner's four answers. Waiting for the go.
- 2026-09-30: go from the owner; build started on `weekday-templates`.
- 2026-09-30: item 1 done. `normalise` adds `tpl-weekday-1`…`-5` (Monday to Friday, `weekday: ''`, no routes) after the plan's own templates when `raw.weekdayTemplates !== true`, skipping a day a template's name reads as (`Store.weekdayOf`, a copy of `groupWeekday` and `DAY_NAMES`, comments on both copies) or whose id is already there; `weekdayTemplates: true` is always set. `defaults()` takes `Store.weekdayTemplates()` behind a `typeof` guard (a cached older store.js). Scratch harness, all ok: dev fixture gives Standard weekday, Saturday, Monday…Friday with no repairs; a Mandag plan gains Tuesday to Friday; Monday crew / tues / Onsdagsgjengen / THURSDAYS count as their days; reload and re-load of the same text give the same plan; a deleted Wednesday stays deleted; with the flag dropped only missing names come back, a renamed default is not duplicated; `weekdayOf` gives groupWeekday's tested answers. check.sh: CHECK OK. Awaiting the main session's review.
- 2026-09-30: item 2 done. An empty card shows its name and "Not saved yet — Update from plan fills it", with no Load and no contents toggle; every card has Update from plan (`resave-template`: confirmTwice, backup "Updating the X template from the plan", id, name and weekday kept). `askTemplate` refuses an empty template with a notice, and `offerPlanDayTemplate` skips empty ones. check.sh: CHECK OK; colour guard OK.
- 2026-09-30: item 3 done. One pure `templateLoad(t, parts, routes)` (match by folded name, a blank name never matches, first of a shared name wins) feeds `templateQuestion` (sentence and button, from live counts at each draw) and the `load-template` case. The ticks (`tpl-part`) live on the notice (`n.parts`, all on), never on `state`; a tick redraws with `renderKeepingFocus` and returns before any save. Nothing ticked, or Routes off with no route matching: no button. Backup before the load. `note()` now returns the notice. check.sh: CHECK OK; colour guard OK. Behaviour is proved in item 7.
- 2026-09-30: item 4 done. The menu reads Load… (the same `ask-template` question), Show contents, then Update from plan (was "Replace with the plan as it is now"; its cost line says what it becomes) and Delete. An empty template's menu has no Load… or Show contents, as its card. check.sh: CHECK OK.
- 2026-09-30: item 5 done. Shelf hint: Monday to Friday are there from the start, empty until Update from plan; loading asks which parts; Save as template for other names. README's Day templates line says the same, and its fixture line counts the five. The tour's step 4 names Day templates only in passing and stays. check.sh: CHECK OK.
- 2026-09-30: item 6 done. `asOpened` adds the empty Monday to Friday (fixed ids) after the plan's own templates unless a plain day name is there, and the mark; (e) checks an old store.js adds none and the shelf shows the plan's own; (f) pins the import giving Standard weekday, Saturday, Monday…Friday and expects the older build to keep the templates and drop the mark. check.sh: CHECK OK; the run is the end gate.
- 2026-09-30: item 7 done. New smoke cases: a first run's shelf (the five, empty, no day); a Mandag plan gains Tuesday to Friday after it, no repair, nothing written; `Store.weekdayOf` agrees with `groupWeekday` on 19 names; an empty card (its words, no Load or contents, asking refuses, never offered); Update from plan (arms, fills, keeps id/name/day, backup); a deleted Wednesday stays deleted; load in parts (four ticks on, each sentence and button word for word, a tick writes nothing, Routes-on/Drivers-off, Drivers only, Positions and rounds only, nothing ticked has no button, the backup, Space keeps focus); the empty template's menu. Re-pinned: v2 loads with the five; `templatePlan` and `layPlan` carry the mark; the ask sentence; the calendar-offer templates have a route; the menu words (Load…, Update from plan) and its cards found by their Update button; the schema block's want5 has the five and the mark; the archive row counts 5 templates. Car suite: all new cases ok, 1 FAIL, "Enter on Tag… opens the tag menu without choosing a tag", which fails the same way on a84fdab (checked in a scratch worktree, since removed): dev's 34ebd39 put "Tag: … ›" between Set away and Tag…, so the test's one ArrowDown now lands on the submenu. check.sh: CHECK OK.
- 2026-09-30: item 8 done. 0.13.0 entry, `must: true`: data says the empty five are added once, skipping a day a template has, own templates unchanged, an older copy keeps them; affects says a deleted weekday template can return after an older copy saves, and to update it. Six places and the ?v= tags at 0.13.0. check.sh: CHECK OK, VERSIONS OK (12 entries, newest 0.13.0, must set where required).
