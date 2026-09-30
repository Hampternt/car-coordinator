# Pack: Plan for tomorrow

**Status:** 🚧 building, since 2026-09-30, as part 4 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and the owner question approved (a window left open overnight is not moved).
**Date:** 2026-09-29.
**Branch:** cut when execution starts. It is `plan-for-tomorrow`, cut from `dev` after pack 3 has merged into `dev`. It merges back into `dev` through a PR (the container's Branch line).

## Goal

When a leader opens Car Coordinator, the day plan is for the **next working day**. The warehouse works Monday to Friday, so an open on Friday, Saturday or Sunday plans for Monday.

- **A saved date that has passed** moves forward on screen only. A notice says so and offers **Keep ⟨old date⟩**. Opening the app writes nothing. The new date is saved with the next real change.
- **A line under the Date** always says what day the plan is for. When that isn't the next working day, the line warns and offers **Set to tomorrow**. It never blocks anything.
- **Template offers and the underlined weekday** follow the plan's date, not the calendar's.
- **Clear drivers, cars, positions and rounds**, and a new plan, both date the plan for the next working day.
- **Buttons that change nothing** stop saving, so "saved with your next change" is true.
- **The Start of day backup** counts days by the leader's own midnight.
- **The pack is announced** in the update note and cut as 0.6.0.

The saved plan's shape does not change.

## Agent brief

There is no `CLAUDE.md` at the repo root. Conventions come from `HANDOFF.md`, the code and the container `manifests/2026-09-28-review-round.md`. One agent does the items in order. Every item writes `docs/app.js` or `scripts/smoke.mjs`.

**Line numbers** below are cited against `dev` at 73dd734, which is before pack 1. Packs 1–3 all move this code, so **re-check every citation when this pack starts**. The date move is **step 6 of pack 1's Design D**. The container calls it step 5 until pack 1's item 12 reconciles the two lists.

**At pack start:**
- Save this manifest as `manifests/2026-09-29-plan-for-tomorrow.md`, and point the container's pack 4 row at it.
- Move INVENTORY's 💭 entry (`INVENTORY.md:85`) into **Day plan** as 🚧, and update the container's status line.
- Add one line to the container's **pack 7** section. It says the Drivers tab's "today" wording follows this pack's wording rule (Decisions).
- Add one line to `manifests/2026-09-28-context-menus.md`. At `:51`, `:191` and `:210` it points at the same rule: the rail entries read "Set away" / "Bring back in".
- Add one line to `manifests/2026-09-28-tour.md` (`:69`, `:208`). It says `#dateLine` sits directly under `#planBar`, and step 5's copy mentions the line and Set to tomorrow.
- Confirm that pack 1's `archive-restore` installs a **new** state object, as `Share.apply` does (`docs/share.js:165-169`). Keep's staleness check depends on it. If it mutates `state` in place, it must drop Keep explicitly, like Clear the day.

**Read first:**
- **This manifest.** Then the container's **Branch** line, **Rules every pack follows** and **pack 4** section. Then pack 1's manifest (`manifests/2026-09-28-update-note.md`):
  - Design D, the startup order;
  - Design G, the wording rules for `docs/updates.js`;
  - Design H, the release rule;
  - Store's `pref` / `setPref` / `archives`, `APP_VERSION`, `archive-restore`, `scripts/versions.mjs` and `scripts/upgrade.mjs`.
- **`docs/app.js`:**
  - Dates and saving:
    - `today()` `:78-82`, `defaults()` `:88-117` (the date at `:92`) and `const save` `:120`.
  - The rail and the week row:
    - The rail's driver panel `:517-556` (titles `:533`, `:550`).
    - `dayBar` `:610-639`: `getDay()` at `:617`, the class `:626`, '(today)' `:627`, titles `:633`, `:635`, `:636`.
  - The Day plan's Date and the template shelf:
    - `renderPlan` `:650`, with the Date `.bar` at `:703-708` (`#date` at `:705`).
    - The shelf: `renderTemplates` `:771-795`, select title `:776`, hint `:792`.
  - The save-file question's plan summary `:966-979`, which shows both dates.
  - Drawing:
    - `renderNotices` `:1061-1079`, which scrolls `offerRaised` into view (`:1075-1078`).
    - `render()` `:1125-1139`, which drains Store notices at `:1130`.
  - Typing:
    - The input handler `:1143-1177`: the meta write `:1166`, `save()` `:1172`, and the last branch `:1176`.
    - `redrawKeepingCaret` `:1185-1193`. At `:1188-1190`, `render()` replaces `#date` and the focus isn't restored.
  - Data-tab actions:
    - `share-apply` `:1381-1391`.
    - `dataAction` `:1425-1482`: `link-file` `:1427`, `reconnect-file` `:1428`, `restore` `:1466`, `dismiss` `:1479`.
    - `writeScreenToFile` `:1405-1411`, which goes through `save()`.
  - Notices and offers:
    - `offerRaised` `:1493`, `note` `:1495-1502`, `dropOffers` `:1507`.
    - `offerTodaysTemplate` `:1613-1623` and `askTemplate` `:1625-1630`.
  - The click switch `:1641-1897`:
    - `refocus` at `:1663`, and `switch` at `:1665`.
    - Acts: `up`/`down` `:1673-1674`, `set-tag` `:1689`, `clear-day` `:1725-1730`, `ask-template` `:1762`, `all-in` `:1791`, `save-day-crew` `:1826-1845`, `add-day-group` `:1846`, `apply-group` `:1852`, `split-rounds` `:1872-1886`.
    - The shared `save()` at `:1895`.
  - Other writes: the drop's `save()` `:1987` and the picker's `save()` `:2166`.
  - `start()` `:2354-2383`: the save-file check `:2365`, `dailySnapshot` `:2368`, the offers `:2373-2374`.
- **`docs/store.js`:**
  - `normalise`'s date check `:137-138`, and the newer-version warning `:153`.
  - `readLocal` `:174-186`, `snapshot` `:214-231` (`t` at `:216`; it skips a copy identical to the newest at `:218`), and `dailySnapshot` `:233-237`.
  - `writeFile` `:326-343`, which sets `file.lastSaved`. `queueFileWrite` `:345-350`, with an 800 ms debounce.
  - `linkFile` `:362-381`, which reads and then writes at `:378`. `reconnect` `:409-424`, which writes at `:421`. `reconcile` `:429-439`.
  - `samePlan` `:559` and the exports `:573-581`.
- **`scripts/smoke.mjs`:**
  - Console errors fail the run (`:41-42`).
  - Fixtures dated in the past: the main page `:287`–`:922`; PC B `:615`; the phone `:1788`; the week and picker fixtures `:1262`, `:1343`, `:1395`, `:1917`.
  - Checks that read those dates: `:603`, `:624`, `:642`, `:1033`.
  - Weekday checks: `:1068-1121` and `:1360`.
  - The save-file stand-in `linkStandIn` `:2000-2023`. Its cases drive start-up steps by hand (`:2136`, `:2204`).
- **`scripts/screens.mjs`:** one page, built through the UI (`:31-216`). It asserts exactly 4 `tr.warn` rows (`:164`).
- **`scripts/fixtures/dev-data.json`:** dated 2026-09-28. It stays past-dated on purpose, so the upgrade check exercises the move.
- **CI** runs in UTC (`.github/workflows/build.yml:11`).

**Reuse:**
- `note()`, `renderNotices` and the `offerRaised` save-and-restore pattern.
- `askTemplate` and the `ask-template` → `load-template` path.
- `WEEKDAYS`.
- The save-file stand-in.
- Pack 1's Boot safety pattern: a try/catch per step, `typeof` guards and `console.warn`.
- Pack 1's `upgrade.mjs`.

**Dependency edges:**
- **Pack 1 (merged first):**
  - Design D's order: step 5 `dailySnapshot`, step 6 the move, step 7 offers, step 8 the note, raised last.
  - `Store.pref`; `APP_VERSION`; `docs/updates.js` and rules G and H; `versions.mjs`; `upgrade.mjs` (item 11).
  - `archive-restore` replaces the plan, so Keep must go stale after it.
- **Pack 2:**
  - The sheet no longer prints problem lines. `SCHEMA` is v5, which doesn't interact with this pack.
  - Line numbers move.
- **Pack 3:** the colour tokens for `.date-line`, `.date-line.off` and the Keep notice.
- **Pack 5:**
  - It deletes `dayBar` and `.day.today`.
  - Its week columns and lit column reuse `planWeekday()` and `nextWorkingDay()`.
- **Pack 7:** owns the Drivers tab's "today" wording, and follows this pack's wording rule:
  - the rows `:835`, the header `:846` and the hint `:840`;
  - the day groups `:868`, `:875`;
  - the notice `:1867`, which smoke `:176-178` pins.
- **Pack 8:** the rail's context-menu entries follow the same rule.
- **Pack 9:** its step 5 targets `#planBar`, which `#dateLine` sits directly under.

## Saved data

**No migration.** No saved shape changes:
- `SCHEMA` stays where pack 2 leaves it (v5).
- `normalise` is untouched, and still checks only the date's shape (`store.js:137-138`).
- No new keys. Keep lasts for the session (Decisions), so nothing new goes in `carcoord:pref:*`.

**What this browser holds:**
- **`carcoord:v1` is never written at open.** The moved date lives in memory. It reaches `carcoord:v1` only with the next real change (item 5 makes "real" true).
- **Keep before any change** leaves `carcoord:v1` byte-identical.
- **Keep after a real change** saves the old date, as any edit does.
- **Backups:** each entry's `t` stays an ISO string (`store.js:216`). The only change is which day a Start of day backup counts for: local midnight instead of UTC midnight.
- **Archives:** not touched.

**The save file:**
- Nothing is written at open.
- The moved date reaches the file with the next real change. It also gets there when **Reconnect** (with no marker) or **Choose save file…** (onto an empty file) writes the screen, as those always have.
- If one of those wrote it, Keep writes the old date back to the file only. It still writes nothing to this browser (Design C).

**Older copies of the app:**
- They read any date as it was saved and never move it.
- Share codes carry whatever date the sender has on screen (`share.js:51`, `:227-229`).

**Proof:**
- Item 7 proves all of these:
  - `carcoord:v1` and the stand-in file are byte-identical after open and after a reload;
  - Keep on a newer-version load writes nothing;
  - Reconnect then Keep puts the old date in the file only.
- The upgrade check (item 8) asserts all of these:
  - `carcoord:v1` and the linked file are byte-identical after open;
  - the archive equals the old text;
  - `state.date` in memory is the next working day;
  - the Keep notice comes before `.notice.update`.

## Decisions taken

| Decision | Choice |
|---|---|
| What "tomorrow" means | The next working day, Monday to Friday. An open on Friday, Saturday or Sunday gives Monday. *Owner (container, Decided): no Saturday or Sunday planning.* Public holidays are not skipped. That is a known limitation, not an open question. |
| Which dates move | Only past dates. A plan dated today (a morning fix, a reprint) is not moved: the line warns and offers Set to tomorrow. A plan dated in the future is not moved either. *Owner (container, Decided).* |
| Template offers and the lit day | They follow the plan's date. *Owner (container, Decided).* |
| The Mon–Sun row | Not reworked; pack 5 removes it. One line changes: `new Date().getDay()` at `app.js:617` becomes `planWeekday()`. *Owner (container, Decided).* |
| In memory until the next real change, with a Keep button, warn and never block | From the container's pack 4 scope, which the owner approved with the pack order. The same goes for Clear the day and `defaults()` sharing one helper, and `dailySnapshot` counting local days. |
| Held loads (a save from a newer version) | The move runs on every usable load, held ones included, as the container says ("a saved date that has passed moves"). This is safe because nothing is written at open, and Keep never writes `carcoord:v1` unless a real change already has. An unreadable save opens on defaults, so there's nothing to move. |
| What Keep does, and the save file | Keep puts the old date back wherever the moved date went, and nowhere else. `dateMove.saved` is set by app `save()` while the move is live, and Keep then calls `save()`, which writes both. `dateMove.inFile` is set in `dataAction` when `link-file` or `reconnect-file` changed `Store.file.lastSaved`. Keep then calls a new file-only `Store.saveFile(state)`, guarded with `typeof`. It goes through `queueFileWrite`, so the hold and permission checks still apply. **Two critiques conflicted here.** The data-safety review said to narrow the wording and not have Keep write the file. The feasibility review said to track the two targets separately. We chose separate flags, because Keep then undoes the move everywhere it reached. It still never writes `carcoord:v1` on a held load, which is the data-safety review's actual concern. The notice wording is narrowed to this browser anyway. |
| How long Keep stays | Until it is dismissed, or the plan or its date is replaced. The check `state !== dateMove.plan \|\| state.date !== dateMove.to` catches the acts that install a new plan: Import, Open file, Restore, `share-apply`, `file-keep-file` and pack 1's `archive-restore`. It also catches a typed date. **It does not catch Clear the day or Set to tomorrow**, which keep the same object and set `state.date = nextWorkingDay()`, the same value as `to`. Both drop Keep explicitly. Otherwise Keep could write a passed date over a freshly cleared plan. The check runs at the top of `render()` and again on the click. |
| Keep across opens | Keep lasts for the session. The kept day has still passed, so the next open moves it again and offers Keep again, as the container's rule says. No new setting is added. |
| Where the warning sits | On a line of its own, `#dateLine`, directly under the Date bar (`app.js:703-708`). It is not in `problems()`, which feeds `liveSig`, the row stripes and the smoke/screens counts. It is not in `#notices`, which sits above the Date field (`index.html:37`). The line is always there, so it never jumps while you type. When the date is right, it quietly names the day, which the browser's date box doesn't show. |
| What the date line says | The cases are checked in this order: not a real day; the next working day (quiet); today; before today; **anything else**, which warns. The last case is a catch-all, so a weekend date seen on a Friday or Saturday open still warns. *Both critiques found that gap.* |
| Typing in the Date field | Only the line redraws: its own `innerHTML` is replaced, never the input. `render()` would replace `#date` mid-typing and lose the focus (`app.js:1188-1190`). Notices and offers are left alone while typing. They follow the new date on the next button that changes it. |
| When template offers are recomputed | At open, and after Keep, Set to tomorrow and Clear the day. The new offer replaces its predecessor quietly, without scrolling. A date that isn't a real day offers nothing. |
| Weekend templates | They stay, and each still says "On Saturdays" or "On Sundays". A moved plan is always Monday to Friday, so they offer themselves only for a plan dated that weekend day. This follows from the owner's no-weekend decision. It is stated in Design E, and in the note's "template offers". |
| The "today" wording rule | Who is in belongs to the plan, not the calendar, so the rail never says "today". Exact strings: `:533` 'In — click to set away' (the Away title is unchanged); `:550` and `:633` '… click to make them the ones in'; `:627` '⟨Day⟩ (this plan's day)'; `:635` aria-label 'Who is in'; `:636` 'Everyone on the roster is in'. The offer (`:1621`) names the plan's date. Pack 7 applies the same rule to the Drivers tab, and pack 8 to its rail menu ("Set away", "Bring back in"). |
| `samePlan` and the date | Unchanged; it is 0.2.5's data-loss guard. After a move, the file's copy has a different date, so two things ask "holds a different plan": a Reconnect with the marker set, and a Choose save file… onto a file holding this same plan. The question shows both dates (`app.js:970-973`). It errs toward asking and loses nothing. |
| Clicks that change nothing | One guard instead of a list. `const before = JSON.stringify(state)` is taken before the switch (`app.js:1665`). The shared `save()` at `:1895` runs only when the state differs, and the drop (`:1987`) and the picker (`:2166`) get the same guard. **Chosen over listing acts one by one.** Both critiques found presses the list missed (All, a lit day, the same label, a duplicate car or driver). A list can also mistake a real edit for a no-op, and a guard can't. `keep-date` returns on its own path before the shared save. |
| Dates that aren't real days | They are never moved and never throw. The line says the date isn't a real day and offers Set to tomorrow. `normalise` stays shape-only. |
| Calendar arithmetic | Days are added as `new Date(y, m - 1, d + n, 12)`, at local noon, so a clock change can't slip a day. "Passed" is a string comparison of zero-padded dates, made only after `parseDay` has validated the date. |
| Test clock | A separate "calendar" context (`timezoneId: 'Europe/Oslo'`). Every instant is written with its Oslo offset: `+02:00` until 2026-10-25 03:00, `+01:00` after, and `+01:00` before 2026-03-29 02:00. It is never used on the shared `page`: a frozen clock would give every backup the same `t`. Fixtures that aren't about dates are dated `PLAN_DAY`, read from the page. |
| Boot safety | The move is a named function, `moveDateOnOpen()`, in its own try/catch at step 6. It works out the dates, text and offer first, and assigns `state.date` last. The catch puts `state.date` back, clears `dateMove`, removes any Keep notice and logs `console.warn`. The offers, the update note, `render()` and the share link still run. |
| Version and note | 0.6.0, the next minor on `dev` after pack 3's 0.5.x. The entry is `must: true`, because the printed sheet and share codes carry the moved date, and `data` isn't the "Nothing … changes" sentence. The Start of day change is left out of the note, because it doesn't change the saved plan. |

