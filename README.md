# Car Coordinator

Tool for planning the daily route sheet: routes, drivers, cars and packing positions. Prints an A4 sheet in the same layout as the paper list on the pillar, or saves it as PDF.

Runs as a web page (GitHub Pages) or as a Windows desktop app (Tauri 2) — same files either way.

**Your data never leaves your PC.** The page is static; there is no server and no network call at runtime.

## Features
- **Day plan**: route name, driver, car, packing round (spot / garage / port). Pink "Mark" highlight and "Gap" (blank line above, e.g. before HAU routes).
- **Cars / Positions**: add, rename, reorder, delete. One-click status buttons (OK, Out of service, Unavailable, Workshop, your own) plus a note.
- Marked or already-used cars and positions are greyed out in the dropdowns; conflicts show a red warning.
- "Many cars" positions (Garage) can be shared by several routes.
- **Labels**: create custom status labels with colours.
- **Share a finished list**: turns the day plan into a short code (or a link) to paste into a chat or an email. The other PC pastes it back and sees a preview before anything is replaced. Cars and positions are matched by registration and name, so it works between PCs that have never talked to each other. The code *is* the list — there is no server in the middle.
- **QR on the sheet**: the printed sheet carries the day plan as a QR in the corner. A phone opens it; another PC reads it back with a webcam or from a photo. Turn it off on the Data tab if you would rather keep the sheet bare.
- **Print / save PDF**: native print dialog. Choose "Microsoft Print to PDF" for a file. The sheet also lists unavailable cars/positions and free cars.
- **Data**: saved in the browser as you type, plus an optional auto-saved file. Pick a file once (OneDrive, network drive, memory stick) and every change is written to it — by your browser, on your PC, with no upload. Export/Import JSON works in any browser. Automatic backups are taken before anything is cleared or deleted, and once at the start of each day.

## Use it
Open the Pages URL for this repo in Edge or Chrome. Nothing to install.

Optional Windows app — grab the latest from **Releases**:
- `car-coordinator.exe` (portable, no install)
- `Car Coordinator_x.y.z_x64-setup.exe` (installer)

Every push to `main` runs the tests and then builds and publishes the release. Bump `version` in `src-tauri/tauri.conf.json` to create a new release instead of updating the current one.

## Tests
```
npm install
npm test          # headless Chromium: drives the UI, checks the printed sheet, fails on console errors
```
Two things cannot be driven headlessly and need a human in Edge or Chrome: the file picker (auto-save to a file) and the webcam scanner.

## Build locally (Windows)
Needs Rust, Node 20 and Python with Pillow.
```
npm install
python scripts/make_icon.py
npx tauri icon app-icon.png
npx tauri dev      # run
npx tauri build    # release exe
```

## Layout
- `docs/` : the app (plain HTML/CSS/JS, no framework). GitHub Pages serves this folder.
- `src-tauri/` : Rust shell, exposes `print_page`
- `docs/vendor/` : jsQR (Apache-2.0), vendored so the app makes no network calls
- `scripts/make_icon.py` : generates the app icon at build time
- `scripts/smoke.mjs` : the test suite
