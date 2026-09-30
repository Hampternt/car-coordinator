# Pack: Info bubbles instead of the tour

**Status:** IN PROGRESS. Building on branch `info-bubbles`, cut from `dev` at 27cd03b after the weekday-templates merge.
**Branch:** its own, `info-bubbles`, cut from `dev` **after `weekday-templates` is merged**, since both rewrite parts of `app.js`. Merged back into `dev` when green. Ships as 0.14.0.

Observable: a small ⓘ sits beside each part of the app. Clicking one opens a short bubble right next to it, saying what that part does and how to use it. The Tour button and the "Show me around" offer are gone.

Agents: build 1 (medium; app.js is shared) · review 1 lens (correctness) + verify.

## Decisions (owner, 2026-09-30)

| Question | Answer |
|---|---|
| Why | "the positioning of the info boxes can be confusing instead of a tour have it have information bubbles that can be clicked to help users understand a function / how to use it" |
| The tour | **Removed:** the Tour button, the first-open offer, `tour.js` and its markup. The bubbles reuse what the tour explained. |
| Visibility | **Always there, small:** a quiet ⓘ beside what it explains. One click opens its bubble beside it; a click elsewhere, Esc or another ⓘ closes it. |
| First open | **A one-line hint:** "New here? Click any ⓘ to see what that part does." It is dismissable and never shown again in this browser (a per-browser pref, like the tour's). |

## Saved data

None. The bubbles are text. The hint's "seen" is a per-browser pref, `carcoord:pref:infoHint`, kept off the plan. The old `carcoord:pref:tour` is left in place and unused. No schema change, and no upgrade-check change beyond the note.

## Where the bubbles go

Each is one or two short sentences: what it is, then how to use it.

| Tab | Bubbles |
|---|---|
| **Day plan** | the Date and its line (next working day, Set to tomorrow, Keep) · the warnings box (never blocks) · the route table (a row is a sheet line; Mark, Gap, rounds; drag names in; right-click for more) · the Drivers panel (In/Away, crews, usual days, drag onto a route) · the Cars panel (Free/out, status, drag) · Day templates (save, Update from plan, loading in parts) · the week (each weekday's crew, Load) · the parking map (spots by name, rounds, red) |
| **Drivers** | usual days · tags and notes (driver tags) · day groups |
| **Cars** | status labels and notes · Assigned to |
| **Positions** | Many cars · status · the map finds spots by name |
| **Labels** | car and position labels with Show on printout · driver tags |
| **Data** | the save file · sending the list · your own copy · What's new and Archives · Backups · Colours |
| **Print preview** | what is on the paper |

## Items

- [x] **1. The bubble.** A `help.js` holds every text by key (one top-level name, as `map.js` and `tour.js` do), and an `infoBtn(key)` in app.js draws the ⓘ. A layer app.js makes on first use opens beside its ⓘ, placed the way the menus are, and one at a time. It closes on Esc, an outside click or another ⓘ, is keyboard reachable, is never printed, and saves nothing. A cached index.html without help.js simply draws no ⓘ. Done: every key opens its own text beside its button, and nothing is written.
- [x] **2. The ⓘ in place** at every spot in the table above. Done: every key in help.js has exactly one visible ⓘ on its tab, and every ⓘ has a text.
- [x] **3. Remove the tour:** `tour.js`, `#tour` and `#tourRing`, the Tour button, `offerTour`, `scripts/tour.mjs`, its npm script, and its screenshot. The top bar's 1300px wrap rule stays if it is still needed without the Tour button; re-measure it. Done: no reference to Tour is left; the suite and screens pass.
- [x] **4. The first-open hint**, where the tour offer was raised (a first run, no share link, no warning, no save file linked), with the `infoHint` pref. Done: it shows once and never again after ✕.
- [ ] **5. Words:** the README, the INVENTORY entry for the tour, and any hint text that pointed at the tour. Done: nothing mentions the tour except update notes already written.
- [ ] **6. Tests:**
  - every ⓘ opens beside itself, inside the window, at 1680, 1280, 900 and 390;
  - one bubble at a time;
  - Esc and outside clicks close it;
  - the keyboard reaches it;
  - it saves nothing;
  - the hint appears once;
  - it is hidden in print.

  Done: the suite passes.
- [ ] **7. Announce and cut 0.14.0,** `must: false`: "Small ⓘ buttons explain each part of the app; the tour is gone." Done: the version guard passes.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, `npm run screens`, and the upgrade check from the live build (the note changes).

## Ledger

- 2026-09-30: planned with the owner's three answers. It waits for `weekday-templates` to merge.
- 2026-09-30: the owner's go: "go, start it after the templates merge".
- 2026-09-30: build started on `info-bubbles`.
- 2026-09-30: item 1 done. `docs/help.js` declares `HELP` (26 keys: the table's, with the Data tab's What's new and Archives as two keys, and Positions split into the map, Many cars and status), loaded before app.js with ?v=. `infoBtn(key)` draws the ⓘ (`data-info`, never `data-act`, `aria-expanded` from `infoOpen`), or nothing without HELP or the key. `#infoBubble` is made on first use, placed with `besideAnchor` (right-aligned for an ⓘ on the window's right half, max height from its room), re-placed after every render, scroll and resize, and shut when its ⓘ is gone. Its own click, pointerdown, focusin and keydown handlers: another ⓘ swaps it, the same one toggles it, Esc / an outside press / the focus leaving shut it, Tab from inside goes on from the ⓘ, a keyboard open focuses it and a keyboard close hands focus back. Opening shuts the picker, tag menu and right-click menu. Hidden in print. No ⓘ is placed yet (item 2). check.sh: CHECK OK; colour guard OK.
- 2026-09-30: item 2 done. 26 ⓘs, each key once, on dev-data: Day plan 8 (warnings box heading, Date, Route column, Day templates, The week, Parking map, Drivers panel, Cars panel), Drivers 3 (Usual days and Tag columns, Day groups), Cars 2 (Assigned to, Status), Positions 3 (heading, Sharing, Status), Labels 2 (both section headings), Data 7 (Auto-save to a file, Colours row, Send this list, Your own copy, What's new, Archives, Backups), Print preview 1 (a `#previewInfo` slot in index.html's static hint, filled by render). Probe at 1680, 1280 and 390: every key shown once, the bubble beside its ⓘ inside the window, Esc shuts it, nothing saved, no console errors. The rail headings keep their ⓘ beside the word. check.sh: CHECK OK; colour guard OK.
- 2026-09-30: item 3 done. Gone: docs/tour.js, scripts/tour.mjs, `test:tour` and its part of `npm test`, the Tour button, `#tour` and `#tourRing`, the tour script tag, `offerTour`/`dropTourOffer`, the `tour` act, `Tour.init` and `Tour.place`, the `.tour*` CSS and the print rule's entries, screens' tour shot, and the "tour's step" comments (the ids stay). `carcoord:pref:tour` and the 0.11.0 note are untouched. Top bar re-measured in headless Chrome with the tabs forced onto one row: they fit to 1075px with the Tour button and 1000px without, so the wrap rule moves from 1300 to 1055 (the same 55px of room; nothing in smoke or screens pins the width). The first-open line comes back in item 4; smoke's tour-offer checks are re-pinned in item 6, and the suite and screens are proved at the end gates. check.sh: CHECK OK.
- 2026-09-30: item 4 done. `offerInfoHint(link)` raises "New here? Click any ⓘ to see what that part does." where `offerTour` ran, on its conditions (first run, no share link, no warning, no save file linked), and only when HELP is loaded and `Store.pref('infoHint') === null`. The `dismiss` act sets `infoHint` to `done` when the notice put away is that very notice. screens.mjs checks a first open shows the hint alone, and takes `33-info-bubble` (the Drivers panel's bubble on the Day plan, window-sized). check.sh: CHECK OK.
