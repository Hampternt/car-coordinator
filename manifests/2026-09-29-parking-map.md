# Pack: Parking map

**Status:** 🚧 building, since 2026-09-30, as part 6 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and both owner questions approved (the yard as drawn; the gate is named `Gate`).
**Date:** 2026-09-29
**Branch:** cut when execution starts: `parking-map`, from `dev` after pack 5 has merged into `dev`, and merged back into `dev` through a PR (the container's Branch line). Items 1–2 can start earlier, but only on their own branch, `parking-map-model` (Design H).

## Goal

Under the route list, in the slot pack 5 keeps for it, the Day plan shows a plain drawing of the yard:

- **Spot 1 to Spot 5 and the gate** are drawn where they really are. The rooms and the building or dock are hatched and carry no text. The garage is not drawn.
- **Each spot lists its routes by round.** Each route gets one line under a round heading: `Round 2`, then `route 9 · EV 73112`.
- **A spot turns red** exactly when the warnings above say it is taken twice in one round. It also says so in words: `Taken by 2 routes in round 2`.
- **A spot that is out of use** shows its status and note: `Unavailable · Resurfacing until Friday`.
- **Positions are found by name.** Any other position goes in a short **Not on the map** list under the drawing, so renaming or adding a position never breaks anything.

Nothing saved changes, and the map never reaches the printed sheet.

## Agent brief

Conventions come from `HANDOFF.md`, the code and the container. There is no `CLAUDE.md` at the repo root. Nothing starts before the owner's go on this manifest.

**Line numbers** are cited against `dev` at 73dd734. `docs/` has not changed there since 7d1893b. Packs 1–5 move nearly all of these lines, and the map's slot does not exist yet. **Re-derive every line number from `dev` after pack 5 merges.**

Read first:
- **This manifest.** Then the container `manifests/2026-09-28-review-round.md`: its Branch line, **Rules every pack follows**, the parallel-work sentence (:64-67) and the pack 6 section (:209-217).
- **Pack 1** (`manifests/2026-09-28-update-note.md`):
  - Design D (boot order), G (note wording), H (Announce and cut) and I (the stale `index.html` row);
  - `scripts/versions.mjs` and `scripts/upgrade.mjs`, as built.
- **Pack 5's manifest**, for the map's slot and its width.
- **Pack 3's manifest**, for the colour tokens and its rule for colours the user picked.
- **`docs/app.js`:**
  - the helpers `esc` :6, `fold` :11, `colour` :18 and `collate` :23;
  - `spotKey` and `roundPhrase` :150-161, and `usage()` :163-178;
  - `labelName` :286;
  - `problems()` :295-331, including its position-status test :316 and its clash loop :321-328;
  - `liveSig` :336-342;
  - the rail's registration box in `railRow` :462-479;
  - `planScroll` :644-648;
  - `renderPlan()` :650-737, which takes `use` from `problems()` at :651 and restores scroll positions at :727-736;
  - the Positions tab hint :920 and `spotCell` :1085;
  - `renderSheet()` :1087, which reads `problems()` at :1089;
  - `render()` :1125-1139;
  - the input handler :1143-1177, with `watched` at :1159 and its last branch at :1176;
  - the tab switch :1670 and `start()` :2354-2383.
- **`docs/index.html`:** the CSP :14 and the script tags :63-66.
- **`docs/style.css`:** `.plan` :136, `.plan-table` :139, the 1180px stack :299-306, print hiding `main` :348, and `.tab` scrolling at ≤760px :360.
- **`docs/share.js`:** `Share` :18, name folding :128, and first match by name :196 and :225.
- **`scripts/smoke.mjs`:**
  - console errors :41-43 and the first run :49-50;
  - hostile ids :824-840;
  - clashes on the printed sheet :842-861;
  - the per-round clash cases :863-916, with `spotPlan` at :867;
  - scroll kept across a redraw :1567-1572;
  - print boxes :1731-1752;
  - phone width :1783-1802;
  - a separate browser context :1812-1816;
  - the scan for colours and `position:fixed` :1839-1845.
- **`scripts/screens.mjs`:** positions :66-75, and the day plan with its exact warning list :96-154.
- **`scripts/fixtures/dev-data.json`:** positions :12-21.

Reuse:
- `fold`, `spotKey` and `usage()`;
- the wording of `labelName` and `roundPhrase`;
- `planScroll` and `data-keep-scroll`;
- from smoke, the `spotPlan` and `loadPlan` helpers and the separate-context pattern.

Dependency edges:
- **Pack 5 blocks items 3–9.** It owns the slot under the route list, its width, and whether it sits beside the sticky rail (style.css:136-144 and :299-306 today). The map works at any width.
- **Pack 1** provides:
  - `APP_VERSION`, and `?v=` on every local tag, both enforced by `versions.mjs`;
  - `docs/updates.js`, under Designs G and H;
  - `scripts/upgrade.mjs`;
  - Design I's stale `index.html` case, which the map's fallback covers.
- **Pack 3:** the colour tokens and the dark palette. Every colour the map uses must be a token with a dark value.
- **Pack 2** does two things that matter here:
  - It deletes `qr.js` and its tag, so the new tag goes after `share.js`.
  - It takes "Positions not available" off the printed sheet, which leaves the map as the place where a spot's status shows. Whether `renderSheet()` still reads `problems()` after pack 2 decides one check in item 3.
- **Pack 8 (downstream):** `data-position="⟨id⟩"` on each matched box is kept for its position menu (context-menus.md:373).
- **Pack 9 (downstream):** tour step 2 says "rename them to match your yard" (tour.md:205). That goes against this pack's rule of never asking for a rename. Pack 9 rewords it to say the map finds Spot 1 to Spot 5 and the gate by name.

## Saved data

**No migration.** The map only reads these inputs, handed over as plain copies:
- positions, labels and cars;
- the spot-and-round buckets that `problems()` already builds (app.js:651).

Consequences:
- Nothing is added to `state`, so `SCHEMA` stays at pack 2's 5.
- There is no new `carcoord:pref:*` key.
- Export, the save file, Backups, Archives and share codes are unchanged. `store.js` and `share.js` are not touched.
- Drawing the map never writes `carcoord:v1`, and item 4 proves it.
- **Older data with unsplit spot names**, such as "Spot 1/1", does not match by name. Those positions show under Not on the map until the leader accepts the existing split offer at start-up (app.js:1599-1607, called at :2373). They are listed, not lost.

**Upgrade check** (pack 1's release rule, the cheap kind), run as `npm run upgrade -- ⟨dir⟩`:
- **From the previous `dev` build (0.7.0), scenario (a).** The profile already holds three update archives and a rescue, as a long-running user's does.
  - `carcoord:v1` and every Backup are byte-identical on open.
  - There is exactly one new update archive, `to: '0.8.0'`, byte-equal to the old `carcoord:v1`.
  - The oldest update archive is the only one dropped. The other two and the rescue are byte-identical.
  - The note shows the 0.8.0 entry, and a reload shows no note.
- **Scenario (e)**, an old cached `index.html` with the new `app.js`:
  - the plan is drawn;
  - the map says `Reload the page to see the parking map.`;
  - there are no console errors.
- **Before `dev` → `main`**, run again from the build live on `main`:
  - the same data checks as above;
  - the note follows pack 1's rule (update-note.md:130): every unseen `must` entry in full, filled up to three with the newest, and the rest counted;
  - What's new lists 0.8.0.
- If `scripts/upgrade.mjs` cannot seed archives yet, this pack adds that to the script. That is test code only.

## Decisions taken

| Decision | Choice |
|---|---|
| Where the map sits | In the slot pack 5 reserves under the route list (container). Pack 5 owns the slot's place and width. |
| What is drawn | The right-hand drawing of 2026-09-28: Spots 1–3 along the lane from Entrance 1, Spot 4 in the side bay, Spot 5 at the top, and the gate through the right wall (container). The hatched areas are building or dock where nobody parks, and Spots 1–3 are ordinary spots beside them (owner, 2026-09-28). |
| The public repo | Plain boxes in relative positions: no site names and no dimensions in code, manifest or screenshots (container). CI uploads `screens/` (build.yml:20-25). |
| The garage | Nothing for the garage (owner, 2026-09-28). A position named Garage is neither drawn nor listed. If someone renames it, it simply appears in the list. |
| What a spot shows | Its routes by round, red when it is used twice in one round, and its status when it is out of use (owner, 2026-09-28). |
| Matching | By name, so nothing saved changes (container). Names are trimmed, compared in any case, and must match exactly. The first match on the Positions tab wins, the way share codes match (share.js:196, :225). |
| Positions the map doesn't know | A short Not on the map list under the drawing, in Positions-tab order (container). |
| The gate | One port (owner, 2026-09-28). Which port is owner question 2. Until it is answered, the names tried are `Port 1`, then `Port`, then `Gate`. They are kept in one constant, `ParkingMap.GATE_NAMES`, and every test reads that constant. |
| Never ask for a rename | Renaming a position changes the printed sheet, because `spotCell` prints the name (app.js:1085). So nothing in this pack tells the leader to rename; the gate matches the name the owner already uses. *(Feasibility review.)* |
| Where the code lives | A new `docs/map.js` exposing only `ParkingMap`, an IIFE global like `Share` (share.js:18). It is pure: it has its own `fold`, colour check, `esc` and numeric collator, and uses no `app.js` globals. |
| What the map is handed | `app.js` passes plain copies of only the fields the map reads, never `state` itself, and `scripts/map.mjs` deep-freezes its inputs. The data-safety review offered either; both are kept because each catches a different mistake. |
| Double-booked | Decided once, in `app.js`, by a new `doubleBooked(entries)` that `problems()` also uses. The map receives `use.spots`' own buckets with that verdict, so it cannot disagree with the banner. |
| Out of use | The position's label exists (`byId`, as at app.js:316). A label id that is merely set does not count; that is the sheet's test at :1099. A note is shown only beside a status. |
| How routes read | Under round headings, one route per line: `Round 2`, then `route 9 · EV 73112`. These use the app's own word, so a typed round `A` reads `Round A`. A box where no route has a round has no headings, because a plan with no rounds reads as it did before rounds existed (app.js:159-160). No owner example format is on record. |
| Red is never colour alone | A red box also says `Taken by 2 routes in round 2`, in the banner's own words, and its clashing lines are bold. The map adds no notice and no warning line. |
| Many cars | A spot ticked Many cars is drawn with a `Many cars` caption and is never red, as in the banner (app.js:325). |
| The same name twice | The first position is drawn, and its box says `Another position is also called Spot 1; it is listed below.` That box never reads `Free` while the twin exists. *(Data-safety review: a bare Free would hide the twin's routes.)* |
| Empty boxes | A matched spot with no routes, no status and no twin reads `Free`. An unmatched box is dashed and reads `No position named Spot 5`. `defaults()` is unchanged, so a fresh install's gate box says which name it looks for. |
| Who draws what | `app.js` draws the card, heading, hint and two empty containers, and `map.js` fills the drawing and the list. The containers exist even when `map.js` is missing or throws, so a live redraw always has somewhere to write. *(Feasibility review.)* |
| Live while typing | `renderMap()` goes in the input handler's last branch (app.js:1176). It refills only the two containers, through the same guard as the first draw. |
| Positions tab | Its hint gains one sentence saying the map finds spots by name, because that is where renaming happens. *(Feasibility review; the planning draft had left it out of scope.)* |
| Phone width and print | The drawing scrolls sideways in its own box, never the page. It never prints, because `main` is hidden in print (style.css:348). |
| Markup and per-browser state | Every class starts with `parking`. The only data attribute is `data-position`, kept for pack 8. Boxes cannot be focused or clicked. There are no per-browser choices; a collapse switch, if one is ever wanted, goes through `Store.pref`. |
| Branch and carve-out | The container allows the map logic to be built while pack 5 runs. Items 1–2 do that on `parking-map-model`, which holds only two new files and is merged into `parking-map` when that branch is cut. That keeps the Branch rule true word for word. |
| Owner questions | Two: the layout and the gate's name. Only the owner knows either, and getting either wrong puts saved routes in the wrong place on the picture. The feasibility review asked for a third, about route wording; instead the wording is shown in the screenshot and the walkthrough, since changing it is one function in `map.js`. |
| Version | 0.8.0, the next minor after pack 5's 0.7.0; re-check it at item 9. `must: false`: nothing saved changes, and neither the printed sheet nor share codes change. |

## Design

### A. Files

- **New:** `docs/map.js` and `scripts/map.mjs`.
- **Changed:**
  - `docs/app.js`, `docs/index.html` (one tag) and `docs/style.css`;
  - `scripts/smoke.mjs` and `scripts/screens.mjs`;
  - `package.json`: `map.mjs` in `test`, plus `test:map`;
  - `docs/updates.js`, `README.md`, and the six version places.
- **Untouched:** `store.js`, `share.js`, `recover.*`, and the shape of the saved plan.

### B. `docs/map.js`

**`ParkingMap.GATE_NAMES`:** the gate's names, in order of preference.

**`ParkingMap.model({ positions, labels, cars, rounds })`**
- Its inputs are plain copies (Design F).
- `rounds` has one entry per spot-and-round bucket, grouped as `usage()` groups them by `spotKey` (app.js:158). Each entry is `{ routes: [{ name, round, positionId, carId }], clash }`, with the routes in plan order.
- It groups the buckets by `routes[0].positionId` and takes a round's wording from `routes[0].round.trim()`, as `problems()` does. A bucket whose position is gone is ignored.
- It returns `{ boxes, others }`:
  - `boxes` always has six entries: Spot 1 to Spot 5, then the gate.
  - `others` is the Not on the map list.
- Each entry holds:
  - its title;
  - its position (`{ id, name }`, or none);
  - its status;
  - its Many cars flag;
  - its twin line;
  - its route groups, each with a heading, lines and a clash tag.
- Lookups by id use `Map` or `find`, never a plain object. A plain object breaks on an id of `__proto__` (app.js:164-166).
- It never writes to its inputs.

**`ParkingMap.drawing(model)`** returns the yard (Design E), for inside the scroll box. **`ParkingMap.others(model)`** returns the list, or `''` when nothing is listed. Both escape every name and id. The only `style` either writes is `--c:#hex`, passed through their own colour check.

**Only `const ParkingMap` at the top level.** `map.js` loads as a classic script beside `app.js`. If it declared a top-level `esc`, `fold`, `colour`, `collate` or `$` of its own, `app.js` would throw and the app would not start.

### C. Matching

1. Names are folded (trimmed and uppercased) and compared exactly.
2. Spot N takes the first position on the Positions tab named "Spot N".
3. The gate tries each of `GATE_NAMES` in turn. The first name that any position has wins, and among positions with that name, the first on the Positions tab.
4. Positions named Garage are skipped.
5. Every other position goes under **Not on the map**, in Positions-tab order.
   - A later position with a box's name reads `Also called Spot 1; the map shows the first one.`
   - A name made only of spaces reads `A position with no name`.

### D. What a box shows

- **Title:** the position's own name, trimmed. When nothing matches, the name the box looks for. The gate box also carries the caption `Gate`.
- **Status** (shown when the label exists): a colour dot, then the label's name (or `a status with no name`), then ` · note` when there is a note.
- **Many cars:** a small caption.
- **Routes:**
  - Round headings read `Round ⟨round⟩`, in number order (2 before 10). Within a round, routes keep plan order.
  - Each route is one line: `route ⟨name⟩ · ⟨registration⟩`. With no car, the registration is left off. A blank name reads `route -`.
  - Routes with a blank round come last, under `No round`. A box where no route has a round has no headings at all.
  - Routes on an out-of-use spot are still listed; the banner is what warns about them.
- **Red** when any of its groups is a clash. It carries the tag `Taken by ⟨N⟩ routes in round ⟨r⟩`, or `Taken by ⟨N⟩ routes` for the blank round, and the clashing lines are bold.
- **Twin:** `Another position is also called ⟨name⟩; it is listed below.`
- **`Free`** only when the box is matched and has no routes, no status and no twin.
- **Dashed**, reading `No position named ⟨name⟩`, when nothing matches.
- **The list** uses the same parts, and is hidden when it is empty.

### E. The drawing

The yard in relative positions only, pending owner question 1. In the page, rooms and the dock carry no text; their labels below are only for this sketch.

```
+----------+----------------------------+----------------+
|  (room)  |           Spot 5           |    Gate  -->   |
+----------+--------+-------------------+----------------+
|  Spot 4  |        |  Spot 3           |////////////////|
|  (bay)   |        +-------------------+// building  ///|
+----------+  lane  |  Spot 2           |// or dock,  ///|
|  (room)  |        +-------------------+// no parking //|
|          |        |  Spot 1           |////////////////|
+----------+---^----+-------------------+----------------+
           Entrance 1
```

- **The layout** is one `grid-template-areas` rule in `style.css`, so correcting it after the owner answers is one edit:
  ```
  "room-a spot5 spot5 gate"
  "spot4  lane  spot3 dock"
  "room-b lane  spot2 dock"
  "room-b lane  spot1 dock"
  ```
- **The outline** is the card's border.
- **The rooms and the dock** are hatched, with no text and `aria-label="Not parking"`.
- **The lane** carries only `Entrance 1`, at its foot.
- **Width:** fluid up to about 960px, with a minimum width inside its own scroll box.
- **Colours:** pack 3's tokens only. A new token (hatch, clash fill) gets both light and dark values. The status dot follows pack 3's rule for colours the user picked.

### F. Wiring in `app.js`

**The tag.** `<script src="map.js?v=⟨APP_VERSION⟩">` goes after `share.js` and before `app.js` (index.html:63-66 today; pack 2 removes `qr.js`).
- It must come before `app.js`: `start()` runs at the end of `app.js` (:2385), and `Store.init` → `askPersist()` → `render()` can run before any later tag has run (store.js:461-467, :496).
- `versions.mjs` requires the `?v=`.

**`doubleBooked(entries)`** sits beside `spotKey`, and `problems()` uses it (item 3).

**The card** is drawn by `renderPlan()` in pack 5's slot. It reuses the `use` that `problems()` returned (:651). It holds:
- the heading `Parking map`;
- the hint `Spots are found by name, so a renamed spot moves to the list under the map. The Garage is left off.`;
- two containers: the scroll box (`data-keep-scroll="parking"`) and the list.

**`mapParts(use)`** fills both containers:
- It builds plain copies:
  - positions `{ id, name, multi, labelId, note }`;
  - labels `{ id, name, color }`;
  - cars `{ id, reg }`;
  - `rounds` from `Object.values(use.spots)`, each with `clash: doubleBooked(e)`.
- If `typeof ParkingMap === 'undefined'`, the drawing is the line `Reload the page to see the parking map.` That is pack 1's Design I case: an old cached `index.html`.
- Everything else runs inside a try/catch. On a throw it calls `console.warn` and shows `The parking map could not be drawn; the plan above is not affected.`
- So the map can never blank the plan, which `render()` draws first (:1134).

**`renderMap()`** finds both containers in `#tab-plan`, does nothing if either is missing, and refills them from `mapParts(usage())`.
- The input handler's last branch (:1176) becomes `renderSheet(); renderPicker(); renderMap();`.
- That closes the three cases where the map would otherwise go stale:
  - typing a route name;
  - a round change that flips no clash, where `liveSig` stays the same (:336-342);
  - a registration edited in the rail (:462-479) or on the Cars tab (:893).
- Renaming a position or a label happens on another tab, and switching tabs calls `render()` (:1670).
- A keystroke never replaces the scroll box itself, so its sideways scroll stays. Full redraws restore it through `planScroll` (:727-736).

**No notices.** Nothing is added to `problems()`, `liveSig` or the sheet. A first run must show zero notices (smoke.mjs:50), and `screens` asserts the exact warning list (screens.mjs:143-154).

### G. Selector rules

Playwright locators are strict, and several tests count across the whole Day plan or the whole document. The map never uses any of these:
- `<table>`, `thead`, `tbody` or `tr`. Route rows are counted as `#tab-plan tbody tr` throughout.
- The classes `.grid`, `.problems`, `.pool`, `.chip`, `.plan-table`, `.rail*`, `.day*`, `.tpl*` or `.empty` (smoke.mjs:49 reads `#tab-plan > .empty`).
- The attributes `data-kind`, `data-id`, `data-field`, `data-panel`, `data-route`, `data-act`, `data-drag` or `data-drop`.
- `<img>`, `position:fixed`, or any `style` other than `--c:#hex`. smoke.mjs:1839-1845 scans the whole document.

### H. Branch flow

1. **With the owner's go, items 1–2 may run while pack 5 does.** They work on `parking-map-model`, a sibling worktree cut from `dev` that writes only `docs/map.js` and `scripts/map.mjs`.
   - Their gate is `scripts/check.sh` plus `node scripts/map.mjs`.
   - They never merge into `dev` on their own, because pack 1's cadence rule makes every shipped `docs/` change cut a version.
2. **After pack 5 merges,** `parking-map` is cut from `dev` and `parking-map-model` is merged into it. The files are new, so nothing conflicts. Line numbers are re-derived there.
3. **Items 3–9** run in order, by one agent.
4. **At start:**
   - `INVENTORY.md`'s 💭 line (:87) becomes 🚧 under **Day plan**, pointing at this manifest.
   - The container's status line names pack 6.
   - The container's parallel-work sentence (:64-67) is corrected: the model is checked by `scripts/map.mjs` in node, not by a smoke case.

## Items

- [x] **1. Match positions to the map.** New `docs/map.js` with `ParkingMap.model` and `GATE_NAMES` (Designs B–D). New `scripts/map.mjs` loads it through node `vm`, the way pack 1's `versions.mjs` reads `updates.js`. Only these two files change. This is the carve-out, on `parking-map-model`.
  *Done when:* `node scripts/map.mjs` passes with every input deep-frozen, and every gate expectation is read from `GATE_NAMES`. It covers:
  - **The fixture**, with the buckets built the way `usage()` builds them:
    - Spot 1–5 hold their positions;
    - the gate holds Port 1;
    - Port 2 is the only entry under Not on the map;
    - Garage appears nowhere.
  - **Spot 2** reads `Round 1`, `route 2 · EL 41033`, then `Round 2`, `route 9 · EV 73112` and `route 10 · EV 73140`. It is red, tagged `Taken by 2 routes in round 2`, with both round-2 lines marked.
  - **Status:**
    - Spot 5 shows `Unavailable · Resurfacing until Friday`;
    - a `labelId` with no such label does not count as out of use;
    - a label with a blank name reads `a status with no name`.
  - **Matching:**
    - ` spot 1 ` matches;
    - a second Spot 1 is listed as `Also called Spot 1; the map shows the first one.`, and the first box never reads `Free`, even when only the twin has a route;
    - renaming Spot 5 leaves `No position named Spot 5` and lists the new name;
    - `Gate` matches when no earlier gate name exists;
    - a name of only spaces reads `A position with no name`.
  - **Wording:**
    - round 2 sorts before round 10;
    - a round `A` reads `Round A`;
    - a box where no route has a round has no headings;
    - a box mixing blank and filled rounds puts the blank-round routes last, under `No round`;
    - a route with no car reads `route 2`, and a blank name reads `route -`;
    - a bucket marked `clash: false` is never red, however many routes it holds;
    - a position with `multi` shows `Many cars`.
  - **Safety:**
    - ids of `__proto__` work;
    - the inputs are deep-equal before and after;
    - `ParkingMap` is the only top-level name `map.js` declares;
    - declaring every top-level name of the other `docs/*.js` files in the same `vm` context afterwards raises nothing.
  - `scripts/check.sh` OK.
- [x] **2. Turn the model into markup.** `ParkingMap.drawing(model)` and `ParkingMap.others(model)` in `docs/map.js`. They draw:
  - the six boxes, with `parking` classes and `data-position` on matched boxes;
  - the lane with Entrance 1;
  - the hatched areas, with `aria-label="Not parking"` and no text;
  - the Not on the map list.

  They use their own escaping and colour check, and follow the Design G rules. Still only the two new files change.
  *Done when:* `node scripts/map.mjs` also shows:
  - the six boxes are always present, in order, and `data-position` appears only on matched boxes;
  - a position named `<b>x</b>`, a label named `"><img src=x>` and a position id `"><img src=x onerror=…>` all come out escaped;
  - every `style` attribute matches `^--c:#[0-9a-f]{6}$`, and a colour of `red;position:fixed` falls back;
  - a scan of the output finds none of Design G's reserved markup;
  - a red box carries its tag as text, not only as a class;
  - `others()` returns `''` when nothing is listed.
- [x] **3. One double-booking rule for the warnings and the map.** This runs once pack 5 has merged and `parking-map` is cut, with `parking-map-model` merged in. Add `doubleBooked(entries)` beside `spotKey` in `docs/app.js`. It is true for two or more routes when the position exists and is not ticked Many cars. The clash loop in `problems()` (app.js:321-328 today) uses it, and nothing else changes. First, check whether `renderSheet()` still reads `problems()` after pack 2.
  *Done when:*
  - Every existing clash case passes unchanged: smoke.mjs from :756 on, :842-861 and :863-916.
  - Screens' exact warning list (screens.mjs:143-154) passes unchanged.
  - If the sheet still reads `problems()`: its markup is byte-identical before and after, for both the dev fixture and the screens data. Capture it on both commits and record it in the Ledger.
- [x] **4. ⚠️ Mount the map in pack 5's slot.**
  - **`index.html`:** the `map.js?v=⟨APP_VERSION⟩` tag, after `share.js` and before `app.js`.
  - **`app.js`** (Design F): the card, with its heading, hint and two containers, placed in pack 5's slot in `renderPlan()`. `mapParts(use)` builds the plain copies and the buckets with `doubleBooked`, and is guarded by `typeof ParkingMap` and a try/catch.
  - **`package.json`:** `map.mjs` joins `npm test` after `versions.mjs`, and `test:map` is added.
  - **Smoke:** the new cases come with this item.

  *Done when:* smoke shows:
  - **The fixture:** once it is imported, Spot 2's box is red, with both round-2 lines and its tag. Port 2 is under Not on the map, and Garage is nowhere.
  - **Parity:** in every `spotPlan` case (smoke.mjs:867-916), the red boxes are exactly the spots the banner names. That covers the same round, two blank rounds, `' a '` with `'A'`, and different rounds (none red).
  - **A Many-cars case of its own.** `spotPlan` hard-codes a Garage, which the map skips, so this case uses Spot 1, plus Spot 2 with Many cars ticked and two routes in round 2.
    - There is no banner, Spot 2 is not red, and both lines show with `Many cars`.
    - **Proved to bite:** with `doubleBooked(e)` swapped for `e.length > 1` in the hand-over, Spot 2 turns red. Tried, not committed, and recorded in the Ledger.
  - **First run:** zero notices; Spot 1–5 read `Free`; the gate box reads `No position named Port 1`.
  - **Rename:** Spot 3, renamed on the Positions tab, is listed, and its box reads `No position named Spot 3`.
  - **Nothing saved changes:** on the fixture, `JSON.stringify(state)` and `localStorage['carcoord:v1']` are identical across a `render()` and a `renderMap()`.
  - **Missing tag.** In a fresh `browser.newContext()` with its own console and page-error listeners (as at smoke.mjs:1812-1816), `index.html` is served through `route()` without the map tag.
    - The route rows draw.
    - `Reload the page to see the parking map.` shows.
    - There are no errors.
    - The context is closed afterwards.
  - **The map throws.** In another fresh context, `map.js` is served as `const ParkingMap = { model() { throw new Error('x'); }, drawing() { return ''; }, others() { return ''; } };`.
    - `#tab-plan tbody tr` counts every route.
    - `The parking map could not be drawn; the plan above is not affected.` shows.
    - There are no console errors. `console.warn` is allowed, because smoke.mjs:42 collects only errors.
    - The context is closed afterwards.
  - `versions.mjs` passes with the new tag.

  **Risky — review individually.** It puts new code into every draw of the Day plan, and the Day plan is drawn first in `render()` (app.js:1134).
- [x] **5. Draw it as the yard.** In `style.css`:
  - the Design E grid, as one `grid-template-areas` rule;
  - the outline, the lane with Entrance 1, and the hatched areas;
  - the red clash style, the status dot and the dashed empty box;
  - the scroll box, with `overflow-x:auto` and a minimum width for the drawing;
  - pack 3's tokens only.

  *Done when:* smoke shows:
  - **At 390px, the map scrolls in its own box.** The map card's `scrollWidth <= clientWidth + 1`, and its scroll box's `scrollWidth > clientWidth`.
    - **Proved to bite:** dropping the box's `overflow-x` fails this check. Tried, not committed.
    - The phone-width loop at smoke.mjs:1783-1802 cannot see this, because `.tab` scrolls at ≤760px (style.css:360).
  - **At 390px, the scroll position survives a redraw.** A `scrollLeft` set on the map's box survives a `render()` caused by a state change (the pattern at smoke.mjs:1567-1572).
  - **In print,** the map has no boxes (`getClientRects`, as at smoke.mjs:1731-1752).
  - **Colours:** a grep finds no literal colour in the `parking` rules, and every new token has a dark value.
- [x] **6. Keep the map live while typing.** Add `renderMap()` to the input handler's last branch (app.js:1176 today), as in Design F.
  *Done when:* smoke shows:
  - Each of these updates the map at once, with focus still in the same box and the caret unmoved:
    - typing a route name;
    - changing a round from 1 to 2 with no clash on either side;
    - editing a car's registration in the rail;
    - typing the name of the route on Port 2, which updates the list.
  - At 390px, the map's sideways scroll survives a keystroke.
  - Item 4's missing-tag and map-throws cases now also type into a route name and a round. `carcoord:v1` takes the keystrokes, and there are no errors.
- [x] **7. Say the rule where spots are renamed.** The Positions hint (app.js:920 today) gains: `The parking map on the Day plan finds Spot 1 to Spot 5 and the gate by name; a renamed spot moves to the list under it.`
  *Done when:* the sentence shows on the Positions tab, and that tab's phone-width check still passes.
- [ ] **8. Screenshots and README.**
  - **`screens.mjs`:** after the day-plan walkthrough, assert the map's state and write one more screenshot. All assertions are written against `GATE_NAMES`.
    - Spot 5's box reads `No position named Spot 5`, because it was renamed Port 3.
    - Port 3 and Spot 6 are under Not on the map, and Spot 6 shows `Out of service · Pallet jack parked in it`.
    - Spot 1 is red and tagged `Taken by 2 routes in round 1` (routes 1 and 5), with `route 8` under `Round 2`.
    - The gate box reads `No position named Port 1`.
  - **README:** one line for the map in Features (README.md:21-31 today), and `npm run test:map` under Tests (:51-58).

  *Done when:* `npm run screens` exits 0 with those assertions and no console errors, and the README has both lines.
- [ ] **9. Announce Parking map and cut 0.8.0.** Pack 1's Design H, in one commit:
  - the entry below goes at the top of `docs/updates.js`;
  - the six version places move to 0.8.0 (re-check that pack 5 took 0.7.0).

  ```js
  {
    version: '0.8.0',
    must: false,
    title: 'A parking map under the route list',
    changed: 'A map shows Spot 1 to Spot 5 and Port 1 with their routes by round. A spot the warnings call taken twice is red.',
    affects: 'The Day plan and the Positions tab: the map finds spots by name and lists the rest. The printed sheet and share codes are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  ```

  Checked against Design G:
  - There are no code words. `changed` is 25 words and `affects` is 25.
  - "Red" is promised only where the banner already says "taken", so Many-cars spots are covered.
  - Both affected tabs are named.
  - `must: false`, because `data` is the "Nothing … changes" sentence, and neither the sheet nor share codes change.
  - `Port 1` becomes the owner's answer to question 2.
  - Re-read "under the route list" against pack 5's final slot.

  *Done when:* `versions.mjs` passes at 0.8.0, smoke reads `UPDATES[0].version === APP_VERSION` with no console errors, and the entry has been re-read against what shipped.

## Owner questions

**Answered by the owner, 2026-09-29.**
1. The yard is **as described** in Design E.
2. The gate's position is named **`Gate`**: the map's gate constant is exactly `Gate`, not `Port 1`.

1. **Is this the yard?**
   - **Top row:** a side room on the left, Spot 5 across the top of the lane, and the gate in the right wall at the top right.
   - **Below it, left to right:** Spot 4 in its bay, with a second side room under it; the driving lane, with Entrance 1 at its foot; Spots 3, 2 and 1 stacked down the lane's right side, with 1 nearest the entrance; and the hatched building or dock on the right.

   *Blocks only item 5.* A correction is one CSS rule. Until you answer, the map uses the drawing in Design E.
2. **What is the gate called on your Positions tab?** The test data has Port 1 and Port 2, and this plan assumes Port 1. A name like "Port 2" doesn't identify the site. The map will match the name exactly as it is, so nothing needs renaming, and renaming would change the printed sheet. *Blocks only the gate constant in item 1.* Until you answer, the map tries `Port 1`, then `Port`, then `Gate`.

## Out of scope

- The map on the printed sheet. `main` never prints, and nobody asked for it there.
- Clicking, dragging onto or right-clicking a spot. Pack 8 may later open the position menu from `data-position`.
- A switch to hide or collapse the map.
- Anything for the garage, on the map or in its list.
- Adding Port 1, or any position, to `defaults()`. Also a layout editor, and yards other than this one.
- Name matching in share codes.
- Rewording tour step 2 (tour.md:205), which belongs to pack 9.
- **Found while planning, for the container's list:** the rail's "Route N" badges go stale while a route name is typed. The input handler only watches round and driver (app.js:1159), although `liveSig` includes the name (:340). This predates this pack, and `renderMap()` does not fix it.

## Gates

- **Item gate:** `scripts/check.sh`, which runs pack 1's `versions.mjs`, plus:
  - for items 1–2: `node scripts/map.mjs`;
  - for items 3–7: the targeted smoke run, `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`.
- **Pack gate:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, which now includes `map.mjs`;
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens`;
  - `npm run upgrade -- ⟨previous dev build⟩`, with the expectations under Saved data.

  Say that the suite ran on system Chrome, not the browser CI uses.
- **Review:** one pass for the pack, with item 4 reviewed individually.
- **Browser walkthrough, before the PR into `dev`:**
  1. Import the dev fixture.
  2. The owner compares the map with their drawing and reads Spot 2's box.
  3. Clash, then un-clash, Spot 2 by typing route 10's round. The red box and the banner line come and go together.
  4. Rename Spot 3 on the Positions tab and see it move into the list, then rename it back.
  5. At a 900px window and at 390px, the page never scrolls sideways, and the drawing scrolls in its own box.
  6. Print preview shows no map.
  7. Check dark mode.
  8. Re-read the 0.8.0 entry against what shipped.
- **At close:**
  - `INVENTORY.md`'s entry becomes ✅;
  - the container's status line moves on;
  - `git log` since pack 5 is swept into the docs.

## Ledger

- **2026-09-30, start (combined pack, part 6).** Built on `review-round` after part 5, base 737117a (0.7.0); no `parking-map-model` carve-out, since one builder works in order (Design H's steps 1-2 collapse into items 1-2 on the same branch). INVENTORY's 💭 line is a 🚧 pointer under Day plan, and the container's parallel-work sentence says `scripts/map.mjs`, not a smoke case. **Owner question 2:** `GATE_NAMES` is exactly `['Gate']`. Every expectation that assumed Port 1 is read against that: the dev fixture's Port 1 and Port 2 are both under Not on the map, and the gate box reads "No position named Gate". **Reconciled with part 5 as built (deviation):** part 5 left a `#planMap` slot drawn by `mapSlot(use)` against a `ParkingMap.render(state, use)` contract. This pack's Design F (app.js draws the card and its two containers even without `map.js`, and fills them from `ParkingMap.model/drawing/others` behind a `typeof` guard and a try/catch) is built inside that same slot, in `mapSlot`; the `render` hook is not used, and part 5's item-9 smoke case is rewritten in item 4 to this behaviour. The contract's safety rules (pure, a string, no writes, the markup rules) all still hold. **Batched rule:** `check.sh` per item; `scripts/map.mjs`, smoke and screens run at the end of part 9, and the upgrade check only from v0.2.4.
- Item 1 done, b264d69. `docs/map.js` with `ParkingMap.model` and `GATE_NAMES = ['Gate']` (Designs B-D); `scripts/map.mjs` loads it through `vm`, freezes every input, and reads the gate from `GATE_NAMES`. With the owner's `Gate`, the fixture's Port 1 and Port 2 are both listed, so the "Port 2 is the only entry" expectation becomes "every position that is not a spot, the gate or the Garage is listed, in order". **Deviation:** `package.json` gains `map.mjs` in `npm test` and `test:map` here rather than in item 4, so the node check is in the suite from its first commit. Not run under the batched rule (`map.mjs` runs with `npm test` at the end). Gate: `check.sh` OK.
- Item 2 done, 36c34f4. `ParkingMap.drawing` and `ParkingMap.others`, with their own `esc`. A label colour that fails `^#[0-9a-f]{6}$` gets no style at all (the CSS falls back), so `map.js` holds no colour literal and the colour guard's JS list needs no entry for it. The hatched areas are `role="img" aria-label="Not parking"`. `map.mjs` gains: six boxes in order, `data-position` only on matched boxes, the red tag as words, hostile names, labels and ids escaped, every style `--c:#hex`, no reserved markup, and every class token starting with `parking` (checked by token, since `parking-empty-text` would trip a word match on `empty`). Gate: `check.sh` OK.
- Item 3 done, ae02da0. `doubleBooked(entries)` beside `spotKey`; the clash loop in `problems()` asks it and is otherwise unchanged. **Checked first:** `renderSheet()` no longer reads `problems()` (part 2, item 2), so there is no sheet markup to capture. The existing clash cases and screens' exact warning list run at the end. Gate: `check.sh` OK.
- Item 4 done, df37b50. **Awaiting individual review** (in the combined review). The `map.js?v=` tag sits after `share.js`, before `updates.js` and `app.js` (`versions.mjs`: "all 7 local tags"). Design F inside part 5's slot: `mapParts(use)` (the `typeof ParkingMap` fallback, plain copies, `doubleBooked` verdicts, try/catch with `console.warn`) and `mapSlot(use)`, which now always draws the card (heading, hint, `#parkingDrawing` with `data-keep-scroll="parking"`, `#parkingList`). Part 5's `ParkingMap.render` hook is gone, and its item-9 smoke case is replaced by this item's: the slot after the week, the dev fixture (Spot 2 red with both round-2 lines and its tag; Port 1 and Port 2 listed under the owner's `Gate`; no Garage), `render()` saving nothing, parity with the warnings for the same round, two blanks, ' a ' with 'A' and different rounds, a Many cars case, a first run (no notices, five Free, the gate box looking for its name), a rename moving to the list, and, in contexts of their own, index.html without the tag and a throwing `map.js` (routes drawn, the words shown, no console errors). **Not done:** the "proved to bite" swap of `doubleBooked(e)` for `e.length > 1`, which needs a run. Gate: `check.sh` OK.
- Item 5 done, 5ccd33d. Design E's grid as one `grid-template-areas` rule (owner question 1: the yard as drawn), `min-width: 620px` inside `#parkingDrawing` (`overflow-x: auto`), tokens only. New tokens `--hatch` (#b9bcb6 / #4a5157) and `--clash-fill` (#fdecea / #3a1f1f), in `:root` and both dark blocks; the warn tag on the clash fill is 4.9:1 in light and 5.4:1 in dark (computed). The status dot is `.parking-dot`, lifted in dark like the labels. Smoke (layout context): at 390 the card fits and its box scrolls; the box keeps its sideways place across a redraw; in print no box has a rect; `--hatch` and `--clash-fill` differ in dark. The dark contrast list gains a spot's title, an unmatched spot's line and the entrance. **Not done:** "dropping overflow-x fails the check", which needs a run. Gate: `check.sh` OK.
- Item 6 done, c25022e. `renderMap()` refills `#parkingDrawing` and `#parkingList` from `mapParts(usage())`, and the input handler's last branch calls it. Smoke (layout context, the dev fixture): a route name, a round moved from 1 to 3 on route 1 (the dev fixture uses round 2 in every spot, so 1 to 2 would clash), a registration typed in the rail, and a route on Port 1 (listed under the owner's `Gate`) each update the map with focus and caret kept; the drawing's sideways scroll survives a keystroke at 390; the missing-tag and throwing-map contexts type into a route name and a round and still save. Gate: `check.sh` OK.
- Item 7 done, 8e596a4. The sentence as planned, appended to the Positions hint; smoke checks it on the tab, and the existing phone-width loop covers the tab at 390. Gate: `check.sh` OK.