## Design

### A. The calendar helpers

These go next to `today()` (`app.js:78-82`):
- **`dayString(date)`:** the local `YYYY-MM-DD`. `today()` becomes `dayString(new Date())`.
- **`parseDay(s)`:** a local `Date` at noon, or `null` unless the string round-trips exactly. That rejects `2026-13-45`, `2026-02-30`, `''`, `'x'`, and years below 100, which `Date` maps to 19xx.
- **`nextWorkingDay(now = new Date())`:** the next calendar day, skipping Saturday and Sunday.
- **`dayLabel(s)`:** for example 'Wednesday 30/09', with the year added when it isn't the current year.
- **`planWeekday()`:** `parseDay(state.date)?.getDay()`, or -1.

**Used by:**
- `defaults()` (`:92`). That covers:
  - the placeholder at `:115`;
  - a first run;
  - an unreadable save;
  - `normalise`'s repair of a bad date.

  None of these is ever a passed date, so none of them triggers the move.
- Clear the day (`:1729`).
- Set to tomorrow, the move, the date line, the template offer and the week row.

`store.js` keeps a small local-day formatter of its own for `dailySnapshot`. It loads before `app.js` and shares no code with it.

### B. The move: `moveDateOnOpen()`, step 6 of pack 1's Design D

**Where:** after `Store.dailySnapshot(state)` (`:2368`) and before the offers (`:2373-2374`). That is also after the save-file check (`:2365`), so the check compares the unmoved plan. It runs in its own try/catch.

