# Pack: Breadify — faster ticks, and no bread left off quietly

**Status:** 🚧 go given 2026-10-01 by the owner ("go on … breadify fixes"). Building.
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

- [ ] **1. Faster ticks.** Keep each route's laid-out sheets in a Map by route, cleared whenever the Print step is entered (the file, the kind, the crate sizes and the Pay attention marks can only change on other steps); `rebuild()` lays out only routes it does not have, and an untick takes that route's sheets out of the preview rather than rebuilding the rest. Quick clicks gather into one update: the tick repaints at once, the preview follows after a short pause (~150 ms) with "Updating preview…" said, and Print (the button and Ctrl+P) waits while an update is pending. Done: an untick on the bread sample settles in a fraction of today's ~130 ms (measured and noted in the ledger), ten quick unticks cause one layout, and the sheets printed are byte-for-byte the sheets a full rebuild makes.
- [ ] **2. A quantity that is not a number.** It prints as written, trimmed, cut to 20 characters with "…" past that, so a paragraph cannot push the line apart. For crates and the route total it counts as the whole number it starts with ("3 stk" is 3; "abc", blank or an error cell is 0). Check reports these lines as a warning (not blocking) naming route, customer and product, and the "ask for nothing" warning counts only true zeros. Done: suite cases for "3 stk", "3,5", a 200-character note, blank and `#N/A` — printed text, crate count and warnings.
- [ ] **3. A new file clears the old sheets.** Opening a file, switching bread/freezer or re-checking empties `built` and the preview, so Ctrl+P can never print another file's sheets. Done: suite case — bread file, Print, open the freezer file, Ctrl+P prints no bread sheet.
- [ ] **4. A severe warning when the pages do not carry every bread.** After the preview is built, for each ticked route compare the lines and units the file gives it with the rows drawn inside the paper (each row's box within its sheet and above the footer), and treat any `over: true` piece as not drawn. Any difference raises a red banner beside Print naming the route, how many lines and units, and the first missing product; Print (button and Ctrl+P) is held until "Print anyway" is pressed. Unticked routes are listed plainly ("left out on purpose: 5, 7 — 41 lines"), never as a warning. Done: no banner on either sample or any fixture; a suite case that forces a row off the paper raises it and holds Print.

## Gates

- Per item: `bash scripts/check.sh`.
- At the end, once: `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/breadify.mjs`, all passed, quoted in the ledger.

## Ledger

- 2026-10-01: planned from the owner's questions and the investigation above; the owner's go, with the 20-character rule for item 2.
