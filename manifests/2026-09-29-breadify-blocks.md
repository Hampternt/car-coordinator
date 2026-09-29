# Pack: Breadify — one-look marker, one block per customer

**Status:** 🚧 go given 2026-09-29 (plan now, build alongside), and both owner questions answered. Building on `breadify-blocks`.
**Date:** 2026-09-29
**Branch:** `breadify-blocks`, cut from `dev` and merged back into `dev` through a PR. It shares three files with the review-round packs: README.md, INVENTORY.md and `scripts/check.sh`. In `scripts/check.sh`, item 1 changes only the loop line at :38. update-note edits that file's header and tail, not :38.

## Goal

This pack changes Breadify's web version only. The Rust desktop app and its docs stay as they are.

- **One look for the substitute marker.** Every order prints `want substitute: true` or `want substitute: false` in the same quiet type. When it is false, only the word **false** is bold.
- **One block per customer at a stop.** A customer can have several orders (several order ids) at one stop on a route. Those orders print in one block, under one customer heading.
  - Each order keeps its own line with its order id, crates and marker, and its own bread lines below it.
  - Nothing is added together. "1 Kneippbrød" and "1 Kneippbrød" stay as two lines under two order ids.

Both are deliberate departures from the Rust spec, and the port says so wherever those D-numbers are cited:
- the marker: D8 and D21;
- one block per customer: D16, with D20 and D2 following from it.

Three smaller changes come with the pack and are named in Decisions:
- a missing Order ID is flagged at Check;
- a cut order's crates print once;
- the "no position assigned" flag never ends a page on its own.

Breadify changes get no Car Coordinator update-note entry and no version bump.

## Agent brief

Read first:
- **This manifest.** Then README.md:18, which says the port follows the Rust app's `print-spec.md` and D1–D25 / F1–F10. Then INVENTORY.md:45-78, the Breadify section.
- **`docs/breadify/model.js`:**
  - `readRows` builds each row at :167-185: `orderId` at :169 goes through `integer()` (:84-88), and `quantityExact` (:171) is the pattern to copy, using `exactNumber()` (:98-102).
  - `fold` (:337-376) makes one order per order id. Its comment is at :333-335.
  - The sort: `printingPosition` (:433-441) with its D2 comment (:425-432), `sortStops` (:443) and `group` (:449-464).
  - Counts: `unsequencedStops` (:466-468) and `lineCount` (:470-472).
  - Crates: `slots` (:530) and `crateCount` (:544).
  - `routeCrates` (:564-570) makes the pallet call.
  - `routeTotal` (:580-600) counts tray dots per line (:590-592). `flatTotal` (:622) is built on it.
- **`docs/breadify/layout.js`:**
  - The header's D9 sentence (:10-15).
  - The crate glyphs (:122-161): `crateGlyph`, `crateRun`, and `crateCompact` (the ×N form, D24).
  - `marker` (:163-180), `stamp` (:182-194), and `heading` with its measured `place` / `placeCrates` (:209-270).
  - `breadLine` (:284-310).
  - `stopSlice` (:312-332), `stopPieces` (:334-379) and `stopBlock` (:381-398). The freezer's zero crates are at :386-389.
  - `unsequencedFlag` (:400-409).
  - `masthead`'s page counter (:652-653), fed by `day()` at :982.
  - `pageNote` (:660-700): the right half is at :675 and the stop counts at :682-683.
  - `supplierKey` (:784-790).
  - `shareOut` (:835-854) and `rebalance` (:857-875).
  - `paginate` (:886-972), which walks the stops at :935-940.
- **`docs/breadify/app.js`:**
  - `CRATE_KEY` (:16). Only the crate rules are ever stored (:65-82).
  - The settings (:27-33), with `marker` at :31.
  - `productsById` (:118-125).
  - The Check step stats (:208-212) and the route list (:358).
  - The marker buttons: drawn at :275-280, handled at :467-472.
  - `rebuild` (:369-385), which has no try/catch today.
  - `renderActions` (:160-190). It shows "Continue anyway" when a blocking finding exists.
- **`docs/breadify/index.html`:** the Show-the-order-ID toggle and its hint (:74-80), the marker choices (:83-95), and the script tags (:177-181), which carry no `?v=`.
- **`docs/breadify/sheet.css`:**
  - The header (:1-12) and Plex Mono 700 (:70-74).
  - `.bf-block-part` (:355-362).
  - The D16 comment (:386) and `.bf-block-barred` (:392-397).
  - `.bf-head-line` (:400-409).
  - The stamp column (:465-480), with its D20 comment at :465-466.
  - The markers (:482-499) and `.bf-order-id` (:501-506).
  - The zebra rule (:524-530).