**Conditions:** `parseDay(state.date)` and `state.date < today()`.

**The steps, in order:**
1. `from = state.date`, `to = nextWorkingDay()`.
2. Build the text: '⟨Monday 28/09⟩ has passed, so this plan is now dated ⟨Wednesday 30/09⟩, the next working day. This browser saves the new date with your next change.'
3. Build the offer `{ act: 'keep-date', kind: '', id: '', text: 'Keep 28/09' }`.
4. Raise it with `note('info', …)`, saving and restoring `offerRaised` around the call. The file-hold offer (step 4) and the spot-split question (step 7) keep the scroll.
5. **Last:** `state.date = to`, then `dateMove = { from, to, plan: state, saved: false, inFile: false }`.

**What the order means:**
- The Start of day backup (step 5) holds the unmoved plan.
- Keep comes before pack 1's update note, which is raised last.

### C. Keep

**The record:** `let dateMove = null` sits beside `notices`.
- `const save` (`:120`) sets `dateMove.saved = true` when `dateMove && state === dateMove.plan`.
- `dataAction` notes `Store.file.lastSaved` before `link-file` / `reconnect-file`. If it changed and the move is live, it sets `dateMove.inFile = true`.
- `file-keep-screen` and `file-overwrite` go through `save()` (`:1406`), so they set `saved`.

