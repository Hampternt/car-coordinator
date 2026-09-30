# Pack: Driver tags, apart from car labels

**Status:** IN PROGRESS. Owner said go 2026-09-30; building on branch `driver-tags` (cut from `dev` at 69d1e47), merged into `dev` by the main session.
**Branch:** `dev`, where the combined update is being tested. It ships with it, as 0.12.0.

Observable: a driver's tag menu and the Drivers tab offer only driver tags (Sick, Holiday, Vacation, Course, Special situation and your own), never Workshop or Out of service. Cars and positions offer only their labels. Every driver keeps the tag they had.

Agents: build 1 (medium; store.js and app.js are shared files) · review 2 lenses (correctness, data safety) + verify (high) on item 1.

## Goal

Drivers get their own tag list. Today drivers, cars and positions share one label list, so a driver is offered Workshop and a car is offered Holiday.

## Decisions (owner, 2026-09-30)

| Question | Answer |
|---|---|
| A driver who carries a shared label today | **Carried over.** It becomes a driver tag with the same name and colour, and stays on the driver. The car label list is untouched, so a label used by both ends up in both lists. |
| Where driver tags are managed | **The Labels tab, in a section of its own:** "Car and position labels" (as now, with Show on printout), then "Driver tags". |
| The ready-made tags | Sick, Holiday, Vacation, Course, Special situation. **Added for everyone** once, on the update, skipping any name already there (case and spaces ignored). Anyone can delete them. New installs start with them. |

## Migration plan (written before any code, per the standing rule)

**The new shape (schema 6):**
- `state.driverTags`: `[{ id, name, color }]`.
- A driver's tag is `tagId`, pointing into `driverTags`.
- `labels` and cars' and positions' `labelId` are unchanged.

**The move-over:**
- It runs in `normalise` whenever the saved plan has no `driverTags` list, which is every plan from schema 5 or earlier.
- It is idempotent: once a v6 plan has the list, it is left alone, so a deleted ready-made tag never comes back.
- For each label that any driver points at (by `labelId`), a driver tag is made with the same name and colour, and those drivers get `tagId` for it. The order follows the Labels tab.
- Then the ready-made five are added, skipping any name already there.
- A driver's old `labelId` is dropped.

| Who | What they see |
|---|---|
| **Live users (0.2.4, schema 4) updating** | Every driver keeps their tag, now a driver tag of the same name and colour. Five ready-made tags appear. Cars, positions and their labels are unchanged. The archive taken before the update holds the old plan byte for byte, so Restore undoes it. |
| **A newer plan opened by an older build** (an Export or save file taken back to an older build) | It shows the existing "saved by a newer version" warning, because of the schema bump. An older build does not know `tagId`, so drivers show no tag there and lose it on that build's next save. This is the same trade-off as every schema bump so far, and the warning says so first. |
| **Two PCs on different versions** | Share codes never carry driver tags (decided in pack 7), so nothing changes between them. |

It is applied, not offered, because it is lossless: every driver keeps exactly the tag name and colour it shows today, and only the list the tag lives in moves. The update note says so (`must: true`).

## Items

- [x] **1. ⚠ Store: schema 6 and the move-over.** `driverTags` and `tagId` in `normalise`, the move-over above, a repair for a `tagId` pointing at nothing, and `readable()` (the save-file comparison) naming driver tags too. Done: a v5 plan with Petter on Holiday and Randi on Course loads as v6 with driver tags Holiday, Course, Sick, Vacation, Special situation; Petter and Randi keep theirs; `labels` is byte-identical; and loading the result again changes nothing.
- [x] **2. New installs.** `defaults()` gets the five ready-made driver tags. Done: a first run's Labels tab lists them under Driver tags.
- [x] **3. Drivers use driver tags everywhere.** The Drivers tab chips, the rail's tag menu (and its Add, which makes a driver tag), the rail dot, and the driver picker's dot and note. Done: a driver's tag menu lists only driver tags, and a car's only labels.
- [x] **4. The Labels tab in two sections.** "Car and position labels" as now, then "Driver tags": name, colour, reorder, delete and add. Deleting a label no longer touches drivers; deleting a driver tag clears it from the drivers who have it, after the usual backup. Done: both sections work, and each delete sweeps only its own kind.
- [ ] **5. Right-click menus.** Driver-tag rows get a menu whose Delete says how many drivers have the tag. A label's Delete stops counting drivers. Done: both menus read right.
- [ ] **6. Words.** The Drivers tab hint and the Labels tab hint say which list is which. Done: no text says drivers share the car labels.
- [ ] **7. The upgrade check learns schema 6.** `upgrade.mjs` expects the move-over as the one named change. Done: `npm run upgrade` from the live build passes.
- [ ] **8. Tests.** Smoke cases for the above, re-pinning the ones that expect drivers on the shared list. Done: the car suite passes.
- [ ] **9. Announce driver tags and cut 0.12.0.** A `must: true` note: what changed, and "Every driver keeps their tag; it now lives in its own Driver tags list. An older copy of the app shows drivers without tags." Done: the version guard passes.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, and `npm run upgrade` from the build live on `main`. Item 1 gets one focused review (data safety), since it changes saved data.

## Ledger

- 2026-09-30: planned, with the owner's three answers. Waiting for the go.
- 2026-09-30: go from the owner; build started on `driver-tags`.
- 2026-09-30: item 1 done. `SCHEMA` 6; move-over in `normalise` when `raw.driverTags` is not a list (fresh `uid()` ids, so the upgrade check compares tags by name); ready-made list lives in store.js as `Store.readyTags()`; colour-guard allowlist for store.js gains the four new tag colours. Scratch harness: dev fixture gives Holiday #1565c0, Course #2e7d32, Sick, Vacation, Special situation, Petter=Holiday, Randi=Course, labels unchanged, reload changes nothing, no repair notices; v5 with a dangling labelId repairs it once; deleted ready-made stays deleted. check.sh: CHECK OK. Awaiting the main session's review.
- 2026-09-30: item 2 done. `defaults()` takes `Store.readyTags()`, behind `ownDriverTags()` (`Store.SCHEMA >= 6`), so a store.js cached from before schema 6 never gets a driverTags list saved under its schema. The Labels tab shows them from item 4. check.sh: CHECK OK.
- 2026-09-30: item 3 done. `tagList(kind)` / `tagField(kind)` / `tagOf(kind, item)` route every driver read and write (Drivers tab chips, `setLabel`, `set-tag`, the tag menu, `add-tag`, the rail dot, the picker) to `driverTags`/`tagId`, or to `labels`/`labelId` under a pre-6 store.js. `add-tag` on a driver makes a driver tag (no onSheet); its note names the Driver tags list. The unused `newDriver` now mints the tab's new drivers. check.sh: CHECK OK.
- 2026-09-30: item 4 done. Labels tab: "Car and position labels" (`#labelList`), then "Driver tags" (`#driverTagList`, kind `driverTag`; name, colour, ↑↓, ✕, `add-driver-tag` with Enter), drawn only under a schema-6 store.js. A delete sweeps only the kinds whose `tagList` is the deleted item's list, after the usual snapshot ("Deleting a driver tag"). The car label hint's "and drivers" is left for item 6. check.sh: CHECK OK.
