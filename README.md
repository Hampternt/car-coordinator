# Car Coordinator

Tool for planning the daily route sheet: routes, drivers, cars and packing positions. Prints an A4 sheet in the same layout as the paper list on the pillar, or saves it as PDF.

Runs as a web page (GitHub Pages) or as a Windows desktop app (Tauri 2) — same files either way.

**Your data never leaves your PC.** The page is static; there is no server and no network call at runtime.

## Two apps, one Pages site

This repo publishes both halves of the warehouse morning:

- **Car Coordinator** — at the site root. Plans the day: which route, which driver, which car, which packing spot.
- **[Breadify](docs/breadify/)** — at `/breadify/`. Turns the day's bread or freezer export into the A4 picking lists the drivers pack those same routes from.

They share the routes and nothing else: no data passes between them, and each stores only its own settings in its own browser storage. Car Coordinator stays at the root because its share links and the QR codes on already-printed sheets encode that URL.

Breadify is a web port of the [Rust desktop app](https://github.com/Hampternt/Breadify), which still ships its own `.exe` and is still the source of truth for the printed page. The port follows that repo's `docs/print-spec.md` and the decision log `D1`–`D25` / `F1`–`F10`; `scripts/breadify.mjs` checks the output against the figures those documents state.

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
npm test               # both suites
npm run test:car       # headless Chromium: drives the UI, checks the printed sheet, fails on console errors
npm run test:breadify  # drives Breadify with both real exports and checks the sheets against the spec's figures
npm run screens        # drives the whole app the way a leader would and writes a screenshot of every tab
```
`test:breadify` reads the two anonymised sample exports in `scripts/fixtures/` and asserts the numbers the Breadify repo's docs state: the route 8 worked example, Customer 012's thirteen crates, Kneippbrød's four tray dots, the freezer day's 21 sheets, and ≥ 10 mm of clearance above every footer.

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
- `docs/` : Car Coordinator (plain HTML/CSS/JS, no framework). GitHub Pages serves this folder.
- `docs/breadify/` : Breadify, same stack and no build step either.
  - `xlsx.js` : reads the `.xlsx` in the browser — a zip reader over `DecompressionStream`, so there is no dependency to install
  - `model.js` : the data spine — rows to orders to routes, the natural route sort, crate arithmetic, route totals
  - `validate.js` : the seven checks from `excel-format.md` §6
  - `layout.js` : builds a sheet and shares the blocks out between pages
  - `sheet.css` : the printed A4 page, in millimetres and points
  - `app.js` / `style.css` / `index.html` : the four-step window
  - `fonts/` : Archivo, IBM Plex Mono and Space Grotesk, self-hosted so no printer falls back to a face with different metrics (all SIL OFL 1.1; licences beside them)
- `src-tauri/` : Rust shell, exposes `print_page`
- `scripts/make_icon.py` : generates the app icon at build time
- `scripts/smoke.mjs` and `scripts/breadify.mjs` : the two test suites, `scripts/screens.mjs` : the screenshot walkthrough, `scripts/serve.mjs` : the static server they all use
- `scripts/fixtures/` : the two anonymised sample exports the Breadify suite runs against
