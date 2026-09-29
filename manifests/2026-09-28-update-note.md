# Pack: Update note and fail-safe — say what changed, and keep an untouched copy

**Status:** 🚧 go given 2026-09-29, after an independent plan review. Building.
**Date:** 2026-09-28. Reworked against `dev` at b0ae257, after the 0.2.5 save-file fix. Revised 2026-09-29 after the plan review (see Ledger).
**Branch:** `update-note`, cut from `dev` and merged back into `dev` through a PR (the container's Branch line).

## Goal

The first time a leader opens Car Coordinator after an update:

- **Before anything else happens**, the plan and the whole setup saved in that browser are copied, byte for byte, into an **Archive**. That covers routes, templates, drivers, day groups, cars, positions and labels. The rolling Backups can never push an archive out.
- **One note** sits above the day plan. It says what changed, what that affects, what happened to the saved plan, and where the untouched copy is.
- **✕ puts the note away.** Every note stays readable on the Data tab under **What's new**. Every archive can be looked at, restored or downloaded there.

If the app itself ever fails to start, the page still shows a plain link to **`recover.html`**. That separate page shares no code with the app; it lists everything the browser holds and downloads it.

The saved plan's shape does not change. From this pack on, every pack ends by adding its own note entry and cutting its own version.

## Agent brief

There is no `CLAUDE.md` at the repo root. Conventions come from `HANDOFF.md`, the code, and the container `manifests/2026-09-28-review-round.md`. One agent does the items in order; items 4–9 all write `docs/app.js`.

Read first:
- **This manifest.** Then the container's **Branch** line, its **Rules every pack follows** and its **pack 1** section.
- **`docs/store.js` on `dev`:**
  - `readLocal` (:174-186) and its two load warnings (:153 newer version, :181 unreadable).
  - `snapshot` (:214), which returns true/false since 0.2.5. `dailySnapshot` (:233).
  - The save-file marker `CHECK_KEY` (:301). It is read straight from localStorage; item 2 moves it onto `Store.pref` under the **same key**.
  - `init` (:492). It calls `askPersist()` (:496), which ends in `onChange()`, i.e. `render()` (:466). With a linked handle it calls `onChange()` again (:503). Both happen **before** `start()` assigns `state`.
  - `hasUsableLocalData` (:568) and the exports (:573-581).
- **`docs/app.js` on `dev`:**
  - `start()` (:2354-2383).
  - `render()`, which drains Store notices through `note(n.kind, n.text)` (:1130). Store warnings raised in `init` therefore reach `notices` during `init`, not at `start()`'s own drain (:2367).
  - The input handler's meta-field write (:1166).
  - `renderData` (:1002) and its cards: Auto-save :1033, This browser :1038, Share :1042, Your own copy :1045, Backups :1053 (the last card).
  - `renderNotices` (:1061), `noteFileHold` (:1417), `note` (:1495), `confirmTwice`, and Backups' Restore keyed by index (:1468).
- **`docs/index.html`:** the CSP allows same-origin script only (:14). The stylesheet is at :17 and the scripts at :63-66.
- **`scripts/smoke.mjs`:**
  - Console errors fail the run (:42), and the first run is at :50.
  - Backups are read as `.card:last-child` (:1894).
  - :964 and :1040 read the Data tab's **first `table`**. The main `page` will carry a rescue archive from the damaged-save loop (:818-822) at those lines, so the new cards must hold **no `<table>`**.
  - The save-file cases read `carcoord:pref:fileNeedsCheck` directly (:2029, :2136, :2161, :2200). Keeping that key means they keep working.
- **The upgrade harness from 0.2.5's check:** `/tmp/claude-1000/-home-hampter-projects-car-coordinator/21ef32ff-0e76-4d4e-ae0e-d09f925a0a3a/scratchpad/upgrade/upgrade.mjs`. It may be gone; its method is in the container's ledger. Item 11 makes it `scripts/upgrade.mjs`.

Reuse:
- `note()` and `renderNotices`.
- The Data tab card pattern.
- `confirmTwice`.
- `Store.snapshot` (true/false) before any restore.
- The save-file question's plan summary (app.js:969-971).
- `when()` and `esc()`.

Dependency edges:
- **Pack 2 (schema v5):** its note entry must say what an older copy of the app does with v5 data. Archives made before pack 2 hold v4 text, and restoring one goes through `migrate`.
- **Pack 3:** stores the theme with `Store.pref('theme')` and moves the new cards and `.notice.update` onto its tokens.
- **Pack 4:** its date move is Design D step 6, and its Keep notice comes before the update note.
- **Pack 9:** reads `firstRun`, and uses `Store.pref('tour')`.
- **Packs 2–9:** each ends with **Announce ⟨pack⟩ and cut ⟨version⟩** (Design H).

## Decisions taken

| Decision | Choice |
|---|---|
| Where the pre-update copy lives | In an **Archive** (`carcoord:archives`), not in the rolling Backups. It sits outside the 12-entry rotation, so a week of deletes and template loads can't push it out. This replaces the first draft's "Updating to …" backup and its rotation bookkeeping. |
| What an archive holds | The raw `carcoord:v1` text, **byte for byte**, as the old version wrote it: the whole setup plus the day plan. It is never a normalised copy, so if a conversion ever has a bug, the archive doesn't carry it. Updates don't touch the Backups, so those aren't archived. |
| How many | Up to three **update** archives, plus the newest **rescue** archive. A new archive is written only **whole**. To make room, the oldest update archives are dropped one at a time. If the new one still doesn't fit with all of them gone, `carcoord:archives` is left **exactly as it was**, and the note says storage is full. `carcoord:v1` and the Backups are never touched to make room. |
| Rescue copy of an unreadable save | When a load finds saved text that isn't a usable plan, that text is archived **at once, inside `readLocal`**, before any change can overwrite it. It gets Download only. The unreadable-save warning then points at it instead of saying the first change will overwrite it. That closes the "first change you make will overwrite it" loss. |
| One copy, not two | An update archive is taken only when the saved text **is a usable plan**. Unreadable text is already covered by the rescue, so it is never archived twice, and an update archive can always be restored. |
| When an archive is taken | On the first open of a new `APP_VERSION` with a usable saved plan, once per version. It is **the first write at boot**, share-link opens included, because a copy is always harmless. A **downgrade** (the marker is newer than the running version) is archived too: an older build is about to rewrite newer data. No archive is taken on a first-ever open. |
| Restore from an archive | Its own act, `archive-restore`, with the `confirmTwice` key `archive:⟨t⟩`. The entry is looked up **by `t`** at click time, never by index, and `Store.parseImport` must accept the text at draw time and again on the click. The screen is backed up first, and that backup **must succeed**. Rows show what's in the archive (routes, cars, drivers, templates, date) before anything is replaced. |
| How the version reaches Store | `Store.init(defaults, render, APP_VERSION)`. `readLocal` needs it for the rescue entry. Item 3 takes the version as a parameter, so it doesn't depend on item 5. Rescue entries carry `to: null`. |
| How the note is shown | A notice of a new kind, `update`, with no offer button, only ✕. It isn't a `<dialog>`, which would stack on the share dialog a `#d=` link opens at boot. `#notices` is hidden in print. |
| Who sees the note | See Design C. A first-ever open is recognised first, even when it arrives by a `#d=` link: the marker is written and nothing is shown. After that, a **held** load (unreadable save, newer-version save, or a `#d=` link) sees nothing and writes nothing, and the note comes on the next clean open. A save-file hold (0.2.5) is not a note hold. |
| Which entries show in full | Every unseen entry marked **`must: true`** is shown in full. That flag is required whenever `data` is not `Nothing in your saved plan changes.`, or `affects` says the printed sheet or share codes change. The rest fills up to three with the newest, then a count. What's new keeps the `affects` line of every `must` entry. This matters because `dev` reaches `main` in one go, so users skip versions. |
| When a note counts as seen | When it is shown, not when it is dismissed. |
| Per-browser marker | `carcoord:pref:seenUpdate` through a new `Store.pref` / `Store.setPref`. It is never on `state` (the meta write, app.js:1166), so it never reaches Export, the save file or share codes. 0.2.5's `carcoord:pref:fileNeedsCheck` moves onto the same functions under the same key. |
| The running version | `const APP_VERSION = '0.3.0';` in `docs/app.js`, declared exactly once. Script and stylesheet tags carry `?v=⟨APP_VERSION⟩`. This protects only from the first versioned `index.html` onward: a cached 0.2.x `index.html` can still pair new and old files once, which Boot safety covers. |
| Boot safety | Two separate try/catches, **one around the archive step alone and one around the note step alone**. Recovery, `checkFileAtStart`, `noteFileHold`, `dailySnapshot` and the offers stay outside both, exactly as in 0.2.5, so a failure in the new code can never switch off 0.2.5's save-file protection. `typeof` guards go on every new Store function and on `UPDATES`. `hold` fails closed: if it can't be computed, it is true. `render()` guards every read of the new pieces, and the What's new and Archives cards fall back to one line when a piece is missing. |
| First entries | `docs/updates.js` starts with 0.2.5 and 0.3.0. 0.2.5 never reached `main`, so users jumping from 0.2.4 must hear about it. |
| Release cadence | Any change to shipped files under `docs/` outside `docs/breadify/` cuts at least a patch version with its own entry. Otherwise a changed file ships under an unchanged `?v=`. Each pack takes the next minor version. "Docs-only" means Markdown and manifests. Entries are never removed or renumbered. |
| Where notes and archives are read again | On the Data tab: **What's new**, then **Archives**, then Backups, which stays the last card (the owner's answer: above Backups). The new cards use no `<table>`. |
| Emergency page | `docs/recover.html` + `docs/recover.js`. They share no code with the app, carry the same CSP, and are read-only. The main `index.html` carries a **static** line in `#notices` saying "If this page stays empty, open the recovery page", which the first render replaces. It works without script, so it survives a broken `app.js` in the browser and in the Windows app. |
| Save-file sentence | Four variants (Design E). It is hidden in the Windows app until the owner confirms the picker works there, and hidden while a save-file hold is up. |
| Version guard | `scripts/versions.mjs`, run first in `npm test` and inside `scripts/check.sh`. |
| Saved-plan shape | Unchanged. `SCHEMA` stays 4, and nothing new goes into `carcoord:v1`. |