- **`docs/breadify/style.css`:** the shared `.row em, .choices em` selector (:548-555) and the `.choices` rules (:557-581).
- **`docs/breadify/validate.js`:** `blankRequiredFields` (:83-109), `ordersThatDisagree` (:116-159), `addressesOnTwoRoutes` (:169-186) and `run` (:459-479).
- **`scripts/breadify.mjs`:**
  - The bread stats (:92-101) and the findings (:103-110).
  - The data spine (:118-160).
  - The route 8 table (:168-179), Customer 012 (:205) and the pallets (:208).
  - The sheet scrape (:231-272), with `blockProse` at :261-269.
  - Route 8's block count (:303-307) and the sequence-leak test (:332-369).
  - The freezer checks (:400-475): 21 sheets at :441-447, note fields at :469-473.
  - The EDGE loop (:498-653): across at :572, overlaps at :588-603, clipping at :605.
  - The nonsense scan in SHAPES (:731).
  - `twoRoutes` (:776-795) and `crowded` (:828-891).
- **`scripts/make_edge_fixtures.py`:** `line()` (:93-98), `KEEP` (:178-184), and the bakeries' product ids from `hash()` (:225-232).

How the items run:
- One agent does the items in order. Items 5–9 all write `layout.js`.
- Items 1–6 can start on the go. Item 7 waits for owner question 1, and item 8 for questions 1 and 2.
- There are no dependency edges on the review-round packs.
- The `dev` worktree has an untracked `--1.ppm`, so every commit names its paths.

## Decisions taken

| Decision | Choice |
|---|---|
| Web version only | The Rust app and its docs don't change. The port departs from D8/D21 (the marker) and D16 ("one order, one block"). Following from D16, it also departs from D20 (one stamp column per block) and from D2 (the tie-break gains the customer). D9 ("no stop block split") was already departed from for a stop taller than a page. Each departure is written into the comment where its D-number is cited, and into README.md:18. |
| Marker wording | `want substitute: true` and `want substitute: false`, lowercase. That is how the true form prints today, so a true order prints exactly as now. Both use one style: Plex Mono 500, 9.2 pt, quiet ink. |
| What is bold | Only the word `false`, in Plex Mono 700, which is already self-hosted (sheet.css:70-74). Same size, same ink. The owner asked for bold alone, so full ink was considered and not taken. |
| Badge and bar | Removed, along with the choice on the Configure step. The owner asked for one look every time, and a bar down a block of several orders would mark its true orders too. The choice was never saved (only the crate rules are, app.js:16, :65-82), so nothing needs migrating. |
| Page note's right half | Dropped (layout.js:675). It explains the loud capitals, and every order now states its own value. The pallet call on the left gets the room. |
| "Same customer" (default; owner question 1) | Orders merge when they share the route, customer name, department (or both have none), delivery street and route ordering, compared as exact trimmed text. Bread: 4 groups merge, so 148 orders print as 143 blocks. Freezer: 5 groups, so 115 orders print as 107 blocks. No merged group mixes true and false today. |
| The street is always in the key | The address is never printed, so merging two streets would hide a second drop-off. A customer at two streets keeps one block per street, as today. |
| Where a customer's orders print | The tie-break gains the customer name before the order id, so a stop's orders always sit next to each other. No rule is needed for orders scattered down a route. Checked: this reorders nothing in either sample. A customer at two positions on one route stays two blocks. |
| Exact matching | Two spellings of a name or a street stay separate. That is exactly today's print, so it is never a wrong one. |
| Per order, never per block | Order id, lines, crates and marker all belong to the order, and nothing is added up. For example, Customer 092's two orders print 2 full + 1 half crates each. Summed, they would print 4 full + 1 half: one crate fewer than is packed. The pallet call and the route total read the flat list of orders and don't change. |
| The order id | In a block of several orders, every order line prints `Order ⟨id⟩` in full ink, whatever "Show the order ID" says, because the id is what tells the orders apart. The toggle still controls one-order blocks, and its hint (index.html:78-79) says so. |
| One-order blocks | Unchanged apart from the marker. That covers 138 of 143 bread blocks and 102 of 107 freezer blocks. |
| Data shape | `route.orders` is the flat, sorted list that every sum reads. `route.stops` is the grouped list the page walks. A stop has no `lines` of its own, so nothing can add across orders by accident. One constructor builds both: `Model.route(nickname, orders)`. |
| What "stops" counts | Blocks, everywhere it appears. The bread Check step reads 16 routes, 143 stops and 352 lines. |
| A missing Order ID | A new blocking finding: `Order ID is empty or not a number on row N`. Blocking in the house sense (INVENTORY.md:54): the Check step says the pages would be wrong, and **Continue anyway** stays the leader's call. Today such rows read as 0 and quietly fold into one order. |
| Wrong values fail loudly | `marker()` throws on anything but `true` or `false`. The code that prints an id throws on anything but a number. `rebuild()` catches the error: no sheets, Print disabled, and one sentence saying why. A stop passed where an order belongs can then never print "false" or "undefined". |
| Cutting a block taller than a page | Whole orders go first. Only an order taller than a page by itself is cut between its lines. The rules cover both one-order and several-order blocks (Design D). |
| Changes beyond the ask | Both come in item 9, and the walkthrough looks for both. (1) A cut order's crates print once, on the part where it starts. Today each part shows crates for its own lines only, and the parts can add up to more than the order needs. (2) The "no position assigned" flag never ends a page on its own. |
| Freezer sheet | Same blocks and order lines, without crates, which are already forced to zero (layout.js:386-389). The flat total adds up by product and is unaffected. |
| Validation | The Order ID check is the only new one. Merging never crosses routes, so `address-on-two-routes` is unchanged. |
| Where the pack sits | A standalone pack: the review-round container excludes Breadify ("Not in this container"). No update-note entry and no version bump, because the release rule exempts `docs/breadify/` and `scripts/` isn't shipped. It reaches `main` only after the owner has tested `dev`. |

