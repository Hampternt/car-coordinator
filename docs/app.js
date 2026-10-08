'use strict';

/* The running version. The update note keys on it, and every local tag in
   index.html asks for ?v= of it, so a browser never pairs this file with one
   from another release. scripts/versions.mjs keeps it level with
   package.json, Cargo.toml and tauri.conf.json; declare it here only. */
const APP_VERSION = '0.16.0';

const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const byId = (arr, id) => arr.find((x) => x.id === id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Matching the way a person reads, not the way a computer does: " 1" is the
   round "1", and "ana " is the driver "Ana". Used for rounds and driver names
   alike; share.js folds registrations the same way, for the same reason. */
const fold = (s) => String(s || '').trim().toUpperCase();
/* esc() makes a string safe to put between quotes; it does not make one safe
   to put inside a style attribute, where a semicolon starts a new declaration
   rather than closing anything. Label colours are the only values that go
   there, they arrive from imported files and share codes as well as from the
   colour picker, and store.js and share.js both check them on the way in —
   this is the same check at the last moment, so no path into the page skips it. */
const colour = (c, fallback = '#c62828') => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : fallback);
// Names and registrations in the order a person hunts for them: the alphabet
// of whoever is at the keyboard (so Æ Ø Å come after Z on a Norwegian PC),
// with runs of digits read as numbers, so "Car 2" comes before "Car 10". Only
// the pickers use it: the rail and the tabs keep the order the leader chose.
const collate = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

// Indexed by Date.getDay(), which is how a weekday is stored: Sunday is 0.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// The week the way the warehouse reads it: Monday first.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/* A day group named for a day of the week is that day's crew: Monday to
   Friday's are the week's columns under the route list, and Saturday's and
   Sunday's are buttons in the Drivers panel. Named the way people name them: in
   English or Norwegian, whole or short, with a plural or a "crew" after it —
   "Monday", "Mon", "Mondays", "Monday crew", "Mandag", "Mandagsgjeng", "Man".
   Thursday's Norwegian short form is left out on purpose: "Tor" is a name
   before it is Thursday. */
const DAY_NAMES = [
  ['SUNDAY', 'SUN', 'SØNDAG', 'SONDAG', 'SØN'],
  ['MONDAY', 'MON', 'MANDAG', 'MAN'],
  ['TUESDAY', 'TUE', 'TUES', 'TIRSDAG', 'TIR'],
  ['WEDNESDAY', 'WED', 'WEDS', 'ONSDAG', 'ONS'],
  ['THURSDAY', 'THU', 'THUR', 'THURS', 'TORSDAG'],
  ['FRIDAY', 'FRI', 'FREDAG', 'FRE'],
  ['SATURDAY', 'SAT', 'LØRDAG', 'LORDAG', 'LØR'],
];
// store.js has a copy of DAY_NAMES and this, as Store.weekdayOf, for the
// weekday templates it adds; the two must be kept in step.
function groupWeekday(name) {
  let n = fold(name)
    .replace(/[.!]+$/, '')                                            // "Mondays."
    .replace(/['’]S\b/, '')                                           // "Monday's crew"
    .replace(/[\s.-]+(CREWS?|GROUPS?|GANG|TEAM|GJENG|LAG|MANNSKAP)$/, '') // "Monday crew", "Mandag gjeng"
    .replace(/DAYS$/, 'DAY').replace(/DAGER$/, 'DAG');                // "Mondays", "Mandager"
  // Norwegian writes the crew into the day as one word: "Mandagsgjeng",
  // "Fredagsvakta", "Tirsdagslaget".
  const joined = n.match(/^(MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG|L[ØO]RDAG|S[ØO]NDAG)S?(GJENGEN|GJENG|LAGET|LAG|TEAM|VAKTA|VAKTEN|VAKT|MANNSKAPET|MANNSKAP)$/);
  if (joined) n = joined[1];
  return DAY_NAMES.findIndex((names) => names.includes(n));
}
/* Who a crew really holds: drivers still on the roster, each once. */
const crewIds = (g) => new Set(g.driverIds.filter((id) => byId(state.drivers, id)));
/* In force: the drivers in today are exactly that crew. An empty crew is
   never in force — it would light up the moment nobody was in. */
function crewInForce(ids) {
  const inIds = new Set(state.drivers.filter((d) => d.available).map((d) => d.id));
  return ids.size > 0 && ids.size === inIds.size && [...ids].every((id) => inIds.has(id));
}

/* Each day's crew: the first group named for it. A second group named for
   the same day is not lost — it is offered beside the others. */
function dayCrews() {
  const byDay = new Map();
  const others = [];
  for (const g of state.driverGroups) {
    const day = groupWeekday(g.name);
    if (day >= 0 && !byDay.has(day)) byDay.set(day, g); else others.push(g);
  }
  return { byDay, others };
}

/* The plan's day's crew in, and everyone else away, when the date is set to
   that day by hand (owner, 2026-10-01): the week's Load for it, done for you.
   Typing, picking, the day and month steps and Set to tomorrow do it; a date
   moved on open does not, since nothing is written at open. A day with no
   crew, or an empty one, changes nobody. Like Load, it sets everyone, a
   driver tagged Sick in that crew included. True when anyone changed. */
function loadDayCrew() {
  const day = planWeekday();
  const g = day >= 0 ? dayCrews().byDay.get(day) : null;
  const ids = g ? crewIds(g) : new Set();
  if (!ids.size) return false;
  let changed = false;
  state.drivers.forEach((d) => { const on = ids.has(d.id); if (d.available !== on) { d.available = on; changed = true; } });
  if (changed) delete planScroll.drivers;
  return changed;
}

/* ---------- the calendar ----------
   Local days throughout: a plan is for a day on the leader's own calendar,
   not a UTC one. Days are built at local noon, so a clock change can never
   slip one. */
const pad2 = (n) => String(n).padStart(2, '0');
const dayString = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function today() {
  return dayString(new Date());
}

/* A local Date at noon for a YYYY-MM-DD that is a real day, or null. The
   string has to come back out exactly, which rejects 2026-02-30, and a year
   below 100 that Date would read as 19xx. */
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dayString(d) === s ? d : null;
}

/* The next working day: tomorrow, or Monday after a Friday, Saturday or
   Sunday. The warehouse works Monday to Friday; public holidays are not
   skipped. */
function nextWorkingDay(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return dayString(d);
}

/* 'Wednesday 30/09', with the year when it is not this one. */
function dayLabel(s) {
  const d = parseDay(s);
  if (!d) return String(s || '');
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `/${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}${year}`;
}

/* The Date box shows dd/mm/yyyy whatever language the browser is in; a date
   field of the browser's own would show mm/dd/yyyy in an American one. The
   plan still keeps YYYY-MM-DD, so nothing saved changes. */
function dmyOf(s) {
  const d = parseDay(s);
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}
/* What was typed in the Date box, as YYYY-MM-DD, or '' while it is not a real
   day. dd/mm/yyyy with / . or - between, a one-digit day or month allowed; a
   YYYY-MM-DD pasted in is taken as it is. The year is always four digits, so
   a date half typed ("01/10/20") never reads as a real day in 2020. */
function typedDay(text) {
  const t = String(text || '').trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const s = m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : t;
  return parseDay(s) ? s : '';
}
/* A date half typed, while the Date box has the focus: the plan keeps the day
   it has until the box reads a real one, and a redraw meanwhile (a disarm, a
   write to the save file) draws the box with what was typed, not the day. */
function dateTyping() {
  const box = document.getElementById('date');
  // Emptied too: clearing the box to retype the date is half typing it, and
  // saving the plan with no date (then reloading the day's crew over the
  // availability set by hand, when the same date is typed back) was wrong
  // (review, 2026-10-01). Leaving the box puts the plan's day back.
  return box && document.activeElement === box && !typedDay(box.value) ? box.value : null;
}
const dateBoxText = () => dateTyping() ?? dmyOf(state.date);
/* A day or a month on from a date: a month on keeps the day of the month, or
   the month's last where it has fewer (31/01 to 28/02). From a date that is
   not a real day, the steps start at today. */
function stepDate(s, unit, by) {
  const d = parseDay(s) || parseDay(today());
  if (unit === 'month') {
    const last = new Date(d.getFullYear(), d.getMonth() + by + 1, 0, 12).getDate();
    return dayString(new Date(d.getFullYear(), d.getMonth() + by, Math.min(d.getDate(), last), 12));
  }
  return dayString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + by, 12));
}
/* The calendar is the browser's own, on a date field kept out of sight under
   the Date box, set to the plan's day first so that day is the one marked;
   what is picked there is typed into the box (the change handler). */
function openDatePicker() {
  const p = document.getElementById('datePick');
  if (!p) return;
  p.value = parseDay(state.date) ? state.date : '';
  try { p.showPicker(); } catch (err) { /* no picker here: the box still types */ }
}
// A date put in the box by a button goes in as if typed, so it takes exactly
// the path a typed date does.
function putDate(day) {
  const box = document.getElementById('date');
  if (!box || !parseDay(day)) return;
  box.value = dmyOf(day);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

// The weekday of the plan's own date, 0 for Sunday, or -1 when it is not a day.
const planWeekday = () => parseDay(state.date)?.getDay() ?? -1;

/* Under the Date: what day the plan is for. Quiet when it is the next
   working day; otherwise a warning with Set to tomorrow, which never blocks
   anything. The cases are checked in this order, and the last one catches
   every other date, a weekend one included. */
function dateLine() {
  const now = today(), nwd = nextWorkingDay(), d = state.date;
  if (dateTyping() !== null) return { off: true, text: `Not a real day yet: type it as dd/mm/yyyy, or click the box for the calendar. The plan keeps ${parseDay(d) ? dayLabel(d) : 'no date'} until then.` };
  if (!parseDay(d)) return { off: true, text: `The date is not a real day. The next working day is ${dayLabel(nwd)}.` };
  if (d === nwd) return { off: false, text: `${dayLabel(d)}, the next working day.` };
  if (d === now) return { off: true, text: `This plan is dated today, ${dayLabel(d)}. The next working day is ${dayLabel(nwd)}.` };
  if (d < now) return { off: true, text: `${dayLabel(d)} has passed. The next working day is ${dayLabel(nwd)}.` };
  return { off: true, text: `${dayLabel(d)} is not the next working day, ${dayLabel(nwd)}.` };
}
const setTomorrowBtn = () => `<button class="btn" data-act="set-tomorrow" title="Set the date to ${esc(dayLabel(nextWorkingDay()))}">Set to tomorrow</button>`;
const dateLineInner = ({ off, text }) => `<span>${esc(text)}</span>${off ? ` ${setTomorrowBtn()}` : ''}`;
const dateLineHtml = () => { const l = dateLine(); return `<p id="dateLine" class="date-line${l.off ? ' off' : ''}">${dateLineInner(l)}</p>`; };

/* Above the line: the plan's day, large, and how far it is from today, so the
   day being planned is plain at a glance (owner, 2026-10-01): "Thursday
   01/10/2026" and "Planning tomorrow". Calendar days on the leader's own
   clock; both days are built at noon, so a clock change still rounds right. */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function daysFromToday(s) {
  const d = parseDay(s), t = parseDay(today());
  return d && t ? Math.round((d - t) / 86400000) : null;
}
function planningWords(n) {
  if (n === 0) return 'Planning today';
  if (n === 1) return 'Planning tomorrow';
  if (n === -1) return 'Planning yesterday';
  const w = Math.abs(n) <= 10 ? NUMBER_WORDS[Math.abs(n)] : String(Math.abs(n));
  return n > 0 ? `Planning ${w} days ahead` : `Planning ${w} days ago`;
}
function dateHeadInner() {
  if (dateTyping() !== null) return '<span class="date-big">Not a date yet</span>';
  const d = parseDay(state.date);
  if (!d) return '<span class="date-big">No date set</span>';
  return `<span class="date-big">${WEEKDAYS[d.getDay()]} ${esc(dmyOf(state.date))}</span>`
    + `<span class="date-away">${esc(planningWords(daysFromToday(state.date)))}</span>`;
}
const dateHeadHtml = () => `<div id="dateHead" class="date-head">${dateHeadInner()}</div>`;

/* Only the day and the line, never the Date box above them: redrawing the box
   would take the focus out of it mid-typing. */
function drawDateLine() {
  const head = document.getElementById('dateHead');
  const big = dateHeadInner();
  if (head && head.dataset.drawn !== big) { head.innerHTML = big; head.dataset.drawn = big; }
  const el = document.getElementById('dateLine');
  if (!el) return;
  const l = dateLine();
  el.className = `date-line${l.off ? ' off' : ''}`;
  // In place, never redrawn whole: pressing Set to tomorrow takes the focus out
  // of the Date box, and a line redrawn between the press and the release
  // would take the button away from under the pointer, and the click with it.
  const words = el.querySelector('span');
  if (words) words.textContent = l.text; else el.innerHTML = dateLineInner(l);
  const btn = el.querySelector('[data-act="set-tomorrow"]');
  if (l.off && !btn) el.insertAdjacentHTML('beforeend', ` ${setTomorrowBtn()}`);
  else if (!l.off && btn) btn.remove();
  else if (btn) btn.title = `Set the date to ${dayLabel(nextWorkingDay())}`;
}
// A press under way (pointer down, not yet up): a redraw that would move what
// is under the pointer waits for the release, and runs just after its click.
let pressing = false;
let lineAfterPress = false;
document.addEventListener('pointerdown', () => { pressing = true; }, true);
const released = () => {
  setTimeout(() => {
    pressing = false;
    if (lineAfterPress) { lineAfterPress = false; drawDateLine(); }
  }, 0);
};
document.addEventListener('pointerup', released, true);
document.addEventListener('pointercancel', released, true);
// A window left open overnight does not vouch for yesterday's "tomorrow".
window.addEventListener('focus', drawDateLine);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') drawDateLine(); });

function newRoute(name, gapBefore = false) {
  return { id: uid(), name, driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore };
}

/* Drivers wear tags from a list of their own from schema 6 on. A store.js
   cached from before it can pair with this app.js after a deploy: its drivers
   still wear the labels, and a driverTags list saved under its older schema
   would stop the move-over from ever running. So until store.js is fresh too,
   drivers keep the labels and no driverTags list is made. */
function ownDriverTags() {
  return Store.SCHEMA >= 6;
}

function defaults() {
  const pos = (name) => ({ id: uid(), name, multi: name === 'Garage', labelId: '', note: '' });
  return {
    schemaVersion: Store.SCHEMA,
    date: nextWorkingDay(),
    qrOnSheet: false,
    // Just the spots. The number after the slash on the pillar sheet is the
    // round, not part of the spot's name, so it lives in the route's own round
    // field and the two are joined back together for the printout.
    positions: ['Spot 1', 'Spot 2', 'Spot 3', 'Spot 4', 'Spot 5', 'Garage'].map(pos),
    labels: [
      { id: uid(), name: 'Out of service', color: '#c62828', onSheet: false },
      { id: uid(), name: 'Unavailable', color: '#ef6c00', onSheet: false },
      { id: uid(), name: 'Workshop', color: '#6a1b9a', onSheet: false },
    ],
    cars: [],
    drivers: [],
    ...(ownDriverTags() ? { driverTags: Store.readyTags() } : {}),
    driverGroups: [],
    // Monday to Friday, empty, and the mark that they were given. Only from a
    // store.js that has them: a cached older one pairs with this app.js after
    // a deploy, and defaults() runs before anything else is drawn.
    ...(typeof Store.weekdayTemplates === 'function' ? { templates: Store.weekdayTemplates(), weekdayTemplates: true } : { templates: [] }),
    routes: [
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14'].map((n) => newRoute(n)),
      newRoute('HAU 1', true),
      newRoute('HAU 2'),
    ],
  };
}

let state = defaults();
let tab = 'plan';

/* ---------- colours: follow the computer, or this browser's choice ----------
   theme.js applies a stored Light or Dark before the page draws. This applies
   it again for a cached index.html from before theme.js, and when another tab
   changes it. Neither writes. Only 'light' and 'dark' count; anything else is
   Follow the computer, which is no attribute at all. */
function applyTheme(choice) {
  let t = choice;
  if (t === undefined) {
    if (typeof Store === 'undefined' || typeof Store.pref !== 'function') return;   // an older cached store.js
    t = Store.pref('theme');
  }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme();
// False once this browser has refused to keep a choice: it then lasts only
// until the page is closed or reloaded, and the Data tab says so.
let themeKept = true;
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== 'carcoord:pref:theme') return;
  applyTheme();
  // Once the page is drawn, redraw it, so the Colours buttons follow too.
  if ($('#tab-data')?.children.length) renderKeepingFocus();
});
let armed = null;
let notices = [];

/* A passed date moved on open (step 6 of the start-up). It is in memory until
   the next real change: `saved` is set once a save has written the moved date
   to this browser, `inFile` once Reconnect or Choose save file… wrote it to
   the file. Keep puts the old date back wherever the moved one went, and
   nowhere else. It lasts until the plan or its date is replaced, or its
   notice is put away. */
let dateMove = null;
// Set once another tab has saved a newer plan while this one is in a shared
// plan; only a reload clears it. See the storage listener there.
let planElsewhere = false;
const save = () => {
  // Another tab saved a newer plan (planElsewhere, in the shared plan's code):
  // this one's is stale until reloaded, and writing it would undo that change.
  if (planElsewhere) return;
  if (dateMove && state === dateMove.plan) dateMove.saved = true;
  const kept = Store.save(state);
  // In a shared plan, the change goes to the room too, and the room's plan as
  // confirmed is kept beside it (roomEdited and roomBaseWrite, there).
  if (kept !== false) roomBaseWrite(room);
  roomEdited();
};
const isKeep = (n) => !!(n.offer && n.offer.act === 'keep-date');
const dropKeep = () => { dateMove = null; notices = notices.filter((n) => !isKeep(n)); };

/* Step 6 of the start-up: a saved date that has passed moves to the next
   working day, on screen only. Nothing is written; the Keep notice offers the
   old date back. The date is assigned last, so a failure before it leaves
   the plan as it was saved. */
function moveDateOnOpen() {
  const from = state.date;
  const d = parseDay(from);
  if (!d || from >= today()) return;
  const to = nextWorkingDay();
  const text = `${dayLabel(from)} has passed, so this plan is now dated ${dayLabel(to)}, the next working day. This browser saves the new date with your next change.`;
  // Raised without taking the scroll: a file hold or the spot question keeps it.
  const raised = offerRaised;
  note('info', text, { act: 'keep-date', kind: '', id: '', text: `Keep ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` });
  offerRaised = raised;
  state.date = to;
  dateMove = { from, to, plan: state, saved: false, inFile: false };
}

const listFor = (kind) => ({ route: state.routes, car: state.cars, position: state.positions, label: state.labels, driverTag: state.driverTags, driver: state.drivers, driverGroup: state.driverGroups, template: state.templates })[kind];

/* ---------- small html helpers ----------
   Ids reach attributes, and an imported JSON file can carry any string as an
   id, so every one of them goes through esc() even though the app's own uid()
   never produces anything that needs it. */
const field = (kind, id, name, value, extra = '') =>
  `<input type="text" data-kind="${kind}" data-id="${esc(id)}" data-field="${esc(name)}" value="${esc(value)}" ${extra}>`;
const actBtn = (act, kind, id, text, cls = '', extra = '') =>
  `<button class="btn ${cls}" data-act="${act}" data-kind="${kind}" data-id="${esc(id)}" ${extra}>${text}</button>`;
const moveDel = (kind, id) =>
  actBtn('up', kind, id, '↑', '', 'title="Move up"') +
  actBtn('down', kind, id, '↓', '', 'title="Move down"') +
  actBtn('del', kind, id, armed === `del:${id}` ? 'Sure?' : '✕', armed === `del:${id}` ? 'armed' : '', 'title="Delete"');

/* Where a thing's tag comes from, and the field that holds it: a driver
   wears a driver tag, a car or a position a label. */
const tagList = (kind) => (kind === 'driver' && ownDriverTags() ? state.driverTags || [] : state.labels);
const tagField = (kind) => (kind === 'driver' && ownDriverTags() ? 'tagId' : 'labelId');
const tagOf = (kind, item) => byId(tagList(kind), item[tagField(kind)]);

/* ---------- the ⓘ and its bubble ----------
   A small ⓘ beside a part of the app opens a bubble beside it saying what
   the part is and how to use it; the words are in help.js. It only tells:
   the ⓘ carries data-info, never data-act, and has click handling of its
   own, so no press on it or in its bubble reaches save(). One bubble at a
   time, placed the way the menus are; Esc, a press outside it, the focus
   moving elsewhere or another ⓘ shuts it. A cached index.html without
   help.js draws no ⓘ at all. */
let infoOpen = null;   // { key }: the open bubble, kept off `state`
const infoBtn = (key) => (typeof HELP === 'undefined' || !HELP[key] ? ''
  : `<button type="button" class="info-btn" data-info="${esc(key)}" aria-label="About ${esc(HELP[key].title)}" aria-expanded="${!!infoOpen && infoOpen.key === key}" title="What is this?">\u24d8</button>`);

function labelChips(kind, item) {
  const on = item[tagField(kind)];
  const ok = `<button class="chip ok ${on ? '' : 'on'}" data-act="setLabel" data-kind="${kind}" data-id="${esc(item.id)}" data-label="">OK</button>`;
  return ok + tagList(kind).map((l) =>
    `<button class="chip ${on === l.id ? 'on' : ''}" style="--c:${esc(colour(l.color))}" data-act="setLabel" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(l.id)}">${esc(l.name)}</button>`
  ).join('');
}

/* Everything a driver is, minted in one place so the rail, the tab and an
   applied group cannot drift apart on what a new one starts as. */
const newDriver = (name) => ({ id: uid(), name, available: true, [tagField('driver')]: '', note: '' });

/* ---------- the clash rule ----------
   Two routes can share a packing spot as long as they are packed in different
   rounds: the first car has gone by the time the second one arrives. So a
   double booking is a spot AND a round, never a spot on its own.

   A blank round is a bucket of its own — "not filled in yet" is not "some
   other round", and two blanks in the same spot are still a clash. Rounds are
   matched the way a person would read them, trimmed and case-folded, for the
   same reason share.js matches registrations that way: a warning that goes
   quiet because someone typed a trailing space is worse than no warning. */
const spotKey = (positionId, round) => `${positionId}\u0000${fold(round)}`;
// " in round 2", or nothing at all: a plan that uses no rounds must read
// exactly as it did before rounds existed.
const roundPhrase = (round) => (fold(round) ? ` in round ${String(round).trim()}` : '');
/* Whether one spot-and-round bucket is taken twice over: two or more routes
   in a spot that exists and is not shared on purpose (Many cars, the Garage).
   One rule for the warnings and the parking map, so they never disagree. */
const doubleBooked = (entries) => {
  if (!entries || entries.length < 2) return false;
  const pos = byId(state.positions, entries[0].r.positionId);
  return !!pos && !pos.multi;
};

function usage() {
  // Null-prototype, because ids come from imported files: a car id of
  // '__proto__' would otherwise resolve to Object.prototype, skip the ??=,
  // and throw on every render with the bad data already saved.
  const cars = Object.create(null), pos = Object.create(null), spots = Object.create(null);
  state.routes.forEach((r, at) => {
    if (r.carId) (cars[r.carId] ??= []).push({ r, at });
    // Two maps, because two different questions get asked of them: `pos` is
    // "is this spot in use at all", which is what a spot's status and the rail
    // care about, and `spots` is "is this spot taken twice over", which is
    // per round.
    if (r.positionId) {
      (pos[r.positionId] ??= []).push({ r, at });
      (spots[spotKey(r.positionId, r.round)] ??= []).push({ r, at });
    }
  });
  return { cars, pos, spots };
}

/* ---------- the round hiding inside a spot's name ----------
   Before a route carried a round of its own, the round was written into the
   spot's name the way it is written by hand on the pillar sheet: "Spot 1/1"
   is spot one, round one. Both of those names are the same physical spot, so
   taking the round back out is a merge and not a rename — "Spot 1/1" and
   "Spot 1/2" end as one "Spot 1", and every route on the one that goes has to
   be re-pointed at the one that stays.

   spotRoundPlan() only describes that: it writes nothing, and the offer reads
   out the very object that applying it works from, so what the leader agrees
   to and what is done to the data cannot drift apart. */

// "Spot 1/1" -> { base: 'Spot 1', round: '1' }, and null for a name that is
// only a name. The round stays text, exactly as a route's round is text.
function spotNameParts(name) {
  const m = /^(.*\S)\s*\/\s*(\d+)$/.exec(String(name || '').trim());
  return m ? { base: m[1], round: m[2] } : null;
}

// Which of the positions folding into one spot keeps its settings. The lowest
// round wins, so the answer does not depend on the order the list happens to
// be in — except that a position already named "Spot 1" outranks every
// numbered one: it is the name the leader already keeps, and its routes have
// no round in their name to gain.
function spotRank(m) {
  return m.round === null ? -1 : Number(m.round);
}

/* Everything the migration would do, as data. Returns spots: [] when no
   position has a round in its name, which is the answer on every PC that
   started after this shipped. Never touches what it is given. */
function spotRoundPlan(st) {
  const positions = st.positions || [];

  // Group by the name each position would end up under. A position that
  // already has no round in its name joins its group too: "Spot 1" and
  // "Spot 1/1" have to end as one spot rather than two of one name, which is
  // the very thing that makes a share code blank the position on every route.
  const groups = new Map();
  positions.forEach((p) => {
    const parts = spotNameParts(p.name);
    const base = parts ? parts.base : String(p.name || '').trim();
    if (!fold(base)) return;                      // a position named "/1" has no spot in it
    const group = groups.get(fold(base)) || [];
    group.push({ id: p.id, name: p.name, round: parts ? parts.round : null, multi: p.multi, labelId: p.labelId, note: p.note });
    groups.set(fold(base), group);
  });

  const spots = [];
  for (const members of groups.values()) {
    if (!members.some((m) => m.round !== null)) continue;        // nothing to split out
    const keep = members.reduce((a, b) => (spotRank(b) < spotRank(a) ? b : a));
    const absorbed = members.filter((m) => m !== keep && m.round !== null);
    // The settings of the absorbed positions are dropped rather than merged,
    // because there is no honest way to merge two notes or two statuses. Say
    // which ones disagree, so the offer can name what is being decided.
    const conflicts = [];
    const says = (what, get) => { if (absorbed.some((m) => get(m) !== get(keep))) conflicts.push(what); };
    says('"many cars"', (m) => m.multi === true);
    says('the status', (m) => m.labelId || '');
    says('the note', (m) => String(m.note || '').trim());
    spots.push({
      // What it is called now, and what it would be called. A position that
      // never had a round in its name keeps the name as typed.
      keepId: keep.id, keepName: keep.name, name: keep.round === null ? keep.name : spotNameParts(keep.name).base,
      round: keep.round, absorbed, conflicts,
    });
  }

  // What each position means for the routes standing on it: where they move
  // to, and the round their old spot name spelled out. Read before anything
  // is re-pointed, because re-pointing is what takes the name away.
  const moveTo = new Map();
  const roundFrom = new Map();
  for (const s of spots) {
    if (s.round !== null) roundFrom.set(s.keepId, s.round);
    for (const m of s.absorbed) { moveTo.set(m.id, s.keepId); roundFrom.set(m.id, m.round); }
  }

  // A round the leader typed is never overwritten: the name says round 1 and
  // the route says round 2 because someone moved that car, and the route is
  // the newer fact. Folded like the clash rule folds it, so a round of " "
  // counts as blank rather than as a round nobody can see.
  const tally = (routes) => {
    const out = { filled: 0, kept: 0 };
    for (const r of routes || []) {
      if (!roundFrom.has(r.positionId)) continue;
      if (fold(r.round)) out.kept++; else out.filled++;
    }
    return out;
  };

  // Templates hold a position and a round per route exactly as the day plan
  // does, so they migrate with it. Left behind, every template route on an
  // absorbed spot would come back on the next load as "pointed at a position
  // that is gone" — a saved plan quietly losing its spots.
  const templates = (st.templates || []).map((t) => ({ id: t.id, name: t.name, ...tally(t.routes) }))
    .filter((t) => t.filled || t.kept);

  return { spots, moveTo, roundFrom, routes: tally(st.routes), templates };
}

/* ---------- views ---------- */
const dash = (v) => esc(v) || '-';
const labelName = (l) => (l && l.name.trim() ? l.name : 'a status with no name');
const routeNames = (entries) => entries.map(({ r }) => dash(r.name)).join(', ');
// By position, not by id: an imported file can repeat an id, and filtering on
// it would drop a genuine twin along with the route itself.
const elsewhere = (entries, at) => (entries || []).filter((e) => e.at !== at);

/* Every logical problem in the current plan. These are advisory: a leader
   sometimes genuinely wants two routes on one car for half a day, so the
   app says so rather than refusing. */
function problems() {
  const use = usage();
  const lines = [];
  const rows = new Set();
  const named = routeNames;
  const flag = (entries) => entries.forEach(({ at }) => rows.add(at));

  for (const carId of Object.keys(use.cars)) {
    const routes = use.cars[carId];
    const car = byId(state.cars, carId);
    if (!car) continue;
    if (routes.length > 1) { lines.push(`${car.reg} is on ${routes.length} routes (${named(routes)})`); flag(routes); }
    const lab = byId(state.labels, car.labelId);
    if (lab) { lines.push(`${car.reg} is marked ${labelName(lab)} but is on ${routes.length > 1 ? 'routes' : 'route'} ${named(routes)}`); flag(routes); }
  }
  // A spot's status belongs to the spot itself, so it is said once however
  // many rounds are packed there.
  for (const posId of Object.keys(use.pos)) {
    const routes = use.pos[posId];
    const pos = byId(state.positions, posId);
    if (!pos) continue;
    const lab = byId(state.labels, pos.labelId);
    if (lab) { lines.push(`${pos.name} is marked ${labelName(lab)} but is on ${routes.length > 1 ? 'routes' : 'route'} ${named(routes)}`); flag(routes); }
  }
  // A double booking belongs to a spot and a round together. Spots flagged
  // "many cars" (the Garage) are shared on purpose and never clash.
  for (const key of Object.keys(use.spots)) {
    const routes = use.spots[key];
    if (!doubleBooked(routes)) continue;
    const pos = byId(state.positions, routes[0].r.positionId);
    lines.push(`${pos.name}${roundPhrase(routes[0].r.round)} is taken by ${routes.length} routes (${named(routes)})`);
    flag(routes);
  }
  return { lines, rows, use };
}

/* Everything a keystroke in the plan can change somewhere else on screen, as
   one string: what the warnings say, and who the rail has out on which route.
   Cheap enough to take twice per keystroke, and exact enough that a redraw
   only happens when something really did change. */
const liveSig = () => {
  const { lines, rows } = problems();
  // The rail resolves a driver by folded name, so fold here for the same
  // reason: "a. novak" becoming "A. Novak" must not read as a change.
  const atWheel = state.routes.map((r) => `${r.name}:${fold(r.driver)}`).join(',');
  return `${lines.join('|')}#${[...rows].sort().join(',')}#${atWheel}`;
};

/* ---------- the day plan's working rail ----------
   The roster and the fleet, beside the plan being made, and editable there.

   It used to sit on the left and only report; on a wide screen the space to
   the right of the table was empty and the leader had to leave the plan to
   add a name. So it moved across, widened, and became the place the day is
   actually assembled: add, rename, tag, and drag a name or a registration
   straight onto the route it is driving.

   The Drivers and Cars tabs are still the full editors — notes, day groups,
   reordering by button, who is away. This is the short way round for the
   things done while the plan is open, and nothing here is the only way to
   do anything. */

/* Which item is being dragged, and what it is over. Kept out of `state`
   because it is a gesture, not data: it must never reach a save or a share
   code. */
let dragging = null;
/* The tag menu, when one is open: { kind, id }. One at a time. */
let tagFor = null;
/* True for the moment the app itself is scrolling to keep an open tag menu in
   view, so that scroll is not read as the user scrolling its row away. */
let tagSettling = false;

const tagOpenFor = (kind, id) => tagFor && tagFor.kind === kind && tagFor.id === id;

/* The tag menu: every tag the thing can wear (a driver's from the driver
   tags, a car's from the labels), the way off, and a box to make a new one.

   It used to be drawn inside the row it belongs to, and the rows sit in a
   list that scrolls — and a scrolling box cuts off whatever crosses its edge.
   So the menu showed its first choice and the rest was only reachable by
   scrolling the list, on a two-driver roster as much as a long one. It is
   drawn in a layer of its own over the page now (#tagMenu), placed against the
   button that opened it, and nothing it sits inside can crop it. */
function tagMenu(kind, item) {
  const choice = (id, name, color, on) =>
    `<button class="tag-choice ${on ? 'on' : ''}" data-act="set-tag" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(id)}">
      <span class="dot"${color ? ` style="--c:${esc(color)}"` : ''}></span>${esc(name)}</button>`;
  return `<div class="tag-choices">
      ${choice('', 'No tag', null, !item[tagField(kind)])}
      ${tagList(kind).map((l) => choice(l.id, labelName(l), colour(l.color), item[tagField(kind)] === l.id)).join('')}
    </div>
    <div class="tag-new">
      <input id="newTagName" type="text" placeholder="New tag…" aria-label="Name for a new tag">
      <input id="newTagColor" type="color" value="#1565c0" aria-label="Colour for the new tag">
      <button class="btn" data-act="add-tag" data-kind="${kind}" data-id="${esc(item.id)}">Add</button>
    </div>`;
}

const tagAnchor = () => tagFor
  && document.querySelector(`#tab-plan [data-act="tag"][data-kind="${tagFor.kind}"][data-id="${CSS.escape(tagFor.id)}"]`);

/* Shut the menu without redrawing the plan: a redraw replaces the box the
   click that shut it has just put the caret in, and the typing is lost. */
function closeTagMenu() {
  if (!tagFor) return;
  const button = tagAnchor();
  tagFor = null;
  renderTagMenu();
  if (button) { button.classList.remove('on'); button.setAttribute('aria-expanded', 'false'); }
}

function renderTagMenu() {
  const layer = $('#tagMenu');
  const item = tagFor && byId(listFor(tagFor.kind) || [], tagFor.id);
  const anchor = tagAnchor();
  if (!item || !anchor || tab !== 'plan') {
    layer.hidden = true;
    layer.innerHTML = '';
    delete layer.dataset.for;
    return;
  }
  // A redraw while a new tag is half typed keeps what was typed, and where.
  const key = `${tagFor.kind}:${tagFor.id}`;
  const again = layer.dataset.for === key;
  const f = document.activeElement;
  const where = again && layer.contains(f)
    ? (f.id ? `#${f.id}` : f.dataset.act === 'set-tag' ? `[data-act="set-tag"][data-label="${CSS.escape(f.dataset.label)}"]` : `[data-act="${f.dataset.act}"]`)
    : null;
  const typed = again ? { name: $('#newTagName')?.value, color: $('#newTagColor')?.value, sel: f?.id === 'newTagName' ? [f.selectionStart, f.selectionEnd, f.selectionDirection] : null } : null;
  layer.innerHTML = tagMenu(tagFor.kind, item);
  layer.dataset.for = key;
  layer.setAttribute('aria-label', `Tag ${item.reg || item.name}`);
  if (typed) {
    if (typed.name) $('#newTagName').value = typed.name;
    if (typed.color) $('#newTagColor').value = typed.color;
  }
  if (where) {
    layer.querySelector(where)?.focus();
    if (typed?.sel) $('#newTagName').setSelectionRange(...typed.sel);
  }
  layer.hidden = false;
  placeTagMenu();
}

function placeTagMenu(scrolled = false) {
  const layer = $('#tagMenu');
  const anchor = tagAnchor();
  if (!anchor || layer.hidden) return;
  const a = anchor.getBoundingClientRect();
  // Scrolled out of its list, or up under the top bar or off the screen: a
  // menu pointing at nothing is worse than none, so it goes with its row. Only
  // for a scroll — a window growing shorter (a phone's keyboard coming up)
  // must not throw away a tag being typed.
  if (scrolled) {
    const list = anchor.closest('.rail-list')?.getBoundingClientRect();
    const bar = $('.topbar').getBoundingClientRect().bottom;
    if ((list && (a.bottom <= list.top || a.top >= list.bottom)) || a.bottom <= bar || a.top >= window.innerHeight) { closeTagMenu(); return; }
  }
  layer.style.maxHeight = '';
  const { left, top, tall } = besideAnchor(a, layer.offsetWidth, layer.offsetHeight, true);
  layer.style.maxHeight = `${tall}px`;
  layer.style.left = `${left + window.scrollX}px`;
  layer.style.top = `${top + window.scrollY}px`;
}