**`keep-date`, in the click switch:**
1. Take `m = dateMove`, set `dateMove = null`, and remove the Keep notice.
2. If `!m || state !== m.plan || state.date !== m.to`: call `render()` and return, with nothing saved.
3. Otherwise:
   - `state.date = m.from`;
   - note 'Kept ⟨Monday 28/09⟩. That day has passed, so the date moves again the next time the app is opened.';
   - re-raise the template offer quietly.
4. Then: if `m.saved`, call `save()`; else if `m.inFile` and `typeof Store.saveFile === 'function'`, call `Store.saveFile(state)`.
5. Call `render()` and **return**. It never reaches the shared save at `:1895`, where the guard would see the date change and write `carcoord:v1`.

**`Store.saveFile(state)`:** a new export, `{ queueFileWrite(state); }`. It writes to the file only, and `writeFile`'s hold and permission checks still apply.

**When Keep goes away:**
- `render()` prunes a stale Keep right after it drains Store notices (`:1130`): the state check fails, or the Keep notice has been dismissed.
- Clear the day and Set to tomorrow set `dateMove = null` and remove the notice explicitly.
- `dropOffers` keeps it: `!n.offer || n.offer.act === 'keep-date'`.
- Dismiss (`:1479`) only removes it; the move stands.

### D. The date line

`<p id="dateLine" class="date-line">` sits directly after the Date `.bar` in `renderPlan` (`:703-708`). With `now = today()` and `nwd = nextWorkingDay()`, the cases **in this order**:
1. **Not a real day:** 'The date is not a real day. The next working day is ⟨Wednesday 30/09⟩.' plus the button.
2. **`date === nwd`:** '⟨Wednesday 30/09⟩, the next working day.' This case is quiet.
3. **`date === now`:** 'This plan is dated today, ⟨Tuesday 29/09⟩. The next working day is ⟨Wednesday 30/09⟩.' plus the button.
4. **`date < now`:** '⟨Monday 28/09⟩ has passed. The next working day is ⟨…⟩.' plus the button.
5. **Anything else:** '⟨Saturday 03/10⟩ is not the next working day, ⟨Monday 05/10⟩.' plus the button. That covers a later date, or a weekend date seen on a Friday or Saturday open.

**Set to tomorrow** is `data-act="set-tomorrow"`, with `title="Set the date to ⟨Monday 05/10⟩"`. It:
- sets `state.date = nextWorkingDay()`;
- drops Keep and re-raises the template offer quietly;
- falls through to the guarded save and `render()`.

From the keyboard it sets `refocus = '#date'`.

