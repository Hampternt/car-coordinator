# Combined pack: the rest of the review round, built in one go

**Status:** 🚧 go given 2026-09-29 by the owner ("combine all the UI changes and minor features … begin on its own worktree"). Building.
**Date:** 2026-09-29
**Branch:** `review-round`, in its own worktree. It is cut from `update-note` (pack 1, whose review fixes are still landing), then merged with `origin/dev` for the plans. It comes back into `dev` through **one PR** at the end. Nothing goes to `main` until the owner has tested the full update on `dev`.

## Goal

Everything left in the review round for Car Coordinator is built in one continuous run, in the container's order, with no stop for approval between packs. The owner approved every item list and answered every question up front.

| Part | Manifest | Items | Version |
|---|---|---|---|
| 2. Printed sheet cleanup | `manifests/2026-09-29-sheet-cleanup.md` | 7 | 0.4.0 |
| 3. Dark mode | `manifests/2026-09-29-dark-mode.md` | 10 | 0.5.0 |
| 4. Plan for tomorrow | `manifests/2026-09-29-plan-for-tomorrow.md` | 10 | 0.6.0 |
| 5. Day plan layout | `manifests/2026-09-29-day-plan-layout.md` | 12 | 0.7.0 |
| 6. Parking map | `manifests/2026-09-29-parking-map.md` | 9 | 0.8.0 |
| 7. Drivers tab | `manifests/2026-09-29-drivers-tab.md` | 10 (item 2 dropped) | 0.9.0 |
| 8. Right-click menus | `manifests/2026-09-28-context-menus.md` | 14 | 0.10.0 |
| 9. First-use tour | `manifests/2026-09-28-tour.md` | 8 | 0.11.0 |

## How it runs

