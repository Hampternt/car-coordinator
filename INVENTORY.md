# Inventory

What Car Coordinator is, at feature altitude. Implementation lives in
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

## Considered

Raised by you but not scheduled. A record, not a roadmap — nothing reaches
this list that you did not ask for.

*(empty)*