## Design

### A. The marker

`marker()` returns one `.bf-marker` span for both values:
- `want substitute: true`, or
- `want substitute: ` followed by `<b>false</b>`.

Every order prints one, as today. A new rule sets `.bf-marker b` to weight 700 and nothing else changes: same face, size and ink.

`stamp()` and heading()'s measured placement stay as they are. The new text is about as wide as the old loud form, and the placement measures it anyway.

These are deleted: the treatment setting and its UI, the bar, the badge, `.bf-marker-loud`, and the right half of the page note. The D8/D21 comment becomes a departure note: the web port prints one look, and the Rust app still prints the asymmetric marker.

### B. What a stop is

`fold()` is unchanged: one order per order id. `Model.route(nickname, orders)` then does two things:
1. It sorts by `printingPosition`: sequenced or not, sequence, street, department, **customer**, order id.
2. It groups neighbouring orders that share customer, department, delivery street and sequence into one stop: `{customer, department, deliveryStreet, route, sequence, orders}`.

Who reads which list:
- **`route.orders`** is read by `lineCount`, `routeCrates`, `routeTotal` (and `flatTotal` through it), `supplierKey` and `productsById`.
- **`route.stops`** is read by:
  - the `paginate` walk;
  - the page counter (through `day()`);
  - the page note's count;
  - `unsequencedStops`, and through it the "with no position assigned" and "unplaced" counts;
  - the Check step stats;
  - the route list.

Two things stay true:
- The sequence is in the grouping key, so a stop is either wholly sequenced or wholly not, and the unsequenced flag stays clean.
- Tray dots are counted per line, so Kneippbrød keeps its 4 dots and the note's "inside a single order" still holds.

### C. The block

**A stop with one order** renders exactly as today.

**A stop with several orders** renders like this:
- **One heading:** the name line, plus the department box when there is one. Nothing sits at the heading's right.
- **For each order,** in order-id order:
  - An order line, `div.bf-head-line.bf-order-head`. At the left, `Order` and its `.bf-order-id`. At the right, that order's own crates and marker.
  - That order's bread lines, in file order, in their own `.bf-lines`. The zebra striping restarts under each order line.
- **A hairline** above every order line after the first.

The order line reuses heading()'s `place` / `placeCrates`, factored out: full glyphs first, then the ×N compact form (D24), then a spare line below. It is measured, never assumed to fit.

Styles and classes:
- In an order line, the id is set by `.bf-order-head .bf-order-id`: Plex Mono 500, 9.2 pt, full ink.
- Order lines are never `.bf-row`, which would upset the freezer's note-field count, and never `.bf-block`, which would upset route 8's 5 blocks.
- Order lines are `.bf-head-line`, so the overlap check covers them.

The freezer block is identical apart from the crates.

Example: route 11, Customer 017, no department. ■ is a full crate and ▪ a half.
```
Customer 017
Order 1000619017                            ■  want substitute: true
P   7  SB  Kneippbrød …                                        M  F
────────────────────────────────────────────────────────────────────
Order 1000619019                            ▪  want substitute: true
P   4  SB  Kneippbrød …                                        M  F
────────────────────────────────────────────────────────────────────
Order 1000619029                            ■  want substitute: true
P  10  SB  Kneippbrød …                                        M  F
```

