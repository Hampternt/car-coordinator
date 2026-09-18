# Car Coordinator

Tool for planning the daily route sheet: routes, drivers, cars and packing positions. Prints an A4 sheet in the same layout as the paper list on the pillar, or saves it as PDF.

Runs as a web page (GitHub Pages) or as a Windows desktop app (Tauri 2) — same files either way.

**Your data never leaves your PC.** The page is static; there is no server and no network call at runtime.

## Features
- **Day plan**: route name, driver, car, packing position (spot / garage / port) and the round it is packed in. Pink "Mark" highlight and "Gap" (blank line above, e.g. before HAU routes). A rail down the left shows the day's drivers and the whole fleet with its status, so you can fill the table in without changing tab.
- **Drivers**: a roster of the people who might drive, offered to the day plan as suggestions — the driver box still takes anything you type. Day groups are named crews (a Monday crew, a weekend crew): one click puts exactly those drivers in for today.
- **Day templates**: save the plan as it stands — drivers, cars, positions, rounds and marks, but never the date — and put it back another day. Loading one asks first, saying how many routes it replaces, and takes a backup before it writes, so the Data tab can undo it. A template can offer itself when you open the app on its day: that is off until you pick a day for it, and even then it only offers.
- **Cars / Positions**: add, rename, reorder, delete. One-click status buttons (OK, Out of service, Unavailable, Workshop, your own) plus a note.
- **Warnings, not blocks**: a car on two routes, a spot taken twice **in the same round**, or a car you marked Workshop still being used — the day plan lists each one and flags the row, but lets you do it. Sometimes you mean it.
- "Many cars" positions (Garage) can be shared by several routes, and any spot can be used again in a later round.
- **Labels**: create custom status labels with colours.
- **Share a finished list**: turns the day plan into a short code (or a link) to paste into a chat or an email. The other PC pastes it back and sees a preview before anything is replaced. Cars and positions are matched by registration and name, so it works between PCs that have never talked to each other. The code *is* the list — there is no server in the middle.
- **QR on the sheet** (browser version): the printed sheet carries a link to the day plan as a QR in the corner, so a phone can read the list off the paper on the pillar. Turn it off on the Data tab to keep the sheet bare.
- **Print / save PDF**: native print dialog. Choose "Microsoft Print to PDF" for a file. The sheet also lists unavailable cars/positions and free cars.
- **Data**: saved in the browser as you type, plus an optional auto-saved file. Pick a file once (OneDrive, network drive, memory stick) and every change is written to it — by your browser, on your PC, with no upload. Export/Import JSON works in any browser. Automatic backups are taken before anything is cleared or deleted, and once at the start of each day.

## Use it
Open the Pages URL for this repo in Edge or Chrome. Nothing to install.

Optional Windows app — grab the latest from **Releases**:
- `car-coordinator.exe` (portable, no install)
- `Car Coordinator_x.y.z_x64-setup.exe` (installer)

Every push to `main` runs the tests and then builds and publishes the release. Bump `version` in `src-tauri/tauri.conf.json` to create a new release instead of updating the current one.

## Run it from a checkout
```
npm run dev        # serves docs/ on http://localhost:5173 — no npm install needed
npm run tauri:dev  # the Windows desktop shell instead; needs the Rust toolchain
```

## Tests
```
npm install
npm test          # headless Chromium: drives the UI, checks the printed sheet, fails on console errors
npm run screens   # drives the whole app the way a leader would and writes a screenshot of every tab
```
One thing cannot be driven headlessly and needs a human in Edge or Chrome: the file picker for auto-save to a file.

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
- `scripts/smoke.mjs` : the test suite, `scripts/screens.mjs` : the screenshot walkthrough, `scripts/serve.mjs` : the static server both use
