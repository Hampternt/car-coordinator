'use strict';
/* What changed in each version, newest first. The note shown once after an
   update is made from these, and What's new on the Data tab lists them all.

   How to write an entry. It is read by a warehouse team leader:
   - Name what is on screen exactly as the app shows it.
   - Never use code words: storage, key, schema, JSON, migration, normalise,
     cache, localStorage.
   - title: a few words.
   - changed: what you will see or do differently.
   - affects: which tabs are affected. Always say whether the printed sheet
     or share codes change. If an updated and a not-yet-updated PC behave
     differently, say so and say what to do.
   - data: always present and exact. Either "Nothing in your saved plan
     changes." or exactly what changes, and what an older copy of the app
     does with it. Never "might", and never more than the code guarantees:
     check every claim against the code.
   - must: true whenever data is not the "Nothing ... changes" sentence, or
     the printed sheet or share codes change. A must entry is always shown
     in full, however many versions a browser has skipped.
   - Archives and backups live in the same browser as the plan. Never imply
     they survive clearing browser data, a different browser or a reinstall.
   - No comfort words without the fact behind them.
   - At most about 25 words per field. Say "this browser", never "this PC".

   Announce and cut. Every change to shipped files under docs/ outside
   docs/breadify/ ends with "Announce ⟨what⟩ and cut ⟨version⟩": one commit
   that
   - adds an entry at the top of docs/updates.js, with must set by the
     wording rules;
   - moves six places to that version: package.json, package-lock.json
     (twice), src-tauri/Cargo.toml, src-tauri/tauri.conf.json and
     APP_VERSION in docs/app.js.
   The ?v= on every local tag in docs/index.html and docs/recover.html
   follows APP_VERSION, and scripts/versions.mjs fails the item gate when
   any of it disagrees.
   A pack takes the next minor version; any other shipped change takes at
   least the next patch. A change to Markdown or manifests alone cuts
   nothing.
   Entries are never removed or renumbered. The walkthrough re-reads the
   entry against what shipped. Merging dev into main publishes Pages and
   builds release v⟨version⟩.

   scripts/versions.mjs also checks that the entries run newest first, that
   the newest is APP_VERSION, and that must is set wherever these rules
   need it. */
const UPDATES = [
  {
    version: '0.5.0',
    must: true,
    title: 'Dark mode',
    changed: 'On screen the app now follows the computer\'s light or dark setting. Under Colours on the Data tab, pick Follow the computer, Light or Dark for this browser.',
    affects: 'Every tab on screen; Print preview still shows the sheet on white paper. The printed sheet and share codes are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.4.0',
    must: true,
    title: 'A printed sheet without warnings or a QR code',
    changed: 'The printed sheet loses its QR code, warnings and Positions not available. Cars not available lists only parked cars whose label has Show on printout ticked on the Labels tab.',
    affects: 'The printed sheet, the Labels tab, and the Data tab, whose QR switch is gone. Share codes are unchanged and never carry the tick. Update older copies: they still print warnings.',
    data: 'Every label starts unticked, so Cars not available is empty, and labelled parked cars print on neither list, until you tick some. Older copies keep the QR off and drop the ticks when saving.',
  },
  {
    version: '0.3.0',
    title: 'A note like this after each update, and Archives',
    changed: 'After each update, a note like this appears once. Your plan and setup are copied into Archives first, and What\'s new keeps every note.',
    affects: 'This note, and What\'s new and Archives on the Data tab. The day plan, printed sheet and share codes are unchanged.',
    data: 'Nothing in your saved plan changes. Before each update\'s note, an unchanged copy goes into Archives.',
  },
  {
    version: '0.2.5',
    must: true,
    title: 'After a lost plan, your save file is read before it is written',
    changed: 'When this browser has lost its plan, Reconnect reads your save file first and asks. Choose save file\u2026 asks before replacing a file that holds a plan. Switching tabs no longer saves.',
    affects: 'The Data tab\'s save-file card. The printed sheet: the date is centred, with the weekday under it. Share codes are unchanged.',
    data: 'Nothing in your saved plan changes. Whichever plan you replace goes into Backups first; a file that could not be read is replaced only after two clicks.',
  },
];
