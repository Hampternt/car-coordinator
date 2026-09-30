# Pack: Right-click menus: the actions for the thing under the pointer

**Status:** 🚧 building, since 2026-09-30, as part 8 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and the owner question approved (item 5 stays).
**Date:** 2026-09-28
**Branch:** cut when execution starts: `context-menus`, from `dev`, after pack 7 has merged into `dev`, and merged back into `dev` through a PR (the container's Branch line).

## Goal

Right-click a route, a driver, a car, a position, a label or a template. A short menu opens beside the pointer with what you can do to that one thing: mark it, add a gap, insert a route above or below, take a car off a route, jump to its tab, or delete it.

- Delete and the other destructive entries still ask twice and still take a backup.
- Text boxes keep the browser's own Cut, Copy and Paste menu.
- Everything a menu does can still be done with the buttons.
- The keyboard gets the same menus with Shift+F10 or the Menu key.
- Saved data keeps its shape.

## Agent brief

Read first, in this order:
- This manifest. Then the container, `manifests/2026-09-28-review-round.md`: Packs → **8. Right-click menus**, Rules every pack follows → **Releasing a pack**, and **Gates**.
- `docs/app.js`. The anchors below are against `dev-test-data` at 28c96b5. Re-verify them at start, because packs 1-7 will have moved them.
  - The dispatcher: 1564-1816. The ITEM_ACTS guard is at 1583, save/render/refocus at 1813-1815, and `ITEM_ACTS` itself at 2225.
  - `confirmTwice` (1163-1180) and `renderKeepingFocus` (1186-1220). This pack must not weaken the arm and focus rules in them.
  - The model to copy is the tag menu: 362-458, with its keys at 2143-2162. Also `besideAnchor` (2025-2039) and `clearOfBar` (2265-2270).
  - Rows: route 678-690, `railRow` 462-478, Drivers 832-836, Cars 892-897, Positions 912-917, Labels 929-932, template 772-783.
  - What uses an item: `usage()` 163-180, `driverUsage()` 508-515, `dash`/`routeNames` 285-287.
  - `saveTemplate` (800-818) is where item 12's helper comes from.
- `docs/style.css`:
  - colour tokens: 1-13;
  - models for the menu layer: `.tag-menu` (182-183) and `#picker` (271-277);
  - print hide: 346;
  - breakpoints: 299-306 and 353-361.
- `scripts/smoke.mjs`:
  - separate browser contexts: 608, 666, 1812;
  - byte-identical check: 450-453;
  - `cutOff`: 1249-1260;
  - no-fixed check: 1845.
- `scripts/fixtures/dev-data.json`: 20 drivers, 17 cars, 15 routes, 2 templates, and a Garage with Many cars.

**Reuse:**
- `actBtn` (app.js:130-131). The dispatcher runs every entry as it is.
- `del`'s confirm and snapshot (1623-1642).
- `newRoute` (84-86).
- `note()` (1418).
- `Store.snapshot` (store.js:210).

**Dependencies:** this runs as pack 8, after pack 7 merges (the container's pack order). It uses:
- pack 1's update note and version constant;
- pack 2's label tick;
- pack 3's colour tokens;
- pack 4's "today" wording: the rail entries read "Set away" / "Bring back in", never "today" (`manifests/2026-09-29-plan-for-tomorrow.md`, Decisions);
- pack 5's template position;
- pack 7's Drivers-tab row.

**No worktree.** Packs run one at a time, and every item writes `docs/app.js` (the container's one-pack-at-a-time rule).

<details>
<summary><b>How the menu works</b> (the mechanism, for the implementer)</summary>

**Markup and style**
- `<div id="ctxMenu" class="ctx-menu" role="menu" tabindex="-1" hidden>` goes after `#tagMenu` (docs/index.html:59). It sits outside `<main>` because render() rewrites `<main>` (app.js:1102).
- `.ctx-menu` is its own class. It must not be `.tag-menu`, because the dispatcher's outside-click test matches that class (app.js:1569).
- It is `position: absolute`, never fixed (smoke.mjs:1845).
- z-index 8. The top bar is 5; `#picker` and `#tagMenu` are 7 (style.css:27, 182, 272).
- Width `min(280px, 100vw - 16px)`, with `overscroll-behavior: contain`.
- `.ctx-menu[hidden] { display: none; }`, as at style.css:183 and 277.
- Colours come from the `:root` tokens (style.css:1-13).
- Rows are at least 40px tall under `@media (pointer: coarse)`.
- `:hover` and `:focus-visible` look the same (style.css:23).
- It joins the print hide rule (style.css:346).

**State**
- `let ctx = null` holds `{ kind, id, surface, part, tab, x, y, keyboard, room }`.
  - It is a gesture kept off `state`, like tagFor (app.js:363).
  - Opening and closing never call save().
- `let ctxReturn = null` holds where focus goes back to, as a descriptor, never an element.
  - The descriptor is an id, or the control's data-* attributes within its tab, as renderKeepingFocus finds things (1196-1198).
  - It is set only for keyboard opens.

**Drawing: renderCtxMenu()**
- Called in render() right after renderTagMenu() (app.js:1106).
- Rebuilds its entries from state on every call, so these are always current:
  - toggle words;
  - "Sure?";
  - disabled entries;
  - cost lines.
- Hides and empties itself when ctx is null, when the item is gone, or when `tab` has changed (as at 406-415). Emptying it means no unscoped `[data-act]` lookup elsewhere ever finds a second match.
- Puts its own focus back by the focused entry's data-*, as renderTagMenu does (416-434).
- `#ctxMenu` joins renderKeepingFocus's area list (1188) and its `own` list (1191). Without that, a plain render() drops a keyboard user's focus. The save file's write is one such render(): it ends in onChange (store.js:309, 410; app.js:2274).
- Keeps its left and top from the open.
  - Placement at open uses besideAnchor (2025-2039).
  - A mouse open anchors to a zero-size rect at the pointer; any other open anchors to `e.target`'s rect.
  - left/top get scrollX/scrollY added, as placeTagMenu does (453-457).
  - maxHeight is the room on the side it opened on.
  - It never flips after opening.

**Entries**
- Each entry is a `<button role="menuitem">` made with actBtn. It carries the same data-act/kind/id/field as the control on the page, so the dispatcher runs it unchanged. The tag menu's choices already work this way (380, 1607).
- A header names the item, with `role="none"` and `aria-hidden="true"`. The menu's aria-label reads "Actions for Route 7". Groups are divided by `role="separator"`.
- Destructive entries:
  - carry `data-arm="<confirmTwice key>"`;
  - have two lines, the act and its cost;
  - while `armed` equals that key, the first line reads "Sure? Click again" and the entry gets class `armed`, so the held-Enter guard covers it (2136-2138).
- Disabled entries get `aria-disabled` and carry no data-act at all.
- Go to entries carry their target in `data-go-tab/-kind/-id/-field`, never in data-kind/id/field. That way an unscoped field lookup (1157) can never match a menu entry.

**Opening: one document `contextmenu` listener**
- It finds the row with closest(), trying these in order:
  1. `#tab-plan tr[data-route]` (678);
  2. `#tab-plan .rail-row` (466);
  3. `#tab-drivers tbody tr`, `#tab-cars tbody tr`, `#tab-positions tbody tr` and `#tab-labels tbody tr` (832, 892, 912, 929);
  4. `#tab-plan .tpl` (772).
- The item is the one the row's ✕ deletes: `[data-act="del"][data-kind][data-id]` (135, 476, 780). No row markup changes.
- The part is a route row's carId or positionId select (681-682).
- The browser's menu stays (no preventDefault) when:
  - Shift is held;
  - `#shareDlg` is open (1328);
  - the target is a textarea or a link;
  - the target is any input except checkbox, radio, button, submit, reset and range;
  - a non-collapsed text selection lies inside the row;
  - no row matched.
- A right-click inside `#ctxMenu` is prevented and does nothing.
- Otherwise the listener:
  1. calls preventDefault;
  2. calls `closePicker()` (1935) and `closeTagMenu()` (398). A right-click fires neither a click nor a left mousedown, so their own closes (1569, 2059) never run;
  3. for a keyboard open, calls `clearOfBar(e.target)` (2265);
  4. sets ctx;
  5. draws only the layer, not render(), which would steal a caret (396-397);
  6. places it;
  7. focuses per the start rule in Decisions.
- A second right-click moves the one menu; it never opens a second.

**Keys** (modelled on 2143-2162)
- Handled while focus is in the menu or on the page body. The body case is there because a mouse arm lets go of focus (1174); 2146 handles body the same way.
- ArrowUp and ArrowDown wrap over enabled entries; Home and End go to the ends.
- Enter or Space activates an entry, as a click with detail 0.
- While the menu is open, Space on the menu itself or on body, and PageUp or PageDown anywhere, never scroll the page.
- Escape and Tab:
  1. if `armed` matches an entry's data-arm, set it to null and call renderKeepingFocus();
  2. close;
  3. hand focus back per the rule in Decisions.

**Closing**
- A click listener on `#ctxMenu` itself runs before the document dispatcher.
  - On an enabled entry it clears ctx, except on the first click of an arming entry (data-arm !== armed).
  - It records whether the click came from the keyboard (detail 0).
  - It has to run first, because tag (1597-1606), peek-template (1683-1686) and go all return before 1813-1815.
- A click listener registered after the dispatcher hands focus back only when all of these hold:
  - this click closed the menu;
  - the click came from the keyboard;
  - the menu was opened from the keyboard;
  - activeElement is body or detached;
  - the target is not `.armed`.
- These close it through closeCtxMenu(), which redraws the layer only, as closeTagMenu does (398-404), so the click that closed it still lands:
  - a pointerdown outside `#ctxMenu` with any button (capture);
  - a wheel, unless the menu overflows and the wheel is over it;
  - resize;
  - window blur;
  - dragstart (1836).
- renderCtxMenu closes it on a tab change or when the item is gone.
- It never closes on `scroll` (see Decisions).

</details>

## Decisions taken

| Decision | Choice |
|---|---|
| Where the page's menu opens | On item rows only: route rows, rail rows, the rows of the Drivers, Cars, Positions and Labels tabs, and template cards. Everywhere else keeps the browser's menu. |
| Day group cards | No menu. Its two entries would repeat the card's own "Use for today" and ✕ (app.js:868-869). |
| Text boxes and Shift | Text boxes always get the browser's menu (Cut, Copy, Paste), rail names included (app.js:470). So does Shift+right-click, everywhere. The rail row keeps its grip, dot, badge and buttons as right-click targets: the name is 131 of 296px at 1366px wide (measured in planning). The rule names the inputs that open the page's menu (checkbox, radio, button, range), so any new kind of box is native by default. |
| Windows app | No change to Rust or config. WebView2's menus stay on (wry-0.57.0 src/lib.rs:1769, src/webview2/mod.rs:638). The page's menu replaces them only where it opens, so text boxes keep WebView2's edit menu. One code path serves the web and the exe (HANDOFF.md:24). |
| Touch | No custom long-press. Android's long-press should open the same menu; this is unverified and is a hand check. iOS gets no menu. Every entry also has a button, drag or tab path (app.js:353-356). |
| Mouse or keyboard | `e.button === 2` is a mouse open, placed at the pointer. Anything else is placed against `e.target`, which for a keyboard is the focused control. Measured in planning (headless Chrome, /usr/bin/google-chrome): Shift+F10 and the Menu key give button -1 and no Shift. So there is no keydown fallback and no timing test. |
| Where focus starts | A keyboard open focuses the first entry that is not destructive, or the menu itself if there is none. A mouse open focuses the menu itself. Hovering focuses an entry, but never a destructive one. So no key pressed after a right-click can arm or confirm anything (app.js:1166-1168). |
| Where focus goes back | Only after a keyboard close of a keyboard open, to the control it opened from. Never after a mouse open, never onto an armed button, never when the act placed focus itself. The critiques split here: one wanted a mouse open to restore the focus from before the press, the other wanted nothing restored. Chose nothing, because a right mousedown focuses the ✕ it lands on (measured). |
| Escape and Tab | Both disarm a delete that is armed in the open menu, then close. The critiques split here too: one disarmed on Escape only. Both disarm, because Tab can also hand focus to the row's ✕. A mouse close leaves the arm to its 3 s timeout (app.js:1178). |
| Shared arm with the ✕ | There is one `armed` (app.js:117). Arming Delete in the menu shows "Sure?" on the row's ✕ and the other way round. The rail's ✕ and the tabs' ✕ already share it this way (app.js:135, 476). |
| Scrolling | The menu never closes on a `scroll` event. render() puts every list's scroll back (app.js:729-735), and that fires scroll events on each arming redraw and on the 3 s disarm (1169, 1173, 1178; measured in planning). It closes on a wheel instead, unless the wheel scrolls the menu itself. Space, PageUp and PageDown never scroll the page while it is open. This is my own choice over the two options the critique offered (re-arm a timing guard, or re-place the menu on scroll): it follows what the person did, not timing. |
| Placement | Placed once, when it opens. It never moves or flips after that, so the confirming click lands where the first one did. Fixed width. A longer menu scrolls inside itself. |
| Destructive entries | Always last, after a separator, and each uses the same act, confirm key and backup as its button (del, app.js:1624, 1627). There are two new ones, `clear-route` and `resave-template`. Each shows two lines from the start: the act, and under it what it costs ("On route 7 and in 1 template"). Arming changes only the first line, so the entry never changes size. The menu never calls Store.snapshot itself. |
| What the cost line counts | Only what the act clears. A car or position: routes and templates (app.js:1629-1630, 1638-1641). A driver: day groups (1634); routes keep the typed name (1632-1633). A label: cars, positions and tagged drivers. (Pack 7 made deleting a label clear drivers too, so all three lose it at once.) |
| New acts | Four that write fields which already exist: `insert-route`, `clear-route`, `take-off` and `resave-template`, all added to ITEM_ACTS (app.js:2225). One that only moves you around: `go`. Every other entry reuses an existing act unchanged. |
| Insert route above | The new route goes directly above, and the clicked row keeps its gap. So deleting the new row later never takes a gap with it (app.js:1628). The name is left blank, because a route inserted mid-list is never "highest number + 1" (1649-1652). |
| Take off route N | One click, no confirm, no backup, like the picker's Clear and No car (app.js:2009, 2082). One route per entry, and only while that route still holds the item. From outside the Day plan it posts a note, e.g. "Took Spot 3 off route 7." (the apply-group pattern, 1784-1785). A separator keeps it apart from Go to. |
| An item on 3+ routes | One disabled line, "On 8 routes", and no per-route entries. One or two routes get an entry each. This keeps every menu at 7 entries or fewer. |
| Never in a menu | Move up and Move down: the arrows are on every row (app.js:132-134). Text boxes, choosers and sets of toggles, which are all visible in the row. load-template, split-rounds and share-apply: their question's own button is the only thing that writes (1677-1679, 1788-1789). apply-group. Copy registration. "Put on route…". Submenus. |
| Menus under 3 entries | Kept. The label row has 1 entry, and a Drivers-tab driver who is on no route has 2. A right-click that does nothing on one tab would read as broken. |
| Words | "Delete <kind>" everywhere, and the rail ✕'s title changes from "Remove <name>" to "Delete <name>" (app.js:476). "Position", never "spot" (707, 711). Toggles say what they will do: "Mark pink on the printout" / "Remove the pink mark". Route names go through dash(), so a blank name reads "Route -" (285-287). |
| Saved data | **No change of shape.** The open menu is kept off `state`, like tagFor (app.js:363), and opening or closing it never saves. Store, share.js and SCHEMA (store.js:9) are untouched. |
| Slots for earlier packs | A slot is filled only when its feature has shipped and is a single one-click act. Pack 2's label print tick goes above Delete label. Pack 7's note and days stay out. Pack 7's tag goes in only if it is not shown as chips in the row. At start, the Drivers-tab menu is redrawn against the row pack 7 shipped, and "today" follows pack 4's wording (the container's pack 4). |

## Menus

The same item gets the same entries, in the same order, on every surface. A surface drops only entries that cannot work there. Every menu starts with a header naming its item. *(sep)* marks a separator.

**Route row.** `#tab-plan tr[data-route]` (app.js:678): the car and position selects, the Mark/Gap/↑/↓/✕ cell (684-688), the warning cell (689) and the padding. The name, driver and round boxes (679, 680, 683) stay native.
1. Mark pink on the printout / Remove the pink mark: `toggle` highlight (1593), the same as Mark (685).
2. Add a blank line above / Remove the blank line above: `toggle` gapBefore, the same as Gap (686).
3. *(sep)* Insert route above: NEW `insert-route`, where=above.
4. Insert route below: NEW `insert-route`, where=below.
5. *(sep)* Clear driver, car, position and round: NEW `clear-route`. Cost: "Route 7 only. The pink mark goes too." Disabled when there is nothing to clear.
6. Delete route: `del` (1623-1628). Cost: what is on the route ("Ana, SD12345, Spot 3") or "Nothing on it yet".

**Route row, car or position select.** Right-clicking either select adds one part entry at the top, above a separator, followed by the route row's six entries.
1. Go to SD12345 on the Cars tab: NEW `go` to `#tab-cars`'s reg box (893). Only when a car is set.
2. Go to Spot 3 on the Positions tab: NEW `go` to `#tab-positions`'s name box (913). Only when a position is set.

**Rail driver row.** `.rail-row[data-drag=driver]` (466): the grip, dot, badge, ✓/↺, tag button, ✕ and the gaps. The name box (470) stays native.
1. Set away today / Bring in today: `toggle` available (532-533).
2. Tag…: `tag` (1597-1606). The menu closes and the tag menu opens at this row's tag button. Rail only, because the tag menu anchors there (393-394).
3. *(sep)* Go to route 7: NEW `go` to that route's driver box (680). One per route.
4. *(sep)* Take off route 7: NEW `take-off`, take=driver. One per route.
5. *(sep)* Delete driver: `del` (1623-1634). Cost: "Taken out of 2 day groups. Routes keep the name."

**Rail car row.** `.rail-row[data-drag=car]` (466), with the same rule for its reg box (470).
1. Tag…: `tag`. Rail only.
2. *(sep)* Go to route 7: NEW `go` to that route's car select (681).
3. Go to SD12345 on the Cars tab: NEW `go` to the reg box (893). The note and status can only be changed there (893-896).
4. *(sep)* Take off route 7: NEW `take-off`, take=carId.
5. *(sep)* Delete car: `del` (1623-1641). Cost: "On route 7 and in 1 template" or "Not used anywhere".

**Drivers tab row.** `#tab-drivers tbody tr` (832). The name box (833) stays native.
1. Set away today / Bring in today: `toggle` available (835).
2. *(sep)* Go to route 7: NEW `go`, which switches to the Day plan.
3. *(sep)* Take off route 7: NEW `take-off`, and posts a note.
4. *(sep)* Delete driver: `del`, with the same cost line as on the rail.

**Cars tab row.** `#tab-cars tbody tr` (892), including the Assigned-to badges (820-826) and the status chips (895). The reg and note boxes (893, 896) stay native.
1. Go to route 7: NEW `go`.
2. *(sep)* Take off route 7: NEW `take-off`, and posts a note.
3. *(sep)* Delete car: `del`, with the same cost line as on the rail.

**Positions tab row.** `#tab-positions tbody tr` (912), including the Many cars checkbox (914) and the chips (915). The name and note boxes (913, 916) stay native.
1. Allow many cars / Stop allowing many cars: `toggle` multi, the same value as the checkbox (914). Turning it off can bring clash warnings back; they warn and never block (321-328).
2. *(sep)* Go to route 7: NEW `go` to that route's position select (682). This is the only place that says which routes use a position (174-177).
3. *(sep)* Take off route 7: NEW `take-off`, take=positionId, and posts a note.
4. *(sep)* Delete position: `del` (1623-1641). Cost: "Used by route 7 and 2 templates".

**Labels tab row.** `#tab-labels tbody tr` (929). The name box (930) and the colour input (931) stay native.
1. Delete label: `del` (1623-1631). Cost: "3 cars, 1 position and 2 drivers have it" or "Nothing has it". Pack 2's print tick goes above it.

**Template card.** `#tab-plan .tpl` (772): the head, the name and count buttons, the weekday select (776) and the open contents table (751-768).
1. Load over the plan…: `ask-template` (1680). It raises the same question as the name button, and only that question's own Load button writes (1687-1697).
2. Show contents / Hide contents: `peek-template` (1683-1686). The words follow tplOpen (747).
3. *(sep)* Replace with the plan as it is now: NEW `resave-template`. Cost: "Its 12 routes become the plan's 14".
4. Delete template: `del`, which takes a snapshot (1627). Cost: "12 routes. The plan is not touched."

## Items

- [x] **1. Menu layer, opened with the mouse.** Build everything in "How the menu works" except the keys and focus return:
  - the markup and CSS;
  - `ctx`, renderCtxMenu() in render(), and closeCtxMenu();
  - the contextmenu listener, with its native pass-through rules;
  - placement at open, the element click listener and the close triggers.

  The first client is the route row, with only its two toggles. The smoke case also checks all of these:
  - Shift+right-click, a date box and an injected `type=time` input stay native;
  - an open picker or tag menu closes;
  - an outside pointerdown, a `page.mouse.wheel` and a tab change each close it, checked with `isHidden()`;
  - `cutOff` is empty near the bottom-right and at 390x844;
  - nothing is `position: fixed`.
      *Done when:* smoke case `context menu layer` passes: a right-click on a route's Mark cell opens a menu whose two toggles work, a right-click in that route's name box stays native, and `carcoord:v1` is byte-identical after an open and a close.
- [x] **2. Keyboard.** This item adds:
  - keyboard opens, placed against `e.target` after `clearOfBar`;
  - the menu keys;
  - the focus-start and hover rules;
  - focus return;
  - renderCtxMenu putting its own focus back;
  - `#ctxMenu` in renderKeepingFocus's two lists (app.js:1188, 1191).
      *Done when:* `menu keyboard` passes: Shift+F10 and the Menu key on a focused Mark open the menu on its first entry, the arrows wrap, Escape puts focus back on Mark, and Enter on the first entry toggles the mark with focus back on Mark.
- [x] **3. ⚠️ Delete from the menu, on route rows.** "Delete route" is `del` with `data-arm="del:<id>"`.
  - The first click arms it and the menu stays open.
  - The confirming click deletes, with del's own snapshot (app.js:1627).
  - renderCtxMenu then closes the menu, because the route is gone.

  The case also checks each of these:
  - After one mouse click, the menu is open and nothing `.armed` has focus.
  - Right-click the ✕, arm Delete with the mouse, press Space: the route is still there.
  - Shift+F10 on the ✕, then End, Enter, Escape, Enter: the route is still there.
  - A held Enter does not confirm (2136-2138).
  - With the fixture's rail list and the plan table scrolled, the first click leaves the menu open on "Sure?".
  - The entry's box still contains the first click's point after arming and after the 3 s disarm, both near the bottom-right and at 390x844.
      *Done when:* `menu delete` passes: two clicks delete the route and leave a "Deleting a route" backup that still holds it, Enter twice from a keyboard open does the same, one click and then 3.3 s changes nothing, and none of the single-key paths above deletes.
      **Risky — review individually.** It is a delete path. If focus is lost on the arming redraw, the keyboard's second press can't be made (app.js:1166-1169). A stale id must hit the ITEM_ACTS guard (1583), not `splice(-1)`.
- [x] **4. Insert route above / below.** New `insert-route` in ITEM_ACTS, with `data-where`.
  - It splices `newRoute('')` (app.js:84-86) in at i ("above") or i+1 ("below"), with gapBefore false.
  - The clicked row's gap is left alone.
  - Focus goes to the new row's name box after a mouse click too, since a name is the next thing typed.
      *Done when:* `insert route` passes: "above" puts a blank route directly above the clicked row and "below" directly under it, every existing gap stays where it was, the caret is in the new name box, and the new route has exactly newRoute's keys.
- [x] **5. ⚠️ Clear one route.** New `clear-route` in ITEM_ACTS:
  1. `confirmTwice(`clear:${id}`, e.detail === 0)`;
  2. `Store.snapshot(state, `Clearing route ${name}`)`;
  3. clear-day's row write (app.js:1646), on that route only and never the date (1647).

  The entry is disabled when all five fields are already empty. `clear:${id}` cannot collide with clear-day's `clear` key (1644).
      *Done when:* `clear route` passes: two clicks empty that route's driver, car, position, round and mark and add a "Clearing route 7" backup, while its name, its gap, the other routes and `state.date` are untouched and one click alone changes nothing.
      **Risky — review individually.** It overwrites data under a new confirm key. Every use takes one of the 12 backup slots (store.js:8, 216). It must not copy clear-day's date reset.
- [x] **6. Go to, starting on the route row's selects.** New `go` in the switch. It is not in ITEM_ACTS, and it returns before save() the way peek-template does (app.js:1683-1686). It:
  1. reads `data-go-*`;
  2. sets `tab` and calls render();
  3. focuses `#tab-<tab> [data-kind][data-id][data-field]` with preventScroll. The selector is scoped because the rail repeats those attributes (470 vs 893);
  4. calls `clearOfBar` and briefly highlights the row (a class only, nothing saved).

  Adds the two part entries.
      *Done when:* `go to` passes: right-clicking a route's car select lists "Go to <reg> on the Cars tab" first, and choosing it shows the Cars tab with that reg box focused and clear of the top bar, with the saved JSON byte-identical.
- [ ] **7. Rail driver and car menus.** Adds the driver and car builders on `.rail-row` (app.js:466), without Take off, and retitles the rail ✕ "Delete <name>" (476). The case also checks:
  - Enter on Tag… opens the tag menu without choosing a tag;
  - the car's cost line counts routes and templates;
  - a blank-named route reads "Route -";
  - a car on 3 routes shows one disabled "On 3 routes" line;
  - with the drivers list scrolled, one click on Delete driver leaves the menu open on "Sure?".
      *Done when:* `rail menus` passes: right-clicking a rail row's badge opens its menu while its name box stays native, Tag… opens the tag menu at that row's tag button with `#ctxMenu` hidden, "Set away today" flips the ✓, and "Go to route 7" puts focus in that route's driver box.
- [ ] **8. Take off route N.** New `take-off` in ITEM_ACTS, with `data-take` (driver, carId or positionId) and `data-was`.
  - It clears that field on the route named in data-id, only while that route still holds the item.
  - For a car or position that means the id matches. For a driver it means `fold(r.driver)` still equals the driver's folded name (app.js:508-515).
  - From outside `#tab-plan` it posts a note (1784-1785).
  - Its entries go into the driver and car builders.
      *Done when:* `take off` passes: "Take off route 7" on a rail car clears carId on route 7 only, a driver entry clears only the route written with that name, and an entry left open while its route changed changes nothing.
- [ ] **9. Drivers tab rows.** The driver builder, without Tag…, on `#tab-drivers tbody tr` (app.js:832). It is redrawn against the row pack 7 shipped. The item comes from the row's ✕, so no markup changes.
      *Done when:* `drivers tab menu` passes: a roster row's Set away, Go to route, Take off (with its note) and Delete all work from the Drivers tab, and a right-click on the name box stays native.
- [ ] **10. Cars, Positions and Labels tab rows.**
  - The car builder, without Tag… or the Cars-tab jump, on `#tab-cars tbody tr` (app.js:892).
  - The position builder on `#tab-positions tbody tr` (912).
  - The label builder on `#tab-labels tbody tr` (929).
      *Done when:* `tab row menus` passes: each tab's menu opens from the row's button cell and runs its entries, the position's cost line counts templates, the label's counts tagged drivers, and right-clicks on the reg, name, note and colour boxes stay native.
- [ ] **11. Template card menu.** The template builder on `#tab-plan .tpl` (app.js:772), including right-clicks in the weekday select and the open table. It offers Load over the plan…, Show/Hide contents and Delete template, and never offers load-template.
      *Done when:* `template menu` passes: "Load over the plan…" raises the same question as the name button and leaves the saved JSON byte-identical, "Show contents" opens the table, and a right-click inside the open table opens the same menu.
- [ ] **12. ⚠️ Replace a template with the plan.** First, move saveTemplate's route mapping (app.js:801-804) into a helper that both paths use. Then add `resave-template` to ITEM_ACTS. It works by id:
  1. `confirmTwice(`resave:${id}`)`;
  2. `Store.snapshot(state, `Replacing the ${name} template`)`, as at 811;
  3. the plan's routes go in, with the same id, name and weekday;
  4. `note()`.
      *Done when:* `resave template` passes: two clicks replace that template's routes with the plan's, keep its id, name and weekday and add the backup, with two templates of the same folded name the clicked one is replaced, one click alone changes nothing, and the existing save-template cases still pass.
      **Risky — review individually.** It overwrites saved data. The shared helper must not change save-template's by-name path (805-817).
- [ ] **13. Screens of the menus.** At the end of `scripts/screens.mjs`, after 11-printed-sheet (216-217), using the state that script has already built:
  1. back to the Day plan;
  2. `12-route-menu`;
  3. `13-armed-delete`;
  4. `14-rail-driver-menu`;
  5. at 390px wide, `15-phone-menu`.
      *Done when:* `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens` writes the four new captures with no console errors.
- [ ] **14. Update-note entry and version cut.**
  - This pack's entry in pack 1's update note: right-click a row for its actions; text boxes keep copy and paste; your data is untouched.
  - The version cut in the five places plus pack 1's constant (the container's Releasing a pack), with check.sh's agreement line green.
      *Done when:* the upgrade check from the previous `dev` build shows the menus entry, and the loaded state deep-equals that build's.

## Owner questions

**Answered 2026-09-28:** routes that aren't running are blanked, so item 5 (Clear one route) stays.

1. When a route isn't running tomorrow, do you blank its row or delete it?
   - Item 5 adds "Clear driver, car, position and round" to every route's menu.
   - It asks twice and takes a backup every time, because that is your snapshot-before-overwrite rule. So each use costs one of the 12 backup slots and can push "Start of day" out.
   - I've assumed you blank rows. If you usually delete them, item 5 is dropped.

## Out of scope

- **Surfaces that keep the browser's menu:**
  - the top bar, its tabs, Print and the Breadify link;
  - the date box, "+ Add route" and table headers;
  - the Clear-the-day button, whose arm and backup (app.js:1643-1645) stay the only path to a whole-day clear.
- **The problems box** (app.js:699-702). Jumping to a route named in a warning belongs on a left-click link. It would also need `problems()` to return references, which `liveSig` and the sheet read (337-341, 1086).
- **The week row, the rail's group buttons and the rail headers.** Pack 5 reshapes the week, and the only useful entries there would be new features.
- **Add boxes, `#picker` and the tag menu.** The boxes are text boxes; the other two are already choosers.
- **The Data tab and notices.** The share dialog is modal (1328). "Save this backup as a file" would be a new feature. A notice's ✕ is beside its text.
- **The print preview sheet.**
- **WebView2's own page menu** (Back, Refresh, Save as, Print) on blank areas of the exe: left as it is, because the exe is secondary and one code path covers both builds.
- **Unscheduled features:** the menus leave a slot but design nothing.
  - The label print tick (pack 2) goes in the label menu.
  - The driver tag (pack 7) goes in only if it is not shown as chips in the row.
  - Templates under the route list (pack 5): the menu is keyed by id and moves with the card.
  - Week columns (pack 5) and the parking map (pack 6): a map spot could later open the position menu.
  - Dark mode (pack 3): the menu uses the tokens.
  - Dropping the QR, the date defaulting to tomorrow, and a driver's start time: no menu entry.
- **Found in passing.** Each is worth its own item.
  - `src-tauri/tauri.conf.json:11-20` leaves `dragDropEnabled` at its default of true. Tauri says it must be false for HTML5 drag and drop on Windows (tauri-utils-2.10.0 src/config.rs:1974-1984). So the rail's drag onto a route (app.js:1836-1907) probably fails in the exe. Unverified on Windows; the fix is one line.
  - ~~Deleting a label clears cars and positions but not drivers (app.js:1631), so the next load posts a repair notice (store.js:113).~~ Fixed in pack 7, item 1.
  - "Use for today" on an empty day group sends everyone away (app.js:868, 1775).
  - Restore is keyed by list index (app.js:996, 1390-1392), so a backup taken between the two clicks restores the neighbouring entry.
  - save-template overwrites the first template with the same folded name (app.js:805), and imported template names are not deduped (store.js:91-106).

## Gates

- **Item gate:** `scripts/check.sh`, plus the item's targeted smoke case when it touches logic: `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`. That is every item except 13 and 14.
- **Pack gate:** `npm test` and `npm run screens`, plus the upgrade check (the container's Releasing a pack). The pinned Playwright Chromium is not installed here. `CHROMIUM_PATH=/usr/bin/google-chrome` works, but it means the suite has not run on the browser CI uses; say so in the report.
- **Test layout:**
  - Menu cases run in their own `browser.newContext()`, seeded from `dev-data.json` and reloaded (smoke.mjs:608, 666, 1812).
  - Backups are asserted by label and contents, not by index 0, because Store skips a snapshot identical to the newest one (store.js:214).
  - `cutOff` (smoke.mjs:1249) takes a page parameter.
  - Closes are asserted with `isHidden()`.
  - Wheels use `page.mouse.wheel`.
- **Review:** one for the pack, plus items 3, 5 and 12 individually.
- **Browser walkthrough:** every surface by mouse and by keyboard, at 1366px, under the 1180px breakpoint and at 390px. Print preview shows no menu.
- **Hand checks at install:**
  - Windows exe: Shift+F10 and the Menu key open the menu, text boxes keep WebView2's edit menu, and blank areas keep WebView2's own menu.
  - Android: a long-press on a row opens the menu.

## Ledger

- **2026-09-30, start (combined pack, part 8).** Built on `review-round`, base e6f7656 (0.9.0), so this part cuts 0.10.0. Every item is gated by `check.sh` alone under the owner's batched rule; the smoke cases are written with each item and run once, at the end of part 9, with the screens and the upgrade check from v0.2.4. **Re-read against what parts 2-7 shipped:** the line anchors above are stale and are not relied on. The rail and Drivers-tab driver entries read "Set away" / "Bring back in" (part 4's rule; the Drivers tab button reads In/Away since part 7), so item 7's done-condition is read with "Set away". Part 7 shows the driver's tag as chips on the Drivers tab, so that menu has no Tag… (as planned). Part 2's print tick is the Labels row's `onSheet` box, offered only when `Store.SCHEMA >= 5` as the row does; its entry goes above Delete label. Templates sit under the route list (`#planTemplates`, part 5); the card is still `#tab-plan .tpl`. The label-delete and Use-for-today issues listed under Found in passing are already fixed (parts 7 and 5). Day group cards, the week and the parking map stay without a menu.
- Item 1 done, b644c6b. `ctx`, `CTX_ROWS` (route only), `ctxEntry`, `CTX_MENUS`, `renderCtxMenu()` (in render() after renderTagMenu), `placeCtxMenu()` (besideAnchor once, at open; the stored left, top and room are re-applied on every redraw and never worked out again), `closeCtxMenu()`, `ctxHit()`, the document `contextmenu` listener with the native pass-throughs, the element click listener and one after the dispatcher (an act that drew nothing still hides it), and the close triggers (pointerdown capture, wheel unless scrolling the menu, resize, blur, dragstart). **Keyboard opens pass through to the browser in this item** (`e.button !== 2` returns); item 2 takes them. **Deviation:** entries are built by one `ctxEntry()` writing the same data-act/kind/id/field that `actBtn` writes, not by `actBtn` itself, so a Go to entry (item 6) carries no `data-kind`/`data-id` at all. `cutOff` takes a page parameter. Smoke `context menu layer` in its own context (`cmCtx`, the dev fixture, 1366x768), before the colour guard: toggles, name box, Shift, date box, an injected `type=time` inside the row, picker and tag menu shut, wheel, tab change by a pressless click, `cutOff` at 1366 and 390, absolute. Gate: `check.sh` OK.
- Item 2 done, 7d1cd8b. The listener now takes every `contextmenu` (not only `button === 2`): a keyboard open runs `clearOfBar(e.target)`, is placed against its rect, starts on the first entry without `data-arm` (or the menu itself), and sets `ctxReturn` (`#id`, or the tab's `section` id plus every data-* of the control). Keys, hover focus, focus return after a keyboard choice in a keyboard open (only when the focus is on body or detached and the target was not `.armed`), and `#ctxMenu` in renderKeepingFocus's area and `own` lists. Smoke `menu keyboard`: Shift+F10 and the Menu key on Mark, the arrows wrap, Home/End, Escape and Tab back to Mark, Enter toggles with the focus back on Mark, a mouse open focuses the menu, PageDown and Space do not scroll. Gate: `check.sh` OK.
- Item 3 done, 4abe7ec. **Awaiting individual review** (in the combined review). Delete route is `del` with `data-arm="del:<id>"`, last after a separator, cost from the driver, the car's reg and `spotCell` ("Nothing on it yet" when none). No new dispatcher path: a stale id stops at the ITEM_ACTS guard as the ✕ does. The arming redraw keeps the focus on the armed entry from the keyboard (renderCtxMenu's own put-back) and lets it go with the mouse (confirmTwice's blur). Items 1 and 2's smoke cases now read the first two entries and walk the enabled entries, so later items' entries do not break them. Smoke `menu delete`: two clicks and Enter twice delete with a "Deleting a route" backup holding the route; mouse arm then Space, Shift+F10/End/Enter/Escape/Enter, and a held Enter delete nothing; one click with the rail list and table scrolled stays on Sure?; the entry holds the first click's point armed and after 3.3 s at 1366 and 390, with nothing deleted. Gate: `check.sh` OK.
- Item 4 done, c4f7317. `insert-route` in the switch (before add-route) and in ITEM_ACTS: `newRoute('')` spliced in at i or i+1, and `refocus` to its name box whatever the pointer (so the after-dispatcher focus return stands aside). Smoke `insert route`: above HAU 1 (which has the gap) and below 3, the other routes and every gap unchanged, the caret in the new name box, and the new route's keys are exactly `newRoute('')`'s. Gate: `check.sh` OK.
- Item 5 done, ffd08e9. **Awaiting individual review** (in the combined review). `clear-route` in the switch and ITEM_ACTS: a route found blank meanwhile (`routeIsBlank`) redraws and returns before any confirm or backup; then `confirmTwice(`clear:${id}`, e.detail === 0)`, `Store.snapshot(state, `Clearing route ${name}`)` and clear-day's row write on that route only, never the date. Entry above Delete route in the last group; cost "Route 7 only." plus " The pink mark goes too." only when the route is marked; on a blank route it is drawn disabled ("Nothing on it to clear"). Smoke `clear route`: route 3 (marked), one click changes nothing, two empty the five fields and keep name, gap, the other routes and the date, the "Clearing route 3" backup holds Camilla and the mark; then the entry is disabled with no data-act. Gate: `check.sh` OK.
- Item 6 done, 4ce9386. `go` in the switch (after show-data), not in ITEM_ACTS, returning before save(): it checks the tab exists, sets `tab`, render(), focuses `#tab-<tab> [data-kind][data-id][data-field]` with preventScroll, `clearOfBar`, and lights the row with class `ctx-found` for 1.5 s (`--drop`, nothing saved). `ctxGo()` builds the entries with `data-go-*` only. The route menu's first group is the part entry when opened on the car or position select. Smoke `go to`: car-07's select lists "Go to <reg> on the Cars tab" first and lands in its reg box clear of the bar with the stored JSON byte-identical; the position select lands in Port 1's name box; the Mark cell has no Go to. Gate: `check.sh` OK.
