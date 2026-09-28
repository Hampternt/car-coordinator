# Pack: Update note — say what changed, and where the copy is

**Status:** 💭 planned — item list awaiting the owner's approval; nothing built
**Date:** 2026-09-28
**Branch:** to be cut when execution starts: `update-note`, from `main`. First, `dev-test-data` has to be merged into `main` (the container's Branch line). `dev-test-data` holds the dev fixture, the INVENTORY notes and these plans, and it is not merged yet.

## Goal

The first time a leader opens Car Coordinator after an update, one note sits above the day plan. It says:
- what changed
- what that affects
- what happened to their saved plan
- which entry on the Data tab's Backups list holds their plan as it was saved before the update

The note appears once in each browser the app is used in, and once in the Windows app. It never appears on a first-ever open. It never appears next to a warning that the saved data could not be read; it waits for the next clean open instead.

✕ puts it away. Every note stays readable on the Data tab under **What's new**. The saved plan's shape does not change.

From this pack on, every pack ends by adding its own entry and cutting its own version.

## Agent brief

There is no `CLAUDE.md` at the repo root. Conventions come from `HANDOFF.md`, the code and the parent container. Run one pack at a time with one agent, items in order. Items 4–9 all write `docs/app.js` (container :29).

Read first, in order:
- **This manifest.** Then the container `manifests/2026-09-28-review-round.md`:
  - Rules every pack follows → **Releasing a pack**
  - Rules every pack follows → **Opening the app** (startup order, "first-ever open", per-browser keys)
  - Packs → **1. Update note**

  The container's rules were reconciled with this manifest on 2026-09-28. Question 1 below is still open; if the owner picks relabelling, update the container's startup step 2 to match.
- **`docs/store.js`:**
  - `readLocal` (:174-186) and the two load warnings it can queue: newer version (:153) and unreadable (:181)
  - `snapshot` (:210-226): identical-skip (:214), cap of 12 (:8, :216), full-storage trim (:222-225)
  - `dailySnapshot` (:228-232)
  - `hasUsableLocalData` staying false after a file recovery (:439)
  - the exports (:444-450)
  - Nothing in `docs/app.js` touches localStorage directly (a grep finds none), so every new key goes through Store.
- **`docs/app.js`:**
  - `start()` (:2272-2297)
  - `note()` (:1418-1426), `dropOffers` (:1430), `renderNotices` (:1033-1051)
  - `render()` draining store notices (:1098)
  - `renderData` and its Backups card (:974-1031): hint :1026, "Taken before" column :1028, contents parse :991
  - `when()` (:944), `fileStatus()` (:952-972), `esc` (:6)
- **`docs/index.html`:** the CSP allows same-origin script only (:14). Script tags are at :63-66.
- **`scripts/smoke.mjs`:**
  - console errors fail the run (:42)
  - first-run check (:50)
  - byte-identical-save pattern (:450-453)
  - full-storage page (:1862-1880)
  - Backups rows read as `.card:last-child` (:1894-1898)
- **`scripts/serve.mjs`:** `startServer(port)` (:24), which sends no cache headers (:33).

Reuse, don't rebuild:
- `Store.snapshot` for the update backup
- `note()` and `renderNotices` for the note
- `when()` for times, `esc()` for every string
- the Data tab's card pattern for What's new

Dependency edges:
- **Before this pack:** `dev-test-data` is merged into `main`.
- **Owner, on a Windows PC:** confirm that Data → **Choose save file…** works in the exe (question 3). Until then, the note's save-file sentence is hidden in the exe.
- **Pack 2 (sheet cleanup, schema v5):** the update backup is the raw saved v4 text, so restoring it goes through `migrate` (store.js:238) like any old import. Pack 2's entry must say what an older copy of the app does with v5 data.
- **Pack 3 (dark mode):**
  - Stores the theme with `Store.pref('theme')`.
  - Moves `.notice.update`'s ink and hi-vis onto its tokens.
- **Pack 4 (plan for tomorrow):**
  - It also writes `start()`. Its date move goes after the update backup and `dailySnapshot` (container step 4).
  - Its Keep notice is raised before the update note.
  - Its switch of `dailySnapshot` to the local date (container, pack 4) must keep this pack's rule that today's `Updating to …` entry counts as the day's start.
- **Pack 8 (right-click menus):** shares nothing with this pack, because the note is a notice, not a floating layer or dialog. Its manifest still needs its own **Announce and cut** item.
- **Pack 9 (tour):**
  - Reads the single `firstRun` boolean this pack sets in `start()`. It never treats "marker absent" as a first run, because the first-run rule writes the marker.
  - A first-run open that arrives by a `#d=` link counts as `firstRun`. Whether the tour offers itself over the share dialog is pack 9's call.
  - Update entries never carry a button, so pack 9's entry names where the tour's button is.
  - Its done-flag uses `Store.pref('tour')`.
- **Packs 2–9:** each one ends with an **Announce ⟨pack⟩ and cut ⟨version⟩** item.

## Decisions taken

| Decision | Choice |
|---|---|
| How the note is shown | A notice of a new kind, `update`, in `#notices`. It has no offer button, only ✕. It is not a `<dialog>`, which would stack on the share dialog a `#d=` link opens at boot (app.js:2291-2296). `#notices` is already hidden in print (style.css:346). With no offer, `dropOffers` (app.js:1430) cannot sweep it away, and the existing `.notice.info` and `.notice.warn` assertions are untouched. |
| Where the notes live | `docs/updates.js` holds `const UPDATES = [...]`, newest first. It contains only data, with the wording rules in its header comment. It loads between store.js and share.js (index.html:63-64). The CSP allows only same-origin script (index.html:14), and Pages and the exe serve the same `docs/` (tauri.conf.json:7). |
| The running version | One line in `docs/app.js`: `const APP_VERSION = '0.3.0';`. This is the sixth version place the container asks for (Releasing a pack). The note's logic keys on it, and the text is shown only when `UPDATES[0].version` equals it. A new app.js paired with a stale cached updates.js therefore still takes the backup (mixed-cache critique). |
| Release cadence | Each pack takes the next minor version: 0.3.0, 0.4.0 … and pack 8 is 0.10.0 if no fixes land in between. A user-visible fix between packs takes the next patch version and gets its own entry. Tests-only, docs-only and `docs/breadify/` changes get neither. Entries are never removed or renumbered; a revert gets a new, higher entry. The plan's owner question about batching releases was dropped, because the container already settles release-per-pack (Releasing a pack). |
| Per-browser marker | `carcoord:pref:seenUpdate` holds the newest version already shown, read and written through new `Store.pref` and `Store.setPref`. Export and share codes carry `state` only (store.js:387-396), and `normalise` whitelists fields (store.js:141), so the marker never travels. The `carcoord:` prefix keeps it apart from Breadify's key on the same origin (docs/breadify/app.js:16). This replaces the container's `carcoord:seenNote`, which was to be read directly; the container's Opening the app rule now says the same. |
| When a note counts as seen | When it is shown, not when it is dismissed. The marker is written at boot, before the backup. Tying it to ✕ would show the note on every open to a leader who never presses ✕. |
| Who is held back | **First-ever open:** the marker is written silently, nothing is shown and no backup is taken. **Held:** nothing is shown or written, and the note comes on the next clean open. A load is held when it could not be read, was saved by a newer version, or arrives by a `#d=` link. The first two are detected by a flag set in `readLocal` (`Store.loadTrouble()`), not by notice kinds. `render` is Store's `onChange` (app.js:2274), and `askPersist` fires it during `init` (store.js:383, :412), so the warnings are already drained (app.js:1098) before app.js:2281 runs. That was the blocker. Holding `#d=` loads spares phones that have saved once, since a tab click saves (app.js:1589→1813). The container's Opening the app rule says the same. |
| What the update backup holds | The raw `carcoord:v1` text as this build read it, not the normalised state (data-safety critique). The ux critique offered neutral wording instead; the raw copy was chosen because later packs change what `normalise` returns. Opening never saves (app.js:2272-2297), so the text is still the pre-update copy, and `restore` migrates it back (store.js:238). If the plan came from the save file, or the text lacks `routes`/`cars` lists (which app.js:991 would show as unreadable), the loaded state is stored instead and the note words it differently. |
| One backup per version | If Backups already holds an entry labelled `Updating to ⟨v⟩`, the note names that entry and no new copy is taken. A failed marker or a stale notes file therefore cannot pile up copies or trim older ones. |
| Identical newest backup | The critiques split. Data-safety said keep naming the existing entry and ask the owner; ux said pick one approach and write it into both documents. Chosen: keep the skip (store.js:214) and name the entry that holds the same plan, under its own label. The container's first draft said to relabel it; that is not followed, because relabelling today's `Start of day` defeats `dailySnapshot`'s label test (store.js:230) and rewrites what an entry says it was taken before. The container now says the same, pending the owner's question 1. |
| Backups pushed out | `snapshot` reports which entries it dropped (cap at store.js:216, trim at :222-224), and the note names them (container, pack 1). |
| Order at boot | The container's order is kept. The marker and then the backup come at step 2, before `dailySnapshot`. The note is raised at step 6, after the offers (app.js:2287-2288), so the spot-round offer `renderNotices` scrolls to (app.js:1050) is not pushed down by a tall note. |
| When no copy was taken | The critiques split: drop the note's sentence, or point at the store's warning. Chosen: when `snapshot` returns null, the store's own warning (store.js:225) is drained before the note is raised, so it sits above the note, and the note says only that the warning above explains why. When the marker cannot be written, no backup is attempted at all (so nothing is trimmed), and the note says storage is full and points at Export. |
| Several missed updates | The note shows the newest three entries in full and counts the rest. A browser with saved data but no marker counts every entry as unseen. The container says the same. |
| Where notes can be read again | A **What's new** card on the Data tab, directly above Backups. The newest three are shown in full; older ones get one line each, including their data line. The ux critique offered trimming or moving it below Backups; trimming was chosen, because below Backups it would become the `.card:last-child` that smoke.mjs:1894 reads. The card holds no `<table>` (smoke.mjs:964 and :1040 read the Data tab's first table). The owner may prefer a top-bar button (question 2). |
| Save-file sentence | One sentence, in three variants depending on the file's state (Design E). All are hidden in the exe (`window.__TAURI__`, withGlobalTauri at tauri.conf.json:10) until the owner confirms the picker works there. The sentence never implies automatic recovery, which needs a file handle already stored in this browser (store.js:414-418). The fuller description the container asks for (pack 1) stays on the Data tab's file card (app.js:958-959). The container says the same. |
| Entry wording | Each field is at most about 25 words. The opening sentence is only "Car Coordinator has been updated to ⟨v⟩." The note says "this browser", never "this PC", because the marker is kept per browser profile. No entry names a backup entry; the note's own sentence names the real one. The critiques split over the draft's "a copy goes into Backups" line (drop it, or reword it). Chosen: a reworded, true version moves into the 0.3.0 `data` field. |
| Version guard | `scripts/versions.mjs` runs first in `npm test` and inside `scripts/check.sh`. It compares versions number by number, so 0.10.0 sorts above 0.9.0. It also pins the exe identifier `no.m.carcoordinator` (tauri.conf.json:5) and refuses any webview scheme setting; either change would likely open the Windows app on empty storage. Nothing checks the versions agree today: check.sh only runs `node --check` (:37-57), and build.yml has no Pages step, so the item gate is where a mismatch is caught. |
| Boot safety | The whole update path in `start()` is wrapped in try/catch and logs with `console.warn`, because smoke fails on console errors (smoke.mjs:42). Any failure falls through to `render()`, so a stale cached store.js can never leave a blank page. |
| Saved-plan shape | Unchanged. `SCHEMA` stays 4 (store.js:9). Nothing new goes into `carcoord:v1`, and backup entries stay `{t,label,json}` (store.js:212). |

