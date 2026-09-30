'use strict';

/* The running version. The update note keys on it, and every local tag in
   index.html asks for ?v= of it, so a browser never pairs this file with one
   from another release. scripts/versions.mjs keeps it level with
   package.json, Cargo.toml and tauri.conf.json; declare it here only. */
const APP_VERSION = '0.12.0';

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

// The weekday of the plan's own date, 0 for Sunday, or -1 when it is not a day.
const planWeekday = () => parseDay(state.date)?.getDay() ?? -1;

/* Under the Date: what day the plan is for. Quiet when it is the next
   working day; otherwise a warning with Set to tomorrow, which never blocks
   anything. The cases are checked in this order, and the last one catches
   every other date, a weekend one included. */
function dateLine() {
  const now = today(), nwd = nextWorkingDay(), d = state.date;
  if (!parseDay(d)) return { off: true, text: `The date is not a real day. The next working day is ${dayLabel(nwd)}.` };
  if (d === nwd) return { off: false, text: `${dayLabel(d)}, the next working day.` };
  if (d === now) return { off: true, text: `This plan is dated today, ${dayLabel(d)}. The next working day is ${dayLabel(nwd)}.` };
  if (d < now) return { off: true, text: `${dayLabel(d)} has passed. The next working day is ${dayLabel(nwd)}.` };
  return { off: true, text: `${dayLabel(d)} is not the next working day, ${dayLabel(nwd)}.` };
}
const dateLineInner = ({ off, text }) => `<span>${esc(text)}</span>${off
  ? ` <button class="btn" data-act="set-tomorrow" title="Set the date to ${esc(dayLabel(nextWorkingDay()))}">Set to tomorrow</button>` : ''}`;
const dateLineHtml = () => { const l = dateLine(); return `<p id="dateLine" class="date-line${l.off ? ' off' : ''}">${dateLineInner(l)}</p>`; };
/* Only the line, never the Date box beside it: redrawing the box would take
   the focus out of it mid-typing. */