/* ---------- right-click menus ----------
   The actions for the one thing under the pointer, beside it. Every entry is
   a button the dispatcher already knows, carrying the same data-act, kind, id
   and field as the control on the page, so a menu is another way in and never
   writes anything on its own. Kept off `state` like the tag menu, and drawn
   in a layer of its own (#ctxMenu) for the same reason: opening or closing
   one saves nothing. */
let ctx = null;   // { surface, kind, id, part, tab, keyboard, at: { left, top, room }, view }

/* A menu can open a list of its own in place ("Status: OK ›"): the same
   layer, drawn as that list with ‹ Back on top, rather than a second menu
   beside it, so a mouse, the keyboard and a finger all reach it the same
   way. ctx.view names the list; nothing about it is saved. */
const ctxBack = { act: 'ctx-view', data: { view: '' }, text: '\u2039 Back' };
// The entry that opens an item's status list, saying what it has now: a
// car's or a position's label ("Status"), a driver's own tag ("Tag").
const ctxStatusWords = (kind) => (kind === 'driver' ? ['Tag', 'No tag'] : ['Status', 'OK']);
const ctxStatusOpen = (kind, item) => {
  const [head, none] = ctxStatusWords(kind);
  const on = byId(tagList(kind), item[tagField(kind)]);
  return { act: 'ctx-view', data: { view: 'status' }, text: `${head}: ${on ? labelName(on) : none}` };
};
// None, then every label or driver tag, the current one ticked: the chips'
// own setLabel, which writes the field that kind uses.
const ctxStatusList = (kind, item) => {
  const f = tagField(kind), none = ctxStatusWords(kind)[1];
  return [
    { act: 'setLabel', data: { kind, id: item.id, label: '' }, text: `${item[f] ? '' : '\u2713 '}${none}` },
    ...tagList(kind).map((l) => ({ act: 'setLabel', data: { kind, id: item.id, label: l.id }, text: `${item[f] === l.id ? '\u2713 ' : ''}${labelName(l)}` })),
  ];
};
// Where a keyboard open's focus goes back to: a selector, never an element,
// since a redraw replaces them all.
let ctxReturn = null;

// Where a menu opens, tried in this order; the item is the one the row's ✕
// deletes, so no row needs markup of its own.
const CTX_ROWS = [
  ['route', '#tab-plan tr[data-route]'],
  ['rail', '#tab-plan .rail-row'],
  ['drivers', '#tab-drivers tbody tr'],
  ['cars', '#tab-cars tbody tr'],
  ['positions', '#tab-positions tbody tr'],
  ['labels', '#labelList tbody tr'],
  ['driverTags', '#driverTagList tbody tr'],
  ['template', '#tab-plan .tpl'],
];
// The inputs a right-click opens the row's menu on. A text box is one of them
// (owner, 2026-09-30: the route's name and driver are where a route's menu is
// reached for); the browser's Cut, Copy and Paste stay one step away, with
// Shift held or text selected in the box. Any other kind of box (a date, a
// colour) keeps the browser's menu.
const CTX_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range']);
const CTX_TEXT = new Set(['text', 'search']);

// Every data-* attribute, as a selector: the entries of one menu differ only
// in some of them (Mark and Gap in data-field).
const dataSelector = (el) => Object.entries(el.dataset)
  .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${CSS.escape(v)}"]`).join('');

const routeTitle = (r) => `Route ${r.name.trim() || '-'}`;

// Go to: where it leads is in data-go-*, never in data-kind, id or field, so
// no lookup for a box on the page can ever find a menu entry instead.
const ctxGo = (text, tab, kind, id, field) =>
  ({ act: 'go', data: { 'go-tab': tab, 'go-kind': kind, 'go-id': id, 'go-field': field }, text });

/* One entry. A destructive one carries its confirmTwice key in data-arm and
   has two lines from the start, the act and what it costs, so arming it
   changes words and never its size: the confirming click lands where the
   first one did. A disabled one carries no data-act at all. */
function ctxEntry(s) {
  const cost = s.cost ? `<small class="ctx-cost">${esc(s.cost)}</small>` : '';
  if (s.off) return `<button type="button" class="ctx-item" role="menuitem" tabindex="-1" aria-disabled="true"><span>${esc(s.text)}</span>${cost}</button>`;
  const on = !!s.arm && armed === s.arm;
  const data = Object.entries(s.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  // An entry that opens a submenu carries its arrow at the right-hand edge,
  // as a desktop menu shows one.
  const opens = s.act === 'ctx-view' && s.data && s.data.view;
  const label = opens ? `<span class="ctx-row">${esc(s.text)} <span class="ctx-arrow" aria-hidden="true">\u203a</span></span>`
    : `<span>${on ? 'Sure? Click again' : esc(s.text)}</span>`;
  return `<button type="button" class="ctx-item${on ? ' armed' : ''}" role="menuitem" tabindex="-1" data-act="${s.act}"${data}${s.arm ? ` data-arm="${esc(s.arm)}"` : ''}${opens ? ' aria-haspopup="menu"' : ''}>`
    + `${label}${cost}</button>`;
}

/* A route's own entries: the same two toggles as its Mark and Gap, a blank
   route above or below, and last, after a separator, the two that throw
   something away. Delete is the ✕'s own act and confirm key (so arming
   either shows "Sure?" on both) and takes the ✕'s backup; Clear is the
   day's clear on this one row, with a key and a backup of its own. */
const routeIsBlank = (r) => !r.driver && !r.carId && !r.positionId && !r.round && !r.highlight;

/* A right-click on a route's Position box: the position's own entries, then
   the spots this route could move to (owner, 2026-09-30). Free means free in
   this route's round, with no status on it; Many-cars spots always are. Five
   at most, and past that a count. */
function ctxRoutePosition(r, view) {
  const pos = byId(state.positions, r.positionId);
  if (pos && view === 'status') return [[ctxBack], ctxStatusList('position', pos)];
  const own = [];
  if (pos) {
    own.push(ctxGo(`Go to ${pos.name} on the Positions tab`, 'positions', 'position', pos.id, 'name'));
    if (document.querySelector(`#planMap [data-position="${CSS.escape(pos.id)}"]`)) {
      own.push({ act: 'show-map', data: { kind: 'position', id: pos.id }, text: 'Show on the parking map' });
    }
    own.push(ctxStatusOpen('position', pos));
    own.push({ act: 'toggle', data: { kind: 'position', id: pos.id, field: 'multi' }, text: pos.multi ? 'Stop allowing many cars' : 'Allow many cars' });
    own.push({ act: 'take-off', data: { kind: 'route', id: r.id, take: 'positionId', was: pos.id }, text: `Take ${pos.name} off route ${r.name.trim() || '-'}` });
  }
  const { spots } = usage();
  const free = state.positions.filter((p) => p.id !== r.positionId && !p.labelId
    && (p.multi || !(spots[spotKey(p.id, r.round)] || []).length));
  const round = String(r.round || '').trim();
  const moves = free.slice(0, 5).map((p) => ({ act: 'move-pos', data: { kind: 'route', id: r.id, value: p.id, was: r.positionId || '' },
    text: `${pos ? 'Move to' : 'Put on'} ${p.name}`, cost: p.multi ? 'Many cars' : round ? `Free in round ${round}` : 'Free' }));
  if (free.length > 5) moves.push({ off: true, text: `${free.length - 5} more free` });
  return [own, moves];
}

function ctxRoute(r, part, view) {
  const d = { kind: 'route', id: r.id };
  const on = [r.driver.trim(), byId(state.cars, r.carId)?.reg, spotCell(r)].filter(Boolean);
  const clear = { act: 'clear-route', data: d, arm: `clear:${r.id}`, text: 'Clear driver, car, position and round',
    cost: `${routeTitle(r)} only.${r.highlight ? ' The pink mark goes too.' : ''}` };
  // Right-clicked on its car or its position: the way to that one first. On
  // its car or its driver, that one's status or tag too: the list its own
  // tab's menu opens (owner, 2026-10-01). A driver is the roster entry of
  // that name; a name typed that is on no roster has no tag to set.
  const car = part === 'carId' && byId(state.cars, r.carId);
  const driver = part === 'driver' && fold(r.driver) && state.drivers.find((x) => fold(x.name) === fold(r.driver));
  if (part === 'positionId' && view === 'status' && byId(state.positions, r.positionId)) return ctxRoutePosition(r, view);
  if (view === 'status' && car) return [[ctxBack], ctxStatusList('car', car)];
  if (view === 'status' && driver) return [[ctxBack], ctxStatusList('driver', driver)];
  const [posOwn, posMoves] = part === 'positionId' ? ctxRoutePosition(r) : [[], []];
  return [[
    car && ctxGo(`Go to ${car.reg} on the Cars tab`, 'cars', 'car', car.id, 'reg'),
    car && ctxStatusOpen('car', car),
    driver && ctxStatusOpen('driver', driver),
  ].filter(Boolean), posOwn, posMoves, [
    { act: 'toggle', data: { ...d, field: 'highlight' }, text: r.highlight ? 'Remove the pink mark' : 'Mark pink on the printout' },
    { act: 'toggle', data: { ...d, field: 'gapBefore' }, text: r.gapBefore ? 'Remove the blank line above' : 'Add a blank line above' },
  ], [
    { act: 'insert-route', data: { ...d, where: 'above' }, text: 'Insert route above' },
    { act: 'insert-route', data: { ...d, where: 'below' }, text: 'Insert route below' },
  ], [
    routeIsBlank(r) ? { ...clear, off: true, cost: 'Nothing on it to clear' } : clear,
    { act: 'del', data: d, arm: `del:${r.id}`, text: 'Delete route', cost: on.length ? on.join(', ') : 'Nothing on it yet' },
  ]];
}

/* The routes an item is on, as Go to entries: one each for one or two, and
   past that a single line saying how many, which keeps every menu short. */
function ctxRoutes(on, field) {
  if (on.length > 2) return [{ off: true, text: `On ${on.length} routes` }];
  return on.map(({ r }) => ctxGo(`Go to route ${r.name.trim() || '-'}`, 'plan', 'route', r.id, field));
}

/* Take off route 7: that one field emptied on that one route, only while the
   route still holds the item (data-was); no confirm and no backup, like the
   car grid's No car. Kept apart from Go to, and not offered past two. */
function ctxTakeOff(on, take, was) {
  if (on.length > 2) return [];
  return on.map(({ r }) => ({ act: 'take-off', data: { kind: 'route', id: r.id, take, was }, text: `Take off route ${r.name.trim() || '-'}` }));
}

// "route 7", "2 routes": the routes half of a cost line.
const ctxRouteCount = (on) => (on.length === 1 ? `route ${on[0].r.name.trim() || '-'}` : `${on.length} routes`);

/* Put on route N, in the rail: for a driver or car on no route yet, the
   routes still missing one, in plan order, as a drop onto the row would set
   them. Four at most, and past that a line saying how many more. */
function ctxPutOn(take, value) {
  const free = state.routes.filter((r) => (take === 'driver' ? !fold(r.driver) : !r.carId));
  const out = free.slice(0, 4).map((r) => ({ act: 'put-on', data: { kind: 'route', id: r.id, take, value }, text: `Put on route ${r.name.trim() || '-'}` }));
  if (free.length > 4) out.push({ off: true, text: `${free.length - 4} more route${free.length - 4 === 1 ? '' : 's'} without one` });
  return out;
}

/* A driver, in the rail or on the Drivers tab. Deleting one takes it out of
   every day group, and only that: the day plan keeps the name typed in. In
   the rail it also offers a free route, the driver's usual days (the Drivers
   tab's day buttons, crew-day) and the way to its Drivers tab row, since the
   rail is where the plan is made (owner, 2026-09-30). */
function ctxDriver(d, surface, view) {
  const d0 = { kind: 'driver', id: d.id };
  if (view === 'status') return [[ctxBack], ctxStatusList('driver', d)];
  const on = driverUsage()[fold(d.name)] || [];
  const groups = state.driverGroups.filter((g) => g.driverIds.includes(d.id)).length;
  const rail = surface === 'rail';
  const { byDay } = dayCrews();
  return [[
    { act: 'toggle', data: { ...d0, field: 'available' }, text: d.available ? 'Set away' : 'Bring back in' },
    // Its tag, on the Drivers tab and in the rail alike; Tag… (the tag menu,
    // with its box for a new tag) only where it opens, in the rail.
    ctxStatusOpen('driver', d),
    rail && { act: 'tag', data: d0, text: 'Tag\u2026' },
  ].filter(Boolean), [
    ...(rail && !on.length ? ctxPutOn('driver', d.name) : ctxRoutes(on, 'driver')),
    rail && ctxGo(`Go to ${d.name.trim() || '-'} on the Drivers tab`, 'drivers', 'driver', d.id, 'name'),
  ].filter(Boolean), ctxTakeOff(on, 'driver', d.name),
  rail ? WORK_WEEK.map((day) => {
    const works = !!byDay.get(day)?.driverIds.includes(d.id);
    return { act: 'crew-day', data: { ...d0, day: String(day) }, text: `${works ? '\u2713 ' : ''}Works ${WEEKDAYS[day]}s` };
  }) : [], [
    { act: 'del', data: d0, arm: `del:${d.id}`, text: 'Delete driver',
      cost: `${groups ? `Taken out of ${plural(groups, 'day group')}` : 'In no day group'}. Routes keep the name.` },
  ]];
}

/* A car, in the rail or on the Cars tab. Deleting one takes it off every
   route and template, which is what the cost line counts. */
function ctxCar(c, surface, view) {
  const c0 = { kind: 'car', id: c.id };
  const on = usage().cars[c.id] || [];
  const tpl = state.templates.filter((t) => t.routes.some((r) => r.carId === c.id)).length;
  const cost = on.length && tpl ? `On ${ctxRouteCount(on)} and in ${plural(tpl, 'template')}`
    : on.length ? `On ${ctxRouteCount(on)}` : tpl ? `In ${plural(tpl, 'template')}` : 'Not used anywhere';
  const rail = surface === 'rail';
  // In the rail, its status in one click (the Cars tab's chips, setLabel),
  // with the one it has ticked; Tag… is still there for a new tag.
  if (view === 'status') return [[ctxBack], ctxStatusList('car', c)];
  // Its status, in the rail and on the Cars tab alike; Tag… (a new tag) only
  // where the tag menu opens, in the rail.
  const status = rail ? [ctxStatusOpen('car', c), { act: 'tag', data: c0, text: 'Tag\u2026' }] : [ctxStatusOpen('car', c)];
  return [
    status,
    // Its note can only be changed on the Cars tab.
    [...(rail && !on.length ? ctxPutOn('carId', c.id) : ctxRoutes(on, 'carId')), rail && ctxGo(`Go to ${c.reg} on the Cars tab`, 'cars', 'car', c.id, 'reg')].filter(Boolean),
    ctxTakeOff(on, 'carId', c.id),
    [{ act: 'del', data: c0, arm: `del:${c.id}`, text: 'Delete car', cost }],
  ];
}

/* A position. Its Go to entries are the only place that says which routes use
   it. Many cars is the tab's own tick: turning it off can bring clash
   warnings back, which warn and never block. */
function ctxPosition(p) {
  const p0 = { kind: 'position', id: p.id };
  const on = usage().pos[p.id] || [];
  const tpl = state.templates.filter((t) => t.routes.some((r) => r.positionId === p.id)).length;
  const used = [on.length && ctxRouteCount(on), tpl && plural(tpl, 'template')].filter(Boolean);
  return [
    [{ act: 'toggle', data: { ...p0, field: 'multi' }, text: p.multi ? 'Stop allowing many cars' : 'Allow many cars' }],
    ctxRoutes(on, 'positionId'),
    ctxTakeOff(on, 'positionId', p.id),
    [{ act: 'del', data: p0, arm: `del:${p.id}`, text: 'Delete position', cost: used.length ? `Used by ${andList(used)}` : 'Not used anywhere' }],
  ];
}

/* A label: its printout tick, offered where the tab offers it, and its delete,
   which takes it off every car and position wearing it. Drivers wear driver
   tags, so they are counted only under a store.js from before those. */
function ctxLabel(l) {
  const l0 = { kind: 'label', id: l.id };
  const counts = [['car', state.cars], ['position', state.positions], ['driver', state.drivers]]
    .filter(([word]) => tagList(word) === state.labels)
    .map(([word, list]) => [word, list.filter((x) => x[tagField(word)] === l.id).length]).filter(([, n]) => n);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  const cost = total ? `${andList(counts.map(([word, n]) => plural(n, word)))} ${total === 1 ? 'has' : 'have'} it` : 'Nothing has it';
  return [
    Store.SCHEMA >= 5 ? [{ act: 'toggle', data: { ...l0, field: 'onSheet' }, text: l.onSheet === true ? 'Stop showing on the printout' : 'Show on the printout' }] : [],
    [{ act: 'del', data: l0, arm: `del:${l.id}`, text: 'Delete label', cost }],
  ];
}

/* A driver tag: only its delete, which takes it off every driver wearing it. */
function ctxDriverTag(t) {
  const n = state.drivers.filter((d) => d.tagId === t.id).length;
  return [[{ act: 'del', data: { kind: 'driverTag', id: t.id }, arm: `del:${t.id}`, text: 'Delete driver tag',
    cost: n ? `${plural(n, 'driver')} ${n === 1 ? 'has' : 'have'} it` : 'No driver has it' }]];
}

/* A template card, its open contents included. Load only asks, as the name
   button does: the question's own Load is the only thing that writes. An
   empty template has nothing to load or show, as on its card. */
function ctxTemplate(t) {
  const t0 = { kind: 'template', id: t.id };
  return [t.routes.length ? [
    { act: 'ask-template', data: t0, text: 'Load\u2026' },
    { act: 'peek-template', data: t0, text: tplOpen === t.id ? 'Hide contents' : 'Show contents' },
  ] : [], [
    { act: 'resave-template', data: t0, arm: `resave:${t.id}`, text: 'Save the plan into it',
      cost: t.routes.length ? `Its ${plural(t.routes.length, 'route')} ${t.routes.length === 1 ? 'becomes' : 'become'} the plan's ${state.routes.length}`
        : `It holds nothing yet; it becomes the plan's ${plural(state.routes.length, 'route')}` },
    { act: 'del', data: t0, arm: `del:${t.id}`, text: 'Delete template', cost: `${plural(t.routes.length, 'route')}. The plan is not touched.` },
  ]];
}

// Each surface's menu: the header's name, and the entries in groups that a
// separator divides.
const CTX_MENUS = {
  route: (r, c) => ({ name: routeTitle(r), groups: ctxRoute(r, c.part, c.view) }),
  rail: (x, c) => (c.kind === 'car'
    ? { name: x.reg.trim() || '-', groups: ctxCar(x, 'rail', c.view) }
    : { name: x.name.trim() || '-', groups: ctxDriver(x, 'rail', c.view) }),
  drivers: (d, x) => ({ name: d.name.trim() || '-', groups: ctxDriver(d, 'drivers', x.view) }),
  cars: (c, x) => ({ name: c.reg.trim() || '-', groups: ctxCar(c, 'cars', x.view) }),
  positions: (p) => ({ name: p.name.trim() || '-', groups: ctxPosition(p) }),
  labels: (l) => ({ name: labelName(l), groups: ctxLabel(l) }),
  driverTags: (t) => ({ name: labelName(t), groups: ctxDriverTag(t) }),
  template: (t) => ({ name: t.name.trim() || '-', groups: ctxTemplate(t) }),
};

/* Drawn from `state` on every render, so its words, its "Sure?" and its
   disabled entries are always current; it goes when its item or its tab
   does. Where it sits is kept from the open and never worked out again, so a
   redraw never moves it. */
function renderCtxMenu() {
  const layer = $('#ctxMenu');
  // An index.html cached from before the menus has no layer: no menu, and
  // the page draws as it did.
  if (!layer) { ctx = null; return; }
  const item = ctx && ctx.tab === tab && byId(listFor(ctx.kind) || [], ctx.id);
  if (!item) {
    ctx = null;
    layer.hidden = true;
    layer.innerHTML = '';
    renderCtxSub(null);
    return;
  }
  // Put back on the entry it was on, found by what it is.
  const f = document.activeElement;
  const kept = f && f !== layer && layer.contains(f) ? dataSelector(f) : null;
  const { name, groups } = CTX_MENUS[ctx.surface](item, ctx);
  layer.innerHTML = `<p class="ctx-head" role="none" aria-hidden="true">${esc(name)}</p>`
    + groups.filter((g) => g.length).map((g) => g.map(ctxEntry).join('')).join('<div class="ctx-sep" role="separator"></div>');
  layer.setAttribute('aria-label', `Actions for ${name}`);
  layer.hidden = false;
  if (ctx.at) {
    layer.style.left = `${ctx.at.left}px`;
    layer.style.top = `${ctx.at.top}px`;
    layer.style.maxHeight = `${ctx.at.room}px`;
  }
  if (kept) layer.querySelector(kept)?.focus({ preventScroll: true });
  renderCtxSub(item);
}

/* A submenu, the way a desktop menu opens one: a second menu to the right
   of its entry (to the left when the window has no room there), opened by
   hovering the entry, clicking it, or ArrowRight. Its entries are the same
   list the in-place view draws, without ‹ Back. Where neither side has room
   (a phone), it is the in-place view instead (owner, 2026-09-30). Drawn in
   a layer of its own, made the first time it is needed, so an index.html
   from before it still works. */
function ctxSubLayer() {
  let sub = document.getElementById('ctxSub');
  if (sub) return sub;
  sub = document.createElement('div');
  sub.id = 'ctxSub';
  sub.className = 'ctx-menu ctx-sub';
  sub.setAttribute('role', 'menu');
  sub.tabIndex = -1;
  sub.hidden = true;
  document.body.appendChild(sub);
  sub.addEventListener('click', ctxChoose);
  sub.addEventListener('mouseenter', () => clearTimeout(ctxHoverTimer));
  sub.addEventListener('mousemove', ctxHoverFocus);
  return sub;
}
const inCtx = (t) => !!t && ($('#ctxMenu')?.contains(t) || document.getElementById('ctxSub')?.contains(t));

function renderCtxSub(item) {
  const sub = document.getElementById('ctxSub');
  const opener = ctx && ctx.sub && $(`#ctxMenu [data-act="ctx-view"][data-view="${CSS.escape(ctx.sub)}"]`);
  if (!item || !opener) {
    if (ctx) ctx.sub = null;
    if (sub) { sub.hidden = true; sub.innerHTML = ''; }
    return;
  }
  const layer = ctxSubLayer();
  const f = document.activeElement;
  const kept = f && layer.contains(f) ? dataSelector(f) : null;
  const { groups } = CTX_MENUS[ctx.surface](item, { ...ctx, view: ctx.sub });
  const list = groups.filter((g) => g.length && !g.some((s) => s.act === 'ctx-view'));
  layer.innerHTML = list.map((g) => g.map(ctxEntry).join('')).join('<div class="ctx-sep" role="separator"></div>');
  layer.setAttribute('aria-label', opener.textContent.replace(/\s*\u203a\s*$/, ''));
  layer.style.maxHeight = '';
  layer.hidden = false;
  opener.classList.add('open');
  opener.setAttribute('aria-expanded', 'true');
  const m = $('#ctxMenu').getBoundingClientRect(), a = opener.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const w = layer.offsetWidth, h = layer.offsetHeight;
  let left = m.right - 2;
  if (left + w > vw - 8) left = m.left - w + 2;
  if (left < 8) {
    // No room on either side: the list takes the menu's place instead.
    layer.hidden = true;
    layer.innerHTML = '';
    ctx.view = ctx.sub;
    ctx.sub = null;
    renderCtxMenu();
    $('#ctxMenu [role="menuitem"]:not([aria-disabled])')?.focus({ preventScroll: true });
    return;
  }
  const top = Math.max(8, Math.min(a.top - 5, vh - h - 8));
  layer.style.left = `${left + window.scrollX}px`;
  layer.style.top = `${top + window.scrollY}px`;
  layer.style.maxHeight = `${vh - 16}px`;
  if (kept) layer.querySelector(kept)?.focus({ preventScroll: true });
}

let ctxHoverTimer = null;
// Whether a submenu fits beside the menu, on either side.
function ctxSubFits() {
  const m = $('#ctxMenu').getBoundingClientRect();
  const vw = document.documentElement.clientWidth, w = Math.min(280, vw - 16);
  return m.right - 2 + w <= vw - 8 || m.left - w + 2 >= 8;
}
function ctxOpenSub(view, focusFirst) {
  clearTimeout(ctxHoverTimer);
  if (!ctx) return;
  ctx.view = null;
  ctx.sub = view;
  renderCtxMenu();
  if (focusFirst) document.querySelector('#ctxSub [role="menuitem"]:not([aria-disabled])')?.focus({ preventScroll: true });
}
function ctxCloseSub(focusOpener) {
  clearTimeout(ctxHoverTimer);
  if (!ctx || !ctx.sub) return;
  const view = ctx.sub;
  ctx.sub = null;
  renderCtxMenu();
  if (focusOpener) $(`#ctxMenu [data-act="ctx-view"][data-view="${CSS.escape(view)}"]`)?.focus({ preventScroll: true });
}

/* Placed once, when it opens, against `a` (screen coordinates): the pointer,
   or the control the keyboard opened it from. Opened upwards, it keeps the
   height it was given, since its top is fixed; opened downwards, it may grow
   into the room below, and scrolls inside itself past that. */
function placeCtxMenu(a) {
  const layer = $('#ctxMenu');
  layer.style.maxHeight = '';
  const { left, top, tall, up } = besideAnchor(a, layer.offsetWidth, layer.offsetHeight);
  const room = up ? tall : Math.max(tall, window.innerHeight - a.bottom - 10);
  ctx.at = { left: left + window.scrollX, top: top + window.scrollY, room };
  renderCtxMenu();
}

/* Shut it without redrawing the page, as closeTagMenu does, so the click
   that shut it still lands. */
function closeCtxMenu() {
  if (!ctx) return;
  ctx = null;
  renderCtxMenu();
}

// The row a right-click is in, and the item it is for; null for anywhere else.
function ctxHit(t) {
  for (const [surface, sel] of CTX_ROWS) {
    const row = t.closest(sel);
    if (!row) continue;
    const del = row.querySelector('[data-act="del"][data-kind][data-id]');
    if (!del) return null;
    const part = surface === 'route' ? t.closest('select[data-field="carId"], select[data-field="positionId"], input[data-field="driver"]')?.dataset.field || '' : '';
    return { row, surface, kind: del.dataset.kind, id: del.dataset.id, part };
  }
  return null;
}

/* One row of the rail: grip, status dot, the name as an editable box, where
   it is today, and the two buttons that act on it. */
function railRow(kind, item, label, where, extra = '', cls = '') {
  const lab = tagOf(kind, item);
  const field = kind === 'car' ? 'reg' : 'name';
  const title = [item[field], lab && labelName(lab), item.note].filter(Boolean).join(' · ');
  return `<li class="rail-row ${cls} ${armed === `del:${item.id}` ? 'arming' : ''}" draggable="true"
      data-drag="${kind}" data-id="${esc(item.id)}" title="${esc(title)}">
    <span class="grip" aria-hidden="true">⠿</span>
    <span class="dot"${lab ? ` style="--c:${esc(colour(lab.color))}"` : ''} title="${esc(lab ? labelName(lab) : 'No tag')}"></span>
    <input class="rail-name" type="text" data-kind="${kind}" data-id="${esc(item.id)}" data-field="${field}"
      value="${esc(item[field])}" aria-label="${label}">
    ${where}
    ${extra}
    <button class="btn tag-btn ${tagOpenFor(kind, item.id) ? 'on' : ''}" data-act="tag" data-kind="${kind}" data-id="${esc(item.id)}"
      title="Tag ${esc(item[field])}" aria-label="Tag ${esc(item[field])}" aria-haspopup="true" aria-expanded="${!!tagOpenFor(kind, item.id)}">🏷</button>
    ${actBtn('del', kind, item.id, armed === `del:${item.id}` ? 'Sure?' : '✕', armed === `del:${item.id}` ? 'armed' : '', `title="Delete ${esc(item[field])}"`)}
  </li>`;
}

function railCars(use) {
  const rows = state.cars.map((c) => {
    const lab = byId(state.labels, c.labelId);
    const on = use.cars[c.id];
    // The same sentence the Cars tab prints in its "Assigned to" column,
    // shortened to what fits: the route number is the bit you look for.
    const where = on
      ? `<span class="assign yes">Route ${routeNames(on)}</span>`
      : `<span class="assign ${lab ? 'down' : 'none'}">${lab ? esc(labelName(lab)) : 'Free'}</span>`;
    return railRow('car', c, 'Registration', where);
  }).join('');
  const out = state.cars.filter((c) => use.cars[c.id]).length;
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).length;
  return `<section class="rail-panel" data-panel="cars">
    <h3>Cars${infoBtn('plan-cars')} <span class="rail-count">${out} out · ${free} free</span></h3>
    <div class="rail-add">
      <input id="railCar" type="text" placeholder="Registration(s)" aria-label="Add a registration">
      <button class="btn" data-act="add-car" data-from="#railCar" title="Add to the fleet">+</button>
    </div>
    ${state.cars.length
      ? `<ul class="rail-list" data-drop="car" data-keep-scroll="cars">${rows}</ul>`
      : '<p class="rail-empty">No cars yet. Type a registration above — or paste the whole fleet at once, separated by spaces.</p>'}
  </section>`;
}

/* Routes are keyed by the driver's name, folded: the day plan's driver box is
   free text and always will be, so the roster recognises a name rather than
   owning it. Someone written in who is not on the roster still drives. */
function driverUsage() {
  const by = Object.create(null);
  state.routes.forEach((r, at) => {
    const k = fold(r.driver);
    if (k) (by[k] ??= []).push({ r, at });
  });
  return by;
}

/* Who is in today, and what they have been given. Availability is the day's,
   so it is what the rail shows; the roster itself lives on the Drivers tab. */
/* The whole roster, not only who is in: the panel is where a driver is added
   and tagged, and someone who is away has to be reachable to be brought back.
   The away ones are dimmed and sorted under the ones who are in, so the day's
   crew still reads first. */
/* A driver's usual days in the Drivers panel, short: "Mon Tue", with a run
   of three or more joined ("Mon–Wed", "Mon–Fri"). Read from the weekday
   groups, as the Drivers tab's day buttons and the week read them. Nothing
   for a driver in no weekday's group. */
function railDays(d, byDay) {
  const on = WORK_WEEK.filter((day) => byDay.get(day)?.driverIds.includes(d.id));
  if (!on.length) return '';
  const runs = [];
  for (const day of on) {
    const last = runs[runs.length - 1];
    if (last && day === last[1] + 1) last[1] = day; else runs.push([day, day]);
  }
  const short = (day) => WEEKDAYS[day].slice(0, 3);
  const text = runs.map(([a, b]) => (b - a >= 2 ? `${short(a)}\u2013${short(b)}` : a === b ? short(a) : `${short(a)} ${short(b)}`)).join(' ');
  return `<span class="rail-days" title="Usual days: ${esc(andList(on.map((day) => WEEKDAYS[day])))}">${text}</span>`;
}

function railDrivers() {
  const assigned = driverUsage();
  const { byDay: usual } = dayCrews();
  const inToday = state.drivers.filter((d) => d.available);
  const ordered = [...state.drivers].sort((a, b) => Number(b.available) - Number(a.available));
  const rows = ordered.map((d) => {
    const on = assigned[fold(d.name)];
    const where = on
      ? `<span class="assign yes">Route ${routeNames(on)}</span>`
      : `<span class="assign ${d.available ? 'none' : 'away'}">${d.available ? 'Free' : 'Away'}</span>`;
    const inOut = actBtn('toggle', 'driver', d.id, d.available ? '\u2713' : '\u21ba', d.available ? 'on' : '',
      `data-field="available" title="${d.available ? 'In \u2014 click to set away' : 'Away \u2014 click to bring back in'}"`);
    // Someone marked away who is still written into a route keeps the route
    // badge — that is the fact worth seeing, and the one most likely to be a
    // mistake — so the row itself carries the away state, not the badge.
    return railRow('driver', d, 'Driver name', railDays(d, usual) + where, inOut, d.available ? '' : 'away');
  }).join('');
  const away = state.drivers.length - inToday.length;
  const { byDay } = dayCrews();
  // The chip line: All, then every crew with no column under the route list —
  // Saturday's and Sunday's, a second crew for a day, groups that are no day —
  // in the Drivers tab's order. Monday to Friday's crews are the week's.
  const everyone = inToday.length === state.drivers.length;
  const all = actBtn('all-in', '', '', 'All', everyone ? 'on' : '', `aria-pressed="${everyone}" title="Put everyone on the roster in"`);
  const noColumn = state.driverGroups.filter((g) => { const day = groupWeekday(g.name); return !(WORK_WEEK.includes(day) && byDay.get(day) === g); });
  const groups = noColumn.map((g) => {
    const ids = crewIds(g);
    if (!ids.size) {
      return actBtn('group-empty', 'driverGroup', g.id, esc(g.name), 'quiet', 'title="Nobody in this group yet"');
    }
    const on = crewInForce(ids);
    return actBtn('apply-group', 'driverGroup', g.id, esc(g.name), on ? 'on' : '',
      `aria-pressed="${on}" title="${ids.size} driver${ids.size === 1 ? '' : 's'} — click to make them the ones in"`);
  }).join('');
  return `<section class="rail-panel" data-panel="drivers">
    <h3>Drivers${infoBtn('plan-drivers')} <span class="rail-count">${inToday.length} in${away ? ` \u00b7 ${away} away` : ''}</span></h3>
    ${state.drivers.length ? `<p class="rail-groups" role="group" aria-label="Who is in">${all}${groups}</p>` : ''}
    ${dayQuestion()}
    <div class="rail-add">
      <input id="railDriver" type="text" placeholder="Name(s), comma separated" aria-label="Add a driver">
      <button class="btn" data-act="add-driver" data-from="#railDriver" title="Add to the roster">+</button>
    </div>
    ${state.drivers.length
      ? `<ul class="rail-list" data-drop="driver" data-keep-scroll="drivers">${rows}</ul>`
      : '<p class="rail-empty">Nobody on the roster yet. Add the names you plan with — they become suggestions in the table, and you can drag them onto a route.</p>'}
  </section>`;
}

/* The question an empty crew's chip asks, in the Drivers panel rather than
   as a notice above the page, so nothing above the week moves. Kept off
   `state`: it is a conversation, not data. It goes by itself once the group
   has names, or is gone. */
let dayAsk = null;   // { groupId }

function dayQuestion() {
  if (!dayAsk || !dayAsk.groupId || !state.drivers.length) return '';
  const g = byId(state.driverGroups, dayAsk.groupId);
  if (!g || crewIds(g).size) return '';
  const close = '<button class="btn" data-act="day-ask-close" aria-label="Close" title="Close">✕</button>';
  return `<div class="day-ask" role="status"><span>${esc(g.name.trim() || 'That group')} has nobody in it yet. Tick names into it on the Drivers tab.</span><span class="acts">${close}</span></div>`;
}

/* Where each of the plan's scrolling lists was left. Taken from the lists'
   own scroll events, not read at redraw time: a redraw made while another tab
   is showing reads a hidden list, and a hidden list always says 0 — which is
   how a trip to the Drivers tab used to send both rail lists back to the top. */
const planScroll = Object.create(null);
document.addEventListener('scroll', (e) => {
  const key = e.target?.dataset?.keepScroll;
  if (key) planScroll[key] = { top: e.target.scrollTop, left: e.target.scrollLeft };
}, true);