**Styling:** `.date-line` and `.date-line.off` for the warning, on pack 3's tokens. It never uses `.warn`, which smoke and screens match as `tr.warn`.

**Redraws that don't call `render()`:**
- The input handler's last branch (`:1176`), when `kind === 'meta' && name === 'date'`.
- The window's `focus`, and `visibilitychange` to visible, so a window left open overnight doesn't vouch for yesterday's "tomorrow".

### E. Template offers, the week row and the wording

- **The offer:** `offerTodaysTemplate` (`:1613-1623`) becomes `offerPlanDayTemplate({ quiet })`, keyed on `planWeekday()`.
  - Its text: 'This plan is for ⟨Monday 05/10⟩. Your ⟨X⟩ template is set for Mondays…'.
  - The offer carries `day: true`, and a re-raise first removes any notice whose `offer.day` is set.
  - `quiet` saves and restores `offerRaised`. At boot it is raised as today.
- **The template shelf:**
  - The select's title (`:776`) becomes 'Offer this template when the plan is for that day'.
  - The hint (`:792`) becomes 'A template can offer itself when the plan is for its day…'.
- **The week row:** `dayBar` underlines `planWeekday()` (`:617`, `:626-627`). The `.day.today` class name stays until pack 5 deletes the row.
- **The rail's wording:** the exact strings in the Decisions table.
- **Weekend templates:** offered only for a plan dated that weekend day.
- **Docs:** README `:22-23` and INVENTORY `:17-18` drop "today" and "when you open the app on its day".

### F. Saving

- Nothing is written to `carcoord:v1` at boot (container rule).
- **The guard:** `before = JSON.stringify(state)` at the head of the click switch. At `:1895`: `if (JSON.stringify(state) !== before) save();`, and `render()` still runs. The same guard goes on the drop (`:1987`) and the picker (`:2166`).
- **Acts that return early** before the shared save are unaffected: `tab`, `tag`, `day-missing` and others.
- **The input handler** always saves, because an `input` event means a change.
- **Things that carry the screen's date**, as they carry everything on screen:
  - Export (`store.js:470`);
  - share codes (`share.js:51`);
  - a Reconnect with no marker (`store.js:421`).

### G. `dailySnapshot` (`store.js:233-237`)

- **"Today"** is the local `YYYY-MM-DD`, no longer `toISOString().slice(0, 10)`.
- **Each backup** is compared by the local day of `new Date(String(b.t))`. An invalid `t` matches nothing.
- **What stays the same:** the stored `t` is unchanged, and `when()` (`app.js:944-950`) already shows it in local time.

### H. Tests

**The calendar context:** `browser.newContext({ timezoneId: 'Europe/Oslo' })`.
- Each case sets `page.clock.setFixedTime('…+02:00')` before `goto`. A case that writes several backups uses `page.clock.install({ time })` instead, so their `t` values differ.
- Each case first asserts that the page's `today()` equals the fixed instant's local date. That proves the clock was set before `start()` ran.
- Each fixture seeds `carcoord:pref:seenUpdate = APP_VERSION`, except the case that checks Keep comes before `.notice.update`.
- The context has its own `console` / `pageerror` listeners, and a closing "no console errors" check.

**Covered dates:**
- every weekday;
- 2026-10-24 and 2026-10-25, around the clocks going back;
- 2026-03-27 and 2026-03-29, around the clocks going forward;
- month and year ends.

UTC-versus-local bugs then show on CI, which runs in UTC.

**Existing fixtures** that aren't about dates use `PLAN_DAY = await page.evaluate(() => nextWorkingDay())`.

**Save-file cases:**
- Recovery at open is driven by hand: `state = await Store.recoverFromFile(defaults); moveDateOnOpen(); render();`, as case 13 drives start-up (`smoke.mjs:2204`).
- The forced throw serves `app.js` through `context.route` with a `throw` injected at the top of `moveDateOnOpen`.

### I. Unchanged on purpose

- `samePlan` / `reconcile` (`store.js:429-439`, `:552-559`).
- `share.js`.
- `normalise`'s date check.
- The inline d/m/y formatting (`app.js:971-972`, `:1106-1111`, `:1334`, `:1343`), the raw ISO date at `:1387`, and the sheet's `today()` fallback (`:1088`).

## Items

- [x] **1. One next-working-day helper, used by new plans and Clear the day.** Design A:
  - the five helpers;
  - `defaults()` (`:92`) and Clear the day (`:1729`) switch to `nextWorkingDay()`;
  - the calendar context in `smoke.mjs`, per Design H.

  *Done when:* a first run and Clear the day both date the plan for the next working day, and the helper is right at every calendar edge. In the calendar context:
  - Monday 2026-09-28 gives 29/09. Friday 10-02, Saturday 10-03 and Sunday 10-04 all give Monday 10-05.
  - Saturday 2026-10-24T23:30+02:00 and Sunday 2026-10-25T00:30+02:00 (clocks go back) both give 10-26.
  - Friday 2026-03-27 gives Monday 03-30, across the clocks going forward.
  - 2026-10-30 gives 11-02, 2026-12-31 gives 2027-01-01, and 2027-12-31 gives 2028-01-03.
  - `parseDay` rejects 2026-13-45, 2026-02-30, 0020-01-01, '' and 'x'.
  - A Friday first run and a Friday Clear the day both date the plan Monday.
- [x] **2. The Start of day backup counts days by the local date.** Design G.

  *Done when:* a Start of day backup is taken once per local day, whatever the UTC date. In the calendar context at 2026-09-29T00:30+02:00 (still 09-28 in UTC):
  - a Start of day backup from 2026-09-28T23:30+02:00 leads to a new one;
  - one from 2026-09-29T00:10+02:00 does not;
  - each seeded backup's JSON differs from the plan being opened (`store.js:218`);
  - the stored `t` values are still ISO strings;
  - pack 1's Backups and Archives cases pass unchanged.