## Design

### A. Files and keys

**New files:**
- `docs/updates.js`
- `docs/recover.html` and `docs/recover.js`
- `scripts/versions.mjs`
- `scripts/upgrade.mjs`

**Changed:**
- `docs/store.js`, `docs/app.js`, `docs/index.html`, `docs/style.css`
- `scripts/check.sh`, `scripts/smoke.mjs`, `scripts/screens.mjs`
- `package.json`, `README.md`, the container manifest, and the version lines

| Key | Holds | Written |
|---|---|---|
| `carcoord:pref:seenUpdate` | newest version whose note this browser has shown (or marked on a first run) | at boot, Design C |
| `carcoord:pref:fileNeedsCheck` | 0.2.5's save-file marker, unchanged | as in 0.2.5, now through `Store.pref` |
| `carcoord:archives` | `[{ kind: 'update' \| 'rescue', from, to, t, text }]`, newest first | rescue: in `readLocal`; update: first write at boot |

For an update archive, `from` is the `seenUpdate` value, or `"0.2.4 or earlier"` when there's no marker, and `to` is `APP_VERSION`. A rescue has `from: null, to: null`.

### B. Store additions

- **`init(defaults, changed, version)`:** keeps `version` for `readLocal`.
- **`pref(name)` / `setPref(name, value)`:** every access in try/catch. 0.2.5's `needsCheck`, `markCheck` and `clearCheck` are rebuilt on these, with the same key and the same fail-closed behaviour.
- **`loadTrouble()`:** a flag set in `readLocal` when it queues the unreadable warning, or the data has `schemaVersion > SCHEMA`.
- **`savedText()`:** the raw `carcoord:v1` string exactly as `readLocal` read it, or null.
- **`archives()`:** the list, or `[]` on any failure.
- **`archive(entry)`:** tries `[entry, ...list]`, trimmed to three `update` entries and one `rescue`. On quota it drops the oldest `update` entry and retries, and it **never writes a list without `entry`**. If nothing fits, it leaves the key untouched. Returns `{ ok, dropped }`.
- **Rescue in `readLocal`:** when the stored text is not a usable plan, it archives `{ kind: 'rescue', text }`, unless the newest rescue already holds the same text. When that succeeds, the unreadable warning reads: `The data saved in this browser could not be read, so the plan on screen started empty. An untouched copy is kept in Archives on the Data tab; check Backups there too before relying on what is on screen.` When it fails, today's wording stays.