function renderPlan() {
  const { lines: found, rows: flagged, use } = problems();
  const rows = state.routes.map((r, at) => {
    const warns = [];
    // Options stay pickable even when they clash; the note says what you are
    // walking into and the row flags it afterwards.
    const carOpts = [...state.cars].sort((a, b) => collate(a.reg, b.reg)).map((c) => {
      const lab = byId(state.labels, c.labelId);
      const others = elsewhere(use.cars[c.id], at);
      const bits = [lab && labelName(lab), others.length && `on route ${routeNames(others)}`].filter(Boolean);
      const sel = c.id === r.carId;
      if (sel && lab) warns.push(`${c.reg} is marked ${labelName(lab)}`);
      if (sel && others.length) warns.push(`${c.reg} is also on route ${routeNames(others)}`);
      return `<option value="${esc(c.id)}" ${sel ? 'selected' : ''}>${esc(c.reg + (bits.length ? ` \u00b7 ${bits.join(' \u00b7 ')}` : ''))}</option>`;
    }).join('');
    const posOpts = state.positions.map((p) => {
      const lab = byId(state.labels, p.labelId);
      // Scoped to this row's round: the question the note answers is "what am
      // I walking into if I put *this* route here", and a route packed in
      // another round is not in the way.
      const others = p.multi ? [] : elsewhere(use.spots[spotKey(p.id, r.round)], at);
      const bits = [lab && labelName(lab), others.length && `route ${routeNames(others)}`, p.multi && 'many cars'].filter(Boolean);
      const sel = p.id === r.positionId;
      if (sel && lab) warns.push(`${p.name} is marked ${labelName(lab)}`);
      if (sel && others.length) warns.push(`${p.name}${roundPhrase(r.round)} is also used by route ${routeNames(others)}`);
      return `<option value="${esc(p.id)}" ${sel ? 'selected' : ''}>${esc(p.name + (bits.length ? ` \u00b7 ${bits.join(' \u00b7 ')}` : ''))}</option>`;
    }).join('');
    const cls = [r.highlight && 'hl', r.gapBefore && 'gap', flagged.has(at) && 'warn'].filter(Boolean).join(' ');
    return `<tr class="${cls}" data-route="${esc(r.id)}">
      <td>${field('route', r.id, 'name', r.name, 'class="short"')}</td>
      <td>${field('route', r.id, 'driver', r.driver, 'placeholder="-" autocomplete="off" aria-haspopup="true"')}</td>
      <td><select data-kind="route" data-id="${esc(r.id)}" data-field="carId"><option value="">-</option>${carOpts}</select></td>
      <td><select data-kind="route" data-id="${esc(r.id)}" data-field="positionId"><option value="">-</option>${posOpts}</select></td>
      <td>${field('route', r.id, 'round', r.round, 'class="short" placeholder="-"')}</td>
      <td class="btns">
        ${actBtn('toggle', 'route', r.id, 'Mark', r.highlight ? 'on' : '', 'data-field="highlight" title="Pink highlight on the printout"')}
        ${actBtn('toggle', 'route', r.id, 'Gap', r.gapBefore ? 'on' : '', 'data-field="gapBefore" title="Blank line above this route"')}
        ${moveDel('route', r.id)}
      </td>
      <td class="warntext">${esc(warns.join('; '))}</td>
    </tr>`;
  }).join('');

  const noCars = state.cars.length
    ? ''
    : `<p class="empty">No cars yet. Add your registrations on the <b>Cars</b> tab and they become pickable here.</p>`;

  $('#tab-plan').innerHTML = `
    ${noCars}
    ${found.length ? `<div class="problems">
      <b>${flagged.size} route${flagged.size > 1 ? 's' : ''} to look at</b>${infoBtn('plan-warnings')} \u2014 nothing is blocked, check they are on purpose.
      <ul>${found.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="bar" id="planBar">
      <label for="date">Date</label>${infoBtn('plan-date')}
      <span class="date-box">
        <button type="button" class="btn date-step" data-act="date-step" data-unit="month" data-by="-1" title="A month earlier" aria-label="A month earlier">«</button>
        <button type="button" class="btn date-step" data-act="date-step" data-unit="day" data-by="-1" title="A day earlier" aria-label="A day earlier">‹</button>
        <input id="date" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="dd/mm/yyyy" title="Click for the calendar, or type the date as dd/mm/yyyy" data-kind="meta" data-field="date" value="${esc(dateBoxText())}">
        <button type="button" class="btn date-cal" data-act="pick-date" title="Pick the date from a calendar" aria-label="Pick the date from a calendar">\u{1F4C5}</button>
        <button type="button" class="btn date-step" data-act="date-step" data-unit="day" data-by="1" title="A day later" aria-label="A day later">›</button>
        <button type="button" class="btn date-step" data-act="date-step" data-unit="month" data-by="1" title="A month later" aria-label="A month later">»</button>
        <input id="datePick" type="date" tabindex="-1" aria-hidden="true" value="${esc(parseDay(state.date) ? state.date : '')}">
      </span>
      <button class="btn" data-act="add-route">+ Add route</button>
      <button class="btn ${armed === 'clear' ? 'armed' : ''}" data-act="clear-day">${armed === 'clear' ? 'Sure? Click again' : 'Clear drivers, cars, positions and rounds'}</button>
    </div>
    ${dateHeadHtml()}
    ${dateLineHtml()}
    <div class="plan">
      <div class="plan-main">
        <div class="plan-table" data-keep-scroll="table"><table class="grid">
          <thead><tr><th>Route${infoBtn('plan-routes')}</th><th>Driver</th><th>Car</th><th>Position</th><th>Round</th><th></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${renderTemplates()}
        ${renderWeek()}
        <div id="planMap" class="plan-map">${mapSlot(use)}</div>
      </div>
      <aside class="rail">${railDrivers()}${railCars(use)}
        <p class="rail-saved">Every change here is saved as you make it.</p>
      </aside>
    </div>`;
  // The rail's lists scroll, and this redraw replaces them: without putting
  // the scroll back, every click in a long roster — tag, in or away, remove —
  // threw the list to the top and the row just clicked out of sight.
  // Put back, then write down what the list actually took: one that has
  // grown shorter cannot scroll as far, and an old position replayed into a
  // freshly pasted fleet opened it halfway down. A list not drawn at all this
  // time — emptied, or a template closed — is forgotten. Nothing is written
  // while the plan is hidden, when every list reads 0.
  const shown = tab === 'plan';
  const drawn = new Set();
  for (const el of document.querySelectorAll('#tab-plan [data-keep-scroll]')) {
    const key = el.dataset.keepScroll;
    drawn.add(key);
    const at = planScroll[key];
    if (at) { el.scrollTop = at.top; el.scrollLeft = at.left; }
    if (shown && at) planScroll[key] = { top: el.scrollTop, left: el.scrollLeft };
  }
  for (const key of Object.keys(planScroll)) if (!drawn.has(key)) delete planScroll[key];
}

/* ---------- day templates ----------
   The plan that gets made again: Monday's routes, the weekend's. A template is
   the route list as it stands minus the date, kept on this PC — it travels
   between the two managers in the exported JSON file, never in a share code. */
/* Which template is showing its contents. A name and a route count say what a
   template is called; they do not say what is in it, and "load the Monday one"
   is a question about the second. Opened one at a time, and closed by default,
   because the shelf is a shelf. */
let tplOpen = null;

/* What a template would put on the plan, as the plan reads it: the route, who
   drove it, what they drove, where it was packed. */
function templateContents(t) {
  const rows = t.routes.map((r) => {
    const car = byId(state.cars, r.carId)?.reg;
    const pos = byId(state.positions, r.positionId)?.name;
    const spot = [pos, String(r.round || '').trim()].filter(Boolean).join('/');
    return `<tr class="${r.highlight ? 'hl' : ''}">
      <td class="rn">${dash(r.name)}</td><td>${dash(r.driver)}</td>
      <td>${dash(car)}</td><td>${dash(spot)}</td></tr>`;
  }).join('');
  const gone = t.routes.filter((r) => (r.carId && !byId(state.cars, r.carId))
    || (r.positionId && !byId(state.positions, r.positionId))).length;
  return `<div class="tpl-body" data-keep-scroll="template:${esc(t.id)}">
    <table class="tpl-table">
      <thead><tr><th>Route</th><th>Driver</th><th>Car</th><th>Packing</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${gone ? `<p class="hint" style="margin:6px 0 0">${gone} route${gone === 1 ? '' : 's'} point at a car or a spot that is no longer on this PC — they load blank.</p>` : ''}
  </div>`;
}

/* A template's contents, beside its card, the way a right-click submenu opens
   beside its menu (owner, 2026-10-01): resting the mouse on a card shows
   them, moving to another card swaps them, and leaving both the card and the
   layer lets them go. The card's route count pins them open, for a click, a
   finger or the keyboard, until Esc, a click elsewhere, its ✕ or the count
   again. One layer, made on first use outside the redrawn page, so a redraw
   fills it again rather than losing it; the table keeps its scroll while it
   shows the same template. */
let tplHover = null;
let tplHoverTimer = 0;
const tplShown = () => tplOpen || tplHover;
function drawTplPeek() {
  if (tplOpen && !byId(state.templates, tplOpen)) tplOpen = null;
  if (tplHover && !byId(state.templates, tplHover)) tplHover = null;
  const t = byId(state.templates, tplShown() || '');
  const on = t && t.routes.length && tab === 'plan' ? t : null;
  document.querySelectorAll('#planTemplates .tpl-head[data-tpl]').forEach((h) => {
    h.classList.toggle('shown', !!on && h.dataset.tpl === on.id);
    h.querySelector('[data-act="peek-template"]')?.setAttribute('aria-expanded', String(!!on && tplOpen === h.dataset.tpl));
  });
  let layer = document.getElementById('tplPeek');
  if (!on) {
    if (layer) { layer.hidden = true; layer.innerHTML = ''; delete layer.dataset.tpl; delete layer.dataset.html; }
    return;
  }
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'tplPeek';
    layer.className = 'tpl-peek-layer';
    layer.setAttribute('role', 'dialog');
    document.body.append(layer);
  }
  layer.setAttribute('aria-label', `What the ${on.name} template holds`);
  const html = `<div class="tpl-peek-head"><b>${esc(on.name)}</b><span>${plural(on.routes.length, 'route')}</span>${tplOpen === on.id
    ? `<button type="button" class="btn" data-act="peek-template" data-kind="template" data-id="${esc(on.id)}" title="Close" aria-label="Close">✕</button>` : ''}</div>${templateContents(on)}`;
  if (layer.dataset.tpl !== on.id) layer.innerHTML = html;
  else if (layer.dataset.html !== html) {
    const was = layer.querySelector('.tpl-body')?.scrollTop || 0;
    layer.innerHTML = html;
    const body = layer.querySelector('.tpl-body');
    if (body) body.scrollTop = was;
  }
  layer.dataset.tpl = on.id;
  layer.dataset.html = html;
  // Shown on hover it is a glance: the pointer passes through it to the cards
  // under it, so the next card still swaps it and its Load and Save still
  // click (review, 2026-10-01). Pinned, it takes the pointer, to scroll it.
  layer.classList.toggle('pinned', tplOpen === on.id);
  layer.hidden = false;
  placeTplPeek();
}
/* Beside the card, on its right where there is room and on its left where
   not, its top level with the card's; on a screen too narrow for either,
   under or over it, as the picker opens. */
function placeTplPeek() {
  const layer = document.getElementById('tplPeek');
  if (!layer || !layer.dataset.tpl) return;
  const card = document.querySelector(`#planTemplates .tpl-head[data-tpl="${CSS.escape(layer.dataset.tpl)}"]`);
  const a = card && card.getBoundingClientRect();
  if (!a || !a.width) { layer.hidden = true; return; }
  layer.hidden = false;
  layer.style.maxHeight = '';
  const w = layer.offsetWidth, h = layer.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const ceiling = Math.max(0, $('.topbar').getBoundingClientRect().bottom) + 8;
  const side = a.right + 6 + w <= vw - 8 ? a.right + 6 : (a.left - 6 - w >= 8 ? a.left - 6 - w : null);
  let left, top, tall;
  if (side !== null) {
    left = side;
    tall = Math.max(0, Math.min(h, vh - 8 - ceiling));
    top = Math.min(Math.max(a.top, ceiling), vh - 8 - tall);
  } else ({ left, top, tall } = besideAnchor(a, w, h));
  layer.style.maxHeight = `${tall}px`;
  layer.style.left = `${left + window.scrollX}px`;
  layer.style.top = `${top + window.scrollY}px`;
}

/* The shelf, laid out as the week under it is (owner, 2026-10-01): Monday to
   Friday in five columns, each day's template in its day's column, found by
   its name the way the week finds a crew. A weekday with no template shows an
   empty slot; every other template (a second one for a day, Saturday,
   "Standard weekday") follows on the rows after, in shelf order. What a card
   holds opens beside it (drawTplPeek), never in the grid, so no card moves.
   A card says two things and does two things: its name and what it holds,
   Load and Save. Load asks which parts first (the notice at the top); Save
   puts the plan on screen into it, on a second click, after a backup. */
function templateCard(t) {
  const n = t.routes.length;
  const saving = armed === `resave:${t.id}`, deleting = armed === `del:${t.id}`;
  // The name on its own row with its ✕, wrapping rather than cut short, so
  // two templates can always be told apart; then what it holds; then Load and
  // Save. An empty template (the weekday ones, until saved into) has nothing
  // to load, so it has no Load: loading it would only empty the plan.
  return `<div class="tpl${n ? '' : ' tpl-blank'}">
      <div class="tpl-head${n && tplShown() === t.id ? ' shown' : ''}" data-tpl="${esc(t.id)}"${n ? ' data-filled="1"' : ''}>
        <div class="tpl-title">
          <span class="tpl-name" title="${esc(t.name)}">${esc(t.name)}</span>
          ${actBtn('del', 'template', t.id, deleting ? 'Sure?' : '✕', `tpl-del${deleting ? ' armed' : ''}`, `title="Delete the ${esc(t.name)} template"`)}
        </div>
        ${n ? actBtn('peek-template', 'template', t.id, `${n} route${n === 1 ? '' : 's'}`, 'tpl-peek',
          `title="What is in ${esc(t.name)}: rest the mouse on the card, or click here to keep it open" aria-haspopup="dialog" aria-expanded="${tplOpen === t.id}"`)
          : '<span class="tpl-empty">Not saved yet</span>'}
        <div class="tpl-acts">
          ${n ? actBtn('ask-template', 'template', t.id, 'Load', 'primary-ish tpl-load', `title="Put the ${esc(t.name)} template on the plan; it asks which parts to take first"`) : ''}
          ${actBtn('resave-template', 'template', t.id, saving ? 'Sure?' : 'Save', `tpl-save${saving ? ' armed' : ''}`,
            `title="Save the ${state.routes.length} routes on the plan into ${esc(t.name)}${n ? `, in place of its ${n}` : ''}"`)}
        </div>
      </div>
    </div>`;
}

function renderTemplates() {
  const slot = new Map();
  const rest = [];
  for (const t of state.templates) {
    const day = groupWeekday(t.name);
    if (WORK_WEEK.includes(day) && !slot.has(day)) slot.set(day, t);
    else rest.push(t);
  }
  const days = WORK_WEEK.map((day) => (slot.has(day) ? templateCard(slot.get(day))
    : `<div class="tpl-none"><span class="tpl-name">${WEEKDAYS[day]}</span><span class="tpl-empty">No template</span></div>`)).join('');
  return `<section id="planTemplates" class="templates">
    <div class="tpl-top">
      <h3>Day templates${infoBtn('plan-templates')}</h3>
      <div class="bar">
        <input id="newTemplate" type="text" placeholder="Template name, e.g. Monday">
        <button class="btn" data-act="save-template">Save as template</button>
      </div>
    </div>
    <p class="hint">Load puts a template on the plan, asking which parts to take first. Save puts the plan on screen into that template.</p>
    ${state.templates.length ? `<div class="shelf" data-keep-scroll="templates">${days}${rest.map(templateCard).join('')}</div>`
      : '<p class="empty">No templates yet. Set the plan up the way it usually runs, then save it here.</p>'}
  </section>`;
}

/* ---------- the week, under the templates ----------
   Monday to Friday, a column each, listing that day's crew in roster order:
   the order the leader chose, so a Load never reshuffles a column. Load at
   the top of a column is apply-group, the same act as the Drivers tab's
   button: that crew in, everyone else away. A driver who is away is greyed in
   every column they are in, as the rail shows them. A day with no crew, or an
   empty one, is quiet and has no Load. The head's three lines never wrap, so
   a Load changing the counts moves nothing under the pointer. */
const WORK_WEEK = [1, 2, 3, 4, 5];

function renderWeek() {
  if (!state.drivers.length) return '';
  const { byDay } = dayCrews();
  const planDay = planWeekday();
  const cols = WORK_WEEK.map((day) => {
    const g = byDay.get(day);
    const ids = g ? crewIds(g) : new Set();
    const name = WEEKDAYS[day];
    const marked = day === planDay;
    const attrs = `data-day="${day}"${marked ? ` aria-current="date" title="The plan's date is this day (${esc(dayLabel(state.date))})"` : ''}`;
    const head = `<div class="week-day">${name}</div>`;
    if (!ids.size) {
      return `<div class="week-col quiet${marked ? ' plan-day' : ''}" ${attrs}>${head}
        <p class="week-none">${g ? 'Nobody in this crew yet' : 'No crew yet'}</p>
        ${weekSave(day)}
      </div>`;
    }
    const crew = state.drivers.filter((d) => ids.has(d.id));
    const away = crew.filter((d) => !d.available).length;
    const on = crewInForce(ids);
    const count = `${crew.length} driver${crew.length === 1 ? '' : 's'}${away ? ` \u00b7 ${away} away` : ''}`;
    return `<div class="week-col${marked ? ' plan-day' : ''}" ${attrs}>${head}
      <button class="btn week-load${on ? ' lit' : ''}" data-act="apply-group" data-kind="driverGroup" data-id="${esc(g.id)}" aria-pressed="${on}"
        title="Make ${name}'s ${crew.length} the ones in; everyone else goes to away">Load</button>
      <div class="week-count" title="${count}">${count}</div>
      <ul>${crew.map((d) => `<li${d.available ? '' : ' class="away" title="Away"'}>${esc(d.name)}</li>`).join('')}</ul>
    </div>`;
  }).join('');
  return `<section id="planWeek" class="week">
    <h3>The week${infoBtn('plan-week')}</h3>
    <p class="hint">Each weekday's crew, from the day groups on the Drivers tab. Load makes that crew the ones in and sets everyone else to away. Greyed names are away.</p>
    <div class="week-cols" data-keep-scroll="week">${cols}</div>
  </section>`;
}

/* ---------- the parking map, under the week ----------
   The card and its two boxes are drawn here, always, so a redraw while
   typing has somewhere to write even when docs/map.js is missing or fails;
   map.js fills them. It is handed plain copies of what it reads, never
   `state`, and the double-booking verdict the warnings use, so the red boxes
   are exactly the spots the warnings name. It runs on every draw, even the
   ones before the saved plan is read, so it is pure: a string, and no
   writes. */
function mapParts(use) {
  // An index.html cached from before the map pairs this app.js with no map.js.
  if (typeof ParkingMap === 'undefined') return { drawing: '<p class="parking-note">Reload the page to see the parking map.</p>', list: '' };
  try {
    const m = ParkingMap.model({
      positions: state.positions.map(({ id, name, multi, labelId, note }) => ({ id, name, multi: multi === true, labelId, note })),
      labels: state.labels.map(({ id, name, color }) => ({ id, name, color })),
      cars: state.cars.map(({ id, reg }) => ({ id, reg })),
      rounds: Object.values(use.spots).map((e) => ({
        routes: e.map(({ r }) => ({ name: r.name, round: r.round, positionId: r.positionId, carId: r.carId })),
        clash: doubleBooked(e),
      })),
    });
    return { drawing: ParkingMap.drawing(m), list: ParkingMap.others(m) };
  } catch (e) {
    console.warn('parking map not drawn', e);
    return { drawing: '<p class="parking-note">The parking map could not be drawn; the plan above is not affected.</p>', list: '' };
  }
}
/* A keystroke refills only the map's two boxes: a route name, a round that
   flips no warning, a registration typed in the rail. The plan is not redrawn,
   so the focus and the caret stay where they are, and so does the drawing's
   sideways scroll. */
function renderMap() {
  const drawing = document.getElementById('parkingDrawing');
  const list = document.getElementById('parkingList');
  if (!drawing || !list) return;
  const parts = mapParts(usage());
  drawing.innerHTML = parts.drawing;
  list.innerHTML = parts.list;
}
function mapSlot(use) {
  const { drawing, list } = mapParts(use);
  return `<section class="parking">
    <h3>Parking map${infoBtn('plan-map')}</h3>
    <p class="hint">Spots are found by name, so a renamed spot moves to the list under the map. The Garage is left off.</p>
    <div id="parkingDrawing" class="parking-scroll" data-keep-scroll="parking">${drawing}</div>
    <div id="parkingList" class="parking-under">${list}</div>
  </section>`;
}

/* An empty weekday's one button: who is in now, saved as that day's crew. It
   is counted again when pressed, and fills an empty crew rather than making a
   second one. Nobody in, and there is nothing to save. */
function weekSave(day) {
  const n = state.drivers.filter((d) => d.available).length;
  const name = WEEKDAYS[day];
  if (!n) return '<p class="week-none">Nobody is in to save. Set who is in first, or tick names into a crew on the Drivers tab.</p>';
  const all = n === state.drivers.length && n > 1;
  return `<button class="btn week-save" data-act="save-day-crew" data-day="${day}"${all
    ? ' title="That is everyone on the roster: set anyone who is off to away first, if the crew is smaller."' : ''}>${all
    ? `Save all ${n} as ${name}'s crew` : `Save the ${n} in as ${name}'s crew`}</button>`;
}

/* Saving over a name that is already used replaces it, rather than leaving two
   Mondays to choose between: the second save is a correction of the first. It
   is an overwrite, so it is snapshotted first, and the weekday already chosen
   for that template stays put — the plan changed, not what it is for. */
// The plan's routes as a template keeps them: no ids, and never the date.
// One mapping for Save as template and for a menu's Replace.
const templateRoutes = () => state.routes.map((r) => ({
  name: r.name, driver: r.driver, carId: r.carId, positionId: r.positionId,
  round: r.round, highlight: r.highlight, gapBefore: r.gapBefore,
}));

function saveTemplate(name) {
  const routes = templateRoutes();
  const at = state.templates.findIndex((t) => fold(t.name) === fold(name));
  if (at >= 0) {
    // The name it already has, not the one just typed: "monday" over "Monday"
    // is the same template being corrected, and the shelf should not quietly
    // rename itself under a leader who was only re-saving the routes.
    const kept = state.templates[at];
    if (!Store.snapshot(state, `Replacing the ${kept.name} template`)) return;   // the warning says why
    state.templates[at] = { ...kept, routes };
    note('info', `Replaced the ${kept.name} template with the ${routes.length} routes on the plan now.`);
  } else {
    state.templates.push({ id: uid(), name, weekday: '', routes });
    note('info', `Saved ${name}: a template of ${routes.length} routes.`);
  }
}

function assignCell(entries) {
  if (!entries) return '<span class="assign none">Not assigned</span>';
  return entries.map(({ r }) => {
    const pos = byId(state.positions, r.positionId)?.name;
    return `<span class="assign yes">Route ${esc(r.name)}${r.driver ? ', ' + esc(r.driver) : ''}${pos ? ', ' + esc(pos) : ''}</span>`;
  }).join('');
}

/* A driver's usual days, Monday to Friday: pressed where that weekday's
   group (the first one named for it, as the week under the day plan reads
   it) holds them. A press edits the group, never the driver (crew-day). */
function usualDays(d, byDay) {
  return `<span class="day-ticks">${WORK_WEEK.map((day) => {
    const crew = byDay.get(day);
    const on = !!crew && crew.driverIds.includes(d.id);
    const title = !crew ? `No ${WEEKDAYS[day]} group yet \u2014 click to start one with ${d.name}`
      : on ? `In ${crew.name} \u2014 click to take ${d.name} out` : `Click to put ${d.name} in ${crew.name}`;
    return `<button class="day-tick${on ? ' on' : ''}" data-act="crew-day" data-kind="driver" data-id="${esc(d.id)}" data-day="${day}" aria-pressed="${on}" title="${esc(title)}">${WEEKDAYS[day].slice(0, 3)}</button>`;
  }).join('')}</span>`;
}

function renderDrivers() {
  const assigned = driverUsage();
  const { byDay } = dayCrews();
  const rows = state.drivers.map((d) => {
    const on = assigned[fold(d.name)];
    return `<tr class="${d.available ? '' : 'away'}">
      <td>${field('driver', d.id, 'name', d.name, 'style="width:150px"')}</td>
      <td>${on ? `<span class="assign yes">Route ${routeNames(on)}</span>` : '<span class="assign none">Not on a route</span>'}</td>
      <td>${actBtn('toggle', 'driver', d.id, d.available ? 'In' : 'Away', d.available ? 'on' : '', 'data-field="available" title="Whether they show in the day plan\'s rail"')}</td>
      <td>${usualDays(d, byDay)}</td>
      <td class="driver-tags">${labelChips('driver', d)}</td>
      <td>${field('driver', d.id, 'note', d.note, 'placeholder="Note (e.g. back Monday)"')}</td>
      <td class="btns">${moveDel('driver', d.id)}</td></tr>`;
  }).join('');
  $('#tab-drivers').innerHTML = `
    <h2>Drivers</h2>
    <p class="hint">The people who might drive. The day plan's driver box still takes anything you type \u2014 this list only offers the names, and shows who is in. Tick a driver's usual days to put them in that day's group under Day groups.${ownDriverTags() ? ' The tags are the Driver tags on the Labels tab, apart from the car labels; for Special situation, put the details in the note.' : ''} A tag or a note never sets anyone Away.</p>
    <div class="bar" id="addDriverBar">
      <input id="newDriver" type="text" placeholder="Name(s), separated by commas">
      <button class="btn" data-act="add-driver">+ Add driver</button>
    </div>
    ${state.drivers.length
      ? `<table class="grid"><thead><tr><th>Name</th><th>Route</th><th>In or away</th><th>Usual days${infoBtn('drivers-days')}</th><th>Tag${infoBtn('drivers-tags')}</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">Nobody on the roster yet. Add the names you plan with \u2014 they become suggestions in the day plan and a list you can group by day.</p>'}
    ${driverGroups()}`;
}

/* A group is a named set of drivers — Monday's crew is these people — and
   nothing more. Applying one answers "who is in today", which is what the rail
   shows; it says nothing about which route anyone drives. */
function driverGroups() {
  const { byDay } = dayCrews();
  // Monday to Friday, as the usual days are; a weekend group is still made by
  // typing its name.
  const missing = WORK_WEEK.filter((day) => !byDay.has(day));
  const cards = state.driverGroups.map((g) => {
    const members = state.drivers.map((d) =>
      `<button class="chip member ${g.driverIds.includes(d.id) ? 'on' : ''}" data-act="group-member" data-kind="driverGroup" data-id="${esc(g.id)}" data-driver="${esc(d.id)}">${esc(d.name)}</button>`).join('');
    const day = groupWeekday(g.name);
    const used = day >= 0 && byDay.get(day) === g;
    // Where the group shows on the day plan: a weekday's first crew is its
    // column under the route list; a weekend crew, or a second crew for a
    // day, is a button in the Drivers panel.
    const short = day >= 0 ? WEEKDAYS[day].slice(0, 3) : '';
    const badge = day < 0 ? ''
      : used && WORK_WEEK.includes(day) ? `<span class="day-badge" title="This group is the ${WEEKDAYS[day]} column under the route list">${short} column</span>`
        : used ? `<span class="day-badge" title="${WEEKDAYS[day]} has no column; this group has its own button in the Drivers panel beside the day plan">${short} \u00b7 own button</span>`
          : `<span class="day-badge twice" title="Another group is ${WEEKDAYS[day]} already, so this one has its own button in the Drivers panel beside the day plan">${WEEKDAYS[day]} twice</span>`;
    return `<div class="group">
      <div class="bar">
        ${field('driverGroup', g.id, 'name', g.name, 'style="width:180px"')}${badge}
        ${actBtn('apply-group', 'driverGroup', g.id, 'Use for today', 'primary-ish', 'title="Make exactly this group the ones in; everyone else goes to away"')}
        ${moveDel('driverGroup', g.id)}
      </div>
      ${state.drivers.length ? `<div class="chips">${members}</div>` : '<p class="hint" style="margin:0">Add drivers above, then tick them into this group.</p>'}
    </div>`;
  }).join('');
  return `<h2 style="margin-top:22px">Day groups${infoBtn('drivers-groups')}</h2>
    <p class="hint">A group is a set of names you use again \u2014 a Monday crew, a weekend crew. Name one after a weekday and it becomes that day's column under the route list; Saturday and Sunday crews get a button in the Drivers panel. "Use for today" makes exactly those drivers the ones in; everyone else goes to away.</p>
    <div class="bar">
      <input id="newGroup" type="text" placeholder="Group name, e.g. Monday">
      <button class="btn" data-act="add-group">+ Add group</button>
      ${missing.length ? `<span class="day-add">Add a crew for ${missing.map((day) =>
        `<button class="btn" data-act="add-day-group" data-day="${day}" title="Make a ${WEEKDAYS[day]} group">${WEEKDAYS[day].slice(0, 3)}</button>`).join('')}</span>` : ''}
    </div>
    ${cards || '<p class="empty">No groups yet. Make one for the crew you plan with most \u2014 it takes one click to put them all in.</p>'}`;
}

function renderCars() {
  const use = usage();
  // Every car lands in exactly one of these: on a route (whatever its
  // status), parked but marked, or genuinely free.
  const onRoute = state.cars.filter((c) => use.cars[c.id]).length;
  const down = state.cars.filter((c) => c.labelId && !use.cars[c.id]).length;
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).length;
  const rows = state.cars.map((c) => `<tr class="${use.cars[c.id] ? 'assigned' : ''}">
    <td>${field('car', c.id, 'reg', c.reg, 'class="short" style="width:110px"')}</td>
    <td>${assignCell(use.cars[c.id])}</td>
    <td>${labelChips('car', c)}</td>
    <td>${field('car', c.id, 'note', c.note, 'placeholder="Note (e.g. back Friday)"')}</td>
    <td class="btns">${moveDel('car', c.id)}</td></tr>`).join('');
  $('#tab-cars').innerHTML = `
    <h2>Cars</h2>
    <p class="hint">Click a label to mark a car. Marked cars still appear in the day plan, but picking one shows a warning. A parked car is listed on the printout when its label has Show on printout ticked, on the Labels tab.</p>
    <p class="counts"><span class="assign yes">${onRoute} on a route</span><span class="assign none">${free} free</span><span class="assign down">${down} parked and marked</span></p>
    <div class="bar" id="addCarBar">
      <input id="newCar" type="text" placeholder="Registration(s), e.g. SD12345 SE67890">
      <button class="btn" data-act="add-car">+ Add car</button>
    </div>
    ${state.cars.length
      ? `<table class="grid"><thead><tr><th>Reg.</th><th>Assigned to${infoBtn('cars-assigned')}</th><th>Status${infoBtn('cars-status')}</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="empty">No cars yet. Paste the whole fleet into the box above at once \u2014 separate registrations with spaces, commas or semicolons.</p>`}`;
}

function renderPositions() {
  const rows = state.positions.map((p) => `<tr>
    <td>${field('position', p.id, 'name', p.name, 'style="width:140px"')}</td>
    <td><label><input type="checkbox" data-kind="position" data-id="${esc(p.id)}" data-field="multi" ${p.multi ? 'checked' : ''}> Many cars</label></td>
    <td>${labelChips('position', p)}</td>
    <td>${field('position', p.id, 'note', p.note, 'placeholder="Note"')}</td>
    <td class="btns">${moveDel('position', p.id)}</td></tr>`).join('');
  $('#tab-positions').innerHTML = `
    <h2>Positions${infoBtn('positions-map')}</h2>
    <p class="hint">Packing spots, garage, ports. "Many cars" lets several routes share it (like Garage) without a warning. The parking map on the Day plan finds Spot 1 to Spot 5 and the gate by name; a renamed spot moves to the list under it.</p>
    <div class="bar">
      <input id="newPos" type="text" placeholder="Name, e.g. Spot 6 or Port 3">
      <button class="btn" data-act="add-position">+ Add position</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Sharing${infoBtn('positions-many')}</th><th>Status${infoBtn('positions-status')}</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLabels() {
  // A cached older store.js can pair with this app.js after a deploy. It
  // would save the tick under schema 4, where an older build drops it
  // without its newer-version warning, so the tick is offered only on 5.
  const ticks = Store.SCHEMA >= 5;
  const rows = state.labels.map((l) => `<tr>
    <td>${field('label', l.id, 'name', l.name)}</td>
    <td><input type="color" data-kind="label" data-id="${esc(l.id)}" data-field="color" value="${esc(colour(l.color))}"></td>
    ${ticks ? `<td><label><input type="checkbox" data-kind="label" data-id="${esc(l.id)}" data-field="onSheet" ${l.onSheet === true ? 'checked' : ''}> Show on printout</label></td>` : ''}
    <td class="btns">${moveDel('label', l.id)}</td></tr>`).join('');
  $('#tab-labels').innerHTML = `
    <h2>Car and position labels${infoBtn('labels-labels')}</h2>
    <p class="hint">${ownDriverTags() ? 'These become the one-click buttons on cars and positions. Drivers have tags of their own, under Driver tags below.' : 'These become the one-click buttons on cars, positions and drivers.'} Tick Show on printout to list a label's parked cars under Cars not available on the printed sheet; a parked car whose label is not ticked is on neither list.</p>
    <div class="bar">
      <input id="newLabel" type="text" placeholder="Label name, e.g. No fuel card">
      <input id="newLabelColor" type="color" value="#1565c0">
      <button class="btn" data-act="add-label">+ Add label</button>
    </div>
    <table class="grid" id="labelList"><thead><tr><th>Name</th><th>Colour</th>${ticks ? '<th>Printout</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table>
    ${ownDriverTags() ? driverTagSection() : ''}`;
}

/* The driver tags: the Drivers tab's one-click buttons and the Drivers
   panel's tag menu, and nothing else. They are not printed and never travel
   in a share code, so there is no Printout column. */
function driverTagSection() {
  const rows = state.driverTags.map((t) => `<tr>
    <td>${field('driverTag', t.id, 'name', t.name)}</td>
    <td><input type="color" data-kind="driverTag" data-id="${esc(t.id)}" data-field="color" value="${esc(colour(t.color))}"></td>
    <td class="btns">${moveDel('driverTag', t.id)}</td></tr>`).join('');
  return `<h2 style="margin-top:22px">Driver tags${infoBtn('labels-driver-tags')}</h2>
    <p class="hint">These become the one-click buttons on the Drivers tab and the choices in a driver's tag menu. A tag never sets anyone Away, and it is never on the printout or in a share code.</p>
    <div class="bar">
      <input id="newDriverTag" type="text" placeholder="Tag name, e.g. Parental leave">
      <input id="newDriverTagColor" type="color" value="#1565c0">
      <button class="btn" data-act="add-driver-tag">+ Add driver tag</button>
    </div>
    ${rows
      ? `<table class="grid" id="driverTagList"><thead><tr><th>Name</th><th>Colour</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">No driver tags. Add one above to mark a driver as off sick, on holiday or on a course.</p>'}`;
}

/* The Colours switch, in the This browser card. Which button is pressed is
   read from the page itself: no attribute on <html> is Follow the computer. */
function coloursRow() {
  const now = document.documentElement.dataset.theme || 'follow';
  const choice = (v, name) => `<button class="btn colour-choice${now === v ? ' lit' : ''}" data-act="theme" data-colours="${v}" aria-pressed="${now === v}">${name}</button>`;
  return `<p class="colours" role="group" aria-label="Colours">Colours: ${choice('follow', 'Follow the computer')}${choice('light', 'Light')}${choice('dark', 'Dark')}${infoBtn('data-colours')}</p>
      <p class="hint">Light or Dark is kept in this browser only. The printed sheet looks the same whichever you pick.</p>
      ${themeKept ? '' : `<p class="status warn-status">This browser couldn't keep the choice, so it lasts only until this page is closed or reloaded.</p>`}`;
}

/* A backup's key for its Restore button: its time, and how many before it
   share that time (two can, written in the same millisecond, or by hand). A
   backup taken later goes on top with a time of its own, so no key it leaves
   behind changes between the two clicks. */
function backupKeys(list) {
  const seen = new Map();
  return list.map((b) => {
    const n = seen.get(String(b.t)) || 0;
    seen.set(String(b.t), n + 1);
    return `${b.t}#${n}`;
  });
}

const when = (d) => {
  if (!d) return '';
  const t = new Date(d);
  const sameDay = t.toDateString() === new Date().toDateString();
  return sameDay ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : t.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
// What a plan holds, in the words the Data tab uses wherever one plan is
// weighed up against another: the save-file question, and the archive rows.
function planSummary(s, templates = false) {
  const [y, m, d] = String(s.date || '').split('-');
  return [plural(s.routes.length, 'route'), plural(s.cars.length, 'car'), plural(s.drivers.length, 'driver'),
    ...(templates ? [plural(s.templates.length, 'template')] : []), `dated ${d}/${m}/${y}`].join(', ');
}

function fileStatus() {
  const f = Store.file;
  if (!Store.fileSupported()) {
    return `<p class="status off">This browser cannot auto-save to a file. Use <b>Export</b> below to keep your own copy \u2014 Edge and Chrome on Windows can do it automatically.</p>`;
  }
  if (!f.handle) {
    return `<p class="status off">Not saving to a file yet.</p>
      <p class="hint">Pick a file once (OneDrive, a network drive, a memory stick) and every change writes straight to it. Nothing is uploaded anywhere \u2014 the file is written by your browser, on your PC.</p>
      <button class="btn primary-ish" data-act="link-file">Choose save file\u2026</button>
      <button class="btn" data-act="open-file">Open an existing file\u2026</button>`;
  }
  // A hold: the file was not written because it may hold the only good copy,
  // or could not be looked at. Nothing reaches it until one of these is used.
  if (f.hold) {
    if (f.hold.kind === 'checking') return `<p class="status">Checking <b>${esc(f.name)}</b> against the screen\u2026</p>`;
    const stop = '<button class="btn" data-act="unlink-file">Stop using this file</button>';
    if (f.hold.kind === 'differs') {
      const n = plural;
      const sum = (s) => planSummary(s);
      return `<p class="status warn-status"><b>${esc(f.name)}</b> holds a different plan from the one on screen. Nothing has been written to it: choose which one to keep.</p>
        <p class="hint">In the file${f.hold.modified ? ` (last changed ${esc(when(f.hold.modified))})` : ''}: ${esc(sum(f.hold.state))}.<br>On screen: ${esc(sum(state))}.${f.hold.differ ? `<br>${esc(n(f.hold.differ, 'route'))} ${f.hold.differ === 1 ? 'differs' : 'differ'} between the two.` : ''}</p>
        <button class="btn" data-act="file-keep-file">Load the file</button>
        <button class="btn" data-act="file-keep-screen">Write this screen to the file</button>
        ${stop}
        <p class="hint">Whichever one you replace is put in Backups first, so either choice can be undone there.</p>`;
    }
    const why = f.hold.kind === 'notPlan'
      ? `<b>${esc(f.name)}</b> does not hold a plan this version can read`
      : `<b>${esc(f.name)}</b> could not be read to check it against the screen`;
    const over = armed === 'file-overwrite';
    return `<p class="status warn-status">${why}, so nothing has been written to it.</p>
      <button class="btn" data-act="reconnect-file">Try again</button>
      <button class="btn ${over ? 'armed' : ''}" data-act="file-overwrite">${over ? 'Sure? Click again' : 'Write this screen over it'}</button>
      ${stop}
      <p class="hint">What is in the file cannot be put in Backups, because it cannot be read. Export a copy of this screen first if you are unsure.</p>`;
  }
  if (f.permission !== 'granted') {
    return `<p class="status warn-status">Saving to <b>${esc(f.name)}</b> is paused \u2014 the browser needs you to allow it again. This happens after a restart.</p>
      <button class="btn primary-ish" data-act="reconnect-file">Reconnect ${esc(f.name)}</button>
      <button class="btn" data-act="unlink-file">Stop using this file</button>`;
  }
  return `<p class="status on">Saving to <b>${esc(f.name)}</b>${f.lastSaved ? ` \u2014 last written ${esc(when(f.lastSaved))}` : ''}.</p>
    ${f.error ? `<p class="status warn-status">${esc(f.error)}</p>` : ''}
    <button class="btn" data-act="open-file">Open a different file\u2026</button>
    <button class="btn" data-act="unlink-file">Stop using this file</button>`;
}

/* Every note there has been, newest first: the newest three in full, the
   older ones a line each, keeping what a `must` entry says it affects. */
function whatsNewCard() {
  const releases = typeof UPDATES !== 'undefined' && Array.isArray(UPDATES) ? UPDATES.filter(Boolean) : null;
  const running = `<p class="hint">You are running version ${esc(APP_VERSION)}.</p>`;
  if (!releases) return `<div class="card"><h3>What's new${infoBtn('data-news')}</h3>${running}</div>`;
  const full = releases.slice(0, 3).map((r) => `<div class="release">
      <h4>${esc(r.version)} \u00b7 ${esc(r.title)}</h4>
      <p>${esc(r.changed)}</p>
      <p><b>What it affects:</b> ${esc(r.affects)}</p>
      <p><b>Your data:</b> ${esc(r.data)}</p>
    </div>`).join('');
  const older = releases.slice(3).map((r) => `<p class="older">${esc(r.version)} \u00b7 ${esc(r.title)}. Your data: ${esc(r.data)}${r.must
    ? `<br>What it affects: ${esc(r.affects)}` : ''}</p>`).join('');
  return `<div class="card whatsnew"><h3>What's new${infoBtn('data-news')}</h3>${running}${full}${older}</div>`;
}

/* parseImport, for drawing a row rather than importing: it also warns about
   text from a newer version, which is right for an import and only noise for
   a row being drawn, so that warning is taken back out. Anything the Store
   had queued before is said as usual. */
function parseQuietly(text) {
  drainStoreNotices();
  const r = Store.parseImport(text, defaults);
  Store.takeNotices();
  return r;
}

/* The untouched copies taken before each update, and the rescue of a save
   that could not be read. Rows, not a table: Backups below is this tab's
   only table. What an update copy holds is read before it is offered, so
   Restore is only ever offered for a plan. */
function archivesCard() {
  if (typeof Store.archives !== 'function') return `<div class="card"><h3>Archives${infoBtn('data-archives')}</h3><p class="empty">Reload the page to see Archives.</p></div>`;
  const rows = Store.archives().map((a) => {
    const at = esc(when(a.t));
    const down = actBtn('archive-download', esc(a.kind), a.t, 'Download');
    if (a.kind === 'rescue') return `<div class="arch-row"><span class="what">Could not be read \u00b7 ${at}</span><span class="btns">${down}</span></div>`;
    const { state: s, error } = parseQuietly(a.text);
    const head = `Before ${esc(a.to)} (from ${esc(a.from)}) \u00b7 ${at}`;
    if (error || !s) return `<div class="arch-row"><span class="what">${head} \u00b7 Could not be read</span><span class="btns">${down}</span></div>`;
    const key = `archive:${a.t}`;
    return `<div class="arch-row"><span class="what">${head} \u00b7 ${esc(planSummary(s, true))}</span><span class="btns">${actBtn('archive-restore', 'update', a.t,
      armed === key ? 'Sure?' : 'Restore', armed === key ? 'armed' : '')}${down}${bothArmed(key)}</span></div>`;
  }).join('');
  return `<div class="card">
      <h3>Archives${infoBtn('data-archives')}</h3>
      <p class="hint">A copy of everything as it was just before each update, kept in this browser like Backups but never pushed out by them. Restore puts that whole plan and setup back, replacing everything changed since; what is on screen goes into Backups first. Download keeps the copy as a file you can Import later or send on.</p>
      ${rows || '<p class="empty">No archives yet.</p>'}
    </div>`;
}

function renderData() {
  const p = Store.persistence.state;
  const persistText = {
    granted: 'Your browser has promised to keep this data even when disk space runs low.',
    denied: 'Your browser may clear this data on its own if disk space runs low. Link a save file below so that cannot cost you anything.',
    unsupported: 'This browser will not promise to keep the data. Link a save file below.',
    unknown: 'Checking\u2026',
  }[p] || 'Checking\u2026';

  const list = Store.backups();
  // A backup written while the browser was running out of room is half a line
  // of JSON. Reading it throws, and this runs inside render(), so one bad
  // entry used to take the whole app down — including the Data tab holding
  // the eleven good backups beside it. Say what it is instead, and leave its
  // Restore button off.
  const keys = backupKeys(list);
  const rows = list.map((b, i) => {
    let contents = null;
    try { const s = JSON.parse(b.json); contents = `${s.routes.length} routes, ${s.cars.length} cars`; } catch { /* unreadable */ }
    return `<tr>
      <td>${esc(when(b.t))}</td>
      <td>${esc(b.label)}</td>
      <td>${contents === null ? 'Unreadable \u2014 only half of it was saved' : esc(contents)}</td>
      <td class="btns">${contents === null ? '' : actBtn('restore', 'backup', keys[i], armed === `restore:${keys[i]}` ? 'Sure?' : 'Restore', armed === `restore:${keys[i]}` ? 'armed' : '') + bothArmed(`restore:${keys[i]}`)}</td>
    </tr>`;
  }).join('');

  $('#tab-data').innerHTML = `
    <h2>Data</h2>
    <p class="hint">${room ? 'Everything you type is saved on this PC and, while connected, goes to the shared plan as you type it, locked so that only the invite link opens it.' : 'Everything you type stays on this PC. This page never sends it anywhere.'}</p>

    <div class="card" id="fileCard">
      <h3>Auto-save to a file${infoBtn('data-file')}</h3>
      ${fileStatus()}
    </div>

    <div class="card">
      <h3>This browser</h3>
      <p class="status ${p === 'granted' ? 'on' : 'off'}">${esc(persistText)}</p>
      <p class="hint">If this page ever won't start, <a href="recover.html">recover.html</a> downloads everything this browser holds.</p>
      ${coloursRow()}
    </div>

    <div class="card" id="shareCard"></div>

    ${syncReady() ? '<div class="card" id="roomCard"></div>' : ''}

    <div class="card">
      <h3>Your own copy${infoBtn('data-copy')}</h3>
      <p class="hint">A plain JSON file you can email to yourself or drop on a stick.</p>
      <button class="btn" data-act="export">Export a copy\u2026</button>
      <button class="btn" data-act="import">Import a copy\u2026</button>
      <input id="importFile" type="file" accept="application/json,.json" hidden>
      ${roomLive() ? `<p class="hint both-line">Importing replaces everything on screen. ${BOTH_WORDS}</p>` : ''}
    </div>

    ${whatsNewCard()}

    ${archivesCard()}

    <div class="card" id="backupsCard">
      <h3>Backups${infoBtn('data-backups')}</h3>
      <p class="hint">Automatic snapshots taken before anything is cleared or deleted, and once at the start of each day. Restoring replaces everything on screen \u2014 the current state is snapshotted first, so you can undo it.</p>
      ${list.length
        ? `<table class="grid"><thead><tr><th>When</th><th>Taken before</th><th>Contents</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="empty">No backups yet.</p>'}
    </div>`;
}

function renderNotices() {
  // What it says sits in its own box, so the buttons stay a row beside it
  // rather than joining the list. A notice that offers to change saved data
  // states every line of what it would do; one that has nothing to list is
  // the sentence alone, exactly as before. A line can carry a heading of its
  // own, { head, text }, which is set in bold: the update note's "What it
  // affects:" and "Your data:" are read as labels, not as part of a sentence.
  const line = (l) => (l && typeof l === 'object' ? `<b>${esc(l.head)}</b> ${esc(l.text)}` : esc(l));
  // A template's load question draws its ticks, and the sentence and button
  // they make, from the plan as it is at this draw: never a stale count.
  const loading = (n, i) => {
    const t = n.parts && n.offer && byId(state.templates, n.offer.id);
    if (!t) return null;
    const q = templateQuestion(t, n.parts);
    const ticks = TEMPLATE_PARTS.map(([k, name]) =>
      `<label><input type="checkbox" data-act="tpl-part" data-index="${i}" data-part="${k}"${n.parts[k] ? ' checked' : ''}> ${name}</label>`).join('');
    return { say: `${esc(n.text)}${staleSince(n.tick) ? ' The plan changed while this was open; what it says below is drawn from the plan as it is now.' : ''}<div class="tpl-parts" role="group" aria-label="What to take from ${esc(t.name)}">${ticks}</div><p class="tpl-says">${esc(q.text)}</p>`, button: q.button };
  };
  $('#notices').innerHTML = notices.map((n, i) => {
    const q = loading(n, i);
    const offer = q ? (q.button && actBtn(n.offer.act, n.offer.kind, n.offer.id, esc(q.button), 'primary-ish'))
      : n.offer && actBtn(n.offer.act, n.offer.kind, n.offer.id, esc(n.offer.text), 'primary-ish');
    return `<div class="notice ${n.kind}"><div class="say">${q ? q.say : esc(n.text)}${n.lines?.length
      ? `<ul>${n.lines.map((l) => `<li>${line(l)}</li>`).join('')}</ul>` : ''}</div><div class="acts">${offer || ''}${n.link ? `<a class="btn" href="${esc(n.link.href)}">${esc(n.link.text)}</a>` : ''}<button class="btn" data-act="dismiss" data-index="${i}" title="Dismiss">\u2715</button></div></div>`;
  }).join('');

  // The question just asked, not the first one on screen: with an older
  // question still up, scrolling to the first left the new one out of sight.
  const asking = notices.indexOf(offerRaised);
  offerRaised = null;
  // 'nearest' so a question already on screen does not scroll the plan away;
  // the page's scroll-padding keeps it clear of the sticky top bar.
  if (asking >= 0) $('#notices').children[asking]?.scrollIntoView({ block: 'nearest' });
}

/* The paper list on the pillar has four columns and has to keep them, so the
   round travels inside the packing cell, written the way it is written by hand:
   spot then round, separated by a slash. "Spot 1" packed on round 1 prints as
   "Spot 1/1". A route with no round prints just the spot. */
const spotCell = (r) => [byId(state.positions, r.positionId)?.name, String(r.round || '').trim()].filter(Boolean).join('/');

/* A label's Show on printout tick. Read as === true here rather than trusted
   to normalise: a share code, Add label and Add tag put labels on state
   without passing through it. */
const printsOnSheet = (labelId) => byId(state.labels, labelId)?.onSheet === true;

function renderSheet() {
  const [y, m, d] = (state.date || today()).split('-');
  // Warnings belong on screen, before printing: the paper shows the plan and
  // nothing that argues with it.
  const rows = state.routes.map((r) =>
    (r.gapBefore ? '<tr class="spacer"><td colspan="4"></td></tr>' : '') +
    `<tr class="${r.highlight ? 'hl' : ''}">
      <td class="rn">${dash(r.name)}</td>
      <td>${dash(r.driver)}</td>
      <td>${dash(byId(state.cars, r.carId)?.reg)}</td>
      <td>${dash(spotCell(r))}</td>
    </tr>`).join('');

  const use = usage();
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).map((c) => esc(c.reg)).join(', ');
  // Parked cars whose label is ticked. A car on a route is on its row, and a
  // parked car with an unticked label is on neither list.
  const downCars = state.cars.filter((c) => c.labelId && printsOnSheet(c.labelId) && !use.cars[c.id]).map((c) =>
    `<p>${esc(c.reg)}: ${esc(byId(state.labels, c.labelId)?.name)}${c.note ? ' (' + esc(c.note) + ')' : ''}</p>`).join('');

  // The weekday in words under the date, from the plan's own date: the sheet
  // on the pillar is read by people checking it is the right day's list.
  const weekday = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(d)).getDay()] || '';

  $('#sheet').innerHTML = `
    <div class="date"><div class="num">${d}/${m}/${y}</div>${weekday ? `<div class="weekday">${weekday}</div>` : ''}</div>
    <table>
      <thead><tr><th style="text-align:right;padding-right:6mm">Route</th><th>Driver</th><th>Car</th><th>Packing round</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="extra">
      ${downCars ? `<h4>Cars not available</h4>${downCars}` : ''}
      ${free ? `<h4>Free cars</h4><p>${free}</p>` : ''}
    </div>`;
}

const drainStoreNotices = () => { for (const n of Store.takeNotices()) note(n.kind, n.text, null, [], n.link || null); };

function render() {
  // Anything Store had to say since the last draw — a browser save that
  // failed, a backup that would not fit, a file it could not write — belongs
  // on screen with everything else. It goes through note(), so a save failing
  // on every keystroke leaves one notice rather than a hundred.
  drainStoreNotices();
  // Keep goes once the plan or its date has been replaced (Import, Restore, a
  // share code, a typed date), or its notice has been put away.
  if (dateMove && (state !== dateMove.plan || state.date !== dateMove.to || !notices.some(isKeep))) dropKeep();
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  document.body.classList.toggle('show-sheet', tab === 'preview');
  renderPlan(); renderDrivers(); renderCars(); renderPositions(); renderLabels(); renderData(); renderShare(); renderRoom(); renderSheet();
  // The preview's hint is static markup; its ⓘ goes in a slot there. A cached
  // index.html without the slot gets none.
  const previewInfo = document.getElementById('previewInfo');
  if (previewInfo) previewInfo.innerHTML = infoBtn('preview');
  renderNotices();
  renderPicker();
  renderTagMenu();
  renderCtxMenu();
  placeInfoBubble();
  drawTplPeek();
  roomMarks();
}

/* ---------- events ---------- */
// Typing updates state without a full re-render (keeps focus); selects/checkboxes re-render.
document.addEventListener('input', (e) => {
  const el = e.target;
  const { kind, id, field: name } = el.dataset;
  if (!kind || !name) return;
  // Typing a driver narrows the grid of roster names — and opens it, for
  // someone who reached the box with Tab rather than a click, the way the
  // browser's own suggestions used to appear under it.
  if (kind === 'route' && name === 'driver' && el.closest('#tab-plan')) {
    if (!pickingFor(el)) picking = { field: 'driver', routeId: id, filter: '' };
    picking.filter = el.value;
  }
  const value = el.type === 'checkbox' ? el.checked : el.value;
  // A round feeds the clash rule, so one keystroke in it can turn a warning on
  // or off; a driver's name is what the rail matches a roster entry against,
  // so one keystroke there moves someone between Free and a route number.
  // Remember how both read before the change, to spot either.
  const watched = kind === 'route' && (name === 'round' || name === 'driver');
  const before = watched ? liveSig() : null;
  // Renaming a group can make it a day's crew, or stop it being one, and the
  // badges and the week have to follow while the name is still being typed.
  const weekSig = () => state.driverGroups.map((g) => groupWeekday(g.name)).join();
  const regroup = kind === 'driverGroup' && name === 'name';
  const weekWas = regroup ? weekSig() : null;
  // A date half typed is not a day yet: nothing changes and nothing is saved;
  // only the day and the line under the box say so, until it reads one.
  if (kind === 'meta' && name === 'date' && dateTyping() !== null) { drawDateLine(); return; }
  const dayWas = state.date;
  if (kind === 'meta') state[name] = name === 'date' ? typedDay(value) : value;
  else {
    const item = byId(listFor(kind) || [], id);
    if (!item) return;
    item[name] = value;
  }
  // The day's crew loads only when the date really changes, and only to a
  // date written out whole: editing "05/10/2026" in place passes through
  // "2/10/2026", which is a real day, and loading its crew on the way would
  // overwrite who is in (review, 2026-10-01). A date retyped as it was loads
  // nothing, so availability set by hand stays.
  const crewMoved = kind === 'meta' && name === 'date' && state.date !== dayWas && !!parseDay(state.date)
    && /^(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})$/.test(String(value).trim()) && loadDayCrew();
  save();
  // A tick is often pressed with Space, and the next Tab has to go on from it.
  if (el.type === 'checkbox') renderKeepingFocus();
  else if (el.tagName === 'SELECT') render();
  else if (before !== null && liveSig() !== before) redrawKeepingCaret(el);
  else if (regroup && weekSig() !== weekWas) redrawKeepingCaret(el);
  // A day's crew loaded: the rail and the week redraw, the focus staying where
  // it was (the Date box, or the step button pressed).
  else if (crewMoved) { if (document.activeElement === el) redrawKeepingCaret(el); else renderKeepingFocus(); }
  else { renderSheet(); renderPicker(); renderMap(); if (kind === 'meta' && name === 'date') drawDateLine(); }
});

/* Redraw the lot without interrupting the typing that caused it: render()
   replaces the very field being typed into, so the caret goes back afterwards.

   Waiting for the field to be left instead would be simpler and is wrong: the
   browser blurs on mousedown, so the redraw lands between mousedown and mouseup
   and the click that ended the edit is swallowed — measured, not guessed. */
function redrawKeepingCaret(el) {
  const { kind, id, field: name } = el.dataset;
  const sel = [el.selectionStart, el.selectionEnd, el.selectionDirection];
  render();
  // By its id where it has one: the Date box has no data-id, and looking for
  // data-id="undefined" lost it, and the focus with it (review, 2026-10-01).
  const again = el.id ? document.getElementById(el.id)
    : document.querySelector(`[data-kind="${kind}"][data-id="${CSS.escape(id)}"][data-field="${name}"]`);
  if (!again) return;
  again.focus();
  again.setSelectionRange(...sel);
}

function confirmTwice(key, fromKeyboard = false) {
  if (armed === key) { armed = null; return true; }
  armed = key;
  // Armed from the keyboard, the focus has to stay on the button, or the
  // second press — the one that deletes — can never be made. Armed with the
  // mouse it must not: a Space pressed later to page down would press it.
  if (fromKeyboard) renderKeepingFocus();
  else {
    // Put back, then let go: a Space pressed later cannot press it, and the
    // next Tab still starts from here rather than from the top of the page.
    renderKeepingFocus();
    if (document.activeElement?.classList.contains('armed')) document.activeElement.blur();
  }
  // The disarm three seconds later must not pull the focus out of whatever
  // has been typed into or moved to since.
  setTimeout(() => { if (armed === key) { armed = null; renderKeepingFocus(); } }, 3000);
  return false;
}

/* A full redraw that puts the focus (and the caret) back on the same control,
   found by what it is rather than which element it was — the redraw replaces
   them all. Looked for in the same part of the page it was in: the rail and
   the Drivers tab both have a ✕ for driver d3, and only one is showing. */
function renderKeepingFocus() { keepingFocus(render); }
// The same around any redraw: the shared plan's also redraws open dialogs.
function keepingFocus(draw) {
  const el = document.activeElement;
  const area = el && el !== document.body && el.closest('section.tab, #notices, #tagMenu, #picker, #ctxMenu, #ctxSub, dialog');
  // The tag menu, the route picker and the right-click menu put their own
  // focus back, by the very choice it was on; a second guess here could only
  // be worse.
  const own = area && (area.id === 'tagMenu' || area.id === 'picker' || area.id === 'ctxMenu' || area.id === 'ctxSub');
  // Every data-* attribute, not a chosen few: the rail's Mark and Gap share
  // an act, kind and id and differ only in data-field, the tag choices only in
  // data-label, the day buttons in data-day — and a near match puts the focus
  // on the wrong one, where the next key press changes the wrong thing.
  const d = el?.dataset || {};
  const attrs = Object.entries(d).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${CSS.escape(v)}"]`).join('');
  const what = !area || own ? null : el.id ? `#${CSS.escape(el.id)}` : attrs || null;
  // The whole selection, not only where it starts: a box reached with Tab has
  // all its text selected, and collapsing that to a caret made the next key
  // add to the name ("72") instead of replacing it.
  const sel = el && typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd, el.selectionDirection] : null;
  // A box that is not a field of the data — "add a driver", a new tag's
  // name — holds what is typed in it until it is added, and the redraw
  // rebuilds it empty. Carry the words across along with the focus.
  const loose = el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !d.field ? el.value : null;
  draw();
  if (!what) return;
  const again = el.id ? document.querySelector(what) : document.querySelector(`#${area.id} ${what}`);
  if (!again) return;
  if (loose != null && again.value !== loose) again.value = loose;
  if (again !== document.activeElement) {
    // preventScroll is not always honoured — Chromium scrolls to a date box
    // regardless — so the page is put back where it was as well.
    const x = window.scrollX, y = window.scrollY;
    again.focus({ preventScroll: true });
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  }
  if (sel) { try { again.setSelectionRange(...sel); } catch { /* not a text box */ } }
}

function addFromInput(sel, make) {
  const input = $(sel);
  const v = input.value.trim();
  if (!v) { input.focus(); return false; }
  make(v);
  return true;
}

async function doPrint() {
  renderSheet();
  try {
    if (window.__TAURI__?.core) { await window.__TAURI__.core.invoke('print_page'); return; }
  } catch (err) { console.warn('native print failed, using window.print()', err); }
  window.print();
}

/* ---------- sharing ---------- */
let shareOut = '';                                   // last generated code, shown for manual copying
let pending = { share: null, mode: 'day', addMissing: true };

function renderShare() {
  const el = $('#shareCard');
  if (!el) return;
  el.innerHTML = `
    <h3>Send this list to another PC${infoBtn('data-share')}</h3>
    <p class="hint">Makes a code holding the finished list. Paste it into a chat or an email; the other PC pastes it back in below. Nothing is uploaded \u2014 the code <em>is</em> the list.</p>
    <button class="btn primary-ish" data-act="share-make" data-mode="day">Copy the day plan</button>
    <button class="btn" data-act="share-make" data-mode="all">Copy everything (cars, positions, labels)</button>
    <button class="btn" data-act="share-link">Copy as a link</button>
    ${shareOut ? `<p class="hint" style="margin-top:10px">Copied. If the clipboard did not work, take it from here:</p>
      <textarea id="shareOut" class="code" readonly rows="3">${esc(shareOut)}</textarea>
      <p class="hint">${shareOut.length} characters.${shareOut.length > 1800 ? ' That is long for a link \u2014 send the code itself rather than the link.' : ''}</p>` : ''}

    <h3 style="margin-top:18px">Load a list someone sent you</h3>
    <textarea id="shareIn" class="code" rows="3" placeholder="Paste the code (or the whole link) here"></textarea>
    <button class="btn primary-ish" data-act="share-read">Read the list</button>`;
}

function renderShareDialog() {
  const dlg = $('#shareDlg');
  if (!pending.share) return;
  const sum = Share.summarise(state, pending.share, pending.addMissing);
  const [y, m, d] = String(sum.date || '').split('-');
  const list = (arr) => arr.map((x) => esc(x)).join(', ');

  const missing = [];
  if (sum.unknownCars.length) missing.push(`${sum.unknownCars.length} car${sum.unknownCars.length > 1 ? 's' : ''} you do not have (${list(sum.unknownCars)})`);
  if (sum.unknownPos.length) missing.push(`${sum.unknownPos.length} position${sum.unknownPos.length > 1 ? 's' : ''} you do not have (${list(sum.unknownPos)})`);

  dlg.innerHTML = `
    <h2>Load this list?</h2>
    ${staleSince(pending.tick) ? STALE_LINE : ''}
    <p>A day plan for <b>${y ? `${d}/${m}/${y}` : 'an unknown date'}</b> with <b>${sum.routes} routes</b>${sum.hasEverything ? `, plus ${sum.cars} cars, ${sum.positions} positions and their labels${sum.drivers ? `, and ${sum.drivers} drivers with their groups` : ''}` : ''}.</p>
    ${missing.length ? `<p class="status warn-status">It mentions ${missing.join(' and ')}.</p>` : ''}
    <p class="status warn-status"><b>This replaces the day plan on screen.</b> A backup is taken first, so you can undo it from Backups.</p>
    ${bothLine()}

    ${sum.hasEverything ? `<fieldset>
      <legend>What to take</legend>
      <label><input type="radio" name="shareMode" value="day" ${pending.mode === 'day' ? 'checked' : ''}> Just the day plan (date, routes, drivers)</label>
      <label><input type="radio" name="shareMode" value="all" ${pending.mode === 'all' ? 'checked' : ''}> Everything \u2014 also update my cars, positions, labels, drivers and day groups</label>
    </fieldset>` : ''}

    ${missing.length ? `<label class="block"><input type="checkbox" id="shareAdd" ${pending.addMissing ? 'checked' : ''}> Add the cars and positions I do not have</label>
      <p class="hint">Leave this off and those routes come in with the car or position blank.</p>` : ''}

    <div class="bar" style="margin:16px 0 0">
      <button class="btn primary-ish" data-act="share-apply">Load it</button>
      <button class="btn" data-act="share-cancel">Cancel</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
}

async function copyOut(text) {
  shareOut = text;
  try { await navigator.clipboard.writeText(text); } catch { /* shown in the box instead */ }
  renderShare();
}

async function shareAction(act, b) {
  switch (act) {
    case 'share-make': shareOut = ''; await copyOut(await Share.encode(state, b.dataset.mode)); return;
    case 'share-link': shareOut = ''; await copyOut(Share.linkFor(await Share.encode(state, 'day'))); return;
    case 'share-read': {
      const raw = $('#shareIn').value;
      const fromLink = /#d=(.+)$/.exec(raw.trim());
      const { share, error } = await Share.decode(fromLink ? decodeURIComponent(fromLink[1]) : raw);
      if (error) { note('warn', error); render(); return; }
      openShare(share);
      return;
    }
    case 'share-apply': {
      const { state: next, skipped } = Share.apply(state, pending.share, pending);
      if (!Store.snapshot(state, 'Loading a shared list')) { render(); return; }   // the warning says why
      state = next;
      save();
      const left = [...skipped.cars, ...skipped.positions];
      note('info', `Loaded ${state.routes.length} routes for ${state.date}.${left.length ? ` Left blank: ${left.join(', ')}.` : ''}`);
      $('#shareDlg').close();
      pending.share = null;
      render();
      return;
    }
    case 'share-cancel': $('#shareDlg').close(); pending.share = null; return;
    default: return;
  }
}

/* Always the day plan to begin with, even when the code carries everything:
   the radio offers "everything" and the dialog says what it costs, but the
   option that is pre-selected should be the one that replaces least. */
function openShare(share) {
  // tick: the shared plan's changes so far, to tell when this goes stale.
  pending = { share, mode: 'day', addMissing: true, tick: roomTick() };
  renderShareDialog();
}

/* ---------- the shared plan ----------
   A room on the relay, opened with the secret in an invite link. sync.js
   holds the keys, the encryption and the connection; this is what the app
   does with them. Nothing about the room is ever put on `state`: the plan is
   what Export, Backups and the save file write, and the secret lives only
   under carcoord:pref:room. A browser that has joined no room never calls
   roomStart(), so it never opens a connection at all.

   Live edits (pack 3): while connected, save() leads to roomFlush(), which
   works out what changed since the plan this browser last told the room
   about (Sync.replica's shadow) and sends it as an op. What others send is
   folded in in the relay's order, this browser's own unconfirmed edits are
   replayed on top, and the screen is patched to the result. Only Take, a
   version's Restore and Create start a room's plan from scratch. */
// A cached store.js from before prefs cannot keep a room, so no room at all.
const syncReady = () => typeof Sync !== 'undefined' && typeof Sync.connect === 'function'
  && typeof Store.pref === 'function' && typeof Store.setPref === 'function';
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
// { secret, keys, conn, versions: [{id, at, name, schema}], schema, snapshot, rep, … }
let room = null;
// { conn } while Create is making a room, before it is this browser's room.
let roomCreating = null;
// How long edits are gathered before they are sent: a word typed is one
// change, not one per key.
const ROOM_BATCH_MS = 300;
// After this many ops past the room's snapshot, a browser that has applied
// them sends a new snapshot, so the relay can drop them (PROTOCOL.md §4.3).
const ROOM_COMPACT_AFTER = 200;

// The schema the room's plans are written in, as far as this browser has
// seen: the newest of its snapshot's, its versions' and its ops'. Newer than
// this build's means read-only, so an older normalise() can never drop a
// field for both managers. So does a room holding ops this build cannot
// apply (`ahead`): a snapshot from it would claim ops it never applied, and
// the relay would delete them (PROTOCOL.md §4.3).
const roomReadOnly = (r = room) => !!r && (r.schema > Store.SCHEMA || r.ahead);
// Following the room live: its plan is known (rep), and this browser may
// write to it.
const roomLive = (r = room) => !!r && !!r.rep && !r.legacy && !roomReadOnly(r);

// Whether a catchup shows ops past its snapshot: any op in it, or a room seq
// past its snapshot's.
const opsAhead = (f) => {
  const snapSeq = f.snapshot && Number.isInteger(f.snapshot.seq) ? f.snapshot.seq : 0;
  return (Array.isArray(f.ops) && f.ops.length > 0) || (Number.isInteger(f.seq) && f.seq > snapSeq);
};

// The schema an opened {schema, plan} was written in: the envelope's, or the
// plan's own schemaVersion when that is newer, since normalise() loads a newer
// plan with only a warning and would drop what it does not know.
const planSchema = (plain) => Math.max(
  Number.isInteger(plain && plain.schema) ? plain.schema : 0,
  plain && plain.plan && Number.isInteger(plain.plan.schemaVersion) ? plain.plan.schemaVersion : 0,
);
const opSchema = (plain) => (plain && Number.isInteger(plain.schema) ? plain.schema : 0);

// A version's name and body are sealed apart (the label and the body), so the
// relay could pair one version's name with another's body. Each push puts the
// same random nonce, and the name, in both; a body that does not carry its
// label's is refused. 16 random bytes, as hex.
const versionNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const labelNonce = (label) => (label && typeof label.nonce === 'string' ? label.nonce : null);

/* The room's plan as this browser last had it confirmed, kept beside the plan
   so that edits made offline, or before a reload, are worked out against it
   and sent later: carcoord:roomBase, {room, seq, plan}. Never in carcoord:v1,
   so Backups, Export, Archives and the save file never hold it. Written only
   just after the plan itself (save(), roomShow()), or when what it adds is
   already in the plan (an ack), so the two always belong together: a base
   ahead of the plan would read as edits undoing the room's. Every tab of
   the room holds the same plan at the same seq, so one already written at
   this seq is not written again. */
const BASE_KEY = 'carcoord:roomBase';
function roomBaseWrite(r) {
  if (!r || !r.rep || !r.keys || r.legacy || roomReadOnly(r)) return;
  const head = `{"room":${JSON.stringify(r.keys.roomId)},"seq":${r.rep.seq},`;
  try {
    const now = localStorage.getItem(BASE_KEY);
    if (now && now.startsWith(head)) return;
    localStorage.setItem(BASE_KEY, `${head}"plan":${JSON.stringify(r.rep.confirmed)}}`);
  } catch (e) { console.warn('shared plan: its base could not be kept', e); }
}
function roomBaseRead(roomId) {
  try {
    const b = JSON.parse(localStorage.getItem(BASE_KEY));
    if (b && b.room === roomId && Number.isInteger(b.seq) && b.seq >= 0 && b.plan && typeof b.plan === 'object' && !Array.isArray(b.plan)) return { seq: b.seq, plan: b.plan };
  } catch { /* none kept, or unreadable: none */ }
  return null;
}
const roomBaseForget = () => { try { localStorage.removeItem(BASE_KEY); } catch { /* storage refused: nothing kept anyway */ } };

// base: {seq, plan}, the room's plan as this browser last had it confirmed,
// when it has one (from Create or Take); otherwise the one kept, if any.
async function roomStart(secret, base = null) {
  roomStop();
  if (!syncReady() || !SECRET_RE.test(String(secret || ''))) return;
  // seq: the room's latest seq as last heard. acks: what was sent and not yet
  // answered, oldest first; the relay answers in the order it was sent.
  // fetches: version id -> the resolvers waiting for its body (getVersion).
  // caught: the catchup since the last (re)connect has been read. Until then
  // the room's schema is unknown, so nothing is written to it.
  // snapSeq: the seq of the room's snapshot as last heard.
  // ahead: the room holds ops this build cannot apply, so it is read-only.
  // rep: the room's plan and this browser's edits to it (Sync.replica), once
  // known. legacy: this browser has no record of the room's plan and its own
  // differs (it joined before live updates), so it does not follow the room
  // until it takes the shared plan again.
  // frames: every frame is read in turn, in the order it came.
  // epoch: counts (re)connects, so a send begun on an old connection stops.
  // holds: the field being typed in, kept as typed while the room changed it.
  // flags: collisions to show; tick: counts changes that came from the room.
  const r = {
    secret, keys: null, conn: null, versions: [], schema: 0, snapshot: null, seq: 0, snapSeq: 0, ahead: false, acks: [], fetches: new Map(), caught: false,
    rep: base ? Sync.replica(base.seq, base.plan) : null, legacy: false, frames: Promise.resolve(), sending: Promise.resolve(), epoch: 0,
    flushTimer: null, waitingSince: null, holds: new Map(), flags: [], tick: 0, compacting: false,
  };
  room = r;
  try { r.keys = await Sync.deriveKeys(secret); } catch { if (room === r) room = null; return; }
  if (room !== r) return;   // left, or another room taken, while deriving
  if (r.rep) roomBaseWrite(r);
  else { const kept = roomBaseRead(r.keys.roomId); if (kept) r.rep = Sync.replica(kept.seq, kept.plan); }
  r.conn = Sync.connect({ keys: r.keys });
  r.conn.on('status', (status) => {
    // Catch up on every (re)connect: the version list, the room's schema, and
    // every op since the last one this browser applied.
    r.caught = false;
    r.epoch++;
    clearTimeout(r.flushTimer);
    r.flushTimer = null;
    // Whether the relay stored what was in flight is known only from the catchup.
    if (r.rep) r.rep.lost();
    if (status === 'connected') { r.seq = r.conn.seq; r.conn.send({ type: 'catchup', since: r.rep ? r.rep.seq : 0 }); }
    // A connection that dropped will never answer what it was sent.
    let noted = false;
    if (status !== 'connected') roomFetchesEnd(r);
    if (status !== 'connected' && r.acks.length) {
      const lost = r.acks.filter((a) => a.kind === 'version').map((a) => a.name);
      r.acks = [];
      if (lost.length && room === r) {
        note('warn', `The connection dropped while pushing “${lost.join('”, “')}”. It may not have been saved: look for it in the list once the shared plan is back, and push it again if it is missing.`);
        noted = true;
      }
    }
    // A note is drawn with everything else; a status alone redraws only its own.
    if (room === r) { if (noted) renderKeepingFocus(); else renderRoom(); }
  });
  // One at a time and in order: an op must never be read before the catchup
  // that came ahead of it.
  r.conn.on('frame', (f) => {
    r.frames = r.frames.then(() => roomFrame(r, f)).catch((e) => console.warn('shared plan: a frame could not be read', e));
  });
  // The Data tab's words change with it, not only the card.
  renderKeepingFocus();
}

function roomStop() {
  const r = room;
  room = null;
  if (!r) return;
  clearTimeout(r.flushTimer);
  if (r.conn) r.conn.close();
}

// A body this browser cannot open (a wrong key, a damaged frame) is skipped,
// never fatal: the list shows what it can read.
const openOr = async (r, kind, body, fallback = null) => {
  try { return await Sync.open(r.keys, kind, body); } catch { return fallback; }
};

// What a sequenced op's plaintext must hold for this build to apply it.
const opUsable = (plain) => !!plain && opSchema(plain) <= Store.SCHEMA && Array.isArray(plain.changes);

// The room's plan from a catchup: its snapshot with every op after it, as a
// replica at the room's seq. null when it cannot be built here: no snapshot,
// an op this build cannot apply, or one missing.
function roomPlanOf(f, snap, ops) {
  if (!snap || !snap.plan || typeof snap.plan !== 'object') return null;
  const rep = Sync.replica(f.snapshot.seq, snap.plan);
  for (const o of ops) {
    if (!opUsable(o.plain)) return null;
    rep.take(o.seq, o.plain.changes, typeof o.plain.oid === 'string' ? o.plain.oid : null);
  }
  try { rep.drain(); } catch { return null; }
  return Number.isInteger(f.seq) && rep.seq < f.seq ? null : rep;
}

async function roomFrame(r, f) {
  if (f.type === 'catchup') {
    const snap = f.snapshot && typeof f.snapshot.body === 'string' ? await openOr(r, 'snapshot', f.snapshot.body) : null;
    const versions = [];
    for (const v of Array.isArray(f.versions) ? f.versions : []) {
      const label = await openOr(r, 'label', v.label);
      if (label) versions.push({ id: v.id, at: v.at, name: String(label.name || ''), nonce: labelNonce(label), schema: label.schema });
    }
    const ops = [];
    for (const o of Array.isArray(f.ops) ? f.ops : []) if (Number.isInteger(o.seq)) ops.push({ seq: o.seq, plain: await openOr(r, 'op', o.body) });
    if (room !== r) return;
    // The room is behind what this browser applied (its server restored from
    // an older copy, say): its seqs mean other things now, and this reply
    // holds only the ops past a seq that no longer means anything. Start over
    // as a browser with no record of it, reading the room whole: still not
    // caught up, so nothing is sent or shown until that answer is read.
    if (r.rep && Number.isInteger(f.seq) && f.seq < r.rep.seq) {
      r.rep = null;
      r.holds.clear();
      roomBaseForget();
      r.conn.send({ type: 'catchup', since: 0 });
      return;
    }
    r.snapshot = snap ? { seq: f.snapshot.seq, plain: snap } : null;
    r.versions = versions;
    if (Number.isInteger(f.seq)) r.seq = Math.max(r.seq, f.seq);
    r.snapSeq = f.snapshot && Number.isInteger(f.snapshot.seq) ? f.snapshot.seq : 0;
    r.schema = Math.max(0, snap ? planSchema(snap) : 0, ...versions.map((v) => v.schema), ...ops.map((o) => opSchema(o.plain)));
    // A newer room is only read: its plan is never put on screen here.
    if (!roomReadOnly(r)) roomCatchUp(r, f, snap, ops);
    r.caught = true;
    renderRoom();
    roomFlush(r);
  } else if (f.type === 'ack') {
    const a = r.acks.shift();
    if (!a || room !== r) return;
    if (a.kind === 'op') {
      if (r.rep && Number.isInteger(f.seq)) roomApply(r, () => r.rep.take(f.seq, a.batch.changes, a.batch.oid));
    } else if (a.kind === 'snapshot') {
      if (Number.isInteger(f.seq)) r.snapSeq = Math.max(r.snapSeq, f.seq);
    } else if (a.kind === 'version' && Number.isInteger(f.id)) {
      if (!r.versions.some((v) => v.id === f.id)) r.versions.push({ id: f.id, at: f.at, name: a.name, nonce: a.nonce, schema: Store.SCHEMA });
      note('info', `Pushed “${a.name}” to the shared plan.`);
      renderKeepingFocus();
    }
  } else if (f.type === 'version' && typeof f.body === 'string') {
    // getVersion's answer: the whole version, for Look first or Restore.
    const plain = await openOr(r, 'version', f.body);
    const label = await openOr(r, 'label', f.label);
    if (!plain || !plain.plan || typeof plain.plan !== 'object' || !label) { roomFetched(r, f.id, { unreadable: true }); return; }
    const bound = typeof plain.name === 'string' && plain.name === label.name && typeof plain.nonce === 'string' && plain.nonce === labelNonce(label);
    roomFetched(r, f.id, bound ? { plain, name: plain.name, nonce: plain.nonce } : { mismatch: true });
  } else if (f.type === 'noVersion') {
    roomFetched(r, f.id, null);
  } else if (f.type === 'op') {
    // The other browser's live edit. Before the catchup has been read it is
    // in the catchup too (or comes after it), and a browser not following the
    // room live leaves it to those that do.
    if (room !== r || !r.rep || r.legacy || roomReadOnly(r) || !Number.isInteger(f.seq)) return;
    const plain = await openOr(r, 'op', f.body);
    if (room !== r) return;
    if (!opUsable(plain)) {
      // A newer build's, or one this build cannot read: from now on it only
      // reads the room, rather than miss an edit and drift apart from it.
      if (plain && opSchema(plain) > Store.SCHEMA) r.schema = Math.max(r.schema, opSchema(plain));
      else r.ahead = true;
      renderRoom();
      return;
    }
    const take = () => r.rep.take(f.seq, plain.changes, typeof plain.oid === 'string' ? plain.oid : null);
    if (r.caught) roomApply(r, take); else take();
  } else if (f.type === 'version' && typeof f.body !== 'string') {
    // Pushed from the other browser: its name, and nothing else yet.
    const label = await openOr(r, 'label', f.label);
    if (!label || room !== r || r.versions.some((v) => v.id === f.id)) return;
    r.versions.push({ id: f.id, at: f.at, name: String(label.name || ''), nonce: labelNonce(label), schema: label.schema });
    r.schema = Math.max(r.schema, Number.isInteger(label.schema) ? label.schema : 0);
    renderRoom();
  }
}

/* A catchup, read: the room's plan as it is now, and this browser's place in
   it. With a plan to follow, the ops since are folded in (from the snapshot,
   when the room has been compacted past this browser). Without one, the
   browser follows the room only when its own plan is the room's: one that
   differs (joined before live updates, its plan changed since) would
   otherwise send every difference as an edit and write over the other
   manager's plan, so it waits to take the shared plan again. */
function roomCatchUp(r, f, snap, ops) {
  if (!r.rep) {
    const now = roomPlanOf(f, snap, ops);
    if (!now) { r.ahead = !!(snap && snap.plan) || opsAhead(f); return; }
    // The same plan, read as this build reads it; the date moved on open
    // (not saved yet) may be either.
    const { state: theirs } = Store.parseImport(JSON.stringify(now.confirmed), defaults);
    const text = theirs ? JSON.stringify(theirs) : null;
    const same = text === JSON.stringify(state) || (dateMove && state === dateMove.plan && !dateMove.saved && text === JSON.stringify({ ...state, date: dateMove.from }));
    if (same) { r.rep = Sync.replica(now.seq, now.confirmed); r.legacy = false; roomBaseWrite(r); } else r.legacy = true;
    return;
  }
  const snapSeq = f.snapshot && Number.isInteger(f.snapshot.seq) ? f.snapshot.seq : 0;
  roomApply(r, () => {
    // Compacted past what this browser applied: start again from the snapshot.
    if (snap && snap.plan && typeof snap.plan === 'object' && snapSeq > r.rep.seq) r.rep.reset(snapSeq, snap.plan);
    for (const o of ops) {
      if (!opUsable(o.plain)) { r.ahead = true; return; }
      r.rep.take(o.seq, o.plain.changes, typeof o.plain.oid === 'string' ? o.plain.oid : null);
    }
  });
  // An op missing (its snapshot unreadable, say): it cannot keep up.
  if (r.rep.seq < (Number.isInteger(f.seq) ? f.seq : 0)) r.ahead = true;
}

/* ---------- live edits: in and out ---------- */
// The field being typed in, as a change would name it: only a text box, where
// a caret and half a word can be lost.
function focusedField() {
  const el = document.activeElement;
  const d = el && el.dataset;
  if (!d || !d.kind || !d.field) return null;
  const text = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', ''].includes(el.type || ''));
  if (!text || (d.kind !== 'meta' && !Sync.LISTS[d.kind])) return null;
  const id = d.kind === 'meta' ? null : d.id;
  return { kind: d.kind, id, field: d.field, key: Sync.fieldKey(d.kind, id, d.field) };
}
// {has, value} of one field in a plan.
function fieldIn(plan, kind, id, field) {
  if (kind === 'meta') return { has: true, value: plan[field] };
  const list = plan[Sync.LISTS[kind]];
  const item = Array.isArray(list) ? list.find((x) => x && x.id === id) : null;
  return item ? { has: true, value: item[field] } : { has: false };
}
const setIn = (plan, h, value) => Sync.apply(plan, h.kind === 'meta' ? { op: 'set', kind: 'meta', field: h.field, value } : { op: 'set', kind: h.kind, id: h.id, field: h.field, value });

// What is on screen beyond what the room has been told, as a batch to send.
// A field held while typed in stays out until it is left; the date moved on
// open stays out until the next real change saves it (moveDateOnOpen).
// was: Map fieldKey -> the value a released field's `was` says.
function roomCapture(r, was = null) {
  if (!r || !r.rep || r.legacy || roomReadOnly(r)) return null;
  const movedDate = dateMove && state === dateMove.plan && !dateMove.saved;
  const skip = (c) => c.op === 'set' && ((c.kind === 'meta' && c.field === 'date' && movedDate)
    || (r.holds.has(Sync.fieldKey(c.kind, c.id, c.field)) && !(was && was.has(Sync.fieldKey(c.kind, c.id, c.field)))));
  return r.rep.capture(state, { skip, was });
}

// An edit on screen: sent after a short gather.
function roomEdited() {
  const r = room;
  if (!roomLive(r) || r.flushTimer) return;
  r.flushTimer = setTimeout(() => { r.flushTimer = null; roomFlush(r); }, ROOM_BATCH_MS);
}

// Seal and send every batch not sent yet, in order. Only while connected and
// caught up; what cannot go now stays queued for the next connection.
function roomFlush(r) {
  if (room !== r || !roomLive(r) || !r.caught || planElsewhere || !r.conn || r.conn.status !== 'connected') return;
  roomCapture(r);
  if (!r.rep.queue.length) return;
  if (!r.waitingSince) { r.waitingSince = Date.now(); setTimeout(() => { if (room === r) renderRoomPill(); }, 1100); }
  const epoch = r.epoch;
  r.sending = r.sending.then(async () => {
    for (const b of r.rep.unsent()) {
      if (room !== r || r.epoch !== epoch) return;
      b.sent = true;
      let body = null;
      try { body = await Sync.seal(r.keys, 'op', { schema: Store.SCHEMA, oid: b.oid, changes: b.changes }); } catch (e) { console.warn('shared plan: an edit could not be sealed', e); }
      if (room !== r || r.epoch !== epoch || !body || roomReadOnly(r)) { b.sent = false; return; }
      // Over the relay's limit it would close the connection for good. This
      // browser stops following instead (as one with no record of the room:
      // it follows again if the plans agree, or offers to take it), and says so.
      if (body.length > 512 * 1024) {
        r.rep = null;
        r.legacy = true;
        r.holds.clear();
        roomBaseForget();
        note('warn', 'A change was too large to send to the shared plan, so this browser stopped sending to it. Your plan stays here; take the shared plan on the Data tab to edit it together again.');
        renderKeepingFocus();
        return;
      }
      if (!r.conn.send({ type: 'op', body })) { b.sent = false; return; }
      r.acks.push({ kind: 'op', batch: b });
    }
  }).catch((e) => console.warn('shared plan: sending failed', e));
}

/* Compaction: the room's plan as this browser has it confirmed, at the seq
   it has applied and never above it, sent as the room's snapshot. Any
   browser following live may send it; two at one seq hold the same plan,
   and the relay keeps either. */
async function roomCompact(r) {
  if (r.compacting || !roomLive(r) || !r.caught || planElsewhere || !r.conn || r.conn.status !== 'connected') return;
  if (r.rep.seq - r.snapSeq < ROOM_COMPACT_AFTER) return;
  r.compacting = true;
  const at = r.rep.seq;
  const plan = r.rep.confirmed;
  const epoch = r.epoch;
  try {
    const body = await Sync.seal(r.keys, 'snapshot', { schema: Store.SCHEMA, plan });
    if (room === r && r.epoch === epoch && roomLive(r) && r.conn.send({ type: 'snapshot', seq: at, body })) {
      r.acks.push({ kind: 'snapshot' });
      r.snapSeq = Math.max(r.snapSeq, at);
    }
  } catch (e) { console.warn('shared plan: a snapshot could not be made', e); }
  r.compacting = false;
}

/* Fold what the room sequenced into this browser's plan, and the screen.
   mutate() hands the replica its ops (or a snapshot). First, every edit on
   screen is captured, so it is measured against the plan it was made on and
   never mistaken for a change to undo; what stays uncaptured (a field held,
   the moved date) is put back on top afterwards. */
function roomApply(r, mutate) {
  if (!r.rep || room !== r || planElsewhere) { if (mutate) mutate(); return; }
  roomCapture(r);
  const before = r.rep.shadow;
  const local = Sync.diff(before, state);
  if (mutate) mutate();
  let res;
  try { res = r.rep.drain(); } catch (e) {
    console.warn('shared plan: an op could not be applied', e);
    r.ahead = true;
    renderRoom();
    return;
  }
  if (!r.rep.queue.length) r.waitingSince = null;
  roomFlags(r, res.flags);
  if (res.applied) roomCompact(r);
  if (r.rep.shadow === before) { if (res.flags.length) renderRoom(); else renderRoomPill(); }
  else roomShow(r, roomHold(r, Sync.applyAll(r.rep.shadow, local)));
  // This browser's own edits confirmed: the base moves with them, or a reopen
  // would rebuild them from a base that lacks them and send them again, over
  // whatever the other manager did since (a route put back after its removal,
  // say). Only while the plan stored is this screen: another tab may have
  // saved one without them, and a base ahead of the plan reads as an undo.
  if (res.applied && storedIsScreen()) roomBaseWrite(r);
}
const storedIsScreen = () => { try { return localStorage.getItem('carcoord:v1') === JSON.stringify(state); } catch { return false; } };

/* The field being typed in is never rewritten under the caret. When the room
   changes it, the box keeps what is in it and the field is held: on leaving
   it, what was typed is sent (with `was` saying what it was written over, so
   both screens flag it), or, if nothing was typed, the box takes the room's
   value. A held field whose route the room removed goes to the flags. */
function roomHold(r, next) {
  const f = focusedField();
  if (f && !r.holds.has(f.key)) {
    const now = fieldIn(state, f.kind, f.id, f.field);
    const then = fieldIn(next, f.kind, f.id, f.field);
    if (now.has && then.has && !Sync.equal(now.value, then.value)) {
      r.holds.set(f.key, { ...f, base: now.value });
      next = setIn(next, f, now.value);
    }
  }
  for (const [key, h] of [...r.holds]) {
    if (fieldIn(next, h.kind, h.id, h.field).has) continue;
    r.holds.delete(key);
    const now = fieldIn(state, h.kind, h.id, h.field);
    const list = state[Sync.LISTS[h.kind]];
    const i = Array.isArray(list) ? list.findIndex((x) => x && x.id === h.id) : -1;
    if (i >= 0 && now.has && !Sync.equal(now.value, h.base)) {
      roomFlags(r, [{ type: 'removed', kind: h.kind, id: h.id, item: JSON.parse(JSON.stringify(list[i])), after: i > 0 ? list[i - 1].id : null, field: h.field }]);
    }
  }
  return next;
}
// Leaving a held field.
function roomRelease(r) {
  if (!r || room !== r || !r.rep || !r.holds.size) return;
  const f = focusedField();
  let changed = false;
  for (const [key, h] of [...r.holds]) {
    if (f && f.key === key) continue;
    r.holds.delete(key);
    const now = fieldIn(state, h.kind, h.id, h.field);
    const there = fieldIn(r.rep.shadow, h.kind, h.id, h.field);
    if (!now.has) continue;
    if (Sync.equal(now.value, h.base)) {
      if (there.has && !Sync.equal(now.value, there.value)) { roomPatch(setIn(state, h, there.value)); changed = true; }
    } else {
      roomCapture(r, new Map([[key, h.base]]));
      roomEdited();
    }
  }
  if (changed) { Store.save(state); r.tick++; renderKeepingFocus(); } else { renderRoom(); roomMarks(); }
}
document.addEventListener('focusout', () => {
  const r = room;
  if (r && r.holds.size) setTimeout(() => roomRelease(r), 0);
});

// Put `next` on screen in place: `state` stays the same object (dateMove and
// the rest hold it), and only the parts that changed are replaced, with copies
// of their own, so an edit on screen can never reach the replica's plans.
function roomPatch(next) {
  const keys = [...Object.keys(next), ...Object.keys(state).filter((k) => !(k in next))];
  let changed = false;
  for (const k of keys) {
    if (JSON.stringify(state[k]) === JSON.stringify(next[k])) continue;
    changed = true;
    if (next[k] === undefined) delete state[k]; else state[k] = JSON.parse(JSON.stringify(next[k]));
  }
  return changed;
}
function roomShow(r, next) {
  const was = JSON.parse(JSON.stringify(state));
  const sig = liveSig();
  // Nothing on screen changed (a field held, say): only its marks.
  if (!roomPatch(next)) { renderRoom(); roomMarks(); return; }
  // Saved as any edit is, but not sent back: it came from the room.
  if (Store.save(state) !== false) roomBaseWrite(r);
  r.tick++;
  roomRedraw(was, sig);
}

/* A change from the room, on screen without disturbing the person working:
   the focus, the caret and the selection, the scroll, an open picker or
   menu and an armed button all stay as they were.
   - A route's name, driver or round, or a note, changed in a box that is not
     being typed in, is put straight into its box, with the sheet, the map
     and the picker redrawn: what typing it here redraws, as long as no
     warning or driver on the rail moves with it (liveSig, as typing checks).
   - Anything else redraws the lot through keepingFocus, which finds the
     focused control again by what it is, and puts its caret back.
   An open dialog drawn from the plan (a list to load, a version's preview, an
   invite) is drawn again with its counts as they are now, and says the plan
   changed while it was open. */
const PATCHABLE = new Set(['route\u0000name', 'route\u0000driver', 'route\u0000round', 'car\u0000note', 'position\u0000note', 'driver\u0000note']);
function roomRedraw(was, sig) {
  const changes = Sync.diff(was, state);
  const boxes = [];
  const quiet = liveSig() === sig && changes.every((c) => {
    if (c.op !== 'set' || c.kind === 'meta' || typeof c.value !== 'string' || !PATCHABLE.has(`${c.kind}\u0000${c.field}`)) return false;
    const els = [...document.querySelectorAll(`[data-kind="${c.kind}"][data-id="${CSS.escape(c.id)}"][data-field="${CSS.escape(c.field)}"]`)];
    if (!els.every((el) => el.tagName === 'INPUT' && el.type === 'text')) return false;
    for (const el of els) boxes.push([el, c.value]);
    return true;
  });
  const x = window.scrollX, y = window.scrollY;
  if (quiet) {
    // The box being typed in holds what is typed (roomHold), never this.
    for (const [el, value] of boxes) if (el !== document.activeElement && el.value !== value) el.value = value;
    renderSheet(); renderPicker(); renderMap();
    renderRoom();
  } else keepingFocus(() => { render(); roomStaleDialogs(); });
  if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  if (quiet) roomStaleDialogs();
  roomMarks();
}
/* The quiet marks on the boxes the shared plan has something to say about:
   one the room changed while it was being typed in (held), and one both
   managers changed at once (a flag; the card lists it, with Put it back).
   An outline and a tooltip, nothing that moves the page. The title a box
   had is kept aside (never as a data-* attribute: keepingFocus finds the
   focused box again by those) and put back when the mark goes. */
const markTitles = new WeakMap();
const fieldBoxes = (kind, id, field) => document.querySelectorAll(kind === 'meta'
  ? `[data-kind="meta"][data-field="${CSS.escape(field)}"]`
  : `[data-kind="${CSS.escape(kind)}"][data-id="${CSS.escape(String(id))}"][data-field="${CSS.escape(field)}"]`);
const shown = (v) => (v === undefined || v === null || v === '' ? 'empty' : typeof v === 'boolean' ? (v ? 'on' : 'off') : `\u201c${String(Array.isArray(v) ? v.join(', ') : v)}\u201d`);
function roomMarks() {
  for (const el of document.querySelectorAll('.room-held, .room-collided')) {
    el.classList.remove('room-held', 'room-collided');
    if (markTitles.has(el)) { el.title = markTitles.get(el); markTitles.delete(el); }
  }
  const r = room;
  if (!r) return;
  const put = (kind, id, field, cls, title) => {
    for (const el of fieldBoxes(kind, id, field)) {
      if (!markTitles.has(el)) markTitles.set(el, el.title);
      el.classList.add(cls);
      el.title = title;
    }
  };
  for (const x of r.flags) if (x.type === 'set') put(x.kind, x.id, x.field, 'room-collided', `Changed by both of you at once. Kept ${flagValue(x.field, x.kept)}; the other was ${flagValue(x.field, x.lost)}. The Shared plan card on the Data tab can put it back.`);
  for (const h of r.holds.values()) {
    const there = r.rep ? fieldIn(r.rep.shadow, h.kind, h.id, h.field) : { has: false };
    put(h.kind, h.id, h.field, 'room-held', `The other manager changed this to ${flagValue(h.field, there.value)} while you were typing. What you type is kept when you leave the box; the other value is noted on the Data tab.`);
  }
}

// Whether the plan changed from the room since `tick` was taken.
const staleSince = (tick) => !!room && Number.isInteger(tick) && room.tick !== tick;
const roomTick = () => (room ? room.tick : 0);
/* Replacing the whole plan while following a shared plan replaces it for the
   other manager too. The confirm each such action already has says so, in
   one line; there is never a second step (owner, 2026-10-08). */
const BOTH_WORDS = 'This changes the shared plan for both of you.';
const bothLine = () => (roomLive() ? `<p class="status warn-status both-line">${BOTH_WORDS}</p>` : '');
// Beside an armed Sure?, the same words.
const bothArmed = (key) => (roomLive() && armed === key ? ` <span class="both-line hint">${BOTH_WORDS}</span>` : '');
const STALE_LINE = '<p class="status warn-status stale-line">The plan changed while this was open. What it says now is drawn from the plan as it is.</p>';
function roomStaleDialogs() {
  if (pending.share && $('#shareDlg')?.open) renderShareDialog();
  if (roomLook) renderRoomLook();
  if (roomOffer && roomOffer.caught) renderRoomOffer();
}

// Collisions found, kept for the marks and the card: one per field (or per
// removed item), the newest winning. n: a number to name it by in a button.
let flagCount = 0;
function roomFlags(r, flags) {
  for (const x of flags) {
    const key = x.type === 'set' ? `set\u0000${Sync.fieldKey(x.kind, x.id, x.field)}` : `removed\u0000${x.kind}\u0000${x.id}`;
    r.flags = r.flags.filter((y) => y.key !== key);
    r.flags.push({ ...x, key, n: ++flagCount, at: Date.now() });
  }
  if (r.flags.length > 30) r.flags.splice(0, r.flags.length - 30);
}
// A flag stays while it still has something to say: a field not put back yet,
// an item still gone.
function roomFlagsPrune(r) {
  r.flags = r.flags.filter((x) => {
    if (x.type === 'removed') return !fieldIn(state, x.kind, x.id, 'id').has;
    const now = fieldIn(state, x.kind, x.id, x.field);
    return now.has && !Sync.equal(now.value, x.lost);
  });
}

/* What a flag says, in the card's words. */
const FIELD_WORDS = {
  name: 'name', driver: 'driver', carId: 'car', positionId: 'position', round: 'round', highlight: 'pink mark', gapBefore: 'gap above',
  note: 'note', reg: 'registration', labelId: 'status', tagId: 'tag', available: 'in today', multi: 'many cars', color: 'colour',
  onSheet: 'show on printout', driverIds: 'drivers', routes: 'routes', weekday: 'day', date: 'date',
};
function flagThing(x) {
  const item = x.type === 'removed' ? x.item : (fieldIn(state, x.kind, x.id, 'id').has ? (state[Sync.LISTS[x.kind]] || []).find((i) => i && i.id === x.id) : null);
  const name = item ? String(item.reg ?? item.name ?? '').trim() : '';
  if (x.kind === 'meta') return 'The plan';
  const what = { route: 'Route', car: 'Car', position: 'Position', label: 'Status', driver: 'Driver', driverTag: 'Driver tag', driverGroup: 'Day group', template: 'Template' }[x.kind] || 'An item';
  return name ? `${what} ${name}` : `A ${what.toLowerCase()} with no name`;
}
function flagValue(field, v) {
  const named = { carId: [state.cars, 'reg'], positionId: [state.positions, 'name'], labelId: [state.labels, 'name'], tagId: [state.driverTags || [], 'name'] }[field];
  if (named && v) { const hit = byId(named[0], v); return hit ? shown(hit[named[1]]) : 'one since removed'; }
  if (field === 'routes' && Array.isArray(v)) return plural(v.length, 'route');
  if (field === 'driverIds' && Array.isArray(v)) return plural(v.length, 'driver');
  return shown(v);
}
function flagText(x) {
  const word = FIELD_WORDS[x.field] || x.field;
  if (x.type === 'removed') {
    const edit = x.field && x.item && x.field in x.item ? ` (its ${word}: ${flagValue(x.field, x.item[x.field])})` : '';
    return `${flagThing(x)} was removed while it was being changed${edit}. Put it back to keep it, with that change.`;
  }
  return `${flagThing(x)}'s ${word} was changed by both of you at once. Kept ${flagValue(x.field, x.kept)}; the other was ${flagValue(x.field, x.lost)}.`;
}
function roomFlagsHtml() {
  roomFlagsPrune(room);
  if (!room.flags.length) return '';
  const rows = room.flags.slice().reverse().map((x) => `<li>${esc(flagText(x))}
      <span class="room-flag-acts">${actBtn('room-putback', '', x.n, 'Put it back')}${actBtn('room-dismiss', '', x.n, 'Dismiss')}</span></li>`).join('');
  return `<h4>Changed by both of you</h4><ul class="room-flags">${rows}</ul>`;
}
// Put it back: the value that lost, or the item that was removed with its
// change, as an edit of this browser's, so it reaches the other screen too.
function roomPutBack(n) {
  const r = room;
  const x = r && r.flags.find((y) => y.n === n);
  if (!x) return;
  r.flags = r.flags.filter((y) => y !== x);
  if (x.type === 'removed') {
    const list = state[Sync.LISTS[x.kind]];
    if (Array.isArray(list) && !list.some((i) => i && i.id === x.id)) {
      const after = x.after ? list.findIndex((i) => i && i.id === x.after) : -1;
      list.splice(x.after === null ? 0 : after >= 0 ? after + 1 : list.length, 0, JSON.parse(JSON.stringify(x.item)));
    }
  } else if (fieldIn(state, x.kind, x.id, x.field).has) {
    const next = setIn(state, x, x.lost);
    roomPatch(next);
  }
  save();
  note('info', 'Put back. It is on both screens once the shared plan has it.');
  renderKeepingFocus();
}

/* ---------- versions: Look first and Restore ----------
   A version's plan is fetched only when it is looked at. Restore is local:
   the plan on screen goes into Backups, the version takes its place, and
   nothing is sent. A version written by a newer build is never restored
   here, so an older normalise() never drops what it does not know. */
function roomFetched(r, id, result) {
  const waiting = r.fetches.get(id) || [];
  r.fetches.delete(id);
  for (const done of waiting) done(result);
}
function roomFetchesEnd(r) {
  for (const id of [...r.fetches.keys()]) roomFetched(r, id, { offline: true });
}
// -> { plain, name, nonce } | { unreadable } | { mismatch } | { offline } |
//    null (no such version)
function roomFetch(id) {
  const r = room;
  if (!r || !r.conn) return Promise.resolve({ offline: true });
  return new Promise((resolve) => {
    const first = !r.fetches.has(id);
    r.fetches.set(id, [...(r.fetches.get(id) || []), resolve]);
    if (first && !r.conn.send({ type: 'getVersion', id })) roomFetched(r, id, { offline: true });
  });
}
const roomVersion = (id) => room && room.versions.find((v) => v.id === id);

// What a fetch that came back empty-handed says.
function roomFetchFailed(got) {
  if (!got) note('warn', 'That version is no longer in the shared plan: only the newest 50 are kept. Nothing was changed.');
  else if (got.offline) note('warn', 'The shared plan cannot be reached right now, so the version could not be fetched. Nothing was changed.');
  else if (got.mismatch) note('warn', 'This version does not match its name, so nothing was changed.');
  else note('warn', 'That version could not be read, so nothing was changed.');
  renderKeepingFocus();
}

// The body fetched is the one whose name the list shows: same name, same nonce.
const matchesListed = (got, v) => !!v && got.name === v.name && got.nonce === v.nonce;

async function roomLookFirst(id) {
  const v = roomVersion(id);
  if (!v) return;
  let got = await roomFetch(id);
  if (got && got.plain && !matchesListed(got, v)) got = { mismatch: true };
  if (!got || !got.plain) { roomFetchFailed(got); return; }
  if (roomOffer) return;   // an invite's question came first
  roomLook = { id, name: got.name, at: v.at, plain: got.plain, tick: roomTick() };
  renderRoomLook();
}

function renderRoomLook() {
  const l = roomLook;
  if (!l) return;
  const dlg = roomDialog();
  const newer = planSchema(l.plain) > Store.SCHEMA;
  dlg.innerHTML = `
    <h2>Version \u201c${esc(l.name || 'Unnamed')}\u201d</h2>
    ${staleSince(l.tick) ? STALE_LINE : ''}
    <p class="hint">Pushed ${esc(when(l.at))}.</p>
    ${newer ? '<p class="status warn-status">This version was saved by a newer version of Car Coordinator. Update the app to restore it; nothing has changed here.</p>' : previewHtml(l.plain.plan, 'Restoring it') + bothLine()}
    <div class="bar" style="margin:16px 0 0">
      ${newer ? '' : `<button class="btn primary-ish" data-act="room-restore" data-id="${esc(l.id)}" data-sure="1">Restore it</button>`}
      <button class="btn" data-act="room-look-close">Close</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
}

// looked: {plain, name} when it comes from Look first's dialog.
async function roomRestore(id, looked) {
  if (planElsewhere) { note('warn', 'The plan changed in another tab, so nothing was restored. Reload this tab first.'); renderKeepingFocus(); return; }
  const v = roomVersion(id);
  // From Look first the body was matched to its name when it was fetched.
  let got = looked || await roomFetch(id);
  if (!looked && got && got.plain && !matchesListed(got, v)) got = { mismatch: true };
  if (!got || !got.plain) { roomFetchFailed(got); return; }
  const name = got.name || 'Unnamed';
  if (planSchema(got.plain) > Store.SCHEMA) { note('warn', `Update the app to restore \u201c${name}\u201d: it was saved by a newer version of Car Coordinator. Nothing was changed.`); renderKeepingFocus(); return; }
  const { state: next, error } = Store.parseImport(JSON.stringify(got.plain.plan), defaults);
  if (error || !next) { note('warn', 'That version could not be read, so nothing was changed.'); renderKeepingFocus(); return; }
  if (!Store.snapshot(state, `Before restoring the shared version \u201c${name}\u201d`)) { render(); return; }   // the warning says why
  const live = roomLive();
  state = next;
  save();
  note('info', live
    ? `Restored the shared version \u201c${name}\u201d for both of you. What was on screen before is in Backups.`
    : `Restored the shared version \u201c${name}\u201d on this PC. What was on screen before is in Backups. Push it if the other manager should have it too.`);
  render();
}

/* Push: a named version of the plan on screen, to go back to. It also
   becomes the plan a newcomer's Take gets, so a join a week later starts
   from the last pushed plan rather than the one the room was made with. */
async function roomPush() {
  const r = room;
  if (!r || !r.conn) return;
  const box = document.getElementById('roomVersionName');
  const name = String(box?.value || '').replace(/\s+/g, ' ').trim();
  if (planElsewhere) { note('warn', 'The plan changed in another tab, so nothing was pushed. Reload this tab first.'); render(); return; }
  if (roomReadOnly()) { note('warn', 'Update the app to push to the shared plan: it was saved by a newer version of Car Coordinator.'); render(); return; }
  if (r.conn.status !== 'connected') { note('warn', 'The shared plan cannot be reached right now, so nothing was pushed. Your plan is saved on this PC; push again once it says Connected.'); render(); return; }
  // Before the catchup the room could be a newer build's: wait for it.
  if (!r.caught) { note('warn', 'The shared plan is still being read, so nothing was pushed. Push again in a moment.'); render(); return; }
  if (!name) { note('warn', 'Name the version first, for example \u201cMonday final\u201d.'); render(); return; }
  // Following live, the edits on screen go out first, so the room's snapshot
  // (the plan it has confirmed, never one with edits it has not) holds them.
  if (roomLive(r)) {
    roomFlush(r);
    for (let i = 0; i < 40 && room === r && r.rep.queue.length && r.conn.status === 'connected'; i++) await new Promise((go) => setTimeout(go, 75));
  }
  if (room !== r) return;
  // The snapshot is the room's plan at the seq this browser has applied, and
  // a browser not following the room sends none: its plan is not the room's.
  const snapAt = r.rep ? r.rep.seq : r.snapSeq;
  const snapPlan = r.legacy ? null : r.rep ? r.rep.confirmed : r.seq === 0 && !r.snapshot ? JSON.parse(JSON.stringify(state)) : null;
  const nonce = versionNonce();
  const [body, label, snapshot] = await Promise.all([
    Sync.seal(r.keys, 'version', { schema: Store.SCHEMA, plan: state, name, nonce }),
    Sync.seal(r.keys, 'label', { schema: Store.SCHEMA, name, nonce }),
    snapPlan ? Sync.seal(r.keys, 'snapshot', { schema: Store.SCHEMA, plan: snapPlan }) : null,
  ]);
  // Sealing takes a moment, in which the room can reconnect (and not be caught
  // up again yet), turn out read-only, or this tab's plan go stale.
  if (room === r && roomReadOnly()) { note('warn', 'Update the app to push to the shared plan: it was saved by a newer version of Car Coordinator.'); render(); return; }
  if (room === r && (!r.caught || planElsewhere)) { note('warn', 'The shared plan changed while the version was being made, so nothing was pushed. Push again in a moment.'); render(); return; }
  if (room !== r || !r.conn.send({ type: 'version', body, label })) { note('warn', 'The connection dropped, so nothing was pushed. Push again once it says Connected.'); render(); return; }
  r.acks.push({ kind: 'version', name, nonce });
  // Never above the seq this plan includes: the relay deletes every op up to it.
  if (snapshot && r.conn.send({ type: 'snapshot', seq: snapAt, body: snapshot })) {
    r.acks.push({ kind: 'snapshot' });
    // A room that had no plan has this one now, and this browser follows it.
    if (!r.rep) { r.rep = Sync.replica(snapAt, snapPlan); roomBaseWrite(r); }
  }
  if (box) box.value = '';
}

/* What the status says, in the words on screen. `cls` picks the Data tab's
   mark: on (✓), off (○) or warn-status (!). */
function roomSays() {
  if (!room || !room.conn) return { short: 'Connecting', text: 'Connecting to the shared plan…', cls: 'off' };
  const { status, closeCode } = room.conn;
  if (status === 'refused') {
    const why = {
      4401: 'The relay does not know this shared plan. The invite link may be wrong, or the plan was removed from the server.',
      4403: 'The create code was not accepted.',
      4409: 'A shared plan with this link already exists.',
      4413: 'The plan is too large for the shared plan.',
    }[closeCode] || 'The relay refused what this browser sent.';
    return { short: 'Refused', text: `${why} Your plan is still on this PC.`, cls: 'warn-status' };
  }
  if (planElsewhere) return { short: 'Reload this tab', text: 'The plan changed in another tab of this browser. Reload this tab before going on; until then it saves and pushes nothing.', cls: 'warn-status' };
  if (status === 'connected' && roomReadOnly()) return { short: 'Update the app', text: 'Update the app to edit the shared plan. It was saved by a newer version of Car Coordinator, so this browser only reads it.', cls: 'warn-status' };
  if (status === 'connected' && room.legacy) return { short: 'Not live', text: 'Connected, but your edits do not reach the shared plan yet: this browser joined it before live updates, and the plan here differs from it. Take the shared plan to edit it together; your plan goes into Backups first.', cls: 'warn-status' };
  if (status === 'connected' && room.rep && room.rep.queue.length && room.waitingSince && Date.now() - room.waitingSince > 1000) return { short: 'Sending\u2026', text: 'Sending your latest changes to the shared plan\u2026', cls: 'off' };
  if (status === 'connected') return { short: 'Connected', text: room.rep ? 'Connected to the shared plan. Your changes reach the other manager as you make them.' : 'Connected to the shared plan.', cls: 'on' };
  if (status === 'offline') return { short: 'Offline', text: 'Offline, working locally. Everything you change is saved on this PC as usual, and this browser keeps trying to reach the shared plan.', cls: 'warn-status' };
  return { short: 'Connecting', text: 'Connecting to the shared plan…', cls: 'off' };
}

// The status in the top bar, so it shows on every tab: only while in a room.
function renderRoomPill() {
  let pill = document.getElementById('syncStatus');
  if (!room) { if (pill) pill.remove(); document.getElementById('syncFlags')?.remove(); return; }
  if (!pill) {
    pill = document.createElement('button');
    pill.id = 'syncStatus';
    pill.type = 'button';
    pill.dataset.act = 'show-data';
    const bar = document.querySelector('.topbar');
    bar.insertBefore(pill, bar.querySelector('[data-act="print"]'));
  }
  const says = roomSays();
  pill.className = `sync-pill ${says.cls}`;
  pill.title = says.text;
  pill.textContent = `Shared plan: ${says.short}`;
  // Changes made by both at once, to look at on the Data tab: a count beside
  // the pill, never a popup.
  roomFlagsPrune(room);
  let count = document.getElementById('syncFlags');
  if (!room.flags.length) { if (count) count.remove(); return; }
  if (!count) {
    count = document.createElement('button');
    count.id = 'syncFlags';
    count.type = 'button';
    count.className = 'sync-flags';
    count.dataset.act = 'show-data';
    pill.after(count);
  }
  count.textContent = `${room.flags.length} to look at`;
  count.title = 'Changed by both of you at once. The Shared plan card on the Data tab lists them, with Put it back.';
}

/* Create: a new room on the relay, seeded with this plan. The owner's create
   code is asked for each time and kept nowhere. The room becomes this
   browser's only once the relay has stored the plan; until then nothing is
   remembered, so a failed Create leaves no trace but the message. */
async function roomCreate() {
  if (room || roomCreating || !syncReady()) return;
  const code = String(document.getElementById('roomCode')?.value || '').trim();
  if (!code) { note('warn', 'Type the create code first. It is set on the shared plan\'s server; the owner of the server has it.'); render(); return; }
  const secret = Sync.newSecret();
  const keys = await Sync.deriveKeys(secret);
  const c = { conn: null, sent: false };
  roomCreating = c;
  const finish = (text) => {
    if (roomCreating !== c) return;
    roomCreating = null;
    c.conn.close();
    if (text) note('warn', text);
    render();
  };
  // Once connected, the relay has made the room (it welcomes a create only
  // after `created`), so a failure from then on leaves it there, empty.
  const madeEmpty = 'The shared plan was made on the server, but your plan did not reach it, so this browser is not using it. It may be on the server without its plan. Ask the server\'s owner to remove it, or try again. Your plan is unchanged.';
  c.conn = Sync.connect({ keys, create: { createCode: code } });
  c.conn.on('status', async (status, closeCode) => {
    if ((status === 'refused' || status === 'offline') && c.sent) {
      finish(madeEmpty);
    } else if (status === 'refused') {
      finish(closeCode === Sync.CLOSE.WRONG_CREATE_CODE
        ? 'The create code was not accepted, so no shared plan was made. Check the code and try again.'
        : 'The server refused to make the shared plan, so none was made. Your plan is unchanged.');
    } else if (status === 'offline') {
      finish('Could not reach the shared plan\'s server, so no shared plan was made. Your plan is unchanged; try again later.');
    } else if (status === 'connected' && !c.sent) {
      c.sent = true;
      let body = null;
      // The room's plan from here on, as sealed: edits made meanwhile are sent
      // as changes once the room is this browser's.
      c.plan = JSON.parse(JSON.stringify(state));
      try { body = await Sync.seal(keys, 'snapshot', { schema: Store.SCHEMA, plan: c.plan }); } catch (e) { console.warn('shared plan: the plan could not be sealed', e); }
      // Seq 0: a room just made holds no ops, and this plan includes none.
      if (roomCreating === c && !(body && c.conn.send({ type: 'snapshot', seq: 0, body }))) finish(madeEmpty);
    }
  });
  c.conn.on('frame', (f) => {
    if (f.type !== 'ack' || roomCreating !== c) return;
    if (!Store.setPref('room', secret)) {
      finish('The shared plan was made, but this browser would not keep its link, so it cannot use it. Its storage may be full or switched off. The plan stays on the server unused: ask the server\'s owner to remove it, or try again.');
      return;
    }
    roomCreating = null;
    c.conn.close();
    roomStart(secret, { seq: 0, plan: c.plan });
    note('info', 'Made a shared plan from your plan. Send the invite link on the Data tab to the other manager, and to no one else.');
    render();
  });
  renderRoom();
}

// The QR is the invite link again, for a phone or a second PC with a camera;
// drawn once per link. qr.js is fetched only when there is an invite to
// draw, so a browser in no shared plan loads nothing it did not before.
let roomQr = { link: '', svg: '' };
let qrLoading = false;
function inviteQr(link) {
  if (typeof QR === 'undefined' || typeof QR.svg !== 'function') {
    if (!qrLoading) {
      qrLoading = true;
      const tag = document.createElement('script');
      tag.src = `qr.js?v=${APP_VERSION}`;
      tag.onload = () => renderRoom();
      document.head.appendChild(tag);
    }
    return '';
  }
  if (roomQr.link !== link) {
    let svg = '';
    try { svg = QR.svg(link, { level: 'M', label: 'The invite link as a QR code' }); } catch { /* too long: the link alone */ }
    roomQr = { link, svg };
  }
  return roomQr.svg;
}

function roomCardHtml() {
  const head = `<h3>Shared plan${infoBtn('data-shared')}</h3>`;
  if (!room) {
    return `${head}
      <p class="hint">One plan for two managers, on any PC. It is locked on this PC before it is sent, so the server cannot read it; only the invite link opens it. To join one, open the invite link you were sent.</p>
      <label class="room-code">Create code <input type="password" id="roomCode" autocomplete="off" spellcheck="false"${roomCreating ? ' disabled' : ''}></label>
      <button class="btn primary-ish" data-act="room-create"${roomCreating ? ' disabled' : ''}>${roomCreating ? 'Creating\u2026' : 'Create a shared plan'}</button>`;
  }
  const says = roomSays();
  const link = Sync.inviteLink(room.secret);
  const qr = inviteQr(link);
  return `${head}
    <p class="status ${says.cls}" id="roomStatus">${esc(says.text)}</p>
    ${roomFlagsHtml()}
    ${room.legacy ? '<button class="btn primary-ish" data-act="room-retake">Take the shared plan\u2026</button>' : ''}
    <h4>Invite link</h4>
    <p class="hint">Whoever has this link can open and change the shared plan. Send it only to the other manager.</p>
    <div class="room-invite">
      <div><textarea id="roomInvite" class="code" readonly rows="2">${esc(link)}</textarea>
      <button class="btn" data-act="room-copy">Copy the invite link</button></div>
      ${qr ? `<div class="room-qr">${qr}</div>` : ''}
    </div>
    ${roomVersionsHtml()}
    <h4>Leave</h4>
    <p class="hint">Stops sharing on this PC and forgets the invite link here. Your plan stays on screen as it is; the shared plan stays on the server for the other manager.</p>
    ${actBtn('room-leave', '', '', armed === 'room-leave' ? 'Sure?' : 'Leave the shared plan', armed === 'room-leave' ? 'armed' : '')}`;
}

// Push, and the versions pushed so far, newest first.
function roomVersionsHtml() {
  const ro = roomReadOnly();
  const up = room.conn && room.conn.status === 'connected';
  const canPush = up && room.caught && !ro && !planElsewhere;
  const rows = room.versions.slice().sort((a, b) => b.id - a.id).map((v) => {
    const sure = armed === `room-restore:${v.id}`;
    const newer = v.schema > Store.SCHEMA;
    return `<li data-version="${esc(v.id)}">
      <span class="room-v-name">${esc(v.name || 'Unnamed')}</span> <span class="room-v-when">${esc(when(v.at))}${newer ? ' \u00b7 saved by a newer version: update the app to restore it' : ''}</span>
      <button class="btn" data-act="room-look" data-id="${esc(v.id)}"${up ? '' : ' disabled'}>Look first</button>
      <button class="btn ${sure ? 'armed' : ''}" data-act="room-restore" data-id="${esc(v.id)}"${up && !newer ? '' : ' disabled'}>${sure ? 'Sure?' : 'Restore'}</button>${bothArmed(`room-restore:${v.id}`)}
    </li>`;
  }).join('');
  return `<h4>Versions</h4>
    <p class="hint">Push saves the plan on screen as a named version in the shared plan, for either of you to go back to. The newest 50 are kept.</p>
    <div class="room-push">
      <input type="text" id="roomVersionName" placeholder="Name it, e.g. Monday final" maxlength="80" autocomplete="off"${ro ? ' disabled' : ''}>
      <button class="btn primary-ish" data-act="room-push"${canPush ? '' : ' disabled'}>Push a version</button>
    </div>
    ${rows ? `<ul class="room-versions">${rows}</ul>` : '<p class="empty">No versions pushed yet.</p>'}`;
}

/* ---------- joining: an offer, never forced ----------
   An invite link opens a dialog that reaches the room to show what it holds,
   and asks. Not now closes the connection and changes nothing at all. Take
   the shared plan puts this plan into Backups first, then replaces the plan
   and setup with the room's: ids are random per PC, so the room's win. */
// { secret, keys, conn, plain: {schema, plan} | null, caught, empty }
let roomOffer = null;
// { id, name, plain } while a version's Look first is open in the same dialog.
let roomLook = null;

function roomDialog() {
  let dlg = document.getElementById('roomDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'roomDlg';
    document.body.appendChild(dlg);
    // Esc closes a dialog on its own; for an offer that is Not now.
    dlg.addEventListener('close', () => { if (roomOffer) roomOfferEnd(); roomLook = null; });
  }
  return dlg;
}

async function roomOfferStart(secret) {
  if (!syncReady()) return;
  // Already following it; one that joined before live updates may take it again.
  if (room && room.secret === secret && !room.legacy) { note('info', 'This browser is already in that shared plan.'); render(); return; }
  roomOfferEnd();
  // room: the room's plan now, its snapshot with every op since (roomPlanOf).
  const o = { secret, keys: null, conn: null, plain: null, room: null, caught: false, schema: 0, ahead: false };
  roomOffer = o;
  o.keys = await Sync.deriveKeys(secret);
  if (roomOffer !== o) return;
  o.conn = Sync.connect({ keys: o.keys });
  o.conn.on('status', (status) => {
    // Since 0: every op after the snapshot, which is all of them.
    if (status === 'connected') o.conn.send({ type: 'catchup', since: 0 });
    if (roomOffer === o) renderRoomOffer();
  });
  o.conn.on('frame', async (f) => {
    if (f.type !== 'catchup') return;
    const plain = f.snapshot && typeof f.snapshot.body === 'string' ? await openOr(o, 'snapshot', f.snapshot.body) : null;
    const labels = [];
    for (const v of Array.isArray(f.versions) ? f.versions : []) { const l = await openOr(o, 'label', v.label); if (l) labels.push(l.schema); }
    const ops = [];
    for (const x of Array.isArray(f.ops) ? f.ops : []) if (Number.isInteger(x.seq)) ops.push({ seq: x.seq, plain: await openOr(o, 'op', x.body) });
    if (roomOffer !== o) return;
    o.plain = plain && plain.plan && typeof plain.plan === 'object' ? plain : null;
    o.schema = Math.max(0, plain ? planSchema(plain) : 0, ...labels, ...ops.map((x) => opSchema(x.plain)));
    // The snapshot with every edit made since: what Take puts on screen.
    // Ops this build cannot apply leave it unknown, so it cannot be taken.
    o.room = o.plain && o.schema <= Store.SCHEMA ? roomPlanOf(f, o.plain, ops) : null;
    o.ahead = !!o.plain && !o.room;
    o.caught = true;
    o.tick = roomTick();
    // Only one look: the offer shows what the room held when it was opened.
    o.conn.close();
    renderRoomOffer();
  });
  renderRoomOffer();
}

/* Another tab of this browser saved the plan while this one is in a shared
   plan. A tab following the room live hears the same change from the room,
   because the other tab sends it, so it does nothing here and follows
   quietly. A tab that cannot follow (offline, not caught up, read-only, not
   following live) would save its stale plan over the other tab's, so it
   stops: it saves and pushes nothing until reloaded, and the pill says so.
   No dialog (owner, 2026-10-08). planElsewhere is declared beside save(),
   which it stops. */
window.addEventListener('storage', (e) => {
  if (!room || planElsewhere || (e.key !== null && e.key !== 'carcoord:v1')) return;
  let now = null;
  try { now = localStorage.getItem('carcoord:v1'); } catch { return; }
  // The plan this tab last saved, written again: nothing has changed.
  if (now === JSON.stringify(state)) return;
  if (roomLive(room) && room.caught && room.conn && room.conn.status === 'connected') return;
  planElsewhere = true;
  renderRoom();
});

// Another tab of this browser joined or left: this one follows, so a Leave
// there leaves no connection open here.
window.addEventListener('storage', (e) => {
  if (!syncReady() || (e.key !== null && e.key !== 'carcoord:pref:room')) return;
  const secret = Store.pref('room');
  if (!SECRET_RE.test(String(secret || ''))) { if (room) { roomStop(); renderKeepingFocus(); } }
  else if (!room || room.secret !== secret) roomStart(secret);
});

// An invite pasted into the address bar of an open page changes only the
// fragment: no reload, so start() never sees it.
window.addEventListener('hashchange', () => {
  if (!syncReady() || !/^#join=/.test(location.hash || '')) return;
  const secret = Sync.readInvite(location.hash);
  if (secret) roomOfferStart(secret);
});

function roomOfferEnd() {
  const o = roomOffer;
  roomOffer = null;
  if (o && o.conn) o.conn.close();
  const dlg = document.getElementById('roomDlg');
  if (dlg && dlg.open && !roomLook) dlg.close();
}

// The lines a preview lists: what the plan offered holds, and what exists only
// on this PC and so is kept in the Backup rather than carried over.
function previewHtml(plan, verb) {
  const p = Sync.joinPreview(state, plan);
  // From the room, so read as a stranger's: a date the app writes, or none.
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date.split('-') : [];
  const n = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`;
  const groups = [['Cars', p.onlyHere.cars], ['Positions', p.onlyHere.positions], ['Labels', p.onlyHere.labels], ['Drivers', p.onlyHere.drivers], ['Day groups', p.onlyHere.crews], ['Templates', p.onlyHere.templates]]
    .filter(([, names]) => names.length);
  return `<p>It is dated <b>${y ? `${d}/${m}/${y}` : 'no date'}</b> and holds <b>${n(p.routes, 'route')}</b>, ${n(p.cars, 'car')}, ${n(p.drivers, 'driver')} and ${n(p.templates, 'template')}.</p>
    <p class="status warn-status"><b>${verb} replaces everything on screen: the day plan and the setup.</b> Your own plan goes into Backups first, so you can get it back.</p>
    ${groups.length ? `<p>Only on this PC, so kept in that Backup and not in what you take:</p>
      <ul class="room-only">${groups.map(([what, names]) => `<li><b>${what}:</b> ${names.map(esc).join(', ')}</li>`).join('')}</ul>` : ''}`;
}

function renderRoomOffer() {
  const o = roomOffer;
  if (!o) return;
  const dlg = roomDialog();
  const status = o.conn ? o.conn.status : 'connecting';
  let body;
  if (o.caught && o.plain && (o.schema > Store.SCHEMA || o.ahead)) {
    body = `<p class="status warn-status">This shared plan was saved by a newer version of Car Coordinator. Update the app to join it; nothing has changed here.</p>`;
  } else if (o.caught && o.plain) {
    body = previewHtml(o.room ? o.room.confirmed : o.plain.plan, 'Taking it')
      + (room ? '<p>This browser leaves the shared plan it is in now.</p>' : '');
  } else if (o.caught) {
    body = '<p class="status warn-status">This shared plan holds no plan yet, so there is nothing to take. Nothing has changed here.</p>';
  } else if (status === 'refused') {
    body = '<p class="status warn-status">This invite link does not open a shared plan: it may be mistyped, or the plan was removed from the server. Nothing has changed here.</p>';
  } else if (status === 'offline') {
    body = '<p class="status warn-status">The shared plan\'s server cannot be reached right now. Still trying; nothing has changed here.</p>';
  } else {
    body = '<p class="status off">Opening the shared plan\u2026</p>';
  }
  const canTake = o.caught && o.room && o.schema <= Store.SCHEMA && !o.ahead;
  dlg.innerHTML = `
    <h2>Join this shared plan?</h2>
    ${staleSince(o.tick) ? STALE_LINE : ''}
    ${body}
    <div class="bar" style="margin:16px 0 0">
      ${canTake ? '<button class="btn primary-ish" data-act="room-take">Take the shared plan</button>' : ''}
      <button class="btn" data-act="room-notnow">Not now</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
}

function roomTake() {
  const o = roomOffer;
  if (planElsewhere) { note('warn', 'The plan changed in another tab, so nothing was taken. Reload this tab first.'); roomOfferEnd(); render(); return; }
  if (!o || !o.room || o.schema > Store.SCHEMA || o.ahead) return;
  const { state: next, error } = Store.parseImport(JSON.stringify(o.room.confirmed), defaults);
  if (error || !next) { note('warn', 'The shared plan could not be read, so nothing was changed.'); roomOfferEnd(); render(); return; }
  if (!Store.snapshot(state, 'Before joining the shared plan')) { roomOfferEnd(); render(); return; }   // the warning says why
  if (!Store.setPref('room', o.secret)) {
    note('warn', 'This browser would not keep the shared plan\'s link (its storage may be full or switched off), so nothing was changed.');
    roomOfferEnd();
    render();
    return;
  }
  roomOfferEnd();
  // The room's plan as confirmed is where this browser starts from; anything
  // reading it here changed (a repair) goes to the room as an edit.
  const base = { seq: o.room.seq, plan: o.room.confirmed };
  roomStop();
  state = next;
  save();
  roomStart(o.secret, base);
  tab = 'data';
  note('info', 'Joined the shared plan. What was on screen before is in Backups on the Data tab.');
  render();
}

async function roomAction(act, b, fromKeyboard = false) {
  switch (act) {
    case 'room-take': roomTake(); return;
    case 'room-retake': if (room) await roomOfferStart(room.secret); return;
    case 'room-putback': roomPutBack(Number(b.dataset.id)); return;
    case 'room-dismiss': if (room) { room.flags = room.flags.filter((x) => x.n !== Number(b.dataset.id)); roomMarks(); renderKeepingFocus(); } return;
    case 'room-notnow': roomOfferEnd(); return;
    case 'room-create': await roomCreate(); return;
    case 'room-push': await roomPush(); return;
    case 'room-leave': {
      if (!room || !confirmTwice('room-leave', fromKeyboard)) return;
      roomStop();
      roomBaseForget();
      if (Store.setPref('room', null)) note('info', 'Left the shared plan. Your plan stays on this PC as it is. The invite link would open the shared plan again.');
      else note('warn', 'Left the shared plan for now, but this browser would not forget its link, so it may join again when the page is next opened.');
      render();
      return;
    }
    case 'room-look': await roomLookFirst(Number(b.dataset.id)); return;
    case 'room-look-close': { roomLook = null; const dlg = document.getElementById('roomDlg'); if (dlg && dlg.open) dlg.close(); return; }
    case 'room-restore': {
      const id = Number(b.dataset.id);
      // From Look first, the dialog's button is the second press; from the
      // list it takes two, as a backup's Restore does.
      if (b.dataset.sure === '1' && roomLook && roomLook.id === id) {
        const { plain, name } = roomLook;
        roomLook = null;
        document.getElementById('roomDlg')?.close();
        await roomRestore(id, { plain, name });
        return;
      }
      if (!confirmTwice(`room-restore:${id}`, fromKeyboard)) return;
      await roomRestore(id);
      return;
    }
    case 'room-copy': {
      if (!room) return;
      try { await navigator.clipboard.writeText(Sync.inviteLink(room.secret)); note('info', 'Copied the invite link.'); } catch { note('warn', 'The clipboard did not take it. Select the link on the Data tab and copy it from there.'); }
      render();
      return;
    }
    default:
  }
}

/* The card is drawn with the Data tab, and again on its own when the
   connection changes, keeping the focus and what was typed in it. */
function renderRoom() {
  renderRoomPill();
  const card = document.getElementById('roomCard');
  if (!card) return;
  const el = document.activeElement;
  const focusId = el && card.contains(el) && el.id ? el.id : null;
  const sel = focusId && 'selectionStart' in el ? [el.selectionStart, el.selectionEnd] : null;
  card.innerHTML = roomCardHtml();
  if (focusId) {
    const again = document.getElementById(focusId);
    if (again) { again.focus(); if (sel) try { again.setSelectionRange(...sel); } catch { /* not a text box */ } }
  }
}

// After a hold is answered in the screen's favour: write it now and say what
// happened, which is only "written" once the write has come back clean.
async function writeScreenToFile() {
  save();
  await Store.flush();
  if (Store.file.error) note('warn', `Nothing was written to ${Store.file.name}: ${Store.file.error} This screen is still saved in this browser.`);
  else note('info', `Wrote this screen to ${Store.file.name}.`);
}

// A hold raised at start-up would otherwise only show on the Data tab, and
// saving to the file stays paused until it is answered.
function noteFileHold() {
  if (!Store.file.hold || Store.file.hold.kind === 'checking') return;
  note('warn', `Saving to ${Store.file.name} is paused: it may hold a plan you want to keep, so nothing has been written to it. Nothing is lost. Choose what to keep on the Data tab.`,
    { act: 'show-data', kind: '', id: '', text: 'Open the Data tab' });
}

// The text exactly as it is, as a file: an archive's Download.
function downloadText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Data-tab actions. These await pickers and disk writes, so they sit outside
   the synchronous switch below. */
async function dataAction(act, b, fromKeyboard = false) {
  switch (act) {
    case 'link-file':
    case 'reconnect-file': {
      // Either can write the screen, moved date and all, to the file: Keep
      // then has to put the old date back there too.
      const was = Store.file.lastSaved;
      await (act === 'link-file' ? Store.linkFile(state, defaults) : Store.reconnect(state, defaults));
      if (dateMove && state === dateMove.plan && Store.file.lastSaved !== was) dateMove.inFile = true;
      break;
    }
    // The answers to the hold Reconnect puts up. Whatever is given up goes
    // into Backups first, and if that cannot be done nothing happens at all.
    case 'file-keep-file': {
      const h = Store.file.hold;
      if (!h || h.kind !== 'differs') break;
      if (!Store.snapshot(state, 'Before loading the save file')) break;   // render() shows why
      Store.release();
      state = h.state;
      Store.saveLocal(state);
      note('info', `Loaded the plan from ${Store.file.name}. What was on screen before is in Backups.`);
      break;
    }
    case 'file-keep-screen': {
      const h = Store.file.hold;
      if (!h || h.kind !== 'differs') break;
      if (!Store.snapshot(h.raw, 'The save file, before it was written over')) break;
      Store.release();
      await writeScreenToFile();
      break;
    }
    case 'file-overwrite': {
      const h = Store.file.hold;
      if (!h || h.kind === 'differs') break;
      if (!confirmTwice('file-overwrite', fromKeyboard)) return;
      Store.release();
      await writeScreenToFile();
      break;
    }
    case 'unlink-file': await Store.unlink(); break;
    case 'open-file': {
      const text = await Store.openFile();
      if (text === null) break;
      applyImport(text, 'the file you opened');
      break;
    }
    case 'export': Store.flush(); Store.download(state); break;
    case 'import': $('#importFile').click(); return;
    case 'restore': {
      // By the backup's time, as Archives' Restore is: a backup taken between
      // the two clicks (another tab) shifts every row down by one, and the
      // second click restored the entry that moved into the row (review,
      // 2026-10-01).
      const key = b.dataset.id;
      if (!confirmTwice(`restore:${key}`, fromKeyboard)) return;
      const all = Store.backups();
      const entry = all[backupKeys(all).indexOf(key)];
      if (!entry) break;
      if (!Store.snapshot(state, 'Restoring a backup')) break;   // render() shows why
      const next = Store.restore(entry, defaults);
      if (!next) break;                        // render() carries its reason
      state = next;
      note('info', `Restored the backup from ${when(entry.t)}.`);
      save();
      break;
    }
    // Found by when it was taken, never by where it sits: a copy taken
    // between the two clicks would shift every row down by one.
    case 'archive-restore': {
      const t = b.dataset.id;
      if (!confirmTwice(`archive:${t}`, fromKeyboard)) return;
      const entry = Store.archives().find((a) => a.kind === 'update' && a.t === t);
      if (!entry) break;
      const { state: next, error } = Store.parseImport(entry.text, defaults);
      if (error || !next) { note('warn', 'That archive could not be read, so nothing was changed. Download keeps it as a file.'); break; }
      if (!Store.snapshot(state, `Restoring the copy from before ${entry.to}`)) break;   // render() shows why
      state = next;
      save();
      note('info', `Restored the copy from before ${entry.to}, taken ${when(entry.t)}. What was on screen is in Backups.`);
      break;
    }
    case 'archive-download': {
      const entry = Store.archives().find((a) => a.kind === b.dataset.kind && a.t === b.dataset.id);
      if (!entry) break;
      downloadText(entry.kind === 'rescue' ? `car-coordinator-unreadable-${String(entry.t).slice(0, 10)}.json` : `car-coordinator-before-${entry.to}.json`, entry.text);
      return;
    }
    case 'dismiss': {
      const [gone] = notices.splice(Number(b.dataset.index), 1);
      if (gone && gone === infoHint) { Store.setPref('infoHint', 'done'); infoHint = null; }
      break;
    }
    default: return;
  }
  render();
}

/* A notice can carry one button — the thing it is offering to do. Everything
   else about it is unchanged: it is dismissable, and dismissing it does
   nothing else at all. */
/* The template shelf sits at the foot of a long day plan while the notices sit
   at its head, so a question raised from down there lands off screen and the
   click reads as having done nothing at all. Scroll it into view once, as it is
   raised — not on every render, or the page would yank itself about while the
   question just sits there waiting. */
let offerRaised = null;

/* A notice can also carry a plain link, { href, text }, drawn beside ✕. It is
   not an offer: a question asked later drops the offers, and the way out of
   an unreadable save must stay. */
const note = (kind, text, offer = null, lines = [], link = null) => {
  notices = notices.filter((n) => n.text !== text);
  const n = { kind, text, offer, lines, link };
  notices.push(n);
  // The first question raised since the last draw is the one brought into
  // view: at start-up that is the one about the data, which comes first on
  // purpose; any question asked later is raised on its own and wins.
  if (offer && !offerRaised) offerRaised = n;
  return n;
};

/* One live offer at a time: asking about Tuesday takes Monday's question away
   rather than leaving two questions on screen that answer each other. */
// Keep stays: it is about the date, not the question being put away.
const dropOffers = () => { notices = notices.filter((n) => !n.offer || isKeep(n)); };

/* ---------- the update note: who sees what ----------
   Pure, so every rule can be driven by a test with a list made by hand.
   Versions compare number by number: 0.10.0 is newer than 0.9.0. */
const versionOrder = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

/* Whether to show a note, and which entries, and whether to mark this
   version seen. In this order:
   1. already shown for this version: nothing;
   2. a first run (nothing saved, nothing recovered): mark only, even when it
      came by a share link, so the note never greets a new leader;
   3. a load that could not be read, or came from a newer version: nothing,
      and the marker left alone, so the note comes on the next clean open;
   4. opened by a share link: the same, and the share dialog has the screen;
   5. the marker is newer than this version (a downgrade, or a stale app.js
      in the cache): nothing;
   6. the list does not start at this version (a stale updates.js): nothing,
      and tried again on the next open;
   7. otherwise every entry this browser has not seen. Every `must` entry is
      shown in full, the newest others fill up to three, and the rest are
      counted: users skip versions, and what a `must` entry says about their
      data cannot be left in a count. */
function updateNoteFor({ version, releases, seen, firstRun, trouble, link }) {
  const nothing = { show: null, mark: false };
  if (seen === version) return nothing;
  if (firstRun) return { show: null, mark: true };
  if (trouble || link) return nothing;
  if (typeof seen === 'string' && versionOrder(seen, version) > 0) return nothing;
  if (!Array.isArray(releases) || !releases[0] || releases[0].version !== version) return nothing;
  const at = seen == null ? -1 : releases.findIndex((r) => r && r.version === seen);
  const unseen = (at < 0 ? releases : releases.slice(0, at)).filter(Boolean);
  const must = unseen.filter((r) => r.must === true);
  const fill = unseen.filter((r) => r.must !== true).slice(0, Math.max(0, 3 - must.length));
  const full = unseen.filter((r) => must.includes(r) || fill.includes(r));
  return { show: { full, more: unseen.length - full.length }, mark: true };
}

/* An update archive is the copy for one step, from one version to another:
   a browser that ran 0.3.0, moved on to a newer build, then came back to
   0.3.0 is making a different step from the first one, and needs a copy of
   its own. */
const copyFor = (a, version, from) => !!a && a.kind === 'update' && a.to === version && a.from === from;
// The version a browser is coming from, as an archive records it.
const updatingFrom = (seen) => (typeof seen === 'string' ? seen : '0.2.4 or earlier');
/* A rescue taken under this version holds what this browser had before the
   plan it has now, which was typed after the loss. That rescue is this
   version's copy: archiving the new plan as "before" the update would say
   something that is not so. Not when the marker is newer, though: then
   the browser has run a newer build since that rescue, and is stepping back
   to this one with data the newer build wrote, which needs a copy. */
const rescuedDuring = (a, version, seen) => !!a && a.kind === 'rescue' && a.during === version
  && !(typeof seen === 'string' && versionOrder(seen, version) > 0);

/* Whether this open takes an update archive: the saved text is a usable
   plan, this browser has not already run this version (a first run, then a
   change and a reload, has nothing from before the update to keep), and no
   archive is already stored for this step. A marker newer than this version
   is a downgrade, and is archived: an older build is about to rewrite newer
   data. */
function archiveNeeded({ version, from, usableText, archives, seen }) {
  if (typeof usableText !== 'string') return false;
  if (seen === version) return false;
  return !(Array.isArray(archives) ? archives : []).some((a) => copyFor(a, version, from) || rescuedDuring(a, version, seen));
}

/* Whether this open is a first run: nothing saved in this browser and
   nothing recovered from the save file. Set once, at start-up, for the
   first-open hint to read as well. */
let firstRun = false;

/* The first write at boot: the saved text, byte for byte, into Archives
   before anything else can change it. Returns what the update note can say
   about the copy, { copy, dropped }: copy is 'kept' when one is stored for
   this step (now, or on an earlier open that held the note back), 'rescued'
   when this version rescued a save it could not read, and 'full' when
   storage had no room; dropped is how many older copies made room for
   it. null when there was nothing to copy. An old cached store.js without
   archives skips it: the plan is still drawn, and the copy comes on the
   first open with all the new files. */
function archiveBeforeUpdate() {
  if (!['archive', 'archives', 'savedText', 'pref'].every((f) => typeof Store[f] === 'function')) return null;
  const list = Store.archives();
  const seen = Store.pref('seenUpdate');
  const from = updatingFrom(seen);
  if (list.some((a) => copyFor(a, APP_VERSION, from))) return { copy: 'kept', dropped: 0 };
  if (list.some((a) => rescuedDuring(a, APP_VERSION, seen))) return { copy: 'rescued', dropped: 0 };
  const text = Store.savedText();
  if (!archiveNeeded({ version: APP_VERSION, from, usableText: Store.hasUsableLocalData() ? text : null, archives: list, seen })) return null;
  const { ok, dropped } = Store.archive({ kind: 'update', from, to: APP_VERSION, t: new Date().toISOString(), text });
  return { copy: ok ? 'kept' : 'full', dropped: ok ? dropped : 0 };
}

/* What the note says, sentence by sentence: the version, what happened to
   the saved plan, where else it can be kept, and how to put the note away.
   Nothing is claimed that did not happen: with no copy made, and no plan
   read from the save file, the copy sentence is left out. */
function updateNoteText(kept, recovered) {
  const f = Store.file;
  const copy = kept && kept.copy;
  const said = [`Car Coordinator has been updated to ${APP_VERSION}.`];
  if (recovered) said.push('Your plan was read from your save file, which this update did not change.');
  else if (copy === 'kept') {
    said.push('Before anything else, your plan and setup (routes, templates, drivers, day groups, cars, positions, labels) were copied unchanged into Archives on the Data tab.');
    if (kept.dropped > 0) said.push(`To make room, ${kept.dropped === 1 ? '1 older copy in Archives was' : `${kept.dropped} older copies in Archives were`} removed.`);
  } else if (copy === 'rescued') said.push('What this browser had saved before could not be read; it is kept unchanged in Archives on the Data tab.');
  else if (copy === 'full') said.push('No copy could be put in Archives, because this browser\'s storage is full. Use Export on the Data tab to keep one.');
  // Left out in the Windows app until the owner has checked the file picker
  // works there, and while a hold is up: that has a notice of its own.
  if (!window.__TAURI__ && !f.hold) {
    if (f.handle) {
      said.push(f.permission === 'granted' ? `Changes are also written to your save file, ${f.name}.` : `Saving to ${f.name} is paused; reconnect it on the Data tab.`);
    } else if (Store.fileSupported()) said.push('To keep a copy of every change outside this browser, use Choose save file\u2026 on the Data tab.');
    else said.push('To keep a copy outside this browser, use Export on the Data tab.');
  }
  said.push('\u2715 puts this away; What\'s new on the Data tab keeps every note.');
  return said.join(' ');
}

function updateNoteLines({ full, more }) {
  const lines = [];
  for (const r of full) {
    lines.push({ head: `What's new in ${r.version}:`, text: `${r.title}. ${r.changed}` });
    lines.push({ head: 'What it affects:', text: r.affects });
    lines.push({ head: 'Your data:', text: r.data });
  }
  if (more > 0) lines.push(`And ${more} other update${more === 1 ? '' : 's'}, all listed on the Data tab under What's new.`);
  return lines;
}

