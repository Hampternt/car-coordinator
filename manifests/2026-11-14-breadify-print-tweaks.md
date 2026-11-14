# Plan: Breadify — tick all / untick all, and each order on the route total

**Status:** ✅ merged into `dev` 2026-11-14, after the owner tested it by hand. Waiting, with the rest of `dev`, on the release to `main`.

Issues: [#27](https://github.com/Hampternt/car-coordinator/issues/27) (tick all / untick all) and [#26](https://github.com/Hampternt/car-coordinator/issues/26) (each order's quantity on the route total). Mockup of #26: [Route Total Occurrences](https://claude.ai/artifact/SAvhTXmTsXd5Gyqx3eBd8d).

## Goal

1. **Tick all / Untick all (#27).** On Breadify's Print step, the person printing can tick or untick every route in one click, so printing a handful of routes no longer means unticking the other dozen one by one.
2. **Each order on the route total (#26).** Each bread on a bread route's total keeps its total, and after it lists every separate order of that bread on the route, by quantity only: `27  Grovbrød  12, 10, 5`. No customer names. Orders are never merged, even when one customer orders the bread several times, in the same department or in different ones.

## Decisions

### Tick all / Untick all

- **Two buttons, `Tick all` and `Untick all`** (the owner, 2026-11-14). Not chosen: one button whose label switches.
- **A button that would change nothing is disabled.** `Tick all` when every route is ticked, `Untick all` when none is.
- **The selection lasts as long as it does today.** Resets to all ticked when a file is opened or the kind is switched (`revalidate()`), kept when moving between steps, not remembered between visits. Not chosen: remembering ticks on this PC.
- **No change to the sheets.** Only the controls change.
- **No version cut.** The #27 plan said a patch release with an update note; the release rules say Breadify changes (`docs/breadify/`) do not cut a car-app version, and the last Breadify change (04f1226) cut none. Following the rules.

### Each order on the route total

The issue left these open; the owner said "begin implementing", so each takes the mockup's default (the first option on its switch). Each is a small change to revisit after the hands-on test.

- **Line order stays as today: total, bread, then the orders, then the ten-dots** (the owner, 2026-11-14, asked during the build). Not chosen: bread first, as the issue wrote it, which moves every total's column.
- **The orders print in stop order** (the route's printing order, which is `route.orders`). Not chosen: largest first.
- **Ten-dots are kept.** Not chosen: dropping them now that a `10` or `15` shows in the list.
- **A bread with one order still prints its one entry,** so the rule is the same on every line. Not chosen: total only.
- **One order is one entry.** The same bread on two lines of one order sums into that order's entry. Different orders are never merged.
- **The entries are the counted quantities,** so they always add up to the total. A quantity written as text (`3 stk`) counts as the number it starts with, as the total already does.
- **Bread total only.** The freezer total (`flatTotal()`, with its C boxes) is unchanged.
- **Long lists wrap** inside their column; the existing measured split of a too-tall total handles any extra height.
- **Printed in black,** the same ink as the rest of the row; the mockup's red was only to show what is new.

## Guidelines

- **Read first:** this file; `INVENTORY.md`'s Breadify section; `manifests/2026-10-01-breadify-fixes.md` (how ticking and the preview work); then the code each part touches, below. Match the code's comment voice: why, with the owner's words and dates.
- **Tick all / Untick all:** `docs/breadify/app.js` from `renderPrint()` through `later()`, `flush()` and `rebuild()`; the "Ticking routes" block in `scripts/breadify.mjs`; the Print step markup in `docs/breadify/index.html`; `docs/breadify/style.css` (`.shortfall button` for the button pattern).
  - Each button sets `state.selected`, sets each checkbox's `.checked`, and calls `later()` exactly once. Never `rebuild()` directly: that keeps the pause, the `flush()` before printing and "an untick lays out nothing".
  - Untick all needs no new path: `rebuild()` already handles zero routes.
  - Keep the buttons' disabled state in one small `syncBulk()`, called from `renderPrint()` and every route's `onchange`.
  - `Routes` and the two buttons on one flex row; keep `.pane h2:first-child { margin-top: 0 }` working.
  - Outlined, quiet, small buttons in the page's neutral colours, with a visible `:disabled` state. Not `primary`: Print is the step's one primary action.
  - Hint: "All routes start ticked. Untick any you don't want, or untick all and tick the few you do."
- **Each order on the route total:** `docs/breadify/model.js` `routeTotal()`; `docs/breadify/layout.js` `totalRow()` and `routeTotalBlock()`; `docs/breadify/sheet.css` (the `.bf-total-*` rules).
  - Keep the per-order quantities in `routeTotal()` (for example `orders: [12, 10, 5]` per line), built per order, in `route.orders` order.
  - `flatTotal()` and the freezer's `checkTotalBlock()` print exactly what they print today.
  - The sheet's type floor (11 pt body) applies: the list may be a little smaller than the total only if the sheet already has a smaller size for secondary text on a total row; otherwise the body size.
- **Never mix the two parts' tests:** #27 in or beside "Ticking routes", #26 in a new section beside "The freezer list" or the route-total checks.
- **Gates.** Quick: `bash scripts/check.sh`, plus `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/breadify.mjs` when logic changed. Full, once at the end: `npm test` and `npm run screens`.

## Done when

- From a fresh Print step, `Untick all` then one route's tick leaves exactly that route in the preview, ready to print.
- `Tick all` brings back the full day, sheet for sheet the same as opening the step.
- Each button is disabled exactly when pressing it would change nothing.
- Pressing Print straight after a bulk button prints what is ticked.
- On the bread sample, route 1's total shows `Barnehagebrødet - Oppskåret 750g` as `37` with `10, 3, 5, 6, 6, 7` after it, and every bread line's entries add up to its total.
- The freezer sheets are unchanged.
- New checks in `scripts/breadify.mjs` cover all of the above, and `npm test` is green.

## Test it yourself

1. Run `npm run dev` and open `http://localhost:5173/breadify/`.
2. Open `scripts/fixtures/PSR-BREAD-2026-03-04-to-2026-03-04 (1).xlsx` and go to **04 Print**. All 16 routes are ticked, and `Tick all` is greyed out.
3. Press **Untick all**. The preview empties, the summary reads `0 routes · 0 sheets of A4.`, Print is greyed out, "Left out on purpose" lists every route, and `Untick all` is greyed out.
4. Tick **Route 1** by hand. Only route 1's sheets show, and both buttons are active.
5. Look at route 1's total. `Barnehagebrødet - Oppskåret 750g` reads `37`, then `10, 3, 5, 6, 6, 7`. `Ryfylkebrød` reads `14`, then `3, 4, 6, 1`: three of those are one customer under three departments, kept apart.
6. Press **Print / save PDF** straight away. The dialog shows only route 1. Cancel it.
7. Press **Tick all**. Every route comes back in file order, and `Tick all` is greyed out again. Route 14's total shows Ryfylkebrød with nine entries, wrapped inside its column.
8. Go back to **03 Configure** and return to Print. The ticks are as you left them.
9. Switch the kind to Freezer and back, or open the file again. Every route is ticked again.
10. Open the freezer fixture (`PSR-FREEZER-2026-01-23-to-2026-01-23 (1).xlsx`). Repeat steps 2–3; the freezer totals look as they did before, with no list of orders.

## Built

Two builders in parallel (one per part), each branch reviewed adversarially and its findings fixed, then merged here.

**Tick all / Untick all** — `docs/breadify/app.js` (`tickEvery()`, `syncBulk()`), `index.html` (the `Routes` row and hint), `style.css` (`.routes-head`, `.bulk button`); checks in a new "Tick all / Untick all" section of `scripts/breadify.mjs`.

**Each order on the route total** — `model.js` `routeTotal()` keeps `orders: [...]` per line (one entry per order, stop order, an order's lines summed); `layout.js` `totalRow()` prints the list after the name on bread rows only; `sheet.css` `.bf-total-cell` / `.bf-total-orders`, mono, 9.2 pt like the bread name, black. Checks in a new "Each order on the route total" section.

**Done differently from the plan, and why:**
- `printNow()` returns when nothing is laid out, so Print straight after Untick all opens no empty dialog (Print stays enabled until the pending update runs). Ctrl+P with nothing ticked now opens no dialog either.
- Review fix: printing from the browser's own menu on the Print step with nothing ticked says "no route is ticked" instead of "Open the Print step".
- Review fix: `totalPieces()` now measures every part of a split route total, not only the first. Rows are now uneven in height, so a later part could have spilled off the page with nothing saying so.
- Review fix: ten-dots count each order's summed entry, not each line, so the dots always match the printed list (5 + 6 on two lines of one order is `11` with a dot).
- The bread sample prints on **29 sheets, not 28**: route 7's total no longer fits under its stops and moves whole onto a second sheet. README updated. Neither sample raises the red "pages do not carry every bread" warning; the freezer sample is still 21 sheets, its totals byte-identical.
- No version cut: Breadify changes cut none (see Decisions).

**Gates** (frozen copy of 3009b41):
- Quick: `CHECK OK — every shipped script parses and the versions agree.`
- `npm test`: `map checks passed` · `sync checks passed` · `sync-relay checks passed` · `sync-ui checks passed` · `presence-ui checks passed` · `all checks passed` (car) · `all passed` (Breadify) · `npm test exit 0`.
- `npm run screens`: `no console errors, 4 warnings raised and asserted` · exit 0.
- Smoke load in Chrome: both fixtures' Print step loads with no console errors or warnings; bread 29 sheets, freezer 21; `Tick all` disabled on entry.
