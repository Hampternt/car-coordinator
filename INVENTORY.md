# Inventory

What this repo's two apps are, at feature altitude. Implementation lives in
`HANDOFF.md`, the code, and the pack manifests under `manifests/`.

State key: ✅ shipped · 🚧 in flight · 💭 considered

## Day plan
- ✅ **Route rows** — route name, driver, car, packing **position** and **round** as separate fields, with reorder and two-click delete.
- ✅ **Mark / Gap** — pink highlight on the printout; blank line above a row (used before the HAU routes).
- ✅ **Warnings, not blocks** — a car on two routes, a spot taken twice **in the same round**, or a marked-up car still in use are listed in an amber box and stripe the row, but never prevent the choice. The same spot in different rounds is not a clash.
- ✅ **Left rail** — drivers and cars in two compact panels beside the plan, each showing status and where it is assigned. Stacks above the table on a narrow screen.
- ✅ **Driver roster** — an editable list of drivers, offered to the day plan's driver box as suggestions while it stays free text. Starts empty.
- ✅ **Driver day groups** — named crews ("Monday") put in with one click, setting who is in today.
- ✅ **Day templates** — save the plan as it stands under a name, and click it to load it back. Loading asks first, naming what it replaces, and takes a backup. A template can offer itself on its weekday, but that is off unless you turn it on, and even then it only asks.

## Fleet
- ✅ **Round split out of old spot names** — for lists made when the round was written into the spot's name (`Spot 1/1`). Offered on load, never applied: it states every rename and merge line by line, says how many routes gain a round and how many keep the one already typed, names any setting the merging spots disagree about, and takes a backup before it touches anything. Dismissing changes nothing and it asks again next time.
- ✅ **Cars** — registrations (paste the whole fleet at once), one-click status chips, free-text note, "Assigned to" badge.
- ✅ **Positions** — named packing spots, a "many cars" flag for shared ones like the Garage, status and note.
- ✅ **Labels** — custom status labels with colours.

## Printing
- ✅ **A4 route sheet** — mirrors the paper list on the pillar: date top right, Route / Driver / Car / Packing round, pink rows, gap lines.
- ✅ **Check before posting** — unresolved clashes repeated on the sheet.
- ✅ **Unavailable and free cars** listed under the plan.
- ✅ **QR on the sheet** (browser build) — links the day plan so a phone can read it off the paper. Switchable off.

## Sharing
- ✅ **Share code / link** — the finished day plan encoded into a short code or URL fragment, matched back by registration and name so it works between PCs that never talked. Preview before anything is replaced. No server involved.

## Data
- ✅ **Local only** — `localStorage`, plus an optional auto-saved file via the File System Access API. No runtime network calls.
- ✅ **Export / import JSON**, with automatic backups before any clear or delete and once per day.

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
- ✅ **Seven checks before printing** — blank required fields, order lines that disagree, one address on two routes, a product id meaning two things, unfamiliar suppliers and route nicknames, unsequenced stops, the unlabelled fifteenth column. Findings are reported, never a reason to refuse the file.
- ✅ **Kind override** — a full-width `TREATED AS` banner in the list's own colour, for a renamed or custom filename. Flipping it re-validates on the spot, since what counts as familiar depends on the kind.

## The printed sheet
- ✅ **A4, one route per sheet set** — a route always starts a fresh page and no page ever carries two. A stop block never splits, and neither does the route total.
- ✅ **Delivery order top to bottom**, ties broken address → department → order id so two runs of one file print identically.
- ✅ **Unsequenced stops last, under a flag** — `Route ordering = 0` means nobody assigned a position, not "deliver last".
- ✅ **The crate label** — customer, and the department beneath it in its own outlined box.
- ✅ **Crate glyphs** from the per-bread size modifiers, compressing to `×N` rather than wrapping onto a second row of squares.
- ✅ **The substitute marker**, quiet for true and loud for false, with the badge and the heavy left rule a click away.
- ✅ **Route total** — per bakery, most to least, with a dot per full ten *inside a single order*. The freezer sheet's is flat and in two columns instead.
- ✅ **Pallet call** in the page note when a route needs more than 16 crates, in the short form when the line is already crowded.
- ✅ **The freezer check list** — `C Checked · M Missing`, a dotted note field for the checker's pen, no crates and no tray dots.
- ✅ **Self-hosted faces**, so no printer falls back to one with different metrics and silently re-sizes the page.

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

*(empty)*
