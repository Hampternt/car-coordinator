# Pack: Breadify — one-look marker, one block per customer

**Status:** 🚧 all eleven items committed on `breadify-blocks` and the pack gate green (2026-09-29; item 11 added by the owner after the first gate). Waiting on the owner: review of items 8 and 9 and one pass for the rest, the look at the PDFs, and the browser walkthrough. Not pushed, no PR.
**Date:** 2026-09-29
**Branch:** `breadify-blocks`, cut from `dev` and merged back into `dev` through a PR. It shares three files with the review-round packs: README.md, INVENTORY.md and `scripts/check.sh`. In `scripts/check.sh`, item 1 changes only the loop line at :38. update-note edits that file's header and tail, not :38.

## Goal

This pack changes Breadify's web version only. The Rust desktop app and its docs stay as they are.

- **One look for the substitute marker.** Every order prints `want substitute: true` or `want substitute: false` in the same quiet type. When it is false, only the word **false** is bold.
- **One block per customer at a stop.** A customer can have several orders (several order ids) at one stop on a route. Those orders print in one block, under one customer heading, departments included (owner, 2026-09-29).
  - Inside the block the orders are grouped by department, then kept apart by order.
  - Every bread line of a block of several orders carries its order id as small, quiet text at its right. Each order's crates and marker sit on its first line. There is no order heading line.
  - Nothing is added together. "1 Kneippbrød" and "1 Kneippbrød" stay as two lines with two order ids.

Both are deliberate departures from the Rust spec, and the port says so wherever those D-numbers are cited:
- the marker: D8 and D21;
- one block per customer: D16, with D20, D2 and D19 following from it.

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
- **The owner's answers came before item 7, so Decisions, Designs B–G and items 7–9 below are already fitted to them.** Where the answers and the first plan differed, the Ledger names each change.

## Decisions taken

| Decision | Choice |
|---|---|
| Web version only | The Rust app and its docs don't change. The port departs from D8/D21 (the marker) and D16 ("one order, one block"). Following from D16, it also departs from D20 (one stamp column per block), from D2 (the tie-break gains the customer) and from D19 (in a block whose orders have different departments, each department is a quiet sub-heading instead of the boxed crate label under the name). D9 ("no stop block split") was already departed from for a stop taller than a page. Each departure is written into the comment where its D-number is cited, and into README.md:18. |
| Marker wording | `want substitute: true` and `want substitute: false`, lowercase. That is how the true form prints today, so a true order prints exactly as now. Both use one style: Plex Mono 500, 9.2 pt, quiet ink. |
| What is bold | Only the word `false`, in Plex Mono 700, which is already self-hosted (sheet.css:70-74). Same size, same ink. The owner asked for bold alone, so full ink was considered and not taken. |
| Badge and bar | Removed, along with the choice on the Configure step. The owner asked for one look every time, and a bar down a block of several orders would mark its true orders too. The choice was never saved (only the crate rules are, app.js:16, :65-82), so nothing needs migrating. |
| Page note's right half | Dropped (layout.js:675). It explains the loud capitals, and every order now states its own value. The pallet call on the left gets the room. |
| "Same customer" (owner question 1: departments included) | Orders merge when they share the route, customer name, delivery street and route ordering, compared as exact trimmed text. The department is **not** in the key. Bread: 8 groups merge, so 148 orders print as 123 blocks. Freezer: 10 groups, so 115 orders print as 94 blocks. Three real blocks mix true and false: bread Customer 061 at Street 62 and Customer 037 on route 13, freezer Customer 017 on route 4. |
| The street is always in the key | The address is never printed, so merging two streets would hide a second drop-off. A customer at two streets keeps one block per street, as today. |
| Where a customer's orders print | The tie-break becomes sequence, street, customer, department, order id, so a stop's orders always sit next to each other, grouped by department. No rule is needed for orders scattered down a route. Checked: this reorders nothing in either sample. A customer at two positions on one route stays two blocks. |
| Departments inside a block (owner question 1) | When every order in a block has the same department, the boxed department sits under the name as today. When they differ, the orders with no department come first, straight under the name, with no sub-heading. Each department follows under a quiet sub-heading of its own. `''` sorting before any name is what puts the no-department orders first, and a test guards it: printed after a sub-heading, they would read as that department's. |
| Exact matching | Two spellings of a name or a street stay separate. That is exactly today's print, so it is never a wrong one. |
| Per order, never per block | Order id, lines, crates and marker all belong to the order, and nothing is added up. For example, Customer 092's two orders print 2 full + 1 half crates each. Summed, they would print 4 full + 1 half: one crate fewer than is packed. The pallet call and the route total read the flat list of orders and don't change. |
| The order id (owner question 2) | In a block of several orders, every bread line carries its order id in the existing `.bf-order-id` look (small, grey, never bold), whatever "Show the order ID" says, because the id is what tells the orders apart. It sits at the right of the line, just left of the tick boxes, so the ids stand in one column. There is no order heading line and no rule between orders. The toggle still controls one-order blocks, and its hint (index.html:78-79) says so. |
| Crates and marker in a block of several (owner question 2) | Per order, on that order's first line, left of its id: `… Kneippbrød   ■  want substitute: true  1000619017  M F`. The marker is its one quiet look. The crate glyphs keep their size, so full and half stay easy to tell apart; the owner's look before the PR settles whether they should be smaller. Placement is measured: glyphs, then the ×N form (D24), then a line of their own under that first line. |
| One-order blocks | Unchanged apart from the marker. That covers 115 of 123 bread blocks and 84 of 94 freezer blocks. |
| Data shape | `route.orders` is the flat, sorted list that every sum reads. `route.stops` is the grouped list the page walks. A stop has no `lines`, `id` or marker value of its own, so nothing can add across orders by accident, and a stop passed where an order belongs throws. One constructor builds both: `Model.route(nickname, orders)`. |
| What "stops" counts | Blocks, everywhere it appears. The bread Check step reads 16 routes, 123 stops and 352 lines; the freezer's reads 94 stops. |
| A missing Order ID | A new blocking finding: `Order ID is empty or not a number on row N`. Blocking in the house sense (INVENTORY.md:54): the Check step says the pages would be wrong, and **Continue anyway** stays the leader's call. Today such rows read as 0 and quietly fold into one order. |
| Wrong values fail loudly | `marker()` throws on anything but `true` or `false`. The code that prints an id throws on anything but a number. `rebuild()` catches the error: no sheets, Print disabled, and one sentence saying why. A stop passed where an order belongs can then never print "false" or "undefined". |
| Cutting a block taller than a page | Whole orders go first. Only an order taller than a page by itself is cut between its lines. The rules cover both one-order and several-order blocks (Design D). |
| Changes beyond the ask | Both come in item 9, and the walkthrough looks for both. (1) A cut order's crates print once, on the part where it starts. Today each part shows crates for its own lines only, and the parts can add up to more than the order needs. (2) The "no position assigned" flag never ends a page on its own. |
| Freezer sheet | Same blocks, ids and markers, without crates, which are already forced to zero (layout.js:386-389). A check line's name does not wrap today, so a line that would overflow with its marker and id lets the name wrap instead. The flat total adds up by product and is unaffected. |
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
1. It sorts by `printingPosition`: sequenced or not, sequence, street, **customer**, department, order id.
2. It groups neighbouring orders that share customer, delivery street and sequence into one stop: `{customer, deliveryStreet, route, sequence, orders}`. The department stays on each order.

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

