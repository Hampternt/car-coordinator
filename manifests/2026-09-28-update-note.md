# Pack: Update note and fail-safe — say what changed, and keep an untouched copy

**Status:** 💭 planned — item list awaiting the owner's approval; nothing built
**Date:** 2026-09-28 (reworked against `dev` at b0ae257, after the 0.2.5 save-file fix)
**Branch:** cut when execution starts: `update-note`, from `dev`, and merged back into `dev` through a PR (the container's Branch line).

## Goal

The first time a leader opens Car Coordinator after an update:

- **Before anything else happens**, everything saved in that browser is copied, byte for byte, into an **Archive**. That covers routes, templates, drivers, crews, cars, positions and labels. The rolling Backups can never push an archive out, and the last three updates' archives are kept.
- **One note** sits above the day plan. It says what changed, what that affects, what happened to the saved plan, and where the untouched copy is.
- **✕ puts the note away.** Every note stays readable on the Data tab under **What's new**, and every archive can be restored or downloaded there.

If the app itself ever fails to start, a separate page, `recover.html`, still lists everything the browser holds and downloads it. It shares no code with the app.

The saved plan's shape does not change. From this pack on, every pack ends by adding its own note entry and cutting its own version.

## Agent brief

There is no `CLAUDE.md` at the repo root; conventions come from `HANDOFF.md`, the code, and the container `manifests/2026-09-28-review-round.md`. Run one agent, doing the items in order. Items 4–8 all write `docs/app.js`.

Read first:
- **This manifest.** Then the container's **Branch** line, its **Rules every pack follows** (Releasing a pack; Opening the app) and its **pack 1** section.
- **`docs/store.js` on `dev`:**
  - `readLocal` (:174-186) and its two load warnings (:153 newer version, :181 unreadable).
  - `snapshot` (:214), which returns true/false since 0.2.5. `dailySnapshot` (:233).
  - The save-file marker `CHECK_KEY` (:301). It is read straight from localStorage; item 2 moves it onto `Store.pref` under the **same key**.
  - `init` (:492), `hasUsableLocalData` (:568), and the exports (:573-581).
- **`docs/app.js` on `dev`:**
  - `start()` (:2354-2383). Its order since 0.2.5 is: recover or `checkFileAtStart` → `noteFileHold()` → drain → `dailySnapshot` → offers → render → share link.
  - `renderData` (:1002) and its cards: Auto-save :1033, This browser :1038, Share :1042, Your own copy :1045, Backups :1053, which is the last card.
  - `renderNotices` (:1061), `noteFileHold` (:1417), `note` (:1495), `WEEKDAYS` (:26).
- **`docs/index.html`:** the CSP allows same-origin script only (:14). The stylesheet is at :17 and the scripts at :63-66.
- **`scripts/smoke.mjs`:**
  - Console errors fail the run (:42).
  - First run (:50).
  - Backups are read as `.card:last-child` (:1894), so new cards go **above** Backups.
  - The save-file cases read `carcoord:pref:fileNeedsCheck` directly (:2029, :2136, :2161, :2200). The key doesn't change, so they keep working.
- **The upgrade harness from 0.2.5's check:** `/tmp/claude-1000/-home-hampter-projects-car-coordinator/21ef32ff-0e76-4d4e-ae0e-d09f925a0a3a/scratchpad/upgrade/upgrade.mjs`. Item 11 turns it into `scripts/upgrade.mjs`. It lives in the scratchpad and may be gone; its method is described in the container's ledger.

Reuse, don't rebuild:
- `note()` and `renderNotices` for the note.
- The Data tab's card pattern.
- `confirmTwice` for Restore.
- `Store.snapshot` (true/false) before any restore.
- `when()` and `esc()`.

Dependency edges:
- **Pack 2 (sheet cleanup, schema v5):** its note entry must say what an older copy of the app does with v5 data. Archives made before pack 2 hold v4 text; restoring one goes through `migrate` like any import.
- **Pack 3 (dark mode):** stores the theme with `Store.pref('theme')`, and moves `.notice.update` and the archive card onto its tokens.
- **Pack 4 (plan for tomorrow):** its date move goes after `dailySnapshot` (Design D, step 6). Its Keep notice is raised before the update note.
- **Pack 9 (tour):** reads the `firstRun` value this pack sets in `start()`. Its done-flag uses `Store.pref('tour')`.
- **Packs 2–9:** each ends with **Announce ⟨pack⟩ and cut ⟨version⟩** (Design H).

## Decisions taken

| Decision | Choice |
|---|---|
| Where the pre-update copy lives | In an **Archive** (`carcoord:archives`), not in the rolling Backups. It is kept outside the 12-entry rotation, so a week of deletes and template loads can't push it out. This replaces the first draft's "Updating to …" backup. With it go that draft's `snapshot` drop-reporting, its `dailySnapshot` label rule, and the owner's earlier question about naming an identical backup, which no longer arises. |
| What an archive holds | The raw `carcoord:v1` text, **byte for byte**, as the old version wrote it. That is the whole setup plus the day plan. It is not a normalised copy: if a conversion ever has a bug, the archive must not carry it. Backups are not touched by an update, so they don't need archiving. |
| How many | The last three **update** archives, plus the newest **rescue** archive (below). On full storage, the oldest update archive is dropped to fit a new one. `carcoord:v1` and the Backups are never touched to make room. |
| Rescue copy of an unreadable save | When a load finds saved text it can't read, that text is archived **at once** as a rescue archive, before any change can overwrite it. It can't go into Backups, because Restore parses each entry. It gets Download only. This closes the "first change you make will overwrite it" loss for good. |
| When an archive is taken | On the first open of a new `APP_VERSION` when this browser has saved text, once per version. It is taken **before anything else at start-up**, held loads and share-link opens included; a copy is always harmless. It is not taken on a first-ever open, because there's nothing to copy. |
| How the note is shown | A notice of a new kind, `update`, in `#notices`, with no offer button, only ✕. It isn't a `<dialog>`, which would stack on the share dialog a `#d=` link opens at boot (app.js:2377-2382). `#notices` is already hidden in print. |
| Who sees the note | A first-ever open sees nothing, and the marker is written silently. A **held** load sees nothing and nothing is written; the note comes on the next clean open. A load is held when it could not be read, came from a newer version, or arrived by a `#d=` link. A save-file hold (0.2.5) is not a note hold: `noteFileHold` already says what it needs to. |
| When a note counts as seen | When it is shown, not when it is dismissed, so a leader who never presses ✕ doesn't see it on every open. |
| Per-browser marker | `carcoord:pref:seenUpdate`, through a new `Store.pref` / `Store.setPref`. It is never on `state` (app.js input handler), so it never reaches Export, the save file or share codes. The existing `carcoord:pref:fileNeedsCheck` moves onto the same functions under the same key, so nothing is renamed and nothing is lost. |
| The running version | `const APP_VERSION = '0.3.0';` in `docs/app.js`, the sixth version place. The script and stylesheet tags carry `?v=⟨APP_VERSION⟩`, so a browser never pairs a new `app.js` with a cached older `store.js` after a deploy. 0.2.5 guards the one call that broke; this closes the whole class. |
| First entries | `docs/updates.js` starts with **two** entries: 0.2.5 (the save-file fix, tabs no longer saving, and the date centred on the sheet) and 0.3.0 (this pack). 0.2.5 never reached `main`, so users jumping from 0.2.4 must hear about it too. |
| Release cadence | Each pack takes the next minor version: 0.3.0, 0.4.0 … A user-visible fix between packs takes the next patch version, with its own entry. Tests-only, docs-only and `docs/breadify/` changes get neither. Entries are never removed or renumbered. What reaches users is whatever `dev` holds when it merges to `main`. |
| Several missed updates | The note shows the newest three entries in full and counts the rest; What's new lists them all. A browser with saved data but no marker counts every entry as unseen. |
| Where notes and archives are read again | On the Data tab: **What's new**, then **Archives**, then Backups last (the owner's answer: above Backups). Backups stays the last card, as smoke.mjs:1894 expects. |
| Emergency page | `docs/recover.html` + `docs/recover.js`. They share no code with the app, carry the same CSP, and are read-only: they list every `carcoord:` key and download it. Linked from the unreadable-save warning, the This browser card and the README. |
| Save-file sentence | One sentence in the note, in three variants. It is hidden in the Windows app until the owner confirms the file picker works there (question 3), and hidden while a save-file hold is up, because `noteFileHold` speaks for that. |
| Version guard | `scripts/versions.mjs` runs first in `npm test` and inside `scripts/check.sh`. It checks the six version places, the `?v=` tags, `updates.js`, and pins the exe identifier `no.m.carcoordinator` with no scheme setting. |
| Boot safety | The whole update path in `start()` sits in one try/catch that logs with `console.warn`; smoke fails on `console.error`. Any failure falls through to `render()`, so the saved plan is always drawn. |
| Saved-plan shape | Unchanged. `SCHEMA` stays 4 and nothing new goes into `carcoord:v1`. |

