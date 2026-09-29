# Container: The review round

**Status:** 🚧 pack 1 (update note and fail-safe) in progress on `update-note`, since 2026-09-29. The Reconnect fix is done and on `dev` (0.2.5).
**Date:** 2026-09-28
**Branch:** `dev` is where everything is combined (owner, 2026-09-28). Each pack cuts its branch from `dev` and comes back through a PR into `dev`, and CI runs the tests on those PRs. `main` only receives `dev`, and **only after the owner has tested the full combined update on `dev` and said go** (2026-09-29). Nothing else is a go: not a pack's approval, not a PR into `dev`, not green gates. that push is what publishes Pages and builds the Windows release. `dev` starts at 0.2.5, with the save-file fix and the dev fixture.

## Goal

Everything raised on 2026-09-28, in review comments on the published copies
and in chat, ships as nine packs. That includes an update note, right-click
menus and a first-use tour. Each pack ships on its own. Each one is announced
in the update note the next time the app is opened. None loses a user's saved
data.

## First: a data-loss fix (one item, before pack 1)

Found while planning pack 9, and checked against the code:
1. This browser opens with no usable plan (a cleared or unreadable save) while a save file is still linked.
2. After a restart the file's permission is "prompt", so the app can't read the file back (`docs/store.js:426`) and opens on empty defaults.
3. The Data tab says "Saving is paused, Reconnect".
4. **Reconnect** then writes the empty on-screen plan over the good file (`docs/store.js:359-361`).

Someone missing their data is exactly the person likely to press Reconnect, hoping to get it back.

- [x] **⚠️ The save file is never written over unread.** *(Go given 2026-09-28; 784e251, reworked in 7dc3cb2 on `reconnect-asks`.)*
  - **Marker:** every load that finds no usable plan of this browser's own sets `carcoord:pref:fileNeedsCheck`. It survives reloads and is cleared only once the file and the screen are reconciled.
  - **Reading first:** while the marker is set, the file is read before anything is written to it. An empty file, or one holding the same plan, is fine.
  - **Holds:** a different plan raises the question **Load the file** / **Write this screen to the file**. A file that can't be read, or isn't a plan, is held, offering **Try again**, **Write this screen over it** (two clicks) and **Stop using this file**.
  - **Backups:** whatever is replaced goes into Backups first, or nothing happens.
  - **Unchanged:** a browser that started from its own plan reconnects as before.

  **Risky: reviewed individually.** An independent review found the first version insufficient; see the Ledger.
  *Done when:* smoke (`scripts/smoke.mjs`, "the save file is never written over unread") covers all of these:
  - an empty browser;
  - typing after an unreadable save, **then a reload**;
  - an unreadable file, and Try again;
  - a truncated file and the two-click overwrite;
  - Backups full;
  - the same plan under other ids;
  - a write queued just before Reconnect;
  - start-up recovery, both good and not a plan;
  - a plan recovered then edited, which writes without asking because it descends from the file;
  - an unchecked file that is already writable at start-up;
  - the unchanged normal path.

  All of these pass. Run against 784e251, 13 of them fail.

## Packs, in order

| # | Pack | Manifest | Saved data |
|---|---|---|---|
| 1 | Update note and fail-safe | `manifests/2026-09-28-update-note.md` | New per-browser keys; an untouched archive of the saved text before each update |
| 2 | Printed sheet cleanup | `manifests/2026-09-29-sheet-cleanup.md` (7 items) | **Schema v5**: a print tick on each label |
| 3 | Dark mode | `manifests/2026-09-29-dark-mode.md` (10 items) | New per-PC key |
| 4 | Plan for tomorrow | `manifests/2026-09-29-plan-for-tomorrow.md` (10 items) | The date moves forward on open (not saved until you change something) |
| 5 | Day plan layout | `manifests/2026-09-29-day-plan-layout.md` (12 items) | None; a Load that includes a template takes the existing backup |
| 6 | Parking map | `manifests/2026-09-29-parking-map.md` (9 items) | None, if spots match positions by name |
| 7 | Drivers tab | `manifests/2026-09-29-drivers-tab.md` (11 items) | None: uses existing fields and crews |
| 8 | Right-click menus | `manifests/2026-09-28-context-menus.md` | None |
| 9 | First-use tour | `manifests/2026-09-28-tour.md` | New per-PC key |