### D. Cutting across pages

`stopPieces` and `stopSlice` are rewritten over segments. A segment is an order, some or all of its lines, and whether it is continued. The rules:

1. **Filling parts.** Parts are filled greedily with whole orders.
2. **Measuring.** Every part is built exactly as it will print and measured before it is accepted. Nothing reuses another part's measurement. Today's reuse (layout.js:351-352) only worked because every slice had the same heading.
3. **The part tag.** Trial parts carry a stand-in tag as wide as `part 99 of 99`. Final parts get their real tag, which is never wider.
4. **Where a cut can fall.** Only an order that doesn't fit a fresh part whole is cut between its lines. The cut is found by measuring (halve, then step up), as today.
5. **No bare order line.** An order line never ends a part without at least one of its lines under it.
6. **The heading.** Every part repeats the customer heading with `part N of M`.
7. **Several orders.** A continued order opens its part with `Order ⟨id⟩ continued` and its marker, and no crates.
8. **One order.** Every part carries the heading and the stamp: the marker, plus the id if the toggle is on. Crates print on part 1 only, and there is no order line.
9. **Crates print once per order,** on the part where the order starts. Today `stopSlice` (:321-322) hands each slice to `stopBlock`, which counts crates from that slice's lines only.
10. **The flag.** The stop right after the unsequenced flag is packed against the limit minus the flag's height. Today a stop whose height falls between (limit − flag) and limit pushes the flag onto a page of its own.
11. `shareOut` and `rebalance` are otherwise unchanged; they already take pieces whole.

Until item 9 lands, item 8 uses an interim fallback: a several-order stop taller than a page prints one block per order, through today's `stopPieces`.

### E. The new edge fixture

`one-customer-many-orders` is a bread fixture made by `make_edge_fixtures.py`:
- **`line()` gains `accept=True`**, passed through to `acceptAlternatives`. Existing calls are unchanged.
- **Route 1, the tall customer.** One small ordinary stop first. Then one customer with no department, one street passed as `street=`, and one sequence. It has:
  - about 14 orders of 12–25 lines;
  - one order of 80 lines;
  - an identical pair: same breads, same quantities, two ids;
  - two orders with `accept=False`.
- **Route 2, the wide customer.** A name about 120 characters long and a long department, with three orders:
  - one of 250 breads on one line: 25 full crates, too wide for glyphs, so it prints in the compact form;
  - one with `accept=False`;
  - one ordinary order.

Running the script rewrites every KEEP fixture with new zip timestamps. It also rewrites bakeries-3/4/5 with new product ids, because `hash()` is randomised per run. So:
- restore every other rewritten fixture with `git checkout --`;
- commit only the `.py` and the new `.xlsx`, by path.

<details>
<summary><b>F. Tests that change in breadify.mjs</b></summary>

- **:92-101 (item 8):** reads 143 stops, with a comment that 148 orders print as 143 blocks.
- **:103-110 and :404-409:** still exactly two notices each. Item 3 guards this.
- **:133-135 and :139-144 (item 6):** read `route.orders`. The figures don't change: Customer 012 is [9, 13], and the route 8 table stays.
- **:208:** unchanged, because `routeCrates` reads `route.orders`.
- **:231-272 (item 2):** gains the across, overlap, clipping and nonsense pass.
- **:303-307:** unchanged. Route 8 is still one sheet of 5 blocks.
- **:332-369:** the key becomes `orders:` in item 6. In item 7 it goes through `Model.route`, gains a fourth order, and gains a check that the stop names print.
- **:441-447 (item 8):** the freezer sheet count is measured again. If it moves:
  - the Ledger names the route whose count changed and why;
  - the owner looks at it in the browser;
  - only then does the assertion change, noting that 21 is freezer-list.md's figure.
- **:469-473:** unchanged, because order lines are never `.bf-row`.
- **:498 (item 7):** the EDGE list gains `one-customer-many-orders`.
- **:356, :540, :712 and :853 (item 4):** the `marker: 'word-only'` keys go.
- **:572 and :605:** the selectors grow in item 2, and gain `.bf-order-head` in item 8.
- **:776-795:** the row helper gains `orderIdExact` in item 3. The test still holds, because stops carry `deliveryStreet`.
- **:828-891:** the key becomes `orders:` in item 6, then goes through `Model.route` in item 7. In item 9, crates print once across the parts.