## Design

### A. Files and keys

**New files:**
- `docs/updates.js`: the notes, data only, with the wording rules in its header.
- `docs/recover.html` and `docs/recover.js`: the emergency page.
- `scripts/versions.mjs`: the version guard.
- `scripts/upgrade.mjs`: the upgrade check.

**Changed:** `docs/store.js`, `docs/app.js`, `docs/index.html`, `docs/style.css`, `scripts/check.sh`, `package.json`, `scripts/smoke.mjs`, `scripts/screens.mjs`, `README.md`, the container manifest, and the version lines.

**Keys:**

| Key | Holds | Written |
|---|---|---|
| `carcoord:pref:seenUpdate` | newest version whose note this browser has shown | at boot, rule 6/7 below |
| `carcoord:pref:fileNeedsCheck` | 0.2.5's save-file marker, unchanged | as in 0.2.5, now through `Store.pref` |
| `carcoord:archives` | `[{ kind: 'update' \| 'rescue', from, to, t, text, readable }]`, newest first | at boot, before anything else |

`from` is the version this browser last opened (the `seenUpdate` value), or `"0.2.4 or earlier"` when there is no marker. `to` is `APP_VERSION`. `text` is the raw saved string. `readable` records whether `text` parses as a plan.

### B. Store additions

- **`pref(name)` / `setPref(name, value)`:** `carcoord:pref:⟨name⟩`, every access in try/catch. A failed read returns null; a failed write returns false. 0.2.5's `needsCheck`, `markCheck` and `clearCheck` are rebuilt on these, with the same key and the same fail-closed behaviour.
- **`loadTrouble()`:** true when `readLocal` queued the unreadable warning, or the data had `schemaVersion > SCHEMA`. It is set only on that path; `parseImport` and `restore` also call `migrate`.
- **`savedText()`:** the raw `carcoord:v1` string exactly as `readLocal` read it, readable or not. It is null when there was none.
- **`archives()`:** the parsed list, `[]` on any failure.
- **`archive(entry)`:** puts the entry at the top and keeps three `update` plus one `rescue`. On quota it drops the oldest `update` and retries, and it never touches another key. Returns `{ ok, dropped }`.
- **`rescueUnreadable()`:** called by `readLocal` when it finds text it can't read. It archives that text as `kind: 'rescue'` unless the newest rescue already holds the same text.

