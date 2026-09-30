# Inventory

What this repo's two apps are, at feature altitude. Implementation lives in
`HANDOFF.md`, the code, and the pack manifests under `manifests/`.

State key: ✅ shipped · 🚧 in flight · 💭 considered

## In flight
- 🚧 **The review round** — all nine packs are built and merged into `dev` (0.11.0), with Breadify's blocks. Waiting for the owner to test `dev` before it goes to `main`. `manifests/2026-09-28-review-round.md`.

## Day plan
- ✅ **Route rows** — route name, driver, car, packing **position** and **round** as separate fields, with reorder and two-click delete.
- ✅ **Mark / Gap** — pink highlight on the printout; blank line above a row (used before the HAU routes).
- ✅ **Warnings, not blocks** — a car on two routes, a spot taken twice **in the same round**, or a marked-up car still in use are listed in an amber box and stripe the row, but never prevent the choice. The same spot in different rounds is not a clash.
- ✅ **Left rail** — drivers and cars in two compact panels beside the plan, each showing status and where it is assigned. Stacks above the table on a narrow screen.
- ✅ **Driver roster** — an editable list of drivers, offered to the day plan's driver box as suggestions while it stays free text. Starts empty.
- ✅ **Drivers tab: usual days, tags and notes** — tick the weekdays (Monday to Friday) a driver usually works, which puts them in that day's group, plus one tag from the shared list and a free note per driver.
- ✅ **Driver day groups** — named crews ("Monday") put in with one click, setting who is in.
- ✅ **Day templates** — save the plan as it stands under a name, and Load it back. Loading asks first, naming what it replaces, and takes a backup. Monday to Friday sit in columns like the week; each card has Load and Save. Templates no longer offer themselves on a weekday (0.14.1).
- ✅ **Weekday templates, saving into a template, loading in parts** — Monday to Friday templates ready on the shelf (empty until Save fills them), a Save button on each card (Update from plan until 0.14.1), and a load that asks which parts to take (routes, drivers, cars, positions and rounds) and says exactly what it will do (0.13.0).
- ✅ **Parking map** — a plain drawing of the yard under the week: Spot 1 to Spot 5 and the Gate, each with its routes by round, red when taken twice in one round; other positions listed under it.
- ✅ **Day plan layout** — day templates straight under the route list, then the week: a column per weekday listing that day's crew, with Load above each, replacing the Mon–Sun buttons.
- ✅ **Plan for tomorrow** — a passed date moves to the next working day when the app opens, with Keep to put it back, and a line under the Date says what day the plan is for.
- ✅ **Right-click menus** — right-click a route, a rail row, a row of the Drivers, Cars, Positions or Labels tab, or a template card for a short menu of what can be done to that one thing; text boxes keep the browser's own Cut, Copy and Paste.

- ✅ **Driver tags apart from car labels** — drivers get their own tag list (Sick, Holiday, Vacation, Course, Special situation and your own), set from the Drivers tab, the Drivers panel or a right-click's Tag submenu; cars and positions keep their labels. Every driver's old tag is carried over (0.12.0).

## Fleet
- ✅ **Round split out of old spot names** — for lists made when the round was written into the spot's name (`Spot 1/1`). Offered on load, never applied: it states every rename and merge line by line, says how many routes gain a round and how many keep the one already typed, names any setting the merging spots disagree about, and takes a backup before it touches anything. Dismissing changes nothing and it asks again next time.
- ✅ **Cars** — registrations (paste the whole fleet at once), one-click status chips, free-text note, "Assigned to" badge.
- ✅ **Positions** — named packing spots, a "many cars" flag for shared ones like the Garage, status and note.
- ✅ **Labels** — custom status labels with colours.

## Printing
- ✅ **A4 route sheet** — mirrors the paper list on the pillar: date centred with the weekday in words under it, Route / Driver / Car / Packing round, pink rows, gap lines.
- ✅ **Check before posting** — unresolved clashes repeated on the sheet.
- ✅ **Unavailable and free cars** listed under the plan.
- ✅ **QR on the sheet** (browser build) — links the day plan so a phone can read it off the paper. Switchable off.
- ✅ **Printed sheet cleanup** — no QR code and no warnings on paper; Cars not available lists only parked cars whose label has a new Show on printout tick.

## Sharing
- ✅ **Share code / link** — the finished day plan encoded into a short code or URL fragment, matched back by registration and name so it works between PCs that never talked. Preview before anything is replaced. No server involved.

## Data
- ✅ **Dark mode** — the screen follows the computer's light or dark setting, with a Colours switch on the Data tab for this browser; the printed sheet stays black on white.
- ✅ **Local only** — `localStorage`, plus an optional auto-saved file via the File System Access API. No runtime network calls.
- ✅ **Export / import JSON**, with automatic backups before any clear or delete and once per day.
- ✅ **Update note and Archives** — a note after each update saying what changed and what it did to your data, and an untouched copy of your plan and setup kept from before every update, with a recovery page for when the app won't start.
- ✅ **Info bubbles instead of the tour** — a small ⓘ beside each part of the app opens a short explanation next to it, and a first-ever open shows one line pointing at them; they replace the first-use tour and its Tour button (0.14.0).

