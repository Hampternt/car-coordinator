# Container: The review round

**Status:** 💭 planned — pack order awaiting the owner's approval; nothing built
**Date:** 2026-09-28
**Branch:** none yet. Each pack cuts its own branch from `main` when it starts, after the previous pack has merged. Before pack 1: merge `dev-test-data`, which holds the dev fixture, a README line and these plans. It changes nothing under `docs/` or `src-tauri/`, so the v0.2.4 rebuild it triggers ships the same app.

## Goal

Everything raised on 2026-09-28, in review comments on the published copies
and in chat, ships as nine packs. That includes an update note, right-click
menus and a first-use tour. Each pack ships on its own. Each one is announced
in the update note the next time the app is opened. None loses a user's saved
data.

## Packs, in order

| # | Pack | Manifest | Saved data |
|---|---|---|---|
| 1 | Update note | `manifests/2026-09-28-update-note.md` (drafting) | New per-PC key; a named backup before each update |
| 2 | Printed sheet cleanup | created when it starts | **Schema v5**: a print tick on each label |
| 3 | Dark mode | created when it starts | New per-PC key |
| 4 | Plan for tomorrow | created when it starts | The date moves forward on open (not saved until you change something) |
| 5 | Day plan layout | created when it starts | None; a Load that includes a template takes the existing backup |
| 6 | Parking map | created when it starts | None, if spots match positions by name |
| 7 | Drivers tab | created when it starts | None: uses existing fields and crews |
| 8 | Right-click menus | `manifests/2026-09-28-context-menus.md` (drafting) | None |
| 9 | First-use tour | `manifests/2026-09-28-tour.md` (drafting) | New per-PC key |

**One pack at a time.** Every pack writes `docs/app.js`, and packs 1, 4 and 9
all add to `start()`. The only safe parallel work: pack 6's map logic can be
built as a separate module (`docs/map.js`, with its own smoke case) while pack
5 runs, and mounted after pack 5 merges.

**Why this order:**
- **Update note first:** every pack after it announces itself.
- **Sheet cleanup second:** the one schema bump is settled early. It also
  deletes sheet CSS and markup that dark mode would otherwise convert and then
  throw away.
- **Dark mode third:** everything built after it (week columns, map, menus,
  tour) uses the colour tokens from the start.
- **Tomorrow before layout:** if the week columns and template offers follow
  the plan's date (pack 4 settles this), the date has to be right first.
- **Layout, then map:** both sit under the route list. Pack 5 settles the whole
  stack there, including the map's slot, and pack 6 fills it.
- **Menus late:** they offer shortcuts to what exists by then, including the
  Drivers tab's tag, note and days.
- **Tour last:** it describes the finished app.

## Rules every pack follows

<details>
<summary><b>Releasing a pack</b> — version, note entry, upgrade check</summary>

- **Version cut.** Merging a pack includes cutting a version. That means five places: `package.json`, `package-lock.json` (twice), `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, as commit 87714d7 did for 0.2.4. Pack 1 adds a sixth: a version constant in `docs/` that the update note keys on. Pack 1 also adds a line to `scripts/check.sh` that fails when these places disagree. Without the cut, every merge would re-upload the v0.2.4 release in place.
- **Note entry.** Every pack adds its own entry to the update note in plain words: what changed, what it affects, and what happened to your data.
- **Upgrade check in the pack gate.** Required for packs 1, 2 and 4, and cheap for the rest. A profile saved by the previous `main` build is opened in the pack's build, and all of the following must hold:
  - The state is identical apart from the changes the pack names.
  - Every backup is still there, and the profile is seeded under the cap of 12.
  - The update backup exists.
  - The note lists every entry newer than what this PC last saw.

  This matters because Pages goes live the moment a pack merges, so a container-end check alone would catch problems too late.
</details>

<details>
<summary><b>Opening the app</b> — one startup order, one meaning of "first open"</summary>

- **Startup order**, which packs 1 and 4 both follow:
  1. Load, then recover from the save file.
  2. Take the update backup. It must not be skipped as identical to the newest backup (`docs/store.js:214`); relabel that entry instead.
  3. `dailySnapshot`.
  4. Move the date (pack 4).
  5. Template and other offers.
  6. The update note.
- **First-ever open** means no usable saved data: `carcoord:v1` is absent or unusable, and nothing was recovered from the save file. It never means "no note key". Every v0.2.4 user has usable data and no note key, and they must see the note. The tour (pack 9) uses the same test. Existing users reach the tour from its entry in the update note.
- **Per-PC keys** (`carcoord:seenNote`, `carcoord:theme`, `carcoord:tour`) are read and written directly, wrapped in try/catch. Never go through a `data-kind="meta"` control or a field on `state` (`docs/app.js:1134`). Everything on `state` travels into Export, the save file and backups.
</details>

## Packs

<details>
<summary><b>1. Update note</b> — tell users what changed, and that their data is safe</summary>

- A note shown once, the next time the app is opened after an update. It says what changed, what that affects, and what happened to the data. It can be dismissed and opened again later.
- A backup named for the update is taken the first time a new version opens, before `dailySnapshot`, so the note can point at a real copy on the Data tab. Where the cap of 12 rotates an older backup out, the note says so honestly.
- The note mentions keeping a save file on your own PC (Data tab → Choose save file). Every change is also written to that file: routes, templates, fleet, roster and labels. This PC's own choices, like the theme, are not in it. It's the copy to recover from on a new or cleared PC, not a sync between PCs. Before the note says this, the pack checks whether the file picker works in the Windows app and not only in Edge and Chrome.
- Owns the version constant and the `check.sh` version line described under the release rules above.

Full plan: `manifests/2026-09-28-update-note.md` (being drafted by a planning run).
</details>

<details>
<summary><b>2. Printed sheet cleanup</b> — no warnings on paper</summary>

Decided by the owner in the review threads:
- Drop the QR code. What goes:
  - The Data tab switch for it.
  - `docs/qr.js` and its script tag (`docs/index.html:65`).
  - The `.sheet .qr` rules (`docs/style.css:335-338`, `:360`).
  - The decode test (`scripts/smoke.mjs:559-603`).
  - The `jsqr` dev dependency.
  - The README line (`README.md:29`), updated.

  What stays: share codes and `#d=` links, so sheets already printed with a QR keep working. The phone-width layout and its test also stay; their comments get reworded to cite share links.