- [x] **3. A date line under the Date field, with Set to tomorrow.** Design D:
  - `#dateLine` after the Date bar, with its five ordered cases;
  - the `set-tomorrow` act;
  - the redraws from the input handler (`:1176`), `focus` and `visibilitychange`.

  *Done when:* under its Date, the Day plan says whether the plan is for the next working day. When it isn't, the line warns and offers Set to tomorrow, without blocking anything or disturbing typing. In the calendar context:
  - each of the five cases shows its text;
  - a Friday 2026-10-02 open of a plan dated 10-03, and a Saturday 10-03 open of one dated 10-04, both warn and offer the button;
  - '2026-13-45' and '' warn and throw nothing;
  - typing a date keeps the focus in `#date`, updates the line and adds no console errors;
  - Set to tomorrow sets and saves the date, and from the keyboard the focus lands on `#date`;
  - `problems()`, the `.problems` box and `tr.warn` are unchanged, and screens still flags exactly 4 rows;
  - after the fixed time moves a day forward, a `visibilitychange` redraws the line;
  - the warning fits at 390px with no sideways scroll.
- [x] **4. Template offers and the week row follow the plan's date.** Design E:
  - `offerPlanDayTemplate` with its `day` flag, re-raised after Set to tomorrow and Clear the day;
  - `dayBar` on `planWeekday()`;
  - the rail's strings, the shelf's title and hint, and README `:22-23` / INVENTORY `:17-18`;
  - smoke `:1068-1121` and `:1360` rewritten to read the plan's weekday from the page.

  *Done when:* a template offers itself for the plan's weekday, not the calendar's, and the week row underlines the plan's day. In the calendar context:
  - On Friday 2026-10-02, with the plan dated Monday 10-05, the Monday template is offered and the Friday one is not.
  - Set to tomorrow on a plan dated Wednesday switches the offer to Monday's, and only one offer stays on screen.
  - Typing a date leaves `#notices` untouched.
  - A date that isn't a real day offers nothing.
  - `.day.today` sits on the plan's weekday.
  - No string in the rail says "today".
  - The rewritten checks pass whatever weekday the host runs on.
- [x] **5. ⚠️ Clicks that change nothing save nothing.** Design F: the before/after guard on the click switch's shared `save()` (`app.js:1895`), the drop (`:1987`) and the picker (`:2166`). The new case runs in the save-file context after case 16 (`smoke.mjs:2236-2244`), with the stand-in linked and allowed.

  *Done when:* a press that changes nothing leaves `carcoord:v1` byte-identical and the stand-in's write count unchanged. Each still shows what it showed before: the question, the `dayAsk` redraw, the offers dropped. That covers:
  - `ask-template`;
  - `up` on the first row and `down` on the last;
  - `save-day-crew` refused, and with an invalid day;
  - `add-day-group` for a day that has a crew;
  - `split-rounds` with nothing to split;
  - All when everyone is in;
  - the lit day;
  - `set-tag` / `setLabel` to the current label;
  - `add-car` / `add-driver` with only duplicates;
  - picking the car already chosen.

  A press that changes something still saves both: `toggle`, `add-route`, and `apply-group` onto a different crew. The full suite passes.
  **Risky — review individually.** It changes the save path of every act in the switch.