/* The note, raised last so it sits under every question about the data.
   Anything it cannot work out counts as a reason to wait: no note and no
   mark, and it is tried again on the next open. */
function raiseUpdateNote({ link, recovered, copy }) {
  if (!['pref', 'setPref', 'savedText', 'loadTrouble'].every((f) => typeof Store[f] === 'function')) return;
  firstRun = Store.savedText() === null && !recovered;
  const seen = Store.pref('seenUpdate');
  if (seen === undefined) return;                       // storage could not be read
  const { show, mark } = updateNoteFor({
    version: APP_VERSION,
    releases: typeof UPDATES === 'undefined' ? undefined : UPDATES,
    seen, firstRun, trouble: Store.loadTrouble(), link,
  });
  // Seen once shown, not once dismissed: a reload never brings it back.
  if (mark) Store.setPref('seenUpdate', APP_VERSION);
  if (show) note('update', updateNoteText(copy, recovered), null, updateNoteLines(show));
}


/* The first-open hint: one line, raised when there is reason to think this
   is someone's first look (a first-ever open with nothing saved and nothing
   read from a save file, not by a share link, no warning up, no save file
   linked), and only while this browser has never put it away. Its ✕ puts it
   away for good, in a per-browser pref, never on the plan. Kept, so that ✕
   and no other notice's is the one that does. */
