# Pack: Breadify — faster ticks, and no bread left off quietly

**Status:** 🚧 go given 2026-10-01 by the owner ("go on … breadify fixes"). All four items are committed on `worktree-agent-ace86b4469f3cdf51` and the pack gate is green (2026-10-01). Waiting on the review (2 lenses + verify) and the browser walkthrough. Not merged, not pushed, no PR.
**Date:** 2026-10-01

## The owner's words

- *"when im printing the bread and unselecting routes from the bread list it takes a long time to load after unselected a route, is this due to just allot of work being done at the same time or is this a potential bug?"*
- *"can it give a severe warning if the list does not print all the bread? … is there something at the moment that makes a bread not appear as a item on the list?"*
- On a quantity that is not a number: *"the data is printed from a db so it being written as something other than num is very unlikely but if it appears as something other than num like string then just write whatever it says"*, and *"yes it can say 3 stk just have a basic check to make sure whatever is being put instead of a num is not super long … maybe have it only able to be something like 20 characters long"*.

Web version only. Where an item departs from the Rust app's print spec, the code says so where the spec is cited, as the earlier Breadify packs did.

## What the investigation found (2026-10-01, read-only agent, measured in headless Chrome 154)

- Every tick change lays out every still-ticked route again from scratch: `tick.onchange` (app.js ~337) → `rebuild()` → `Sheet.day(chosen, …)`. About 130 ms per untick on the bread sample (16 routes, 28 sheets), about 600 ms with the CPU slowed 4×; ~1,000 forced layouts per rebuild. No leak and no growth per toggle. A per-route cache, prototyped at runtime, took it to ~35 ms (~175 ms at 4×).
- Nothing drops a line on the samples or the 29 fixtures: lines and units read equal lines and units printed, per route. But a quantity that is not a number (`"3 stk"`, `"3,5"`, blank, `#N/A`) prints as **0** through `integer()` (model.js ~84), and the only word about it is the "N line(s) ask for nothing … usually a cancelled line" warning (validate.js ~354).
- Ctrl+P prints whatever `built` holds (app.js ~414); only `rebuild()` sets it, so a file opened after the last Print step prints the previous file's sheets.
- A block or total taller than a page that cannot be split is marked `over: true` (layout.js ~708, ~1010) and nothing reads it; `overflow: hidden` on the sheet hides what spills.

## Items

