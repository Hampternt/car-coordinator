# Inventory

What Car Coordinator is, at feature altitude. Implementation lives in
`HANDOFF.md`, the code, and the pack manifests under `manifests/`.

State key: ✅ shipped · 🚧 in flight · 💭 considered

## Day plan
- ✅ **Route rows** — route name, driver (free text), car, packing position, with reorder and two-click delete.
- ✅ **Mark / Gap** — pink highlight on the printout; blank line above a row (used before the HAU routes).
- ✅ **Warnings, not blocks** — a car on two routes, a spot taken twice, or a marked-up car still in use are listed in an amber box and stripe the row, but never prevent the choice.
- 🚧 **Day templates — save a plan and load it back** — see [`manifests/2026-09-18-day-templates.md`](manifests/2026-09-18-day-templates.md).
- 🚧 **Left rail, driver roster with day groups, and a position/round split** — see [`manifests/2026-09-18-day-plan-rail-and-round.md`](manifests/2026-09-18-day-plan-rail-and-round.md).

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