**A stop with several orders** renders like this (owner questions 1 and 2):
- **One heading:** the name line, plus the boxed department when every order shares one. Nothing sits at the heading's right.
- **Department groups,** in sort order. The no-department orders come first, straight under the heading. Then, when the block's departments differ, each department opens with a quiet sub-heading: `div.bf-head-line.bf-dpt-sub`.
- **Orders,** in order-id order within their department. Each order's bread lines are ordinary `.bf-row`s, in file order:
  - every line carries the order's `.bf-order-id` just left of the tick boxes;
  - the order's first line also carries its crates and its marker, left of the id.
- No order heading line and no rule between orders. The zebra restarts under each sub-heading.

The first line's crates reuse heading()'s `place` / `placeCrates`, factored out: full glyphs first, then the ×N compact form (D24), then a line of their own under the first line. It is measured, never assumed to fit.

Styles and classes:
- The id keeps the existing `.bf-order-id` look: Plex Mono 400, 8.3 pt, `--faintest`.
- Sub-headings are never `.bf-row`, which would upset the freezer's note-field count, and never `.bf-block`, which would upset route 8's 5 blocks. They are `.bf-head-line`, so the overlap check covers them.
- Every row keeps its note field on the freezer sheet, so the note-field count still equals the rows.

The freezer block is identical apart from the crates. Its check line's name is `nowrap` today; a line that overflows once its marker and id are in lets the name wrap instead.

Example: route 11, Customer 017, three orders with no department and one in Department 09. ■ is a full crate and ▪ a half.
```
Customer 017
P   7  SB  Kneippbrød …        ■  want substitute: true   1000619017  M  F
P   4  SB  Kneippbrød …        ▪  want substitute: true   1000619019  M  F
P  10  SB  Kneippbrød …        ■  want substitute: true   1000619029  M  F
DPT Department 09
P   3  SB  …                   ■  want substitute: true   1000622398  M  F
P   7  SB  …                                              1000622398  M  F
```

### D. Cutting across pages

`stopPieces` and `stopSlice` are rewritten over segments. A segment is an order, some or all of its lines, and whether it is continued. The rules:

1. **Filling parts.** Parts are filled greedily with whole orders.
2. **Measuring.** Every part is built exactly as it will print and measured before it is accepted. Nothing reuses another part's measurement. Today's reuse (layout.js:351-352) only worked because every slice had the same heading.
3. **The part tag.** Trial parts carry a stand-in tag as wide as `part N of N` for the stop's N lines (review fix R5; the first build used `part 99 of 99`). Final parts get their real tag, which is never wider.
4. **Where a cut can fall.** Only an order that doesn't fit a fresh part whole is cut between its lines. The cut is found by measuring (halve, then step up), as today.
5. **Departments across a cut** (replaces "no bare order line", since there are no order lines). A part that starts inside a department group opens with that department's sub-heading again. A sub-heading never ends a part without at least one line under it.
6. **The heading.** Every part repeats the customer heading, and the shared department box where there is one, with `part N of M`.
7. **Several orders.** A continued order's first line on its new part carries its marker and a quiet `continued` beside its id, and no crates. Without the cue it would read as an order with no crates.
8. **One order.** Every part carries the heading and the stamp: the marker, plus the id if the toggle is on. Crates print on part 1 only.
9. **Crates print once per order,** on the part where the order starts. Today `stopSlice` (:321-322) hands each slice to `stopBlock`, which counts crates from that slice's lines only.
10. **The flag.** The stop right after the unsequenced flag is packed against the limit minus the flag's height. Today a stop whose height falls between (limit − flag) and limit pushes the flag onto a page of its own.
11. `shareOut` and `rebalance` are otherwise unchanged; they already take pieces whole.

Until item 9 lands, item 8 uses an interim fallback: a several-order stop taller than a page prints one block per order, through today's `stopPieces`.

### E. The new edge fixture

`one-customer-many-orders` is a bread fixture made by `make_edge_fixtures.py`:
- **`line()` gains `accept=True`**, passed through to `acceptAlternatives`. Existing calls are unchanged.
- **Route 1, the tall customer.** One small ordinary stop first. Then one customer at one street passed as `street=`, and one sequence. It has:
  - about 14 orders of 12–25 lines, some with no department and the rest in three departments;
  - one order of 80 lines, inside a department, so a cut lands mid-department;
  - an identical pair: same breads, same quantities, two ids;
  - two orders with `accept=False`.
- **Route 2, the wide customer.** A name about 120 characters long, with three orders:
  - one of 250 breads on one line, in a long department: 25 full crates, too wide for glyphs, so it prints in the compact form;
  - one with `accept=False`, in the same long department;
  - one ordinary order with no department, so the long department prints as a sub-heading.
- **Route 3, the shared department.** One customer with two orders in the same department, so the boxed department stays in the heading.

Running the script rewrites every KEEP fixture with new zip timestamps. It also rewrites bakeries-3/4/5 with new product ids, because `hash()` is randomised per run. So:
- restore every other rewritten fixture with `git checkout --`, busy-real-day, four-figure-line and bakeries-3/4/5 included;
- check `git status` shows only the `.py` and the new `.xlsx`, and commit those two by path.

<details>
<summary><b>F. Tests that change in breadify.mjs</b></summary>

- **:92-101 (item 8):** reads 123 stops, with a comment that 148 orders print as 123 blocks.
- **:103-110 and :404-409:** still exactly two notices each. Item 3 guards this.
- **:133-135 and :139-144 (item 6):** read `route.orders`. The figures don't change: Customer 012 is [9, 13], and the route 8 table stays.
- **:208:** unchanged, because `routeCrates` reads `route.orders`.
- **:231-272 (item 2):** gains the across, overlap, clipping and nonsense pass.
- **:303-307:** unchanged. Route 8 is still one sheet of 5 blocks.
- **:332-369:** the key becomes `orders:` in item 6. In item 7 it goes through `Model.route`, gains a fourth order, and gains a check that the stop names print.
- **:441-447 (item 8):** the freezer sheet count is measured again. If it moves:
  - the Ledger names the route whose count changed and why;
  - the assertion takes the measured value, with a comment that 21 is freezer-list.md's figure, because the implementer stops before the walkthrough;
  - the final report escalates it, and the owner looks at it in the PDF and the browser.