</details>

<details>
<summary><b>G. If the owner answers "departments merge too"</b></summary>

- The key drops the department.
- The sort becomes sequence, street, customer, department, id. Checked: this also reorders nothing in either sample.
- The department box moves from the heading into each order line of a several-order block.
- Blocks become 123 on the bread day and 94 on the freezer day.
- Customer 012 on route 14 becomes one block of 9 orders and 30 lines. Customer 037 on route 13 becomes one block of 8. Both must be measured against the page.
- True and false then mix inside real blocks: Customers 061 and 037 on the bread day, and Customer 017 on the freezer day. The per-order marker already handles that.
- Items 7 and 8 grow. The Customer 012 assertion still holds, because it counts orders.

</details>

## Items

- [ ] **1. The item gate parses Breadify.** `scripts/check.sh` loops over `docs/*.js` only (:38), so no Breadify script is ever parsed. Every item below would pass the gate unchecked. Change that one line to `for f in docs/*.js docs/breadify/*.js; do` and leave the rest of the file alone, because update-note edits its header and tail. Commit `scripts/check.sh` by path.
      *Done when:* `bash scripts/check.sh` prints `ok` for docs/breadify/app.js, layout.js, model.js, validate.js and xlsx.js. It also fails when one of them is given a syntax error (tried by hand, then reverted).
- [ ] **2. Check the sample days the way the edge fixtures are checked.** Today the across, overlap and clipping checks (:572, :588-603, :605) and the nonsense scan (:731) run only on fixtures. None of them looks at the marker or the order id.
      - Factor the across, overlap and clipping pass into one function, and run it on the bread and freezer sample sheets too.
      - Add `.bf-stamp`, `.bf-marker` and `.bf-order-id` to the across and clipping selectors.
      - Scan both sample days' printed text for `NaN`, `Infinity`, `undefined` and `[object`.

      Run it on current `dev` before any other change. A hit is a finding about today's print: record it in the Ledger and stop for the owner.
      *Done when:* the new checks run on both sample days and on every edge fixture, and pass on unchanged code (or the Ledger records what they found). test:breadify passes.
- [ ] **3. Say so when an Order ID is missing.**
      - `readRows` keeps `orderIdExact: exactNumber(cell(COLUMN.orderId))` beside `quantityExact`.
      - `blankRequiredFields` adds a blocking finding of the same kind: `Order ID is empty or not a number on row N`.

      *Done when:* breadify.mjs asserts that two hand-made rows for one customer with no Order ID give that finding for each row, as blocking. The `twoRoutes` row helper (:777-781) gains `orderIdExact` and still reads `blocks === false`. Both sample days still read exactly their two notices.
- [ ] **4. Remove the choice of marker treatment.** Delete:
      - `settings.marker` (app.js:31);
      - the "When a customer refuses substitutes" heading and its three buttons (index.html:83-95);
      - their handlers (app.js:275-280, :467-472);
      - the bar: `bf-block-barred` in `stopBlock` (layout.js:383-384) and its CSS and comment (sheet.css:392-397);
      - the badge: its branch in `marker()` and `.bf-marker-badge` (sheet.css:493-499);
      - the `.choices` rules (style.css:557-581), and `.choices em` from the shared selector (:548-549), keeping `.row em`;
      - the four `marker: 'word-only'` keys in breadify.mjs (:356, :540, :712, :853).

      The loud words stay until item 5.
      *Done when:* `grep -rn "markerChoices\|settings.marker\|bf-block-barred\|bf-marker-badge\|choices" docs/breadify/ scripts/breadify.mjs` finds nothing. The Configure step shows no substitute choices, and test:breadify passes.
- [ ] **5. One look for the substitute marker.** Design A.
      - `marker()` returns the one span. It throws unless `acceptAlternatives` is `true` or `false`.
      - `stamp()` throws unless the id it prints is a finite number.
      - `rebuild()` (app.js:369-385) catches a layout error. It clears `built` and the preview, disables Print, and sets `printSummary` to `The sheets could not be laid out, so nothing will print: ⟨message⟩`.
      - `.bf-marker-loud` goes, and `.bf-marker b` is added.
      - `pageNote` drops its right half (:673-675). Its comment (:660-669) is rewritten, and so is the D8/D21 comment (:163-169), as a named departure.

      *Done when:* breadify.mjs asserts all of this:
      - On both sample days, every `.bf-marker` reads exactly `want substitute: true` or `want substitute: false`.
      - A marker's only child element, where it has one, is a `<b>` reading `false` with a computed weight of 700.
      - 18 markers read false on the bread day and 10 on the freezer day.
      - No `.bf-marker-loud` exists, and the page note carries no substitute text.
      - `Sheet.paginate` throws for a hand-built order missing `acceptAlternatives`, and for one with no id while ids are shown.
      - When `Sheet.day` is made to throw in the page, the Print step shows the sentence, no sheets, and a disabled Print button.

      test:breadify passes, including item 2's checks.
