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
- **Day plan**: route name, driver, car, packing position (spot / garage / port) and the round it is packed in. Pink "Mark" highlight and "Gap" (blank line above, e.g. before HAU routes). A working rail beside the table holds the roster and the fleet: **add, rename, tag and delete** there, **drag a name or a registration straight onto the route it is driving**, and drag within the rail to reorder it. Everything in it is saved as you do it, and the Drivers and Cars tabs are still the full editors. Under the route list sit the day templates, then **the week**: a column for each day from Monday to Friday listing that day's crew, with **Load** at the top to make that crew the ones in and everyone else away.
- **Drivers**: a roster of the people who might drive, offered to the day plan as suggestions — the driver box still takes anything you type. Drivers carry a status label of their own, from the same list cars and positions use. Day groups are named crews (a Monday crew, a weekend crew): one click puts exactly those drivers in. A Monday-to-Friday crew is that day's column under the route list; **All**, Saturday's and Sunday's crews and any other group are buttons in the Drivers panel beside the day plan.
- **Day templates**: open one on the shelf to read the day it holds — route by route, with the driver, car and packing each was saved with. Save the plan as it stands — drivers, cars, positions, rounds and marks, but never the date — and put it back another day. Loading one asks first, saying how many routes it replaces, and takes a backup before it writes, so the Data tab can undo it. A template can offer itself when the plan is for its day: that is off until you pick a day for it, and even then it only offers.
- **Cars / Positions**: add, rename, reorder, delete. One-click status buttons (OK, Out of service, Unavailable, Workshop, your own) plus a note.
- **Warnings, not blocks**: a car on two routes, a spot taken twice **in the same round**, or a car you marked Workshop still being used — the day plan lists each one and flags the row, but lets you do it. Sometimes you mean it. Warnings are for before printing, so the printed sheet carries none.
- "Many cars" positions (Garage) can be shared by several routes, and any spot can be used again in a later round.
- **Labels**: create custom status labels with colours. Tick **Show on printout** on a label to list its parked cars under Cars not available on the printed sheet.
- **Share a finished list**: turns the day plan into a short code (or a link) to paste into a chat or an email. The other PC pastes it back and sees a preview before anything is replaced. Cars and positions are matched by registration and name, so it works between PCs that have never talked to each other. The code *is* the list — there is no server in the middle.
- **Print / save PDF**: native print dialog. Choose "Microsoft Print to PDF" for a file. The sheet also lists free cars, and parked cars whose label has Show on printout ticked.
- **Data**: saved in the browser as you type, plus an optional auto-saved file. Pick a file once (OneDrive, network drive, memory stick) and every change is written to it — by your browser, on your PC, with no upload. Export/Import JSON works in any browser. Automatic backups are taken before anything is cleared or deleted, and once at the start of each day. The first time an update is opened, the whole plan and setup is copied unchanged into **Archives** on the Data tab first, and a note says what changed; **What's new** there keeps every note.

## Use it
Open the Pages URL for this repo in Edge or Chrome. Nothing to install.

Optional Windows app — grab the latest from **Releases**:
- `car-coordinator.exe` (portable, no install)
- `Car Coordinator_x.y.z_x64-setup.exe` (installer)

**If the app ever won't start**, open [`recover.html`](docs/recover.html) beside it: on Pages that is `<the Pages URL>/recover.html`, and an empty page links to it too, in the Windows app as well. It shares no code with the app, changes nothing, lists everything this browser holds for Car Coordinator and downloads each piece exactly as stored, ready for **Import a copy…** on the Data tab.

Updating the Windows app: run the new installer over the old one. If it offers to uninstall the old version first, **never tick "Delete the application data"**: that folder is where the app keeps your plan, templates, drivers, cars and labels. The web version needs nothing: an update keeps everything saved in your browser.

Every push to `main` runs the tests and then builds and publishes the release `v<version>`, so every change that reaches `main` carries a version of its own: see **Releasing a change** below.

## Run it from a checkout
```
npm run dev        # serves docs/ on http://localhost:5173 — no npm install needed
npm run tauri:dev  # the Windows desktop shell instead; needs the Rust toolchain
```
A fresh checkout starts empty. For a full plan to work against, open the Data tab, press Import and pick `scripts/fixtures/dev-data.json`: 20 drivers, 17 cars, 8 positions, 5 crews and 2 templates, with one of each warning (a car on two routes, a spot twice in a round, a Workshop car in use) and some of each status. The names and registrations are made up.

## Tests
```
npm install
npm test               # both suites
npm run test:car       # headless Chromium: drives the UI, checks the printed sheet, fails on console errors
npm run test:breadify  # drives Breadify with both real exports and checks the sheets against the spec's figures
python3 scripts/make_edge_fixtures.py   # regenerates scripts/fixtures/edge/, only needed if you change those shapes
npm run screens        # drives the whole app the way a leader would and writes a screenshot of every tab
npm run upgrade -- <old checkout>   # opens an older build, then this one, in one browser profile: nothing saved lost, the copy in Archives, the note right
```
For the upgrade check, make the old checkout with `git worktree add --detach <dir> v0.2.4` (or the build live on `main`). It serves both builds on port 5199, one after the other, because saved data belongs to an address.
`test:breadify` reads the two anonymised sample exports in `scripts/fixtures/` and asserts the numbers the Breadify repo's docs state: the route 8 worked example, Customer 012's thirteen crates, Kneippbrød's four tray dots, the freezer day's 21 sheets, and ≥ 10 mm of clearance above every footer.

It then drives the awkward exports in `scripts/fixtures/edge/` and `scripts/fixtures/shape/` (regenerate either with `python3 scripts/make_edge_fixtures.py` / `make_shape_fixtures.py`). `edge/` is about scale and length — twelve bakeries on one route, an order with 300 product lines, a school kitchen taking 400 of one bread; `shape/` is about the file itself — a column added, a header renamed, a quantity that is zero, negative, fractional or four figures.

What it asserts of them is what a reader of the paper would: no ink leaves the sheet, every sheet keeps its 10 mm, no supplier code prints without the key explaining it, **nothing is set on top of anything else, and nothing is clipped away by the box holding it**. The last two matter most — a quantity of 1000 printed straight through the product name beside it, and the supplier key lost its final codes off the end of the band, and neither moved a single bounding box outside the page.

A change to the file's own shape must be either refused with a message naming the problem, or read correctly. It is never printed wrong.

One thing cannot be driven headlessly and needs a human in Edge or Chrome: the file picker for auto-save to a file.

## Releasing a change
Work is combined on `dev`, and `main` only ever receives `dev`. The rule, written the same way in the header of `docs/updates.js` and in the review-round container's Gates:

Announce and cut. Every change to shipped files under docs/ outside docs/breadify/ ends with "Announce ⟨what⟩ and cut ⟨version⟩": one commit that

- adds an entry at the top of docs/updates.js, with must set by the wording rules;
- moves six places to that version: package.json, package-lock.json (twice), src-tauri/Cargo.toml, src-tauri/tauri.conf.json and APP_VERSION in docs/app.js.

The ?v= on every local tag in docs/index.html and docs/recover.html follows APP_VERSION, and scripts/versions.mjs fails the item gate when any of it disagrees.

A pack takes the next minor version; any other shipped change takes at least the next patch. A change to Markdown or manifests alone cuts nothing.

Entries are never removed or renumbered. The walkthrough re-reads the entry against what shipped. Merging dev into main publishes Pages and builds release v⟨version⟩.

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