let infoHint = null;
function offerInfoHint(link) {
  if (!firstRun || link || typeof HELP === 'undefined' || typeof Store.pref !== 'function') return;
  if (notices.some((n) => n.kind === 'warn') || (Store.file && Store.file.handle)) return;
  // null is "never put away"; undefined is storage that could not be read,
  // which is no reason to show it.
  if (Store.pref('infoHint') !== null) return;
  infoHint = note('info', 'New here? Click any \u24d8 to see what that part does.');
}

/* The confirmation for the only destructive action a click from the day plan.
   It is a notice rather than a dialog because there is room here to say what
   is about to be replaced in words — and because the weekday offer needs a
   notice anyway, so both ways in end at the same question and the same load. */
/* The offer to take the round out of the spot names. It only ever asks, and
   it asks with the list in its hand: every old name, what it becomes, what
   merges into what, how many routes gain a round and how many keep the one
   they were given. A leader agreeing to this is agreeing to a stated list,
   not to a description of one — this rewrites saved names, and the only way
   back is the backup taken when the button is pressed.

   Raised beside the weekday template question rather than instead of it: the
   two are different questions and neither answers the other. Asking about a
   template does take this one off the screen (dropOffers), which is no loss —
   nothing has been changed, and it is raised again on the next load. */
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/* One line per position, each saying where it lands. A spot that is already
   called "Spot 1" keeps its name and its settings; the numbered ones fold
   into it. The offer reads these out and so does the report afterwards, so
   what was agreed to and what was done are the same list of lines. */