- [ ] **6. Rename `route.stops` to `route.orders`.** A mechanical rename with no change in behaviour. The readers are:
      - model.js:458 (the key), 467, 471, 566, 582;
      - layout.js:682-683, 787, 935, 982;
      - app.js:121, 208, 358;
      - breadify.mjs:134, 139, 549, 718, 789, and the object keys at :336 and :841.

      The UI still says "stops".
      *Done when:* `grep -nF '.stops' docs/breadify/*.js scripts/breadify.mjs` and `grep -n 'stops:' docs/breadify/*.js scripts/breadify.mjs` both find nothing. test:breadify passes with every figure unchanged: 148 stops, the route 8 table, Customer 012 [9, 13], the six pallet routes and 21 freezer sheets.
- [ ] **7. Group each route's orders into stops.** Waits for owner question 1. Design B.
      - Add `Model.route`, and give `printingPosition` its customer tie-break. `group()` and the two hand-built test routes use `Model.route`.
      - The sequence-leak route gains a fourth order with the third order's customer, department, street and sequence. It also asserts that the stop names print, so an empty render cannot pass.
      - Rewrite the comments at model.js:333-335 (fold) and :425-432 (D2) as departures.
      - Add the Design E fixture to KEEP and to EDGE. Nothing renders stops yet, so it prints one block per order for now.

      *Done when:* these new assertions pass:
      - The bread stops total 143, and the freezer stops 107.
      - Route 11 has one Customer 017 stop with no department, holding 1000619017, 1000619019 and 1000619029 in that order. The Department 09 order 1000622398 is its own stop, right after it.
      - Customer 061 on route 11 is three stops, with Department 22's 1000622154 and 1000622155 together.
      - Customer 012 on route 14 is nine stops.
      - Re-sorting both samples by the old key gives the same order ids on every route.
      - In the new fixture, `Model.group(Model.fold(rows))` gives the tall customer exactly one stop holding every one of its order ids, and the wide customer likewise.

      Every existing figure holds, and the new fixture passes every generic edge check.
- [ ] **8. ⚠️ Print a customer's orders at one stop in one block.** Waits for owner questions 1 and 2. Design C.
      - `paginate` walks `route.stops`, and `stopBlock` renders a stop.
      - The order line's id carries the same number guard as `stamp()`.
      - Every "stops" count switches to blocks: the page counter via `day()`, the page note, `unsequencedStops`, the Check stats and the route list.
      - The toggle's hint says ids always print in a block of several orders.
      - A several-order stop taller than a page uses the interim fallback from Design D.
      - Comments rewritten as departures:
        - D16: layout.js:381 and sheet.css:386;
        - D20: sheet.css:465-466 and the header at :9-12;
        - `stamp()` (:182-186), `heading()` (:209-218), `.bf-order-id` (sheet.css:501-502) and the zebra rule (:524-525).

      *Done when:* breadify.mjs asserts all of this:
      - The Check step reads 16 routes, 143 stops and 352 lines on the bread day, and 107 stops on the freezer day.
      - **Route 11, Customer 017:** its no-department block is one `.bf-block` with three `.bf-order-head` lines. They read 1000619017, 1000619019 and 1000619029, each followed by one Kneippbrød `.bf-row` of 7, 4 and 10. Their crate glyphs are full, half, full.
      - **Customer 092:** its two order lines each carry 2 full + 1 half.
      - **Marker per order:** a hand-built stop of two orders, one true and one false, prints `false` only on the false order's line, found by its id.
      - **Show the order ID off:** both ids of the Customer 092 pair and of the Customer 061 Department 22 pair still print, and no one-order block prints an id.
      - **Ink:** every order line's `.bf-order-id` is computed black.
      - **Classes:** no `.bf-order-head` is a `.bf-row` or a `.bf-block`, and `.bf-order-head` joins the across and clipping selectors.
      - **The wide customer:** it prints as one block. Its 250-bread order line carries the compact `×N` form, its refusing order reads false, and nothing overlaps, clips or runs off.
      - **The tall customer:** it prints one block per order (the fallback), and every id prints once.
      - **Unchanged:**
        - route 8 is one sheet of 5 blocks;
        - Kneippbrød has 4 dots;
        - the same six pallet routes;
        - Customer 012 is [9, 13], counted through `route.orders`;
        - the freezer note fields equal its rows;
        - 18 and 10 false markers;
        - nothing nonsensical on either day.
      - **Freezer sheet count:** measured again. Design F says what happens if it moved.
      - Every edge and shape check passes.

      **Risky — review individually.** It changes what every merged stop prints. A marker or crate count attached to the wrong order would print wrong, and only these tests would catch it.