- Drop "Check before posting" and "Positions not available". Warnings belong before printing.
- Keep "Free cars".
- "Cars not available" lists only cars whose label has a new **Show on printout** tick, set on the Labels tab.

**Saved data (migration plan before any code):**
- Labels gain the tick, which makes this schema v5.
- Old saves load with the tick at its default. A build that doesn't know the tick warns before saving instead of silently dropping it (`docs/store.js:150`).
- An absent tick reads as the default everywhere the sheet reads it, not only in `normalise()`. New labels get the field at `docs/app.js:1616` and `:1809`, and in `docs/share.js:179`.
- `qrOnSheet` is written as a fixed `false`, so an older build that opens v5 data keeps the QR off.

**Settle at start:**
- Should existing labels start ticked (nobody's printout changes until they untick, the safe default) or unticked?
- My proposal, not yet answered: also drop the "!" marks and dotted underlines on the **printed** sheet (`docs/app.js:1065`, `docs/style.css:332`). The day plan's on-screen stripes and warning box stay either way.
- Does the tick travel in "Copy everything" share codes? It would be appended as a third element of each label row, which fits `share.js`'s append-only rule. Or it stays on this PC.
</details>

<details>
<summary><b>3. Dark mode</b></summary>

- Move the 73 colours written out in `docs/style.css`, and the inline label colours in `docs/app.js` (`--c:`, e.g. `:140`, `:381`), into colour tokens, then add a dark palette.
- Labels whose colour the user picked stay readable on a dark background.
- The printed sheet and print preview stay black on white. Pin light values for the tokens `.sheet` uses, including `--marker` for the pink rows. Add a case that prints while the page is in dark mode.

**Settle at start:** follow the computer's light/dark setting, have a switch in the app, or both? (Recommended: both.)
</details>

<details>
<summary><b>4. Plan for tomorrow</b></summary>

- When the app opens, a saved date that has passed moves to tomorrow. This happens **in memory only**, and it's saved with your next real change. That way opening the app can never overwrite data it couldn't read, or data from a newer version, before you've seen the warning about it (`docs/store.js:150`, `:180`).
- A notice says the date was moved, with a **Keep ⟨old date⟩** button. That's the real undo, and it offers rather than forces.
- The Day plan warns when its date isn't tomorrow, with a **Set to tomorrow** button. It warns but never blocks.
- Also in scope:
  - "Clear the day" (`docs/app.js:1647`) and `defaults()` (`:92`) switch to the same tomorrow helper.
  - The "today" wording in the rail and the template offer (`:635`, `:1536`).
  - `dailySnapshot` counts days by the local date instead of the UTC one (`docs/store.js:229`).
  - The smoke checks that assume the date stays put (`scripts/smoke.mjs:1033`, `:1262`, `:1395`).

**Settle at start:**
- A plan dated **today**: move it too, or only warn? (Recommended: only past dates move. A plan opened on its own day, for a morning fix or a reprint, gets the warning and the button.)
- Does the warehouse plan Sundays? (If not, Saturday's "tomorrow" becomes Monday.)
- Should template offers and the lit week button follow the plan's date? (Recommended: yes.)
- Keep the Mon–Sun button row in the Drivers panel? This is pack 5's question, but it has to be answered before this pack edits that row.
</details>

<details>
<summary><b>5. Day plan layout</b> — the space under the route list</summary>

- Day templates go directly under the route list (the owner's ask), instead of below the Drivers/Cars panels.
- Week columns go where the owner pointed on the day plan: Monday to Sunday, each column listing that day's crew, with a **Load** button at the top. They use the existing crews.
- Settle the whole stack under the list here, including a reserved slot for the map (pack 6).

**Settle at start:**
- Should **Load** only set who is in, or also load that day's template? If it loads the template, it goes through the existing ask-first and backup (`askTemplate`, `docs/app.js:1689`) and never replaces routes in one click.
- Where exactly do the week columns sit? My proposal is under the route list, after templates. The owner pointed at the plan area, not a line.
- Should drivers who are away today show greyed in their column?
</details>

<details>
<summary><b>6. Parking map</b></summary>

- A schematic of the yard (the right-hand drawing of 2026-09-28) in the slot pack 5 reserves. Spots 1–3 run along the lane from Entrance 1, spot 4 is in the side bay, spot 5 is at the top, and there is a gate through the right wall. The garage doesn't appear on the map.
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
<summary><b>7. Drivers tab</b></summary>

- Seven day toggles on each driver's row. A toggle adds the driver to, or removes them from, that weekday's crew, and ticking a day with no crew creates one. No shape change: the weekday comes from the crew's name (`docs/app.js:45`).
- Tag and Note columns, as on the Cars tab. Decided by the owner: one tag per driver, from the one shared list, so any tag can go on anyone, and both stay until removed. Drivers have had `labelId` and `note` since schema v4.

**Settle at start:**
- Should a tag like "Sick" also set the driver to Away?
- Keep the crew cards under the table, which are still useful for a crew with no weekday like "Reserves"?
- Do driver tags and notes travel in "Copy everything" share codes? Driver rows carry only name and in/away today (`docs/share.js:77`). The tag and note would be appended, which fits the append-only rule. Or they stay on this PC.
</details>

<details>
<summary><b>8. Right-click menus</b></summary>

- One shared menu, with entries chosen per part of the app. The owner left the choice to Claude: "you can decide yourself what is appropriate where … most i would guess would be obvious."
- Each entry reuses an existing action, and destructive entries keep their two-click confirm and backup.
- Right-clicking inside text boxes keeps the browser's own copy/paste menu.

Full plan: `manifests/2026-09-28-context-menus.md` (being drafted by a planning run).
</details>

<details>
<summary><b>9. First-use tour</b></summary>

- A short guided walk for a new user. It's offered on a first-ever open, using the definition above, and can be reopened from a button.
- It points at things and never writes to the user's data.
- Its "where your data lives" step shows the save-file option.
- A smoke test checks that every step's target still exists, so later changes to the app can't silently break the tour.

Full plan: `manifests/2026-09-28-tour.md` (being drafted by a planning run).
</details>

## Not in this container

- **A driver's usual start time**: the owner said "maybe". It stays on the Considered list. Scheduling it later means a new saved field, so it gets a migration plan first.
- Anything in Breadify.

## Gates

- **Per pack:**
  - Item gate: `scripts/check.sh`, plus the targeted smoke case when logic is touched.
  - Pack gate: `npm test` and `npm run screens`, run with `CHROMIUM_PATH=/usr/bin/google-chrome` because the pinned Playwright Chromium isn't installed here. Plus the upgrade check from the release rules.
  - One review and a browser walkthrough before merging.
- **Container close:** the full suite, a walkthrough of the whole app, a sweep of `git log` into `INVENTORY.md`, and an end-to-end upgrade check from v0.2.4 to the final build:
  - Build the old app with `git worktree add <dir> v0.2.4`. For the car app it matches today's `main`.
  - Serve both builds on the same fixed port in one persistent browser profile, or carry the storage across. localStorage is per origin, so a random port starts empty.
  - Seed the profile with `scripts/fixtures/dev-data.json` and at most ten backups.
  - Deep-compare the whole state. The only differences allowed are the ones the packs name: the date moved, `qrOnSheet` fixed to `false`, and labels gaining the tick at its default.
  - Every earlier backup is present, plus the update backup.
  - The note lists all nine entries.

  This check covers the web build only. The exe gets a hand check on install.

## Ledger

<details>
<summary>Progress log</summary>

- 2026-09-28: container drafted from the review round on the published review copies and chat.
- 2026-09-28: three independent checks (data claims, order and conflicts, faithfulness to the record). Applied:
  - Sheet cleanup before dark mode, and map straight after layout.
  - A version cut and a pre-merge upgrade check for each pack.
  - One startup order, and "first-ever open" defined by saved data rather than by a note key.
  - Per-PC keys kept off `state`.
  - The tomorrow move made in memory only, with a Keep button.
  - Share-code questions added for the label tick and driver tags.
  - The "!"-marks item moved from decided to proposed.
  - The exact QR removal list.

  Rejected one finding: "most i would guess would be obvious" is the owner's own chat message. It is now quoted verbatim.
- Packs 1, 8 and 9 are being planned in detail by two planning runs. Their manifests land next to this one and are reconciled with the rules above.
</details>