- **One builder, in order, one worktree.** Every part edits `docs/app.js`, so they can't be built in parallel.
- **Each part keeps what makes it safe:**
  - one commit per item, each passing `scripts/check.sh`;
  - its schema migration plan (part 2);
  - its **Announce and cut** item, with its own version and update-note entry (pack 1's Design G and H).

  The full suite, the upgrade check and the review run once, at the end (see below).

  Users jump from the build live on `main` straight to `dev`'s tip, so every entry they missed shows, and the `must` ones show in full.
- **Owner's answers.** Each part's **Owner questions** section holds them, and they override that part's recommendations.
- **Re-check line numbers at the start of each part,** because earlier parts move code. Record anything that differs from the part's plan in that part's Ledger.
- **Parts 8 and 9 were planned before pack 1's rework.** They are re-read against what exists by then, especially the tour's use of pack 1's `firstRun` and `Store.pref('tour')`, and the menus' use of the final Drivers tab row. Deviations go in their Ledgers.
- **Pack 1's review fixes.** When they land on `update-note`, `update-note` is merged into `review-round` before the next part starts. The manager says when.

## Reviews and gates: batched at the end (owner, 2026-09-29)

The owner's rule: the full suite and the multi-agent reviews wait until the run is done. They do not run per change or per part.

- **Per item:** `bash scripts/check.sh` only (syntax and the version guard, seconds), then commit. No per-item smoke run and no per-part upgrade check. Every item is still its own commit, so a failure found at the end can be bisected to the exact change.
- **Per part:** its **Announce and cut** item (version and note entry), and its Ledger. Nothing else.
- **At the end of the whole run, once:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`;
  - `npm run screens`;
  - `npm run upgrade` from `v0.2.4`, the build live on `main`. This is the only upgrade check (owner, 2026-09-29): users go straight from what `main` serves to `dev`'s tip, so versions in between on `dev` are never compared. It overrides each part's own "Upgrade check in the pack gate". The same check runs again before `dev` → `main`;
  - one combined review, whose findings are fixed;
  - a browser walkthrough;
  - one PR into `dev`.
- **Parts 2 and 3 so far** already had per-item suites, and part 2 its own review, before this rule. Nothing is re-run for them now.

## Ledger

- **Setup.** `review-round` cut from `update-note` at 1af5ab5, merged with `origin/dev` (0f9b59a) at 771f560. Conflicts only in the two pack 1 manifests: pack 1's ticked items and ledger kept, and the container's status line combined. `npm ci` in the worktree. Baseline: `check.sh` OK; car smoke on system Chrome exit 0, 477 ok, 0 FAIL.
- **Part 2 start.** Base 771f560 (0.3.0). `update-note` had no new commits.
- **Part 2 done** (sheet cleanup, 0.4.0): items 1-7 at 6c44bb3, 503900b, 9788635 (⚠️ item 3), 5698b98, b0ec4e8, a994635, 2b02a68. Gate: `npm test` exit 0 (car 507 ok, 0 FAIL; Breadify all passed); `npm run screens` exit 0; `npm run upgrade` from 771f560 "passed: 0.3.0 to 0.4.0" and from v0.2.4 "passed: 0.2.4 to 0.4.0". `scripts/upgrade.mjs` now copes with old builds that have release notes and Archives (see part 2's item 6).
- **Part 3 start.** Base 344415a (0.4.0).
- **Merged `update-note` before part 3** (pack 1's review fixes 3-12, up to 8a855fa): clean merge. Pack 1's new `makeOdd` saves the old plan with an `extra` field, so `asOpened` in `upgrade.mjs` drops it (9dc74ee). Gate after the merge: `check.sh` OK; car suite exit 0, 519 ok, 0 FAIL; `npm run upgrade` from v0.2.4 exit 0, 64 ok, "passed: 0.2.4 to 0.4.0".
- **Part 2's review fixes** (3 findings, pinned at 9779a6b): fixed on `review-round` during part 3 as 64fdcde, fac1b34 and ab15db7; logged in part 2's Ledger.
- **2026-09-29, PAUSED at the owner's sign-off. Resume at part 3 (dark mode), item 6** ("Label colours readable on dark"). Items 1-5 of part 3 are done and logged in `manifests/2026-09-29-dark-mode.md`; the last commit before this line is 119295a. The worktree is clean. Part 3's base is 344415a (0.4.0); nothing of part 3 is cut yet (still 0.4.0).
  - **On resume, first:** `git merge --no-edit origin/dev` for the new owner rule (commit "Batch the full suite and reviews at the end of the combined run"), then `git log --oneline review-round..update-note` and merge `update-note` if it moved.
  - **New owner rule, from item 6 on:** per item, only `bash scripts/check.sh`, then commit. No per-item smoke run, and no per-part `npm test` or upgrade check. Each part still ends with its Announce-and-cut item and its Ledger. Once, at the very end of the whole run: `npm test`, `npm run screens`, and `npm run upgrade` from v0.2.4. The manager then runs one combined review.
  - **Still owed in part 3:** items 6-10. Item 5 (⚠️) awaits its individual review in the combined review.
  - The scratch worktrees (`v0.2.4` and the colour-dump parent) are removed; recreate them under the scratchpad when needed. `npm run colours -- <checkout> <out.json>` and `npm run colours -- --diff a.json b.json [mode]` compare a parent worktree with the working tree.
- **2026-09-30, resumed** ("begin work again", owner, via the coordinator). Merged `origin/dev` at 194c922 (7065278: the batched-gates rule, the upgrade check from `main`'s build only, and the CI Chromium crash recorded as a blocker before dev → main, left alone), then `origin/update-note` at 46107f4 (679150e: pack 1's rescue fix in `rescuedDuring`, its tests and `.gitignore`; the two pack 1 manifests' conflicts resolved to `update-note`'s side). Gate: `check.sh` OK. From here: `check.sh` per item, Announce and cut per part, and the full suite once at the end of part 9. Resuming at part 3, item 6.
- **Part 3 done** (dark mode, 0.5.0): items 1-10 at c9c690b, 430aad5, 43791df, 28a9700, **2832cee ⚠️**, f56382b, 32978c5, **bcbdd7e ⚠️**, 76196ba, fb1e52d (plus 4bd1c4b, a fix to item 1's colour tool). Items 1-5 had per-item car suites before the batched rule; items 6-10 `check.sh` only.
- **Part 4 start.** Base e557e29 (0.5.0). `update-note` had not moved.
- **Part 4 done** (plan for tomorrow, 0.6.0): start 45107e6; items 1-10 at 91140b7, d4327d5, 9dffb1d, 5a54f6d, **2c73957 ⚠️**, eb9db4c, **a881efe ⚠️**, 8fa7557, 084ab3c, fd99353. `check.sh` per item.
- **Part 5 start.** Base eaccb92 (0.6.0). `update-note` and `origin/dev` had not moved.
- **Part 5 done** (day plan layout, 0.7.0): start b3a443f; items 1-12 at f28d86d, 9b1de92, 9f64d58, 0ee12df, 283384c, **fbc5fe8 ⚠️**, 9185da6, 83a1c0a, 37e519f, 443f23f, fa81461, 5791df1. `check.sh` per item.
- **Part 6 start.** Base ab6a206 (0.7.0). `update-note` and `origin/dev` had not moved.
- **Part 6 done** (parking map, 0.8.0): start 1fcd19c; items 1-9 at b264d69, 36c34f4, ae02da0, **df37b50 ⚠️**, 5ccd33d, c25022e, 8e596a4, 2c0afe4, 1d135d8. `check.sh` per item.
- **Merged `update-note` before part 7** (4e3f164: 898d819, "Skip the linked-file cases where the test browser crashes on them"): clean, smoke only. Gate: `check.sh` OK.
- **Part 7 start.** Base 4e3f164 (0.8.0).
- **Part 7 done** (drivers tab, 0.9.0): start 6fe387c; items 1, 3-11 at 9a3173f, 4fdb69c, **5b8a877 ⚠️**, 16b990e, d6bbad0, 973094d, d40c6c6, 3225022, e021dc9, 44db090 (item 2 dropped). `check.sh` per item.
- **Part 8 start.** Base e6f7656 (0.9.0). `update-note` and `origin/dev` had not moved.
- **Part 8 done** (right-click menus, 0.10.0): start af3e402; items 1-14 at b644c6b, 7d1cd8b, **4abe7ec ⚠️**, c4f7317, **ffd08e9 ⚠️**, 4ce9386, d3bd956, 12c7f21, fb73d8b, 0f69c96, 6505b03, **9309dde ⚠️**, 1037e42, 7f3b541. `check.sh` per item.
- **Part 9 start.** Base 48b5535 (0.10.0). `update-note` and `origin/dev` had not moved.
- **Part 9 done** (first-use tour, 0.11.0): start dceda29; items 1-8 at **2e02c78 ⚠️**, 672e40f, 9dc4693, 57af757, **0633d44 ⚠️**, **dac608d ⚠️**, f6ec40d, d383d48. `check.sh` per item.
- **End of run, 2026-09-30** (all with `CHROMIUM_PATH=/usr/bin/google-chrome`; the pinned Playwright Chromium is not installed here, so none of this ran on CI's browser). First `npm test` stopped at the part 4 Keep cases; the fixes, each its own commit:
  - app: da484a5 (a label's dot was never lifted on a dark screen: part 3's rule came before the plain dot rule), 4a66f58 (menu hover focus only on a pointer that moved), 092a9cb and 3e2dddf (tour card placement), 8987c78 (an index.html cached from before parts 8 and 9 stopped the app loading: found by the upgrade check);
  - tests only: bf570ab, 0049e7a, dccc1de, 9198816, 564816b, d4c48d6, b88efbe, a6e7da9, 990be37, 5a5bee4.
  - Final `npm test` (tree at 8987c78): exit 0, 1264 ok, 0 FAIL — "map checks passed", "all checks passed", "all tour checks passed", "all passed" (Breadify).
  - `npm run screens`: exit 0, "no console errors, 4 warnings raised and asserted", 33 files (29-33 new).
  - `npm run upgrade -- <v0.2.4 worktree>`: exit 0, 67 ok, "upgrade check passed: 0.2.4 to 0.11.0". The v0.2.4 worktree was removed afterwards.
- **2026-09-30, after the run: a check from the build live on `main`, and one correction from the owner's walkthrough.**
  - `npm run upgrade` from `origin/main` 798a4f5 itself, whose Car Coordinator files equal v0.2.4's, to 21579ae: exit 0, 67 ok, "upgrade check passed: 0.2.4 to 0.11.0".
  - **Parking map drawn to the owner's drawing** (owner, on the preview): "The 1 2 3 spots are wrongly marked they are parked front to back not alongside each other same for spot 5 the entrance is at the bottom beneath spot 1".
    - Spots 5, 3, 2 and 1 now stand upright, one behind another, in a narrow column up the right of the lane.
    - Entrance 1 has its own cell under Spot 1.
    - The lane runs to the top.
    - Checks: `check.sh` OK and `node scripts/map.mjs` "map checks passed". A screenshot with the example data shows Spot 1 at 150×170.
    - It rides in 0.11.0 with no patch cut, because 0.11.0 hasn't shipped (as 64fdcde did in 0.5.0). 0.8.0's note still reads true.
  - **Spot 4 given room, on `dev`** (owner): "in between the spot 4 and the hatched out area above it can you add a bit of space … make spot 4 … 80% as wide". Spot 4 now has 24px clear of the room above and is 80% of its column wide, standing at the left. `check.sh` OK; screenshot with the example data. It rides in 0.11.0, as the map fix above does.
  - **Usual days in the Drivers panel, on `dev`** (owner): "on the drivers on the right … show what days the workers have as their usual days on their names if its abbreviated, mon, tue, wed". Each rail row shows the days short after the name ("Mon Tue", with runs of three or more joined as "Mon–Wed"), read from the weekday groups as the day buttons read them, and the full days in its tooltip. 0.9.0's `affects` names the panel. `check.sh` OK. The rail-overflow condition gives no rows at 1400, 1200 and 390 with the example data. It rides in 0.11.0.
  - **Row menus open on text boxes too, on `dev`** (owner): "when right clicking the day plan drivers name and route the proper right click context menu does not appear". Part 8 left every text box to the browser's menu, and a route's name and driver are text boxes, as is the rail's name box. A text box in a row now opens the row's menu. The browser's Cut, Copy and Paste stay with Shift held or text selected in the box, and other kinds of box (date, colour, time) keep the browser's menu. Six smoke checks that pinned the old rule are rewritten, plus a driver-box check and a with-selection check. 0.10.0's `affects` now says to Shift+right-click for copy and paste. A targeted Chrome run passed every case: route name and driver box give "Route 7"; the rail name gives "Anders"; Shift, selected text and the date box give the browser's menu; typing still saves; no errors. The full suite runs before `dev` → `main`.
  - **More in the rail's menus, on `dev`** (owner chose all four, 2026-09-30):
    - **Put on route N:** for a driver or car on no route, the routes still missing one, four at most, then a count. It sets the field a drop sets, and changes nothing if the route was filled meanwhile.
    - **A car's status in one click:** OK and every label, the current one ticked (setLabel). Tag… stays.
    - **A driver's usual days:** Works Mondays … Works Fridays, the current ones ticked (crew-day, the Drivers tab's day buttons).
    - **Go to ⟨driver⟩ on the Drivers tab.**

    The Drivers and Cars tab menus are unchanged. Two smoke menus are re-pinned and a block of eight checks added. A targeted Chrome run with the example data passed: Petter onto route 14, ZH 90458 onto route 14 and then Workshop, Anders into Wednesday (the rail then reads "Mon–Wed"), and Go to landing on his name box; no errors. The full suite runs before `dev` → `main`.
  - **Position entries on a route's Position box, on `dev`** (owner): "on day plan right clicking position should let me get some position related menu options".
    - Kept: Go to ⟨position⟩ on the Positions tab.
    - New: Show on the parking map (only for a spot the map draws), Allow/Stop allowing many cars, and Take ⟨position⟩ off route N.
    - New: Move to ⟨spot⟩ (or Put on, for a route with none), for spots free in this route's round with no status; Many-cars spots always count. Five at most, then a count. It changes nothing if the route's position moved meanwhile.

    A smoke check is added beside the Go to one. A targeted Chrome run with the example data passed: route 8 (round 2) is offered only the Garage, correctly; route 14 is put on Spot 1; Show on the map lights Spot 1 in view; no errors.
  - **A status list inside the menu, on `dev`** (owner): "positions can be tagged so … make it so i can tag them … eg tags > [tag1, tag2, tag3]".
    - The menu can switch in place to a list of its own. `ctx.view` holds it; the list starts with ‹ Back, and Escape goes back before it closes. Nothing about it is saved.
    - A route's Position box gets "Status: ⟨current⟩ ›" (OK and every label, ticked; setLabel).
    - The rail car's flat status list from earlier today becomes the same "Status: ⟨current⟩ ›".
    - The smoke rail-car checks are re-pinned, with Back and Escape added.
    - A targeted Chrome run passed: Spot 1 → Workshop raises its warning; the menu stays in place; Escape goes back, then out; no errors.
  - **Submenus open beside the menu, on `dev`** (owner): "when hovering over a menu that has a sub menu make the menu appear to the right of the context menu like that type of menu usually works".
    - "Status: … ›" opens a second menu (`#ctxSub`, made by app.js on first use, so an older cached index.html is fine) to the right of the menu, level with its entry, or to the left when the right has no room. Hover opens it after 150 ms, and hovering another entry shuts it after 300 ms. Click toggles it; ArrowRight goes in; ArrowLeft or Escape come back.
    - Choosing an entry closes both. An outside press, the wheel, right-click and focus bookkeeping treat the submenu as part of the menu.
    - Where neither side fits (a phone), a click or key uses the in-place list from before; a hover never does.
    - The smoke check reads whichever form it gets.
    - A targeted Chrome run passed: at 1400 the flyout opens at the menu's right edge level with its entry, Workshop is set and both close, and the keys go in and out; at 390, hover does nothing and a click gives the in-place list; no errors.
  - **The submenu's arrow at the right edge, and opening sooner, on `dev`** (owner: "arrow closer to the right side … snappier … so a user could accidentally discover it"). The arrow is its own span, pushed to the entry's right edge, and the entry says `aria-haspopup="menu"`; its text still reads "Status: OK ›", so the smoke checks are unchanged. Hover now opens it after 60 ms instead of 150; the close still waits 300 ms. The Chrome run passed at 1400 and 390 as before, and a screenshot shows the arrow at the right edge with the flyout beside it.