- [ ] **9. ⚠️ Cut a block taller than a page between orders.** Design D, replacing item 8's fallback.
      - Rewrite `stopPieces` and `stopSlice` over segments.
      - Pass the flag's height into the stop that follows the flag.
      - Rewrite the comments as departures: layout.js:10-15 (D9), :312-320 (`stopSlice`) and :334-343 (`stopPieces`).

      *Done when:* these hold for the tall customer, one-giant-stop and the 250-line crowded test:
      - The existing checks pass: nothing off the paper, 10 mm of clearance, no overlaps, nothing clipped.
      - Each part prints exactly one customer heading with its `part N of M`.
      - Every order id prints.
      - Every order's lines print exactly once, in file order.
      - Across all parts, only the 80-line order's id appears on more than one part. Every other order's lines sit on a single part.
      - Every order line in a part has at least one of its lines under it.
      - There is exactly one `.bf-crates` run per order across all parts. For one-giant-stop that means one, not one per part.
      - Continued order lines read `Order ⟨id⟩ continued`, with a marker and no crates.
      - One-giant-stop's later parts carry the heading, the tag and the marker, with no crates and no order line.
      - Only the two refusing orders read false.
      - No sheet's body ends with `.bf-flag`. This holds on both sample days, on every edge fixture, and across a sweep of 30 to 70 lines on an unsequenced stop that follows one sequenced stop.

      **Risky — review individually.** It rewrites the only code standing between a long order and ink off the bottom of the paper.
- [ ] **10. Record the departures in README and INVENTORY.**
      - README.md:18 names the departures and why:
        - the marker's single look (D8/D21);
        - one block per customer at a stop (D16), with D20's one column per block and D2's tie-break following from it;
        - D9: a block taller than a page is cut, between orders first.
      - INVENTORY.md's Breadify section:
        - :54: "Seven checks" becomes "Nine checks". The list gains impossible quantities and colliding supplier codes, and blank required fields now include the Order ID.
        - :58: "A stop block never splits" is corrected.
        - :59: the tie-break reads address → department → customer → order id.
        - :63: rewritten for the one look.
        - The two 🚧 pointers become ✅ entries.

      *Done when:* README names every departure with its D-number, and INVENTORY's Breadify entries describe what shipped, with no 🚧 left from this pack. `grep -rn "one order, one block" docs/breadify/ README.md INVENTORY.md` finds the phrase only where it is named as a departure.

## Owner questions

**Answered by the owner, 2026-09-29, in their words. These override the recommendations below where they differ.**

1. *"They can share block but they are separated by department, and then below that separated by order number in case of multiple orders."*
   - One block per customer at a stop, **departments included**.
   - Inside the block, the orders are grouped **by department**: a quiet department sub-heading, or nothing for orders with no department.
   - Under each department, the lines are kept **apart by order**: one order's lines, then the next order's. Nothing is summed.
   - The street and the route position still separate blocks, because the street is never printed.
2. *"Small text to the right of the bread type, should be visible, not stand out, just something that can be seen if the situation happens where it matters."*
   - When a block holds more than one order, **each bread line carries its order id as small, quiet text at the right of the bread name**. Use the existing `.bf-order-id` look: small and grey, never bold. There is no order heading line and no rule between orders.
   - Each order still has its own crates and substitute marker. Put them in the same quiet style on the first line of each order, so the page stays calm and nothing about one order can be read as another's.
   - A block with one order prints as today. Its order id follows the existing "Show the order ID" setting.
   - The implementer settles the exact placement against the edge and shape fixtures (no overlap, no clipping, the 10 mm clearance), and the browser look before the PR confirms it with the owner.

