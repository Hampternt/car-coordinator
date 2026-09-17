# Handoff: Car Coordinator

Context summary for continuing this project in Claude Code. Written 2026-09-17.

## What it is
Tool for the warehouse team leader to plan the daily route sheet (route, driver, car, packing round) and print it. The printout mirrors the paper list posted in the warehouse: date top right underlined, columns Route / Driver / Car / Packing round, pink highlighted rows, blank line before the HAU routes.

## Current state (all on `main`)
- Plain HTML/CSS/JS in `src/` (no framework, no build step). Tauri 2 shell in `src-tauri/` (only adds a `print_page` command; UI falls back to `window.print()`).
- Tabs: Day plan, Cars, Positions, Labels, Print preview.
  - Day plan: per route driver text, car select, position select, "Mark" (pink), "Gap" (blank line above), reorder, delete (two-click confirm). Cars/positions that are labelled or already used are disabled in selects; conflicts show red warnings. Pools of free / unavailable cars below.
  - Cars: reg, "Assigned to" badges (route, driver, position) or "Not assigned", counts bar, one-click status label chips, note.
  - Positions: name, "Many cars" flag (Garage), status labels, note.
  - Labels: custom status labels with colour.
  - Printout also lists unavailable cars/positions and free cars.
- State: one object in `localStorage` key `carcoord:v1`:
  `{ date, positions:[{id,name,multi,labelId,note}], labels:[{id,name,color}], cars:[{id,reg,labelId,note}], routes:[{id,name,driver,carId,positionId,highlight,gapBefore}] }`
  IDs are random per install, so they are NOT stable across PCs.
- Tested in headless Chromium (Playwright): no errors, A4 PDF output correct. Windows exe build NOT verified yet.
- `.github/workflows/build.yml` is NOT in the repo yet: the claude.ai GitHub integration cannot write workflow files. The intended file (build Tauri on windows-latest, publish release `v<version>` via softprops/action-gh-release) exists locally in the previous chat; recreate it if the exe is still wanted.
- Design tokens (see `src/style.css`): concrete grey bg, ink #1a1c1e, steel #2f4a5c, hi-vis yellow #ffd400, marker pink #ff8fc2, warn red. Bahnschrift headings, Segoe UI body, Arial bold on the printout.

## Decisions made
1. Primary delivery: **web app on GitHub Pages**. Exe is optional/secondary.
2. **No data stored online, ever.** Pages only serves code. All data stays on the leader's PC.
3. Free GitHub plan means the repo must be **public** for Pages, so remove the seeded car registrations from `defaults()` in `src/app.js` (start empty or with a neutral example).
4. Move the app from `src/` to `docs/` (Pages source: main, /docs) and set `frontendDist` to `../docs` in `src-tauri/tauri.conf.json`.

## To build next
### A. Don't forget data (local only)
- Call `navigator.storage.persist()` on start.
- Auto-save to a user-picked JSON file with the File System Access API (Edge/Chrome): "Choose save file" once, keep the handle in IndexedDB, write on every change, re-request permission when needed. "Open file" restores.
- Fallback for all browsers: **Export** (download JSON) and **Import** (file picker).
- Add `schemaVersion` to the data and validate on import.

### B. Share a finished list between managers (semi-sync, no server)
Goal: a manager can load a list another manager finished.
- **Share payload**: minimal JSON of the day plan, referencing cars/positions/labels **by name/reg, not id** (ids differ per PC). Compress with native `CompressionStream('deflate-raw')`, base64url encode, prefix with a version tag like `CC1.`.
- **Share link**: `https://<pages-url>/#d=<payload>`. The URL fragment is never sent to the server, so this stays offline-safe. "Copy share link" button; on load, if `#d=` is present, show an import dialog, then clear the hash.
- **QR code on the printout**: small QR in a corner of the sheet holding the same payload, so a paper list or its PDF can be scanned back in. Import via webcam (`BarcodeDetector` in Chromium) with a vendored fallback decoder (e.g. jsQR) and "import from image" (photo or screenshot). Check payload size fits a QR that still scans when printed small.
- **Optional: hidden text in the PDF**: payload as tiny white text in the sheet (marker `CC1.`), imported from a PDF via vendored pdf.js text extraction. Fragile; lower priority than QR.
- **Import dialog options**: "Day plan only" (date + routes) vs "Everything" (also cars, positions, labels). Match by name; unknown cars/positions are either added or flagged, user chooses. Show a preview/diff before applying.

### C. Constraints
- No runtime network calls; vendor any libraries into the repo (no CDNs).
- Keep it plain JS without a build step so Pages and Tauri serve the same files.
- Keep the printout layout identical to the paper list; QR must not break it.

## Open questions
- Does the work PC allow opening GitHub Pages and use Edge? (Assumed yes.)
- Should unavailable/free car lists stay on the printout?
- Keep the exe at all once the web app works?