### C. Who sees what: pure functions next to `note()`

**`updateNoteFor({ version, releases, seen, firstRun, trouble, link })`** returns `{ show: { full: entries[], more: n }, mark: bool }`. The rules, in order:

1. `seen === version`: nothing.
2. `firstRun` (no saved text and nothing recovered): mark only. This comes before the link hold, so a first open by `#d=` link still marks.
3. `trouble` (unreadable or newer-version save): nothing, and the marker is left alone.
4. `link`: nothing, marker left alone. The note comes on the next ordinary open.
5. `seen` is numerically newer than `version` (a downgrade or a stale cached `app.js`): nothing.
6. `releases` is not an array, or `releases[0].version !== version` (a stale cached `updates.js`): nothing, no mark, retried next open.
7. Otherwise, the unseen entries are every entry when `seen` is null or not listed, else `releases.slice(0, i)`. Mark. **Full** means every `must` entry, filled up to three with the newest others; **more** counts the rest.

**`archiveNeeded({ version, usableText, archives })`**: true when the saved text is a usable plan and no `update` archive has `to === version`. It does not look at the marker, so a downgrade is archived too.

Inputs, computed inside the note's try/catch:
- `firstRun = Store.savedText() === null && !recovered`
- `trouble = Store.loadTrouble()`
- `link = /^#d=/.test(location.hash)`, read before `Share.readHash` clears it.

