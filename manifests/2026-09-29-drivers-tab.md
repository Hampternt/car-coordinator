# Pack: Drivers tab

**Status:** 🚧 building, since 2026-09-30, as part 7 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and both owner questions approved (Monday to Friday; item 2 dropped, since part 5's item 8 fixed it).
**Date:** 2026-09-29
**Branch:** cut when execution starts: `drivers-tab`, from `dev` after pack 6 has merged into `dev`, and merged back into `dev` through a PR (the container's Branch line).

## Goal

On the Drivers tab, each driver's row gets three new things:

- **Usual days, Monday to Friday.** Ticking a day puts the driver in that day's group under Day groups. If that day has no group yet, ticking makes one. The week under the day plan (pack 5) shows the change straight away.
- **A Tag** from the one shared label list, clicked the same way as on the Cars tab. A tag never sets anyone Away.
- **A Note**, kept until you clear it.

Two known bugs are fixed along the way:
- Deleting a label now takes it off drivers too.
- **Use for today** on an empty group now changes nothing. Today it sends everyone away.

The group cards stay under the table. The saved plan keeps its shape, share codes send nothing new, and nothing is written at startup. The pack ends by announcing itself and cutting 0.9.0.

## Agent brief

There is no `CLAUDE.md` at the repo root. Conventions come from `HANDOFF.md`, the code, and the container `manifests/2026-09-28-review-round.md`. One agent does the items in order. Every item except 10 writes `docs/app.js` or the tests.

**Line numbers** are from `dev` at 73dd734, before packs 1–6. Each of those packs rewrites `docs/app.js`, so at the start of this pack find each line again by its code, not by its number.

Read first:
- **This manifest.** Then these parts of the container:
  - its Branch line;
  - **Rules every pack follows** (:84-117);
  - its sections for pack 4 (:177-195), pack 5 (:197-206) and pack 7 (:219-226).
- **Pack 1's manifest** (`manifests/2026-09-28-update-note.md`):
  - Design G, the wording rules (:196-207);
  - Design H, the Announce step (:221-230);
  - item 11's upgrade scenarios (:331-342).
- **Pack 5's manifest, and what pack 5 actually shipped:**
  - the week columns and their Load button;
  - what an empty column shows;
  - how a Sat/Sun group is put in for the day.
- **`docs/app.js`, helpers:**
  - `WEEKDAYS` and `WEEK` (:26-28);
  - `groupWeekday` (:45-56), `crewIds` (:58) and `dayCrews` (:68-77);
  - `field` (:128), `actBtn` (:130) and `labelChips` (:137-142).
- **`docs/app.js`, the Drivers tab:**
  - `renderDrivers` (:828-849):
    - the name box's 200px (:833);
    - the top hint (:840);
    - the add-driver bar (:841), which pack 9's tour targets, so leave it alone;
    - the table header (:846).
  - `driverGroups` (:854-883):
    - Add a crew for (:856, :879-880);
    - the day badges (:862-864);
    - Use for today on the card (:868);
    - the Day groups hint (:875).
  - The Labels hint (:935).
- **`docs/app.js`, how edits are handled:**
  - The input handler (:1159-1176). The field write is at :1166-1171. A driver's note falls through to :1176, which doesn't redraw the tab.
  - `renderKeepingFocus` (:1218), which matches on every `data-*` attribute, `data-day` included.
- **`docs/app.js`, the click handler (:1640-1896):**
  - `toggle` (:1675) and `setLabel` (:1676);
  - label delete (:1709-1713);
  - `group-member` (:1781-1786);
  - `save-day-crew` (:1826-1845) and `add-day-group` (:1846-1851);
  - `apply-group` (:1852-1869);
  - the shared `save(); render();` at the end (:1895-1896).
  - The tab switch (:1666-1670) shows why a click that changes nothing must not save.
- **`docs/app.js`, everything else:**
  - The rail's group buttons (:540-551) and its day row (:622-634), which pack 5 replaces.
  - `ITEM_ACTS` (:2307).
- **`docs/store.js`:**
  - the driver shape (:63-74);
  - the label repair (:113) and the group repair (:118-122);
  - the newer-version warning (:153).
- **`docs/share.js`:**
  - what it sends: `out.c` (:72), `out.dr` (:77) and `out.dg` (:78);
  - what it receives: drivers (:203-208) and groups (:211-219).
- **`docs/style.css`:**
  - focus (:23), `table.grid` (:64), `.btn` (:79);
  - `.chip` and `.chip.on` (:86-87), `.day` (:208);
  - `.day-badge` and `.day-add` (:214-217);
  - the ≤760px rule (:355-363).
- **Tests:**
  - `scripts/smoke.mjs`:
    - the second browser's (pcB) roster check (:655-663);
    - the day buttons and badges (:1378-1387, :1477-1480);
    - the phone-width check (:1785-1803);
    - a fresh context loaded with the fixture (:1993-1995).
  - `scripts/screens.mjs`, the drivers section (:77-93).
  - `scripts/fixtures/dev-data.json`: 20 drivers and 5 labels. Petter is tagged Holiday and Randi is tagged Course. Four drivers have notes. The groups are Monday crew, Tirsdagslaget, Friday, Lørdag gjeng and Reserves.

**At go, before item 1:**
- Re-read `APP_VERSION`. This pack cuts the next minor version: 0.9.0 if packs 2–6 took 0.4.0–0.8.0.
- Check how pack 5's Load sets who is in. If it doesn't go through `apply-group`, item 2 puts the empty-group check into one helper that both of them call.
- Check that `scripts/upgrade.mjs` takes the versions it expects from the build. If it still hard-codes pack 1's 0.3.0 and 0.2.5, item 11 fixes that.
- `INVENTORY.md`:
  - Replace the two 💭 lines at :90-91 with one 🚧 pointer under **Day plan**, next to Driver roster (:16), naming this manifest.
  - Working hours (:92) stays under Considered.
- In the container, point the status line (:3) and pack 7's table row (:58) at this manifest.
- Have the owner's answer on the days (see Owner questions).

Reuse:
- `labelChips` and `setLabel`, unchanged, for the tag.
- `field` and the shared input handler for the note.
- `dayCrews().byDay` to decide which group a day means. The rail and pack 5's columns use the same lookup.
- The group shape `{ id: uid(), name: WEEKDAYS[day], driverIds }`, which `add-day-group` and `save-day-crew` already write.
- `refocus` and `renderKeepingFocus` for keyboard focus.
- The fresh-context pattern at smoke:1993-1995.

Dependency edges:
- **Pack 1** supplies:
  - `APP_VERSION`;
  - `docs/updates.js`, with Design G's wording rules;
  - the Design H Announce step;
  - `scripts/versions.mjs` and `scripts/upgrade.mjs`.

  Pack 7 adds no `Store.pref` key and nothing to `start()`.
- **Pack 2** sets SCHEMA to 5, and pack 7 doesn't bump it. Pack 7 adds no new way to make a label, so pack 2's print tick needs nothing here. Driver tags never print.
- **Pack 3:** `.day-tick` uses pack 3's colour tokens. Label chips keep their inline `--c` through `colour()`.
- **Pack 4:**
  - It may reword "Today" (:846), "In today" / "Away" (:835) and "Use for today" (:868). Pack 7 uses whatever pack 4 shipped.
  - Its date move happens in memory on open and is saved with the first change. Item 4's key check allows for that.
- **Pack 5:** it removes the rail's Mon–Sun row and adds Mon–Fri columns built from the same `byDay` groups. So a tick shows up in those columns.
  - Reuse its Mon–Fri constant if it added one.
  - Item 7's badge and hint wording follows what it shipped.
  - Its Load must go through `apply-group`, or share item 2's check through one helper.
  - It must settle where a Sat/Sun group is put in for the day once the row goes. Such a group sits in `byDay`, and the rail only gives buttons to `others` (:540-551). Item 7's weekend badge follows that decision.
- **Pack 6:** no link in what it does, but it moves lines in `docs/app.js`.
- **Pack 8** builds its Drivers-tab menu on this row (its :53, :223-227, :320-321).
  - The tag shows as chips in the row, so Tag… stays out of that menu (its :191, :371).
  - Item 10 updates its :182 and :378, because deleting a label now clears it from drivers.
- **Pack 9** counts `#tab-drivers .bar` (tour manifest :51). Pack 7 adds no `.bar` and no second table under `#tab-drivers`.

## Saved data

**No migration. Nothing new is saved, and SCHEMA stays at pack 2's 5.**

What the pack writes already exists:
- Drivers have carried `labelId` and `note` since schema v4 (`store.js:63-74`), and v0.2.4 already keeps them.
- A tick edits a group in the existing shape `{ id, name, driverIds }`. `add-day-group` (`app.js:1846-1851`) and `save-day-crew` (:1840-1841) already write that shape.

**The one trap, and how it's avoided:**
- The day buttons must not use `data-field`, and must not use the `toggle` act. Both write straight onto the driver (:1166-1171, :1675).
- That would put a new key on every driver. The key would reach `carcoord:v1`, Export, the save file and Backups, until `normalise` strips it on the next load.
- So the days use a new act, `crew-day`, which writes only `state.driverGroups` (Design B).
- Item 4 proves it by comparing the saved plan before and after:
  - only `driverGroups` differs, apart from pack 4's date;
  - every driver still has exactly `id`, `name`, `available`, `labelId` and `note`.

**A click that changes nothing saves nothing.** Two new guards return before the handler's `save()` (:1895):
- Use for today on an empty group;
- a day button for a day outside Mon–Fri.

A needless rewrite matters when the plan was saved by a newer version. That version's additions are lost on the next save (`store.js:153`). This is why 0.2.5 stopped tab clicks from saving (:1666-1670).

**Deleting a label (item 1):**
- It now clears the label from drivers at once, after the existing "Deleting a label" backup (:1709).
- Today the same clearing happens on the next load, with a repair notice (`store.js:113`).
- The end result is the same, without the notice.

**Share codes (`share.js` unchanged):**
- `dr` sends only `[name, available]` (:77), so drivers' tags and notes are not sent. Car tags and notes still are (:72).
- A receiving browser keeps its own tags and notes on drivers it already has (:205-206).
- A driver it gains arrives as `{ id, name, available }` (:207). The row shows an empty Note and the OK chip lit, because `esc` and `labelChips` read a missing field as empty.
- The ticks are day groups, so Copy everything sends them (:78).
  - Where the code is loaded, they replace groups with the same name (:217).
  - The usual "Loading a shared list" backup is taken first (`app.js:1383`).
  - The receiving dialog already says Everything updates day groups (:1350).

**Nothing at startup.** There is no new per-browser key, no `Store.pref`, and nothing in `start()`. `carcoord:v1` is untouched on open.

**Upgrade check.** It uses pack 1's harness, `npm run upgrade -- ⟨previous dev build⟩`. The profile is seeded with fewer than the 12 Backups the cap allows. All of the following must hold:
- `carcoord:v1` and the Backups are byte-identical on open.
- There is exactly one new update archive with `to === '0.9.0'`, byte-equal to the old build's `carcoord:v1`.
- Every earlier archive is unchanged, apart from pack 1's trim to three update archives.
- The in-memory state equals the old one, apart from pack 4's date move.
- The note shows 0.9.0 in full, with nothing else unseen and no count. What's new lists every entry. After a reload, no note shows.
- The fixture's two tagged drivers and four notes show in the new columns.
- Before any `dev` → `main` merge, the check runs again from the build live on `main` (the container's rule).

## Decisions taken

| Decision | Choice |
|---|---|
| A tag and Away | **Owner, 2026-09-28:** a tag is only a label and never sets Away. Tagging someone Holiday leaves them in today until Away is pressed. |
| Tags per driver | **Owner, 2026-09-28:** one tag per driver, from the one shared list, so any tag fits anyone. The tag and the note stay until removed. |
| The group cards | **Owner, 2026-09-28:** they stay, under the table. They remain the place to edit a weekend group, or a second group for the same day. |
| Share codes | **Owner, 2026-09-28:** drivers' tags and notes are not sent in share codes. Like every setting, they still travel in Export and the save file, as pack 2 said of its print tick. So no note or screen text may say they "stay on this PC". |
| Which days *(recommended; asked below)* | **Monday to Friday.** Why:<ul><li>The owner asked to "tick the weekdays a driver usually works" (INVENTORY.md:90).</li><li>Pack 4 decided there is no weekend planning (container :192).</li><li>Pack 5's columns are Mon–Fri (:201, :205), so a Sat or Sun button would edit a group no column shows.</li><li>Five buttons fit 900px better than seven.</li></ul>The container's approved text says seven (:222), so this is put to the owner rather than decided here. Rejected: showing Sat/Sun only when such a group exists, which is more code for a day nobody plans. |
| What a day button writes | A new act, `crew-day` (`data-kind="driver" data-id data-day`), added to `ITEM_ACTS`. It writes only `state.driverGroups`. It has no `data-field` and doesn't reuse `toggle`, because both write onto the driver. A new act name also keeps smoke:659 working: that line reads the only `[data-act="toggle"]` in Bo's row, and Playwright's strict mode fails on two. |
| Which group a day means | `dayCrews().byDay.get(day)`, looked up at click time. That is the first group named for the day, in any form `groupWeekday` knows (:45-56). So ticking Tue on the fixture edits Tirsdagslaget and doesn't make a new Tuesday group. A second group for the same day is never touched by the buttons. |
| Ticking a day that has no group | It adds `{ id: uid(), name: WEEKDAYS[day], driverIds: [id] }` to the end of the list, as `add-day-group` does. The name is English because the UI is English, and because share codes match groups by exact name. The new group isn't sorted into weekday order. |
| Unticking | Removes every copy of the driver's id. `group-member` removes only the first copy (:1781-1786), and `normalise` doesn't remove duplicates. Ticking adds the id only if it isn't already there. A group is kept when it empties: a tick never deletes a group. |
| Days and who is in today | Independent. A tick never changes `available`. This matches pack 5's decision that only Load sets who is in. |
| Tag control | `labelChips('driver', d)`, unchanged: an OK chip, then every label, through `setLabel` (:1676). It works like the Cars tab, as asked, and the column header says "Tag". It is not a `<select>`. It is not the rail's tag menu made general either, because that menu is tied to `#tab-plan` (e.g. :394, :1692, :1701). |
| Note control | `field('driver', d.id, 'note', d.note, placeholder)`. `liveSig` watches only a route's round and driver (:1159), so a note falls through to :1176 and the tab isn't redrawn while typing. The caret stays put. |
| Column order | Name · Today · In or away · Usual days · Tag · Note · ↑↓✕. No new `.bar`, because pack 9 counts `#tab-drivers .bar`. No second table under `#tab-drivers`. |
| Pulled in: deleting a label clears drivers (item 1) | From the container's "Found while planning pack 8" (:264). The new Tag column would expose this bug: no chip lit, then a repair notice on the next load. The fix is one line at :1713. |
| Pulled in: Use for today on an empty group (item 2) | From the same list (:265). Unticking a day's last driver puts this bug one click away. How the fix works:<ul><li>The guard sits in `apply-group`, or in pack 5's shared helper.</li><li>It tests `crewIds(g).size`.</li><li>It returns without saving.</li></ul>On `dev` only the group card reaches it with an empty group. The rail sends empty groups to `day-missing` and `group-empty` (:545-546, :628-630). |
| Add a crew for | Kept, but offers Mon–Fri only (`WORK_WEEK` instead of `WEEK` at :856), matching the buttons. A weekend group can still be made by typing its name. |
| Keyboard focus | A day button pressed from the keyboard keeps focus through `refocus`. Keeping focus after a tag chip is left out, because it would change the Cars and Positions tabs too. |
| Version and `must` | 0.9.0, the next minor after pack 6's (re-read at go). `must: false`: the data line is the "Nothing … changes" sentence, and neither the printed sheet nor share codes change. |
| Review conflict: splitting the risky item | The review asked for the act first, then the cell. Here the cell comes first (item 3) and the act second (item 4), because smoke can only press the act through the cell's buttons. Until item 4 lands, a click on `crew-day` falls through to the handler's `default: return` and writes nothing. |
| Review conflict: share-code proof | Given its own smoke item (6) and kept in the walkthrough, rather than left to the walkthrough only. |
| Review conflict: the phone check | It now asserts things the new row can break: five buttons on one line, and a note box wider than zero. It isn't labelled regression-only. |
| Review conflict: note length | Rule G allows about 25 words per field, but the review asked for more facts. `changed` is 25 words and `affects` 34. The 0.2.5 entry's `changed` ran 31 (update-note.md:211). "Replaces groups with the same name" is left out: the receiving dialog already says Everything updates day groups (:1350), and a backup is taken first. |

## Design

### A. The row (`renderDrivers`, app.js:828-849)

**Columns:** Name · Today · In or away · **Usual days** · **Tag** · **Note** · ↑↓✕. The header (:846) gains three cells.

**Usual days.** Five buttons, Mon to Fri, kept on one line inside `<span class="day-ticks">` (not `.bar`). `byDay` is computed once per render.
```
<button class="day-tick ${on ? 'on' : ''}" data-act="crew-day" data-kind="driver"
  data-id="${esc(d.id)}" data-day="${day}" aria-pressed="${on}" title="…">${WEEKDAYS[day].slice(0, 3)}</button>
```
- `on` means `crew && crew.driverIds.includes(d.id)`, where `crew = byDay.get(day)`.
- Tooltips, with every name passed through `esc`:
  - in the group: `In ⟨group⟩ — click to take ⟨name⟩ out`
  - not in it: `Click to put ⟨name⟩ in ⟨group⟩`
  - no group yet: `No ⟨Weekday⟩ group yet — click to start one with ⟨name⟩`
- Add `const WORK_WEEK = [1, 2, 3, 4, 5];` next to `WEEK` (:28), or reuse pack 5's constant if it added one.

**Tag.** `labelChips('driver', d)`, unchanged.

**Note.** `field('driver', d.id, 'note', d.note, 'placeholder="Note (e.g. back Monday)"')`.

### B. The act, and its test cases

The new case goes in the click switch, before `add-day-group` (:1846):
```
case 'crew-day': {
  const day = Number(b.dataset.day);
  if (!WORK_WEEK.includes(day)) return;            // a stale button: nothing changed, nothing saved
  const d = list[i];
  const crew = dayCrews().byDay.get(day);
  if (crew && crew.driverIds.includes(d.id)) crew.driverIds = crew.driverIds.filter((x) => x !== d.id);
  else if (crew) crew.driverIds.push(d.id);
  else state.driverGroups.push({ id: uid(), name: WEEKDAYS[day], driverIds: [d.id] });
  if (e.detail === 0) refocus = `#tab-drivers [data-act="crew-day"][data-id="${CSS.escape(id)}"][data-day="${day}"]`;
  break;
}
```
- Add `'crew-day'` to `ITEM_ACTS` (:2307).
- It never touches `available` and never deletes a group.

**Test cases.** Smoke case `usual days write only day groups`. It runs in a fresh context, as smoke:1993-1995 does, never in pcB: a driver received through a share code lacks `labelId` and `note` (share.js:207), so the key check would fail there for reasons unrelated to this pack. The context imports the dev fixture with two additions, so both go through `normalise`:
- one driver's id twice in Monday crew;
- a second group named "Mon" holding two drivers.

1. Ticking Tue for Camilla puts her in Tirsdagslaget, and no Tuesday group appears. Pack 5's Tue column lists her.
2. Unticking Tue takes her out of both.
3. Ticking Wed adds exactly one group, "Wednesday", at the end, holding only her.
4. Unticking Wed leaves that group in place, empty.
5. One click on Mon for the duplicated driver removes both copies.
6. The "Mon" group's `driverIds` are deep-equal before and after every tick.
7. No driver's `available` changes.
8. Compare the parsed `carcoord:v1` with a copy taken before the first tick. Only `driverGroups` differs, apart from `date` (pack 4 saves its date move with the first change). Every driver still has exactly `id`, `name`, `available`, `labelId` and `note`.
9. A day button pressed with the keyboard keeps focus on the same driver's same day.
10. Untick a weekday group's last driver, then press that column's Load under the day plan. Nobody's in/away changes, item 2's notice shows, and `carcoord:v1` is byte-identical.

### C. The Day groups section (`driverGroups`, :854-883)

- **The cards stay as they are:** member chips, Use for today, ↑↓✕.
- **Add a crew for** (:856, :879-880) uses `WORK_WEEK`.
- **Wording, re-derived from what pack 5 shipped:**
  - The badges (:862-864) and the hint (:875) say "button beside the day plan" and "a button of its own under the week". Pack 5 removes that row, so both will point at nothing.
  - A day's group gets a badge naming pack 5's column.
  - A second group for the same day still says "⟨Day⟩ twice".
  - A Sat/Sun group's badge follows wherever pack 5 lets weekend groups be put in for the day.
  - The tab's top hint (:840; the add bar at :841 is untouched) gains one sentence: `Tick a driver's usual days to put them in that day's group under Day groups. A tag or a note never sets anyone Away.`
  - The Labels hint (:935) becomes "cars, positions and drivers".
- **The `apply-group` guard** (:1852), placed first in the case:
  ```
  if (!crewIds(g).size) {
    note('info', `${g.name.trim() || 'That group'} has nobody in it yet, so who is in today is unchanged. Tick names into it first.`);
    render();
    return;                                        // nothing changed, so nothing is saved
  }
  ```

### D. Deleting a label (:1713)

The sweep becomes `[...state.cars, ...state.positions, ...state.drivers]`. The backup at :1709 is already taken before it.

### E. Width and CSS

**`.day-tick`:** compact, fixed width, on one line, using pack 3's tokens only:
- off: a `--line` border and the control background pack 3 gives `.btn` (today `#fff`, style.css:79). Not `--panel`, which the table already uses (:64).
- on: a `--steel` fill with pack 3's text-on-colour token, matching `.chip.on` (:87) and the member chips on the group cards (`--c:var(--steel)`, app.js:859).
- focus: the global `:focus-visible` rule (:23).

**Target.** With the dev fixture (20 drivers, 5 labels), at 900 and 1024px wide:
- the right edge of `#tab-drivers table.grid` sits within the right edge of `#tab-drivers`;
- the note box is at least 120px wide.

Measure the table, not the page. The top bar already overflows by 30px at 900 (container, "Found while planning").

**Levers**, applied in this order until the target is met:
1. Narrow the name box from 200px to 150px (:833).
2. Keep the day buttons compact and on one line.
3. Let the tag chips wrap, as they do on the Cars tab.

**Fallback.** If levers 1–3 can't meet the target, lever 4 is `#tab-drivers { overflow-x: auto }` above 760px. Today only the ≤760px rule contains a wide table (:355-363). A table that scrolls inside the tab still runs past the tab's edge, so with lever 4 the check changes:
- no sideways page scroll at 900 and 1024;
- the note box is at least 120px;
- the ledger tells the owner that the table scrolls sideways at that width.

**Phone width.** The phone fixture (smoke:1787-1797) gains:
- a label;
- two drivers, one tagged and one with a note;
- a group.

At 390px, all five day buttons in a row share one `top`, and the note box is wider than zero inside the tab's scroll.

Record the row height at 900 in the ledger.

### F. Unchanged

- `share.js`: `dr` stays `[name, available]` (:77), groups travel by name (:78), and a receiving browser keeps its own tags and notes (:205-206).
- `store.js`.
- The printed sheet (`renderSheet` lists cars and positions only).
- `problems()`, the picker's flag, templates, Clear the day and `start()`.
- The rail's tooltip shows the note after the next render, which switching back to the plan triggers.

## Items

- [x] **1. Deleting a label clears it from drivers too.** Add `state.drivers` to the label sweep (Design D). The "Deleting a label" backup is unchanged.
      *Done when:* smoke tags a driver and deletes that label with two clicks. The driver's `labelId` is then empty, "Deleting a label" is at the top of Backups, and no repair notice shows after a reload.
- [ ] ~~**2. Use for today on an empty group changes nothing.** The guard in Design C. If pack 5's Load doesn't reach `apply-group`, move the check into one helper that both call.~~ **Dropped 2026-09-29: pack 5 item 8 does this (owner).**
      *Done when:* smoke presses Use for today on two empty groups: a new Fri group made with Add a crew for, and a group whose only driver was deleted. It also presses pack 5's Load on the empty Fri column, whatever pack 5 shows there. Each time, everyone's in/away, `carcoord:v1` and the Backups stay byte-identical and the notice shows. A group with members still applies as before.
- [x] **3. Usual days on each row, showing each weekday's group.** `WORK_WEEK`, the cell, its header, the tooltips and `aria-pressed`, as in Design A. No `data-field`, no `toggle`, no `.bar`.
      *Done when:* on the dev fixture, each driver's Mon–Fri buttons are pressed exactly where that weekday's first group holds them: Tirsdagslaget's 13 on Tue, nobody on Wed or Thu. A click still writes nothing to `carcoord:v1`.
- [x] **4. ⚠️ Ticking a day edits that day's group, and nothing else.** The `crew-day` act, its entry in `ITEM_ACTS`, and keyboard `refocus`, as in Design B.
      *Done when:* smoke case `usual days write only day groups` passes all ten cases in Design B.
      **Risky — review individually.** It is the only new write, and it writes the setup the owner values most.
- [x] **5. Tag and Note columns.** A Tag cell with `labelChips('driver', d)` and a Note cell with `field(...)`, plus their headers. The Labels hint now names drivers.
      *Done when:* smoke clicks a driver's tag chip and types a note. Only that driver's `labelId` and `note` change, and they stay in today, on the tab and in the rail. Both values survive a reload and appear in Export.
- [x] **6. Share codes carry no driver tags or notes.** Smoke only; `share.js` is untouched.
      *Done when:* `Share.decode` of a Copy everything code from a browser with tagged and noted drivers has two-field `dr` rows. The receiving pcB keeps its own tags and notes on drivers it already had, and a driver it gains shows an empty Note with the OK chip lit.
- [x] **7. The words on the Drivers tab match the new row.** Design C's wording, and smoke:1381-1387 and :1477-1480 updated to match. If pack 5 already reworded the badges, this item is only Add a crew for and the top hint.
      *Done when:* smoke finds none of "beside the day plan", "under the week", or any phrase pack 5 retired, in `#tab-drivers`' text or in any `[title]` inside it. Add a crew for lists exactly the Mon–Fri days that have no group; smoke:1385 expects `['Thu', 'Fri']`.
- [x] **8. The wider table fits the Windows app's smallest window.** `.day-tick` CSS on pack 3's tokens, then Design E's levers in order, plus the phone-fixture additions.
      *Done when:* Design E's target holds at 900 and 1024 using levers 1–3, or its lever-4 fallback check holds and the ledger says so. The phone case sees five buttons on one line and a note box wider than zero. The row height at 900 is in the ledger.
- [x] **9. Screenshots.** In `scripts/screens.mjs` (:77-93), after Monday is applied, and all through the row:
  - tick Tue for Ana Ruiz and Bo Lind, which creates a Tuesday group, and Wed for Cai Mensah;
  - tag Hana Sol, the one driver left out of Monday, with Unavailable;
  - give Bo Lind a note.

  Then take `02-drivers` and a 900px Drivers shot.
      *Done when:* `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens` exits 0 with no console errors, writes both Drivers shots, and still finds exactly one `tr.away`.
- [ ] **10. The README and the plan files say what shipped.** Four edits:
  - README:22, the Drivers bullet;
  - the container's pack 7 text (:222), which records the owner's answer on the days;
  - its "Found while planning pack 8" list, where :264 and :265 are marked fixed in pack 7;
  - pack 8's manifest :182 and :378, because deleting a label now clears drivers.
      *Done when:* the README, the container and pack 8's manifest all describe the row as shipped, and neither fixed bug is still listed as open.
- [ ] **11. Announce Drivers tab and cut 0.9.0.** Pack 1's Design H, in one commit:
  - the entry below goes at the top of `docs/updates.js`;
  - the six version places move to 0.9.0, the next minor after `APP_VERSION` at go;
  - the `?v=` tags follow;
  - if `scripts/upgrade.mjs` hard-codes pack 1's expected versions, it now takes them from the build.

  Draft entry:
  - **version:** `0.9.0`
  - **title:** `Usual days, tags and notes for drivers`
  - **changed:** `Each driver's row has Usual days, a Tag and a Note; a tag never sets anyone Away. Use for today on an empty group now changes nothing.`
  - **affects:** `Drivers tab, ⟨the week under the day plan⟩, and Labels tab: deleting a label takes it off drivers too. Copy everything sends ticks as Day groups, not drivers' tags or notes. Printed sheet unchanged.`
  - **data:** `Nothing in your saved plan changes.`
  - **must:** `false`. The data line is the "Nothing … changes" sentence, and neither the printed sheet nor share codes change (rule G).

  Wording checks:
  - Replace `⟨the week under the day plan⟩` with pack 5's on-screen name.
  - Never say tags or notes stay "on this PC" or "in this browser": they travel in Export and the save file.
  - Use "group" and "Day groups", never "crew".
  - Re-read the entry against the shipped screen words at the walkthrough.
      *Done when:* `versions.mjs` passes at 0.9.0, and `npm run upgrade -- ⟨previous dev build⟩` passes every check under Saved data.

## Owner questions

**Answered by the owner, 2026-09-29.**
1. The usual-day toggles are **Monday to Friday** only. Weekend groups stay editable on their cards.
2. "Use for today" on an empty group is fixed in **pack 5** (its item 8), so item 2 here is dropped.

1. **Usual days: Monday to Friday, or all seven?** The container's approved text says seven buttons (:222). I recommend Monday to Friday.
   - Pack 4 ruled out weekend planning.
   - Pack 5's columns are Mon–Fri, so a Sat or Sun button would edit a group that no column shows.
   - Weekend groups (like the fixture's "Lørdag gjeng") stay editable on their cards and still travel in share codes.

   If you say seven, these change:
   - the row and Add a crew for use `WEEK`;
   - smoke:1385 keeps its weekend days;
   - item 8's width check is redone with seven buttons.

   The note entry names no days either way. Item 10 records your answer in the container.

## Out of scope

- Saturday and Sunday buttons, unless the owner answers seven. Weekend groups stay editable on their cards and still travel in share codes.
- A driver's usual start time. It stays on the Considered list, and it would need a new saved field and its own migration plan.
- Driver tags or notes on the printed sheet, in `problems()`, or as a warning in the day plan's picker.
- Sending drivers' tags or notes in share codes.
- Making the rail's tag menu work on the Drivers tab.
- Sorting groups made by ticking into weekday order, or naming them in Norwegian.
- Deleting a group when its last driver is unticked.
- A second group for the same day. The buttons edit only the first, and the second keeps its "⟨Day⟩ twice" card.
- A "Wednesday" group on one browser and an "Onsdag" group on another don't match when a share code arrives. This already happens today.
- Keyboard focus after pressing a tag chip, which would change the Cars and Positions tabs too.
- Where a Sat/Sun group is put in for the day once the rail's row is gone. That is pack 5's call.
- The container's other found issues:
  - dragging a name in the Windows app;
  - Restore choosing its backup by list position;
  - templates saved under the same name.
- HANDOFF.md's out-of-date schema line.

## Gates

- **Item gate:** `scripts/check.sh`, which includes pack 1's `versions.mjs`. When an item touches logic (items 1, 2, 4, 5, 6), also run `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`.
- **Pack gate**, all with `CHROMIUM_PATH=/usr/bin/google-chrome`:
  - `npm test`;
  - `npm run screens`;
  - `npm run upgrade -- ⟨previous dev build⟩`, with the Saved data expectations.

  Say that it ran on system Chrome, not the browser CI uses.
- **Review:** item 4 on its own, then one pass for the rest.
- **Browser walkthrough before the PR into `dev`:**
  1. Import the dev fixture.
  2. Tick Tue for Camilla. Tirsdagslaget gains her, and the week under the day plan lists her on Tue. Untick it, and she leaves both.
  3. Tick Wed for her. A Wednesday group appears, holding just her. Untick it: the group stays, empty. Its Use for today, and its Load under the day plan, change nothing and say why.
  4. Tag Anders Holiday. His In or away is unchanged, on the tab and in the rail.
  5. Type a note and reload. It's still there.
  6. Delete the Course label, which Randi wears. Her row shows OK, and no repair notice appears after a reload.
  7. Copy everything to a second profile:
     - no drivers' tags or notes arrive;
     - a driver it gains shows an empty Note with OK lit;
     - its groups are replaced by name.
  8. Resize to 900, to 1024 and to phone width.
  9. Re-read the 0.9.0 entry against the shipped screen words.
- **At pack close:** INVENTORY's 🚧 pointer becomes ✅ under Day plan, and the container's status line moves on.

## Ledger

- **2026-09-30, start (combined pack, part 7).** Built on `review-round`, base 980c016 (0.8.0). **At go:** `APP_VERSION` is 0.8.0, so this part cuts 0.9.0. Part 5's Load is `apply-group`, and its item 8 already guards an empty group ("⟨name⟩ has nobody in it yet. Tick names into it first; nobody was changed."), so item 2 stays dropped. `scripts/upgrade.mjs` reads the note's versions from `docs/updates.js`, so item 11 has nothing to change there; under the owner's batched rule it runs once, from v0.2.4, at the end. Part 5 added `WORK_WEEK` and already reworded the group badges and the Day groups hint; part 2 already made the Labels hint name drivers. INVENTORY's two 💭 lines are one 🚧 pointer under Day plan; Working hours stays under Considered.
- Item 1 done, 9a3173f. Design D: the label sweep now includes `state.drivers`. Smoke: a Drivers tab context (`drvCtx`, the dev fixture) deletes Course, which Randi wears, with two clicks: her `labelId` is empty, "Deleting a label" tops Backups, and no repair notice follows a reload. Later items add their cases before its "the Drivers tab: done" line. Gate: `check.sh` OK.
- Item 3 done, 4fdb69c. Design A's cell as `usualDays(d, byDay)`, using part 5's `WORK_WEEK`; `byDay` is computed once per render. No `data-field`, no `toggle`, no `.bar`. Smoke: every driver's five buttons match `dayCrews().byDay` in `aria-pressed`, and the fixture shows Tirsdagslaget's 13 on Tue and nobody on Wed or Thu. (The "a click writes nothing" part is moot by item 4's commit and is not a case of its own.) Gate: `check.sh` OK.
- Item 4 done, 5b8a877. **Awaiting individual review** (in the combined review). Design B's `crew-day`, in the switch before `add-day-group`, and in `ITEM_ACTS`. Smoke (Drivers tab context, the dev fixture plus a doubled id in Monday crew and a second "Mon"): cases 1-9 of Design B as planned; the "only `driverGroups` differs" comparison is against the plan as this build read it (the fixture is schema 4, and the first save writes it as 5), with `date` left out. **Case 10 differs:** part 5 draws an emptied weekday's column with no Load at all, so the case checks that, then presses the group card's Use for today: nobody changes, part 5's notice shows, and `carcoord:v1` is byte for byte. Gate: `check.sh` OK.
- Item 5 done, 16b990e. `labelChips('driver', d)` in a `td.driver-tags` and `field('driver', d.id, 'note', …)`, with Tag and Note headers. The Labels hint already names drivers (part 2, item 4). Smoke (Drivers tab context): Camilla tagged Holiday with a note; only her two fields change, she stays in (tab and rail), and both survive a reload and appear in Export. Gate: `check.sh` OK.
- Item 6 done, d6bbad0. Smoke only: `Share.decode` of an everything code whose drivers all carry a tag and a note has two-field `dr` rows; a receiving browser (a context of its own, not pcB) keeps "Here only" and "Kept here" on its Camilla, and a gained driver shows an empty Note with OK lit. `share.js` untouched. Gate: `check.sh` OK.
- Item 7 done, 973094d. Part 5 had already reworded the badges and the Day groups hint, so this item is the top hint's new sentence, Add a crew for on `WORK_WEEK` (smoke now expects `['Thu', 'Fri']`), and, **as a deviation owed to part 4's wording rule** (the container's pack 7 line says the Drivers tab follows it): the toggle reads In, the column header Today becomes Route, the group card's title and the Day groups hint drop "today", and the applied-group notice reads "2 drivers in, 1 away" (smoke's check follows). **Kept:** the Use for today button's name, because the 0.7.0 entry names it and entries are never edited. **The phrase check differs from the plan:** part 5's badges say "a button in the Drivers panel beside the day plan", so the check looks for the retired phrases themselves ("button beside the day plan", "under the week") and for "in today", in the tab's text and titles. Gate: `check.sh` OK.
- Item 8 done, d40c6c6. `.day-tick` on tokens (off: `--line` and `--field`; on: `--steel-fill` with `--on-fill`), levers 1-3 (name box 150px, compact one-line days, wrapping tag chips with a 120px cell, a 120px note box), **and lever 4 applied up front** (`#tab-drivers { overflow-x: auto }`), because the batched rule means the widths can only be measured at the end: without it, a row that overflows at 900 would scroll the whole page. The smoke check is therefore Design E's lever-4 form (no page scroll and a 120px note at 900 and 1024), and it prints the table's overhang and the row height at each width, to be recorded here from the end-of-run suite. The phone fixture gains a tagged driver, a noted one and a group, and checks five days on one line and a note box wider than zero. Gate: `check.sh` OK.
- Item 9 done, 3225022. The planned ticks, tag and note, through the row; the script fails unless the groups read "Monday:8,Tuesday:2,Wednesday:1" and exactly one row is away. Shots: 02-drivers (retaken) and 28-drivers-at-900. Runs at the end. Gate: `check.sh` OK.