### C. The decision, a pure function next to `note()`

`updateNoteFor({ version, releases, seen, hadData, hold })` returns `{ show: entries[], mark: bool }`. The rules apply in order:

1. `seen === version`: nothing.
2. `hold`: nothing, and the marker is left alone.
3. `!hadData`: mark only (first run).
4. `seen` is numerically newer than `version`: nothing. This covers a downgrade or a stale cached `app.js`.
5. `releases` is not an array, or `releases[0].version !== version`: nothing, no mark. This happens with a stale cached `updates.js`, and it is retried next open.
6. `seen` is null or not in `releases`: mark, and show every entry.
7. `seen` is found at index `i`: mark, and show `releases.slice(0, i)`.

`archiveNeeded({ version, seen, text, archives })` is separate and simpler: true when `text !== null`, `seen !== version`, and no archive has `to === version`. It ignores `hold`: an unreadable, newer or share-link load is archived too.

Inputs, computed in `start()`:
- `hadData = Store.hasUsableLocalData() || recovered`. `let recovered` is hoisted above the recovery `if`.
- `hold = Store.loadTrouble() || /^#d=/.test(location.hash)`, read before `Share.readHash` clears the hash.
- `firstRun = !hadData && !Store.loadTrouble()`, kept in a module-level `let` for pack 9.