## Design

### A. Files and keys

**New files:**
- `docs/updates.js` — the notes
- `scripts/versions.mjs` — the version guard
- `scripts/upgrade.mjs` — the upgrade check

**Changed:**
- `docs/store.js`
- `docs/app.js`
- `docs/index.html` (one script tag)
- `docs/style.css`
- `scripts/check.sh`
- `package.json` (`test` runs versions.mjs first; a new `upgrade` script)
- `scripts/smoke.mjs`, `scripts/screens.mjs`
- `README.md`
- the container manifest
- the five version lines

**Keys and labels:**
- Per-browser keys use `carcoord:pref:⟨name⟩`. This pack writes `seenUpdate`; `theme` and `tour` are reserved for packs 3 and 9.
- The backup label is `Updating to ⟨v⟩`.

**Entry shape:** `{ version, date, title, changed, affects, data }`, all plain strings, rendered through `esc()`.

### B. Store additions

- **`pref(name)`** returns a string or null. **`setPref(name, value)`** returns true or false. Every access sits in try/catch, as at store.js:177 and :188-196.
- **`loadTrouble()`** is true when `readLocal` queued the unreadable warning (:180-181), or when the data it read had `schemaVersion > SCHEMA` (:150). It is set only on that path, because `parseImport` (:404) and `restore` (:238) also call `migrate`. Blocked storage makes `getItem` throw inside :177, which sets `unreadable`, so the load is held (not treated as a first run, as the plan had it).
- **`savedText()`** returns the raw `carcoord:v1` string `readLocal` read, but only when the load was usable and the text parses to an object with `routes` and `cars` arrays. Otherwise it returns null.
- **`snapshot(state, label, json = JSON.stringify(state))`** returns:
  - after a new write: `{ entry, dropped: [{t,label}…] }`, where `dropped` lists whatever the cap or the trim removed
  - on an identical skip: `{ entry: list[0], dropped: [] }`
  - when nothing fits: `null`. The :225 warning is still queued, and the stored list is left alone.

  Every existing caller ignores the return value: app.js:811, 1351, 1394, 1558, 1627, 1645, 1689, 1795; store.js:231.