1. **Does "the same customer" include the department?** The recommendation is yes: merge only orders from the same customer and the same department (or both with none), at the same street and position. That prints:
   - **Route 11:** Customer 017's three no-department orders (7, 4 and 10 Kneippbrød) in one block, then its Department 09 order in its own block right below. So Customer 017 still shows twice, side by side.
   - **Route 14:** Customer 012 stays 9 blocks, one per department.
   - **Route 13:** Customer 037 stays 8 blocks.

   **The other answer** is that departments merge too. Then:
   - Customer 012 becomes one block of 9 orders and 30 lines, with each order line showing its department.
   - Customer 037 becomes one block of 8.
   - Some blocks mix true and false (Design G).

   **Either way,** a customer at two delivery streets stays two blocks, because the street is never printed. Two examples:
   - Bread: Customer 061, at Street 62 and Street 112.
   - Freezer: Customer 171. Its two blocks will look identical, because both have no position and no department.

   Item 7 waits for this.
2. **Is a line per order what you meant?** You wrote that the two Kneippbrød lines go below each other like other breads, with the order id to show they are separate orders. There are two ways to do that.

   **(a) Recommended: a short line above each order.** The order id at the left, the crates and marker at the right, and the breads below as usual:
   ```
   Customer 017
   Order 1000619017                            ■  want substitute: true
   P   7  SB  Kneippbrød …                                        M  F
   Order 1000619019                            ▪  want substitute: true
   P   4  SB  Kneippbrød …                                        M  F
   ```
   **(b) No extra line.** Each order's id, crates and marker sit at the right of its first bread line, with a thin rule between orders:
   ```
   Customer 017
   P   7  SB  Kneippbrød …   1000619017 ■ want substitute: true   M  F
   ────────────────────────────────────────────────────────────────────
   P   4  SB  Kneippbrød …   1000619019 ▪ want substitute: true   M  F
   ```
   How they compare:
   - (a) keeps every bread line exactly as it prints elsewhere, and has room for a long crate count.
   - (b) is one line shorter per order, but it squeezes the bread name, and on the freezer sheet it takes the checker's note field.
   - With (a), the order id prints two ways on one sheet: small and grey at the right of a one-order block when "Show the order ID" is on, and full black as "Order …" at the left of a block of several.

   Item 8 waits for this.

## Out of scope

- The Rust desktop app and its docs (`print-spec.md`, D1–D25, F1–F10). The web port records its departures instead.
- Merging across routes. One address on two routes still prints once on each route, and `address-on-two-routes` stays a notice.
- New checks across orders: one customer at two streets or two positions on a route, or two spellings of one name. These stay separate blocks, which is today's print.
- Counting crates per customer. Crates stay per order.
- Printing the order note (Comment) or the freezer `Position`.
- `blockProse` (breadify.mjs:261-269), which is computed but never asserted. It is left as found. The real guard that the sequence number never prints (D6) is the sequence-leak test, which item 7 extends.
- A Breadify cache key (`?v=`) on its script and style tags.
  - Within Pages' cache lifetime, a browser can mix new and old files.
  - That fails with an error rather than a wrong print, because a stop has no lines of its own to print.
  - The walkthrough starts with a hard reload.
- INVENTORY.md has `## Considered` twice (:75 and :80), with Car Coordinator's list sitting under `# Breadify`. That is left for a docs tidy-up. The wrong check count at :54 is fixed in item 10.
- A Car Coordinator update-note entry or version bump.

## Gates

- **On the go:** move INVENTORY.md:77-78 up under "## The printed sheet", as 🚧 pointers to `manifests/2026-09-29-breadify-blocks.md`.
- **Item gate:** `bash scripts/check.sh`, which parses Breadify from item 1 on. From item 2 on, also `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:breadify` on every item.
- **Pack gate:** `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, both suites, because `check.sh` changed. Say that the suite ran on system Chrome, not the pinned Playwright Chromium that CI uses.
- **Review:** items 8 and 9 individually, plus one pass for the rest.
- **A look at the printed sheets in a browser before the PR.** Open `/breadify/` and hard-reload first.
  1. **Bread sample, Check step:** 16 routes, 143 stops, 352 lines, and two notices.
  2. **Configure step:** there are no substitute choices.
  3. **Route 11:** Customer 017's three orders sit in one block, with crates full, half, full. Its Department 09 block follows. Customer 061 Department 22 shows two bold "false".
  4. **Route 9, with Show the order ID off:** Customer 092's two ids still print, and the one-order blocks show none.
  5. **Route 8:** one sheet, five blocks.
  6. **Freezer sample:** route 9's Customer 141 is one block of five orders, and the sheet count is as asserted.
  7. **The new fixture:** the tall customer runs across parts with "continued" lines, and crates print once per order. One-giant-stop's crates print once. No page ends with the "no position assigned" flag.
  8. **Print preview at 100 %, or a PDF:** "false" is plainly bolder on paper than "true".
- **At pack close:** item 10. No update-note entry and no version bump.

## Ledger