**The web version comes first.** The owner primarily uses the GitHub Pages version (2026-09-28), as HANDOFF.md's first decision says. Every pack's upgrade check and walkthrough centre on the browser. Checks of the Windows app are best-effort, and nothing is held back for them.

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

Reconciled with pack 1's reworked manifest on 2026-09-28. The pre-update copy is an **archive** outside the rolling Backups, so the old question about naming or relabelling a backup no longer arises.

<details>
<summary><b>Releasing a pack</b> — version, note entry, upgrade check</summary>

- **Version cut.** Merging a pack into `dev` includes cutting a version, so every note entry has its own version. What reaches users is whichever version `dev` holds when it is merged to `main`, and the note shows them every entry they haven't seen. That means five places: `package.json`, `package-lock.json` (twice), `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, as commit 87714d7 did for 0.2.4. Pack 1 adds a sixth: a version constant in `docs/` that the update note keys on. Pack 1 also adds a line to `scripts/check.sh` that fails when these places disagree. Without the cut, every merge would re-upload the v0.2.4 release in place.
- **Note entry.** Every pack adds its own entry to the update note in plain words: what changed, what it affects, and what happened to your data.
- **Upgrade check in the pack gate.** Required for packs 1, 2 and 4, and cheap for the rest. A profile saved by the previous `dev` build is opened in the pack's build. **Before every `dev` → `main` merge, it runs again from the build live on `main`**, because that's the one users are upgrading from. All of the following must hold:
  - The state is identical apart from the changes the pack names.
  - Every backup is still there, and the profile is seeded under the cap of 12.
  - An archive holds the old build's `carcoord:v1` byte for byte.
  - The note shows the newest three entries it hasn't shown in this browser and counts the rest; What's new on the Data tab lists them all.

  This matters because Pages goes live the moment `dev` reaches `main`, and users skip every version in between.
</details>

<details>
<summary><b>Opening the app</b> — one startup order, one meaning of "first open"</summary>

- **Startup order**, which packs 1 and 4 both follow:
  1. Load. Saved text that can't be read is rescued into an archive at once.
  2. Archive the saved text, byte for byte, if this is the first open of a new version. This is the first write at boot.
  3. Recover from the save file, or check it (0.2.5), and say so if a save-file hold is up.
  4. `dailySnapshot`.
  5. Move the date (pack 4).
  6. Template and other offers.
  7. The update note, last.

  `carcoord:v1` itself is never written at boot.
- **First-ever open** means no usable saved data: `carcoord:v1` is absent or unusable, and nothing was recovered from the save file. It never means "no note key". Every v0.2.4 user has usable data and no note key, and they must see the note. A save that could not be read, or that came from a newer version, is **held**: no note and no tour until the next clean open. Pack 1 sets one `firstRun` value in `start()`, and the tour (pack 9) reads it. Existing users reach the tour from its entry in the update note.
- **Per-browser keys** go through pack 1's `Store.pref` / `Store.setPref` as `carcoord:pref:⟨name⟩`: `seenUpdate` (pack 1), `theme` (pack 3), `tour` (pack 9). Every access is wrapped in try/catch. Never go through a `data-kind="meta"` control or a field on `state` (`docs/app.js:1134`). Everything on `state` travels into Export, the save file and backups.
</details>

## Packs

<details>
<summary><b>1. Update note</b> — tell users what changed, and that their data is safe</summary>

- A note shown once, the next time the app is opened after an update. It says what changed, what that affects, and what happened to the data. It can be dismissed and opened again later.
- **Fail-safe, at the owner's ask:**
  - Before anything else at start-up, the saved text is copied byte for byte into an **Archive**, kept outside the rolling Backups. It holds the last three updates, plus a rescue copy of any save that couldn't be read.
  - The Data tab offers Restore and Download for each archive.
  - A stand-alone `recover.html` works even if the app won't start.
  - Versioned script tags stop a browser mixing old and new files after a deploy.
