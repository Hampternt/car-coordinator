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
    version: '0.16.0',
    must: true,
    title: 'Shared plan: changes reach the other manager live',
    changed: 'Shared plan changes reach the other manager within a second. If you both change one box, the last counts; the other is kept to restore.',
    affects: 'Every tab in a shared plan. The printed sheet and share codes do not change. Update both copies: an older one only reads it.',
    data: 'Nothing changes outside a shared plan. In one, this browser keeps its last copy, which older copies ignore. Replacing your plan changes it for both.',
  },
  {
    version: '0.15.0',
    must: true,
    title: 'A shared plan for two managers',
    changed: 'The Data tab has a Shared plan card: create one with the server\'s create code, send its invite link, push named versions, look at them first, restore them, or leave.',
    affects: 'The Data tab, and a Shared plan status in the top bar while this browser is in one. The printed sheet and share codes do not change. Older copies cannot open invite links: update both first.',
    data: 'Nothing changes unless you create or join a shared plan. Taking one, or restoring a version, replaces the plan and setup; what was on screen goes into Backups first.',
  },
  {
    version: '0.14.1',
    must: false,
    title: 'The date, its crew, and plainer templates',
    changed: 'Click the date for a calendar, or step it with \u00ab \u2039 \u203a \u00bb; setting it brings that weekday\'s crew in. Templates show their routes on hover, with Load and Save.',
    affects: 'The Day plan, wider on big screens, and a route\'s right-click menu. Share codes and the printed sheet are unchanged. An older copy still offers templates set for a day.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.14.0',
    must: false,
    title: 'Info buttons instead of the tour',
    changed: 'A small ⓘ beside each part of the app opens a short note on what it does. Esc or a click elsewhere closes it. The Tour button is gone.',
    affects: 'Every tab, and the top bar. The ⓘ never prints. Share codes and the printed sheet are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.13.0',
    must: true,
    title: 'Weekday templates, and loading in parts',
    changed: 'Monday to Friday templates wait on the shelf, empty until Update from plan fills them. A load asks which parts to take, and says what will happen.',
    affects: 'The Day templates shelf and its right-click menu. Share codes and the printed sheet are unchanged. After an older copy saves, a deleted weekday template can return: update it.',
    data: 'Empty Monday to Friday templates are added once, skipping any day a template already has. Your own templates are unchanged. An older copy keeps them.',
  },
  {
    version: '0.12.0',
    must: true,
    title: 'Driver tags, apart from car labels',
    changed: 'Drivers get their own tags, added for everyone: Sick, Holiday, Vacation, Course and Special situation, unless already there. Cars and positions offer only their labels.',
    affects: 'Drivers and Labels tabs, and a driver\'s tag menu. Share codes and the printed sheet are unchanged. An older copy drops driver tags when it saves: update it first.',
    data: 'Every driver keeps their tag; it now lives in its own Driver tags list. An older copy of the app shows drivers without tags.',
  },
  {
    version: '0.11.0',
    must: false,
    title: 'A short tour of the app',
    changed: 'A Tour button, right of Print in the top bar, walks through the app one thing at a time. In a narrower window the tabs sit on a row of their own.',
    affects: 'The top bar, on every tab. The tour does not touch your plan. Share codes and the printed sheet are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.10.0',
    must: false,
    title: 'Right-click menus',
    changed: 'Right-click a route, a Drivers or Cars panel row, a row on the other tabs, or a day template for what you can do to it. Shift+F10 opens it too.',
    affects: 'Day plan, Drivers, Cars, Positions and Labels tabs. Shift+right-click a text box for copy and paste. Share codes and the printed sheet are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.9.0',
    must: false,
    title: 'Usual days, tags and notes for drivers',
    changed: 'Each driver\'s row has Usual days, Monday to Friday, a Tag and a Note; a tag never sets anyone Away. The In today button now reads In.',
    affects: 'Drivers tab, the Drivers panel (each name shows its usual days), the week, and Labels tab: deleting a label takes it off drivers too. Share codes are unchanged: they send day groups, never drivers\' tags or notes. Printed sheet unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.8.0',
    must: false,
    title: 'A parking map under the route list',
    changed: 'A map shows Spot 1 to Spot 5 and the Gate with their routes by round. A spot the warnings call taken twice is red.',
    affects: 'The Day plan and the Positions tab: the map finds spots by name and lists the rest. The printed sheet and share codes are unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.7.0',
    must: false,
    title: 'Templates and the week under the route list',
    changed: 'Templates sit straight under the route list, then a column per weekday listing its crew, with Load on top. These replace the Mon–Sun buttons.',
    affects: 'Day plan: All and weekend crews are buttons in its Drivers panel. Drivers tab: an empty group\'s Use for today changes nobody. Printed sheet and share codes unchanged.',
    data: 'Nothing in your saved plan changes.',
  },
  {
    version: '0.6.0',
    must: true,
    title: 'The day plan is for the next working day',
    changed: 'Opening the app moves a passed date to the next working day; Keep puts it back. Clear uses that day. Any other date shows a warning.',
    affects: 'Day plan and template offers. Printed sheets and share codes carry the new date. On a copy not yet updated, set the date by hand.',
    data: 'Opening the app leaves your saved plan as it was. Your next change saves the new date. An older copy shows the date as saved.',
  },
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