function spotNameLines(plan) {
  const lines = [];
  for (const s of plan.spots) {
    lines.push(s.round === null
      ? `${s.keepName} → stays exactly as it is: the name the spot${s.absorbed.length === 1 ? '' : 's'} below fold into`
      : `${s.keepName} → ${s.name}, round ${s.round}`);
    for (const a of s.absorbed) lines.push(`${a.name} → ${s.name}, round ${a.round} — the same ${s.name}: two spots become one`);
  }
  return lines;
}

function spotRoundLines(plan) {
  const lines = spotNameLines(plan);
  const { filled, kept } = plan.routes;
  if (filled) lines.push(`${filled} route${filled === 1 ? ' has its round' : 's have their rounds'} filled in from the spot name.`);
  if (kept) lines.push(`${kept} route${kept === 1 ? '' : 's'} already ${kept === 1 ? 'has a round' : 'have rounds'} typed in and ${kept === 1 ? 'is' : 'are'} left exactly as ${kept === 1 ? 'it is' : 'they are'} — what was typed wins over the name.`);
  for (const t of plan.templates) {
    const say = [t.filled ? `${t.filled} route${t.filled === 1 ? '' : 's'} filled in` : '', t.kept ? `${t.kept} left as typed` : ''].filter(Boolean);
    lines.push(`The ${t.name.trim() || 'unnamed'} template moves with the plan: ${say.join(', ')}.`);
  }

  for (const s of plan.spots) {
    if (!s.conflicts.length) continue;
    const names = andList([s.keepName, ...s.absorbed.map((a) => a.name)]);
    lines.push(`${names} do not agree about ${andList(s.conflicts)}. ${s.name} keeps what ${s.keepName} has — ${s.round === null ? 'the spot that already had the plain name wins' : 'the lowest round wins'}.`);
  }

  lines.push('Do this on both PCs before swapping share codes again: a shared list finds a spot by its name, so while one side has split and the other has not, a code from one arrives on the other with the position blank on every route.');
  lines.push('Dismissing this (✕) changes nothing at all, and the question comes back next time you open the app.');
  return lines;
}