- **`dailySnapshot`**: an entry from today labelled `Start of day`, or starting `Updating to `, counts as the day's start. Without this, an update day ends up with a mid-day "Start of day".

### C. The decision, a pure function next to `note()` (app.js:1418)

`updateNoteFor({ version, releases, seen, hadData, hold })` returns `{ show: entries[], mark: bool, backup: bool }`. The rules apply in this order:

1. `seen === version` → nothing.
2. `hold` → nothing, and the marker is left alone.
3. `!hadData` → mark only (first run).
4. `seen` is numerically newer than `version` → nothing, and the marker is left alone. This covers a downgrade or a stale cached app.js.
5. `releases` is not an array, or `releases[0].version !== version` → backup only; no mark, no note. It is retried next open and reuses the same backup.
6. `seen` is null or not in `releases` → backup, mark, and show every entry.
7. `seen` is found at index `i` → backup, mark, and show `releases.slice(0, i)`.

Inputs, computed in `start()`:
- `let recovered = false` is hoisted above the `if` at app.js:2277 and set inside it at :2279. Reading the block-scoped `const fromFile` outside its block would throw and blank the page.
- `hadData = Store.hasUsableLocalData() || recovered`
- `hold = Store.loadTrouble() || /^#d=/.test(location.hash)`, read before `Share.readHash` clears the hash (share.js:262).
- `firstRun = !hadData && !Store.loadTrouble()` goes in a module-level `let` for pack 9.

