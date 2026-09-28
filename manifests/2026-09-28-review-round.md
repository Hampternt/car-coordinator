# Container: The review round

**Status:** 💭 planned — pack order awaiting the owner's approval; nothing built
**Date:** 2026-09-28
**Branch:** none yet. Each pack cuts its own branch from `main` when it starts, after the one before it has merged. Before pack 1: merge `dev-test-data` (dev fixture, README line, these notes). That merge is docs-only, but a push to `main` still rebuilds the v0.2.4 release in place.

## Goal

Everything the owner raised while reviewing the app on 2026-09-28 ships, plus
three new features: a note after each update, right-click menus, and a tour
for new users. Each pack ships on its own, announces itself in the update note
the next time the app is opened, and leaves every user's saved data as it was.

## Packs, in order

| # | Pack | Manifest | Changes saved data? |
|---|---|---|---|
| 1 | Update note | `manifests/2026-09-28-update-note.md` (drafting) | New per-PC key only; a backup before each update |
| 2 | Dark mode | created when it starts | New per-PC key only |
| 3 | Printed sheet cleanup | created when it starts | **Yes**: a new tick on each label (schema v5) |
| 4 | Plan for tomorrow | created when it starts | Moves the saved date forward on open |
| 5 | Day plan layout | created when it starts | No |
| 6 | Drivers tab | created when it starts | No (fields that exist already) |
| 7 | Parking map | created when it starts | No, if spots match positions by name |
| 8 | Right-click menus | `manifests/2026-09-28-context-menus.md` (drafting) | No |
| 9 | First-use tour | `manifests/2026-09-28-tour.md` (drafting) | New per-PC key only |

Only one pack is active at a time. Every pack except dark mode writes
`docs/app.js`, so running packs in parallel would conflict. The order is
chosen so that later packs build on earlier ones:

- **Update note first:** every pack after it announces itself.
- **Dark mode second:** everything built after it (week columns, map, menus,
  tour) uses the colour tokens from the start and gets dark mode free, instead
  of being retrofitted.
- **Sheet cleanup before tomorrow:** it is the one schema bump, and it is
  better settled early while the other packs touch no stored fields.
- **Tomorrow before layout:** the week columns and template offers go by the
  plan's date, so the plan's date has to be right first.
- **Layout, drivers and map share the space under the route list:** in that
  order, so the stack under the list is settled once.
- **Menus late:** they offer shortcuts to whatever exists by then, including
  the drivers tab's new tag, note and days.
- **Tour last:** it describes the finished app, not one that is about to
  change.

## Packs

<details>
<summary><b>1. Update note</b> — tell users what changed, and that their data is safe</summary>

- A note shown once, the next time the app is opened after an update. It says what changed, what that affects, and what happened to the data. It can be dismissed and opened again later.
- A backup named for the update is taken the first time a new version opens, so the note can point at a real copy on the Data tab.
- The note mentions keeping a save file on your own PC (Data tab → Choose save file): every change is also written to that file, including routes, templates and settings. Before the note says this, the pack checks whether the file picker works in the Windows app and not only in Edge and Chrome.
- A first-ever open shows no update note.
- Process rule from here on: every pack adds its own note entry as part of merging.

Full plan: `manifests/2026-09-28-update-note.md` (being drafted by a planning run).
</details>

<details>
<summary><b>2. Dark mode</b></summary>

- Move the 73 colours written out in `docs/style.css` and the inline label colours in `docs/app.js` (`--c:`) into colour tokens, then add a dark palette.
- Labels whose colour the user picked stay readable on a dark background.
- The printed sheet and print preview stay black on white.
- The theme choice is stored per PC in its own key. It never travels in exports or share codes.

**Settle at start:** follow the computer's light/dark setting, have a switch in the app, or both? (Recommended: both.)
</details>

<details>
<summary><b>3. Printed sheet cleanup</b> — no warnings on paper</summary>

Already decided in the review threads:
- Drop the QR code, the Data tab switch for it, `docs/qr.js`, the QR tests, and the `jsqr` dev dependency. Share codes and `#d=` share links stay, so sheets printed with a QR keep working.
- Drop "Check before posting" and "Positions not available". Warnings belong before printing.
- Drop the "!" marks and stripes on flagged rows. I proposed this in the thread and it wasn't objected to; confirm at start.
- Keep "Free cars".
- "Cars not available" lists only cars whose label has a new **Show on printout** tick, set on the Labels tab.

**Saved data:** labels gain a saved field, so this is schema v5 and needs a migration plan before any code, per the standing rule. Old saves load with the tick at its default. A build that doesn't know the tick warns before saving instead of silently dropping it (the `v > SCHEMA` path in `docs/store.js`). `qrOnSheet` stops being written; older builds read its absence as "on", which is harmless.