- The note mentions keeping a save file on your own PC (Data tab → Choose save file). Every change is also written to that file: routes, templates, fleet, roster and labels. This PC's own choices, like the theme, are not in it. It's the copy to recover from on a new or cleared PC, not a sync between PCs. Before the note says this, the pack checks whether the file picker works in the Windows app and not only in Edge and Chrome.
- Owns the version constant and the `check.sh` version line described under the release rules above.

**Decided:** past notes live in a What's new card on the Data tab, above Archives and Backups. The exe's save-file check is still to do, so the note's save-file sentence stays hidden in the Windows app until the owner confirms it.

Full plan: `manifests/2026-09-28-update-note.md` (12 items, reworked 2026-09-28 against `dev`).
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
- Drop "Check before posting" and "Positions not available", and the "!" marks and dotted underlines. Warnings belong before printing.
- Keep "Free cars".
- "Cars not available" lists only cars whose label has a new **Show on printout** tick, set on the Labels tab.

**Saved data (migration plan before any code):**
- Labels gain the tick, which makes this schema v5.
- Old saves load with the tick at its default. A build that doesn't know the tick warns before saving instead of silently dropping it (`docs/store.js:150`).
- An absent tick reads as the default everywhere the sheet reads it, not only in `normalise()`. New labels get the field at `docs/app.js:1616` and `:1809`, and in `docs/share.js:179`.
- `qrOnSheet` is written as a fixed `false`, so an older build that opens v5 data keeps the QR off.

**Decided:**
- Existing labels start **unticked**, so "Cars not available" is empty until you tick the labels you want printed. The printout changes on update, so pack 2's note entry must say exactly that and where the tick is.
- The "!" marks and dotted underlines go from the printed sheet. The screen keeps its warnings and stripes.
- The tick stays on this PC: it is not sent in share codes. (It still travels in Export files and the save file, like every label setting.)
</details>

<details>
<summary><b>3. Dark mode</b></summary>

- Move the 73 colours written out in `docs/style.css`, and the inline label colours in `docs/app.js` (`--c:`, e.g. `:140`, `:381`), into colour tokens, then add a dark palette.
- Labels whose colour the user picked stay readable on a dark background.
- The printed sheet and print preview stay black on white. Pin light values for the tokens `.sheet` uses, including `--marker` for the pink rows. Add a case that prints while the page is in dark mode.

**Decided:** both. It follows the computer's light/dark setting, and a switch in the app overrides it.
</details>

<details>
<summary><b>4. Plan for tomorrow</b></summary>

- "Tomorrow" means the next working day. The warehouse works Monday to Friday, so Friday, Saturday and Sunday all plan for Monday.
- When the app opens, a saved date that has passed moves to the next working day. This happens **in memory only**, and it's saved with your next real change. That way opening the app can never overwrite data it couldn't read, or data from a newer version, before you've seen the warning about it (`docs/store.js:150`, `:180`).
- A notice says the date was moved, with a **Keep ⟨old date⟩** button. That's the real undo, and it offers rather than forces.
- The Day plan warns when its date isn't tomorrow, with a **Set to tomorrow** button. It warns but never blocks.
- Also in scope:
  - "Clear the day" (`docs/app.js:1647`) and `defaults()` (`:92`) switch to the same tomorrow helper.
  - The "today" wording in the rail and the template offer (`:635`, `:1536`).
  - `dailySnapshot` counts days by the local date instead of the UTC one (`docs/store.js:229`).
  - The smoke checks that assume the date stays put (`scripts/smoke.mjs:1033`, `:1262`, `:1395`).

**Decided:**
- Only past dates move. A plan dated today, opened for a morning fix or a reprint, gets the warning and the Set to tomorrow button.
- No Saturday or Sunday planning: the next working day skips the weekend.
- Template offers and the lit day follow the plan's date.
- The Mon–Sun button row in the Drivers panel is removed in pack 5, so this pack doesn't rework it.
</details>

<details>
<summary><b>5. Day plan layout</b> — the space under the route list</summary>