### D. Boot order in `start()`

1. Load, then recover from the file. This is unchanged apart from the hoist.
2. Run `updateNoteFor`.
   - If `mark`, call `setPref('seenUpdate', APP_VERSION)`.
   - If `backup`, and either no mark was needed or the mark was stored: reuse an existing `Updating to ⟨v⟩` entry if there is one; otherwise call `Store.snapshot(state, label, recovered ? undefined : Store.savedText() ?? undefined)`.
3. Drain the store notices. This is the line moved from app.js:2281, so a null snapshot's warning lands above the note.
4. `Store.dailySnapshot(state)`.
5. *(Pack 4's date move, and its Keep notice.)*
6. `offerSpotRoundSplit()`, `offerTodaysTemplate()`.
7. If there are entries to show, `note('update', text, null, lines)`.
8. `render()`; the share-link block is unchanged.

Steps 2–7 run without an `await`. Steps 2 and 7 sit in the try/catch. The only writes at boot are the marker and the backup list; `carcoord:v1` is never written.

### E. What the note says

The `text` is these sentences, in order:
1. `Car Coordinator has been updated to ⟨v⟩.`
2. The backup sentence, one of:
   - **new or reused entry:** `Your plan as it was saved before this update was put in Backups on the Data tab as "⟨label⟩" (⟨when(t)⟩), where the newest 12 are kept.`
   - **the copy came from the loaded state:** `Your plan as this version first opened it was put in Backups on the Data tab as "⟨label⟩" (⟨time⟩), where the newest 12 are kept.`
   - **identical skip:** `Your plan as it was saved before this update was already in Backups on the Data tab as "⟨label⟩" (⟨time⟩), where the newest 12 are kept.`
   - **snapshot returned null:** `No copy could be put in Backups this time; the warning above says why.`
   - **marker could not be stored:** `No copy was put in Backups this time, because this browser's storage is full. Use Export on the Data tab to keep one.`
3. If anything was dropped:
   - one entry: `To make room, the oldest backup, "⟨label⟩" (⟨time⟩), was removed.`
   - several: `To make room, the ⟨N⟩ oldest backups, from ⟨time⟩ to ⟨time⟩, were removed.`
4. The save-file sentence, in the browser only:
   - **no file linked:** `To keep a copy of every change in a file of your own, use Choose save file… on the Data tab; on a new PC, Open an existing file… there brings it back.`
   - **linked and allowed:** `Changes are also written to your save file, ⟨name⟩; the Data tab says if that stops.`
   - **linked but paused:** `Saving to ⟨name⟩ is paused; reconnect it on the Data tab.`
   - **no file support, or the exe:** nothing.
5. `✕ puts this away; What's new on the Data tab keeps every note.`

The `lines` hold three items per shown entry:
- `{head: "What's new in ⟨v⟩:", text: "⟨title⟩. ⟨changed⟩"}`
- `{head: "What it affects:", text: affects}`
- `{head: "Your data:", text: data}`

After three entries comes a plain line: `And ⟨N⟩ earlier updates, all listed on the Data tab under What's new.`

`renderNotices` (app.js:1038-1042) accepts a line that is either a string or `{head, text}`, drawn as `<li><b>${esc(head)}</b> ${esc(text)}</li>`.

CSS goes next to style.css:101-102: `.notice.update { border-left-color: var(--ink); box-shadow: inset 6px 0 var(--hivis); padding-left: 20px; }`, plus spacing for its `li`. The ink and hi-vis pair echoes the top bar (style.css:29-30); hi-vis on `--panel` alone is roughly 1.3:1.

### F. What's new card (renderData)

- **Placement:** between "Your own copy" (app.js:1016-1022) and Backups (:1024).
- **Hint:** `You are running version ⟨APP_VERSION⟩. Newest first; each one says what it did to your saved plan.`
- **Newest three:** a heading line `⟨v⟩ · ⟨title⟩`, then three paragraphs labelled What changed / What it affects / Your data.
- **Older entries:** one paragraph each: `⟨v⟩ · ⟨title⟩. Your data: ⟨data⟩`.
- **Constraints:** no `<table>`, no `<details>` (render rebuilds the tab on every click, app.js:1102), and no backup claim.
- **Without `UPDATES`:** only the version line.
- **Backups hint (app.js:1026)** gains `and when the app has been updated`.

### G. Wording rules (the header of `docs/updates.js`)

- Write for a warehouse team leader.
- Name what is on screen: tab names and button labels exactly as the app shows them.
- Never use code words: storage, key, schema, JSON, migration, normalise, cache, localStorage.
- **`title`:** a few words naming the change.
- **`changed`:** what you will see or do differently.
- **`affects`:** which tabs are affected. Always say whether the printed sheet or share codes change. If an updated and a not-yet-updated PC behave differently, say so and say what to do.
- **`data`:** always present and exact. Either `Nothing in your saved plan changes.` or exactly what changes, and what an older copy of the app (the other PC, the Windows app) does with it. Never "might". Never promise more than the pack guarantees.
- Never name a backup entry; the note's own sentence names the real one.
- Backups live beside the plan in the same browser. Never imply they survive clearing browser data, a different browser or a reinstall.
- No comfort words ("don't worry", "safe") without the fact behind them.
- About 25 words per field at most. Say "this browser", never "this PC".
- **Draft 0.3.0 entry:**
  - **title:** `A note like this after each update`
  - **changed:** `After each update, a note like this appears once, the next time you open the app, saying what changed and what it did to your plan.`
  - **affects:** `This note, and a What's new list on the Data tab that keeps every note. The day plan, printed sheet and share codes are unchanged.`
  - **data:** `Nothing in your saved plan changes. Before the note, the app tries to copy your plan into Backups, and the note names that copy. Which note you have seen is not part of your plan.`

### H. Process rule

This rule is written identically in the updates.js header, README.md:40 and the container's Gates.

- Every pack that changes what a leader sees, or what happens to their saved data, ends with one item: **Announce ⟨pack⟩ and cut ⟨version⟩**. In one commit, that item:
  - adds an entry at the top of `docs/updates.js`
  - moves six places to the same version: package.json:3, package-lock.json:3 and :9, src-tauri/Cargo.toml:3, src-tauri/tauri.conf.json:4, and the `APP_VERSION` line
- Numbering follows the release-cadence decision above.
- `versions.mjs` enforces the numbering and fails the item gate.
- The pack's browser walkthrough re-reads its entry against what shipped.
- The merge to `main` publishes Pages and builds release `v⟨version⟩` (build.yml:54-60), instead of rebuilding the current release in place.

### I. Sample: pack 8's entry as the team leader would see it

This is illustrative: pack 8's menu contents are not settled yet. It assumes a returning leader who last saw 0.9.0, a full Backups list, a linked save file, and no fix releases in between.

> Car Coordinator has been updated to 0.10.0. Your plan as it was saved before this update was put in Backups on the Data tab as "Updating to 0.10.0" (07:02), where the newest 12 are kept. To make room, the oldest backup, "Start of day" (14/10, 06:55), was removed. Changes are also written to your save file, car-coordinator.json; the Data tab says if that stops. ✕ puts this away; What's new on the Data tab keeps every note.
> - **What's new in 0.10.0:** Right-click menus. Right-click a route, driver, car or position for a short menu of what you can do with it. Text boxes keep Copy and Paste.
> - **What it affects:** The Day plan, Drivers, Cars and Positions tabs. Every button you use today is still where it was. The printed sheet and share codes are unchanged.
> - **Your data:** Nothing in your saved plan changes. Delete in a menu still needs a second click, and still takes a backup first, like the Delete button.

<details>
<summary><b>J. Who sees what</b>, checked against the code</summary>

| Open | Result |
|---|---|
| First-ever open (no `carcoord:v1`, store.js:26) | Marker written, nothing shown, no backup. smoke.mjs:50 still passes. |
| Fresh phone scanning the QR (`#d=`) | Held: nothing is written or shown. The share dialog opens as today. |
| Returning phone, `#d=` | Held. |
| Returning 0.2.4 leader | Backup of the raw text, marker written, note shown last in the notices. |
| Corrupt save, blocked storage, or data from a newer version | Held. The note comes on the first clean open after the leader's first change rewrites the save. |
| Recovered from the linked file | `hadData` is true. The backup holds the loaded state, and the note uses the "as this version first opened it" wording. |
| Second tab | The marker is current, so nothing. |
| New app.js, stale cached updates.js | Backup only. The next open with the fresh file shows the note, naming the same backup. |
| Old cached app.js, newer marker | Rule 4: nothing. |

</details>

<details>
<summary><b>K. Existing tests</b>: why they keep passing</summary>

- **Every browser context's first load is a genuine first run**, so the marker is current before any seeding: smoke.mjs:45, 613, 709, 718, 800, 1817, 1868, 1992. smoke.mjs:669 is a `#d=` first load: it is held, and that context is never reloaded.
- **Every `localStorage.clear()` is followed by a reload before seeding:** smoke.mjs:337, 753, 1153, 1728, 1754, 1775, 1804, 1884; screens.mjs:32.
- **smoke.mjs:1884-1898 still counts 3 rows**, because a first run takes no update backup.
- **The warn and info assertions are untouched**, because the new kind is `update`: smoke.mjs:272, 329, 335, 431, 478, 821.
- **The comment at smoke.mjs:284-285** is reworded to "nothing besides the one update note".

</details>

## Items

- [ ] **1. Guard that the version agrees everywhere.** Add `scripts/versions.mjs`. It checks:
  - the five places agree
  - the identifier is `no.m.carcoordinator`, and no window sets a scheme option
  - when a line matching `^const APP_VERSION = '…';$` exists in `docs/app.js`, it matches exactly once and agrees. This is read with a regex, not by running the file: app.js calls `start()` at :2299.
  - when `docs/updates.js` exists: run it with `vm.runInContext(src, ctx)`, then read the list with `vm.runInContext('UPDATES', ctx)`, because a top-level `const` is not a property of `ctx`. The list must be non-empty, every field a non-empty string, versions unique and strictly descending number by number, and the newest must agree with the rest.

  Run it first in package.json's `test`, and as a step in `scripts/check.sh`.
      *Done when:* check.sh and `npm test` pass at 0.2.4. A mismatch in tauri.conf.json (tried, not committed) fails both and names the file. A hand-made list with 0.10.0 above 0.9.0 passes, and the reverse order fails.
- [ ] **2. Store: per-browser preferences and the load-trouble flag.** Add `Store.pref`, `Store.setPref`, `Store.loadTrouble()` and `Store.savedText()`, as in Design B.
      *Done when:* smoke shows:
      - a pref round-trips under `carcoord:pref:`
      - an Export file contains no pref
      - `loadTrouble()` is false on a first run and on good data, and true on the corrupt save (smoke.mjs:270) and the `schemaVersion: 99` save (:333)
      - `loadTrouble()` stays false after importing newer data
      - `savedText()` returns the stored string byte for byte
- [ ] **3. ⚠️ Store: backups say what they kept and what they dropped.** `snapshot(state, label, json?)` returns `{entry, dropped}` or null. `dailySnapshot` counts today's `Updating to …` entry as the day's start. **Risky — review individually.** Every "a backup is taken first" promise in the app rests on this function and its trim loop.
      *Done when:* smoke shows:
      - a new snapshot returns its entry and no drops
      - an identical one returns the existing newest entry
      - with 12 entries seeded, `dropped` names the old last entry
      - on the full-storage page (smoke.mjs:1869-1880) it returns null and the warning is still queued
      - after an `Updating to` entry today, `dailySnapshot` adds nothing
      - every existing backup case passes unchanged
- [ ] **4. Decide who sees which notes, as a pure function.** Add `updateNoteFor` next to `note()` (app.js:1418), following the seven rules in Design C.
      *Done when:* smoke drives it through `page.evaluate` with hand-made lists. The cases cover each rule, rule 2 ahead of rule 3, a 0.9.0/0.10.0 pair, a list whose newest entry is not the running version, and a check that localStorage is identical before and after.
- [ ] **5. Release notes file, running version, 0.3.0.** In one commit:
  - create `docs/updates.js` with the Design G header and the 0.3.0 entry
  - add the `APP_VERSION` line to app.js and the script tag at index.html:63-64
  - bump the five places
  - make `versions.mjs` require both new files
      *Done when:* `versions.mjs` passes at 0.3.0 and fails with either new piece removed; `cargo check --manifest-path src-tauri/Cargo.toml` passes; smoke reads `UPDATES[0].version === APP_VERSION` with no console errors.
- [ ] **6. Notice lines with a heading, and the update style.** `renderNotices` accepts `{head, text}` lines. Add the `.notice.update` rule from Design E.
      *Done when:* smoke raises a synthetic `note('update', …, null, [{head, text}])` whose text contains `<b>`, and finds it escaped, its heading bold, and ✕ removing it. Every existing notice case passes unchanged.
- [ ] **7. ⚠️ Show the note once, on the first open of a new version.** Wire `start()` as in Design D, with the text and save-file variants from Design E. Reword smoke.mjs:284-285. **Risky — review individually.** It changes the boot order and writes a backup and a new key on every returning leader's first open, the moment this pack exists to make trustworthy. It also touches the store warnings, the file-recovery path and the share-link dialog.
      *Done when:* smoke shows all of the following, reading the version from the page and never a literal `0.3.0`:
      - A saved plan with no marker gets exactly one `.notice.update`, last in `#notices`. It names the entry at the top of Backups, whose `json` equals the stored text. The marker equals `APP_VERSION`, and `carcoord:v1` is byte-identical across the load.
      - A second open, a first run, a first run plus one change and a reload, a marker of `9.9.9`, and a same-day reopen after one change each show no note and add no automatic backup.
      - A corrupt save and a newer-version save with no marker show no note, write no marker and take no `Updating to` backup. After the corrupt save is overwritten, the next open shows the note.
      - A returning browser opened by a `#d=` link shows no note and writes no marker, and the share dialog opens.
      - The save-file sentence is present with no file linked, and absent under `addInitScript(() => { window.__TAURI__ = {} })`.
      - With `setItem` made to throw for `carcoord:pref:*`, no backup is taken and the note says storage is full.
- [ ] **8. What's new card on the Data tab.** Add the card and the Backups hint change from Design F.
      *Done when:* smoke finds the card directly above Backups, showing the running version and the newest entry's four parts. smoke.mjs:249, 964, 1040 and 1894 pass unchanged.
- [ ] **9. Screenshots of the note and the card.** At the end of `scripts/screens.mjs`, remove `carcoord:pref:seenUpdate` and reload, so the built-up plan reads as a returning leader. Capture the note, then the Data tab.
      *Done when:* `npm run screens` writes both screenshots, the note is visible in the first, and its ink and hi-vis edge is visible against the panel.
- [ ] **10. Upgrade check script.** `node scripts/upgrade.mjs ⟨old-checkout⟩`:
  - Setup: import the old checkout's `scripts/serve.mjs` and this repo's in turn, on one fixed port, in one `launchPersistentContext` profile in a temp directory.
  - On the old build: write `carcoord:v1` from `scripts/fixtures/dev-data.json` and ten past-dated backups straight into localStorage (not via Import, which snapshots, app.js:1558), then reload.
  - Run (a): one change on the old build, then the new build. An `Updating to ⟨v⟩` entry tops Backups and all 11 earlier entries are present.
  - Run (b): no change. The note names the old build's `Start of day`, and no entry is added.
  - Run (c): twelve seeded entries. The note names the one dropped.
  - In every run, the first assertion is that `APP_VERSION` equals package.json's version: serve.mjs sends no cache headers, and nothing else proves which build is running. Then `carcoord:v1` must be byte-identical, there must be exactly one `.notice.update`, the marker must be set, and a reload must show no note.
      *Done when:* all three runs pass against `git worktree add ⟨scratch⟩/cc-v0.2.4 v0.2.4`, and pointing it at a checkout of the current build fails on the version assertion.
- [ ] **11. Write the process rule down.**
  - Replace README.md:40 with the Design H rule, and add "and when the app has been updated" to README.md:31.
  - Put the same rule in the container's Gates.
  - Check that the container's **Opening the app** and **Releasing a pack** rules still match what this pack built, including the owner's answer to question 1. Update them if not.
      *Done when:* README, the container's Gates and the updates.js header state the same rule word for word, and the container's two rule sections describe what shipped.

## Owner questions

1. When the newest backup already holds exactly the plan being opened, should the note name that entry under its own label (recommended; it keeps `Start of day` meaning start of day), or relabel it `Updating to ⟨v⟩` which was the container's first draft?
2. Where should the notes be readable after ✕? A **What's new** card on the Data tab directly above Backups (recommended: it sits next to the copy the note points at, and the top bar stays as it is), or a **What's new** button in the top bar?
3. On a Windows PC, in the exe: does Data → **Choose save file…** open a picker, and does the chosen file get written after a change? Until you confirm, the note says nothing about the save file in the Windows app.

## Out of scope

- A modal or `<dialog>` for the note, and any change to `#shareDlg`.
- A button inside an update entry. Pack 9's entry names its button in words.
- Breadify (`docs/breadify/`): its changes get no entry and no version bump, even though they redeploy Pages and ship inside the exe.
- Reading the exe's version through Tauri's app API. Whether `core:default` grants it (src-tauri/capabilities/default.json) is unverified.
- Syncing "seen" between browsers, or between the exe and a browser. Each keeps its own marker.
- The 12-entry cap and the identical-skip for other callers (store.js:8, :214). Moving `dailySnapshot` to the local date (:229) is pack 4's.
- A raw-text copy on the file-recovery path; that path stores the loaded state and says so.
- Generating notes from `git log`, or filling in GitHub release bodies.
- Cache-busting the script tags. `APP_VERSION` rules 4 and 5 tolerate a mixed cache.
- A version label in the top bar. The What's new card states the running version.
- The first-use tour itself (pack 9).

## Gates

- **Item gate:** `scripts/check.sh`, which from item 1 on also runs `versions.mjs`. When logic is touched, also run the targeted smoke case: `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`. Item 5 edits src-tauri/Cargo.toml, so it also runs `cargo check --manifest-path src-tauri/Cargo.toml` (scripts/check.sh:19-21); cargo is on PATH here.
- **Pack gate:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test` and `CHROMIUM_PATH=/usr/bin/google-chrome npm run screens`. The pinned Playwright Chromium is not installed here and `/usr/bin/google-chrome` works; say so in the report, because the suite will not have run on the browser CI uses.
  - The upgrade check (the container's release rules require it for pack 1): `git worktree add ⟨scratch⟩/cc-v0.2.4 v0.2.4`, then `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/upgrade.mjs ⟨scratch⟩/cc-v0.2.4`.
- **Review:** items 3 and 7 are reviewed individually, plus one review pass for the rest of the pack.
- **Browser walkthrough before merging:**
  1. Import `scripts/fixtures/dev-data.json` and change one thing.
  2. Remove `carcoord:pref:seenUpdate` and reload. The note is the last notice and names the top Backups entry.
  3. On the Data tab, find that entry, with What's new directly above Backups. Restore it; a backup is taken first (app.js:1394).
  4. Reload: no note. A fresh profile: no note. A `#d=` link: no note, and the share dialog opens.
  5. At a 900px window (the exe's minimum width, tauri.conf.json:17) and in print preview, the note does not print.
- **At pack close:** `INVENTORY.md` gains `✅ Update note` under Data, and the 🚧 container line is updated. The exe gets a hand check on install (container Gates).

## Ledger