**Settle at start:** should existing labels start ticked (nobody's printout changes until they untick, the safe default) or unticked?
</details>

<details>
<summary><b>4. Plan for tomorrow</b></summary>

- When the app opens, a saved date earlier than tomorrow moves to tomorrow. A date already set further ahead stays where it is.
- The Day plan warns when its date isn't tomorrow, with a **Set to tomorrow** button. It warns but never blocks.
- **Saved data:** this is the one change made without asking. It is safe because only the date moves, and the start-of-day backup still holds the plan as it was.

**Settle at start:**
- Does the warehouse plan Sundays? (If not, Saturday's "tomorrow" becomes Monday.)
- Should template offers and the lit week button follow the plan's date instead of today's? (Recommended: yes.)
</details>

<details>
<summary><b>5. Day plan layout</b> — the space under the route list</summary>

- Move day templates directly under the route list, instead of below the Drivers/Cars panels.
- Add week columns under the route list: Monday to Sunday, each column listing that day's crew, with a **Load** button at the top. They use the existing crews, so no new saved data.

**Settle at start:**
- Should **Load** only set who is in, or also load that day's template?
- What order goes under the list: week, then templates? Or the other way round? (The map in pack 7 also sits there.)
- Keep the Mon–Sun button row in the Drivers panel?
- Should drivers who are away today show greyed in their column?
</details>

<details>
<summary><b>6. Drivers tab</b></summary>

- Seven day toggles on each driver's row. A toggle adds the driver to, or removes them from, that weekday's crew, and ticking a day with no crew creates one.
- Tag and Note columns, as on the Cars tab. Already decided: one tag per driver, from the one shared list, so any tag can go on anyone, and both stay until removed.
- No new saved data: drivers have had `labelId` and `note` since schema v4.

**Settle at start:**
- Should a tag like "Sick" also set the driver to Away?
- Keep the crew cards under the table, which are still useful for a crew with no weekday like "Reserves"?
</details>

<details>
<summary><b>7. Parking map</b></summary>

- A schematic of the yard (the right-hand drawing of 2026-09-28) under the route list. Spot 1–3 run along the lane from Entrance 1, spot 4 is in the side bay, spot 5 is at the top, and there is a gate through the right wall. The garage doesn't appear on the map.
- Each spot shows its routes by round, turns red when used twice in one round, and shows its status when out of use.
- Spots match positions by name. A position the map doesn't know goes in a short "not on the map" list, so renaming or adding positions never breaks the map.
- The map is drawn as plain boxes with no labels that identify the site, because the repo is public.

**Settle at start:**
- Is the gate one port or two?
- Are the hatched areas building or dock where nobody parks, and does the hatching on spots 1–3 mean something?
- Is the per-round listing on each spot what you want?
- Nothing for the garage, or a one-line count under the map?
</details>

<details>
<summary><b>8. Right-click menus</b></summary>

- One shared menu, with sensible entries for each part of the app, chosen on the owner's behalf. The owner said most of it is obvious.
- Each entry reuses an existing action, and destructive entries keep their two-click confirm and backup.
- Right-clicking inside text boxes keeps the browser's own copy/paste menu.

Full plan: `manifests/2026-09-28-context-menus.md` (being drafted by a planning run).
</details>

<details>
<summary><b>9. First-use tour</b></summary>

- A short guided walk for a new user, offered on first open and reopenable from a button.
- It points at things and never writes to the user's data.
- Its "where your data lives" step shows the save-file option.
- A smoke test checks that every step's target still exists, so later changes to the app can't silently break the tour.

Full plan: `manifests/2026-09-28-tour.md` (being drafted by a planning run).
</details>

## Not in this container

- **A driver's usual start time**: the owner said "maybe". It stays on the Considered list. Scheduling it later means a new saved field, so it gets a migration plan first.
- Anything in Breadify.

## Gates

- **Per pack:** that pack's own item gate (`scripts/check.sh`, plus the targeted smoke case when logic is touched) and pack gate (`npm test` and `npm run screens`, run with `CHROMIUM_PATH=/usr/bin/google-chrome` because the pinned Playwright Chromium isn't installed here). One review per pack. Each pack also gets a browser walkthrough before it merges.
- **Container close:**
  - The full suite.
  - A walkthrough of the whole app.
  - An **upgrade check**: a profile saved by v0.2.4 (`scripts/fixtures/dev-data.json` loaded into the old build) is opened in the new build. It must keep every route, driver, car, template and backup, and show the update note once.
  - A sweep of `git log` into `INVENTORY.md`.

## Ledger

<details>
<summary>Progress log</summary>

- 2026-09-28: container drafted from the review round on the published review copies and chat. Packs 1, 8 and 9 are being planned in detail by two planning runs. Their manifests land next to this one.
</details>