/* The only thing in this pack that writes, and it runs from one place: the
   button inside the offer that has just listed what it would do.

   The plan it works from is worked out again at the press rather than kept
   from the offer, because the list on screen can be minutes old: a round
   typed, a spot added or renamed since it was raised all belong in what
   happens. The report afterwards reads that same plan back out, so what is
   claimed is what was done.

   The surviving position is renamed where it stands, so the Positions tab
   does not reshuffle under the leader; the absorbed ones go, and everything
   standing on one of them — the day plan and the saved templates alike — is
   moved onto the survivor and given the round its old spot name spelled out.
   A round already typed in is never overwritten: the name says round 1 and
   the route says 2 because somebody moved that car, and the route is the
   newer fact. */
function applySpotRoundSplit(plan) {
  const repoint = (routes) => {
    for (const r of routes || []) {
      // The round comes from the position the route is on now, so read it
      // before the move: re-pointing is what takes the old name away.
      const round = plan.roundFrom.get(r.positionId);
      if (round === undefined) continue;
      if (!fold(r.round)) r.round = round;
      if (plan.moveTo.has(r.positionId)) r.positionId = plan.moveTo.get(r.positionId);
    }
  };
  repoint(state.routes);
  for (const t of state.templates || []) repoint(t.routes);

  for (const s of plan.spots) {
    const keep = byId(state.positions, s.keepId);
    if (keep) keep.name = s.name;
  }
  state.positions = state.positions.filter((p) => !plan.moveTo.has(p.id));
}

function offerSpotRoundSplit() {
  const plan = spotRoundPlan(state);
  if (!plan.spots.length) return;                      // nothing has a round in its name
  const merging = plan.spots.reduce((n, s) => n + s.absorbed.length, 0);
  note('warn',
    `Your packing spots still carry the round in their names. On the pillar sheet "Spot 1/1" is spot one, round one, and the app now keeps that round on the route instead${merging ? `, so ${merging === 1 ? 'one of these spots is' : `${merging} of these spots are`} the same spot as another and would be merged` : ''}. Nothing has been changed yet — this is the whole of what the button would do, and a backup is taken first:`,
    { act: 'split-rounds', kind: '', id: '', text: 'Split the rounds out' },
    spotRoundLines(plan));
}

/* Loading a template in parts. Each tick takes one thing from the template:
   Routes is the route list itself (names, order, marks and gaps); Drivers;
   Cars; Positions and rounds, together, since a round is a round at a spot.
   An unticked part keeps what the plan has now. Routes are matched by name,
   folded; a blank name matches nothing, and of two routes sharing a name the
   first is the one matched.
   The question's sentence, its button and the load itself all read this one
   answer, so the question says exactly what the load does. */
const TEMPLATE_PARTS = [['routes', 'Routes'], ['drivers', 'Drivers'], ['cars', 'Cars'], ['positions', 'Positions and rounds']];
const allParts = () => ({ routes: true, drivers: true, cars: true, positions: true });
function templateLoad(t, parts, routes) {
  const byName = (list) => {
    const m = new Map();
    for (const r of list) if (fold(r.name) && !m.has(fold(r.name))) m.set(fold(r.name), r);
    return m;
  };
  // The ticked parts of `from`, put on `to`.
  const take = (to, from) => ({
    ...to,
    ...(parts.drivers ? { driver: from.driver } : {}),
    ...(parts.cars ? { carId: from.carId } : {}),
    ...(parts.positions ? { positionId: from.positionId, round: from.round } : {}),
  });
  if (parts.routes) {
    // The template's routes, each starting from the plan's route of the same
    // name for the parts left unticked, or blank where there is none. Ids are
    // minted here rather than stored, so loading the same template twice
    // cannot leave two rows sharing one id; the spread goes first, so a stored
    // id cannot put itself back over the new one.
    const mine = byName(routes);
    let matched = 0;
    const next = t.routes.map((r) => {
      const was = mine.get(fold(r.name));
      if (was) matched++;
      return take({ ...r, id: uid(), driver: was?.driver || '', carId: was?.carId || '', positionId: was?.positionId || '', round: was?.round || '' }, r);
    });
    return { routes: next, matched, unmatched: next.length - matched };
  }
  const theirs = byName(t.routes);
  let matched = 0;
  const next = routes.map((r) => {
    const from = theirs.get(fold(r.name));
    if (!from) return r;
    matched++;
    return take(r, from);
  });
  return { routes: next, matched, unmatched: next.length - matched };
}

// The words for what the ticks take: "positions and rounds" is two things to
// a sentence, and "positions" alone on a button.
const partWords = (parts, ticked) => [
  parts.drivers === ticked && 'drivers', parts.cars === ticked && 'cars',
  ...(parts.positions === ticked ? ['positions', 'rounds'] : []),
].filter(Boolean);

function templateQuestion(t, parts) {
  const now = state.routes.length;
  const n = t.routes.length;
  const { matched, unmatched } = templateLoad(t, parts, state.routes);
  const taken = partWords(parts, true);
  const kept = partWords(parts, false);
  const short = taken.filter((w) => w !== 'rounds');
  let text, button = null;
  if (parts.routes) {
    text = `Replaces your ${plural(now, 'route')} with ${t.name}'s ${n}${taken.length ? `, with their ${andList(taken)}` : ''}.`;
    if (kept.length) {
      text += ` Their ${andList(kept)} come from your route of the same name, where there is one: ${
        !matched ? 'none of them has one, so they start blank'
          : !unmatched ? `all ${n} have one`
            : `${matched} of ${n} have one, and the other ${unmatched} start blank`}.`;
    }
    button = `Load ${t.name}: ${['routes', ...short].join(', ')}`;
  } else if (taken.length) {
    text = `Keeps your ${plural(now, 'route')} and puts in ${t.name}'s ${andList(taken)}, by route name${
      !unmatched ? '.'
        : !matched ? `; none of your routes is in ${t.name}, so nothing changes.`
          : `; ${unmatched} of your routes ${unmatched === 1 ? 'is' : 'are'} not in ${t.name} and keep${unmatched === 1 ? 's its' : ' theirs'}.`}`;
    if (matched) button = `Put in ${t.name}'s ${andList(short)}`;
  } else {
    text = `Tick what to take from ${t.name}.`;
  }
  if (button) text += ' A backup is taken first, so Backups can undo it.';
  return { text, button };
}

/* The load question. Its ticks are kept on the question itself, never on the
   plan: they are how this one load is to be done, not part of the plan. */
function askTemplate(t) {
  dropOffers();
  if (!t.routes.length) { note('info', `The ${t.name} template is not saved yet, so there is nothing to load. Save puts the plan on screen into it.`); return; }
  const n = note('warn', `Load the ${t.name} template over the plan on screen? Untick what the plan should keep.`,
    { act: 'load-template', kind: 'template', id: t.id, text: `Load ${t.name}` });
  n.parts = allParts();
  n.tick = roomTick();
}

function applyImport(text, source) {
  const { state: incoming, error, repaired } = Store.parseImport(text, defaults);
  if (error) { note('warn', error); render(); return; }
  if (!Store.snapshot(state, `Importing ${source}`)) { render(); return; }   // the warning says why
  state = incoming;
  save();
  note('info', `Loaded ${incoming.routes.length} routes and ${incoming.cars.length} cars from ${source}.${repaired && repaired.length ? ' Some entries needed repairing.' : ''}`);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  // A menu that only closes by pressing its own button is a menu you have to
  // remember to shut. Any click that is not in it, or on the button that
  // opened it, is an answer of "not that one".
  if (tagFor && !e.target.closest('.tag-menu') && !e.target.closest('[data-act="tag"]')) {
    closeTagMenu();
    if (!b) return;
  }
  if (!b) return;
  const { act, kind, id } = b.dataset;
  if (SHARE_ACTS.has(act)) { shareAction(act, b); return; }
  if (DATA_ACTS.has(act)) { dataAction(act, b, e.detail === 0); return; }
  if (ROOM_ACTS.has(act)) { roomAction(act, b, e.detail === 0); return; }
  // A tick in a template's load question changes the question, never the plan.
  if (act === 'tpl-part') {
    const n = notices[Number(b.dataset.index)];
    if (n && n.parts) n.parts[b.dataset.part] = b.checked;
    renderKeepingFocus();
    return;
  }
  const list = listFor(kind);
  const i = list ? list.findIndex((x) => x.id === id) : -1;
  // Every act below that reads list[i] needs there to be an i. There should
  // always be one — the button was drawn from that very list — but a stale
  // button is cheap to survive and expensive not to: list[-1] throws, and
  // splice(-1, 1) quietly deletes the last row instead of the one clicked.
  if (ITEM_ACTS.has(act) && i < 0) return;
  // A button pressed from the keyboard is replaced by the redraw it causes;
  // the acts that know where the focus belongs next say so here.
  let refocus = null;
  // What the plan was before the press: a press that changes nothing saves
  // nothing, so "saved with your next change" stays true, and a press never
  // rewrites the save file for no reason. One guard rather than a list of
  // acts, which would miss one or mistake a real edit for a no-op.
  const before = JSON.stringify(state);

  switch (act) {
    // Switching tabs changes nothing that is saved, so it saves nothing. It
    // used to, which put the empty on-screen plan over a saved plan this
    // browser could not read, on the very click (the Data tab) the warning
    // sends you to.
    case 'tab': tab = b.dataset.tab; render(); return;
    // Keep: the old date back wherever the moved one went. On its own path,
    // because the shared save below would see the date change and write this
    // browser even when the move never reached it.
    case 'keep-date': {
      const m = dateMove;
      dropKeep();
      if (!m || state !== m.plan || state.date !== m.to) { render(); return; }
      state.date = m.from;
      note('info', `Kept ${dayLabel(m.from)}. That day has passed, so the date moves again the next time the app is opened.`);
      if (m.saved) save();
      else if (m.inFile && typeof Store.saveFile === 'function') Store.saveFile(state);
      render();
      return;
    }
    // The colours belong to this browser, never to the plan: a pref, and like
    // switching tabs it saves nothing. Follow the computer removes the pref.
    case 'theme': {
      const t = b.dataset.colours === 'light' || b.dataset.colours === 'dark' ? b.dataset.colours : null;
      applyTheme(t);
      themeKept = typeof Store.setPref === 'function' && Store.setPref('theme', t) === true;
      renderKeepingFocus();
      return;
    }
    case 'show-data': tab = 'data'; render(); return;
    // A menu's Go to: its tab, and the item's box there focused and clear of
    // the top bar, with its row lit for a moment. It moves you, and saves
    // nothing.
    case 'go': {
      const g = b.dataset;
      if (!document.getElementById(`tab-${g.goTab}`)) return;
      tab = g.goTab;
      render();
      const el = document.querySelector(`#tab-${g.goTab} [data-kind="${g.goKind}"][data-id="${CSS.escape(g.goId)}"][data-field="${g.goField}"]`);
      if (!el) return;
      el.focus({ preventScroll: true });
      clearOfBar(el);
      const row = el.closest('tr, li');
      if (row) { row.classList.add('ctx-found'); setTimeout(() => row.classList.remove('ctx-found'), 1500); }
      return;
    }
    case 'print': doPrint(); return;
    case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
    case 'down': if (i >= 0 && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
    case 'toggle': list[i][b.dataset.field] = !list[i][b.dataset.field]; break;
    case 'setLabel': list[i][tagField(kind)] = b.dataset.label; break;
    // The rail's quick tag: the same tag the Drivers, Cars and Positions tabs
    // set with their chips, reached without leaving the plan.
    case 'tag':
      tagFor = tagOpenFor(kind, id) ? null : { kind, id };
      render();
      // A button reached by Shift+Tab can sit under the sticky top bar; bring
      // it clear first, or its menu opens under the bar too.
      if (tagFor) clearOfBar(tagAnchor());
      // The menu is drawn at the end of the page, not after its button, so
      // the keyboard is taken to it rather than left to Tab the whole way.
      if (tagFor) ($('#tagMenu .tag-choice.on') || $('#tagMenu .tag-choice'))?.focus();
      return;
    case 'set-tag':
      list[i][tagField(kind)] = b.dataset.label;
      tagFor = null;
      if (e.detail === 0) refocus = `#tab-plan [data-act="tag"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`;
      break;
    case 'add-tag': {
      const name = $('#newTagName').value.trim();
      if (!name) { $('#newTagName').focus(); return; }
      // A driver's new tag is a driver tag; a car's is a label, onSheet and all.
      const driverTag = tagList(kind) !== state.labels;
      const made = { id: uid(), name, color: $('#newTagColor').value, ...(driverTag ? {} : { onSheet: false }) };
      tagList(kind).push(made);
      list[i][tagField(kind)] = made.id;
      tagFor = null;
      if (e.detail === 0) refocus = `#tab-plan [data-act="tag"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`;
      note('info', driverTag
        ? `Tagged ${list[i].name} ${name}. The tag is under Driver tags on the Labels tab now, for every driver.`
        : `Tagged ${list[i].reg || list[i].name} ${name}. The label is on the Labels tab now, for every car and position.`);
      break;
    }
    case 'del':
      if (!confirmTwice(`del:${id}`, e.detail === 0)) return;
      // The backup list shows this label as written, so say it the way it
      // reads on screen rather than the way the code spells it.
      // Every act that throws something away goes ahead only once its backup
      // is stored: with the browser's storage full it stops, and the warning
      // says why (review, 2026-10-01).
      if (!Store.snapshot(state, `Deleting a ${{ driverGroup: 'day group', driverTag: 'driver tag' }[kind] || kind}`)) break;
      list.splice(i, 1);
      if (kind === 'car') state.routes.forEach((r) => { if (r.carId === id) r.carId = ''; });
      if (kind === 'position') state.routes.forEach((r) => { if (r.positionId === id) r.positionId = ''; });
      // Whatever wore it goes back to no tag, and only its own kind: a label
      // comes off cars and positions, a driver tag off drivers. Left pointing
      // at nothing, it lit no chip, then came back as a repair notice.
      if (kind === 'label' || kind === 'driverTag') {
        for (const [k, items] of [['car', state.cars], ['position', state.positions], ['driver', state.drivers]]) {
          if (tagList(k) === list) items.forEach((x) => { if (x[tagField(k)] === id) x[tagField(k)] = ''; });
        }
      }
      // A deleted driver leaves every group, but the day plan keeps the name
      // typed into it: that text is the plan, not a reference to the roster.
      if (kind === 'driver') state.driverGroups.forEach((g) => { g.driverIds = g.driverIds.filter((x) => x !== id); });
      // Templates hold the same car and position ids the plan does, so a
      // deleted one has to leave them as well. Left in, the id would come back
      // as a repair notice on the next reload, about a template nobody touched.
      if (kind === 'car' || kind === 'position') {
        const ref = kind === 'car' ? 'carId' : 'positionId';
        state.templates.forEach((t) => t.routes.forEach((r) => { if (r[ref] === id) r[ref] = ''; }));
      }
      break;
    // The calendar is the browser's own, on a date field kept out of sight
    // under the Date box; what is picked in it is typed into the box (below).
    case 'pick-date':
      openDatePicker();
      return;
    // « ‹ › »: a month or a day either way, as if typed; the focus stays on the
    // button, so it can be pressed again.
    case 'date-step':
      putDate(stepDate(state.date, b.dataset.unit, Number(b.dataset.by)));
      return;
    case 'set-tomorrow': {
      const was = state.date;
      state.date = nextWorkingDay();
      if (state.date !== was) loadDayCrew();
      dropKeep();
      if (e.detail === 0) refocus = '#date';
      break;
    }
    case 'clear-day':
      if (!confirmTwice('clear', e.detail === 0)) return;
      if (!Store.snapshot(state, 'Clearing the day')) break;
      state.routes.forEach((r) => { r.driver = ''; r.carId = ''; r.positionId = ''; r.round = ''; r.highlight = false; });
      state.date = nextWorkingDay();
      // The same plan object and the moved date again, so Keep would not see
      // it is stale: it goes explicitly, or it could write a passed date
      // over the day just cleared.
      dropKeep();
      break;
    // A blank route beside the one clicked. Directly above it, the clicked
    // row keeps its gap, so deleting the new row later never takes a gap
    // with it. No name: a route put in mid-list is not "the highest + 1".
    // The caret goes to its name box, since a name is typed next.
    case 'insert-route': {
      const r = newRoute('');
      state.routes.splice(b.dataset.where === 'below' ? i + 1 : i, 0, r);
      refocus = `#tab-plan [data-kind="route"][data-id="${CSS.escape(r.id)}"][data-field="name"]`;
      break;
    }
    // One route blanked, as Clear blanks the day: never its name, its gap or
    // the date. Its own confirm key, which cannot meet the day's 'clear'.
    case 'clear-route': {
      const r = list[i];
      if (routeIsBlank(r)) { render(); return; }   // blanked meanwhile: no backup for nothing
      if (!confirmTwice(`clear:${id}`, e.detail === 0)) return;
      if (!Store.snapshot(state, `Clearing route ${r.name.trim() || '-'}`)) break;
      r.driver = ''; r.carId = ''; r.positionId = ''; r.round = ''; r.highlight = false;
      break;
    }
    // Only while the route still holds what the entry was drawn for: the
    // car or position by id, the driver by the name as the roster matches it.
    // Away from the Day plan the change cannot be seen, so a notice says it.
    case 'take-off': {
      const r = list[i];
      const f = b.dataset.take, was = b.dataset.was || '';
      const holds = f === 'driver' ? !!fold(was) && fold(r.driver) === fold(was)
        : (f === 'carId' || f === 'positionId') && !!was && r[f] === was;
      if (!holds) { render(); return; }
      const what = f === 'driver' ? r.driver.trim() : f === 'carId' ? byId(state.cars, was)?.reg : byId(state.positions, was)?.name;
      r[f] = '';
      if (tab !== 'plan') note('info', `Took ${what || 'it'} off route ${r.name.trim() || '-'}.`);
      break;
    }
    // A rail menu's Put on route N: only while that route is still missing
    // one, and only an item that still exists. The same field a drop sets.
    case 'put-on': {
      const r = list[i];
      const f = b.dataset.take, v = b.dataset.value || '';
      const free = f === 'driver' ? !fold(r.driver) : f === 'carId' ? !r.carId : false;
      if (!free || !v || (f === 'carId' && !byId(state.cars, v))) { render(); return; }
      r[f] = v;
      break;
    }
    // A Position box's Move to: only while the route still has the position
    // the entry was drawn for. The same field the select sets.
    case 'move-pos': {
      const r = list[i];
      const v = b.dataset.value || '', was = b.dataset.was || '';
      if (r.positionId !== was || !byId(state.positions, v)) { render(); return; }
      r.positionId = v;
      break;
    }
    // Down to the position's box on the parking map, lit for a moment. It
    // moves the page, and saves nothing.
    case 'show-map': {
      const box = document.querySelector(`#planMap [data-position="${CSS.escape(id || '')}"]`);
      if (!box) return;
      box.scrollIntoView({ block: 'center' });
      box.classList.add('ctx-found');
      setTimeout(() => box.classList.remove('ctx-found'), 1500);
      return;
    }
    case 'add-route': {
      const nums = state.routes.map((r) => parseInt(r.name, 10)).filter(Number.isFinite);
      state.routes.push(newRoute(String(nums.length ? Math.max(...nums) + 1 : 1)));
      break;
    }
    case 'add-car':
      if (!addFromInput(b.dataset.from || '#newCar', (v) => v.toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((reg) => {
        // Folded, like every other match in the app: a reg that came in from
        // a share code or an imported file in lower case is the same car, and
        // adding it again would put one lorry on the fleet twice.
        if (!state.cars.some((c) => fold(c.reg) === fold(reg))) state.cars.push({ id: uid(), reg, labelId: '', note: '' });
      }))) return;
      break;
    case 'add-driver':
      // Commas and newlines only: a driver's name has spaces in it, unlike a
      // registration, so splitting on whitespace would make two of everyone.
      if (!addFromInput(b.dataset.from || '#newDriver', (v) => v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach((name) => {
        if (!state.drivers.some((d) => fold(d.name) === fold(name))) state.drivers.push(newDriver(name));
      }))) return;
      break;
    case 'add-group':
      if (!addFromInput('#newGroup', (name) => state.driverGroups.push({ id: uid(), name, driverIds: [] }))) return;
      break;
    case 'save-template':
      if (!addFromInput('#newTemplate', saveTemplate)) return;
      break;
    // Two acts, because loading a template is two steps on purpose: the shelf
    // (and the weekday offer) only ever ask, and the button in the question is
    // the only thing that writes.
    case 'ask-template':
      askTemplate(list[i]);
      break;
    // Save, on the card and in its menu (Update from plan until 0.14.1): this
    // template, found by its id rather than by its name, so the one clicked
    // is the one updated even when two share a name. It keeps its id, name
    // and saved weekday, after a backup.
    case 'resave-template': {
      if (!confirmTwice(`resave:${id}`, e.detail === 0)) return;
      const t = list[i];
      if (!Store.snapshot(state, `Updating the ${t.name} template from the plan`)) break;
      const routes = templateRoutes();
      list[i] = { ...t, routes };
      note('info', `Updated the ${t.name} template from the plan: it holds the ${routes.length} routes on the plan now. What it held before is in Backups.`);
      if (e.detail === 0 && b.closest('#planTemplates')) refocus = `#planTemplates [data-act="resave-template"][data-id="${CSS.escape(id)}"]`;
      break;
    }
    case 'peek-template': {
      const pinning = tplOpen !== id;
      tplOpen = pinning ? id : null;
      tplHover = null;
      render();
      // From the keyboard the focus follows: into the layer to read and shut
      // it, and back to the card's route count when it shuts.
      if (e.detail === 0) {
        (pinning ? $('#tplPeek [data-act="peek-template"]')
          : $(`#planTemplates .tpl-head[data-tpl="${CSS.escape(id)}"] [data-act="peek-template"]`))?.focus();
      }
      return;
    }
    // The parts the question has ticked; all of them for a question without
    // ticks. Nothing ticked has no button, and does nothing.
    case 'load-template': {
      const t = list[i];
      const parts = notices.find((n) => n.parts && n.offer?.id === id)?.parts || allParts();
      const taken = partWords(parts, true);
      if (!parts.routes && !taken.length) return;
      const done = templateLoad(t, parts, state.routes);
      if (!Store.snapshot(state, `Loading the ${t.name} template`)) break;
      state.routes = done.routes;
      dropOffers();
      note('info', parts.routes
        ? `Loaded the ${t.name} template: ${plural(state.routes.length, 'route')}${taken.length ? `, with their ${andList(taken)}` : ''}. The plan as it was is in Backups.`
        : `Put in the ${t.name} template's ${andList(taken)} on ${plural(done.matched, 'route')}. The plan as it was is in Backups.`);
      break;
    }
    case 'group-member': {
      const g = list[i];
      const at = g.driverIds.indexOf(b.dataset.driver);
      if (at >= 0) g.driverIds.splice(at, 1); else g.driverIds.push(b.dataset.driver);
      break;
    }
    // No notice from the chip line: the lit chip and the count in the heading
    // already say what happened, and a notice arriving above the plan would
    // push the week down under the pointer about to press the next Load.
    case 'all-in':
      state.drivers.forEach((d) => { d.available = true; });
      delete planScroll.drivers;
      if (e.detail === 0) refocus = '#tab-plan .rail-groups [data-act="all-in"]';
      break;
    case 'day-ask-close': {
      const was = dayAsk;
      dayAsk = null;
      render();
      // From the keyboard, back to the chip that asked.
      if (e.detail === 0 && was && was.groupId) document.querySelector(`#tab-plan .rail-groups [data-id="${CSS.escape(was.groupId)}"]`)?.focus();
      return;
    }
    case 'group-empty':
      dayAsk = { groupId: id };
      render();
      if (e.detail === 0) document.querySelector(`#tab-plan .rail-groups [data-id="${CSS.escape(id)}"]`)?.focus();
      return;
    // Counted when pressed, not when asked: who is in may have changed since.
    // From an empty weekday's column. No question and no notice: the column
    // filling and lighting up is the answer.
    case 'save-day-crew': {
      const day = Number(b.dataset.day);
      const driverIds = state.drivers.filter((d) => d.available).map((d) => d.id);
      const crew = WEEKDAYS[day] ? dayCrews().byDay.get(day) : null;
      // Nothing to do: not a day, nobody in, or a crew made on the Drivers tab
      // meanwhile. The page redraws to say so, and nothing is saved.
      if (!WEEKDAYS[day] || (crew && crewIds(crew).size) || !driverIds.length) {
        render();
        if (e.detail === 0) document.querySelector(`#planWeek .week-col[data-day="${day}"] button`)?.focus();
        return;
      }
      if (crew) crew.driverIds = driverIds;
      else state.driverGroups.push({ id: uid(), name: WEEKDAYS[day], driverIds });
      if (e.detail === 0) refocus = `#planWeek .week-col[data-day="${day}"] [data-act="apply-group"]`;
      break;
    }
    // A driver's usual day: in or out of that weekday's group (the first one
    // named for it, as the week reads it), making the group when the day has
    // none. It writes only the groups, never the driver, never who is in, and
    // never deletes a group, even an emptied one.
    case 'crew-day': {
      const day = Number(b.dataset.day);
      if (!WORK_WEEK.includes(day)) return;          // a stale button: nothing changed, nothing saved
      const d = list[i];
      const crew = dayCrews().byDay.get(day);
      // Out removes every copy of the id; in adds it only once.
      if (crew && crew.driverIds.includes(d.id)) crew.driverIds = crew.driverIds.filter((x) => x !== d.id);
      else if (crew) crew.driverIds.push(d.id);
      else state.driverGroups.push({ id: uid(), name: WEEKDAYS[day], driverIds: [d.id] });
      if (e.detail === 0) refocus = `#tab-drivers [data-act="crew-day"][data-id="${CSS.escape(id)}"][data-day="${day}"]`;
      break;
    }
    case 'add-day-group': {
      const day = Number(b.dataset.day);
      if (!WEEKDAYS[day] || dayCrews().byDay.has(day)) break;
      state.driverGroups.push({ id: uid(), name: WEEKDAYS[day], driverIds: [] });
      break;
    }
    case 'apply-group': {
      const g = list[i];
      // A group with nobody on the roster in it changes nobody: sending
      // everyone away is never what "use this crew" meant. Nothing is saved.
      if (!crewIds(g).size) {
        if (!b.closest('#tab-plan')) note('info', `${g.name.trim() || 'That group'} has nobody in it yet. Tick names into it first; nobody was changed.`);
        render();
        return;
      }
      // A write across the whole roster, not an addition: picking Monday has
      // to take yesterday's leftovers out, or "who is in today" is a lie by
      // the end of the week.
      state.drivers.forEach((d) => { d.available = g.driverIds.includes(d.id); });
      // The rail's question stays up: at stacked widths the rail sits above
      // the week, and closing it moved the columns under the pointer.
      // The crew just brought in sorts to the top of the list: show it there,
      // rather than keep the list scrolled down among the ones now away.
      delete planScroll.drivers;
      if (b.closest('#tab-plan')) {
        // From the keyboard, back to the button pressed: the week's Load or the
        // chip.
        const where = b.closest('#planWeek') ? '#planWeek' : '#tab-plan .rail-groups';
        if (e.detail === 0) refocus = `${where} [data-act="apply-group"][data-id="${CSS.escape(id)}"]`;
        break;
      }
      const inToday = state.drivers.filter((d) => d.available).length;
      note('info', `${g.name.trim() || 'That group'}: ${inToday} driver${inToday === 1 ? '' : 's'} in, ${state.drivers.length - inToday} away.`);
      break;
    }
    // The offer's button, and the only way in. The snapshot is what makes it
    // safe to agree to: Backups can put every old name back in one click.
    case 'split-rounds': {
      const plan = spotRoundPlan(state);
      // Nothing left to split: the button was pressed twice, or another tab
      // on the same browser got there first.
      if (!plan.spots.length) { dropOffers(); break; }
      if (!Store.snapshot(state, 'Splitting the round out of the spot names')) break;
      applySpotRoundSplit(plan);
      const { filled, kept } = plan.routes;
      const merged = plan.spots.reduce((n, s) => n + s.absorbed.length, 0);
      const renamed = plan.spots.reduce((n, s) => n + (s.round === null ? 0 : 1) + s.absorbed.length, 0);
      dropOffers();
      note('info', `Done. ${renamed} spot name${renamed === 1 ? '' : 's'} had the round taken out${merged ? `, and ${merged} of them turned out to be the same spot as another and ${merged === 1 ? 'was' : 'were'} merged into it` : ''}. ${filled} route${filled === 1 ? '' : 's'} had the round filled in${kept ? `, and ${kept} kept the round already typed in` : ''}. The names as they were are in Backups, under "Splitting the round out of the spot names".`,
        null, spotNameLines(plan));
      break;
    }
    case 'add-position':
      if (!addFromInput('#newPos', (name) => state.positions.push({ id: uid(), name, multi: false, labelId: '', note: '' }))) return;
      break;
    case 'add-label':
      if (!addFromInput('#newLabel', (name) => state.labels.push({ id: uid(), name, color: $('#newLabelColor').value, onSheet: false }))) return;
      break;
    case 'add-driver-tag':
      if (!addFromInput('#newDriverTag', (name) => state.driverTags.push({ id: uid(), name, color: $('#newDriverTagColor').value }))) return;
      break;
    default: return;
  }
  if (JSON.stringify(state) !== before) save();
  render();
  if (refocus) document.querySelector(refocus)?.focus();
});

/* ---------- dragging a name onto a route ----------
   The roster and the fleet are lists of things that end up in the table, so
   the shortest way to put one there is to carry it across. Everything here is
   also doable by typing or picking, and a drop only ever sets the same field
   the select and the text box set — a clash still warns rather than refusing,
   because a leader sometimes means it.

   Kept off `state`: what is being dragged is a gesture, and a gesture must
   never reach a save or a share code. */

const dragKindFits = (over) =>
  dragging && (dragging.kind === 'driver' || dragging.kind === 'car') && over;

function clearDropMarks() {
  document.querySelectorAll('.drop-into, .drop-before, .drop-after')
    .forEach((n) => n.classList.remove('drop-into', 'drop-before', 'drop-after'));
}

document.addEventListener('dragstart', (e) => {
  const row = e.target.closest('[data-drag]');
  if (!row) return;
  dragging = { kind: row.dataset.drag, id: row.dataset.id };
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Firefox refuses to start a drag without something on the transfer, and a
  // plain-text fallback is what a drop outside the app would paste.
  const item = byId(listFor(dragging.kind) || [], dragging.id);
  e.dataTransfer.setData('text/plain', item ? item.reg || item.name : '');
});

document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  clearDropMarks();
  dragging = null;
});

document.addEventListener('dragover', (e) => {
  if (!dragging) return;
  const route = e.target.closest('tr[data-route]');
  const sibling = e.target.closest(`[data-drag="${dragging.kind}"]`);
  if (!route && !sibling) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDropMarks();
  if (route) { route.classList.add('drop-into'); return; }
  // Above or below, by which half of the row the pointer is in.
  const box = sibling.getBoundingClientRect();
  sibling.classList.add(e.clientY < box.top + box.height / 2 ? 'drop-before' : 'drop-after');
});

document.addEventListener('dragleave', (e) => {
  if (e.target.closest && e.target.closest('.drop-into, .drop-before, .drop-after') === e.target) {
    e.target.classList.remove('drop-into', 'drop-before', 'drop-after');
  }
});

document.addEventListener('drop', (e) => {
  if (!dragging) return;
  const route = e.target.closest('tr[data-route]');
  const sibling = e.target.closest(`[data-drag="${dragging.kind}"]`);
  if (!route && !sibling) return;
  e.preventDefault();

  const list = listFor(dragging.kind) || [];
  const item = byId(list, dragging.id);
  const carried = dragging;
  clearDropMarks();
  dragging = null;
  if (!item) { render(); return; }

  const was = JSON.stringify(state);
  if (route) {
    const r = byId(state.routes, route.dataset.route);
    if (!r) { render(); return; }
    // A driver is free text on the route and always has been — the drop
    // writes the name, exactly as typing it would. A car is a reference.
    if (carried.kind === 'driver') r.driver = item.name;
    else r.carId = item.id;
  } else if (sibling.dataset.id !== carried.id) {
    const from = list.findIndex((x) => x.id === carried.id);
    const onto = list.findIndex((x) => x.id === sibling.dataset.id);
    if (from < 0 || onto < 0) { render(); return; }
    const after = sibling.classList.contains('drop-after')
      || e.clientY >= sibling.getBoundingClientRect().top + sibling.getBoundingClientRect().height / 2;
    const [moved] = list.splice(from, 1);
    const at = list.findIndex((x) => x.id === sibling.dataset.id);
    list.splice(after ? at + 1 : at, 0, moved);
  }
  if (JSON.stringify(state) !== was) save();
  render();
});

/* ---------- the grid a route's driver and car are picked from ----------
   The browser's own lists are one long column, in the order the roster was
   typed in, showing a handful of names at a time. Picking who drives route 7
   is scanning for a name, so the choices open as a grid instead: alphabetical,
   four across, a dozen and more in view at once, each saying whether it is
   already out, away or marked.

   The text box and the select underneath stay the real controls. The grid
   writes the same field they do, so the keyboard, the warnings and the tests
   all work as they did, a driver is still free text — typing narrows the grid
   rather than being refused by it — and a clash still only warns.

   Kept off `state`, like a drag: which picker is open is a gesture. */
let picking = null;   // { field: 'driver' | 'carId', routeId, filter }

const pickingFor = (el) => picking && picking.field === el.dataset.field && picking.routeId === el.dataset.id;
// Found again on every use: render() replaces the whole table, so the box that
// opened the grid a moment ago may be a different element now.
const pickAnchor = () => picking
  && document.querySelector(`#tab-plan [data-kind="route"][data-id="${CSS.escape(picking.routeId)}"][data-field="${picking.field}"]`);

function openPicker(el) {
  picking = { field: el.dataset.field, routeId: el.dataset.id, filter: '' };
  renderPicker();
}

