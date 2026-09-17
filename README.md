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
- **Print / save PDF**: native print dialog. Choose "Microsoft Print to PDF" for a file. The sheet also lists unavailable cars/positions and free cars.
- Data is saved automatically on the PC (WebView local storage).

## Use it
Open the Pages URL for this repo in Edge or Chrome. Nothing to install.

Optional Windows app — grab the latest from **Releases**:
- `car-coordinator.exe` (portable, no install)
- `Car Coordinator_x.y.z_x64-setup.exe` (installer)

Every push to `main` builds on GitHub Actions and publishes the release. Bump `version` in `src-tauri/tauri.conf.json` to create a new release instead of updating the current one.

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
- `scripts/make_icon.py` : generates the app icon at build time