- **:469-473:** unchanged, because every row keeps its note field and sub-headings are never `.bf-row`.
- **:498 (item 7):** the EDGE list gains `one-customer-many-orders`.
- **:356, :540, :712 and :853 (item 4):** the `marker: 'word-only'` keys go.
- **:572 and :605:** the selectors grow in item 2, and gain `.bf-dpt-sub` in item 8.
- **:776-795:** the row helper gains `orderIdExact` in item 3. The test still holds, because stops carry `deliveryStreet`.
- **:828-891:** the key becomes `orders:` in item 6, then goes through `Model.route` in item 7. In item 9, crates print once across the parts.

</details>

<details>
<summary><b>G. "Departments merge too": the owner's answer, and what it costs</b></summary>

- The key drops the department.
- The sort becomes sequence, street, customer, department, id. Checked again 2026-09-29: this reorders nothing in either sample.
- Mixed departments print as quiet sub-headings inside the block (Design C), not in the heading.
- Blocks become 123 on the bread day and 94 on the freezer day. Re-counted from the samples 2026-09-29.
- Customer 012 on route 14 becomes one block of 9 orders and 30 lines. Customer 037 on route 13 becomes one block of 8. Both are measured against the page in item 8; one that does not fit takes item 8's interim fallback until item 9.
- True and false then mix inside real blocks: Customer 061 at Street 62 and Customer 037 on the bread day, and Customer 017 on route 4 of the freezer day. The per-order marker handles that, and item 8 checks it against the model.
- Items 7 and 8 grow. The Customer 012 assertion still holds, because it counts orders.

</details>

## Items

- [x] **1. The item gate parses Breadify.** `scripts/check.sh` loops over `docs/*.js` only (:38), so no Breadify script is ever parsed. Every item below would pass the gate unchecked. Change that one line to `for f in docs/*.js docs/breadify/*.js; do` and leave the rest of the file alone, because update-note edits its header and tail. Commit `scripts/check.sh` by path.
      *Done when:* `bash scripts/check.sh` prints `ok` for docs/breadify/app.js, layout.js, model.js, validate.js and xlsx.js. It also fails when one of them is given a syntax error (tried by hand, then reverted).
- [x] **2. Check the sample days the way the edge fixtures are checked.** Today the across, overlap and clipping checks (:572, :588-603, :605) and the nonsense scan (:731) run only on fixtures. None of them looks at the marker or the order id.
      - Factor the across, overlap and clipping pass into one function, and run it on the bread and freezer sample sheets too.
      - Add `.bf-stamp`, `.bf-marker` and `.bf-order-id` to the across and clipping selectors.
      - Scan both sample days' printed text for `NaN`, `Infinity`, `undefined` and `[object`.

      Run it on current `dev` before any other change. A hit is a finding about today's print: record it in the Ledger and stop for the owner.
      *Done when:* the new checks run on both sample days and on every edge fixture, and pass on unchanged code (or the Ledger records what they found). test:breadify passes.
- [x] **3. Say so when an Order ID is missing.**
      - `readRows` keeps `orderIdExact: exactNumber(cell(COLUMN.orderId))` beside `quantityExact`.
      - `blankRequiredFields` adds a blocking finding of the same kind: `Order ID is empty or not a number on row N`.

      *Done when:* breadify.mjs asserts that two hand-made rows for one customer with no Order ID give that finding for each row, as blocking. The `twoRoutes` row helper (:777-781) gains `orderIdExact` and still reads `blocks === false`. Both sample days still read exactly their two notices.
- [x] **4. Remove the choice of marker treatment.** Delete:
      - `settings.marker` (app.js:31);
      - the "When a customer refuses substitutes" heading and its three buttons (index.html:83-95);
      - their handlers (app.js:275-280, :467-472);
      - the bar: `bf-block-barred` in `stopBlock` (layout.js:383-384) and its CSS and comment (sheet.css:392-397);
      - the badge: its branch in `marker()` and `.bf-marker-badge` (sheet.css:493-499);
      - the `.choices` rules (style.css:557-581), and `.choices em` from the shared selector (:548-549), keeping `.row em`;
      - the four `marker: 'word-only'` keys in breadify.mjs (:356, :540, :712, :853).

      The loud words stay until item 5.
      *Done when:* `grep -rn "markerChoices\|settings.marker\|bf-block-barred\|bf-marker-badge\|choices" docs/breadify/ scripts/breadify.mjs` finds nothing. The Configure step shows no substitute choices, and test:breadify passes.
- [x] **5. One look for the substitute marker.** Design A.
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
- [x] **6. Rename `route.stops` to `route.orders`.** A mechanical rename with no change in behaviour. The readers are:
      - model.js:458 (the key), 467, 471, 566, 582;
      - layout.js:682-683, 787, 935, 982;
      - app.js:121, 208, 358;
      - breadify.mjs:134, 139, 549, 718, 789, and the object keys at :336 and :841.

      The UI still says "stops".
      *Done when:* `grep -nF '.stops' docs/breadify/*.js scripts/breadify.mjs` and `grep -n 'stops:' docs/breadify/*.js scripts/breadify.mjs` both find nothing. test:breadify passes with every figure unchanged: 148 stops, the route 8 table, Customer 012 [9, 13], the six pallet routes and 21 freezer sheets.
- [x] **7. Group each route's orders into stops.** Owner question 1 answered: departments included. Design B.
      - Add `Model.route`, and give `printingPosition` its customer tie-break before the department. `group()` and the two hand-built test routes use `Model.route`.
      - The sequence-leak route gains a fourth order with the third order's customer, street and sequence, in another department. It also asserts that the stop names print, so an empty render cannot pass.
      - Rewrite the comments at model.js:333-335 (fold) and :425-432 (D2) as departures.
      - Add the Design E fixture to KEEP and to EDGE. Nothing renders stops yet, so it prints one block per order for now.

      *Done when:* these new assertions pass:
      - The bread stops total 123, and the freezer stops 94.
      - Route 11 has one Customer 017 stop holding 1000619017, 1000619019, 1000619029 and then Department 09's 1000622398, in that order.
      - Customer 061 on route 11 is two stops: Street 112's 1000622508, and Street 62's 1000621633, 1000622154 and 1000622155.
      - Customer 012 on route 14 is one stop of nine orders and 30 lines.
      - Re-sorting both samples by the old key gives the same order ids on every route.
      - In the new fixture, `Model.group(Model.fold(rows))` gives the tall customer exactly one stop holding every one of its order ids, and the wide and shared-department customers likewise.

      Every existing figure holds, and the new fixture passes every generic edge check.
