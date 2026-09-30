# Pack: Day plan layout

**Status:** 🚧 building, since 2026-09-30, as part 5 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and both owner questions approved (grey means Away in every column; item 8 is in).
**Date:** 2026-09-29
**Branch:** cut when execution starts: `day-plan-layout`, from `dev` after pack 4 has merged into `dev`, and merged back into `dev` through a PR (the container's Branch line).

## Goal

Below the route list, the Day plan reads from top to bottom:

1. **The route table**, unchanged.
2. **Day templates**, directly under the table. How long the Drivers and Cars panels beside it are makes no difference.
3. **The week.** Each day from Monday to Friday gets a column listing that day's crew. **Load** sits at the top of each column: it makes that crew the ones in and sets everyone else to away. A driver who is away shows greyed in their column.
4. **A slot for the parking map** (pack 6). It takes no space until the map fills it.

The row of Mon–Sun buttons in the Drivers panel goes. Nothing it did for Monday to Friday is lost. All, and every crew that has no column, become buttons in the Drivers panel: Saturday's crew, Sunday's crew, a second crew for the same day, and groups like Reserves.

One thing is dropped on purpose. You can no longer save who is in as a *new* Saturday or Sunday crew straight from the plan. That is now done on the Drivers tab: Add a crew for Sat, then tick names.

The Drivers and Cars panels still fit the window beside the longer plan. The saved plan's shape does not change. The pack ends with **Announce Day plan layout and cut 0.7.0**.

## Agent brief

**Baseline.** Every file:line here is from `dev` at 73dd734 (0.2.5, before pack 1). Packs 1–4 move code before this pack starts, so **every line and selector must be checked again at pack start.**
- **Pack 1** adds `APP_VERSION`, the `?v=` tags, the new `start()` order, `Store.pref`, `docs/updates.js`, `scripts/versions.mjs` and `scripts/upgrade.mjs`.
- **Pack 2** removes the QR (index.html:65, style.css:335-340 and :360-362, README.md:29).
- **Pack 3** turns colours into tokens.
- **Pack 4** adds:
  - a plan-date helper and a working-day helper;
  - its own wording for "today";
  - a warning by the date bar;
  - `offerTodaysTemplate` on the plan's date;
  - moving a past fixture date forward on open (smoke:1395).

One agent does the items in order. Every item writes `docs/app.js`.

Read first:
- **This manifest.**
- **The container**, `manifests/2026-09-28-review-round.md`:
  - the Branch line (:5);
  - the packs table (:50-60), whose row 5 is corrected at pack start;
  - "One pack at a time" (:64-67);
  - Rules every pack follows (:84-117);
  - pack 5's section (:197-206) and the owner's Decided line (:205);
  - the unscheduled "Use for today" finding (:265).
- **Pack 1**, `manifests/2026-09-28-update-note.md`:
  - the release-cadence decision (:80);
  - Design D, the startup order (:141-153);
  - Design G, the wording rules (:196-207);
  - Design H, the process rule (:221-230).
- **Pack 4's manifest**, once it exists: its plan-date and working-day helpers, and its wording for "today".
- **`docs/app.js`:**
  - **The day-group helpers.** `WEEKDAYS` and `WEEK` (:25-28). The day-group comment (:30-35). `groupWeekday` (:45), `crewIds` (:58), `crewInForce` (:61-64), `dayCrews` (:68-76, whose `new Map()` is at :69). `today()` (:78-82). `save` (:120), which looks up `Store.save` on every call.
  - **`problems()`** (:295). It never reads `available`, and it returns `use`.
  - **The rail.** `railCars` (:480). `railDrivers` (:523-563), with the chip line at :540-555 and the day row drawn at :554.
  - **The day row.** `dayAsk` (:566-574). `dayQuestion` (:576-607), with the group branch at :585-589. `dayBar` (:609-638).
  - **The plan.** `planScroll` (:644-648). `renderPlan` (:650-737): markup at :697-718, scroll restore at :727-736. `renderTemplates` (:771-797). `driverGroups` (:850-883).
  - **Redraw and focus.** `render` (:1125). The input handler (:1143), whose `weekSig` (:1163) redraws while a group is being renamed. `redrawKeepingCaret` (:1185). `renderKeepingFocus` (:1218-1252).
  - **The click handler** (:1641):
    - `refocus` (:1663); the tab act, which never saves (:1670);
    - `all-in` (:1787-1796), `day-missing` (:1797-1807), `day-ask-close` (:1808-1819), `group-empty` (:1820-1824);
    - `save-day-crew` (:1825-1845), `add-day-group` (:1846-1851), `apply-group` (:1852-1869);
    - the save, render and refocus at the end (:1895-1897).
  - **The rest.** Drag and drop (:1918-1990), the Enter-key map (:2288-2303), `ITEM_ACTS` (:2307), `start()` (:2354-2383).
- **`docs/style.css`:**
  - main (:55);
  - the plan and rail (:131-203);
  - the day row and its question (:204-233);
  - templates (:235-261);
  - the 1180 breakpoint (:295-306);
  - print (:345-350);
  - phone width (:355-363).
- **`docs/store.js`:**
  - `Store.save` writes this browser's copy and queues a save-file write on every call (:575).
  - The newer-version warning (:150-152).
- **`scripts/smoke.mjs`:**
  - console errors fail the run (:42), and the first run is at :49-50;
  - `crew` and `inToday` (:132-133);
  - the newer-version save (:333);
  - the group cases (:156-213);
  - the rail's position checks (:1168-1180);
  - the day-row block (:1334-1606): its fixture at :1342-1353 and `weekFixture` at :1394-1400;
  - the shelf question (:1757-1774);
  - the phone-width loop (:1783-1802).
- **`scripts/screens.mjs`:** the rail counts (:158-163), the route counts (:164, :186) and shot 03 (:178).
- **`src-tauri/tauri.conf.json`:** the exe opens at 1280×850 and can shrink to 900×600 (:15-18).

Reuse:
- The acts: `apply-group` (Load), `save-day-crew` (save who is in as a crew), `group-empty`, and the `{groupId}` question.
- The helpers: `dayCrews`, `crewIds`, `crewInForce`, `groupWeekday`.
- `planScroll` and `data-keep-scroll`, for the week's sideways position.
- The click handler's `refocus`, and `renderKeepingFocus`.
- Existing looks: the grey of `.rail-row.away`, and the dashes of `.rail-groups .btn.quiet`.

Dependency edges:
- **Pack 1 (hard):**
  - `APP_VERSION`;
  - `docs/updates.js` and its rule G header;
  - `versions.mjs` and the `?v=` tags;
  - `scripts/upgrade.mjs`;
  - the Design H process.

  This pack adds no per-browser key and never calls `Store.pref`.
- **Pack 2:** it only moves lines (index.html, style.css, README.md:29).
- **Pack 3:** the week uses its tokens for the greys, the plan-day line, the lit Load and the panel. The grey is the same token as `.rail-row.away`, and the dark palette must cover the new classes.
- **Pack 4 (hard):**
  - its plan-date and working-day helpers, because the mark follows the plan's date;
  - its "today" wording, which new text here avoids;
  - its date-moved notice, which is up on every past-dated fixture;
  - `offerTodaysTemplate` on the plan's date.

  It leaves the day row for this pack to remove.
- **Pack 6:** fills `#planMap` through the contract in Design G. It may build `docs/map.js` against that contract while this pack runs, and mounts it after this pack merges.
- **Pack 7:** its day toggles create and edit crews, and the columns follow without any change here. It may revisit item 7's badges.
- **Pack 8:** its menus leave the week and the chip line alone (context-menus.md:364), and it re-derives every line this pack moves.
- **Pack 9:** re-derives its selectors. It can use `#planTemplates`, `#planWeek` and `#planMap`, and `#tab-plan .plan-table tbody tr` for the first route row.

## Saved data

**None.** No field is added, removed or reinterpreted. `SCHEMA` stays where pack 2 leaves it (5). Nothing new is written at boot, so `carcoord:v1` is still never written there.

- **Load** is the existing `apply-group` (app.js:1852-1869). It writes only each driver's `available` (:1857), exactly as the day row's buttons and the Drivers tab's "Use for today" do now.
- **Saving an empty weekday's crew** goes through the existing `save-day-crew` (:1825-1845). It adds one group, or fills an empty one.
- **A click that changes nothing never saves.** This covers the empty-crew guard (item 8) and the week's Save when there is nothing to save (item 5). Both end with `render(); return;`, never `break`.
  - A `break` there reaches `save()` (:1895), and `Store.save` rewrites this browser's copy and queues the save file (store.js:575).
  - On a save from a newer version, that drops the newer fields before the leader has changed anything, although the warning at store.js:150-152 says this only happens "once you make a change".
  - On a shared save file, it can overwrite another manager's changes (container :258).
- **No backup is added.**
  - Load rewrites who is in across the whole roster. Changes made by hand since the last Load (someone set away, a stand-in brought in) are not kept, and are made again in the rail.
  - That is the state of the day, not the setup. A backup for every Load would push the 12 Backups out within a week.
  - Saving an empty day's crew replaces nothing.
- **Left untouched:**
  - per-browser keys;
  - `share.js`: share codes already carry `available` and groups by name (share.js:77-78, :204-218);
  - the printed sheet.
- **The map slot is read-only** by contract (Design G).
- **Upgrade check** (cheap for this pack): `npm run upgrade -- ⟨previous dev build⟩`.
  - **From the previous `dev` build (0.6.0):**
    - `carcoord:v1` and the Backups are byte-identical on open;
    - an archive holds the old text byte for byte;
    - the note shows 0.7.0 in full.
  - **Again from `main`, before the `dev` → `main` merge:**
    - the same data checks;
    - 0.7.0 is shown in full, or counted under "And N other updates", because the `must` entries of the versions skipped fill the note first;
    - What's new lists it.

## Decisions taken

| Decision | Choice |
|---|---|
| Where templates go | Directly under the route list (owner, 2026-09-28). |
| What sits under the list | In order: the route table, templates, the week, the map slot. The owner put the columns under the list after templates; the container puts the map's slot in this pack. |
| Which days get a column | Monday to Friday only (owner). The days come from pack 4's working-day helper. If pack 4 exposes none, a new `WORK_WEEK = [1, 2, 3, 4, 5]` sits beside `WEEK` (app.js:28). |
| What Load does | Sets who is in, and nothing else. Templates stay separate (owner). |
| The Mon–Sun row | Goes, because the columns do the same job (owner). |
| What grey means | `available === false`: the same Away the rail shows, in every column the driver is in. This is the literal reading of the owner's "greyed in their usual column". It is owner question 1, and the other reading is one condition in `renderWeek`. |
| Where the columns live | A new left column, `.plan-main` (`min-width: 0`), inside `.plan`. It holds the route table, then `#planTemplates`, `#planWeek` and `#planMap`. The rail stays the grid's second child. At 1180px and below the page reads rail, table, templates, week, map. The route rows stay first in `#tab-plan`. |
| Which crew a column shows | The first group named for that day, from `dayCrews().byDay` (app.js:68-76). A driver in no weekday crew, such as Reserves, appears in no column. |
| Name order in a column | Roster order, the order the leader chose (app.js:21-22), not the order names were ticked into the group. Away names are greyed where they stand and never re-sorted, so a Load never reshuffles a column. |
| Saturday, Sunday and other crews | They are buttons in the Drivers panel's chip line: All first, then every crew that has no column (Saturday's and Sunday's first crews, a second crew for a day, groups that are no day), in the Drivers tab's order. An empty one stays quiet and asks, as it does now. |
| Saving a new weekend crew from the plan | **Dropped on purpose.** One critique suggested a quiet Sat/Sun chip that saves who is in; another suggested dropping it. Keeping it would need the `{day}` question that item 6 deletes, and the owner chose Monday to Friday with no Saturday or Sunday planning (pack 4). A weekend crew is now made on the Drivers tab (Add a crew for Sat, then tick names). The goal, Out of scope and the retired smoke case all say so. |
| An empty weekday | A dashed, quiet column reading "No crew yet", with no Load and one button that saves who is in as that day's crew (item 5). |
| The plan-day mark | The column for the weekday of the **plan's date** gets a steel line and words (Design C). It uses pack 4's helper, or a `planWeekday()` beside `today()` built from app.js:1106-1108. A weekend date marks no column. The computer's clock is never used, because pack 4 decided the lit day follows the plan's date. |
| Load and the rail's question | Neither Load nor All closes the rail's group question any more. At 1180px and below the rail sits above the week, so closing a question there moved the columns under the pointer. The `{groupId}` question already goes by itself once the group has names (app.js:585-589). |
| Keyboard focus after Load | Returns to what was pressed: the week, the chip line, or the old row while it exists. Today's comma-list selector (:1863) would find the week's copy first, because the week comes earlier in the page. |
| Load takes no backup | Load writes only who is in. The container's table row 5 ("a Load that includes a template takes the existing backup") contradicts the owner's decision that Load never touches templates. It is corrected to "None" at pack start. |
| A click that changes nothing | Never saves (see Saved data). |
| Narrow screens | One row of five, `repeat(5, minmax(140px, 1fr))`. On a phone the row scrolls sideways in its own box, like the route table, and keeps its place across redraws. Wrapping was rejected: in a wrapped week, saving Wednesday moves Thursday and Friday down, and something else lands under the next tap. |
| Column height | A column is as tall as its crew and never scrolls inside. Load is at the top, so a long crew never hides it. |
| The rail beside a longer plan | An item of its own (3), not a walkthrough check. One critique left it out of scope; another showed that the pack causes it, and that the owner's fixture hits it. Above 1180px the two lists shrink so the rail fits the window. The rail does not scroll as a whole, because the tag menu's close-on-scroll reads the list's edges (app.js:448-451). |
| When the week is drawn | Only when the roster has drivers, as the day row was (app.js:554). A first run looks as it does now, and smoke:49-50 are unaffected. |
| The map slot | A string, returned by `mapSlot(use)` inside `renderPlan`. The map's renderer is pure (Design G). |
| How smoke stands in for the map | Pack 6's `docs/map.js` declares `const ParkingMap`, the way `Store` and `Share` are declared. That makes it a global binding, not a `window` property. So the test patches `ParkingMap.render` when `ParkingMap` exists, and creates `window.ParkingMap` only when it doesn't, then restores it. The contract says the object is not frozen. This was chosen over having `map.js` assign `window.ParkingMap`, so that it matches `store.js` and `share.js`. |
| Stable ids | `#planTemplates`, `#planWeek` and `#planMap`, for pack 9's tour and pack 6's mount. |
| The empty-crew guard | Item 8, taken from the container's unscheduled list (:265), because Load is the same act. It changes the Drivers tab's "Use for today", so it is owner question 2. The rest of the pack stands without it. |
| Note entry | `must: false` by rule G: `data` is the "Nothing … changes" sentence, and neither the sheet nor share codes change. A critique raised `must: true` because a daily control moves. Not taken: rule G does not ask for it, and What's new lists the entry in full. The 25-word fields name where All and the weekend crews went, but not the dropped weekend shortcut. That is stated in the goal, Out of scope and the tests. |

## Design

### A. Pack start (the manager, before item 1)

- Re-derive every file:line and selector in this manifest against `dev`.
- In `INVENTORY.md`, move the Considered entries at :86 (templates under the route list) and :89 (the week on the day plan) up under **Day plan** as 🚧, pointing at this manifest.
- In the container:
  - update the Status line;
  - correct the packs table's row 5 (:56) to "None: Load only sets who is in";
  - if owner question 2 is yes, mark the "Use for today" finding (:265) as pack 5's item 8.
- Write Design G's contract where pack 6 will read it: here, and in the container's pack 6 section.

### B. The stack under the route list (`renderPlan`, app.js:697-718)

```
#tab-plan
  p.empty (no cars)               direct child, unchanged (smoke:49)
  .problems · .bar                (+ pack 4's date warning)
  .plan                           grid minmax(0,1fr) 320px, unchanged
    .plan-main                    NEW left column, min-width: 0
      .plan-table[data-keep-scroll=table]   the route list, unchanged
      section#planTemplates.templates       renderTemplates(), markup unchanged
      section#planWeek.week                 renderWeek(), NEW; only with drivers on the roster
      div#planMap.plan-map                  mapSlot(use), empty until pack 6
    aside.rail                    markup unchanged; sticky at top:78; fits the window above 1180px (item 3)
```

- At 1180px and below (style.css:299-306), the rail's `order: -1` puts it on top, and the rest follow in order.
- Print hides `main` (style.css:348), so none of this reaches the sheet.
- The route rows stay first in `#tab-plan`. That matters because more than 30 checks use `#tab-plan tbody tr`.

### C. The week (`renderWeek`, new, beside `renderTemplates`)

- **Frame:**
  - `<section id="planWeek" class="week">` with the heading **The week**;
  - the hint: "Each weekday's crew, from the day groups on the Drivers tab. Load makes that crew the ones in and sets everyone else to away. Greyed names are away."
- **Columns:** five `.week-col[data-day]`, Monday to Friday, inside `.week-cols[data-keep-scroll="week"]`.
- **Head:** three lines, each on one line with no wrapping, so nothing in the head moves when a Load changes the counts.
  1. **The day name**, e.g. "Wednesday".
  2. **Load**, the full width of the column:
     - it is `apply-group` with `data-kind="driverGroup"` and `data-id`, and no `data-day`;
     - when `crewInForce` (app.js:61-64) is true it is lit in hi-vis, with `aria-pressed="true"`;
     - its title reads "Make Monday's 16 the ones in; everyone else goes to away".
  3. **The count**, e.g. "16 drivers" or "16 drivers · 2 away". It is always drawn, so its height never changes. If it ever runs out of room it ends in an ellipsis, with the full text in its title.
- **Plan-day mark.** The column for the weekday of the plan's date gets:
  - a steel line under the day name;
  - `aria-current="date"`;
  - the title "The plan's date is this day (Thursday 24/09)".

  It stays separate from Load's lit state, as the day row kept them (style.css:210-211).
- **Names:** a `<ul>` of `<li>` in roster order. An away driver's `<li>` gets class `away`, the grey of `.rail-row.away`, and the title "Away".
- **No crew, or an empty crew:** the column is dashed and quiet, reads "No crew yet" (or "Nobody in this crew yet"), and has no Load. Item 5 adds its Save button under that line.
- **Styling:** `.week` has 12px of padding on the panel background, and `.week-cols` has an 8px gap. Only pack 3's tokens are used.

### D. Load, the existing act (`apply-group`, app.js:1852-1869)

It still writes `available` across the roster (:1857), and nothing else.

- **Unchanged:**
  - no notice when it is pressed inside `#tab-plan` (:1862-1865);
  - `delete planScroll.drivers` (:1861), so the rail's list opens at the top, showing the crew just brought in.
- **Changed:**
  - It no longer clears `dayAsk` (:1858), and neither does `all-in` (:1793).
  - Focus goes back to where the press came from: `#planWeek [data-act="apply-group"][data-id=…]`, the chip line, or, until item 6, the old row.
- **Why the columns stay under the pointer:**
  - `problems()` does not read `available`, so a Load changes nothing above the week.
  - The column heads have a fixed layout (C).
  - At stacked widths the rail keeps its height: its lists are capped at 30vh, its question stays up, and lit and unlit chips keep one width (item 6).

### E. Empty weekdays (item 5)

- **The quiet column's button:** `save-day-crew` with `data-day`.
  - It reads "Save the 13 in as Wednesday's crew".
  - When that is everyone on the roster and there is more than one (the condition at app.js:603), it reads "Save all 20 as Wednesday's crew", titled "That is everyone on the roster: set anyone who is off to away first, if the crew is smaller."
  - When nobody is in, a line replaces the button: "Nobody is in to save. Set who is in first, or tick names into a crew on the Drivers tab."
- **The count** is taken at the click (:1829). An empty crew is filled, never duplicated (:1840).
- **Pressed from `#planWeek`**, the button:
  - neither sets nor reads `dayAsk`;
  - raises no notice, because the column filling and lighting up is the answer;
  - moves keyboard focus to that column's new Load.
- **When there is nothing to do** (a crew was made meanwhile, nobody is in, or the day is not a day, :1828), the press redraws and returns without saving, from either entry point. The doubled comment at :1831-1834 says "nothing is saved", which was never true; it is corrected.
- **Until item 6**, the old row's route through the day question stays as it is.

### F. The row goes (item 6)

Removed:
- `dayBar` (:609-638) and its call (:554);
- `day-missing` (:1797-1807);
- `dayQuestion`'s `{day}` and `{day, saved}` variants (:590-606), keeping `{groupId}`;
- `save-day-crew`'s row branch;
- `day-ask-close`'s day branch (:1815-1816);
- CSS: `.day-bar` and every `.day…` rule (style.css:204-213 and :224-228). `.day-badge`, `.day-add` and `.day-ask` stay;
- every `.day-bar` selector (:1795, :1805, :1816, :1837, :1843, :1863).

Comments that will be stale, rewritten against the code they sit on:
- app.js: :30-35, :541-542, :566-574, :576-580, :1787-1790;
- style.css: :220-221 and :224.

**The chip line** (:540-555):
- It is drawn whenever the roster has drivers, which fixes the conditional `<p>` at :555.
- **All** comes first: `all-in`, lit when everyone is in, titled "Put everyone on the roster in".
- Then every crew that has no column, in the Drivers tab's order. Empty ones stay `group-empty`, with the rail's question.
- `.rail-groups .btn.on` loses its bold (style.css:222), so a Load never changes a chip's width.

`dayQuestion` keeps only `{groupId}`. `WEEK` stays, for the Drivers tab's add-a-crew row (:855).

### G. The map's slot, for pack 6 (item 9)

**Markup.** `<div id="planMap" class="plan-map">${mapSlot(use)}</div>` after `#planWeek`, with `.plan-map:empty { display: none }`.

**`mapSlot(use)`:**
- It returns `''` unless `typeof ParkingMap !== 'undefined' && typeof ParkingMap.render === 'function'`.
- Otherwise it returns `try { return String(ParkingMap.render(state, use) ?? '') } catch (e) { console.warn(e); return '' }`.
- `use` is `problems().use` (app.js:296): how each car and spot is used, by round.

**Why a string, drawn inside `renderPlan`.** `renderPlan` replaces `#tab-plan` on every `render()`, so anything mounted after a render is wiped by the next click. A string renderer survives, like every other renderer.

**The contract pack 6 builds against:**
- **Where it lives.** `docs/map.js` declares `const ParkingMap = (() => …)()`, like `Store` (store.js:5) and `Share` (share.js:18). It is never frozen, and never named `Map`, which is the builtin `dayCrews` uses (app.js:69).
- **How it loads.** It adds its own `<script src="map.js?v=⟨APP_VERSION⟩">` before `app.js`, which `versions.mjs` checks. The CSP only allows scripts from the same site (index.html:14).
- **`ParkingMap.render(state, use)` is pure:**
  - it returns a string;
  - it never calls `Store`, `localStorage` or IndexedDB;
  - it never changes `state` or `use`.
- **Why purity matters:**
  - Render runs on every redraw, including the ones inside `Store.init` before `start()` has the saved plan, and before pack 1's archive step (update-note Design D, steps 1-2). Any write there breaks "the archive is the first write at boot".
  - A change to `state` would be saved with the next real change.
  - A change to `use` would show in the rail, which reads it afterwards (app.js:714).
- **What its markup may contain:**
  - It escapes its own text and obeys K.
  - It has no `data-act` element and no `data-kind`/`data-field` control, unless pack 6's own manifest plans them and gives them their own data review. The input handler writes any such control into the plan (app.js:1143-1172), and the click handler acts on any `data-act` (:1641 on).
  - If it scrolls, it uses `data-keep-scroll="map"`.
- **Timing:** pack 6 may build against this in parallel, the container's one allowed overlap. Pack 6 keeps item 9's cases green, and adds the same no-write check against its real module.

### H. Widths, and the rail beside a longer plan (items 3 and 4)

**The week (item 4).**
- `.week-cols` is one grid row: `repeat(5, minmax(140px, 1fr))`, with an 8px gap and `overflow-x: auto`.
- `data-keep-scroll="week"` lets `renderPlan`'s restore (:727-736) keep its sideways place.

Column widths below are computed from style.css, not measured:
- `main` has 20px of padding (16px at 760px and below) and a maximum width of 1680px.
- The rail is 320px, plus a 16px gap.
- The week has 12px of padding and 8px gaps.

| Window | Layout | Each column | With a 17px scrollbar |
|---|---|---|---|
| 1680 | side by side | ~250 | ~246 |
| 1280×850 (the exe's default) | side by side | ~170 | ~166 |
| 1181 | side by side | ~150 | ~146 |
| 1180 | stacked | ~217 | ~213 |
| 1100 | stacked | ~201 | ~197 |
| 900×600 (the exe's minimum) | stacked | ~161 | ~157 |
| 390 | stacked | 140, scrolling in a 358px box | a phone's scrollbar floats over the page |

At 1181 with a classic Windows scrollbar there are about 6px to spare. The walkthrough checks it once in a real browser.

The phone-width loop (smoke:1795-1802) checks the document's width. At 760px and below `.tab` scrolls on its own (style.css:360), so that check cannot see a wide week, and item 4 adds a check on the box itself.

**The rail (item 3).**

The problem:
- Today `.plan` is as tall as the taller of the table and the rail.
- On the dev fixture, with 20 drivers and 17 cars, the rail is the taller: two lists at 46vh, plus the panels around them, come to about 1,070px at 1280×850. So it never actually sticks.
- Once the shelf and the week sit in the left column, that column is the taller (about 1,300px). The rail then sticks with its bottom below the window, and the lower part of the Cars list, where cars are dragged from, can be reached only at the very end of the page.

The fix, above 1180px only:
- `.rail` becomes a flex column with `max-height: calc(100vh - 90px)`: the sticky 78px plus a 12px margin.
- The panels become flex columns with `min-height: 0`.
- `.rail-list` gets `flex: 0 1 auto` and `min-height: 5em` (about three rows), and keeps its 46vh cap.
- The lists shrink so the rail fits the window. The rail does not scroll as a whole.
- At 1180px and below nothing changes: the rail stacks, and its lists stay at 30vh.

### I. The Drivers tab (item 7, `driverGroups`, app.js:850-883)

- **Badges:**
  - a Monday–Friday first crew: "Mon column", titled "This group is the Monday column under the route list";
  - a Saturday or Sunday first crew: "Sat · own button", titled "Saturday has no column; this group has its own button in the Drivers panel beside the day plan";
  - a second crew for a day: "Monday twice", titled "Another group is Monday already, so this one has its own button in the Drivers panel beside the day plan".
- **Hint (:875):** "Name one after a weekday and it becomes that day's column under the route list; Saturday and Sunday crews get a button in the Drivers panel." The sentence about "Use for today" keeps whatever wording pack 4 gives it.
- **Add a crew for:** `add-day-group` keeps all seven days, because pack 7 plans seven toggles.

### J. Wording

- Plain English for a warehouse team leader; the UI is in English.
- New text never says "today". Pack 4 owns that word, as in the "In today" titles and "Use for today".
- "Drivers" is both a tab and the panel heading, so every sentence says which one it means: "the Drivers tab", "the Drivers panel beside the day plan".
- Every new string is in C, E, F, I or item 8, and nowhere else.

### K. What the week and the map must not contain

| Must not contain | Why |
|---|---|
| `table`, `tbody`, `tr` or `[data-route]` | Smoke and screens count routes as `#tab-plan tbody tr` (screens.mjs:164, :186), and drag and drop looks for `tr[data-route]` (app.js:1938, :1958). |
| `data-drag` or `data-drop` | A drop runs the roster reorder (:1956-1990). |
| A control with `data-kind` and `data-field` | The input handler writes it into the plan (:1143-1172), and `redrawKeepingCaret` looks it up across the whole page (:1189). |
| `.rail-row`, `.rail-name`, `.rail-list`, or anything inside `[data-panel="drivers"]` | Smoke and screens count the rail's rows there (smoke:133, screens.mjs:158-160). |
| `data-act="tag"` | `tagAnchor` (:393-394). |
| A `save-template`, `add-driver` or `add-car` act | The Enter key presses the first one it finds in the tab (:2302). |
| A direct-child `.empty` of `#tab-plan` | smoke:49. |
| **From item 6 on:** a second copy of any act, kind and id already in `#tab-plan` | See below. |

Before item 6, two overlaps exist. Both are safe only because of the order of the page and scoped selectors:
- **Load and the old day button** share act, kind and id; the row's button adds `data-day`. `renderKeepingFocus` (:1218-1252) builds attribute selectors, so the Load's selector matches both. It lands on the Load because `.plan-main` comes before the rail in the page.
- **The week's Save and the old question's Save** share act and `data-day`. Every lookup of the question's copy is scoped to `.day-ask` (:1804, smoke:1373).

### L. Tests

<details>
<summary><b>Fixtures, rules, and where each check of the old row goes</b></summary>

**Fixtures:**
- **Week fixture** (new; items 2, 5, 6 and 7):
  - Five drivers, Ana, Bo, Cai, Dee and Efe (`d0`–`d4`), all in.
  - These groups, in this order:
    - `Monday` [d0, d1];
    - `Tuesdays` [d3, d1, d2]: stored out of roster order, and Bo is in Monday too;
    - `Weekend crew` [d3];
    - `Mon` [d4]: a second Monday;
    - `Lørdag gjeng` [d2, d3]: Saturday;
    - `Sunday` []: empty.
- **`weekFixture`** (smoke:1394-1400): 30 drivers and 40 routes, for the rail-top and pointer checks.
- **Dev-sized** (item 3): 20 drivers, 17 cars, 15 routes and a Monday crew of 16, the dev fixture's sizes.
- **Newer-version save** (item 8): `schemaVersion: 99`, as at smoke:333, with drivers and an empty group.
- **Chip-line cases** (item 6): only Monday-to-Friday crews; and drivers with no groups.

**Rules for every new check:**
- **Dates.** Read the plan's date from the page after load, because pack 4 moves a past date on open.
- **"Adds no notice"** means the number of notices is the same before and after, never `=== 0`. Pack 4's date-moved notice is up on every past-dated fixture.
- **"Changes only X"** compares `carcoord:v1` as parsed JSON with `date` left out. Pack 4 saves its date move with the first real change.
- **"Writes nothing"** wraps `Store.save` and `Storage.prototype.setItem` in the page and counts the calls. This works because app.js:120 looks up `Store.save` at each call.

**Where each check of the old row goes** (smoke:1334-1606):

| Old check | Where it goes |
|---|---|
| 1357: the week in order, crewless days quiet | Item 2: five columns, Wednesday to Friday quiet. |
| 1359: today marked | Item 2: the plan's date, not the clock. |
| 1361: other crews keep a button | Item 6: the chip line. |
| 1365-1368: Mon exactly, lit; Tue replaces | Item 2. |
| 1370: All puts everyone in | Item 6, via the chip. |
| 1374-1379: a crewless day saves who is in and lights | Item 5. |
| 1382-1385: badges; the add-a-crew row | Item 7. |
| 1406-1408: an empty crew is quiet and never sends everyone away | Items 2 and 5. |
| 1412: counted at the click; fills rather than duplicates | Item 5. |
| 1418: a day's question leaves other questions up | **Retired:** there is no day question any more, and a Saturday or Sunday crew is now made on the Drivers tab (Add a crew for Sat, then tick names). |
| 1424: no notice, and the row stays under the pointer | Item 2 at 1600; item 4 at 1100 with a rail question open. |
| 1436: the rail list goes to its top | Item 2, on `weekFixture`. |
| 1441: the keyboard goes to the question | Item 5: focus lands on the new Load. |
| 1445: the keyboard stays on the day | Item 2. |
| 1452: the question is in view, clear of the top bar | **Retired:** a column's Save sits where it was pressed, and asks nothing anywhere else. |
| 1479: a rename is badged as it is typed | Item 7 ("Thu column"). |
| 1494: phone, every day on screen | Item 4: the check on the box itself at 390. |
| 1500: phone, the question reads as a sentence | Item 6, with the group question. |
| 1523: an empty group sends nobody away | Kept; its wording drops "under the week". |
| 1534-1536: counted as it stands; nothing piles up | Item 5. |
| 1563: phone, nothing moves under the next tap | Item 4 at 390 across a Load, plus item 6's chip-line check. |
| 1601: an overtaken question turns into the answer | Item 5: a crew added meanwhile shows as a column with Load and no Save. |
| 1606: the empty-crew line goes once names are ticked | Kept (`{groupId}`). |

Kept and re-run as they are:
- the group cases (156-213, including 182);
- the position checks 49, 1168-1180, 1482-1489, 1571 and 1783-1802;
- 1757-1774, reworked in item 1 if centring breaks it.

</details>

## Items

- [x] **1. Templates under the route list.**
  - In `renderPlan` (app.js:697-718), add `.plan-main` (`min-width: 0`) inside `.plan`. It holds `.plan-table`, then `renderTemplates()`, whose section gains `id="planTemplates"`.
  - The rail stays the grid's second child, still sticky. Template markup, acts and keep-scroll keys are unchanged.
  - Correct the stale comment at style.css:235 ("at the foot of the plan").
  - Re-run smoke 49, 1168-1180, 1571 and 1757-1774. If 1763's `scrollIntoViewIfNeeded` now centres the shelf, rewrite it to scroll the shelf to the bottom edge of the window, so the question still starts off screen.

  *Done when:* smoke shows all of these:
  - at 1680, with a roster tall enough to make the rail longer than the table, `#planTemplates` starts within 30px below the route table and is aligned with its left edge;
  - at 1100 the order is rail, table, shelf;
  - every existing template case passes.
- [ ] **2. Week columns with Load.**
  - Add `renderWeek()`, drawn after the shelf when the roster has drivers (Design C).
  - In `apply-group` and `all-in`, stop clearing `dayAsk`, and send focus back to where the press came from (Design D).
  - Add the `.week` CSS on pack 3's tokens, with the fixed three-line head.
  - The plan's day and the working days come from pack 4's helpers, falling back to `planWeekday()` and `WORK_WEEK`. Grey follows owner question 1, defaulting to every column.

  *Done when:* smoke shows all of these:
  - on the week fixture:
    - five columns, Monday to Friday, with Wednesday to Friday quiet and no Load;
    - Tuesday reads Bo, Cai, Dee (roster order, though stored as Dee, Bo, Cai);
    - the marked column is the weekday of `state.date` read from the page, and no column is marked once `state.date` is set to a Saturday in the page;
    - with everyone in, Bo set away in the rail is greyed and counted ("· 1 away") in both Monday and Tuesday;
    - Load on Monday makes exactly Ana and Bo the ones in and lights Monday, and Tuesday's Load then makes exactly Bo, Cai and Dee the ones in;
    - each Load leaves the number of notices unchanged, keeps keyboard focus on itself when pressed from the keyboard, and changes `carcoord:v1` only in the drivers' `available` (Design L's rules);
  - at 1600, with a rail group question open, a Load leaves the next column's Load under the pointer;
  - on `weekFixture`, with the rail's driver list scrolled down first, a Load takes it back to its top.
- [ ] **3. The Drivers and Cars panels fit the window beside the longer plan.**
  - Above 1180px, the rail is capped at the window height under the top bar, and its two lists shrink to fit (Design H).
  - At 1180px and below, nothing changes.

  *Done when:* smoke shows all of these:
  - at 1280×850 and 1600×940, on the dev-sized fixture, with the page scrolled so `#planWeek` is in view, the rail's bottom edge is inside the window;
  - once the Cars list is scrolled to its end, `elementFromPoint` at the centre of its last row finds that row;
  - smoke 1168-1180 (nothing pushed off the edge), 1432-1436 and 1482-1489 pass.
- [ ] **4. The week at narrow widths.**
  - `.week-cols` becomes one grid row: `repeat(5, minmax(140px, 1fr))`, `overflow-x: auto`, `data-keep-scroll="week"` (Design H).
  - Add checks at the widths listed below, including a check on the week box itself at 390 that doesn't rely on smoke 1795-1802.

  *Done when:* smoke shows all of these:
  - at 1280, 1181, 1100 and 900, all five columns sit on one row, each at least 140px wide, and the week box does not scroll sideways;
  - at 1181 and 900, pressing each Load in turn leaves every other column's Load exactly where it was;
  - at 1100, with the rail above and a rail group question open, a Load leaves the next column's Load under the pointer;
  - at 390, the week box's right edge is inside the window, its columns stay at least 140px wide, and it keeps its sideways place across a Load.
- [ ] **5. An empty weekday saves who is in, from its column.**
  - The quiet column gets its `save-day-crew` button or line (Design E).
  - A press with nothing to do redraws and returns without saving.
  - Correct the comment at app.js:1831-1834.
  - The old row's question path is left alone until item 6.

  *Done when:* smoke shows all of these:
  - on the week fixture, Wednesday offers "Save the N in as Wednesday's crew", with N counted at the click (a driver set away in the page without a redraw is left out), then lists that crew and lights its Load;
  - `weekFixture`'s empty Thursday crew is filled, not duplicated, and nobody is sent away;
  - there is no button when nobody is in, and the button reads "Save all N…" with its warning title when everyone is;
  - saving Wednesday and then Thursday leaves the number of notices unchanged;
  - pressed from the keyboard, focus lands on the new Load;
  - `carcoord:v1` changes only in `driverGroups`: one new group or one filled group;
  - a press that finds a crew added meanwhile, or nobody in, makes no write;
  - a crew added to the plan meanwhile shows as a column with Load and no Save.
- [ ] **6. ⚠️ The Mon–Sun row goes, and Monday to Friday lose nothing.**
  - Delete everything Design F lists, and rewrite the stale comments it lists.
  - The chip line becomes All followed by every crew that has no column, drawn whenever the roster has drivers. Lit chips lose their bold.
  - Rewrite the old row block (smoke 1334-1606) check by check, using Design L's mapping. Write each retirement's reason in the test file, including that a new weekend crew is now made on the Drivers tab.

  *Done when:* all of these hold:
  - a search of `docs/` and the tests finds no `dayBar`, `day-missing`, `{day}` question, `.day-bar` CSS or `.day-bar` selector;
  - on the week fixture, the chip line reads `['All', 'Weekend crew', 'Mon', 'Lørdag gjeng', 'Sunday']`;
  - Lørdag gjeng makes exactly Cai and Dee the ones in and is lit;
  - Sunday is quiet, sends nobody away and raises the group question;
  - All puts everyone in;
  - with only Monday-to-Friday crews, and with drivers but no groups, the chip line still shows All;
  - on smoke:1342's fixture, the chip line reads `['All', 'Weekend crew', 'Mon']`;
  - at 390, across two Loads, the chip line keeps its height and every chip its width;
  - the group question reads as a sentence at 390;
  - every check of the old block is re-proved or retired with its reason written in the file.

  **Risky — review individually.** This is where a behaviour could vanish without anyone noticing: All, the weekend crews, the empty-crew guard, keyboard focus, and keeping buttons under the pointer.
- [ ] **7. The Drivers tab talks about columns.**
  - In `driverGroups` (app.js:850-883), reword the badges, their titles and the hint (:875), as Design I says.
  - `add-day-group` keeps all seven days.
  - Update smoke 1382-1385 and 1479.

  *Done when:* smoke shows all of these:
  - the badges "Mon column", "Sat · own button" and "Monday twice", with their new titles;
  - the hint naming the column under the route list;
  - a group renamed to Thursday is badged "Thu column" while it is being typed;
  - the add-a-crew row still offers every day that has no crew.
- [ ] **8. An empty crew never sends everyone away.** *(Owner question 2.)*
  - A guard at the top of `apply-group`: a group with nobody on the roster (`crewIds` size 0) changes nobody, and ends with `render(); return;`, never `break`, so nothing is saved.
  - Pressed from the Drivers tab, it raises an info notice: "⟨name⟩ has nobody in it yet. Tick names into it first; nobody was changed."
  - From the plan, which only a stale button could reach, it redraws without a notice.
  - This is the container's unscheduled finding about "Use for today" (:265, app.js:868). It is a behaviour change on the Drivers tab, and the note entry names it. The rest of the pack stands without it.

  *Done when:* smoke shows all of these:
  - "Use for today" on an empty group leaves every driver's `available` as it was and raises the notice;
  - with spies on `Store.save` and `Storage.prototype.setItem`, that click makes no write;
  - on the newer-version save, `carcoord:v1` is byte-identical after the click;
  - every group case (smoke 156-213) passes.
- [ ] **9. The map's slot.**
  - Add `#planMap` after `#planWeek`, with `.plan-map:empty { display: none }` and `mapSlot` as Design G describes.
  - The contract is written down at pack start (Design A).

  *Done when:* smoke shows all of these:
  - `#planMap` comes after `#planWeek` and takes no space while empty;
  - a stub renderer returning `<p id="stubMap">x</p>` appears in it and survives a redraw from a tab click. The stub patches `ParkingMap.render` if `ParkingMap` exists, otherwise creates `window.ParkingMap`, and restores it afterwards;
  - a stub that throws leaves the plan drawn, with a console warning and no console error;
  - with the stub in place, `JSON.stringify(state)` and every `carcoord:*` key are identical across `render()` and a switch to another tab and back, and `setItem` is never called.
- [ ] **10. Screenshots.**
  - Retake `03-day-plan-with-warnings`, with the shelf and the week under the table and the Monday crew lit.
  - Add a shot of the week at 1280, and one at 390.
  - Keep screens.mjs's rail and route counts (:158-167, :186).

  *Done when:* `npm run screens` writes the new shots with no console errors, and its counts (9 roster rows with 1 away, 15 routes, 4 flagged rows) are unchanged.
- [ ] **11. The README says where things are.**
  - README.md:21-23:
    - the Day plan bullet names the templates and the week's columns with Load under the route list;
    - the Drivers bullet says Monday-to-Friday crews are columns and the other crews are buttons in the Drivers panel.
  - HANDOFF.md does not mention the row.

  *Done when:* README.md describes the shelf, the week, All and the weekend crews where they now are, and no longer implies a row of day buttons.
- [ ] **12. Announce Day plan layout and cut 0.7.0.** One commit, following pack 1's Design H:
  - the 0.7.0 entry at the top of `docs/updates.js`, `must: false` by rule G:

    ```js
    {
      version: '0.7.0',
      must: false,
      title: 'Templates and the week under the route list',
      changed: 'Templates sit straight under the route list, then a column per weekday listing its crew, with Load on top. These replace the Mon–Sun buttons.',
      affects: "Day plan: All and weekend crews are buttons in its Drivers panel. Drivers tab: an empty group's Use for today changes nobody. Printed sheet and share codes unchanged.",
      data: 'Nothing in your saved plan changes.',
    }
    ```

    - Word counts: title 8, changed 24, affects 28, data 6.
    - If owner question 2 is no, `affects` drops its Drivers-tab sentence and reads "Day plan: All and weekend crews are buttons in its Drivers panel. Printed sheet and share codes unchanged."
    - "Use for today" is whatever label pack 4 leaves on screen.
  - The six version places move to 0.7.0: `package.json`, `package-lock.json` (twice), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `APP_VERSION`. The `?v=` tags follow.
  - 0.7.0 assumes pack 4 cut 0.6.0. Otherwise, use the next minor version after `dev`'s.

  *Done when:*
  - `versions.mjs` passes at 0.7.0;
  - `npm run upgrade -- ⟨previous dev build⟩` shows the 0.7.0 entry in full, with `carcoord:v1` and the Backups byte-identical on open;
  - the walkthrough has re-read the entry against what shipped.

## Owner questions

**Answered by the owner, 2026-09-29.**
1. **Grey means Away in every column**, as in the Drivers panel.
2. **Fix "Use for today" on an empty group here** (item 8). Pack 7 drops its duplicate.

1. **Grey in the other columns.** Load sets everyone outside that crew to away. Should the other four columns grey those people too, so grey always means Away as it does in the Drivers panel? Or should only the column for the plan's day show grey? I've planned the first. Either answer is one condition, and the item list doesn't change.
2. **"Use for today" on an empty group.** Today it sends everyone away. This was found while planning pack 8 and hasn't been scheduled. Should this pack fix it (item 8), so it changes nobody and says why? I've planned yes. Dropping it removes one item and one sentence of the note, and nothing else.

## Out of scope

- Saturday and Sunday columns. Weekend crews keep a button in the Drivers panel.
- Saving a new Saturday or Sunday crew from who is in, straight from the plan. That is dropped on purpose: make the crew on the Drivers tab, then tick names.
- Loading a template from a column, or offering one on Load. The owner decided templates stay separate.
- Editing crews from the week, such as clicking a name to set it in or away, or ticking days. Pack 7's day toggles cover this.
- Dragging a name from a column onto a route.
- A backup for each Load.
- The parking map itself (pack 6). This pack only reserves its slot and writes down the contract.
- Pack 4's "today" wording in the rail's titles and on the Drivers tab.
- The container's other unscheduled findings:
  - Restore keyed by index;
  - deleting a label leaving drivers tagged;
  - templates with the same name;
  - the exe's `dragDropEnabled`;
  - the top bar overflowing at 900px;
  - another PC writing the same save file.
- Breadify.

## Gates

- **Item gate:** `scripts/check.sh` (which runs `versions.mjs`). When logic is touched, also run `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`.
- **Pack gate:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`;
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens`;
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm run upgrade -- ⟨previous dev build⟩`.

  Report that these ran on system Chrome. The upgrade check runs again from `main` before `dev` → `main`, with the expectations under Saved data.
- **Review:** item 6 individually, plus one pass for the rest.
- **Browser walkthrough before the PR into `dev`**, on the dev fixture:
  1. **Widths:** 1680, 1280×850, 1181 (once with a classic scrollbar), 1100, 900×600 and 390.
  2. **Crews:** Load Monday, then Tuesday. Check the greys and the counts. Save a crew for Wednesday from its column.
  3. **The plan-day mark:** check it after pack 4's date move, and check that a Saturday date marks nothing.
  4. **The chip line:** All, Lørdag gjeng and Reserves.
  5. **The rail at 1280×850:** it stays in the window while the plan is scrolled, and a car from the bottom of the Cars list can be dragged onto a route.
  6. **The Drivers tab:** its badges, and "Use for today" on an empty group.
  7. **Print preview:** unchanged.
  8. **Keyboard only:** do the whole walkthrough once without the mouse.
  9. **The note:** re-read the 0.7.0 entry against what shipped.
- **At pack close:**
  - `INVENTORY.md`'s two 🚧 entries become ✅. Also update :15 (Left rail: fits the window beside the plan) and :17 (Driver day groups: the week's columns).
  - Update the container's Status line.

## Ledger

- **2026-09-30, start (combined pack, part 5).** Built on `review-round`, base 06b9477 (0.6.0). Design A done: INVENTORY's two Considered lines are one 🚧 pointer under Day plan; the container's row 5 reads "None: Load only sets who is in", its "Use for today" finding is marked as this pack's item 8, and Design G's contract is written into its pack 6 section. **Pack 4 as built:** its helpers are `planWeekday()` and `nextWorkingDay()`, with no working-week list, so this pack adds `WORK_WEEK = [1, 2, 3, 4, 5]`; its template offer is `offerPlanDayTemplate`; the rail's day row already underlines `planWeekday()`. **Batched rule:** `check.sh` per item; smoke cases, screens and the one upgrade check (from v0.2.4) at the end of part 9.
- Item 1 done, f28d86d. `.plan-main` holds `.plan-table` then `renderTemplates()` (`#planTemplates`); the rail stays the grid's second child. The CSS comment now says "straight under the route list". Smoke: a layout context (`layCtx`, 1680 wide, 20 drivers and 17 cars so the rail is the taller) checks the shelf within 30px under the table and left-aligned, and rail, table, shelf in order at 1100; later items add their cases before its "under the route list: done" line. The shelf-question case (the old smoke 1757-1774) is left as it is; if centring breaks it, the end-of-run suite says so. Gate: `check.sh` OK.