### D. Boot order in `start()`

1. `Store.init()`. `readLocal` rescues unreadable text into an archive here.
2. **Archive**: if `archiveNeeded`, call `Store.archive({ kind: 'update', from, to, text: Store.savedText(), readable: Store.hasUsableLocalData() })`. This is the first write at boot.
3. Recover from the save file, or `checkFileAtStart` (as 0.2.5).
4. `noteFileHold()`, then drain the store notices (as 0.2.5).
5. `Store.dailySnapshot(state)`.
6. *(Pack 4's date move and its Keep notice.)*
7. Offers: `offerSpotRoundSplit()`, `offerTodaysTemplate()`.
8. `updateNoteFor`. If `mark`, call `setPref('seenUpdate', APP_VERSION)`. If there are entries, raise `note('update', …)` last.
9. `render()`, then the share-link block (unchanged).

Steps 2 and 8 sit inside the try/catch. The only writes at boot are the archive list, the markers and the daily backup; **`carcoord:v1` is never written at boot**, as in 0.2.4 and 0.2.5.

### E. What the note says

The `text` is these sentences, in order:
1. `Car Coordinator has been updated to ⟨v⟩.`
2. The copy sentence, one of:
   - **archived now or already archived:** `Before anything else, everything you had saved in this browser (routes, templates, drivers, cars, labels) was copied unchanged into Archives on the Data tab, where it stays through the next two updates.`
   - **archive failed:** `No copy could be put in Archives, because this browser's storage is full. Use Export on the Data tab to keep one.`
   - **plan came from the save file (nothing saved here):** `Your plan was read from your save file, which this update did not change.`
3. The save-file sentence. It is left out in the Windows app until confirmed, and left out while a save-file hold is up. Otherwise:
   - **no file linked:** `To keep a copy of every change outside the browser, use Choose save file… on the Data tab.`
   - **linked and allowed:** `Changes are also written to your save file, ⟨name⟩.`
   - **linked but paused:** `Saving to ⟨name⟩ is paused; reconnect it on the Data tab.`
4. `✕ puts this away; What's new on the Data tab keeps every note.`

The `lines` hold three items for each shown entry:
- `{head: "What's new in ⟨v⟩:", text: "⟨title⟩. ⟨changed⟩"}`
- `{head: "What it affects:", text: affects}`
- `{head: "Your data:", text: data}`

After three entries comes a plain line: `And ⟨N⟩ earlier updates, all listed on the Data tab under What's new.`

`renderNotices` accepts a line that is either a string or `{head, text}`, drawn as `<li><b>${esc(head)}</b> ${esc(text)}</li>`. `.notice.update` pairs ink with hi-vis, echoing the top bar (style.css:29-30).

### F. The Data tab

The order becomes: Auto-save, This browser, Share, Your own copy, **What's new**, **Archives**, Backups (last).

- **What's new:**
  - Starts with `You are running version ⟨APP_VERSION⟩.`
  - The newest three entries are shown in full (What changed / What it affects / Your data); older ones get one line each, `⟨v⟩ · ⟨title⟩. Your data: ⟨data⟩`.
  - No `<table>` (smoke reads the Data tab's first table) and no `<details>`.
- **Archives:**
  - One row per archive: `Before ⟨to⟩ (from ⟨from⟩) · ⟨when(t)⟩`, or `Could not be read · ⟨when(t)⟩` for a rescue.
  - **Restore** is two clicks via `confirmTwice`. It first takes a backup of the screen and **must succeed** (`snapshot` returns true), then `migrate`s the archive text, loads it and saves. Rescue archives have no Restore.
  - **Download** saves the raw text as `car-coordinator-before-⟨to⟩.json`, which Import reads when it is readable.
  - Hint: `Kept apart from Backups, so everyday backups never push these out. The last three updates are kept.`
- **This browser card:** gains a link, `If this page ever won't start, recover.html downloads everything this browser holds.`

### G. Wording rules (the header of `docs/updates.js`)

- Write for a warehouse team leader, naming what is on screen exactly as the app shows it.
- Never use code words: storage, key, schema, JSON, migration, normalise, cache, localStorage.
- **`title`:** a few words naming the change.
- **`changed`:** what you will see or do differently.
- **`affects`:** which tabs are affected. Always say whether the printed sheet or share codes change. If an updated and a not-yet-updated PC behave differently, say so and say what to do.
- **`data`:** always present and exact. Either `Nothing in your saved plan changes.` or exactly what changes, and what an older copy of the app does with it. Never "might". Never promise more than the pack guarantees.
- Archives and backups live beside the plan in the same browser. Never imply they survive clearing browser data, a different browser or a reinstall.
- No comfort words ("don't worry", "safe") without the fact behind them.
- At most about 25 words per field. Say "this browser", never "this PC".

**Draft 0.2.5 entry:**
- **title:** `Your save file is never written over unread`
- **changed:** `Reconnect and Choose save file… read the file first and ask when it holds a different plan. The printed date is centred with the weekday under it.`
- **affects:** `The Data tab's save-file card, and the printed sheet's date. Share codes are unchanged. Switching tabs no longer saves.`
- **data:** `Nothing in your saved plan changes. Whichever plan you replace from the save-file question goes into Backups first.`

**Draft 0.3.0 entry:**
- **title:** `A note like this after each update, and Archives`
- **changed:** `After each update, a note like this appears once. What you had saved is copied into Archives first, and What's new keeps every note.`
- **affects:** `This note, and What's new and Archives on the Data tab. The day plan, printed sheet and share codes are unchanged.`
- **data:** `Nothing in your saved plan changes. Before each update's note, an unchanged copy goes into Archives; the last three are kept.`

### H. Process rule

Written identically in the `updates.js` header, README and the container's Gates:

- Every pack that changes what a leader sees, or what happens to their saved data, ends with one item: **Announce ⟨pack⟩ and cut ⟨version⟩**. In one commit it:
  - adds an entry at the top of `docs/updates.js`;
  - moves six places to the same version: package.json, package-lock.json (twice), src-tauri/Cargo.toml, src-tauri/tauri.conf.json and `APP_VERSION`.
- The `?v=` tags follow `APP_VERSION`, and `versions.mjs` fails the item gate if they don't.
- The pack's browser walkthrough re-reads its entry against what shipped.
- The `dev` → `main` merge publishes Pages and builds release `v⟨version⟩`.

<details>
<summary><b>I. Who sees what</b></summary>

| Open | Archive | Note |
|---|---|---|
| First-ever open | none (nothing saved) | none; marker written |
| Returning 0.2.4 leader | `from "0.2.4 or earlier"`, raw text | shown last: entries 0.3.0 and 0.2.5 |
| Unreadable save | rescue archive at load, plus an update archive | held; comes on the first clean open |
| Save from a newer version | update archive of the raw text | held |
| Opened by a `#d=` link | archived if saved text exists | held; the share dialog opens as today |
| Recovered from the save file (nothing saved here) | none | shown, with the "read from your save file" sentence |
| Second tab, or a reload | already archived | nothing; marker current |
| New `app.js`, stale cached `updates.js` | archived (keyed on `APP_VERSION`) | not yet; comes with the fresh file |
| Storage full | oldest update archive dropped; if even that fails, none | shown, with the "storage is full, use Export" sentence |

</details>

## Items

- [ ] **1. Version guard.** Add `scripts/versions.mjs`. It checks that:
  - the five existing version places agree;
  - the identifier is `no.m.carcoordinator` and no window sets a scheme option;
  - once they exist: `APP_VERSION` appears exactly once and agrees; every local `<script>` and stylesheet tag in `index.html` and `recover.html` carries `?v=⟨APP_VERSION⟩`; `updates.js` lists non-empty entries, versions unique and strictly descending number by number, the newest equal to `APP_VERSION`. It reads the file with `vm`, not by loading the app.

  Run it first in `npm test` and as a step in `scripts/check.sh`.
  *Done when:* both pass at 0.2.5. A tried (not committed) mismatch in `tauri.conf.json` fails both and names the file. A hand-made list with 0.10.0 above 0.9.0 passes, and the reverse fails.
- [ ] **2. Store: per-browser preferences, load trouble and the saved text.** Add `Store.pref`, `Store.setPref`, `Store.loadTrouble()` and `Store.savedText()` (Design B), and rebuild 0.2.5's marker functions on `pref` with the same key.
  *Done when:* smoke shows all of these:
  - a pref round-trips under `carcoord:pref:`, and an Export contains no pref;
  - `loadTrouble()` is false on a first run and good data, true on the corrupt save (smoke.mjs:270) and the `schemaVersion: 99` save (:333), and false after importing newer data;
  - `savedText()` returns the stored string byte for byte, `'{not json'` included;
  - every 0.2.5 save-file case passes unchanged.
- [ ] **3. ⚠️ Archives in the Store.** `Store.archives()`, `Store.archive(entry)` with its limits and its quota behaviour, and `rescueUnreadable()` called from `readLocal` (Design B).
  *Done when:* smoke shows all of these:
  - an archive's `text` is byte-identical to the stored `carcoord:v1`;
  - a fourth update archive drops only the oldest update archive, and the rescue survives;
  - an unreadable save is rescued at load, and **the first change afterwards leaves the rescue intact**;
  - with `carcoord:archives` made to throw on write, `archive` returns `{ ok: false }` and `carcoord:v1` and the Backups are byte-identical;
  - twelve new backups leave every archive in place.

  **Risky — review individually.** It is the fail-safe itself, and it runs on every returning leader's first open.
- [ ] **4. Who sees what, as pure functions.** `updateNoteFor` and `archiveNeeded` next to `note()`, following Design C.
  *Done when:* smoke drives both through `page.evaluate` with hand-made lists. The cases cover every rule, rule 2 ahead of rule 3, a 0.9.0/0.10.0 pair, a stale list, and localStorage byte-identical before and after.
- [ ] **5. Release notes, running version, 0.3.0.** In one commit:
  - create `docs/updates.js` with the Design G header and the 0.2.5 and 0.3.0 entries;
  - add `APP_VERSION`;
  - add the script tag;
  - put `?v=0.3.0` on every local tag in `index.html`;
  - bump the five places;
  - make `versions.mjs` require all of it.

  *Done when:* `versions.mjs` passes at 0.3.0 and fails with any piece removed, and smoke reads `UPDATES[0].version === APP_VERSION` with no console errors.
- [ ] **6. Notice lines with a heading, and the update style.** `renderNotices` accepts `{head, text}` lines, and `.notice.update` is added.
  *Done when:* smoke raises a synthetic update note whose text contains `<b>` and finds it escaped, its heading bold, and ✕ removing it. Every existing notice case passes unchanged.
- [ ] **7. ⚠️ Wire the start-up.** Wire `start()` as in Design D, with the Design E sentences.
  *Done when:* smoke shows all of these, reading the version from the page, never a literal:
  - **Returning leader** (saved plan, no marker): exactly one `.notice.update`, last in `#notices`, listing 0.3.0 and 0.2.5. An archive whose text equals the stored `carcoord:v1` byte for byte. The marker equals `APP_VERSION`. `carcoord:v1` byte-identical across the load.
  - **No note, no new archive:** a second open, a first run (no archive either), a first run plus one change and a reload, and a marker of `9.9.9`.
  - **Held loads:** a corrupt save and a newer-version save show no note and write no marker, but are archived. After the corrupt save is overwritten, the next open shows the note.
  - **Share link:** a returning browser opened by a `#d=` link shows no note, and the share dialog opens.
  - **Save-file sentence:** present with no file linked; absent under `addInitScript(() => { window.__TAURI__ = {} })`; absent while a save-file hold is up.
  - **Storage full:** with `carcoord:archives` made to throw, the note says storage is full and points at Export.

  **Risky — review individually.** It changes the boot order on every returning leader's first open, the moment this pack exists to make trustworthy.
- [ ] **8. What's new and Archives on the Data tab.** Both cards, per Design F, including Restore and Download.
  *Done when:* smoke shows all of these:
  - both cards sit above Backups, and Backups is still `.card:last-child`;
  - What's new shows the running version and the newest entry's four parts;
  - **Restore** of an archive takes two clicks, takes a backup first, and gets the old plan back;
  - with Backups full, **Restore** does nothing and says why;
  - **Download** gives a file whose text equals the archive and imports to the same plan;
  - a rescue archive offers Download and no Restore;
  - smoke.mjs:249, 964, 1040 and 1894 pass unchanged.
- [ ] **9. The emergency page.** `docs/recover.html` + `docs/recover.js`, per Decisions: its own CSP, no app code, read-only. It lists every `carcoord:` key with its size and downloads each one, or all of them as one file. Linked from the unreadable-save warning, the This browser card and the README.
  *Done when:* smoke opens `/recover.html` on a profile holding the dev fixture, backups and an archive, lists all three keys, and downloads each byte-identical. With `app.js` made to throw on the main page, `recover.html` still works.
- [ ] **10. Screenshots.** At the end of `scripts/screens.mjs`: remove `carcoord:pref:seenUpdate` and reload, then capture the note, the Data tab's What's new and Archives, and `recover.html`.
  *Done when:* `npm run screens` writes all four with no console errors.
- [ ] **11. The upgrade check as a script.** `node scripts/upgrade.mjs ⟨old-checkout⟩`, built from 0.2.5's harness:
  - one fixed port and one `launchPersistentContext` profile per scenario;
  - the old build is served first, then this one;
  - the first assertion on every load is which build is running.

  Scenarios:
  - (a) a full setup (the dev fixture plus ten past-dated backups);
  - (b) an unreadable save;
  - (c) a first run;
  - (d) a linked save file;
  - (e) a mixed cache.

  Each asserts:
  - `carcoord:v1` and `carcoord:backups` byte-identical on open;
  - an archive equal to the old `carcoord:v1`;
  - exactly one note naming 0.3.0 and 0.2.5;
  - a reload shows no note.

  *Done when:* all scenarios pass against `git worktree add ⟨scratch⟩/cc-v0.2.4 v0.2.4` and against the previous `dev` build, and pointing it at a checkout of this build fails on the build assertion. It is added to `package.json` as `npm run upgrade -- ⟨dir⟩`.
- [ ] **12. Write the process rule down.** Design H goes into the README, the container's Gates and the `updates.js` header. The container's **Opening the app** rules are brought in line with Design D, archive first.
  *Done when:* the three places state the rule word for word, and the container's startup order matches Design D.

## Owner questions

**Answered 2026-09-28:**
- Past notes live in a **What's new** card on the Data tab, above Backups.
- The earlier question about naming an identical backup no longer arises. The pre-update copy is now always a fresh archive, so there is no backup to name.

**Still open, and it blocks nothing:** on a Windows PC, in the exe, does Data → **Choose save file…** open a picker, and does the file get written after a change? Until you confirm, the note says nothing about the save file in the Windows app. The web version is the one that matters most, and it is covered.

## Out of scope

- A modal or `<dialog>` for the note.
- A button inside an update entry.
- Breadify: its changes get no entry and no version bump.
- Syncing "seen" or archives between browsers, or between the exe and a browser.
- Archiving the Backups list: updates never touch it.
- Reading the exe's version through Tauri's app API.
- Generating notes from `git log`, or filling in GitHub release bodies.
- A version label in the top bar: What's new states the running version.
- The tour itself (pack 9).

## Gates

- **Item gate:** `scripts/check.sh`, which runs `versions.mjs` from item 1 on. When logic is touched, also the targeted smoke case, `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`. Item 5 edits `src-tauri/Cargo.toml`. `cargo check` needs the icons that CI generates (`src-tauri/icons/` is gitignored), so the version guard stands in for it here.
- **Pack gate:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test` and `npm run screens`. The pinned Playwright Chromium is not installed here, so say that the suite ran on system Chrome.
  - `npm run upgrade` from v0.2.4 and from the previous `dev` build.
- **Review:** items 3 and 7 individually, plus one review pass for the rest.
- **Browser walkthrough before the PR into `dev`:**
  1. Import `scripts/fixtures/dev-data.json` and change one thing.
  2. Remove `carcoord:pref:seenUpdate` and reload. The note is last, lists 0.3.0 and 0.2.5, and names Archives.
  3. On the Data tab, the archive's text equals what was saved. Restore it (two clicks, backup first), and Download it.
  4. Open `recover.html`, and download everything.
  5. Reload: no note. A fresh profile: no note and no archive. A `#d=` link: no note, and the share dialog opens.
  6. In print preview, the note does not print.
- **At pack close:** `INVENTORY.md` gains `✅ Update note and Archives` under Data, and the container's 🚧 line is updated.

## Ledger