- [x] **8. ⚠️ Print a customer's orders at one stop in one block.** Owner questions 1 and 2 answered. Design C.
      - `paginate` walks `route.stops`, and `stopBlock` renders a stop.
      - A row's id carries the same number guard as `stamp()`.
      - Every "stops" count switches to blocks: the page counter via `day()`, the page note, `unsequencedStops`, the Check stats and the route list.
      - The toggle's hint says ids always print in a block of several orders.
      - A several-order stop taller than a page uses the interim fallback from Design D.
      - Comments rewritten as departures:
        - D16: layout.js:381 and sheet.css:386;
        - D20: sheet.css:465-466 and the header at :9-12;
        - D19: the sheet.css header and the `.bf-dpt` comment (:430-431);
        - `stamp()` (:182-186), `heading()` (:209-218), `.bf-order-id` (sheet.css:501-502) and the zebra rule (:524-525).

      *Done when:* breadify.mjs asserts all of this:
      - The Check step reads 16 routes, 123 stops and 352 lines on the bread day, and 94 stops on the freezer day.
      - **Route 11, Customer 017:** one `.bf-block`. Its first three rows are Kneippbrød 7, 4 and 10, carrying 1000619017, 1000619019 and 1000619029, with crate glyphs full, half, full. Then a Department 09 sub-heading, and 1000622398's two rows under it.
      - **Every several-order block on both days, joined to the model:** for each order, the rows carrying its id equal its line count; only its first row carries crates and a marker; the marker matches `acceptAlternatives`; on bread, the glyphs equal `Model.crateCount(order)`.
      - **No-department orders first:** in every mixed block, they sit straight under the name, before any sub-heading.
      - **Customer 092:** its two orders' first rows each carry 2 full + 1 half.
      - **Marker per order:** a hand-built stop of two orders, one true and one false, prints `false` only on the false order's first row, found by its id.
      - **Show the order ID off:** every row of a several-order block (the Customer 092 pair, Customer 061 at Street 62) still prints its id, and no one-order block prints an id.
      - **Ink:** a row's `.bf-order-id` keeps the quiet look: `--faintest`, weight 400.
      - **Classes:** no `.bf-dpt-sub` is a `.bf-row` or a `.bf-block`, and `.bf-dpt-sub` joins the across and clipping selectors.
      - **The wide customer:** it prints as one block. Its 250-bread first row carries the compact `×N` form, its refusing order reads false, its long department prints as a sub-heading, and nothing overlaps, clips or runs off.
      - **The shared department:** its boxed department sits in the heading, and the block has no sub-heading.
      - **A freezer block of several orders with a long product name**, hand-built: nothing overlaps, clips or runs off.
      - **The tall customer:** it prints one block per order (the fallback), and every id prints once.
      - **Customer 012 and Customer 037** are measured against the page; the Ledger says whether either took the fallback.
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
- [x] **9. ⚠️ Cut a block taller than a page between orders.** Design D, replacing item 8's fallback.
      - Rewrite `stopPieces` and `stopSlice` over segments.
      - Pass the flag's height into the stop that follows the flag.
      - Rewrite the comments as departures: layout.js:10-15 (D9), :312-320 (`stopSlice`) and :334-343 (`stopPieces`).

      *Done when:* these hold for the tall customer, one-giant-stop and the 250-line crowded test:
      - The existing checks pass: nothing off the paper, 10 mm of clearance, no overlaps, nothing clipped.
      - Each part prints exactly one customer heading with its `part N of M`.
      - Every order id prints.
      - Every order's lines print exactly once, in file order.
      - Across all parts, only the 80-line order's id appears on more than one part. Every other order's lines sit on a single part.
      - Every row sits under its own order's department, joined by id to the model: a part that starts inside a department opens with its sub-heading, and no sub-heading ends a part without a row under it.
      - There is exactly one `.bf-crates` run per order across all parts. For one-giant-stop that means one, not one per part.
      - A continued order's first row on its new part reads `continued`, with a marker and no crates.
      - One-giant-stop's later parts carry the heading, the tag and the marker, with no crates.
      - Only the two refusing orders read false.
      - No sheet's body ends with `.bf-flag`. This holds on both sample days, on every edge fixture, and across a sweep of 30 to 70 lines on an unsequenced stop that follows one sequenced stop.

      **Risky — review individually.** It rewrites the only code standing between a long order and ink off the bottom of the paper.