- Day templates go directly under the route list (the owner's ask), instead of below the Drivers/Cars panels.
- Week columns under the route list, after templates: **Monday to Friday**, each column listing that day's crew, with a **Load** button at the top that sets who is in. They use the existing crews.
- The Mon–Sun button row in the Drivers panel goes, because the columns do the same job.
- Settle the whole stack under the list here, including a reserved slot for the map (pack 6).

**Decided:** Load only sets who is in (templates stay separate); the columns go under the list after templates; drivers who are away today show greyed in their usual column; Monday to Friday only.
</details>

<details>
<summary><b>6. Parking map</b></summary>

- A schematic of the yard (the right-hand drawing of 2026-09-28) in the slot pack 5 reserves. Spots 1–3 run along the lane from Entrance 1, spot 4 is in the side bay, spot 5 is at the top, and there is a gate through the right wall. The garage doesn't appear on the map.
- Each spot shows its routes by round, turns red when used twice in one round, and shows its status when out of use.
- Spots match positions by name. A position the map doesn't know goes in a short "not on the map" list, so renaming or adding positions never breaks the map.
- The map is drawn as plain boxes with no labels that identify the site, because the repo is public.

**Decided:** the gate is one port; the hatched areas are building or dock where nobody parks, and spots 1–3 are ordinary spots beside it; each spot lists its routes by round; nothing for the garage.
</details>

<details>
<summary><b>7. Drivers tab</b></summary>

- Seven day toggles on each driver's row. A toggle adds the driver to, or removes them from, that weekday's crew, and ticking a day with no crew creates one. No shape change: the weekday comes from the crew's name (`docs/app.js:45`).
- Tag and Note columns, as on the Cars tab. Decided by the owner: one tag per driver, from the one shared list, so any tag can go on anyone, and both stay until removed. Drivers have had `labelId` and `note` since schema v4.

**Decided:** a tag is only a label and never sets Away; the crew cards stay; driver tags and notes stay on this PC and are not sent in share codes.
</details>

<details>
<summary><b>8. Right-click menus</b></summary>

- One shared menu, with entries chosen per part of the app. The owner left the choice to Claude: "you can decide yourself what is appropriate where … most i would guess would be obvious."
- Each entry reuses an existing action, and destructive entries keep their two-click confirm and backup.
- Right-clicking inside text boxes keeps the browser's own copy/paste menu.

**Decided:** routes that aren't running are blanked, not deleted, so the menu keeps "Clear driver, car, position and round" (item 5).

Full plan: `manifests/2026-09-28-context-menus.md` (14 items).
</details>

<details>
<summary><b>9. First-use tour</b></summary>

- A short guided walk for a new user. It's offered on a first-ever open, using the definition above, and can be reopened from a button.
- It points at things and never writes to the user's data.
- Its "where your data lives" step shows the save-file option.
- A smoke test checks that every step's target still exists, so later changes to the app can't silently break the tour.

**Decided:** the Tour button goes in the top bar, right of Print, so item 5 runs (the tabs move to their own row below about 1245px, which also fixes the sideways scroll at the exe's minimum width); newer parts get a sentence in the nearest step, not steps of their own.

Full plan: `manifests/2026-09-28-tour.md` (8 items).
</details>

## Found while planning, not yet scheduled

- **The top bar overflows at the Windows app's smallest window.** The page scrolls sideways 30px at 900 wide, and tab names wrap below about 1145. Pack 9's item 5 fixes this if the Tour button goes in the top bar; pack 3 fixes it if its theme switch does. Otherwise it needs an item of its own.
- **A push to `main` without a version bump replaces the current release's downloads** (`overwrite_files: true` in the build workflow). It has already happened once to v0.2.4. Pack 1's version guard makes a bump part of every merge; the workflow could also refuse to overwrite an existing tag.
- **Typing during a slow start-up is dropped.** While the file is read at start-up, the plan on screen is a placeholder, and keystrokes typed into it are lost. Saved data isn't affected. This predates 0.2.5.
- **Another PC writing the same save file isn't noticed.** Two managers linking one OneDrive file will overwrite each other's changes, as they always have. The new check reads the file only after a loss, not before every write. Noting what this browser last wrote to the file, and checking that before each write, would close the gap.
- **Choose save file… writes the on-screen plan over whichever file is picked** (`docs/store.js:338-339`). The browser's own "replace?" prompt is the only guard. Pack 9's step 8 steers users to Open an existing file… instead, but the code stays as it is.

- **Found while planning pack 8** (each worth an item of its own; details in that manifest's Out of scope):
  - Dragging a name onto a route probably fails in the Windows app. `dragDropEnabled` is left at its default in `src-tauri/tauri.conf.json`, and Tauri says it must be off for HTML drag and drop on Windows. Unverified on Windows; the fix is one line.
  - Restore picks its backup by list position (`docs/app.js:1390`). A backup taken between the two clicks would restore the neighbouring entry.
  - Deleting a label clears it from cars and positions but not from drivers, so the next load shows a repair notice.
  - "Use for today" on an empty day group sends everyone away.
  - Saving a template under an existing name overwrites the first match, and imported templates can share a name.

## Questions for you

All answered by the owner on 2026-09-28, and folded into each pack above. Still open: the hand check of **Choose save file…** in the Windows app (pack 1).

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
  - Every earlier backup is present, and an archive holds the v0.2.4 text byte for byte.
  - What's new lists all nine entries, and the note shows the newest three and counts the rest.

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
- Packs 1 and 9 planned in detail (d582585). Both follow this container's rules; pack 1 refines them, as noted under the rules. Pack 9's planning found the Reconnect data-loss path, now the first item. Pack 8 planned too (14 items); it found five more pre-existing issues, listed above. All open questions collected under Questions for you.
- 2026-09-28: the owner approved the pack order and answered every question; the answers are in each pack under **Decided**. The one that changes shipped behaviour most: labels start unticked, so "Cars not available" empties on update until labels are ticked, and pack 2's note must say so. Go given for the Reconnect fix.
- 2026-09-28: Reconnect fix, first version 784e251. The walkthrough and 12 smoke checks were green, and I reported it as working. **That was wrong.**
  - An independent review (three lenses, each finding put to a refuter) confirmed two blockers and three majors, with repros.
  - **Blockers:** the guard keyed on `localUsable`, which is decided afresh on every load, so typing after an unreadable save and then reloading got past it.
  - **Majors:** an unreadable file, or one that isn't a plan, was treated as empty and written over. A failed backup didn't stop the choice. Start-up recovery had the same hole.
  - **Minors:** a queued write could race the read; the newer-version handling and the success note were wrong.
  - Reworked in 7dc3cb2 with a persistent marker, a single hold on writes and a three-way read. The smoke cases were rewritten one per finding.
  - **Proof the tests catch it:** the new cases were run against 784e251 in a scratch worktree, and 13 fail there. All pass on 7dc3cb2.
  - Behaviour change, deliberate: a plan recovered from the file and then edited now reconnects without asking, because it descends from the file.
  - Item gate: `scripts/check.sh` OK. The car suite (`CHROMIUM_PATH=/usr/bin/google-chrome node scripts/smoke.mjs`) passes: "all checks passed".
- 2026-09-28: **Upgrade check, v0.2.4 → 0.2.5, web first.** A workflow of three checks (a real browser upgrade, the exe's data location, and a code audit, each finding put to a refuter) ran against 63d534a. The scenarios:
  - a full setup;
  - an unreadable save;
  - a first run;
  - restoring an old backup;
  - export and import;
  - share codes both ways;
  - a linked save file;
  - mixed cached files.

  No saved data was lost, changed or hidden. The confirmed gaps are all fixed in 7d1893b, with smoke cases:
  - a write during a slow file read;
  - an empty plan when cached files mix;
  - a start-up hold that was silent;
  - tab clicks overwriting an unreadable save;
  - Choose save file replacing the old file unread.

  The browser upgrade was then re-run against the final build, 7d1893b. Every saved key was byte-identical on open, including templates, drivers, crews, cars, positions, labels, backups and Breadify's settings. The mixed-cache case now draws the plan with no errors, and there were no console errors.
  - Windows exe: the identifier and the way the app loads its pages are unchanged, so its data stays. The one trap is the old uninstaller's unticked "Delete the application data" box; the README now warns about it. Nothing was run on Windows.
  - Full suite: `npm test` passed, "all checks passed" for the car app and "all passed" for Breadify.
</details>