If anything throws, the note isn't shown and nothing is marked. `firstRun` is also kept in a module-level `let` for pack 9.

### D. Boot order in `start()`

1. `Store.init(defaults, render, APP_VERSION)`. Inside it, `readLocal` rescues unreadable text, and the renders during `init` drain its warnings into `notices`.
2. **try { archive }:** if `archiveNeeded`, `Store.archive({ kind: 'update', from, to: APP_VERSION, t, text: Store.savedText() })`. This is the first write at boot. A throw is logged with `console.warn` and nothing else changes.
3. Recover from the save file, or `checkFileAtStart`. As in 0.2.5, outside any new try.
4. `noteFileHold()`, then drain, as in 0.2.5.
5. `Store.dailySnapshot(state)`.
6. *(Pack 4's date move and its Keep notice.)*
7. Offers.
8. **try { note }:** `updateNoteFor`. If `mark`, `setPref('seenUpdate', APP_VERSION)`. Raise the note last.
9. `render()`, then the share-link block.

**`carcoord:v1` is never written at boot.** The only boot writes are the rescue, the archive, the markers and the daily backup.

### E. What the note says

The `text` is these sentences, in order:
1. `Car Coordinator has been updated to ⟨v⟩.`
2. The copy sentence, one of:
   - **archived now or already:** `Before anything else, your plan and setup (routes, templates, drivers, day groups, cars, positions, labels) were copied unchanged into Archives on the Data tab.`
   - **archive didn't fit:** `No copy could be put in Archives, because this browser's storage is full. Use Export on the Data tab to keep one.`
   - **the plan came from the save file (nothing saved here):** `Your plan was read from your save file, which this update did not change.`
3. The save-file sentence. It is left out in the Windows app until confirmed, and while a save-file hold is up. Otherwise:
   - **no file linked, picker available:** `To keep a copy of every change outside this browser, use Choose save file… on the Data tab.`
   - **no picker (Firefox, Safari):** `To keep a copy outside this browser, use Export on the Data tab.`
   - **linked and allowed:** `Changes are also written to your save file, ⟨name⟩.`
   - **linked but paused:** `Saving to ⟨name⟩ is paused; reconnect it on the Data tab.`
4. `✕ puts this away; What's new on the Data tab keeps every note.`

The `lines` hold three items for each **full** entry:
- `{head: "What's new in ⟨v⟩:", text: "⟨title⟩. ⟨changed⟩"}`
- `{head: "What it affects:", text: affects}`
- `{head: "Your data:", text: data}`

When `more > 0`, a plain line follows: `And ⟨N⟩ other updates, all listed on the Data tab under What's new.`

`renderNotices` accepts `{head, text}` lines. `.notice.update` pairs ink with hi-vis, echoing the top bar.

### F. The Data tab

The order is: Auto-save, This browser, Share, Your own copy, **What's new**, **Archives**, Backups (last). The new cards hold no `<table>`.

- **What's new:**
  - Starts with `You are running version ⟨APP_VERSION⟩.`
  - The newest three entries are shown in full. Older ones get one line each, `⟨v⟩ · ⟨title⟩. Your data: ⟨data⟩`, and a `must` entry also keeps its `affects` line.
  - If `UPDATES` is missing, the card shows only the version line.
- **Archives:**
  - Hint: `A copy of everything as it was just before each update, kept in this browser like Backups but never pushed out by them. Restore puts that whole plan and setup back, replacing everything changed since; what is on screen goes into Backups first. Download keeps the copy as a file you can Import later or send on.`
  - Update rows: `Before ⟨to⟩ (from ⟨from⟩) · ⟨when(t)⟩ · ⟨N⟩ routes, ⟨N⟩ cars, ⟨N⟩ drivers, ⟨N⟩ templates, dated ⟨date⟩`, with **Restore** (two clicks) and **Download**.
  - Rescue rows: `Could not be read · ⟨when(t)⟩`, with Download only.
  - Restore also gets `Could not be read` and no button if `parseImport` refuses the text when the row is drawn.
  - Downloads are named `car-coordinator-before-⟨to⟩.json`, or `car-coordinator-unreadable-⟨date⟩.json` for a rescue.
  - If `Store.archives` is missing, the card shows one line.
- **This browser:** gains `If this page ever won't start, recover.html downloads everything this browser holds.` as a link.

### G. Wording rules (the header of `docs/updates.js`)

- Write for a warehouse team leader, naming what is on screen exactly as the app shows it.
- Never use code words: storage, key, schema, JSON, migration, normalise, cache, localStorage.
- **`title`:** a few words.
- **`changed`:** what you will see or do differently.
- **`affects`:** which tabs are affected. Always say whether the printed sheet or share codes change. If an updated and a not-yet-updated PC behave differently, say so and say what to do.
- **`data`:** always present and exact. Either `Nothing in your saved plan changes.` or exactly what changes, and what an older copy of the app does with it. Never "might", and never more than the code guarantees: check every claim against the code.
- **`must`:** true whenever `data` isn't the "Nothing … changes" sentence, or the printed sheet or share codes change.
- Archives and backups live in the same browser as the plan. Never imply they survive clearing browser data, a different browser or a reinstall.
- No comfort words without the fact behind them.
- At most about 25 words per field. Say "this browser", never "this PC".

**0.2.5 entry** (`must: true`, because the printed sheet changes):
- **title:** `After a lost plan, your save file is read before it is written`
- **changed:** `When this browser has lost its plan, Reconnect reads your save file first and asks. Choose save file… asks before replacing a file that holds a plan. Switching tabs no longer saves.`
- **affects:** `The Data tab's save-file card. The printed sheet: the date is centred, with the weekday under it. Share codes are unchanged.`
- **data:** `Nothing in your saved plan changes. Whichever plan you replace goes into Backups first; a file that could not be read is replaced only after two clicks.`

**0.3.0 entry:**
- **title:** `A note like this after each update, and Archives`
- **changed:** `After each update, a note like this appears once. Your plan and setup are copied into Archives first, and What's new keeps every note.`
- **affects:** `This note, and What's new and Archives on the Data tab. The day plan, printed sheet and share codes are unchanged.`
- **data:** `Nothing in your saved plan changes. Before each update's note, an unchanged copy goes into Archives.`

### H. Process rule

Written identically in the `updates.js` header, the README and the container's Gates:

- Every change to shipped files under `docs/` outside `docs/breadify/` ends with **Announce ⟨what⟩ and cut ⟨version⟩**. In one commit it:
  - adds an entry at the top of `docs/updates.js`, with `must` set by rule G;
  - moves six places to the same version: package.json, package-lock.json (twice), src-tauri/Cargo.toml, src-tauri/tauri.conf.json and `APP_VERSION`.
- The `?v=` tags follow `APP_VERSION`, and `versions.mjs` fails the item gate if they don't.
- The walkthrough re-reads the entry against what shipped.
- The `dev` → `main` merge publishes Pages and builds release `v⟨version⟩`.

<details>
<summary><b>I. Who sees what</b></summary>

| Open | Archive | Note |
|---|---|---|
| First-ever open, also by `#d=` link | none | none; marker written |
| Returning 0.2.4 leader | update archive, raw text | shown last: 0.3.0 and 0.2.5 (both in full: 0.2.5 is `must`) |
| Unreadable save | rescue only, at load | held; comes on the first clean open |
| Save from a newer version | update archive (it parses) | held |
| Opened by a `#d=` link, with saved data | archived | held; the share dialog opens as today |
| Recovered from the save file (nothing saved here) | none | shown, with the "read from your save file" sentence |
| Second tab, or a reload | already archived | nothing |
| Downgrade (marker newer than running) | archived | nothing |
| New `app.js` + stale `updates.js` | archived | not yet; comes with the fresh file |
| Old cached 0.2.x `index.html` + new `app.js` (no `updates.js`, maybe an old `store.js`) | skipped if `Store.archive` is missing | skipped; the plan is drawn and the save-file check still runs |
| Storage full | written whole or not at all | "storage is full, use Export" |

</details>

## Items

- [x] **1. Version guard.** `scripts/versions.mjs` checks that:
  - the five existing version places agree;
  - the identifier is `no.m.carcoordinator`, with no scheme option;
  - once they exist: the `APP_VERSION` declaration appears exactly once and agrees; every local tag in `index.html` and `recover.html` carries `?v=⟨APP_VERSION⟩`; `updates.js` (read with `vm`) has unique, strictly descending versions (compared number by number), the newest equals `APP_VERSION`, and `must` is set wherever rule G requires it.

  It runs first in `npm test` and inside `check.sh`.
  *Done when:* both pass at 0.2.5. A tried (not committed) mismatch in `tauri.conf.json` fails both and names the file. 0.10.0 above 0.9.0 passes, and the reverse fails.
- [ ] **2. Store: prefs, load trouble, saved text, version.**
  - `Store.pref` / `setPref`, with 0.2.5's marker rebuilt on them (same key).
  - `loadTrouble()`.
  - `savedText()`.
  - `init(defaults, changed, version)`.
  *Done when:* smoke shows all of these:
  - a pref round-trips, and an Export has no pref;
  - `loadTrouble()` is false on a first run and on good data, true for the corrupt save (smoke.mjs:270) and the `schemaVersion: 99` save (:333), and false after importing newer data;
  - `savedText()` returns the stored string byte for byte, `'{not json'` included;
  - every 0.2.5 save-file case passes unchanged.
- [ ] **3. ⚠️ Archives in the Store, and the rescue.** `archives()`, `archive(entry)` written whole or not at all, and the rescue in `readLocal` with its new warning wording (Design B).
  *Done when:* smoke shows all of these:
  - an update archive's `text` is byte-identical to the stored `carcoord:v1`;
  - a fourth update archive drops only the oldest update archive, and the rescue survives;
  - an unreadable save is rescued at load, the warning names Archives, and the first change afterwards leaves the rescue intact;
  - with real quota filled (the technique at smoke.mjs:1862-1875) and two update archives stored, a new archive that doesn't fit leaves `carcoord:archives` byte-identical, and `carcoord:v1` and the Backups too;
  - twelve new backups leave every archive in place.

  **Risky: review individually.** It is the fail-safe itself.
- [ ] **4. Who sees what, as pure functions.** `updateNoteFor` and `archiveNeeded`, per Design C.
  *Done when:* smoke drives both with hand-made lists, covering:
  - every rule;
  - a first open by link, which marks;
  - trouble ahead of the link;
  - a 0.9.0/0.10.0 pair;
  - a stale list;
  - `must` entries shown in full beyond three;
  - a downgrade: no note, but an archive;
  - localStorage byte-identical throughout.
- [ ] **5. Release notes, running version, 0.3.0.** In one commit:
  - `docs/updates.js`, with the Design G header and both entries;
  - `APP_VERSION`, and `Store.init` given it;
  - the script tag;
  - `?v=0.3.0` on every local tag in `index.html`;
  - the five places bumped;
  - `versions.mjs` requiring all of it.

  *Done when:* `versions.mjs` passes at 0.3.0 and fails with any piece removed, and smoke reads `UPDATES[0].version === APP_VERSION` with no console errors.
- [ ] **6. Notice lines with a heading, and the update style.**
  *Done when:* a synthetic update note with `<b>` in it is escaped, its heading is bold, and ✕ removes it. Every existing notice case passes unchanged.
- [ ] **7. ⚠️ Wire the start-up.** Design D and E, with the two separate try/catches and the render guards.
  *Done when:* smoke shows all of these, reading the version from the page:
  - **Returning leader** (saved plan, no marker): exactly one `.notice.update`, last, with 0.3.0 and 0.2.5 in full. One update archive, byte-equal to `carcoord:v1`. The marker set. `carcoord:v1` byte-identical across the load.
  - **No note, no new archive:** a second open; a first run (nothing at all); a first run plus one change and a reload.
  - **Downgrade (marker `9.9.9`):** no note, and one archive.
  - **Held loads:** a corrupt save gets a rescue only, no note and no marker; a newer-version save gets an archive, no note and no marker. The note comes after the corrupt save is overwritten and the page reloaded.
  - **Share link:** a returning browser opened by a `#d=` link gets no note, and the share dialog opens. A first open by link marks.
  - **Save-file sentence:** present with no file linked; says Export when `showSaveFilePicker` is deleted; absent under `window.__TAURI__`; absent while a save-file hold is up.
  - **Storage full:** the archive doesn't fit, and the note says so.
  - **Isolation:** with `Store.archive` made to throw, a save-file hold is still raised at start-up and nothing is written to the file (the 0.2.5 stand-in).
  - **Missing pieces:** with `UPDATES` removed and `Store.archive` / `Store.pref` missing, the plan is drawn, the Data tab opens, and there are no console errors.

  **Risky: review individually.** It changes the boot order on every returning leader's first open.
- [ ] **8. What's new and Archives on the Data tab.** Design F, with `archive-restore` keyed by `t`.
  *Done when:* smoke shows all of these:
  - both cards sit above Backups, which is still `.card:last-child`, and smoke.mjs:964 and :1040 pass unchanged with a rescue present;
  - What's new shows the version and the newest entry's four parts;
  - an update row shows its summary;
  - **Restore** takes two clicks, backs up first and brings the old plan back;
  - with Backups full, Restore does nothing and says why;
  - arming a Backups row and then clicking an Archives row doesn't restore;
  - **Download** equals the archive text byte for byte and imports to the same plan;
  - a rescue row offers Download only;
  - an update archive holding `[]` shows no Restore.
- [ ] **9. The emergency page.** `recover.html` and `recover.js`, plus the static line in `index.html`'s `#notices` and the links (This browser card, unreadable warning, README).
  *Done when:* smoke shows all of these:
  - `recover.html` lists the plan, backups and archives keys, and downloads each byte for byte;
  - with `app.js` made to throw, the main page shows the static line, and it leads to `recover.html`, which still works;
  - after a normal start the static line is gone.
- [ ] **10. Screenshots.** Capture the note, the Data tab's new cards, the static line (with `app.js` blocked) and `recover.html`.
  *Done when:* `npm run screens` writes them with no console errors.
- [ ] **11. The upgrade check as a script.** `scripts/upgrade.mjs ⟨old-checkout⟩` uses:
  - a fixed port and a persistent profile per scenario;
  - the old build first, then this one;
  - a build assertion first on every load.

  Each scenario has its own expectations:
  - **(a) full setup, and (d) linked save file:** `carcoord:v1` and Backups byte-identical on open; one update archive equal to the old `carcoord:v1`; one note with 0.3.0 and 0.2.5 in full; a reload shows no note.
  - **(b) unreadable save:** a rescue equal to the old text, no update archive, no note and no marker. After one change and a reload, the note.
  - **(c) first run:** no archive, no note, marker written.
  - **(e) old cached `index.html` with the new `app.js`:** the plan is drawn, no console errors, and the save-file check still runs. The archive and the note come on the first fully fresh open.

  *Done when:* it passes from `v0.2.4` (a worktree) and from the previous `dev` build, and fails its build assertion when pointed at this build. It is added as `npm run upgrade -- ⟨dir⟩`.
- [ ] **12. Write the process rule down.** Design H goes into the README, the container's Gates and the `updates.js` header. The container's **Opening the app** section is updated to Design D, and its reference to the meta write is corrected to app.js:1166.
  *Done when:* the three places say the same thing, and the container matches Design D.

## Owner questions

**Answered:**
- Notes live in a What's new card on the Data tab, above Backups.
- The identical-backup question no longer arises.

**Still open, and it blocks nothing:** does **Choose save file…** work in the Windows app? The web version is covered.

## Out of scope

- A modal for the note, or buttons inside entries.
- Breadify.
- Syncing "seen" or archives between browsers or the exe.
- Archiving Backups.
- Tauri's app API.
- Generated notes or release bodies.
- A version label in the top bar.
- The tour.
- A render during `Store.init` shows placeholder rows before `start()` assigns the plan. That is pre-existing and noted in the container.

## Gates

- **Item gate:** `scripts/check.sh` (with `versions.mjs` from item 1), plus the targeted smoke run `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car` when logic is touched. `cargo check` needs CI's generated icons, so the version guard stands in for it.
- **Pack gate:** `CHROMIUM_PATH=/usr/bin/google-chrome npm test`, `npm run screens`, and `npm run upgrade` from v0.2.4 and from the previous `dev` build. Say that the suite ran on system Chrome.
- **Review:** items 3 and 7 individually, plus one pass for the rest.
- **Browser walkthrough before the PR into `dev`:**
  1. Import the dev fixture and change one thing.
  2. Remove `carcoord:pref:seenUpdate` and reload. The note is last, and 0.3.0 and 0.2.5 are shown in full.
  3. On the Data tab, the archive's summary matches. Restore it (two clicks, backup first), and Download it.
  4. `recover.html` downloads everything.
  5. Reload: no note. A fresh profile: no note, no archive. A `#d=` link: no note, and the dialog opens. Print preview: no note.
- **At pack close:** `INVENTORY.md` gains `✅ Update note and Archives` under Data, and the container's 🚧 line is updated.

## Ledger

- **2026-09-29, plan review before building.** An independent review ran three lenses (data safety, fit with the code, wording), and each finding was put to a refuter. 33 findings; 25 confirmed, 8 refuted. All 25 are applied above:
  - **Boot safety:** two separate try/catches and render guards. The reviewers showed experimentally that one wide try/catch let a failure in the archive code switch off 0.2.5's save-file protection, and a keystroke then overwrote the file.
  - **One archive per unreadable save.** Restore only for text that parses; rows show a summary; Restore keyed by `t`.
  - **Honest 0.2.5 wording:** Reconnect reads first only after a loss.
  - **`must` entries** always shown in full, because users jump several versions at once.
  - **A static recovery link,** which survives a broken app, in the exe too.
  - **Smaller fixes:**
    - the version is passed into `Store.init`;
    - `archive()` writes whole or not at all;
    - per-scenario expectations for the upgrade script;
    - first open by link counts as a first run;
    - downgrades are archived;
    - no `<table>` in the new cards;
    - an Export variant for browsers with no picker;
    - the rescue-aware warning;
    - the cadence covers every shipped change;
    - the stale `app.js:1134` reference is corrected.
- **2026-09-29, building (pack-implementer, on `update-note`).** Decisions taken while building, each safe and each flagged in the report:
  - **`archiveNeeded` also takes `seen`, and is false when `seen === version`.** Design C says it ignores the marker, but then "a first run plus one change and a reload" (item 7) would be archived. With the extra rule every row of Design I still holds: a downgrade (`9.9.9`) is still archived, and a held load or a stale `updates.js` is archived once, because `to === version` dedupes.
  - **`screens/` is gitignored and untracked** (`.gitignore`: "generated screenshots"; CI uploads it as an artifact). Item 10 commits `scripts/screens.mjs` only, and the pictures stay local.
  - **Upgrade scenario (e)** serves the old `index.html` *and* the old `store.js`, `share.js`, `qr.js` and `style.css`, with the new `app.js`. Only then do "no archive on the mixed open" and "the archive comes on the first fully fresh open" both hold.
  - **`scripts/serve.mjs`** gains an optional `root` for item 11, which is not in Design A's list.
- Item 1 done, bd7bf31. `scripts/versions.mjs`, run in `check.sh` and first in `npm test`. Gate: `check.sh` CHECK OK ("the five version places agree at 0.2.5", "the identifier is no.m.carcoordinator, with no scheme option"). Tried and reverted: `tauri.conf.json` at 0.2.6 fails both `versions.mjs` and `check.sh`, naming `src-tauri/tauri.conf.json`. In a scratch copy at 0.10.0, `updates.js` listing 0.10.0 above 0.9.0 passes, and the reverse fails.