- [x] **10. Record the departures in README and INVENTORY.**
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
- [x] **11. Sort each order's breads by supplier, then name.** Added 2026-09-29 at the owner's request, after the pack gate: *"bread on the list within the customer can we sort it by name and supplier? supplier first then name, SB first then BH, and within the supplier it's by alphabet."*
      - Within each order, one-order blocks included: SB first, then BH, then any other supplier A–Z by its code (then its name), then lines with no supplier. Within a supplier, by bread name with `Intl.Collator('nb')`, so æ ø å come after z. Ties keep the file's order.
      - Never across orders. The block structure (customer, department sub-headings, orders kept apart) is unchanged, and the marker and crates stay on the order's first line, now the first after sorting. The freezer sheet sorts the same way by its wholesalers' codes.
      - `fold()` keeps the file's order; `Model.route()` copies each order with its lines in printing order (`printingLines`).
      - The departure is recorded where the port states the line order (`fold`'s comment), in README and in INVENTORY. The Rust log has no D-number for line order.

      *Done when:* `readSharedBlocks` and a new `readOrderLines` hold every order on both sample days and in the fixture against the suite's own copy of the rule, starting from the file's order. They fail when the sort is removed, and test:breadify passes.

### Review fixes (independent review of a873156, 18 confirmed findings, 2026-09-29)

One commit per fix, each with its ledger line in the same commit, item-gated with check.sh and test:breadify. Item 11's sort must still hold after each; `readOrderLines` checks it on every run.

- [x] **R1. ⚠️ Text over crate glyphs.** A long word on a shared block's first line spilled onto the glyph run. `measure.overflows(node, outer)`; `fits()` also requires the name not to overflow its own box. `.bf-product` joins the clipping list, and a hand-built repro checks it. *Done when:* the repro (50× a long SB word first, BH Loff) shows no clipped name and no collision.
- [x] **R2. ⚠️ Blank Order ID not flagged.** `orderIdExact` is null for blank/whitespace text or a boolean cell; the finding fires on `!Number.isInteger(id) || id <= 0`. *Done when:* blank and whitespace ids are each a blocking finding, read through `readRows`.
- [x] **R3. ⚠️ Missing or unrecognised Accept alternatives printed as false.** `acceptAlternativesExact` (true/false only for a real boolean, 0/1 or true/false/yes/no); blocking finding "Accept alternatives is empty or not true/false on row N". *Done when:* a blank and a 'ja' row are each a blocking finding, and both samples still read two notices.
- [x] **R4. The `.bf-order-extra` line carries no id.** Put the order id on it. *Done when:* `readSharedBlocks` asserts an extra line carries the id of the line above it, and the R1 repro exercises it.
- [x] **R5. The part stand-in is too narrow past 99 parts.** Use `part ${lines} of ${lines}`; a final part over its cap holding more than one line throws.
- [x] **R6. Quadratic cut search.** `mostLines` seeds from the previous part's take, gallops up to a failing bound, then binary-searches.
- [x] **R7. The cut under the flag is undocumented.** Behaviour kept; README, INVENTORY and the `stopPieces` comment say so; the sweep pins the part counts at 39 and 40 lines.
- [ ] **R8a. INVENTORY's "refuses rather than misprints" overclaims.** Narrow it to what the guard does, citing R2/R3's checks.
- [ ] **R8b. README's sheet counts.** The test paragraph's 21 freezer sheets becomes 20 (21 in freezer-list.md); add the bread day's 28 sheets and why.
- [ ] **R8c. F8 is a departure too.** A shared-block check line wraps its name. README's list, sheet.css and layout.js say so.
- [ ] **R9. Every order prints a marker.** Total markers = orders (148, 115); true = orders − refusing (130, 105), excluding continued rows and later parts.
- [ ] **R10. One quiet style.** One [family, weight 500, size, colour, no transform, style] across every marker; the `<b>` matches except weight 700.
- [ ] **R11. A shared block's heading holds nothing at its right.** Whitelisted head-line children; no crates, marker, stamp or id.
- [ ] **R12. The crate count on a cut one-order block.** Part 1's crates equal `crateCount` (90 large for one-giant-stop; the crowded route too).
- [ ] **R13. The customer tie-break.** Kafé A (21, 23) and Kafé B (22) at one street and sequence → stops A:21+23, B:22 and one Kafé A block.
- [ ] **R14. Sequence in the key.** Sequences 5 and 0 → two stops with a flag between; 5 and 6 → two stops.
- [ ] **R15. Exact spelling.** Two spellings of one customer → two stops, both names printed.
- [ ] **R16. Order id size and placement.** In every shared row the id sits between the name and the tick boxes, at the one-order id's font size.

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
  1. **Bread sample, Check step:** 16 routes, 123 stops, 352 lines, and two notices.
  2. **Configure step:** there are no substitute choices.
  3. **Route 11:** Customer 017's four orders sit in one block: the three Kneippbrød lines with crates full, half, full, then Department 09 under a quiet sub-heading. Customer 061 at Street 62 shows Department 16, then Department 22 with two bold "false".
  4. **Route 9, with Show the order ID off:** Customer 092's two ids still print on every line, and the one-order blocks show none.
  5. **Route 8:** one sheet, five blocks.
  6. **Freezer sample:** route 9's Customer 141 is one block of five orders, route 11's Customer 159 keeps its boxed department, and the sheet count is as asserted.
  7. **The new fixture:** the tall customer runs across parts, a continued order says "continued", and crates print once per order. One-giant-stop's crates print once. No page ends with the "no position assigned" flag.
  8. **Print preview at 100 %, or a PDF:** "false" is plainly bolder on paper than "true", and the ids are quiet but readable.
- **At pack close:** item 10. No update-note entry and no version bump.

## Ledger

- 2026-09-29 · **Start.** Branch `breadify-blocks` cut from `origin/dev` at d1d1117, in its own worktree. Baseline on unchanged code: `npm run test:breadify` all passed, `npm run test:car` all checks passed, both on system Chrome (`/usr/bin/google-chrome`).
- 2026-09-29 · **Plan fitted to the owner's answers**, before any code. Each change:
  - Key: the department left the grouping key (question 1). Re-counted from the samples: bread 148 orders → 123 blocks (8 merged groups), freezer 115 → 94 (10 groups). The old key's 143/107 are gone everywhere they appeared.
  - Sort: the tie-break is sequence, street, customer, department, id. Re-checked: it reorders nothing in either sample.
  - Departments inside a block: new decision row. A shared department keeps its box in the heading (only freezer Customer 159 on route 11 is such a block today); mixed departments get quiet sub-headings, no-department orders first. This departs from D19 too, so D19 joined the departures.
  - The order id (question 2): every line of a several-order block carries its id in the existing quiet `.bf-order-id` look, in a column just left of the tick boxes. The plan's `Order ⟨id⟩` heading line in full ink, and its hairline, are gone. Item 8's "computed black" check became "keeps the quiet look".
  - Crates and marker: per order, on the order's first line, left of the id. Glyphs keep their size so full and half stay easy to tell apart; flagged for the owner's look.
  - Freezer: the check line's name may wrap when a marker and id would overflow the line. New item 8 check with a hand-built long-name freezer block.
  - Design D rule 5 ("no bare order line") became "departments across a cut"; rule 7's `Order ⟨id⟩ continued` became a quiet `continued` beside the id on the continued order's first row.
  - Design E: the tall customer gains departments (the 80-line order inside one), the wide customer is a mixed block, and a route 3 shared-department customer is added.
  - Design F: the freezer sheet count, if it moves, takes the measured value and is escalated in the report, because the implementer stops before the walkthrough.
  - Items 7–9 done-conditions and the walkthrough list rewritten to match; item 8 gains a check of every several-order block on both days against the model.
- 2026-09-29 · **Gates "on the go":** the two 🚧 lines moved from Breadify's Considered up under "## The printed sheet" in INVENTORY.md, as pointers to this manifest.
- 2026-09-29 · **Item 1 done** (61f5455). `bash scripts/check.sh`: CHECK OK, `ok` for docs/breadify/app.js, layout.js, model.js, validate.js, xlsx.js. Trial: `const = ;` appended to model.js gave `FAIL docs/breadify/model.js`, CHECK FAILED, exit 1; reverted with `git checkout --`, gate OK again.
- 2026-09-29 · **Item 2 done** (c136a07). One `inspectSheets` pass, installed with `addInitScript`, now runs on the bread day (26 sheets), the freezer day (21 sheets) and all 15 EDGE fixtures: off the paper, 10 mm, overlaps, clipping, nonsense. `.bf-stamp`, `.bf-marker`, `.bf-order-id` joined the across and clipping lists. Run on unchanged app code: **no findings** (bread 0 mm across, 12.7 mm clearance; freezer 0 mm, 13.2 mm; no collisions, clipping or nonsense). Gate: check.sh OK; test:breadify all passed, 189 ok.
- 2026-09-29 · **Item 3 done** (d3fa087). `readRows` keeps `orderIdExact`; `blankRequiredFields` flags any row whose `orderIdExact` is not a finite number (so a hand-built row missing the field is flagged too, rather than passing). Two hand-made no-id rows give two blocking findings, rows 2 and 3, and `Validate.blocks` is true; the `twoRoutes` helper gained `orderIdExact` and still does not block; both sample days still read exactly two notices. Gate: check.sh OK; test:breadify all passed, 191 ok.
- 2026-09-29 · **Item 4 done** (42abf83). Settings key, Configure heading and three buttons, both handlers, the bar, the badge, the `.choices` rules and the four `marker: 'word-only'` keys removed; `marker()` no longer takes settings. `grep -rn "markerChoices\|settings.marker\|bf-block-barred\|bf-marker-badge\|choices" docs/breadify/ scripts/breadify.mjs` finds nothing. New check: the Configure step has no `[data-marker]` and no "substitute" text. Gate: check.sh OK; test:breadify all passed, 192 ok.
- 2026-09-29 · **Item 5 done** (ad030ae). `marker()` returns one `.bf-marker` span and throws on anything but `true`/`false`; a new `orderId()` guard throws on a non-number id and `stamp()` uses it (item 8 reuses it for rows); `rebuild()` catches, clears the preview, disables Print and says why. `.bf-marker-loud`, `.bf-note em` and the note's right half gone; `.bf-marker b` is 700. The false counts are taken from the model and match: bread 18, freezer 10. Gate: check.sh OK; test:breadify all passed, 203 ok (route 8 still 1 sheet of 5 blocks, freezer still 21 sheets).
- 2026-09-29 · **Item 6 done** (2eaa6c1). 24 lines renamed across app.js, layout.js, model.js and breadify.mjs, including the three `.stops` reads items 3 and 5 added to the test. Both greps (`.stops`, `stops:`) find nothing at this commit; `.stops` returns in item 7 by design. Figures unchanged: 148 stops, the route 8 table, Customer 012 [9, 13], pallets 3/4/5/9/11/13, freezer 21 sheets. Gate: check.sh OK; test:breadify all passed, 203 ok.
- 2026-09-29 · **Item 7 done** (37ce3e4). `Model.route` and `sameStop` (customer, street, sequence; no department), `printingPosition` gains the customer before the department, `sortStops` renamed `sortOrders`; fold and D2 comments rewritten as departures. Fixture `one-customer-many-orders` (319 rows): route 1 a small stop then the tall customer (14 orders, no-department group plus Kjøkken, Personalrom, SFO; the 80-line 7106 in Kjøkken; pair 7103/7104; 7107 and 7111 refuse), route 2 the wide customer (250-bread 7201 and refusing 7202 in a long department, 7203 without), route 3 the shared department (7301, 7302). Regenerating rewrote 13 existing fixtures; all restored with `git checkout -- scripts/fixtures/edge/`, and only the `.py` and the new `.xlsx` were committed. New checks pass: bread 148 → 123 stops, freezer 115 → 94, neither day reordered against D2's key, Customer 017 [1000619017, 1000619019, 1000619029, 1000622398], Customer 061 two stops (Street 112; Street 62 ×3), Customer 012 one stop [9, 30], the fixture's three customers one stop each, the sequence-leak route now four orders in stops [1, 1, 2] with its names printed. The new fixture passes every generic edge check (15 sheets, 10.7 mm). Gate: check.sh OK; test:breadify all passed, 219 ok.
- 2026-09-29 · **Item 8 done** (1cd2457), ⚠️ review individually. `paginate` walks `route.stops`; `stopBlock`/`stopPieces` dispatch to `orderBlock`/`orderPieces` (today's one-order code, renamed) or the new `sharedBlock`/`orderRows`; `place`/`placeCrates` factored out of `heading()`; every row id goes through item 5's `orderId()` guard; counts switched to stops (page note, masthead via `day()`, `unsequencedStops`, Check stats, route list); `lineCount`, `routeCrates`, `routeTotal`, `supplierKey`, `productsById` still read `route.orders`. Comments rewritten as departures for D16, D19, D20, `stamp()`, `heading()`, `.bf-order-id`, zebra; toggle hint updated.
  - **Checks added**, all passing: a model-joined reader (`readSharedBlocks`) over every shared block, per order: its lines in file order, under its own department, marker once on its first line and matching the file, crates once and equal to `Model.crateCount`. Bread 7 blocks with no problems, freezer 10, fixture clean. A throwaway mutation (marker and crates on each order's last line) failed six checks, so the reader is not vacuous. Also: Customer 017 rows and glyphs, Customer 092 2 full + 1 half each, ids quiet (`rgb(156, 156, 156) 400`), sub-headings never `.bf-row`/`.bf-block`, ids with the toggle off, the true/false pair, a hand-built long-name freezer block, the wide, shared-department and tall fixture customers, and the freezer Check step at 94 stops. `.bf-row-stamp` and `.bf-dpt-sub` joined the inspection lists.
  - **Measured:** bread Customer 037 (route 13) 192.8 mm as one block, which fits; bread Customer 012 (route 14) 266.4 mm, taller than the ~238 mm body, so it **takes the interim fallback** (nine one-order blocks) until item 9. Bread route 13 now needs **3 sheets, not 2**: Customer 037's block is kept whole (D9) and no longer splits between pages the way eight blocks could. The bread day went from 26 to 27 sheets; nothing asserts that count.
  - **Freezer sheet count moved, 21 → 20** (Design F): route 13's Customer 012 has eight orders at one stop, and one block with eight sub-headings is shorter than eight headed blocks, so the route fits one sheet. The assertion now reads 20 and pins route 13 at one sheet, with a comment that 21 is freezer-list.md's figure. **Escalated for the owner's look.**
  - **Decisions made here:** crate glyphs keep their size on order lines (flagged for the owner's look); the freezer note-field check now counts every sheet, not just the first; any freezer line in a shared block wraps its name when it would overflow. One-order freezer lines were left as they were: a name longer than the whole line can still overflow there, as before this pack.
  - **Working-copy slip, recovered:** reverting the mutation with `git checkout --` also threw away item 8's uncommitted layout.js edits. They were re-applied from the session, and the suite gave the same 244 ok before the freezer-stats check was added.
  - Gate: check.sh OK; test:breadify all passed, 245 ok.
- 2026-09-29 · **Item 9 done** (34f48dc), ⚠️ review individually. `stopPieces` is rewritten over segments (`{order, from, to}`) and serves one-order and shared stops alike; `orderPieces`/`orderSlice` are gone. `stopBlock`/`orderBlock`/`sharedBlock` take a part's segments and tag. Every trial part is built as it will print, with a `part 99 of 99` stand-in, and measured against its own cap. Crates come only from the part where an order starts. A continued order's first row leads with a quiet `CONTINUED` where its crates were. A part that starts inside a department reopens its sub-heading. `paginate` packs the stop under the flag against `limit − flag`. D9 departure written into the file header and `stopPieces`.
  - **Deviations from Design D, all within its rules:**
    - The cut search halves until a count fits, then binary-searches between the most that fit and the fewest that did not; Design D said "halve, then step up". It is still pure measuring, and heights only grow with lines.
    - An order taller than a page starts in whatever room is left on the part it opens on, rather than always on a fresh part. It uses the paper better and still leaves only that order spanning parts.
    - The part tag now sits beside the name, and is placed and measured before the marker and crates. Before, it was appended after them unmeasured, at the far right. This changes where the tag prints on one-giant-stop too.
    - `sharedBlock` throws if a no-department order would ever print after a sub-heading. The sort prevents it; this makes a breach loud.
  - **Checks added**, all passing:
    - Tall customer: 9 parts, 304 lines. Each part has one heading and a `part N of 9` tag; no bare sub-heading. Only 7106 spans parts, and it opens each later part with `continued`, its marker and no crates. 14 crate runs for 14 orders. Only 7107 and 7111 read false. The model-joined reader is clean, which also proves every row sits under its own department.
    - one-giant-stop: its 300 lines once each, in file order. Crates on part 1 only. Every later part keeps its marker and id.
    - The 250-line crowded route: lines in order, crates on part 1 only.
    - Bread route 14's Customer 012: two parts, no order on both, and no longer the interim fallback. The bread day now has 9 shared blocks and no stop printed apart.
    - The flag: `inspectSheets` reports any page ending with the flag, on both sample days, every edge fixture and the hand-built runs. A sweep of 30–70 lines on an unsequenced stop after a sequenced one is clean. With the fix removed, the sweep fails from 39 lines on (flag alone on page 2); the mutation was reverted to the commit.
  - Gate: check.sh OK; test:breadify all passed, 279 ok.
- 2026-09-29 · **Item 10 done** (d20e8d1). README names the departures with their D-numbers: D8/D21 marker; D16 one block per customer, with D20, D2 and D19 following; D9 cut between orders. It also says why the freezer sample prints on 20 sheets, not 21. INVENTORY: "Nine checks", with impossible quantities, colliding supplier codes and the Order ID named. :58 corrected: blocks and the total split only when taller than a page. :63 rewritten for the one look. Both 🚧 lines are now ✅ entries, plus a "refuses rather than misprints" entry. `grep -rn "one order, one block"` finds only layout.js:486, a departure. No 🚧 from this pack is left.
  - **Manifest contradiction, resolved:** item 10's text said the tie-break reads "address → department → customer → order id". The Decisions row, Designs B and G and the code all put the customer before the department, so INVENTORY says **address → customer → department → order id**.
  - Gate: check.sh OK (docs only; no logic touched).
- 2026-09-29 · **Pack gate green.** `bash scripts/check.sh`: CHECK OK (Breadify's five scripts included). `CHROMIUM_PATH=/usr/bin/google-chrome npm test`: exit 0. Car suite `all checks passed` (368 ok); Breadify suite `all passed` (279 ok); 0 FAIL. Run on **system Chrome** (`/usr/bin/google-chrome`), not the pinned Playwright Chromium that CI uses, which is not installed here.
- 2026-09-29 · **Sheet counts at pack close**, measured against one block per order:
  - Bread: 26 → **28**. Route 13 went 2 → 3, because Customer 037's eight orders are one 192.8 mm block kept whole. Route 14 went 2 → 3, because Customer 012's nine orders are one 266.4 mm block cut into two page-sized parts. A part is sized against a full page and never starts part-way down one, so the sheet before it is left short. Nothing asserts the bread count.
  - Freezer: 21 → **20** (route 13, see item 8). Asserted, and escalated.
- 2026-09-29 · **The owner's look**, in the session scratchpad `breadify-look/`: `bread-sample-day.pdf` (28 A4 pages), `freezer-sample-day.pdf` (20 A4 pages), both printed through the app's own `beforeprint` move, with backgrounds on, and the page counts checked. PNG crops:
  - `merged-two-departments-route11-customer061.png`
  - `same-bread-orders-route11-customer017.png`
  - `false-marker-one-order-block.png` and `false-marker-shared-block-line.png`
  - extras: `merged-eight-departments-route13-customer037.png`, `identical-pair-route9-customer092.png`, `freezer-shared-department-route11-customer159.png` and `freezer-mixed-route4-customer017.png`
- 2026-09-29 · **Scope check.** `git diff --stat d1d1117..HEAD`: 14 files, all under `docs/breadify/` and `scripts/`, plus README.md, INVENTORY.md and this manifest. Nothing under `src-tauri/`, nothing Car Coordinator ships, no `package.json` change, so no update-note entry and no version bump. origin/dev has since moved to 0f9b59a (another session, two review-round manifests); it touches no file this branch touches. D-number sweep over `docs/breadify/` and `scripts/breadify.mjs` for D2, D8, D9, D16, D19, D20 and D21: every citation either still holds (e.g. D20 for one-order headings) or names its departure.
- 2026-09-29 · **Item 11 done** (6bb0053), requested by the owner after the pack gate, built on top of a873156 while that commit is reviewed separately. `printingLines`/`compareLines` in model.js; `Model.route()` returns order copies with sorted lines, and `fold()` stays in file order. Departure recorded in `fold`'s comment, the new function's comment, README (a paragraph after the D-number list: "no D-number, because the log never set a line order") and INVENTORY (a new ✅ entry). Checked read-only in the Rust repo: `docs/print-layout.md` has no line-order decision, and `src/order.rs` keeps file order.
  - **Tests:** `printOrder` is the suite's own copy of the rule. `readSharedBlocks` now expects it; a new `readOrderLines` reads every order, one-order blocks by their heading id and parts joined, against `printOrder` of `Model.fold`'s file-order lines. Bread: 148 orders read, the sort moves 60 of them, and 15 listed a BH bread before an SB one in the file. Freezer: 115 read, 45 moved. The fixture is clean. The crowded 250-bakery route now expects code-then-name order. One-giant-stop's names are one bakery and zero-padded, so its order is unchanged.
  - **Non-vacuity:** with the sort taken out (`return lines.slice()`), 8 checks fail across bread, freezer, the hand-built block, the fixture and the crowded route. Reverted to the commit.
  - **Sheet counts:** unchanged, bread 28 and freezer 20.
  - **Gate:** `bash scripts/check.sh`: CHECK OK. `CHROMIUM_PATH=/usr/bin/google-chrome npm test`: exit 0, car `all checks passed` (368 ok), Breadify `all passed` (284 ok), 0 FAIL.
  - **Look files regenerated** in `breadify-look/`: both PDFs (28 and 20 pages), a fresh `same-bread-orders-route11-customer017.png` (unchanged, since its lines were already in order), and the new `sb-before-bh-within-an-order.png`. That is route order 1000622341, Customer 084. The file lists SB, SB, SB, SB, BH, SB, BH; it prints five SB breads A–Z, then two BH.
  - **Found while checking, not changed:** the Rust log's **D7** says a department prints as its own block, "not folded into a shared customer heading". Item 8's merged departments depart from D7 as well as D16/D19. D7 is not cited anywhere in the port, so no comment is wrong, but README's departure list does not name it. Left for the coordinator, to keep this item self-contained.
- 2026-09-29 · **D7 named in README** (the coordinator's go, after item 11). The Rust log's D7 says a department prints as its own block, "not folded into a shared customer heading"; item 8's merged departments depart from it as well as D16 and D19. README's D16 bullet now lists four follow-on departures, D7 first. The code never cites D7, so no comment changes. README and this line are one commit. Gate: `bash scripts/check.sh`: CHECK OK.
- 2026-09-29 · **R1 done** (commit "Keep a long bread name off an order's crates"). `measure.overflows(node, outer)` lays out `outer` and checks `node`; a shared first line's `fits()` also needs the name to fit its own box, or it moves on to the compact form, then a line of their own. `.bf-product` joined `inspectSheets`' clipping list; that flagged nothing on the samples or fixtures. Repro: 50× "Surdeigsrundstykker Sandnes Bakeri" first (Loff made Bakehuset's so item 11's sort keeps the long word first), 5 full + 1 half crates, refusing. Before the fix it failed the clipping check and the new no-spill check; now clean, with the reader and the sort checks passing. Samples unchanged, nothing visible. Gate: check.sh OK; test:breadify all passed, 292 ok.
- 2026-09-29 · **R2 done** (commit "Say so when an Order ID cell is blank"). `exactNumber` returns null for a blank or whitespace text cell and for a boolean cell, where `Number()` had given 0 or 1. It is shared with `quantityExact`, which already treats null as nothing to compare, so a blank quantity still reads as 0 with the same finding. `blankRequiredFields` flags `!Number.isInteger(id) || id <= 0`. New test goes through `Model.readRows` via new page helpers `sheetOf`/`exportRow`: blank and whitespace ids are each blocking. Against the previous commit's model and validator (Node, scratch `bite.cjs`) the same rows gave no finding. Both samples still two notices. Gate: check.sh OK; test:breadify all passed, 293 ok.
- 2026-09-29 · **R3 done** (commit "Say so when the substitute answer is blank or unclear"). `readRows` keeps `acceptAlternativesExact` from a new `exactBoolean`: true/false only for a real boolean, 1/0 (number or text), or true/false/yes/no; null for a blank, "ja", "N/A" or an error cell. `acceptAlternatives` still reads as before, so "Continue anyway" prints what it printed. `blankRequiredFields` adds the blocking "Accept alternatives is empty or not true/false on row N". The test's hand-built row helpers gained the exact value (twoRoutes still does not block). New test through `readRows`: blank and "ja" blocking; "no", 1 and FALSE read as false, true, false. Against the previous commit the blank and "ja" rows gave no finding (Node, scratch `bite.cjs`). Both samples still two notices. Gate: check.sh OK; test:breadify all passed, 296 ok.
- 2026-09-29 · **R4 done** (commit "Put the order id on a line of crates and a marker"). The spare line, used when an order's first line cannot hold its crates and marker, now carries the order's id after the marker. `readSharedBlocks` checks that a spare line carries the id of the line above it. The R1 hand-built case gained a third order whose first bread is one 48-letter word, too long even beside the compact crates, so a spare line really appears. Its first try put a SB Grovbrød first under item 11's sort and no spare line appeared; the Grovbrød is now Bakehuset's. The new check reads `[[1000000033]]`. Gate: check.sh OK; test:breadify all passed, 297 ok.
- 2026-09-29 · **R5 done** (commit "Size the part tag stand-in for any number of parts"). The trial tag is now `part N of N` for the stop's line count, since no stop has more parts than lines; `part 99 of 99` was narrower than a real tag from part 100 on. A final part over its cap that holds more than one line throws, so `rebuild()` refuses with its sentence instead of printing past the foot of the page. A part of one line may still be over, as before, because it cannot be cut further. Design D rule 3 updated. No new test: reaching 100 parts needs about 4,500 lines on one stop. Tall customer still 9 parts, one-giant-stop 8, freezer 20 sheets. Gate: check.sh OK; test:breadify all passed, 297 ok.
- 2026-09-29 · **R6 done** (commit "Cut a long block in time close to its length"). `mostLines(left, fit, guess)` starts from the previous part's take. On a fit it doubles up until a count fails; on a miss it halves down until one fits. Then it binary-searches the bracket. The contract is unchanged: the most lines that fit, 0 if none, with a known-failing upper bound. Timed against the previous commit's layout in one page (scratch `timecut.mjs`, one-order stops): 300 lines 235 → 181 ms, 600 lines 578 → 357 ms, 1,200 lines 1,693 → 685 ms, with the same sheet counts (16, 30, 60). The old search grows ~2.9× per doubling of lines, the new one ~1.9×. No suite test for speed; the part and line checks all pass (tall 9 parts, one-giant-stop 8, crowded 14 sheets, flag sweep clean). Gate: check.sh OK; test:breadify all passed, 297 ok.
- 2026-09-29 · **R7 done** (commit "Say that a block under the flag can be cut to keep the flag company"). Behaviour kept: the first stop under the unsequenced flag is packed against the page less the flag, so a block that fits a page but not beside the flag is cut. README's D9 bullet, INVENTORY's page-split entry and the `stopPieces` comment now say so, instead of "only when taller than a page". The flag sweep pins it: [lines, parts under the flag, parts with a position] = [38, 1, 1], [39, 2, 1], [40, 2, 1], [41, 2, 2]. At 39 and 40 lines the block fits a page whole but is cut under the flag. Gate: check.sh OK; test:breadify all passed, 298 ok (the comment edit came after that run; check.sh re-run OK).