## Packaging
- ✅ **GitHub Pages** — the primary delivery; `docs/` is the published folder.
- ✅ **Windows desktop (Tauri 2)** — portable exe and installer, built and released on every push to `main`.

# Breadify

The other half of the morning, at `/breadify/` on the same Pages site: the
day's bread or freezer export turned into the A4 picking lists the drivers
pack Car Coordinator's routes from. A web port of the Rust desktop app, which
stays where it is and stays the source of truth for the printed page.

## Reading the export
- ✅ **`.xlsx` in the browser** — a zip reader over `DecompressionStream` and `DOMParser`, so there is no dependency and no build step. Absent cells are read as absent, and `Accept alternatives` as the real Excel boolean it is.
- ✅ **Kind and date from the filename** — `PSR-BREAD-` / `PSR-FREEZER-`, browser ` (1)` suffix tolerated. No column carries a date.
- ✅ **Nine checks before printing** — blank required fields (among them a missing or unreadable Order ID, and a substitute answer that is blank or not true/false), order lines that disagree, one address on two routes, a product id meaning two things, impossible quantities, unfamiliar suppliers and route nicknames, two bakeries sharing a supplier code, unsequenced stops, the unlabelled fifteenth column. Findings are reported, never a reason to refuse the file.
- ✅ **Kind override** — a full-width `TREATED AS` banner in the list's own colour, for a renamed or custom filename. Flipping it re-validates on the spot, since what counts as familiar depends on the kind.

## The printed sheet
- ✅ **A4, one route per sheet set** — a route always starts a fresh page and no page ever carries two. A stop block, and the route total, split only when taller than a page: a block between whole orders first, each part repeating the customer's name with `part N of M`, a continued order saying so, and its crates printed once. The one other split is the first block under the "no position assigned" flag. If it fits a page but not beside the flag, it is split so the flag never ends a page alone.
- ✅ **Delivery order top to bottom**, ties broken address → customer → department → order id so two runs of one file print identically.
- ✅ **Unsequenced stops last, under a flag** — `Route ordering = 0` means nobody assigned a position, not "deliver last". The flag never ends a page on its own.
- ✅ **The crate label** — customer, and the department beneath it in its own outlined box.
- ✅ **One block per customer at a stop** — a customer's several orders at one stop print in one block, grouped by department (a quiet sub-heading each when they differ) and kept apart by order. Every line carries its order id, small and grey, and each order's marker sits on its first line. No order's lines are added to another's. Crates are counted per customer and department, the orders' bread packed together, and print once at the right of that group's heading line. A departure from the Rust app, which prints one block and one crate count per order.
- ✅ **Breads sorted within each order** — Sandnes Bakeri first, then Bakehuset, then any other supplier A to Z by its code; within a supplier, A to Z by bread name in the Norwegian alphabet. Never across orders. The Rust app keeps the file's order.
- ✅ **Crate glyphs** from the per-bread size modifiers, compressing to `×N` rather than wrapping onto a second row of squares.
- ✅ **The substitute marker** — `want substitute: true` or `want substitute: false` in the same quiet type on every order, with only the word **false** in bold.
- ✅ **Route total** — per bakery, most to least, with a dot per full ten *inside a single order*. The freezer sheet's is flat and in two columns instead.
- ✅ **Pallet call** in the page note when a route needs more than 16 crates, in the short form when the line is already crowded.
- ✅ **The freezer check list** — `C Checked · M Missing`, a dotted note field for the checker's pen, no crates and no tray dots.
- ✅ **Self-hosted faces**, so no printer falls back to one with different metrics and silently re-sizes the page.
- ✅ **Says so rather than misprints** — an Order ID that is blank or not a whole number, and a substitute answer the file doesn't state plainly (blank, "ja", an error cell), are blocking findings at Check. Continue anyway stays the leader's call, and such an answer then prints as false. Past Check, the layout still refuses an order with no true/false answer or no numeric id: the Print step says why instead of printing.

## Printing
- ✅ **Browser print dialog** — pick the printer there, or "Microsoft Print to PDF" for a file. The step says to print at 100 %, actual size.
- ✅ **Route selection** — all ticked, untick any you don't want; the preview and the sheet count follow.
- ✅ **Crate rules remembered** — capacities and per-bread sizes, because those are facts about the warehouse. Nothing else about today's print is kept.
- ✅ **Two jokes at low opacity** behind the steps that carry them: a bread roll at a computer behind Check, and Megamind asking `NO BREAD?` behind Open while nothing has been opened. The Check step's finding cards are translucent for the first one's sake.

## Considered
- 💭 **Printing the freezer `Position`** as a where-to-look-first hint. The loader carries it; the page does not show it.

## Considered

Raised by you but not scheduled. A record, not a roadmap — nothing reaches
this list that you did not ask for.

- 💭 **A driver's working hours** — beyond which days, the time they usually start. On screen only, never on the printed sheet.
- 💭 **Plan ahead, saved to a date** — plan tomorrow and submit it as that day's list, then plan two days ahead and submit that, each kept under its own date in a separate saved-days area, with a Plan ahead / Save to date button. Not for the current version.