- [ ] **6. The existing checks stop depending on the calendar.** Every `carcoord:v1` fixture in `smoke.mjs` that isn't about dates is dated `PLAN_DAY`. That covers:
  - the main page `:287`–`:922`;
  - PC B `:615`;
  - the phone `:1788`;
  - the week and picker fixtures `:1262`, `:1343`, `:1395`, `:1917`.

  `:603`, `:624` and `:642` compare against `PLAN_DAY`, in ISO and d/m/y form. `:1033` compares the date before and after. Cases added by packs 1–3 are re-grepped. `dev-data.json` stays at 2026-09-28 on purpose. Every fixture date has already passed, so without this, notice counts and single-notice locators break as soon as the move lands. Doing it first leaves item 7's smoke diff as new cases only.

  *Done when:* `grep -n "date: '20" scripts/smoke.mjs` lists only these:
  - `:333` (schemaVersion 99, kept);
  - `:1888` (a backup's JSON, not `carcoord:v1`);
  - `:2239` (the stand-in's file text);
  - the calendar context's own cases.

  `:275`'s 'not-a-date' is untouched. `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car` prints "all checks passed".
- [ ] **7. ⚠️ Move a passed date on open, in memory, with Keep.** Design B and C:
  - `moveDateOnOpen()` at step 6, in its own try/catch;
  - `dateMove` with `saved` and `inFile`;
  - `Store.saveFile`;
  - the Keep notice, its pruning and its `dropOffers` exception;
  - `keep-date` on its own return path;
  - the explicit drop in Clear the day and Set to tomorrow.

  *Done when:* opening a plan whose date has passed shows it dated the next working day, with Keep. Nothing is written to this browser or the save file at open. In the calendar context:
  - **The move:**
    - A Tuesday 2026-09-29 open of a Monday plan shows 09-30, with `carcoord:v1` byte-identical after the load and after a reload. The reload moves the date and offers Keep again.
    - Friday, Saturday and Sunday opens of a Thursday plan show Monday.
  - **No move:**
    - A plan dated today is not moved, and its line warns.
    - A plan dated the next working day raises no notice.
    - 2026-13-45 is not moved.
    - An unreadable save and a first run get no Keep.
  - **A newer-version save:** it is moved in memory and its warning stays. `carcoord:v1` is byte-identical, and Keep writes nothing.
  - **A plan recovered from the save file** (by hand, Design H) is moved, with `carcoord:v1` still absent and 0 writes to the stand-in.
  - **Keep:**
    - Before any change: the old date is back and `carcoord:v1` is byte-identical.
    - After a real change: the old date is back and saved.
    - After Import, Restore, `share-apply`, a typed date or pack 1's `archive-restore` of a past-dated archive: Keep has gone, and a `keep-date` dispatched anyway changes nothing. After the restore, the restored date is not moved and the line warns.
    - After Clear the day, or Set to tomorrow: no Keep remains, and a `keep-date` dispatched anyway changes nothing.
    - It survives `askTemplate`, `load-template` and `split-rounds`, and it re-offers the template for the old weekday.
  - **The save file:**
    - After a move, **Reconnect with no marker**, then Keep: `carcoord:v1` is byte-identical and the stand-in file holds the old date.
    - The same after **Choose save file…** onto an empty file.
    - A Reconnect with the marker set, and Choose save file… onto a file holding this plan, both ask. The question shows both dates, and either answer puts the replaced copy in Backups.
  - **Ordering:**
    - The file-hold offer and the spot-split question are still scrolled into view.
    - Keep comes before `.notice.update`.
    - The Start of day backup holds the unmoved date.
  - **A forced throw in `moveDateOnOpen`:**
    - `state.date` equals the saved date and no Keep is shown.
    - The offers, the update note, `render()` and the share link still run.
    - Only a `console.warn` is logged.
  - The Keep notice fits at 390px.

  **Risky — review individually.** It changes every returning leader's first screen of the day, and sits in the boot order beside 0.2.5's save-file guard.
- [ ] **8. The upgrade check knows the date moves.** `scripts/upgrade.mjs` (pack 1 item 11):
  - **Scenario (a):** expects `state.date` in memory to be the next working day, Keep before `.notice.update`, and `carcoord:v1` byte-identical. Its reload counts `.notice.update` only, because Keep comes back.
  - **Scenario (d):** expects the linked file untouched at open.
  - **The clock:** every scenario runs `timezoneId: 'Europe/Oslo'`, with the clock installed at Tuesday 2026-10-06T12:00+02:00 in both builds. The local date and the UTC date then agree, and the seeded `t` values are re-checked to match.

  *Done when:* `npm run upgrade` passes from `v0.2.4` and from the previous `dev` build. It fails its expectations when `moveDateOnOpen` is tried with a `save()` added (tried, not committed).
- [ ] **9. Screenshots of the Keep notice and the date line.** `scripts/screens.mjs` gets three shots on a page of its own, after the PDF (`:216`), with `seenUpdate` seeded:
  - a past-dated plan opened, with its Keep notice;
  - the warning line with Set to tomorrow;
  - the quiet line.

  *Done when:* `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens` writes them with no console errors, and still flags exactly 4 rows.
- [ ] **10. Announce Plan for tomorrow and cut 0.6.0.** Pack 1's Design H, in one commit:
  - a new entry at the top of `docs/updates.js`, `must: true`, following rule G;
  - the six version places set to 0.6.0;
  - the `?v=` tags following `APP_VERSION`.

  Draft entry. Each field is checked against rule G and is at most 25 words:
  - **title:** `The day plan is for the next working day`
  - **changed:** `Opening the app moves a passed date to the next working day; Keep puts it back. Clear uses that day. Any other date shows a warning.`
  - **affects:** `Day plan and template offers. Printed sheets and share codes carry the new date. On a copy not yet updated, set the date by hand.`
  - **data:** `Opening the app leaves your saved plan as it was. Your next change saves the new date. An older copy shows the date as saved.`
  - **must:** `true`

  *Done when:*
  - `versions.mjs` passes at 0.6.0 and `scripts/check.sh` is OK;
  - `updates.js` has the new entry first with `must: true`;
  - the walkthrough re-reads the entry against what shipped, beside 0.3.0 and 0.2.5, and finds no contradiction.

## Owner questions

**Answered by the owner, 2026-09-29.** A window left open overnight is **not** moved. The line under the Date warns and offers Set to tomorrow. The date moves by itself only when the app is opened.

**1. A window left open overnight.** You decided the date moves when the app is opened. A window left open overnight, in the Windows app or a browser tab, therefore keeps yesterday's date. When you come back to it, the line under the Date warns and offers Set to tomorrow. Should coming back to such a window also move the date, with the same Keep button? *My recommendation: no, keep the move to opening the app. A date changing under a window you're looking at is more surprising than a warning beside it.*

## Out of scope

- Public holidays. Monday to Friday was decided, so a holiday is not skipped.
- Reworking the Mon–Sun row in the Drivers panel. Pack 5 removes it; this pack changes one line and its wording.
- The Drivers tab's "today" wording, which pack 7 owns under this pack's rule:
  - the rows `:835`, header `:846` and hint `:840`;
  - the day groups `:868`, `:875`;
  - the notice `:1867`.
- Moving the date while the app stays open past midnight, pending owner question 1. The line redraws when you come back either way.
- Remembering a kept date between opens. The container's rule moves every passed date.
- Making `samePlan` ignore the date, or adding an "only the date differs" line to the save-file question. Either would touch 0.2.5's data-loss guard, which already errs toward asking.
- Tightening `normalise` to reject dates that aren't real days (`store.js:137`). The date line covers them on screen.
- The Date field saving on every keystroke inside a date, such as '0002-…' (`app.js:1166`, `:1172`). This predates the pack.
- A shared formatter for the existing d/m/y spots (`app.js:971-972`, `:1106-1111`, `:1334`, `:1343`), and the raw ISO date in the share-apply note (`:1387`).
- The sheet's fallback to `today()` when the date is empty (`app.js:1088`).
- Planning on Saturday or Sunday.
- Breadify.

## Gates

- **Item gate:** `scripts/check.sh` (with pack 1's `versions.mjs`), plus `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car` whenever logic is touched (items 1–8).
- **Pack gate:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`;
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens`;
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm run upgrade -- ⟨dir⟩` from the previous `dev` build, and from `v0.2.4` as item 8 requires.

  Say that the suite ran on system Chrome.
- **Review:** items 5 and 7 individually, plus one pass for the rest.
- **Browser walkthrough before the PR into `dev`:**
  1. Import `scripts/fixtures/dev-data.json`, dated 2026-09-28 and so already passed, and reload. The date shows the next working day, and Keep sits above any update note. In DevTools, `carcoord:v1` still says 2026-09-28.
  2. Press Keep: the old date is back, the line warns, and `carcoord:v1` is unchanged. Reload: the date moves again, and Keep is offered.
  3. Change one thing: `carcoord:v1` now holds the moved date. Press Keep: the old date is saved.
  4. With a save file linked, after a move, press Reconnect and then Keep. The file holds the old date.
  5. Type a date: the line follows and the focus stays. Press Set to tomorrow. A template set for the plan's weekday offers itself, and Set to tomorrow switches the offer.
  6. At 390px, the line and the Keep notice fit. The print preview shows the moved date and its weekday.
  7. Read the 0.6.0 entry in What's new beside 0.3.0 and 0.2.5. No sentence contradicts another, and each claim matches what shipped.
- **At pack close:**
  - INVENTORY gains `✅ Plan for tomorrow` under Day plan, and loses the 💭 line.
  - The container's status line is updated.
  - The container's "Found while planning" gains two notes:
    - the no-op-save finding, fixed here by item 5;
    - that after a move, the save-file question can come from the date alone.

## Ledger

- **2026-09-30, start (combined pack, part 4).** Built on `review-round`, base 2088fb9 (0.5.0). Line numbers are re-found by symbol. The start notes are in: INVENTORY's 💭 line is a 🚧 pointer under Day plan; the container's pack 7 section, the context-menus manifest and the tour manifest each carry one line on this pack's wording and `#dateLine`. **Confirmed:** pack 1's `archive-restore` installs a new state object (`state = next` from `Store.parseImport`), so Keep's staleness check catches it. **Batched rule:** items are gated by `check.sh` only; their smoke cases, screens and the one upgrade check (from v0.2.4) run at the end of part 9. Item 8's run "from the previous dev build" is dropped by that rule.
- Item 1 done, 91140b7. Design A's five helpers beside `today()`, plus `pad2` and `dayString`; `planWeekday()` is `parseDay(state.date)?.getDay() ?? -1`. `defaults()` and Clear the day use `nextWorkingDay()`. Smoke: the calendar context (`calCtx`, Europe/Oslo, `calOpen(instant, items)` asserting the page's `today()` first) with the edge table and the Friday first run and Clear the day; later items add their cases before its "the calendar: done" line. Gate: `check.sh` OK.
- Item 2 done, d4327d5. Design G: a local `localDay()` formatter in `store.js`; an invalid `t` gives '' and matches nothing. Smoke: two calendar cases at 2026-09-29T00:30+02:00 (a Start of day backup from 23:30 the evening before leads to a new one; one from 00:10 does not), with every `t` still ISO. `calOpen` now takes '@V' for this build's version. Gate: `check.sh` OK.
- Item 3 done, 9dffb1d. Design D. **Styling deviation:** the warning is `--ink` text with a `--caution` left edge rather than caution-coloured text, because caution on the page's concrete is near 4.5:1 in light; the quiet line is `--muted`. `set-tomorrow` falls through to the shared save and render; Keep and the template re-offer join it in items 4 and 7. Redraws: the input handler's last branch for the Date, window `focus`, and `visibilitychange` to visible. Smoke: the calendar cases for all five texts (typed, so they hold once item 7 moves passed dates at open), the Friday/Saturday weekend opens, '2026-13-45', focus kept while typing, Set to tomorrow by mouse and key, the next-day redraw and 390px. Gate: `check.sh` OK.
- Item 4 done, 5a54f6d. Design E. `offerTodaysTemplate` is now `offerPlanDayTemplate({ quiet })`; its offer carries `day: true`, and a re-raise first drops any offer with `day` set. Re-raised quietly by Set to tomorrow and Clear the day. The rail's strings follow the wording rule; the Drivers tab's own "today" strings (the In today toggle, its hint, Use for today, the applied-group notice) are left for part 7, as planned. Smoke: the weekday-offer checks read `planWeekday()` from the page, and "the plan's day is marked" reads it too; the dark block now dates its fixture `nextWorkingDay()` and names its crew for that weekday, so `.day.today` is still the lit one. New calendar cases: a Friday open of a Monday plan offers only Monday's template; the week row marks Mon; no "today" in the rail; typing a date leaves `#notices` alone; Set to tomorrow switches Wednesday's offer to Monday's with one offer left; '2026-13-45' offers nothing. Gate: `check.sh` OK.
- Item 5 done, 2c73957. **Awaiting individual review** (in the combined review). Design F: `before = JSON.stringify(state)` right after `refocus`, and the shared save runs only when the plan differs; the drop compares the whole plan, the picker the one field it sets. The smoke case runs in a context of its own rather than after save-file case 16, with the stand-in linked and granted: Up on the first row, Down on the last, All with everyone in, the lit day, the current tag, the current label chip, a duplicate car, the car already picked, and ask-template (whose question still shows) save nothing; Mark, Add route and another crew still save to both. `save-day-crew` refused, `add-day-group` for a day with a crew and `split-rounds` with nothing to split are covered by the same guard but have no case of their own. Gate: `check.sh` OK.