Agent brief: read the repo's CLAUDE.md files, this manifest, `manifests/2026-09-29-breadify-blocks.md` (Decisions, the spec rows F- and D- the code cites), then `docs/breadify/app.js`, `layout.js`, `model.js`, `validate.js`, `sheet.css` and `scripts/breadify.mjs`. Match the code's comment voice (why, with the owner's words and dates). Depends on nothing else in flight; the car app (`docs/*.js` outside `docs/breadify/`) is not touched. The item gate is `bash scripts/check.sh`; `node scripts/breadify.mjs` (CHROMIUM_PATH=/usr/bin/google-chrome) is this pack's suite and runs at the end, once. Breadify changes do not cut a car-app version.
Agents: build 1 (medium; docs/breadify is one file set) · review 2 lenses (correctness, print) + verify (high).

- [x] **1. Faster ticks.** Keep each route's laid-out sheets in a Map by route, cleared whenever the Print step is entered (the file, the kind, the crate sizes and the Pay attention marks can only change on other steps); `rebuild()` lays out only routes it does not have, and an untick takes that route's sheets out of the preview rather than rebuilding the rest. Quick clicks gather into one update: the tick repaints at once, the preview follows after a short pause (~150 ms) with "Updating preview…" said, and Print (the button and Ctrl+P) waits while an update is pending. Done: an untick on the bread sample settles in a fraction of today's ~130 ms (measured and noted in the ledger), ten quick unticks cause one layout, and the sheets printed are byte-for-byte the sheets a full rebuild makes.
- [x] **2. A quantity that is not a number.** It prints as written, trimmed, cut to 20 characters with "…" past that, so a paragraph cannot push the line apart. For crates and the route total it counts as the whole number it starts with ("3 stk" is 3; "abc", blank or an error cell is 0). Check reports these lines as a warning (not blocking) naming route, customer and product, and the "ask for nothing" warning counts only true zeros. Done: suite cases for "3 stk", "3,5", a 200-character note, blank and `#N/A` — printed text, crate count and warnings.
- [x] **3. A new file clears the old sheets.** Opening a file, switching bread/freezer or re-checking empties `built` and the preview, so Ctrl+P can never print another file's sheets. Done: suite case — bread file, Print, open the freezer file, Ctrl+P prints no bread sheet.
- [x] **4. A severe warning when the pages do not carry every bread.** After the preview is built, for each ticked route compare the lines and units the file gives it with the rows drawn inside the paper (each row's box within its sheet and above the footer), and treat any `over: true` piece as not drawn. Any difference raises a red banner beside Print naming the route, how many lines and units, and the first missing product; Print (button and Ctrl+P) is held until "Print anyway" is pressed. Unticked routes are listed plainly ("left out on purpose: 5, 7 — 41 lines"), never as a warning. Done: no banner on either sample or any fixture; a suite case that forces a row off the paper raises it and holds Print.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/breadify.mjs`, all passed, quoted in the ledger.

## Ledger

- 2026-10-01: planned from the owner's questions and the investigation above; the owner's go, with the 20-character rule for item 2.
- 2026-10-01 · Builder started on branch `worktree-agent-ace86b4469f3cdf51`. The harness had cut it from `main` (798a4f5), so it was fast-forwarded to the dispatched base 1eadd99; `merge-base --is-ancestor` confirmed 798a4f5 is an ancestor.
- 2026-10-01 · **1 done.**
  - **How it works.** `laid` (app.js) keeps each route's sheets by nickname and is emptied in `renderPrint()`. `rebuild()` lays out every missing ticked route in one `Sheet.day` call, and `showSheets()` only removes and inserts sheets.
  - **What the user sees.** A tick shows at once. The preview follows 150 ms after the last click, and says "Updating preview…" while it waits.
  - **Printing waits for it.** `printNow()` brings a waiting update forward, for the button and for Ctrl+P, which the page now takes over with a keydown listener. `beforeprint` does the same, and so does leaving the Print step.
  - **Zoom.** The preview's zoom is measured on entry and on resize, and an inserted sheet takes the zoom already found.
  - **Timings.** Bread sample, headless Chrome 154, median of 12 unticks:

    | | 1× CPU | 4× CPU slowdown |
    |---|---|---|
    | Before: click to next rendered frame | **125 ms** | 610 ms |
    | After: click to next frame | **3.9 ms** | 15.7 ms |
    | After: the update itself, timer to next frame | **6.6 ms** | 27.8 ms |

    Settled is the 150 ms pause plus 6.6 ms.
  - **Suite.** The layout-failure case now fails the layout on entering the step, because a tick no longer lays anything out. New cases cover:
    - the immediate tick and the "Updating preview…" line;
    - ten quick unticks making one update with no layout;
    - ten re-ticks with no layout;
    - byte-for-byte sheets against a fresh entry;
    - one layout of 10 routes after re-entering the step;
    - Print and Ctrl+P waiting for the update.
  - **Gate.** All 11 cases passed in a scratch harness run of that block; the full suite runs once, at the end. check.sh OK (28 ok).
- 2026-10-01 · **2 done.** `Model.readRows` reads a quantity cell with no number (`exactNumber` null) into `quantityText`: the text as written, trimmed, cut at 20 code points plus "…". A blank is `''`, and an error cell is its code. `quantity` becomes the whole number the text starts with (`/^\d+/`, so a leading minus is not read), or 0. `fold()` carries `quantityText` onto the line, and `breadLine` prints it in `.bf-qty.bf-qty-text`. A new Check warning, kind `quantity-not-a-number`, says "N line(s) give a quantity that is not a number" and names route, customer, bread, the text and the count for the first five lines. "ask for nothing" now counts numeric zeros only. Decisions: the text keeps the number's face and slot, which grows with it as a big number's does, so no CSS change. A TRUE in the quantity column, read as 1 before, now prints "TRUE" and counts as 0 with the warning. Known edge, not handled: a freezer check line whose name already fills the line would still be pushed on by a 21-character text. The suite case uses bread names and shows nothing off the paper on either kind. Suite: on five lines of the sample's first five-line order, it checks `3 stk`, `  3,5 `, a 200-character note, a blank and `#N/A` for read values, printed text on pick and check lines, `inspected` on both, crates, packed counts and route total against the same lines given 3, 3, 0, 0, 0, the one warning naming route, customer and bread, and "ask for nothing" only for true zeros. All 21 passed in a scratch harness run. Gate: check.sh OK.
- 2026-10-01 · **3 done.** `revalidate()`, which runs on opening a file and on a bread/freezer switch, now calls `forgetSheets()`. That cancels a waiting update, empties `laid`, `built`, `#preview` and `#sheets`, and disables Print. The suite case runs on the main page before its freezer section. Bread laid out (28 sheets), then the freezer file opened from the Print step: a real `Control+p` keypress, with `window.print` stubbed to fire `beforeprint` and `afterprint`, prints `[]` with the preview empty and Print disabled. Then the freezer day laid out (21 sheets) and the kind switched to bread on Check: `Control+p` prints `[]` again. All 4 passed in a scratch harness run. Gate: check.sh OK.
- 2026-10-01 · **4 done.** In layout.js, a `WeakMap` records which order line each `breadLine` row draws, and a `WeakSet` records every `over: true` piece `paginate` places. Neither touches the printed HTML. `Sheet.coverage(route, sheets)` counts a line as drawn when its row's box lies within its sheet and above the footer (0.5 px slack) and not inside an over piece. It returns `{ lines, units, missing: { lines, units, first } }`, or null when the sheets have no size. app.js measures each newly laid-out route once, off-screen at full size, before the preview zooms it, and keeps the result in `laid`, so an untick measures nothing. Untick re-timed with this in place: update 6.4 ms (27.3 ms at 4×). A red `#shortfall` banner beside Print lists each short route ("Route 8: 7 of 13 lines (29 units) are not on the paper, starting with …"). While it shows, the Print button is disabled and Ctrl+P is held, focusing "Print anyway". "Print anyway" prints, and any tick change, step entry or new file asks again. A print from the browser's menu cannot be stopped, so a held one gets an empty `#sheets`. `#leftOut` says "Left out on purpose: 5, 7 — 51 lines." plainly. **Decision:** an over route total holds no bread line, so it raises no banner. A clipped total still goes unwarned; this is escalated in the final report rather than redesigned. Suite cases:
  - no banner on either sample;
  - `Sheet.coverage` clean on all 29 fixtures: the 14 edge fixtures, the 2 shape fixtures in the edge loop and the 15 readable shapes;
  - a style pushing a route 8 row 400 mm down, re-entering Print: banner text exact, Print held, Ctrl+P taken and pointing at Print anyway, a menu print empty, Print anyway printing all 28, a tick change re-holding, route 8 unticked clearing the banner, the left-out line.

  Harness runs: shortfall block 11/11, edge loop all ok, shape loop 38/38. Gate: check.sh OK.
- 2026-10-01 · **Pack gate green.** `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/breadify.mjs`, run once after item 4: exit 0, 445 ok, 0 FAIL. Last lines:
  ```
    ok   the mark is remembered on this PC — got {"3474":"Dansk Rugbrød Hel Sandnes Bakeri"}
    ok   with no errors

  all passed
  ```
  check.sh OK. The INVENTORY 🚧 line (Breadify section) already describes what shipped and stays 🚧 until the merge. No version touched, and the car app is not touched. README's list of departures was not edited because it is outside this pack's file set. Two things are not yet recorded there: the text quantity (a departure from the Rust app, which reads the column as a number) and the shortfall banner.