function closePicker(refocus = false) {
  if (!picking) return;
  const anchor = pickAnchor();
  picking = null;
  renderPicker();
  if (refocus && anchor) anchor.focus();
}

// The one that is on, or the first: where the keyboard lands on opening.
function focusPick() {
  const box = $('#picker');
  (box.querySelector('.pick.on') || box.querySelector('.pick'))?.focus();
}

/* Every choice, alphabetical, with what a leader would want to know before
   picking it. Notes are built as markup: routeNames() already escapes. */
function pickChoices(r, at) {
  if (picking.field === 'carId') {
    const { cars } = usage();
    return [...state.cars].sort((a, b) => collate(a.reg, b.reg)).map((c) => {
      const lab = byId(state.labels, c.labelId);
      const others = elsewhere(cars[c.id], at);
      const on = c.id === r.carId;
      const notes = [lab && esc(labelName(lab)), others.length && `Route ${routeNames(others)}`].filter(Boolean);
      return { value: c.id, text: c.reg, on, flag: notes.length > 0, dot: lab && colour(lab.color),
        note: notes.join(' · ') || (on ? 'This route' : 'Free') };
    });
  }
  const by = driverUsage();
  const want = fold(picking.filter);
  return state.drivers
    .filter((d) => !want || fold(d.name).includes(want))
    .sort((a, b) => collate(a.name, b.name))
    .map((d) => {
      const lab = tagOf('driver', d);
      const others = elsewhere(by[fold(d.name)], at);
      const on = !!fold(r.driver) && fold(d.name) === fold(r.driver);
      const notes = [!d.available && 'Away', lab && esc(labelName(lab)), others.length && `Route ${routeNames(others)}`].filter(Boolean);
      return { value: d.name, text: d.name, on, away: !d.available, flag: !d.available || others.length > 0,
        dot: lab && colour(lab.color), note: notes.join(' · ') || (on ? 'This route' : 'Free') };
    });
}

function renderPicker() {
  const box = $('#picker');
  const anchor = pickAnchor();
  const at = picking ? state.routes.findIndex((r) => r.id === picking.routeId) : -1;
  if (!picking || !anchor || at < 0 || tab !== 'plan') {
    picking = null;
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const r = state.routes[at];
  const car = picking.field === 'carId';
  const choices = pickChoices(r, at);
  // A driver's box is free text, so the grid only earns its space while it
  // has something to suggest: not for an empty roster, not for a name that
  // matches nobody, and not once what is typed is the one name it matches.
  const settled = choices.length === 1 && fold(choices[0].value) === fold(picking.filter);
  if (!car && (!choices.length || settled)) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const kept = box.contains(document.activeElement) ? document.activeElement.dataset.pick : undefined;
  const cells = choices.map((c) => `<button type="button" class="pick${c.on ? ' on' : ''}${c.flag ? ' flag' : ''}${c.away ? ' away' : ''}"
      data-pick="${esc(c.value)}" aria-pressed="${c.on}" title="${esc(c.text)}">
      <span class="pick-name">${esc(c.text)}</span>
      <span class="pick-note">${c.dot ? `<span class="dot" style="--c:${esc(c.dot)}"></span>` : ''}${c.note}</span>
    </button>`).join('');
  const set = car ? r.carId : r.driver;
  box.innerHTML = `<div class="picker-head">
      <span>${car ? 'Car' : 'Driver'} for route ${dash(r.name)}</span>
      ${set ? `<button type="button" class="btn" data-pick="">${car ? 'No car' : 'Clear'}</button>` : ''}
    </div>
    ${cells
      ? `<div class="picker-grid" role="group" aria-label="${car ? 'Cars' : 'Drivers'}, A to Z">${cells}</div>`
      : '<p class="picker-empty">No cars yet. Add registrations in the panel on the right, or on the Cars tab.</p>'}`;
  box.hidden = false;
  placePicker();
  if (kept !== undefined) box.querySelector(`[data-pick="${CSS.escape(kept)}"]`)?.focus();
}

/* Where a floating box goes, in screen coordinates: under the thing that
   opened it, or over it when the screen has more room above — the last rows
   would otherwise open off the bottom — and never past any edge. `tall` is
   the height it gets: its own, or less when even the roomier side is short,
   and then it scrolls inside itself rather than being cut off. Lined up with
   the opener's left edge, or its right for a menu opened from a row's end. */
function besideAnchor(a, w, h, alignRight = false, keep = null) {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  // The top bar sticks to the top of the screen, so the room above ends there.
  const ceiling = Math.max(0, $('.topbar').getBoundingClientRect().bottom);
  const below = vh - a.bottom - 10, above = a.top - ceiling - 10;
  let up = h > below && above > below;
  // Once open on one side it stays there while it still fits, rather than
  // jumping across the box every time typing shortens the list.
  if (keep === 'up' && h <= above) up = true;
  if (keep === 'down' && h <= below) up = false;
  const tall = Math.max(0, Math.min(h, up ? above : below));
  const left = Math.max(8, Math.min(alignRight ? a.right - w : a.left, vw - w - 8));
  const top = up ? a.top - 2 - tall : a.bottom + 2;
  return { left, top, tall, up };
}

function placePicker() {
  const box = $('#picker');
  const anchor = pickAnchor();
  if (!anchor || box.hidden) return;
  box.style.maxHeight = '';
  const { left, top, tall, up } = besideAnchor(anchor.getBoundingClientRect(), box.offsetWidth, box.offsetHeight, false, picking.side);
  picking.side = up ? 'up' : 'down';
  box.style.maxHeight = `${tall}px`;
  box.style.left = `${left + window.scrollX}px`;
  box.style.top = `${top + window.scrollY}px`;
}

/* A finger on a phone gets the phone's own list for a car — full screen, and
   alphabetical now like the grid. What the grid is for is a desk and a mouse. */
let lastPointer = 'mouse';
document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  // Inside the grid, keep the focus where it is — in the driver box, being
  // typed into — or the click that picks would first close what it picks from.
  if (e.target.closest('#picker')) { e.preventDefault(); return; }
  const sel = e.target.closest('#tab-plan select[data-kind="route"][data-field="carId"]');
  if (sel && lastPointer === 'mouse') {
    // The native list would open on this very press; the grid opens instead.
    // The select still takes the focus, so it is plain which box is being
    // filled, and ArrowDown steps from it into the grid as from a driver box.
    e.preventDefault();
    if (pickingFor(sel)) closePicker(); else { openPicker(sel); sel.focus({ preventScroll: true }); }
    return;
  }
  const box = e.target.closest('#tab-plan input[data-kind="route"][data-field="driver"]');
  if (box) { if (!pickingFor(box)) openPicker(box); return; }
  closePicker();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('#picker [data-pick]');
  const r = b && picking && byId(state.routes, picking.routeId);
  if (!r) return;
  const { field, routeId } = picking;
  const was = field === 'carId' ? r.carId : r.driver;
  if (field === 'carId') r.carId = b.dataset.pick; else r.driver = b.dataset.pick;
  picking = null;
  if ((field === 'carId' ? r.carId : r.driver) !== was) save();
  render();
  // Chosen from the keyboard (a click with no pointer behind it): hand the
  // focus back to the box, so Tab carries on along the row.
  if (e.detail === 0) {
    document.querySelector(`#tab-plan [data-kind="route"][data-id="${CSS.escape(routeId)}"][data-field="${field}"]`)?.focus();
  }
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const grid = $('#picker');
  // Into the grid from the box: the keys that would open a select's native
  // list open the grid instead, and ArrowDown steps down into it — from a car
  // whose grid is open, or from a driver's box, where a grid that had hidden
  // itself behind a finished name comes back whole. The arrows alone still
  // step through a closed select the way they always did.
  const sel = t.closest?.('#tab-plan select[data-kind="route"][data-field="carId"]');
  const box = t.closest?.('#tab-plan input[data-kind="route"][data-field="driver"]');
  const opens = e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'));
  const into = sel ? opens || (pickingFor(sel) && e.key === 'ArrowDown') : box && e.key === 'ArrowDown';
  if (into) {
    e.preventDefault();
    const el = sel || box;
    if (!pickingFor(el) || grid.hidden) openPicker(el);
    focusPick();
    return;
  }
  if (!picking) return;
  const anchor = pickAnchor();
  if (e.key === 'Escape') { e.preventDefault(); closePicker(true); return; }
  if (t === anchor) { if (e.key === 'Tab') closePicker(); return; }
  if (!grid.contains(t)) return;
  if (e.key === 'Tab') { e.preventDefault(); closePicker(true); return; }
  const items = [...grid.querySelectorAll('.pick')];
  const i = items.indexOf(t);
  if (i < 0) return;
  const cols = getComputedStyle(grid.querySelector('.picker-grid')).gridTemplateColumns.split(' ').length;
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  // Up off the top row goes back to the box, which for a driver is where the
  // typing was.
  if (to < 0 && e.key === 'ArrowUp') { anchor?.focus(); return; }
  items[Math.max(0, Math.min(items.length - 1, to))].focus();
});

// The page scrolling carries the grid with it; a table scrolling sideways in
// its own box (a phone) or the window changing size does not, so follow those.
// A held Enter repeats, and on an armed button the repeat was taken as the
// second press: holding Enter on Clear cleared the day. Only a fresh press
// confirms.
document.addEventListener('keydown', (e) => {
  if (e.repeat && (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.armed')) e.preventDefault();
}, true);

// In the tag menu: up and down through the choices, Escape to leave, and Tab
// off either end hands the focus back to the button it came from rather than
// dropping it at the bottom of the page.
document.addEventListener('keydown', (e) => {
  const menu = $('#tagMenu');
  if (!tagFor || menu.hidden) return;
  if (e.key === 'Escape' && e.target === document.body) { e.preventDefault(); closeTagMenu(); return; }
  if (!menu.contains(e.target)) return;
  const back = () => {
    const { kind, id } = tagFor;
    tagFor = null;
    render();
    document.querySelector(`#tab-plan [data-act="tag"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`)?.focus();
  };
  const stops = [...menu.querySelectorAll('button, input')];
  if (e.key === 'Escape') { e.preventDefault(); back(); return; }
  if (e.key === 'Tab' && (e.shiftKey ? e.target === stops[0] : e.target === stops[stops.length - 1])) { e.preventDefault(); back(); return; }
  const choices = [...menu.querySelectorAll('.tag-choice')];
  const i = choices.indexOf(e.target);
  if (i < 0 || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  e.preventDefault();
  (e.key === 'ArrowDown' ? choices[i + 1] || $('#newTagName') : choices[i - 1])?.focus();
});

// The tag menu's button is in a rail that sticks while the page scrolls under
// it, so the menu follows every scroll, the page's own included. (Absolute,
// not fixed, like the picker: the app itself never uses position: fixed, and
// a test relies on that to catch CSS smuggled in through a share code.)
document.addEventListener('scroll', (e) => {
  if (picking && e.target !== document && !$('#picker').contains(e.target)) placePicker();
  if (tagFor && !$('#tagMenu').contains(e.target)) placeTagMenu(!tagSettling);
}, true);
window.addEventListener('resize', () => {
  if (picking) placePicker();
  if (tagFor && tagAnchor()) {
    // Shortened under it (a phone's keyboard coming up for the new-tag box):
    // bring its row back into its list, which shrank with the window, and its
    // button back onto the screen, so the menu and the box being typed in are
    // placed where they can be seen. The scrolling this does is ours, and must
    // not be taken for the user scrolling the row away.
    const anchor = tagAnchor();
    const list = anchor.closest('.rail-list');
    tagSettling = true;
    if (list) {
      const a = anchor.getBoundingClientRect(), l = list.getBoundingClientRect();
      if (a.top < l.top) list.scrollTop -= l.top - a.top;
      else if (a.bottom > l.bottom) list.scrollTop += a.bottom - l.bottom;
    }
    clearOfBar(anchor);
    placeTagMenu();
    requestAnimationFrame(() => requestAnimationFrame(() => { tagSettling = false; placeTagMenu(); }));
  }
});

/* The ⓘ's bubble: a layer made on first use, out of the page's sections, so
   a redraw never replaces it. Its words are drawn when it opens; a redraw
   only moves it beside its ⓘ (which the redraw has replaced), or shuts it
   when its ⓘ is gone or hidden, on another tab. */
const infoAnchor = () => infoOpen && document.querySelector(`.info-btn[data-info="${CSS.escape(infoOpen.key)}"]`);
const inInfo = (t) => !!t && !!t.closest && (!!t.closest('#infoBubble') || !!t.closest('.info-btn'));
function infoLayer() {
  let layer = document.getElementById('infoBubble');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'infoBubble';
    layer.className = 'info-bubble';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-labelledby', 'infoTitle');
    layer.tabIndex = -1;
    layer.hidden = true;
    document.body.appendChild(layer);
  }
  return layer;
}
function placeInfoBubble() {
  const layer = document.getElementById('infoBubble');
  if (!layer) return;
  const a = infoAnchor();
  const box = a && a.getBoundingClientRect();
  if (!box || !box.width) {
    infoOpen = null;
    layer.hidden = true;
    return;
  }
  layer.hidden = false;
  layer.style.maxHeight = '';
  const vw = document.documentElement.clientWidth;
  const { left, top, tall } = besideAnchor(box, layer.offsetWidth, layer.offsetHeight, box.left + box.width / 2 > vw / 2);
  layer.style.maxHeight = `${tall}px`;
  layer.style.left = `${left + window.scrollX}px`;
  layer.style.top = `${top + window.scrollY}px`;
}
function markInfoButtons() {
  document.querySelectorAll('.info-btn').forEach((b) => b.setAttribute('aria-expanded', String(!!infoOpen && infoOpen.key === b.dataset.info)));
}
// From the keyboard the focus goes into the bubble; from the mouse it stays.
function openInfo(key, keyboard) {
  if (typeof HELP === 'undefined' || !HELP[key]) return;
  closePicker();
  closeTagMenu();
  closeCtxMenu();
  infoOpen = { key };
  const layer = infoLayer();
  layer.innerHTML = `<div class="info-head"><h3 id="infoTitle">${esc(HELP[key].title)}</h3>
    <button type="button" class="info-close" data-info-close aria-label="Close">\u2715</button></div>
    <p>${esc(HELP[key].text)}</p>`;
  markInfoButtons();
  placeInfoBubble();
  if (keyboard) layer.focus({ preventScroll: true });
}
// `back`: hand the focus to the ⓘ, looked up again, since a redraw may have
// replaced the one that opened it.
function closeInfo(back = false) {
  if (!infoOpen) return;
  const a = back ? infoAnchor() : null;
  infoOpen = null;
  const layer = document.getElementById('infoBubble');
  if (layer) layer.hidden = true;
  markInfoButtons();
  if (a) a.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.closest) return;
  const i = t.closest('.info-btn');
  if (i) {
    e.preventDefault();
    if (infoOpen && infoOpen.key === i.dataset.info) closeInfo(e.detail === 0);
    else openInfo(i.dataset.info, e.detail === 0);
    return;
  }
  if (t.closest('[data-info-close]')) closeInfo(true);
});
document.addEventListener('pointerdown', (e) => { if (infoOpen && !inInfo(e.target)) closeInfo(); }, true);
// The focus going anywhere else shuts it too: a menu opened from the keyboard,
// the route picker opened by typing, a Tab away.
document.addEventListener('focusin', (e) => { if (infoOpen && !inInfo(e.target)) closeInfo(); });
document.addEventListener('keydown', (e) => {
  if (!infoOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeInfo(inInfo(document.activeElement)); return; }
  // Tab from inside the bubble goes on from its ⓘ, not from the end of the page.
  if (e.key === 'Tab' && document.getElementById('infoBubble')?.contains(e.target)) closeInfo(true);
});
// Any scroll can move the ⓘ: the page's, or a table scrolling sideways inside
// it, which never reaches the window. So the bubble follows them all, its own
// scrolling excepted.
document.addEventListener('scroll', (e) => {
  if (infoOpen && !document.getElementById('infoBubble')?.contains(e.target)) placeInfoBubble();
}, { capture: true, passive: true });
window.addEventListener('resize', placeInfoBubble);

// A click on the Date box opens the calendar (owner, 2026-10-01): a click on a
// date means picking one. Typing still works: from the keyboard, which never
// opens it, or after Esc shuts it.
document.addEventListener('click', (e) => {
  if (e.target.id === 'date' && e.detail > 0) openDatePicker();
});

// A template's contents on hover: a moment's rest on a card before the first
// shows, at once from one card to the next, and a moment's grace to cross
// from the card to the layer before they go. The mouse only; a finger or the
// keyboard uses the route count, which pins them.
document.addEventListener('pointerover', (e) => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const t = e.target;
  if (!t || !t.closest) return;
  clearTimeout(tplHoverTimer);
  if (t.closest('#tplPeek')) return;
  const id = t.closest('#planTemplates .tpl-head[data-filled]')?.dataset.tpl || null;
  if (id === tplHover) return;
  tplHoverTimer = setTimeout(() => { tplHover = id; drawTplPeek(); }, id ? (tplHover ? 60 : 350) : 250);
});
// A right-click on a card is for its menu: the contents on hover make way.
document.addEventListener('contextmenu', () => { clearTimeout(tplHoverTimer); if (tplHover) { tplHover = null; drawTplPeek(); } }, true);
// Pinned, they go with a press anywhere but the layer or a route count (which
// pins another, or unpins this one), and with Esc, handing the focus back.
document.addEventListener('pointerdown', (e) => {
  if (!tplOpen || e.button !== 0 || !e.target.closest) return;
  if (e.target.closest('#tplPeek') || e.target.closest('[data-act="peek-template"]')) return;
  tplOpen = null;
  drawTplPeek();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !tplOpen || ctx || infoOpen) return;
  const id = tplOpen;
  tplOpen = null;
  drawTplPeek();
  document.querySelector(`#planTemplates .tpl-head[data-tpl="${CSS.escape(id)}"] [data-act="peek-template"]`)?.focus();
});
document.addEventListener('scroll', (e) => {
  if (tplShown() && !document.getElementById('tplPeek')?.contains(e.target)) placeTplPeek();
}, { capture: true, passive: true });
window.addEventListener('resize', placeTplPeek);

/* A right-click on a row opens its menu, and so do Shift+F10 and the Menu
   key on a control in one. Everywhere else, in any box that is typed in, with
   Shift held, over selected text or while the share dialog is open, the
   browser's own menu stays. */
document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  const layer = $('#ctxMenu');
  if (!layer) return;
  if (inCtx(t)) { e.preventDefault(); return; }
  if (e.shiftKey || $('#shareDlg').open || document.getElementById('roomDlg')?.open || !t.closest) return;
  if (t.closest('textarea, a')) return;
  if (t.tagName === 'INPUT') {
    if (CTX_TEXT.has(t.type) ? t.selectionStart !== t.selectionEnd : !CTX_INPUTS.has(t.type)) return;
  }
  const hit = ctxHit(t);
  if (!hit) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.containsNode(hit.row, true)) return;
  e.preventDefault();
  // A right-click is neither a click nor a left press, so neither of these
  // shuts itself.
  closePicker();
  closeTagMenu();
  // Only a mouse's right button opens at the pointer; the keyboard's menu
  // keys open against the control that has the focus, brought out from
  // under the top bar first.
  const keyboard = e.button !== 2;
  if (keyboard) clearOfBar(t);
  const section = t.closest('section.tab');
  ctxReturn = !keyboard ? null
    : t.id ? `#${CSS.escape(t.id)}`
      : section && Object.keys(t.dataset).length ? `#${section.id} ${dataSelector(t)}` : null;
  // Only the layer is drawn: a full render would take the caret out of a
  // box being typed in elsewhere on the page.
  ctx = { surface: hit.surface, kind: hit.kind, id: hit.id, part: hit.part, tab, keyboard, at: null };
  renderCtxMenu();
  placeCtxMenu(keyboard ? t.getBoundingClientRect() : { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
  // No key pressed after opening can arm or confirm anything: the keyboard
  // starts on the first entry that is not destructive, the mouse on the menu.
  const first = keyboard && layer.querySelector('[role="menuitem"]:not([aria-disabled]):not([data-arm])');
  (first || layer).focus({ preventScroll: true });
});

// Back to the control a keyboard open came from.
function ctxFocusBack(sel) {
  const el = sel && document.querySelector(sel);
  if (!el) return;
  el.focus({ preventScroll: true });
  clearOfBar(el);
}

/* A choice in the menu shuts it, before the dispatcher runs the act, except
   the first click on a destructive entry, which arms it and leaves the menu
   open on "Sure?". The redraw the act makes then hides the layer. */
let ctxClosed = null;   // { keyboard, back }, for the listener after the dispatcher
function ctxChoose(e) {
  ctxClosed = null;
  const b = e.target.closest('[data-act]');
  if (!b || !ctx) return;
  if (b.dataset.act === 'ctx-view') {
    // ‹ Back, in the in-place view; any other opens its submenu.
    if (!b.dataset.view) {
      ctx.view = null;
      renderCtxMenu();
      $('#ctxMenu [role="menuitem"]:not([aria-disabled])')?.focus({ preventScroll: true });
    } else if (ctx.sub === b.dataset.view) {
      // Open already: the keyboard shuts it again; a click keeps it, since
      // resting on the entry opened it a moment before the click landed
      // (review, 2026-10-01).
      if (e.detail === 0) ctxCloseSub(false);
    } else ctxOpenSub(b.dataset.view, e.detail === 0);
    return;
  }
  if (b.dataset.arm && b.dataset.arm !== armed) return;
  ctxClosed = { keyboard: e.detail === 0, back: ctx.keyboard ? ctxReturn : null };
  ctx = null;
}
$('#ctxMenu')?.addEventListener('click', ctxChoose);
// A menu taller than its room scrolls inside itself: the entry the arrows,
// Home or End move to is scrolled into view within it, never the page
// (review, 2026-10-01).
document.addEventListener('focusin', (e) => {
  const item = e.target.closest?.('#ctxMenu [role="menuitem"], #ctxSub [role="menuitem"]');
  const box = item && item.closest('#ctxMenu, #ctxSub');
  if (!box || box.scrollHeight <= box.clientHeight) return;
  const top = item.offsetTop, bottom = top + item.offsetHeight;
  if (top < box.scrollTop) box.scrollTop = top;
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
});
/* After the dispatcher: an act that drew nothing still hides the menu. And a
   choice made from the keyboard, in a menu the keyboard opened, hands the
   focus back to where it came from, unless the act put it somewhere itself
   or the entry was a confirming one. */
document.addEventListener('click', (e) => {
  const was = ctxClosed;
  ctxClosed = null;
  if (!was) return;
  if (!ctx && $('#ctxMenu')?.hidden === false) renderCtxMenu();
  if (!was.keyboard || !was.back || e.target.classList?.contains('armed')) return;
  const f = document.activeElement;
  if (f && f !== document.body && f.isConnected) return;
  ctxFocusBack(was.back);
});

// Hovering an entry focuses it, as a keyboard user's arrows would, but never a
// destructive one: a key pressed next must not be able to arm it. Only a
// pointer that moved: the browser also reports one when a menu is drawn under
// a pointer resting where it was, and that took a keyboard user's place.
function ctxHoverFocus(e) {
  if (!e.movementX && !e.movementY) return;
  const entry = e.target.closest('[role="menuitem"]');
  if (!entry || entry.dataset.arm || entry.hasAttribute('aria-disabled') || entry === document.activeElement) return;
  entry.focus({ preventScroll: true });
}
$('#ctxMenu')?.addEventListener('mousemove', (e) => {
  ctxHoverFocus(e);
  if (!e.movementX && !e.movementY) return;
  // Resting on an entry with a submenu opens it; moving to another entry
  // shuts it, after a moment, so a pointer crossing towards it gets there.
  const entry = e.target.closest('[role="menuitem"]');
  if (!ctx || !entry) return;
  const view = entry.dataset.act === 'ctx-view' ? entry.dataset.view : '';
  if (view) {
    clearTimeout(ctxHoverTimer);
    // Only where it fits beside the menu: a hover never swaps the menu for
    // the in-place list; a click or a key does.
    if (ctx.sub !== view && ctxSubFits()) ctxHoverTimer = setTimeout(() => ctxOpenSub(view, false), 60);
  } else if (ctx.sub) {
    clearTimeout(ctxHoverTimer);
    ctxHoverTimer = setTimeout(() => ctxCloseSub(false), 300);
  }
});

/* The menu's keys, in it or on the page itself: a mouse arming lets go of the
   focus, so it can be on the page. Up and down wrap, Home and End go to the
   ends; Enter and Space press an entry as they press any button. Escape and
   Tab disarm an entry armed here, shut the menu, and hand a keyboard open's
   focus back. While it is open, the page does not scroll under it. */
document.addEventListener('keydown', (e) => {
  const layer = $('#ctxMenu');
  if (!ctx || layer.hidden) return;
  const t = e.target;
  if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); return; }
  const sub = document.getElementById('ctxSub');
  const inSub = !!sub && !sub.hidden && sub.contains(t);
  if (t !== document.body && !layer.contains(t) && !inSub) return;
  if (inSub && (e.key === 'Escape' || e.key === 'ArrowLeft')) { e.preventDefault(); ctxCloseSub(true); return; }
  if (!inSub && e.key === 'Escape' && ctx.sub) { e.preventDefault(); ctxCloseSub(true); return; }
  if (!inSub && e.key === 'ArrowRight' && t.dataset?.act === 'ctx-view' && t.dataset.view) { e.preventDefault(); ctxOpenSub(t.dataset.view, true); return; }
  if ((e.key === 'Escape' || e.key === 'ArrowLeft') && ctx.view) {
    e.preventDefault();
    ctx.view = null;
    renderCtxMenu();
    $('#ctxMenu [role="menuitem"]:not([aria-disabled])')?.focus({ preventScroll: true });
    return;
  }
  if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    const back = ctx.keyboard ? ctxReturn : null;
    if (armed && layer.querySelector(`[data-arm="${CSS.escape(armed)}"]`)) { armed = null; renderKeepingFocus(); }
    closeCtxMenu();
    ctxFocusBack(back);
    return;
  }
  const entries = [...(inSub ? sub : layer).querySelectorAll('[role="menuitem"]:not([aria-disabled])')];
  const i = entries.indexOf(t);
  const to = { ArrowDown: i + 1, ArrowUp: i < 0 ? -1 : i - 1, Home: 0, End: entries.length - 1 }[e.key];
  if (to !== undefined) {
    e.preventDefault();
    if (entries.length) entries[(to + entries.length) % entries.length].focus({ preventScroll: true });
    return;
  }
  if (e.key === ' ' && i < 0) e.preventDefault();
});

// Any press outside it, a wheel (unless it is scrolling the menu itself), the
// window changing size or losing the focus, or a drag starting, shuts it. A
// scroll does not: every redraw puts the lists' scroll back, and that fires
// scroll events of its own.
document.addEventListener('pointerdown', (e) => { if (ctx && !inCtx(e.target)) closeCtxMenu(); }, true);
document.addEventListener('wheel', (e) => {
  const layer = $('#ctxMenu');
  if (!ctx || (layer.contains(e.target) && layer.scrollHeight > layer.clientHeight) || document.getElementById('ctxSub')?.contains(e.target)) return;
  closeCtxMenu();
}, { capture: true, passive: true });
window.addEventListener('resize', closeCtxMenu);
window.addEventListener('blur', closeCtxMenu);
document.addEventListener('dragstart', closeCtxMenu, true);

document.addEventListener('change', async (e) => {
  if (e.target.name === 'shareMode') { pending.mode = e.target.value; renderShareDialog(); return; }
  if (e.target.id === 'shareAdd') { pending.addMissing = e.target.checked; renderShareDialog(); return; }
  // Leaving the Date box tidies what was typed ("1.10.2026") into dd/mm/yyyy,
  // and a date left half typed goes back to the day the plan kept. The line
  // under it waits for a press under way to be released: leaving the box by
  // pressing Set to tomorrow changed the line's words between the press and
  // the release, the button moved along, and the click went nowhere.
  if (e.target.id === 'date') { e.target.value = dmyOf(state.date); if (pressing) lineAfterPress = true; else drawDateLine(); return; }
  // A day picked from the calendar goes in as if typed, so it takes exactly
  // the path a typed date does.
  if (e.target.id === 'datePick') {
    const box = $('#date');
    if (!box || !parseDay(e.target.value)) return;
    box.value = dmyOf(e.target.value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    // A crew loaded redraws the plan: the box to focus is the new one.
    $('#date')?.focus();
    return;
  }
  if (e.target.id !== 'importFile') return;
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  applyImport(await f.text(), f.name);
  render();
});

// Enter in an "add" box triggers its button.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const map = { newDriver: 'add-driver', newGroup: 'add-group', newTemplate: 'save-template', newCar: 'add-car', newPos: 'add-position', newLabel: 'add-label', newDriverTag: 'add-driver-tag', roomCode: 'room-create', roomVersionName: 'room-push' };
  // The rail's own boxes press their own buttons, not the tabs' — they add to
  // the same lists, but from a different box.
  const here = { railDriver: '[data-act="add-driver"][data-from]', railCar: '[data-act="add-car"][data-from]', newTagName: '[data-act="add-tag"]' }[e.target.id];
  // preventDefault first: pressing the button can move the focus (adding a
  // tag hands it back to the row's tag button), and the same Enter's keypress
  // would then press that one as well — reopening the menu just shut.
  if (here) { e.preventDefault(); document.querySelector(here)?.click(); return; }
  // The tab's own button: the rail has an add-driver and an add-car of its
  // own, earlier in the page, which read the rail's boxes — so Enter on the
  // Drivers or Cars tab pressed a hidden button and added nothing.
  const act = map[e.target.id];
  if (act) { e.preventDefault(); (e.target.closest('section.tab') || document).querySelector(`[data-act="${act}"]`)?.click(); }
});

const SHARE_ACTS = new Set(['share-make', 'share-link', 'share-read', 'share-apply', 'share-cancel']);
// The Shared plan card's, which talk to the relay and so are async.
const ROOM_ACTS = new Set(['room-create', 'room-copy', 'room-take', 'room-retake', 'room-putback', 'room-dismiss', 'room-notnow', 'room-push', 'room-look', 'room-look-close', 'room-restore', 'room-leave']);
// The acts that act on one item out of a list, and so need to find it first.
const ITEM_ACTS = new Set(['up', 'down', 'toggle', 'setLabel', 'del', 'ask-template', 'load-template', 'peek-template', 'group-member', 'apply-group', 'group-empty', 'tag', 'set-tag', 'add-tag', 'crew-day', 'insert-route', 'clear-route', 'take-off', 'put-on', 'move-pos', 'resave-template']);
const DATA_ACTS = new Set(['link-file', 'reconnect-file', 'file-keep-file', 'file-keep-screen', 'file-overwrite', 'unlink-file', 'open-file', 'export', 'import', 'restore', 'archive-restore', 'archive-download', 'dismiss']);

/* The top bar sticks, and anything the browser scrolls into view — a field
   reached with Tab, a question just asked — would otherwise land under it.
   Its height goes into --bar, which the page's content uses as a scroll
   margin. Not as scroll-padding on the page itself: that also moved the page
   for focus in the top bar, hundreds of pixels a Tab, and changed how a
   phone's page settles when its keyboard shortens the window. */
const clearTheBar = () => { document.documentElement.style.setProperty('--bar', `${$('.topbar').offsetHeight + 8}px`); };
window.addEventListener('resize', clearTheBar);

/* Focus moved by a key onto something the sticky top bar covers — Shift+Tab
   walking up into it, or Escape handing it back from the route picker to a
   box scrolled under the bar — is scrolled out from under the bar. The
   browser's own focus scrolling does not know the bar is there, and ignores
   scroll-margin. Only for focus a key press moved, while that press is being
   handled: a mouse press on a button half under the bar must not have the
   button moved out from under the pointer before the release, and the app's
   own refocus three seconds after a delete was armed must not pull the page
   back to a control the user has since scrolled away from. */
let keyed = false;
const byKey = () => { keyed = true; setTimeout(() => { keyed = false; }); };
document.addEventListener('keydown', byKey, true);
document.addEventListener('keyup', byKey, true);   // Space presses a button on its release
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!keyed || !el.closest || el.closest('.topbar') || !el.closest('main')) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== el) return;
    const top = $('.topbar').getBoundingClientRect().bottom + 8;
    const a = el.getBoundingClientRect();
    if (a.top < top) window.scrollBy(0, a.top - top);
  });
});

/* The same, for one element, by scrolling the page just as far as it takes:
   out from under the top bar, or up from below the bottom of the screen.
   By hand, because scrollIntoView ignores scroll-margin for an element inside
   a scrolling list such as the rail's, and leaves it under the bar. */
function clearOfBar(el) {
  const a = el.getBoundingClientRect();
  const top = $('.topbar').getBoundingClientRect().bottom + 8;
  if (a.top < top) window.scrollBy(0, a.top - top);
  else if (a.bottom > window.innerHeight - 8) window.scrollBy(0, a.bottom - window.innerHeight + 8);
}

/* The running version, quietly at the foot of every tab, with the way to
   What's new (owner, 2026-09-30). Drawn here rather than in index.html, so a
   cached older index.html still shows it; never printed. */
function drawFooter() {
  let f = document.getElementById('appFooter');
  if (!f) {
    f = document.createElement('footer');
    f.id = 'appFooter';
    f.className = 'app-footer';
    document.body.appendChild(f);
  }
  f.innerHTML = `Car Coordinator ${esc(APP_VERSION)} \u00b7 <button type="button" class="linkish" data-act="show-data">What's new</button>`;
}

async function start() {
  // An invite's secret leaves the address bar before anything else runs, so it
  // stays in no history, whatever happens below. Stripped even when sync.js is
  // missing (a cached older index.html), which cannot read it anyway.
  let invite = null;
  if (syncReady()) invite = Sync.readInvite(location.hash);
  else if (/^#join=/.test(location.hash || '')) history.replaceState(null, '', location.pathname + location.search);
  clearTheBar();
  drawFooter();
  // Read before Share.readHash() clears it: an open by share link keeps the
  // update note for the next ordinary open.
  const link = /^#d=/.test(location.hash || '');
  // A write to the save file redraws after it lands; keeping the focus where
  // it is, so typing (a date half typed, a name) goes on (review, 2026-10-01).
  state = await Store.init(defaults, () => renderKeepingFocus(), APP_VERSION);
  // The untouched copy, before anything below can change what is saved. In a
  // try of its own, and so is the note: whatever goes wrong in either, the
  // save-file check between them still runs, exactly as in 0.2.5.
  let copy = null;
  try { copy = archiveBeforeUpdate(); } catch (e) { console.warn('update archive skipped', e); }
  let recovered = false;
  // A browser with no data of its own but a linked file (new PC, cleared
  // profile, different Windows user) should come back to what is in the file.
  if (!Store.hasUsableLocalData()) {
    const fromFile = await Store.recoverFromFile(defaults);
    if (fromFile) { state = fromFile; recovered = true; note('info', `Loaded your data from ${Store.file.name}.`); }
  // Guarded: for a few minutes after a deploy a browser can pair this app.js
  // with a cached store.js from before, and a missing function here would
  // stop start() before it ever draws the saved plan.
  } else if (typeof Store.checkFileAtStart === 'function') await Store.checkFileAtStart(state, defaults);
  noteFileHold();
  notices = notices.concat(Store.takeNotices());
  Store.dailySnapshot(state);
  // Step 6: a passed date moves to the next working day, in memory. In a try
  // of its own: whatever goes wrong, the plan is drawn as it was saved.
  const savedDate = state.date;
  try { moveDateOnOpen(); } catch (e) { state.date = savedDate; dropKeep(); console.warn('date move skipped', e); }
  // An offer, never an application: it only ever adds a notice with a button
  // in it. (Templates no longer offer themselves on their day: owner,
  // 2026-10-01. A template's saved day stays in the plan, unused.)
  offerSpotRoundSplit();
  // What the Store said since the drain above (a start-of-day backup that
  // would not fit) goes up before the note, so the note stays last.
  drainStoreNotices();
  try { raiseUpdateNote({ link, recovered, copy }); } catch (e) { console.warn('update note skipped', e); }
  // After the note, which is what works out whether this is a first run.
  try { offerInfoHint(link); } catch (e) { console.warn('first-open hint skipped', e); }
  render();

  // The shared plan this browser has joined, if any. None: no connection, ever.
  if (syncReady()) { const secret = Store.pref('room'); if (SECRET_RE.test(String(secret || ''))) roomStart(secret); }
  // An invite opened: offer it. A mangled one was stripped all the same.
  if (invite) roomOfferStart(invite);

  const fromLink = Share.readHash();
  if (fromLink) {
    const { share, error } = await Share.decode(fromLink);
    if (error) { note('warn', error); render(); }
    else { tab = 'data'; render(); openShare(share); }
  }
}

start();
