# Pack: Printed sheet cleanup

**Status:** 🚧 building, since 2026-09-29, as part 2 of the combined pack (`manifests/2026-09-29-review-round-build.md`). Item list and both owner questions approved.
**Date:** 2026-09-29. Planned against `dev` at 73dd734, before pack 1 merged.
**Branch:** cut when execution starts: `sheet-cleanup`, from `dev` after pack 1 has merged into `dev`, and merged back into `dev` through a PR (the container's Branch line).

## Goal

The printed sheet shows the plan and nothing that argues with it.

- **On paper:** the date and weekday, then the route table with its pink rows and gap lines. Under it come two lists, **Cars not available** and **Free cars**.
- **Gone from paper:**
  - the QR code;
  - "Check before posting";
  - the "!" marks and dotted underlines;
  - "Positions not available".

  The screen keeps every warning and stripe, because warnings belong before printing.
- **A new tick, Show on printout,** on each row of the Labels tab. Cars not available lists only parked cars whose label is ticked. Every existing label arrives unticked, so the list is empty until the leader ticks the labels they want printed.
- **The Data tab** loses the QR switch. Share codes and share links work as before, including links on sheets already printed with a QR.
- **Nothing is lost on update.** The saved plan gains the tick (schema v5). The conversion happens in memory, and `carcoord:v1` is not written until the leader's first real change.
- The first open after the update shows the 0.4.0 note in full. The pack ends with **Announce Printed sheet cleanup and cut 0.4.0**.

## Agent brief

**Every line number here is against `dev` at 73dd734 and must be re-checked before item 1.** Pack 1 moves code in `docs/store.js`, `docs/app.js`, `docs/index.html`, `docs/style.css`, `scripts/smoke.mjs`, `scripts/screens.mjs`, the README and the container.

There is no `CLAUDE.md` at the repo root. Conventions come from `HANDOFF.md`, the code and the container. One agent does the items in order. Items 1, 2 and 4 all edit `renderSheet`.

Read first:
1. **This manifest,** starting with Saved data.
2. **The container**, `manifests/2026-09-28-review-round.md`: its Branch line, its Rules every pack follows, and pack 2's **Decided**.
3. **Pack 1**, `manifests/2026-09-28-update-note.md`:
   - Design C (who sees the note), D (boot order), G (wording rules) and H (process rule);
   - item 11 (the upgrade script and its scenario (e));
   - its Ledger, for anything built differently from its plan.

Then the code:
- **`docs/store.js`:**
  - `bool` (:14), which is `v === true`.
  - `normalise` (:21-142): the labels whitelist is at :37-39, `qrOnSheet` at :139 and the returned shape at :141.
  - `migrate` (:148-169): the newer-version warning is at :150-154 and the version comment at :155-167.
  - `reconcile` (:429-439) converts the screen before comparing (:435). `readable` and `samePlan` (:552-559) compare every field generically.
  - `SCHEMA` is exported (:574).
- **`docs/app.js`:**
  - `defaults()` (:88-111): `qrOnSheet` is at :93 and the three first-run labels at :98-102.
  - `listFor` (:122), `usage` (:163), `problems` (:295) and `liveSig` (:336).
  - The rail's free count (:492), the Cars tab counts (:889-891) and the Cars hint (:900).
  - The Many cars checkbox (:914), which is the pattern to copy.
  - `renderLabels` (:928-942), with its hint at :935.
  - `spotCell` (:1085) and `renderSheet` (:1087-1123).
  - `render` (:1125), with `queueQr()` at :1135.
  - The input handler (:1143-1177), with the meta write at :1166.
  - `doPrint` (:1262-1270) and the QR block (:1272-1299).
  - `renderShare`'s QR paragraph (:1318-1323).
  - share-apply (:1381-1391), which saves `Share.apply`'s output without normalising it.
  - Open an existing file… (:1458-1461), backup Restore (:1466-1471) and `applyImport` (:1632-1638).
  - The `toggle` act (:1675), add-tag (:1694-1701), deleting a label (:1713) and add-label (:1890-1892).
- **`docs/share.js`:**
  - `l` rows are `[name, color]` (:71).
  - Applying labels (:175-181): an existing label only gets its colour changed (:178), and a new label is added at :179.
- **`docs/index.html`:** the CSP (:14) and the `qr.js` tag (:65).
- **`docs/style.css`:**
  - `.grid tr.warn` (:71) is on screen and stays;
  - the sheet's warning rules (:332-335);
  - the QR rules (:337-340);
  - the 760px comment (:352-354), and `.sheet .qr` inside that query (:362).
- **`scripts/smoke.mjs`:**
  - `planA` (:504);
  - the export schema check (:262);
  - the QR decode block (:559-604);
  - a `#d=` link (:666-675);
  - the clash sheet (:842-861) and the per-round sheet check (:889);
  - phone width (:1784-1802);
  - save-file case 6 (:2112-2120).
- **`scripts/screens.mjs`:**
  - the cars step (:39-51), with its fill at :41;
  - the labels step (:53-59), and AA55555 tagged at :63;
  - the routes (:110-119);
  - the expected warnings (:143-148) and the rail count (:160);
  - the printout wait (:214).
- **`.github/workflows/build.yml:17-20`:** CI runs `npm ci`, `npm test` and `npm run screens`.
- **`scripts/fixtures/dev-data.json`:**
  - schema 4, `qrOnSheet: true`, five labels;
  - BT 55241 (Workshop) is on a route;
  - ZH 90417 (Out of service) and ZH 90433 (Unavailable) are parked;
  - ZH 90458 and EL 41090 are free.
- **`jsqr`** is at `package.json:17` and `package-lock.json:12` and :233-239.

Reuse:
- the generic input path for the tick, so no new handler is needed;
- `usage()` for the lists;
- `byId`, `esc` and `field`;
- pack 1's `scripts/upgrade.mjs`, `scripts/versions.mjs` and `docs/updates.js`, as they were actually built.

Dependency edges:
- **Pack 1 must be merged into `dev`.** This pack uses:
  - `APP_VERSION` (0.3.0);
  - `docs/updates.js` with the Design G header;
  - `versions.mjs`, run inside `check.sh`;
  - `upgrade.mjs`;
  - the `?v=` tags;
  - Archives;
  - `loadTrouble`, which keys on `SCHEMA` and so follows the bump by itself.
- **The owner's two answers are needed before item 4.** Items 1–3 don't depend on them.
- **`npm uninstall jsqr`** must be able to rewrite `package-lock.json`. Running `npm ci` afterwards is the check.
- **System Chrome** at `/usr/bin/google-chrome`, plus two worktrees for the old builds: `v0.2.4` and the previous `dev` build.
- **Pack 3 (dark mode)** comes after this pack, so the sheet CSS removed here is never converted.
- **Pack 8** needs `onSheet` to be a plain true/false value on labels, so the `toggle` act can flip it.
- **Pack 9** puts `tour.js` directly before `app.js`, and assumes the `qr.js` tag is gone.

**Before item 1** there is one docs-only start commit:
- this manifest;
- `INVENTORY.md`'s two Considered lines (:83-84) become one 🚧 pointer under Printing, naming this manifest;
- the container's pack 2 row names this manifest, and its status line says pack 2 is in progress.

## Saved data

**Migration plan, written before any code.** Schema 4 → 5.

**What changes in the saved shape**
- Each label gains `onSheet`, true or false. A missing value, or anything other than `true`, means unticked.
- `qrOnSheet` is always written as `false`, and it stays in the shape permanently. Every build from v0.1.0 to 0.3.0 reads a *missing* `qrOnSheet` as on (checked on each tag), so dropping the field would turn the QR back on in every older copy.
- `schemaVersion` becomes 5.
- Nothing is removed or renamed.

**How it converts**
- Only in `normalise`, in memory, on every path that reads saved data:
  - load;
  - backup Restore and archive Restore;
  - Import and Open an existing file…;
  - the save-file read and check.
- `normalise` already turns a missing field into its default for v0–v4, so `migrate` needs no new branch. The bump is for the other direction: an older build that meets v5 data shows its "saved by a newer version" warning first.
- No repair notice for either field. The 0.4.0 note explains the change.
- **No write at boot.** `carcoord:v1` keeps its old text, byte for byte, until the first real change. Only then is it written as v5, with `onSheet: false` on every label and `qrOnSheet: false`.

**Who holds the old shape, and what happens to it**
1. **`carcoord:v1` in every existing browser** (v4 or older) reads as every label unticked and the QR off. It becomes v5 on the first change.
2. **Backups (`carcoord:backups`):**
   - Entries from before the update stay as old text.
   - Restoring one replaces the whole plan, so every tick goes off.
   - The first 0.4.0 open's "Start of day" backup is v5. It is only taken if none was taken that day.
3. **Pack 1's Archives:**
   - The update archive taken on the first 0.4.0 open holds the v4 text, byte for byte.
   - A user coming from 0.2.4 gets one archive, labelled "from 0.2.4 or earlier".
   - Restore goes through `parseImport` → `migrate`, and so does Download followed by Import. Both give every tick off and the QR off.
4. **Files outside the browser:**
   - A linked save file stays v4 until the next write, then becomes v5.
   - Exports, archive downloads and `recover.html` downloads keep the version that wrote them. They import as in point 3.
5. **The Windows app** has its own storage and runs its own old version until it is reinstalled. An installed 0.4.0 follows the same path as the web.
6. **Repo fixtures:**
   - `scripts/fixtures/dev-data.json` stays schema 4 with `qrOnSheet: true`. It is the old-shape input for the upgrade check.
   - The smoke tests' v1–v4 fixtures keep loading as they are.

**What a returning user sees on the first 0.4.0 open**
- One new archive, and the note last, with 0.4.0 in full (`must`). A 0.2.4 user sees 0.4.0, 0.3.0 and 0.2.5, all in full.
- **Printed sheet:**
  - no QR, even if the switch was on;
  - no warnings, marks, dotted lines or "Positions not available";
  - Cars not available is empty until a label is ticked;
  - parked cars with a label are on neither list (owner question 1);
  - Free cars is unchanged.
- **Labels tab:** a new Printout column, all unticked.
- **Data tab:** no QR switch.
- No repair notice.
- No save-file question. Both sides are converted before they are compared (`reconcile`, store.js:435), so a v4 file of the same plan counts as the same plan.

<details>
<summary><b>Two copies on different versions</b></summary>

- **Share codes:**
  - The format is unchanged in both directions.
  - The tick is never sent: share.js:71 stays `[name, color]`.
  - On arrival, existing labels keep their own tick, because share.js:178 changes only the colour. New labels arrive unticked.
- **A v5 plan in a build from 0.2.3 on** (0.2.3 to 0.3.0, including the Windows app):
  - It shows its "saved by a newer version" warning at load. Every release has it.
  - It loads everything except the ticks. The QR stays off, because it reads `qrOnSheet: false`.
  - It leaves the ticks out of whatever it saves next.
  - **Import and Open an existing file… save at once** (v0.2.4 app.js:1559-1560; dev app.js:1636-1637 and :1458-1461). So the warning and the loss of the ticks from that copy arrive together, not at a later change.
  - Its own QR switch can turn the QR back on there. v5 ignores that on its next load.
- **Builds before 0.2.3** (v0.1.0 is schema 1; v0.2.0–0.2.2 are schema 3) warn the same way. They also drop what later versions added, exactly as they already do with v4 data: driver tags and notes, and in v0.1.0 drivers, day groups and templates too.
- **An older Export imported into v5** replaces the whole plan, so every tick goes off.
  - Import *tries* to take a backup first (app.js:1635) but ignores whether it worked. With storage full, it goes ahead without one.
  - This is pre-existing, and backup Restore does the same (:1471). Item 5 adds it to the container's Found while planning.
  - Nothing in this pack relies on that backup.
- **A save file shared through OneDrive:** the last writer wins, as before. When an older build writes the file, the ticks are dropped from the file only. v5 reads the file only on recovery or check.
- **A tab left open from before the deploy:**
  - There is no `storage` listener, so its next change writes v4 over v5 with no warning, dropping ticks set in a newer tab.
  - This predates the pack and affects all data.
  - It is not fixed here, and the note promises nothing about it.
</details>

<details>
<summary><b>The newer-version path, and rollback</b></summary>

- **0.4.0 meeting v6 or later:** the same warning as today, and pack 1's `loadTrouble` holds the note.
- **0.3.0 meeting v5:**
  - It warns and holds its note.
  - It archives the v5 text only if it has no `to: '0.3.0'` archive yet, because pack 1 dedupes. A copy on downgrade is therefore **not guaranteed**, and nothing may claim one.
  - 0.4.0's backups hold the ticks, but restoring them in 0.3.0 drops the ticks.
- **Rollback:** if 0.4.0 is withdrawn:
  - an older build loses the ticks;
  - every plan saved by 0.4.0 has the QR switched off there, and the leader can switch it back on;
  - the rest of the setup is unchanged.
</details>

## Decisions taken

| Decision | Choice |
|---|---|
| Where the tick lives | `onSheet` (true/false) on each label, on `state`. It is part of the setup, not a per-browser choice, so it is never a `carcoord:pref:*` key. It travels in Export, the save file, Backups and Archives, but **not in share codes** (owner, container pack 2 Decided). |
| Existing labels | They arrive **unticked**, so Cars not available is empty until the leader ticks labels (owner). |
| The tick's default everywhere | One rule, unticked, however a label arrives: a missing field, Add label (app.js:1891), the rail's Add tag (:1697), a share code (share.js:179) and the three first-run labels (`defaults()` :98-102). Each of these writes `onSheet: false` explicitly. The earlier draft asked the owner whether first-run labels should start ticked. That is now a decision, to keep owner questions to two, because it only affects a fresh install. Changing it later is one line in `defaults()` plus item 3's case (e). |
| Reading the tick | Always `label.onSheet === true`, through one helper, `printsOnSheet(labelId)`, beside `spotCell`. It does not rely on `normalise` alone: share-apply saves `Share.apply`'s output raw (app.js:1381-1385), and add-label and add-tag push raw objects. |
| `qrOnSheet` | Always `false`. It is forced in `normalise` (store.js:139) and in `defaults()` (app.js:93), and kept in the shape permanently, because every build from v0.1.0 to 0.3.0 reads a missing value as on (container). |
| Repair notice | None, for either field. The 0.4.0 note is the explanation. |
| Boot writes | None added. `carcoord:v1` becomes v5 only on the first real change (container: never written at boot). |
| Free cars | The rule is unchanged: `!c.labelId && !use.cars[c.id]` (app.js:1102). A parked car with an unticked label is therefore on neither list. **Pending owner question 1.** The earlier draft settled this without asking. The feasibility review asked for it to go to the owner, which it now does, with this rule built as the recommendation. |
| Cars not available | The label is ticked **and** the car is not on a route. This matches the Cars tab's "parked and marked" count (:890) and the rail. **Pending owner question 2.** |
| Positions and drivers | "Positions not available" goes entirely (owner), and driver labels were never printed. So the tick only affects cars, even though cars, positions and drivers share labels. |
| Tick UI | A Printout column on the Labels tab, holding `<label><input type="checkbox" data-kind="label" data-id="…" data-field="onSheet"> Show on printout</label>`. This is the Many cars pattern (app.js:914) through the generic input path (:1143-1177). Because the value is a plain true/false, the `toggle` act (:1675) can also flip it, which pack 8 needs. |
| Mixed cached files | The Printout column is drawn only when `Store.SCHEMA >= 5`. A cached 0.2.x `index.html` can pair the new `app.js` with the old `store.js`. That session would save ticks under schema 4, and an older build would then drop them without its warning. The data-safety review offered this guard or accepting the risk; the guard is one line, so it is taken. |
| Screen warnings | Unchanged: the `.problems` box, the row stripes (style.css:71) and `liveSig` (owner). Only the sheet loses them. |
| QR removal scope | Exactly the container's list, with the line numbers re-checked. `jsqr` is removed with `npm uninstall jsqr`, never by hand, because CI runs `npm ci`. These stay: `Share.linkFor`, Copy as a link, `Share.readHash` and `#d=` links (so sheets already printed keep working), the 760px layout and its test (with comments reworded to cite share links), and README:16. |
| Release | 0.4.0, the next minor version after pack 1's 0.3.0. The entry is `must: true`, because the saved plan and the printed sheet both change (rule G). |
| How the note describes older copies | "Older copies keep the QR off and drop the ticks when saving." The data-safety review proposed "leaves the ticks out of anything it saves", and the feasibility review "drops the ticks when it next saves". Both are exact, so the shorter one is taken. "Warns" is left out of the note, because a tab left open from before the deploy never warns. |
| Upgrade check | The allowed differences on open are named: `schemaVersion` 4→5, `qrOnSheet` → false, and every label gains `onSheet: false`. The container's close-out list leaves out `schemaVersion`, and item 5 adds it. |
| Save-file case (g) | Dropped. Once `SCHEMA` is 5, the existing case 6 (smoke.mjs:2112-2120) already compares a v4 file with a v5 screen with the marker set. Item 3 requires it to keep passing unchanged. |
| INVENTORY | Edited only twice: the start commit places the 🚧 pointer, and pack close writes the ✅ entries. It is not in item 5, which would otherwise turn the shipped ✅ Labels entry into 🚧. |
| Upgrade runs | Item 6 is done against v0.2.4 only. The run from the previous `dev` build waits for the pack gate after item 7. Until item 7, both builds are 0.3.0, so pack 1's scenarios (a) and (d) would see no version jump. |

## Design

### A. The printed sheet after this pack

- The date and weekday, then the four-column table with pink rows (`tr.hl`) and gap lines (`tr.spacer`).
- Under the table, only:
  - **Cars not available:** `REG: Label (note)`, printed the way `marked()` prints it today (app.js:1099-1100), for the cars chosen in Design C;
  - **Free cars**, unchanged.
- Gone from the sheet:
  - the `.qr` div (:1116);
  - "Check before posting" (:1118);
  - "Positions not available" (:1104, :1120);
  - the `warn` class (:1092) and the `!` mark (:1093);
  - the call to `problems()` (:1089). `usage()` stays, for the lists.
- The screen is untouched.

### B. The tick

- **Field:** `onSheet` on each label.
- **Reading it:** `printsOnSheet(labelId) = byId(state.labels, labelId)?.onSheet === true`.
- **Writing `onSheet: false`** at all four places a label is created: `defaults()`, add-label, add-tag and share.js:179.
- **Labels tab:**
  - The columns become Name, Colour, **Printout**, then the buttons.
  - The Printout column is drawn only when `Store.SCHEMA >= 5`.
  - Each cell holds the checkbox, with `${l.onSheet === true ? 'checked' : ''}`, and the words Show on printout.
- **Labels hint (:935):** `These become the one-click buttons on cars, positions and drivers. Tick Show on printout to list a label's parked cars under Cars not available on the printed sheet; a parked car whose label is not ticked is on neither list.`
- **Cars hint (:900):** `Click a label to mark a car. Marked cars still appear in the day plan, but picking one shows a warning. A parked car is listed on the printout when its label has Show on printout ticked, on the Labels tab.`
- Both hints follow the owner's answers (see Owner questions).

### C. The lists under the table

- **Cars not available:** `state.cars.filter((c) => c.labelId && printsOnSheet(c.labelId) && !use.cars[c.id])`. The last condition is owner question 2.
- **Free cars:** unchanged (:1102). Owner question 1 would change it.

### D. Removing the QR code

**Goes:**
- `docs/qr.js`, all of it.
- Its tag, `index.html:65`, which carries `?v=` after pack 1. The CSP (:14) is unchanged.
- In `app.js`:
  - the `.qr` div (:1116);
  - `queueQr()` in `render` (:1135);
  - `clearTimeout(qrTimer)` and `await refreshQr()` in `doPrint` (:1263-1264), so `doPrint` becomes `renderSheet()` then print;
  - the QR block (:1272-1299): `qrCache`, `qrTimer`, `qrUsable`, `refreshQr` and `queueQr`;
  - `renderShare`'s QR paragraph (:1318-1323), including the switch and `qrCache.error`.
- In `style.css`: the `.sheet .qr` rules (:337-340), and the one inside the 760px query (:362).
- `jsqr`, via `npm uninstall jsqr`.
- The smoke decode block (:559-604).
- `README.md:29`.

**Reworded:**
- The 760px comment (style.css:352-354) and smoke :1784-1785 cite share links instead of the QR.
- The screens wait (:214) becomes `#sheet table`. Otherwise it times out after 30 seconds and fails CI.

**Stays:**
- `Share.linkFor` (share.js:255) and Copy as a link;
- `Share.readHash` and `#d=` links;
- `Share.encode`;
- the 760px query and the phone-width test;
- `README.md:16`.

### E. The saved shape (schema v5)

- `store.js:9`: `SCHEMA = 5`.
- `store.js:37-39`: add `onSheet: bool(l.onSheet)`.
- `store.js:139`: `const qrOnSheet = false;`, with a comment saying why the field is kept: every build from v0.1.0 to 0.3.0 reads a missing value as on.
- The `migrate` comment (:155-167) gains v5's reason: "a build without the tick meeting data that has it would drop it without a word, and `qrOnSheet` is fixed off so older builds keep the QR off".
- `app.js:93`: `qrOnSheet: false`. At :98-102, each first-run label gets `onSheet: false`.
- No repair line, and no write at boot. The full plan is under Saved data.

### F. Tests, by item

- **Item 1:**
  - The decode block becomes a "no QR anywhere" case on `planA`. That fixture has no `qrOnSheet`, so it drew a QR until now.
  - The screens wait becomes `#sheet table`.
- **Item 2:**
  - Smoke :842-861 flips to "the screen warns, the paper does not".
  - Its fixture gains `highlight: true` on r3, `gapBefore: true` on r2, an unlabelled unused car `c3` (CC33333), and a marked unused position `p3` (Spot 9, `labelId: 'L1'`).
  - None of these raises a screen warning: `problems()` (:295) warns about a marked position only when a route uses it.
  - :889 flips.
- **Item 3:**
  - :262 becomes `schemaVersion === 5`.
  - A new case block, (a)–(f), in its own browser context.
  - Save-file case 6 (:2112-2120) passes unchanged.
- **Item 4:**
  - A four-car smoke case.
  - The phone-width fixture (:1787-1796) gains a ticked label, so the loop (:1798) lays out a real Printout cell.
  - `screens.mjs` gains two parked cars and three assertions.
- **Item 6:** `scripts/upgrade.mjs`, as set out in the item.
- **Unaffected:** smoke :226-236, :484-486, :640-643, :747-749 and :1731-1752, and the v1–v4 fixtures.

## Items

- [x] **1. Take the QR code off.** Remove everything under "Goes" in Design D:
  - `docs/qr.js` and its tag;
  - the QR code in `app.js` and `style.css`;
  - `jsqr`, removed with `npm uninstall jsqr`;
  - the smoke decode block;
  - `README.md:29`.

  Make the Design D rewordings too: the 760px comment, the smoke comment at :1784-1785, and the screens wait (:214), which becomes `#sheet table`.

  One smoke case replaces the decode block, on `planA`, and checks:
  - `#sheet .qr` count is 0;
  - there is no `[data-field="qrOnSheet"]` on the Data tab;
  - `typeof QR === 'undefined'`;
  - there is no `qr.js` script tag.

  The saved `qrOnSheet` field is left for item 3. Nothing reads it after this item.
  *Done when:* all of these hold:
  - on `planA`, the sheet has no `.qr`;
  - the Data tab has no QR switch;
  - `window.QR` is undefined;
  - a `#d=` link still opens the share dialog (smoke :671);
  - the phone-width loop passes;
  - `npm ci` succeeds with `jsqr` gone;
  - `check.sh` and the car smoke pass.

- [x] **2. No warnings on the printed sheet.**
  - In `renderSheet`, drop the call to `problems()` (:1089), the `warn` class (:1092), the `!` mark (:1093), "Check before posting" (:1118) and "Positions not available" (:1104, :1120).
  - In `style.css`, drop `.sheet tr.warn td` with its comment (:332-334) and `.sheet .mark` (:335).
  - Cars not available stays as it is until item 4.
  - The screen is untouched: `.problems`, the stripes and `liveSig`.
  - Smoke changes are in Design F.

  *Done when:* with the clash fixture:
  - the Day plan still names the doubled car, the doubled spot and the Workshop car, and stripes three rows;
  - the sheet has none of those texts, and no "Check before posting", "Positions not available", Spot 9, `tr.warn`, `.mark` or "!";
  - `#sheet tr.hl` = 1 and `#sheet tr.spacer` = 1;
  - the sheet shows Free cars with CC33333.

- [x] **3. ⚠️ Schema v5: the label tick and a fixed-off QR in the saved plan.** Make the changes in Design E, plus `onSheet: false` at add-label (app.js:1891), add-tag (:1697) and share.js:179. share.js :71 and :178 are unchanged.

  Smoke :262 becomes `schemaVersion === 5`. A new case block, in its own context:
  - **(a)** A v4 save with `qrOnSheet: true`, and labels without the field, loads with every label unticked, `qrOnSheet` false, `schemaVersion` 5 and no repair notice. `carcoord:v1` is byte-identical across the load.
  - **(b)** After one real change, the stored plan is v5, with `onSheet: false` on every label and `qrOnSheet: false`. Everything else deep-equals the input plus that change.
  - **(c)** A v5 save with a ticked label keeps the tick through a reload, an Export and a re-Import.
  - **(d)** Restoring a v4 backup turns the tick off.
  - **(e)** A first run, Add label, Add tag, and an "everything" share code that brings a new label all give `onSheet: false`.
  - **(f)** An "everything" code encoded from a state with a ticked label has every `l` row of length 2. Applying a code that names an existing ticked label keeps it ticked and changes only its colour.

  *Done when:* (a)–(f) pass, save-file case 6 (:2112-2120) passes unchanged, and the full car smoke passes.
  **Risky — review individually.** It is the pack's only change to the saved shape. Existing data must convert with nothing written at boot, older builds must keep the QR off, and the 0.2.5 save-file check must not fire when nothing has really changed.

- [x] **4. The Show on printout tick, and Cars not available follows it.**
  - **Labels tab:** the Printout column (Design B), drawn only when `Store.SCHEMA >= 5`, and the new hint (:935).
  - **Cars tab:** the new hint (:900).
  - **`renderSheet`:** add `printsOnSheet` beside `spotCell`, and build Cars not available per Design C. Free cars is unchanged.
  - **`screens.mjs`:**
    - The fill at :41 adds AA77777 and AA88888.
    - AA77777 is tagged Workshop in the cars step. AA88888 is tagged No fuel card where AA55555 is tagged (:63).
    - The labels step (:53-59) ticks Workshop with `.check()` before its screenshot, and leaves No fuel card unticked.
    - The rail count at :160 goes from 6 to 8.
    - The expected warnings (:143-148) are unchanged, because parked cars raise none.
    - After the printout tab opens, the script exits 1 unless: AA77777 is under Cars not available; AA88888 is nowhere on the sheet; and AA33333 (Workshop, on route 6) is not in `#sheet .extra`.
  - **Smoke:**
    - A four-car case: one parked car with a ticked label, one parked with an unticked label, one parked with no label, and one on a route with a ticked label. The tick is set by clicking the Labels tab checkbox.
    - The phone-width fixture gains `labels: [{ id: 'L1', name: 'Workshop', color: '#6a1b9a', onSheet: true }]`.

  *Done when:* all of these hold:
  - ticking a label on the Labels tab lists its parked car under Cars not available, and the tick survives a reload;
  - a parked car whose label is unticked is on neither list;
  - a car with no label stays under Free cars;
  - a ticked car on a route shows only on its route row;
  - the Labels tab fits at 390px with a real Printout cell;
  - `npm run screens` exits 0 with no console errors.

- [x] **5. Docs follow the sheet.**
  - **README:**
    - :25 gains "the printed sheet carries none";
    - :27 gains the tick;
    - :30 becomes "The sheet also lists free cars, and parked cars whose label has Show on printout ticked."
  - **HANDOFF.md:** :11 and :15 no longer describe warnings or positions on the sheet.
  - **The container:**
    - Correct pack 2's stale citations: style.css `335-338`/`:360` become :337-340/:362; app.js `:1616`/`:1809` become the add-tag and add-label lines; smoke `559-603` becomes :559-604.
    - The close-out list (review-round.md:287 today) names `schemaVersion` 4→5 among the allowed differences.
    - Found while planning gains two entries: the stale-open-tab overwrite, and the unchecked `Store.snapshot` result before Import and backup Restore (app.js:1635, :1471).

  INVENTORY is not edited here (see Decisions taken).
  *Done when:*
  - `grep -n "QR\|Check before posting\|Positions not available\|unavailable cars/positions" README.md HANDOFF.md` finds only README:16 and HANDOFF.md:40-47, which is the original plan kept as history;
  - the container's pack 2 section cites this manifest with current lines;
  - the container's close-out list names `schemaVersion` 4→5.

- [x] **6. The upgrade check knows v5.** This extends pack 1's `scripts/upgrade.mjs` as it was built. Re-read it at start, because its build assertion and scenario letters may differ from pack 1's plan.
  - **Allowed differences on open, named exactly:**
    - `carcoord:v1` and Backups are still byte-identical;
    - the loaded plan differs from the old one only by `schemaVersion` 4→5, `qrOnSheet` → false, and `onSheet: false` on every label.
  - **Note expectations** are read from `docs/updates.js`, never hard-coded.
  - **Scenario (e), mixed cached files, re-checked:**
    - The new `app.js` draws with the old `store.js`, and the Labels tab has **no** Printout column. That is the `Store.SCHEMA >= 5` guard.
    - A variant serves the old `index.html` with `qr.js` answering 404, as Pages will once the file is deleted. The plan draws, and the only console error is that 404.
  - **New scenario (f): v5 data in an older build,** in fresh profiles:
    1. This build imports the dev fixture, ticks Out of service and Workshop, and exports a file.
    2. The old build opens the same origin. The newer-version warning shows, there is no `#sheet .qr`, and the plan is drawn.
    3. After one change in the old build, `carcoord:v1` differs from the v5 save by that change and exactly two more things: `schemaVersion` 5→4, and every label losing its `onSheet` key. Everything else deep-equals, `qrOnSheet: false` included.
    4. In another fresh profile, the old build imports the v5 Export. The warning shows, its `carcoord:v1` has no `onSheet` anywhere right after the import, and the Export file itself is unchanged.
    5. No assertion is made that the older build archived the v5 text.

  *Done when:* `npm run upgrade -- <v0.2.4 worktree>` passes (a)–(f) with only the named differences. The run from the previous `dev` build happens in the pack gate after item 7. Until then both builds are 0.3.0, so (a) and (d) would see no version jump, and the script's build assertion may not tell the two builds apart.

- [ ] **7. Announce Printed sheet cleanup and cut 0.4.0.** In one commit (pack 1's Design H):
  - the 0.4.0 entry goes at the top of `docs/updates.js`, as drafted below. Each claim is re-checked against the shipped code and adjusted to the owner's answers.
  - the six places move to 0.4.0: `package.json`, `package-lock.json` (twice), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `APP_VERSION`.
  - `?v=0.4.0` goes on every local tag in `index.html` (one tag fewer than in 0.3.0) and in `recover.html`.
  - pack 1's smoke expectations that name entries (the returning-leader case) are made to follow `updates.js`.

  Draft entry:
  ```js
  { version: '0.4.0', must: true,
    title: 'A printed sheet without warnings or a QR code',
    changed: 'The printed sheet loses its QR code, warnings and Positions not available. Cars not available lists only parked cars whose label has Show on printout ticked on the Labels tab.',
    affects: 'The printed sheet, the Labels tab, and the Data tab, whose QR switch is gone. Share codes are unchanged and never carry the tick. Update older copies: they still print warnings.',
    data: 'Every label starts unticked, so Cars not available is empty, and labelled parked cars print on neither list, until you tick some. Older copies keep the QR off and drop the ticks when saving.' }
  ```
  Notes for the implementer:
  - **Length.** The fields run to about 30 words, above rule G's "about 25". Pack 1's own 0.2.5 `changed` is about 31. Trim only by rewording, and keep every one of these facts:
    - the QR code, the warnings and Positions not available are gone;
    - the tick's name, and that it is on the Labels tab;
    - Cars not available is empty until a label is ticked;
    - where labelled parked cars go until then (owner question 1);
    - "parked" (owner question 2);
    - the Data tab's QR switch is gone;
    - share codes are unchanged and never carry the tick;
    - older copies still print warnings;
    - older copies keep the QR off and drop the ticks when saving.
  - **If the answer to question 1 is "Free cars":** `data` becomes `Every label starts unticked, so Cars not available is empty until you tick some, and parked cars with a label print under Free cars. Older copies keep the QR off and drop the ticks when saving.`
  - **If the answer to question 2 is "yes":** `changed` drops "parked".
  - **Never:**
    - claim a copy is kept on a downgrade;
    - say an older copy "warns";
    - say "this PC";
    - use rule G's code words.

  *Done when:* all of these hold:
  - `versions.mjs` passes at 0.4.0, the `must` rule included. That run, not this plan, is the proof that the entry passes rule G's check.
  - The entry contains both "Show on printout" and "Labels tab".
  - The returning-leader smoke shows 0.4.0, 0.3.0 and 0.2.5 in full.
  - The pack gate is green.

## Owner questions

**Answered by the owner, 2026-09-29.** Both as recommended:
1. A parked car whose label is not ticked prints on **neither list**.
2. A ticked car that is on a route is **not** listed under Cars not available; only parked cars are.

The items as written already build these.

Both answers are needed before item 4 starts. Items 1–3 don't depend on them. The items as written build the recommendation for each.

1. **A parked car whose label is not ticked: should it print under Free cars, or on neither list?** Your rule says a car is listed as not available only when its label is ticked (INVENTORY.md:84). It doesn't say where the others go.
   - **Recommended: neither list.**
     - Right after the update every label is unticked. Under "Free cars", the first sheet would list cars marked Out of service, Unavailable or Workshop as free.
     - In the dev data, that means ZH 90417 (Out of service, "Waiting on insurance") and ZH 90433 (Unavailable, "Lent to the other depot"). Someone could go looking for a car that isn't there.
     - Under "neither", those cars are left off the paper until you tick their label, and the Labels hint and the note both say so.
   - **The other reading:** an unticked label, such as No fuel card, doesn't make a car unavailable, so the car prints under Free cars. That suits labels that don't mean "can't be used".
   - **What changes with "Free cars":**
     - the Free cars rule (app.js:1102) becomes `(!c.labelId || !printsOnSheet(c.labelId)) && !use.cars[c.id]`;
     - the Labels and Cars hints (Design B);
     - item 4's four-car case, where the car with the unticked label moves to Free cars;
     - the screens assertion, where AA88888 goes under Free cars;
     - the note's `data` (the variant in item 7);
     - walkthrough steps 2 and 3.

     The Cars tab counts (:889-891) and the rail stay as they are. The paper's Free cars would then count more cars than the screen's "free", and the Cars hint would have to say why.

2. **A ticked car that you put on a route anyway: should it also be listed under Cars not available?** Read literally, your rule says yes. But with Check before posting gone, the paper would show the car on its route row and also as not available, with nothing to explain why.
   - **Recommended: no.** The screen already warned you before printing. The Cars tab and the rail also count a car on a route as on its route, whatever its label.
   - **What changes with "yes":**
     - the Cars not available rule (Design C) drops `&& !use.cars[c.id]`;
     - the Cars and Labels hints drop "parked";
     - item 4's four-car case, where the ticked car on a route is also listed;
     - the screens assertion, where AA33333 is listed;
     - the note's `changed` drops "parked";
     - walkthrough step 3, where BT 55241 is listed once Workshop is ticked.

## Out of scope

- **A reminder in Print preview, on screen only, when parked cars have unticked labels.** It would soften the deliberately empty list after the update. Offered, not planned.
- **A `storage` listener,** so that a tab left open from before an update cannot write over newer data. This predates the pack and affects all data. Item 5 adds it to the container's Found while planning.
- **Checking `Store.snapshot`'s result before Import and backup Restore** (app.js:1635, :1471). Pre-existing; item 5 adds it to Found while planning.
- Marking which label chips print, on the Cars tab or in the rail.
- Printing positions or driver labels on the sheet.
- Sending the tick in share codes, or any change to the share code format.
- Removing `qrOnSheet` from the saved shape. Never: older builds read a missing value as on.
- The screen's warnings, row stripes, `.problems` box and `liveSig`.
- The phone-width layout, `Share.linkFor`, `Share.readHash`, `#d=` links and README:16.
- Updating `scripts/fixtures/dev-data.json` to v5. It stays v4 on purpose, as the old-shape input for the upgrade check.
- Keeping a copy of v5 data when an older build opens it. That is pack 1's archive rule, which dedupes on `to === version`.
- Dark-mode tokens for the sheet (pack 3), and a label-menu entry for the tick (pack 8).
- **Breadify.** This includes the comment at `docs/breadify/style.css:238-243`, which says the QR on Car Coordinator's sheet exists so a phone can open the site. It goes stale with this pack and is left alone, because Breadify is outside the container.

## Gates

- **Item gate:** `scripts/check.sh`, which runs `versions.mjs` after pack 1.
  - When logic is touched (items 1–4 and 7), also run `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`.
  - Item 1 also runs `npm ci`.
  - Item 6's gate is its own upgrade run.
- **Pack gate, after item 7,** all run with `CHROMIUM_PATH=/usr/bin/google-chrome`:
  - `npm test`;
  - `npm run screens`;
  - `npm run upgrade -- <v0.2.4 worktree>` and `npm run upgrade -- <previous dev build worktree>`, each covering scenarios (a)–(f).

  Say that the suite ran on system Chrome.
- **Review:** item 3 individually, and one pass for the rest.
- **Browser walkthrough before the PR into `dev`,** web first:
  1. Serve the previous `dev` build on a fixed port, in a fresh profile. Import the dev fixture, turn the QR switch on, and put one car on two routes. Print preview shows:
     - the QR, Check before posting and the marks;
     - Positions not available;
     - ZH 90417, ZH 90433 and BT 55241 under Cars not available.
  2. Serve this build on the same origin and reload. Check:
     - the note is last, with 0.4.0 in full, and there is no repair notice;
     - the Data tab has one new archive and no QR switch;
     - the screen still warns about the doubled car;
     - the Labels tab has a Printout column, all unticked;
     - Print preview has no QR, warnings, marks, dotted lines or Positions not available, and no Cars not available section;
     - Free cars is as before.
  3. Tick Out of service: ZH 90417 is listed and ZH 90433 is not. Tick Workshop: BT 55241 stays off the list, because it is on a route. A reload keeps both ticks. (These expectations follow the recommendations; adjust them to the owner's answers.)
  4. Press Ctrl+P: the browser's print preview matches.
  5. Restore the archive (two clicks): the ticks go off. Restore the backup that the restore took: the ticks come back.
  6. At 390px wide, the Labels tab scrolls inside itself and the page does not.
  7. Re-read the 0.4.0 entry against what shipped. It names Show on printout and the Labels tab.
- **At pack close:**
  - `INVENTORY.md` replaces the 🚧 pointer with ✅ entries:
    - Labels gains the Show on printout tick;
    - in Printing, "Check before posting" and "QR on the sheet" go;
    - "Unavailable and free cars" becomes "Cars not available (parked cars with a ticked label) and free cars".
  - The container's status line is updated.
  - `git log` since pack 1 is swept into the docs.

## Ledger

- **2026-09-29, start (combined pack, part 2).** Built on `review-round`, not a `sheet-cleanup` branch, per the combined manifest: it is cut from `update-note` (pack 1, 0.3.0) and merged with `origin/dev` for the plans. Base commit 771f560. Line numbers are re-found by symbol, because pack 1 moved most of `app.js`.
- Item 1 done, 6c44bb3. The QR block was at app.js:1346-1373 at 0.3.0, the tag at index.html:70. The smoke decode block became four checks on `planA` (no `#sheet .qr`, no QR switch, `QR` undefined, no `qr.js` tag). `npm uninstall jsqr` then `npm ci`: OK. Gate: `check.sh` OK. Car suite on system Chrome: exit 0, 477 ok, 0 FAIL, "all checks passed" (the `#d=` link and phone-width cases included). The first run failed only the known flaky "a disarm leaves the page where the user scrolled it — 285" (pack 1's ledger); the rerun was clean.
- Item 2 done, 503900b. `renderSheet` no longer calls `problems()`; the clash fixture gained the pink row, the gap, CC33333 and Spot 9, and its checks now read the day plan's `.problems` box for the warnings and the sheet for their absence. Gate: `check.sh` OK. Car suite: exit 0, 485 ok, 0 FAIL.
- Item 3 done, 9788635. **Awaiting individual review.** Design E as planned; `onSheet: false` at `defaults()`, add-label, add-tag and share.js:179. The case block (a)-(f) runs in its own context near the end of smoke.mjs. (a) reads `carcoord:v1` before the reload and after the full start, and compares both with the v4 text; (b) compares the stored v5 plan with the input plus the change, key order ignored; (d) finds the v4 backup by its label, because the daily snapshot sits above it. Gate: `check.sh` OK. Car suite: exit 0, 501 ok, 0 FAIL; save-file case 6 passes unchanged.
- Item 4 done, 5698b98. Design B and C as planned, with the owner's two answers (neither list; parked only). `marked()` is gone: Cars not available is built inline, and Positions not available no longer needs it. Gate: `check.sh` OK. `npm run screens`: exit 0, "no console errors, 4 warnings raised and asserted", with the three new printout assertions. Car suite: exit 0, 507 ok, 0 FAIL, the Labels tab fitting at 390px with a ticked Printout cell.
- Item 5 done, b0ec4e8. README, HANDOFF.md and the container as planned. The container's stale style.css and smoke citations now name 73dd734, because those lines are gone at 0.4.0; the add-tag and add-label lines are given at 0.4.0 (app.js:1917, :2111). The two Found-while-planning entries went under a new "Found while building pack 2" heading. `grep -n "QR\|Check before posting\|Positions not available\|unavailable cars/positions" README.md HANDOFF.md` finds only README:16 and HANDOFF.md:40, :41 and :47. Gate: `check.sh` OK.
- Item 6 done, a994635. As planned, plus one extension. **Extension (deviation):** pack 1's script only knew old builds without release notes or Archives (0.2.x). The combined pack runs every part's upgrade check from the build before it (0.3.0 here), so the `'mixed'` build assertion now expects the old build's own `UPDATES[0]` (or none before 0.3.0), and scenario (b)'s marker check and scenario (e)'s mixed-open check expect the marker the old build left. With an old `store.js` that has Archives, the mixed open's copy is taken at once, and the all-new open keeps it. Scenario (f) is skipped, and says so, when the old build already saves schema 5. Allowed differences are checked on every all-new open: `state` deep-equals the old `carcoord:v1` with `schemaVersion` → `Store.SCHEMA`, `qrOnSheet` → false and each label's `onSheet` → `=== true`. The qr.js 404 variant runs in the same profile as (e), between the mixed open and the all-new one. Console errors now carry their URL. Gate: `check.sh` OK. `npm run upgrade -- <v0.2.4 worktree>` on system Chrome: exit 0, 60 ok, 0 FAIL, "upgrade check passed: 0.2.4 to 0.3.0", scenarios (a)-(f).