function drawDateLine() {
  const el = document.getElementById('dateLine');
  if (!el) return;
  const l = dateLine();
  el.className = `date-line${l.off ? ' off' : ''}`;
  el.innerHTML = dateLineInner(l);
}
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
    templates: [],
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
const save = () => {
  if (dateMove && state === dateMove.plan) dateMove.saved = true;
  Store.save(state);
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
// The entry that opens an item's status list, saying the status it has now.
const ctxStatusOpen = (item) => ({ act: 'ctx-view', data: { view: 'status' },
  text: `Status: ${item.labelId && byId(state.labels, item.labelId) ? labelName(byId(state.labels, item.labelId)) : 'OK'}` });
// OK and every label, the current one ticked: the chips' own setLabel.
const ctxStatusList = (kind, item) => [
  { act: 'setLabel', data: { kind, id: item.id, label: '' }, text: `${item.labelId ? '' : '\u2713 '}OK` },
  ...state.labels.map((l) => ({ act: 'setLabel', data: { kind, id: item.id, label: l.id }, text: `${item.labelId === l.id ? '\u2713 ' : ''}${labelName(l)}` })),
];
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
    own.push(ctxStatusOpen(pos));
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
  // Right-clicked on its car or its position: the way to that one first.
  const car = part === 'carId' && byId(state.cars, r.carId);
  if (part === 'positionId' && view === 'status' && byId(state.positions, r.positionId)) return ctxRoutePosition(r, view);
  const [posOwn, posMoves] = part === 'positionId' ? ctxRoutePosition(r) : [[], []];
  return [[
    car && ctxGo(`Go to ${car.reg} on the Cars tab`, 'cars', 'car', car.id, 'reg'),
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
function ctxDriver(d, surface) {
  const d0 = { kind: 'driver', id: d.id };
  const on = driverUsage()[fold(d.name)] || [];
  const groups = state.driverGroups.filter((g) => g.driverIds.includes(d.id)).length;
  const rail = surface === 'rail';
  const { byDay } = dayCrews();
  return [[
    { act: 'toggle', data: { ...d0, field: 'available' }, text: d.available ? 'Set away' : 'Bring back in' },
    // The tag menu opens at the rail row's tag button, so only there.
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
  const status = rail ? [ctxStatusOpen(c), { act: 'tag', data: c0, text: 'Tag\u2026' }] : [ctxStatusOpen(c)];
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
   button does: the question's own Load is the only thing that writes. */
function ctxTemplate(t) {
  const t0 = { kind: 'template', id: t.id };
  return [[
    { act: 'ask-template', data: t0, text: 'Load over the plan\u2026' },
    { act: 'peek-template', data: t0, text: tplOpen === t.id ? 'Hide contents' : 'Show contents' },
  ], [
    { act: 'resave-template', data: t0, arm: `resave:${t.id}`, text: 'Replace with the plan as it is now',
      cost: `Its ${plural(t.routes.length, 'route')} ${t.routes.length === 1 ? 'becomes' : 'become'} the plan's ${state.routes.length}` },
    { act: 'del', data: t0, arm: `del:${t.id}`, text: 'Delete template', cost: `${plural(t.routes.length, 'route')}. The plan is not touched.` },
  ]];
}

// Each surface's menu: the header's name, and the entries in groups that a
// separator divides.
const CTX_MENUS = {
  route: (r, c) => ({ name: routeTitle(r), groups: ctxRoute(r, c.part, c.view) }),
  rail: (x, c) => (c.kind === 'car'
    ? { name: x.reg.trim() || '-', groups: ctxCar(x, 'rail', c.view) }
    : { name: x.name.trim() || '-', groups: ctxDriver(x, 'rail') }),
  drivers: (d) => ({ name: d.name.trim() || '-', groups: ctxDriver(d, 'drivers') }),
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
    const part = surface === 'route' ? t.closest('select[data-field="carId"], select[data-field="positionId"]')?.dataset.field || '' : '';
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
    <h3>Cars <span class="rail-count">${out} out · ${free} free</span></h3>
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
    <h3>Drivers <span class="rail-count">${inToday.length} in${away ? ` \u00b7 ${away} away` : ''}</span></h3>
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

  // #planBar is the tour's step 5 (tour.js).
  $('#tab-plan').innerHTML = `
    ${noCars}
    ${found.length ? `<div class="problems">
      <b>${flagged.size} route${flagged.size > 1 ? 's' : ''} to look at</b> \u2014 nothing is blocked, check they are on purpose.
      <ul>${found.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="bar" id="planBar">
      <label for="date">Date</label>
      <input id="date" type="date" data-kind="meta" data-field="date" value="${esc(state.date)}">
      <button class="btn" data-act="add-route">+ Add route</button>
      <button class="btn ${armed === 'clear' ? 'armed' : ''}" data-act="clear-day">${armed === 'clear' ? 'Sure? Click again' : 'Clear drivers, cars, positions and rounds'}</button>
    </div>
    ${dateLineHtml()}
    <div class="plan">
      <div class="plan-main">
        <div class="plan-table" data-keep-scroll="table"><table class="grid">
          <thead><tr><th>Route</th><th>Driver</th><th>Car</th><th>Position</th><th>Round</th><th></th><th></th></tr></thead>
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

function renderTemplates() {
  const shelf = state.templates.map((t) => `<div class="tpl ${tplOpen === t.id ? 'open' : ''}">
      <div class="tpl-head">
      ${actBtn('ask-template', 'template', t.id, esc(t.name), 'primary-ish', 'title="Put this template back over the plan"')}
      ${actBtn('peek-template', 'template', t.id, `${t.routes.length} route${t.routes.length === 1 ? '' : 's'} ${tplOpen === t.id ? '\u25b4' : '\u25be'}`, 'tpl-peek', `title="${tplOpen === t.id ? 'Hide' : 'Show'} what is in this template"`)}
      <select data-kind="template" data-id="${esc(t.id)}" data-field="weekday" title="Offer this template when the plan is for that day">
        <option value="">Never offer it</option>
        ${WEEKDAYS.map((d, n) => `<option value="${n}" ${t.weekday === String(n) ? 'selected' : ''}>On ${d}s</option>`).join('')}
      </select>
      ${actBtn('del', 'template', t.id, armed === `del:${t.id}` ? 'Sure?' : '✕', armed === `del:${t.id}` ? 'armed' : '', 'title="Delete this template"')}
      </div>
      ${tplOpen === t.id ? templateContents(t) : ''}
    </div>`).join('');
  return `<section id="planTemplates" class="templates">
    <h3>Day templates</h3>
    <p class="hint">A saved copy of the routes as they stand — drivers, cars, positions, rounds and marks, but never the date. Save the way Monday usually runs once, and put it back next Monday.</p>
    <div class="bar">
      <input id="newTemplate" type="text" placeholder="Template name, e.g. Monday">
      <button class="btn" data-act="save-template">Save as template</button>
    </div>
    ${shelf ? `<div class="shelf">${shelf}</div>
      <p class="hint" style="margin:8px 0 0">A template can offer itself when the plan is for its day — "Never offer it" until you pick one, and even then it only asks.</p>` : '<p class="empty">No templates yet. Set the plan up the way it usually runs, then save it here.</p>'}
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
    <h3>The week</h3>
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
    <h3>Parking map</h3>
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
    Store.snapshot(state, `Replacing the ${kept.name} template`);
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
  // #addDriverBar is the tour's step 3 (tour.js).
  $('#tab-drivers').innerHTML = `
    <h2>Drivers</h2>
    <p class="hint">The people who might drive. The day plan's driver box still takes anything you type \u2014 this list only offers the names, and shows who is in. Tick a driver's usual days to put them in that day's group under Day groups.${ownDriverTags() ? ' The tags are the Driver tags on the Labels tab, apart from the car labels; for Special situation, put the details in the note.' : ''} A tag or a note never sets anyone Away.</p>
    <div class="bar" id="addDriverBar">
      <input id="newDriver" type="text" placeholder="Name(s), separated by commas">
      <button class="btn" data-act="add-driver">+ Add driver</button>
    </div>
    ${state.drivers.length
      ? `<table class="grid"><thead><tr><th>Name</th><th>Route</th><th>In or away</th><th>Usual days</th><th>Tag</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
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
  return `<h2 style="margin-top:22px">Day groups</h2>
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
  // #addCarBar is the tour's step 1 (tour.js).
  $('#tab-cars').innerHTML = `
    <h2>Cars</h2>
    <p class="hint">Click a label to mark a car. Marked cars still appear in the day plan, but picking one shows a warning. A parked car is listed on the printout when its label has Show on printout ticked, on the Labels tab.</p>
    <p class="counts"><span class="assign yes">${onRoute} on a route</span><span class="assign none">${free} free</span><span class="assign down">${down} parked and marked</span></p>
    <div class="bar" id="addCarBar">
      <input id="newCar" type="text" placeholder="Registration(s), e.g. SD12345 SE67890">
      <button class="btn" data-act="add-car">+ Add car</button>
    </div>
    ${state.cars.length
      ? `<table class="grid"><thead><tr><th>Reg.</th><th>Assigned to</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
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
    <h2>Positions</h2>
    <p class="hint">Packing spots, garage, ports. "Many cars" lets several routes share it (like Garage) without a warning. The parking map on the Day plan finds Spot 1 to Spot 5 and the gate by name; a renamed spot moves to the list under it.</p>
    <div class="bar">
      <input id="newPos" type="text" placeholder="Name, e.g. Spot 6 or Port 3">
      <button class="btn" data-act="add-position">+ Add position</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Sharing</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
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
    <h2>Car and position labels</h2>
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
  return `<h2 style="margin-top:22px">Driver tags</h2>
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
  return `<p class="colours" role="group" aria-label="Colours">Colours: ${choice('follow', 'Follow the computer')}${choice('light', 'Light')}${choice('dark', 'Dark')}</p>
      <p class="hint">Light or Dark is kept in this browser only. The printed sheet looks the same whichever you pick.</p>
      ${themeKept ? '' : `<p class="status warn-status">This browser couldn't keep the choice, so it lasts only until this page is closed or reloaded.</p>`}`;
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
  if (!releases) return `<div class="card"><h3>What's new</h3>${running}</div>`;
  const full = releases.slice(0, 3).map((r) => `<div class="release">
      <h4>${esc(r.version)} \u00b7 ${esc(r.title)}</h4>
      <p>${esc(r.changed)}</p>
      <p><b>What it affects:</b> ${esc(r.affects)}</p>
      <p><b>Your data:</b> ${esc(r.data)}</p>
    </div>`).join('');
  const older = releases.slice(3).map((r) => `<p class="older">${esc(r.version)} \u00b7 ${esc(r.title)}. Your data: ${esc(r.data)}${r.must
    ? `<br>What it affects: ${esc(r.affects)}` : ''}</p>`).join('');
  return `<div class="card whatsnew"><h3>What's new</h3>${running}${full}${older}</div>`;
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
  if (typeof Store.archives !== 'function') return '<div class="card"><h3>Archives</h3><p class="empty">Reload the page to see Archives.</p></div>';
  const rows = Store.archives().map((a) => {
    const at = esc(when(a.t));
    const down = actBtn('archive-download', esc(a.kind), a.t, 'Download');
    if (a.kind === 'rescue') return `<div class="arch-row"><span class="what">Could not be read \u00b7 ${at}</span><span class="btns">${down}</span></div>`;
    const { state: s, error } = parseQuietly(a.text);
    const head = `Before ${esc(a.to)} (from ${esc(a.from)}) \u00b7 ${at}`;
    if (error || !s) return `<div class="arch-row"><span class="what">${head} \u00b7 Could not be read</span><span class="btns">${down}</span></div>`;
    const key = `archive:${a.t}`;
    return `<div class="arch-row"><span class="what">${head} \u00b7 ${esc(planSummary(s, true))}</span><span class="btns">${actBtn('archive-restore', 'update', a.t,
      armed === key ? 'Sure?' : 'Restore', armed === key ? 'armed' : '')}${down}</span></div>`;
  }).join('');
  return `<div class="card">
      <h3>Archives</h3>
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
  const rows = list.map((b, i) => {
    let contents = null;
    try { const s = JSON.parse(b.json); contents = `${s.routes.length} routes, ${s.cars.length} cars`; } catch { /* unreadable */ }
    return `<tr>
      <td>${esc(when(b.t))}</td>
      <td>${esc(b.label)}</td>
      <td>${contents === null ? 'Unreadable \u2014 only half of it was saved' : esc(contents)}</td>
      <td class="btns">${contents === null ? '' : actBtn('restore', 'backup', String(i), armed === `restore:${i}` ? 'Sure?' : 'Restore', armed === `restore:${i}` ? 'armed' : '')}</td>
    </tr>`;
  }).join('');

  // #fileCard and #backupsCard are the tour's steps 8 and 9 (tour.js).
  $('#tab-data').innerHTML = `
    <h2>Data</h2>
    <p class="hint">Everything you type stays on this PC. This page never sends it anywhere.</p>

    <div class="card" id="fileCard">
      <h3>Auto-save to a file</h3>
      ${fileStatus()}
    </div>

    <div class="card">
      <h3>This browser</h3>
      <p class="status ${p === 'granted' ? 'on' : 'off'}">${esc(persistText)}</p>
      <p class="hint">If this page ever won't start, <a href="recover.html">recover.html</a> downloads everything this browser holds.</p>
      ${coloursRow()}
    </div>

    <div class="card" id="shareCard"></div>

    <div class="card">
      <h3>Your own copy</h3>
      <p class="hint">A plain JSON file you can email to yourself or drop on a stick.</p>
      <button class="btn" data-act="export">Export a copy\u2026</button>
      <button class="btn" data-act="import">Import a copy\u2026</button>
      <input id="importFile" type="file" accept="application/json,.json" hidden>
    </div>

    ${whatsNewCard()}

    ${archivesCard()}

    <div class="card" id="backupsCard">
      <h3>Backups</h3>
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
  $('#notices').innerHTML = notices.map((n, i) =>
    `<div class="notice ${n.kind}"><div class="say">${esc(n.text)}${n.lines?.length
      ? `<ul>${n.lines.map((l) => `<li>${line(l)}</li>`).join('')}</ul>` : ''}</div><div class="acts">${n.offer
      ? actBtn(n.offer.act, n.offer.kind, n.offer.id, esc(n.offer.text), 'primary-ish')
      : ''}${n.link ? `<a class="btn" href="${esc(n.link.href)}">${esc(n.link.text)}</a>` : ''}<button class="btn" data-act="dismiss" data-index="${i}" title="Dismiss">\u2715</button></div></div>`).join('');

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
  renderPlan(); renderDrivers(); renderCars(); renderPositions(); renderLabels(); renderData(); renderShare(); renderSheet();
  renderNotices();
  renderPicker();
  renderTagMenu();
  renderCtxMenu();
  // The tour follows its target through every redraw. It must never stop
  // one: whatever it throws is logged and the page is drawn regardless.
  if (typeof Tour !== 'undefined') { try { Tour.place(); } catch (e) { console.error(e); } }
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
  if (kind === 'meta') state[name] = value;
  else {
    const item = byId(listFor(kind) || [], id);
    if (!item) return;
    item[name] = value;
  }
  save();
  // A tick is often pressed with Space, and the next Tab has to go on from it.
  if (el.type === 'checkbox') renderKeepingFocus();
  else if (el.tagName === 'SELECT') render();
  else if (before !== null && liveSig() !== before) redrawKeepingCaret(el);
  else if (regroup && weekSig() !== weekWas) redrawKeepingCaret(el);
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
  const again = document.querySelector(`[data-kind="${kind}"][data-id="${CSS.escape(id)}"][data-field="${name}"]`);
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
function renderKeepingFocus() {
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
  render();
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
    <h3>Send this list to another PC</h3>
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
    <p>A day plan for <b>${y ? `${d}/${m}/${y}` : 'an unknown date'}</b> with <b>${sum.routes} routes</b>${sum.hasEverything ? `, plus ${sum.cars} cars, ${sum.positions} positions and their labels${sum.drivers ? `, and ${sum.drivers} drivers with their groups` : ''}` : ''}.</p>
    ${missing.length ? `<p class="status warn-status">It mentions ${missing.join(' and ')}.</p>` : ''}
    <p class="status warn-status"><b>This replaces the day plan on screen.</b> A backup is taken first, so you can undo it from Backups.</p>

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
      Store.snapshot(state, 'Loading a shared list');
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
  pending = { share, mode: 'day', addMissing: true };
  renderShareDialog();
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
      const i = Number(b.dataset.id);
      if (!confirmTwice(`restore:${i}`, fromKeyboard)) return;
      const entry = Store.backups()[i];
      if (!entry) break;
      Store.snapshot(state, 'Restoring a backup');
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
    case 'dismiss': notices.splice(Number(b.dataset.index), 1); break;
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
   nothing recovered from the save file. Set once, at start-up, for the tour
   (pack 9) to read as well. */
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

/* The tour, offered once there is reason to think this is someone's first
   look: a first-ever open (nothing saved, nothing read from a save file), not
   by a share link, with no warning up (an unreadable save is one), no save
   file linked (a linked file means this browser was used before, even with
   its plan gone), and the tour not seen here. It only offers: the tour opens
   when Show me around is pressed. Kept, so starting the tour takes this
   notice away and no other: the update note never carries this button, but
   removing by act would be one change away from taking the note too. */
let tourOffer = null;
function offerTour(link) {
  if (!firstRun || link || typeof Tour === 'undefined' || typeof Store.pref !== 'function') return;
  if (notices.some((n) => n.kind === 'warn') || (Store.file && Store.file.handle)) return;
  // null is "never seen"; undefined is storage that could not be read, which
  // is no reason to offer.
  if (Store.pref('tour') !== null) return;
  note('info', 'New here? A two-minute tour shows where everything is. The tour only points at things; anything you type on the page is saved as usual. Used Car Coordinator before? Open your save file or an exported copy from the Data tab first.',
    { act: 'tour', kind: '', id: '', text: 'Show me around' });
  tourOffer = notices[notices.length - 1];
}
const dropTourOffer = () => {
  if (!tourOffer) return;
  notices = notices.filter((n) => n !== tourOffer);
  tourOffer = null;
};

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

/* The calendar half of templates, and the whole of it: a template offers
   itself on its day and never applies itself. It is opt-in per template —
   nothing has a weekday until one is chosen — because the plan on screen may
   already have someone's morning in it, and the app does not know that. */
/* A template set for the plan's weekday offers itself: the plan's day, not the
   calendar's, because the plan is usually for tomorrow. It only asks. A new
   offer replaces the one before it (the offer carries `day` to be found by),
   and a quiet one leaves the page where it is. A date that is not a real day
   offers nothing. */
function offerPlanDayTemplate({ quiet = false } = {}) {
  notices = notices.filter((n) => !(n.offer && n.offer.day));
  const day = planWeekday();
  if (day < 0) return;
  const set = state.templates.filter((t) => t.weekday === String(day));
  if (!set.length) return;                             // the default, and the point of it
  const t = set[0];
  // More than one set for the same day is allowed: the offer names the first
  // and mentions the rest, rather than stacking questions on top of each other.
  const others = set.length - 1;
  const raised = offerRaised;
  note('info', `This plan is for ${dayLabel(state.date)}. Your ${t.name} template is set for ${WEEKDAYS[day]}s${others ? `, and so ${others === 1 ? 'is one other' : `are ${others} others`}` : ''}.`,
    { act: 'ask-template', kind: 'template', id: t.id, text: `Use ${t.name}`, day: true });
  if (quiet) offerRaised = raised;
}

function askTemplate(t) {
  dropOffers();
  const now = state.routes.length;
  note('warn', `Load the ${t.name} template over the plan on screen? That replaces the ${now} route${now === 1 ? '' : 's'} there now with the template's ${t.routes.length}. A backup is taken first, so Backups can undo it.`,
    { act: 'load-template', kind: 'template', id: t.id, text: `Load ${t.name}` });
}

function applyImport(text, source) {
  const { state: incoming, error, repaired } = Store.parseImport(text, defaults);
  if (error) { note('warn', error); render(); return; }
  Store.snapshot(state, `Importing ${source}`);
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
  // The tour only points: it goes nowhere near the save below.
  if (act === 'tour') { if (typeof Tour !== 'undefined') Tour.start(b); return; }
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
      offerPlanDayTemplate({ quiet: true });
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
      Store.snapshot(state, `Deleting a ${{ driverGroup: 'day group', driverTag: 'driver tag' }[kind] || kind}`);
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
    case 'set-tomorrow':
      state.date = nextWorkingDay();
      dropKeep();
      offerPlanDayTemplate({ quiet: true });
      if (e.detail === 0) refocus = '#date';
      break;
    case 'clear-day':
      if (!confirmTwice('clear', e.detail === 0)) return;
      Store.snapshot(state, 'Clearing the day');
      state.routes.forEach((r) => { r.driver = ''; r.carId = ''; r.positionId = ''; r.round = ''; r.highlight = false; });
      state.date = nextWorkingDay();
      // The same plan object and the moved date again, so Keep would not see
      // it is stale: it goes explicitly, or it could write a passed date
      // over the day just cleared.
      dropKeep();
      offerPlanDayTemplate({ quiet: true });
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
      Store.snapshot(state, `Clearing route ${r.name.trim() || '-'}`);
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
    // A menu's Replace: this template, found by its id rather than by its
    // name, so the one clicked is the one replaced even when two share a
    // name. It keeps its id, name and weekday, after a backup.
    case 'resave-template': {
      if (!confirmTwice(`resave:${id}`, e.detail === 0)) return;
      const t = list[i];
      Store.snapshot(state, `Replacing the ${t.name} template`);
      const routes = templateRoutes();
      list[i] = { ...t, routes };
      note('info', `Replaced the ${t.name} template with the ${routes.length} routes on the plan now.`);
      break;
    }
    case 'peek-template':
      tplOpen = tplOpen === id ? null : id;
      render();
      return;
    case 'load-template': {
      const t = list[i];
      Store.snapshot(state, `Loading the ${t.name} template`);
      // Ids are minted here rather than stored, so loading the same template
      // twice cannot leave two rows sharing one id and editing as one. The
      // spread goes first, so a stored id (from an imported file, say) cannot
      // put itself back over the new one and undo exactly that.
      state.routes = t.routes.map((r) => ({ ...r, id: uid() }));
      dropOffers();
      note('info', `Loaded the ${t.name} template: ${state.routes.length} routes. The plan as it was is in Backups.`);
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
      Store.snapshot(state, 'Splitting the round out of the spot names');
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

/* A right-click on a row opens its menu, and so do Shift+F10 and the Menu
   key on a control in one. Everywhere else, in any box that is typed in, with
   Shift held, over selected text or while the share dialog is open, the
   browser's own menu stays. */
document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  const layer = $('#ctxMenu');
  if (!layer) return;
  if (inCtx(t)) { e.preventDefault(); return; }
  if (e.shiftKey || $('#shareDlg').open || !t.closest) return;
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
    } else if (ctx.sub === b.dataset.view) ctxCloseSub(false);
    else ctxOpenSub(b.dataset.view, e.detail === 0);
    return;
  }
  if (b.dataset.arm && b.dataset.arm !== armed) return;
  ctxClosed = { keyboard: e.detail === 0, back: ctx.keyboard ? ctxReturn : null };
  ctx = null;
}
$('#ctxMenu')?.addEventListener('click', ctxChoose);
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
  const map = { newDriver: 'add-driver', newGroup: 'add-group', newTemplate: 'save-template', newCar: 'add-car', newPos: 'add-position', newLabel: 'add-label', newDriverTag: 'add-driver-tag' };
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

async function start() {
  // First, before anything can draw: Store.init draws the page before it
  // returns, and every draw asks the tour where its card goes.
  if (typeof Tour !== 'undefined') {
    Tour.init({
      showTab: (t) => { tab = t; render(); },
      tab: () => tab,
      closeLayers: () => { closePicker(); closeTagMenu(); closeCtxMenu(); dropTourOffer(); },
      besideAnchor,
      setPref: (name, value) => Store.setPref(name, value),
    });
  }
  clearTheBar();
  // Read before Share.readHash() clears it: an open by share link keeps the
  // update note for the next ordinary open.
  const link = /^#d=/.test(location.hash || '');
  state = await Store.init(defaults, render, APP_VERSION);
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
  // Offers, never applications: these only ever add a notice with a button in
  // it. The spot names come first because they are about the data itself
  // rather than about today, and because the question scrolled into view
  // should be the one that has to be answered before share codes work again.
  offerSpotRoundSplit();
  offerPlanDayTemplate();
  // What the Store said since the drain above (a start-of-day backup that
  // would not fit) goes up before the note, so the note stays last.
  drainStoreNotices();
  try { raiseUpdateNote({ link, recovered, copy }); } catch (e) { console.warn('update note skipped', e); }
  // After the note, which is what works out whether this is a first run.
  try { offerTour(link); } catch (e) { console.warn('tour offer skipped', e); }
  render();

  const fromLink = Share.readHash();
  if (fromLink) {
    const { share, error } = await Share.decode(fromLink);
    if (error) { note('warn', error); render(); }
    else { tab = 'data'; render(); openShare(share); }
  }
}

start();
