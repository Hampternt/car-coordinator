'use strict';

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

/* A day group named for a day of the week is that day's crew, and is the
   button for that day beside the plan. Named the way people name them: in
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

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function newRoute(name, gapBefore = false) {
  return { id: uid(), name, driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore };
}

function defaults() {
  const pos = (name) => ({ id: uid(), name, multi: name === 'Garage', labelId: '', note: '' });
  return {
    schemaVersion: Store.SCHEMA,
    date: today(),
    qrOnSheet: true,
    // Just the spots. The number after the slash on the pillar sheet is the
    // round, not part of the spot's name, so it lives in the route's own round
    // field and the two are joined back together for the printout.
    positions: ['Spot 1', 'Spot 2', 'Spot 3', 'Spot 4', 'Spot 5', 'Garage'].map(pos),
    labels: [
      { id: uid(), name: 'Out of service', color: '#c62828' },
      { id: uid(), name: 'Unavailable', color: '#ef6c00' },
      { id: uid(), name: 'Workshop', color: '#6a1b9a' },
    ],
    cars: [],
    drivers: [],
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
let armed = null;
let notices = [];

const save = () => Store.save(state);

const listFor = (kind) => ({ route: state.routes, car: state.cars, position: state.positions, label: state.labels, driver: state.drivers, driverGroup: state.driverGroups, template: state.templates })[kind];

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

function labelChips(kind, item) {
  const ok = `<button class="chip ok ${item.labelId ? '' : 'on'}" data-act="setLabel" data-kind="${kind}" data-id="${esc(item.id)}" data-label="">OK</button>`;
  return ok + state.labels.map((l) =>
    `<button class="chip ${item.labelId === l.id ? 'on' : ''}" style="--c:${esc(colour(l.color))}" data-act="setLabel" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(l.id)}">${esc(l.name)}</button>`
  ).join('');
}

/* Everything a driver is, minted in one place so the rail, the tab and an
   applied group cannot drift apart on what a new one starts as. */
const newDriver = (name) => ({ id: uid(), name, available: true, labelId: '', note: '' });

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
    if (routes.length < 2) continue;
    const pos = byId(state.positions, routes[0].r.positionId);
    if (!pos || pos.multi) continue;
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

/* The tag menu: every label, the way off, and a box to make a new one.

   It used to be drawn inside the row it belongs to, and the rows sit in a
   list that scrolls — and a scrolling box cuts off whatever crosses its edge.
   So the menu showed its first choice and the rest was only reachable by
   scrolling the list, on a two-driver roster as much as a long one. It is
   drawn in a layer of its own over the page now (#tagMenu), placed against the
   button that opened it, and nothing it sits inside can crop it. */
function tagMenu(kind, item) {
  const choice = (id, name, color, on) =>
    `<button class="tag-choice ${on ? 'on' : ''}" data-act="set-tag" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(id)}">
      <span class="dot" style="--c:${esc(color)}"></span>${esc(name)}</button>`;
  return `<div class="tag-choices">
      ${choice('', 'No tag', '#2e7d32', !item.labelId)}
      ${state.labels.map((l) => choice(l.id, labelName(l), colour(l.color), item.labelId === l.id)).join('')}
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
  const typed = again ? { name: $('#newTagName')?.value, color: $('#newTagColor')?.value, caret: f?.id === 'newTagName' ? f.selectionStart : null } : null;
  layer.innerHTML = tagMenu(tagFor.kind, item);
  layer.dataset.for = key;
  layer.setAttribute('aria-label', `Tag ${item.reg || item.name}`);
  if (typed) {
    if (typed.name) $('#newTagName').value = typed.name;
    if (typed.color) $('#newTagColor').value = typed.color;
  }
  if (where) {
    layer.querySelector(where)?.focus();
    if (typed?.caret != null) $('#newTagName').setSelectionRange(typed.caret, typed.caret);
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

/* One row of the rail: grip, status dot, the name as an editable box, where
   it is today, and the two buttons that act on it. */
function railRow(kind, item, label, where, extra = '', cls = '') {
  const lab = byId(state.labels, item.labelId);
  const field = kind === 'car' ? 'reg' : 'name';
  const title = [item[field], lab && labelName(lab), item.note].filter(Boolean).join(' · ');
  return `<li class="rail-row ${cls} ${armed === `del:${item.id}` ? 'arming' : ''}" draggable="true"
      data-drag="${kind}" data-id="${esc(item.id)}" title="${esc(title)}">
    <span class="grip" aria-hidden="true">⠿</span>
    <span class="dot" style="--c:${esc(lab ? colour(lab.color) : '#2e7d32')}" title="${esc(lab ? labelName(lab) : 'No tag')}"></span>
    <input class="rail-name" type="text" data-kind="${kind}" data-id="${esc(item.id)}" data-field="${field}"
      value="${esc(item[field])}" aria-label="${label}">
    ${where}
    ${extra}
    <button class="btn tag-btn ${tagOpenFor(kind, item.id) ? 'on' : ''}" data-act="tag" data-kind="${kind}" data-id="${esc(item.id)}"
      title="Tag ${esc(item[field])}" aria-label="Tag ${esc(item[field])}" aria-haspopup="true" aria-expanded="${!!tagOpenFor(kind, item.id)}">🏷</button>
    ${actBtn('del', kind, item.id, armed === `del:${item.id}` ? 'Sure?' : '✕', armed === `del:${item.id}` ? 'armed' : '', `title="Remove ${esc(item[field])}"`)}
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
function railDrivers() {
  const assigned = driverUsage();
  const inToday = state.drivers.filter((d) => d.available);
  const ordered = [...state.drivers].sort((a, b) => Number(b.available) - Number(a.available));
  const rows = ordered.map((d) => {
    const on = assigned[fold(d.name)];
    const where = on
      ? `<span class="assign yes">Route ${routeNames(on)}</span>`
      : `<span class="assign ${d.available ? 'none' : 'away'}">${d.available ? 'Free' : 'Away'}</span>`;
    const inOut = actBtn('toggle', 'driver', d.id, d.available ? '\u2713' : '\u21ba', d.available ? 'on' : '',
      `data-field="available" title="${d.available ? 'In today \u2014 click to set away' : 'Away \u2014 click to bring back in'}"`);
    // Someone marked away who is still written into a route keeps the route
    // badge — that is the fact worth seeing, and the one most likely to be a
    // mistake — so the row itself carries the away state, not the badge.
    return railRow('driver', d, 'Driver name', where, inOut, d.available ? '' : 'away');
  }).join('');
  const away = state.drivers.length - inToday.length;
  const { others } = dayCrews();
  // Groups that are not a day of the week — a weekend crew, a Monday named
  // twice — keep their own buttons under the week.
  const groups = others.map((g) => {
    const ids = crewIds(g);
    if (!ids.size) {
      return actBtn('group-empty', 'driverGroup', g.id, esc(g.name), 'quiet', 'title="Nobody in this group yet"');
    }
    const on = crewInForce(ids);
    return actBtn('apply-group', 'driverGroup', g.id, esc(g.name), on ? 'on' : '',
      `aria-pressed="${on}" title="${ids.size} driver${ids.size === 1 ? '' : 's'} — click to make them the ones in today"`);
  }).join('');
  return `<section class="rail-panel" data-panel="drivers">
    <h3>Drivers <span class="rail-count">${inToday.length} in${away ? ` \u00b7 ${away} away` : ''}</span></h3>
    ${state.drivers.length ? dayBar(inToday) : ''}
    ${groups ? `<p class="rail-groups">${groups}</p>` : ''}
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

/* The question a quiet day asks, and what it says once answered. Asked in
   the Drivers panel, under the week, rather than as a notice above the page:
   a notice pushed the week down under the finger that had just pressed it, so
   on a phone the next tap landed on "Save" instead of the next day, and a
   week set up day by day piled a notice up for every one. Here nothing above
   the row moves, the count is who is in right now, and each answer replaces
   the last. Kept off `state`: it is a conversation, not data. */
let dayAsk = null;   // { day } | { day, saved: [driver ids] } | { groupId }

/* Drawn from what is true now, every time: the Drivers tab can fill, rename
   or delete a crew while the question is up, and a line that went on saying
   "Wednesday's crew is empty" beside a Wed that had since got a crew was
   worse than no line. A question overtaken like that turns into the answer,
   or goes. */
function dayQuestion() {
  if (!dayAsk || !state.drivers.length) return '';
  const close = '<button class="btn" data-act="day-ask-close" aria-label="Close" title="Close">✕</button>';
  const line = (text, acts = '', cls = '') => `<div class="day-ask ${cls}" role="status"><span>${text}</span><span class="acts">${acts}${close}</span></div>`;
  if (dayAsk.groupId) {
    const g = byId(state.driverGroups, dayAsk.groupId);
    if (!g || crewIds(g).size) return '';
    return line(`${esc(g.name.trim() || 'That group')} has nobody in it yet. Tick names into it on the Drivers tab.`);
  }
  const name = WEEKDAYS[dayAsk.day];
  const crew = dayCrews().byDay.get(dayAsk.day);
  const has = crew ? crewIds(crew).size : 0;
  if (dayAsk.saved) {
    // Only while the crew is still the one saved: edited on the Drivers tab
    // since, "Saved: the 6" would be claiming someone else's work.
    const ids = crew ? crewIds(crew) : new Set();
    const same = ids.size === dayAsk.saved.length && dayAsk.saved.every((x) => ids.has(x));
    return same ? line(`Saved: ${name}'s crew is the ${ids.size} who were in. Press ${name.slice(0, 3)} to bring them back any ${name}.`, '', 'done') : '';
  }
  if (has) return line(`${name} has a crew now. Press ${name.slice(0, 3)} to use it.`);
  const what = crew ? `${name}'s crew is empty.` : `No ${name} crew yet.`;
  const n = state.drivers.filter((d) => d.available).length;
  if (!n) return line(`${what} Nobody is in to save as one — set who is in first, or tick names into it on the Drivers tab.`);
  const all = n === state.drivers.length && n > 1 ? ' That is everyone: set anyone who is off to away first, if the crew is smaller.' : '';
  return line(`${what} Save the ${n} in now as ${name}'s?${all}`,
    `<button class="btn primary-ish" data-act="save-day-crew" data-day="${dayAsk.day}">Save as ${name}</button>`);
}

/* Monday morning is one click, and the week is where it is found: All, then
   Monday to Sunday, as one row. The one in force is lit — the crew in today
   is exactly that day's, or everyone — and today has a line under it. A day
   with no crew yet is there but quiet, and clicking it offers to save who is
   in now as that day's. */
function dayBar(inToday) {
  const { byDay } = dayCrews();
  const inIds = new Set(inToday.map((d) => d.id));
  const today = new Date().getDay();
  // A crew left empty — made with no names ticked, or whose names all left —
  // is not a crew to send everyone away with, so it looks and acts like a day
  // that has none, and never lights up.
  const everyone = inIds.size === state.drivers.length;
  const days = WEEK.map((day) => {
    const g = byDay.get(day);
    const ids = g ? crewIds(g) : new Set();
    const on = crewInForce(ids);
    const cls = ['day', day === today && 'today', !ids.size && 'none', on && 'on', dayAsk && dayAsk.day === day && !dayAsk.saved && 'asking'].filter(Boolean).join(' ');
    const when = `${WEEKDAYS[day]}${day === today ? ' (today)' : ''}`;
    if (!ids.size) {
      return `<button class="${cls}" data-act="day-missing" data-day="${day}" aria-pressed="false"
        title="${when}: ${g ? 'the crew is empty' : 'no crew yet'} — click to save who is in now as ${WEEKDAYS[day]}'s">${WEEKDAYS[day].slice(0, 3)}</button>`;
    }
    return `<button class="${cls}" data-act="apply-group" data-kind="driverGroup" data-id="${esc(g.id)}" data-day="${day}" aria-pressed="${on}"
      title="${esc(when)}: ${ids.size} driver${ids.size === 1 ? '' : 's'} — click to make them the ones in today">${WEEKDAYS[day].slice(0, 3)}</button>`;
  }).join('');
  return `<div class="day-bar" role="group" aria-label="Who is in today">
    <button class="day all${everyone ? ' on' : ''}" data-act="all-in" aria-pressed="${everyone}" title="Everyone on the roster is in today">All</button>${days}
  </div>`;
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
      <b>${flagged.size} route${flagged.size > 1 ? 's' : ''} to look at</b> \u2014 nothing is blocked, check they are on purpose.
      <ul>${found.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="bar">
      <label for="date">Date</label>
      <input id="date" type="date" data-kind="meta" data-field="date" value="${esc(state.date)}">
      <button class="btn" data-act="add-route">+ Add route</button>
      <button class="btn ${armed === 'clear' ? 'armed' : ''}" data-act="clear-day">${armed === 'clear' ? 'Sure? Click again' : 'Clear drivers, cars, positions and rounds'}</button>
    </div>
    <div class="plan">
      <div class="plan-table" data-keep-scroll="table"><table class="grid">
        <thead><tr><th>Route</th><th>Driver</th><th>Car</th><th>Position</th><th>Round</th><th></th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <aside class="rail">${railDrivers()}${railCars(use)}
        <p class="rail-saved">Every change here is saved as you make it.</p>
      </aside>
    </div>
    ${renderTemplates()}`;
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
      <select data-kind="template" data-id="${esc(t.id)}" data-field="weekday" title="Offer this template when the app is opened on that day">
        <option value="">Never offer it</option>
        ${WEEKDAYS.map((d, n) => `<option value="${n}" ${t.weekday === String(n) ? 'selected' : ''}>On ${d}s</option>`).join('')}
      </select>
      ${actBtn('del', 'template', t.id, armed === `del:${t.id}` ? 'Sure?' : '✕', armed === `del:${t.id}` ? 'armed' : '', 'title="Delete this template"')}
      </div>
      ${tplOpen === t.id ? templateContents(t) : ''}
    </div>`).join('');
  return `<section class="templates">
    <h3>Day templates</h3>
    <p class="hint">A saved copy of the routes as they stand — drivers, cars, positions, rounds and marks, but never the date. Save the way Monday usually runs once, and put it back next Monday.</p>
    <div class="bar">
      <input id="newTemplate" type="text" placeholder="Template name, e.g. Monday">
      <button class="btn" data-act="save-template">Save as template</button>
    </div>
    ${shelf ? `<div class="shelf">${shelf}</div>
      <p class="hint" style="margin:8px 0 0">A template can offer itself when you open the app on its day — "Never offer it" until you pick one, and even then it only asks.</p>` : '<p class="empty">No templates yet. Set the plan up the way it usually runs, then save it here.</p>'}
  </section>`;
}

/* Saving over a name that is already used replaces it, rather than leaving two
   Mondays to choose between: the second save is a correction of the first. It
   is an overwrite, so it is snapshotted first, and the weekday already chosen
   for that template stays put — the plan changed, not what it is for. */
function saveTemplate(name) {
  const routes = state.routes.map((r) => ({
    name: r.name, driver: r.driver, carId: r.carId, positionId: r.positionId,
    round: r.round, highlight: r.highlight, gapBefore: r.gapBefore,
  }));
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

function renderDrivers() {
  const assigned = driverUsage();
  const rows = state.drivers.map((d) => {
    const on = assigned[fold(d.name)];
    return `<tr class="${d.available ? '' : 'away'}">
      <td>${field('driver', d.id, 'name', d.name, 'style="width:200px"')}</td>
      <td>${on ? `<span class="assign yes">Route ${routeNames(on)}</span>` : '<span class="assign none">Not on a route</span>'}</td>
      <td>${actBtn('toggle', 'driver', d.id, d.available ? 'In today' : 'Away', d.available ? 'on' : '', 'data-field="available" title="Whether they show in the day plan\'s rail"')}</td>
      <td class="btns">${moveDel('driver', d.id)}</td></tr>`;
  }).join('');
  $('#tab-drivers').innerHTML = `
    <h2>Drivers</h2>
    <p class="hint">The people who might drive. The day plan's driver box still takes anything you type \u2014 this list only offers the names, and shows who is in today.</p>
    <div class="bar">
      <input id="newDriver" type="text" placeholder="Name(s), separated by commas">
      <button class="btn" data-act="add-driver">+ Add driver</button>
    </div>
    ${state.drivers.length
      ? `<table class="grid"><thead><tr><th>Name</th><th>Today</th><th>In or away</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">Nobody on the roster yet. Add the names you plan with \u2014 they become suggestions in the day plan and a list you can group by day.</p>'}
    ${driverGroups()}`;
}

/* A group is a named set of drivers — Monday's crew is these people — and
   nothing more. Applying one answers "who is in today", which is what the rail
   shows; it says nothing about which route anyone drives. */
function driverGroups() {
  const { byDay } = dayCrews();
  const missing = WEEK.filter((day) => !byDay.has(day));
  const cards = state.driverGroups.map((g) => {
    const members = state.drivers.map((d) =>
      `<button class="chip ${g.driverIds.includes(d.id) ? 'on' : ''}" style="--c:var(--steel)" data-act="group-member" data-kind="driverGroup" data-id="${esc(g.id)}" data-driver="${esc(d.id)}">${esc(d.name)}</button>`).join('');
    const day = groupWeekday(g.name);
    const used = day >= 0 && byDay.get(day) === g;
    const badge = day < 0 ? ''
      : used ? `<span class="day-badge" title="This group is the ${WEEKDAYS[day].slice(0, 3)} button beside the day plan">${WEEKDAYS[day].slice(0, 3)} button</span>`
        : `<span class="day-badge twice" title="Another group is ${WEEKDAYS[day]} already, so this one has a button of its own under the week">${WEEKDAYS[day]} twice</span>`;
    return `<div class="group">
      <div class="bar">
        ${field('driverGroup', g.id, 'name', g.name, 'style="width:180px"')}${badge}
        ${actBtn('apply-group', 'driverGroup', g.id, 'Use for today', 'primary-ish', 'title="Set who is in today to this group"')}
        ${moveDel('driverGroup', g.id)}
      </div>
      ${state.drivers.length ? `<div class="chips">${members}</div>` : '<p class="hint" style="margin:0">Add drivers above, then tick them into this group.</p>'}
    </div>`;
  }).join('');
  return `<h2 style="margin-top:22px">Day groups</h2>
    <p class="hint">A group is a set of names you use again \u2014 a Monday crew, a weekend crew. Name one after a day of the week and it becomes that day's button beside the day plan. "Use for today" makes exactly those drivers the ones in today; everyone else goes to away.</p>
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
    <p class="hint">Click a label to mark a car. Marked cars still appear in the day plan, but picking one shows a warning, and they are listed on the printout.</p>
    <p class="counts"><span class="assign yes">${onRoute} on a route</span><span class="assign none">${free} free</span><span class="assign down">${down} parked and marked</span></p>
    <div class="bar">
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
    <p class="hint">Packing spots, garage, ports. "Many cars" lets several routes share it (like Garage) without a warning.</p>
    <div class="bar">
      <input id="newPos" type="text" placeholder="Name, e.g. Spot 6 or Port 3">
      <button class="btn" data-act="add-position">+ Add position</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Sharing</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLabels() {
  const rows = state.labels.map((l) => `<tr>
    <td>${field('label', l.id, 'name', l.name)}</td>
    <td><input type="color" data-kind="label" data-id="${esc(l.id)}" data-field="color" value="${esc(colour(l.color))}"></td>
    <td class="btns">${moveDel('label', l.id)}</td></tr>`).join('');
  $('#tab-labels').innerHTML = `
    <h2>Status labels</h2>
    <p class="hint">These become the one-click buttons on cars and positions.</p>
    <div class="bar">
      <input id="newLabel" type="text" placeholder="Label name, e.g. No fuel card">
      <input id="newLabelColor" type="color" value="#1565c0">
      <button class="btn" data-act="add-label">+ Add label</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Colour</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

const when = (d) => {
  if (!d) return '';
  const t = new Date(d);
  const sameDay = t.toDateString() === new Date().toDateString();
  return sameDay ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : t.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

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

  $('#tab-data').innerHTML = `
    <h2>Data</h2>
    <p class="hint">Everything you type stays on this PC. This page never sends it anywhere.</p>

    <div class="card">
      <h3>Auto-save to a file</h3>
      ${fileStatus()}
    </div>

    <div class="card">
      <h3>This browser</h3>
      <p class="status ${p === 'granted' ? 'on' : 'off'}">${esc(persistText)}</p>
    </div>

    <div class="card" id="shareCard"></div>

    <div class="card">
      <h3>Your own copy</h3>
      <p class="hint">A plain JSON file you can email to yourself or drop on a stick.</p>
      <button class="btn" data-act="export">Export a copy\u2026</button>
      <button class="btn" data-act="import">Import a copy\u2026</button>
      <input id="importFile" type="file" accept="application/json,.json" hidden>
    </div>

    <div class="card">
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
  // the sentence alone, exactly as before.
  $('#notices').innerHTML = notices.map((n, i) =>
    `<div class="notice ${n.kind}"><div class="say">${esc(n.text)}${n.lines?.length
      ? `<ul>${n.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div><div class="acts">${n.offer
      ? actBtn(n.offer.act, n.offer.kind, n.offer.id, esc(n.offer.text), 'primary-ish')
      : ''}<button class="btn" data-act="dismiss" data-index="${i}" title="Dismiss">\u2715</button></div></div>`).join('');

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

function renderSheet() {
  const [y, m, d] = (state.date || today()).split('-');
  const { lines: found, rows: flagged } = problems();
  const rows = state.routes.map((r, at) =>
    (r.gapBefore ? '<tr class="spacer"><td colspan="4"></td></tr>' : '') +
    `<tr class="${[r.highlight && 'hl', flagged.has(at) && 'warn'].filter(Boolean).join(' ')}">
      <td class="rn">${dash(r.name)}${flagged.has(at) ? '<span class="mark">!</span>' : ''}</td>
      <td>${dash(r.driver)}</td>
      <td>${dash(byId(state.cars, r.carId)?.reg)}</td>
      <td>${dash(spotCell(r))}</td>
    </tr>`).join('');

  const marked = (arr, key) => arr.filter((x) => x.labelId).map((x) =>
    `<p>${esc(x[key])}: ${esc(byId(state.labels, x.labelId)?.name)}${x.note ? ' (' + esc(x.note) + ')' : ''}</p>`).join('');
  const use = usage();
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).map((c) => esc(c.reg)).join(', ');
  const downCars = marked(state.cars, 'reg');
  const downPos = marked(state.positions, 'name');

  $('#sheet').innerHTML = `
    <div class="date">${d}/${m}/${y}</div>
    <table>
      <thead><tr><th style="text-align:right;padding-right:6mm">Route</th><th>Driver</th><th>Car</th><th>Packing round</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${qrCache.svg ? `<div class="qr">${qrCache.svg}<span>Scan to load<br>this list</span></div>` : ''}
    <div class="extra">
      ${found.length ? `<h4>Check before posting</h4>${found.map((t) => `<p>! ${esc(t)}</p>`).join('')}` : ''}
      ${downCars ? `<h4>Cars not available</h4>${downCars}` : ''}
      ${downPos ? `<h4>Positions not available</h4>${downPos}` : ''}
      ${free ? `<h4>Free cars</h4><p>${free}</p>` : ''}
    </div>`;
}

function render() {
  // Anything Store had to say since the last draw — a browser save that
  // failed, a backup that would not fit, a file it could not write — belongs
  // on screen with everything else. It goes through note(), so a save failing
  // on every keystroke leaves one notice rather than a hundred.
  for (const n of Store.takeNotices()) note(n.kind, n.text);
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  document.body.classList.toggle('show-sheet', tab === 'preview');
  renderPlan(); renderDrivers(); renderCars(); renderPositions(); renderLabels(); renderData(); renderShare(); renderSheet();
  queueQr();
  renderNotices();
  renderPicker();
  renderTagMenu();
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
  if (el.tagName === 'SELECT' || el.type === 'checkbox') render();
  else if (before !== null && liveSig() !== before) redrawKeepingCaret(el);
  else if (regroup && weekSig() !== weekWas) redrawKeepingCaret(el);
  else { renderSheet(); renderPicker(); }
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
  if (fromKeyboard) renderKeepingFocus(); else render();
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
  const area = el && el !== document.body && el.closest('section.tab, #notices, #tagMenu, #picker, dialog');
  // The tag menu and the route picker put their own focus back, by the very
  // choice it was on; a second guess here could only be worse.
  const own = area && (area.id === 'tagMenu' || area.id === 'picker');
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
  if (again !== document.activeElement) again.focus({ preventScroll: true });
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
  clearTimeout(qrTimer);
  await refreshQr();                       // never print a QR for yesterday's plan
  renderSheet();
  try {
    if (window.__TAURI__?.core) { await window.__TAURI__.core.invoke('print_page'); return; }
  } catch (err) { console.warn('native print failed, using window.print()', err); }
  window.print();
}

/* ---------- QR on the printout ---------- */
/* The sheet is what gets posted on the pillar, so it carries a link to the
   day plan as a QR: a phone pointed at the paper opens the list. */
let qrCache = { key: '', svg: '', error: '' };
let qrTimer = null;

/* Only the web build can put something scannable on paper: a QR holding a
   bare share code is meaningless to whoever points a phone at it. */
const qrUsable = () => location.protocol === 'https:' || location.protocol === 'http:';

async function refreshQr() {
  if (!state.qrOnSheet || !qrUsable()) {
    if (qrCache.key) { qrCache = { key: '', svg: '', error: '' }; renderSheet(); }
    return;
  }
  const payload = Share.linkFor(await Share.encode(state, 'day'));
  if (qrCache.key === payload) return;
  try {
    qrCache = { key: payload, svg: QR.svg(payload, { level: 'M' }), error: '' };
  } catch {
    // Only happens with an enormous day plan; the sheet drops the QR rather
    // than printing something that will not scan.
    qrCache = { key: payload, svg: '', error: 'This day plan is too big to fit in a QR code. The printed sheet will not have one.' };
  }
  renderSheet();
}

const queueQr = () => { clearTimeout(qrTimer); qrTimer = setTimeout(refreshQr, 400); };

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

    <p class="hint" style="margin-top:14px">
      ${qrUsable()
        ? `<label><input type="checkbox" data-kind="meta" data-field="qrOnSheet" ${state.qrOnSheet ? 'checked' : ''}> Put a QR code on the printed sheet, so a phone can open the list from the paper</label>`
        : 'The printed sheet carries a QR code only in the browser version, where it holds a link a phone can open.'}
      ${qrCache.error ? `<br><span class="status warn-status" style="padding-left:0">${esc(qrCache.error)}</span>` : ''}
    </p>

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

/* Data-tab actions. These await pickers and disk writes, so they sit outside
   the synchronous switch below. */
async function dataAction(act, b, fromKeyboard = false) {
  switch (act) {
    case 'link-file': await Store.linkFile(state); break;
    case 'reconnect-file': await Store.reconnect(state); break;
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

const note = (kind, text, offer = null, lines = []) => {
  notices = notices.filter((n) => n.text !== text);
  const n = { kind, text, offer, lines };
  notices.push(n);
  // The first question raised since the last draw is the one brought into
  // view: at start-up that is the one about the data, which comes first on
  // purpose; any question asked later is raised on its own and wins.
  if (offer && !offerRaised) offerRaised = n;
};

/* One live offer at a time: asking about Tuesday takes Monday's question away
   rather than leaving two questions on screen that answer each other. */
const dropOffers = () => { notices = notices.filter((n) => !n.offer); };

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
function offerTodaysTemplate() {
  const day = new Date().getDay();
  const todays = state.templates.filter((t) => t.weekday === String(day));
  if (!todays.length) return;                          // the default, and the point of it
  const t = todays[0];
  // More than one set for the same day is allowed: the offer names the first
  // and mentions the rest, rather than stacking questions on top of each other.
  const others = todays.length - 1;
  note('info', `It is ${WEEKDAYS[day]}. Your ${t.name} template is set for ${WEEKDAYS[day]}s${others ? `, and so ${others === 1 ? 'is one other' : `are ${others} others`}` : ''}.`,
    { act: 'ask-template', kind: 'template', id: t.id, text: `Use ${t.name}` });
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

  switch (act) {
    case 'tab': tab = b.dataset.tab; break;
    case 'print': doPrint(); return;
    case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
    case 'down': if (i >= 0 && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
    case 'toggle': list[i][b.dataset.field] = !list[i][b.dataset.field]; break;
    case 'setLabel': list[i].labelId = b.dataset.label; break;
    // The rail's quick tag: the same labelId the Cars and Positions tabs set
    // with their chips, reached without leaving the plan.
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
      list[i].labelId = b.dataset.label;
      tagFor = null;
      if (e.detail === 0) refocus = `#tab-plan [data-act="tag"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`;
      break;
    case 'add-tag': {
      const name = $('#newTagName').value.trim();
      if (!name) { $('#newTagName').focus(); return; }
      const label = { id: uid(), name, color: $('#newTagColor').value };
      state.labels.push(label);
      list[i].labelId = label.id;
      tagFor = null;
      if (e.detail === 0) refocus = `#tab-plan [data-act="tag"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`;
      note('info', `Tagged ${list[i].reg || list[i].name} ${name}. The tag is on the Labels tab now, for everything else.`);
      break;
    }
    case 'del':
      if (!confirmTwice(`del:${id}`, e.detail === 0)) return;
      // The backup list shows this label as written, so say it the way it
      // reads on screen rather than the way the code spells it.
      Store.snapshot(state, `Deleting a ${kind === 'driverGroup' ? 'day group' : kind}`);
      list.splice(i, 1);
      if (kind === 'car') state.routes.forEach((r) => { if (r.carId === id) r.carId = ''; });
      if (kind === 'position') state.routes.forEach((r) => { if (r.positionId === id) r.positionId = ''; });
      if (kind === 'label') [...state.cars, ...state.positions].forEach((x) => { if (x.labelId === id) x.labelId = ''; });
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
    case 'clear-day':
      if (!confirmTwice('clear', e.detail === 0)) return;
      Store.snapshot(state, 'Clearing the day');
      state.routes.forEach((r) => { r.driver = ''; r.carId = ''; r.positionId = ''; r.round = ''; r.highlight = false; });
      state.date = today();
      break;
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
        if (!state.drivers.some((d) => fold(d.name) === fold(name))) {
          state.drivers.push({ id: uid(), name, available: true, labelId: '', note: '' });
        }
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
    // No notice from the week beside the plan: the lit day and the count in
    // the heading already say what happened, and a notice arriving above the
    // plan pushed the row down, so the next day was no longer under the
    // pointer that was about to press it.
    case 'all-in':
      state.drivers.forEach((d) => { d.available = true; });
      dayAsk = null;
      delete planScroll.drivers;
      if (e.detail === 0) refocus = '#tab-plan .day-bar [data-act="all-in"]';
      break;
    // A day with no crew, or an empty one. It only ever asks — under the week,
    // with the count as it stands — and the button in the question is what
    // saves, the same two steps as loading a template.
    case 'day-missing':
      dayAsk = { day: Number(b.dataset.day) };
      render();
      if (e.detail === 0) {
        (document.querySelector('#tab-plan .day-ask [data-act="save-day-crew"]')
          || document.querySelector(`#tab-plan .day-bar [data-day="${Number(b.dataset.day)}"]`))?.focus();
      }
      return;
    case 'day-ask-close': {
      const was = dayAsk;
      dayAsk = null;
      render();
      // From the keyboard, back to what asked: the day, or the crew.
      if (e.detail === 0 && was) {
        document.querySelector(was.groupId
          ? `#tab-plan .rail-groups [data-id="${CSS.escape(was.groupId)}"]`
          : `#tab-plan .day-bar [data-day="${was.day}"]`)?.focus();
      }
      return;
    }
    case 'group-empty':
      dayAsk = { groupId: id };
      render();
      if (e.detail === 0) document.querySelector(`#tab-plan .rail-groups [data-id="${CSS.escape(id)}"]`)?.focus();
      return;
    // Counted when pressed, not when asked: who is in may have changed since.
    case 'save-day-crew': {
      const day = Number(b.dataset.day);
      if (!WEEKDAYS[day]) break;
      const driverIds = state.drivers.filter((d) => d.available).map((d) => d.id);
      const crew = dayCrews().byDay.get(day);
      // Nobody in, or a crew made on the Drivers tab while the question was
      // up: the question redraws itself saying so, and nothing is saved.
      // A crew made on the Drivers tab meanwhile, or nobody in: the question
      // redraws itself saying so, and nothing is saved.
      if ((crew && crewIds(crew).size) || !driverIds.length) {
        dayAsk = { day };
        if (e.detail === 0) refocus = `#tab-plan .day-bar [data-day="${day}"]`;
        break;
      }
      if (crew) crew.driverIds = driverIds;
      else state.driverGroups.push({ id: uid(), name: WEEKDAYS[day], driverIds });
      dayAsk = { day, saved: driverIds };
      if (e.detail === 0) refocus = `#tab-plan .day-bar [data-day="${day}"]`;
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
      // A write across the whole roster, not an addition: picking Monday has
      // to take yesterday's leftovers out, or "who is in today" is a lie by
      // the end of the week.
      state.drivers.forEach((d) => { d.available = g.driverIds.includes(d.id); });
      dayAsk = null;
      // The crew just brought in sorts to the top of the list: show it there,
      // rather than keep the list scrolled down among the ones now away.
      delete planScroll.drivers;
      if (b.closest('#tab-plan')) {
        if (e.detail === 0) refocus = `#tab-plan .day-bar [data-act="apply-group"][data-id="${CSS.escape(id)}"], #tab-plan .rail-groups [data-act="apply-group"][data-id="${CSS.escape(id)}"]`;
        break;
      }
      const inToday = state.drivers.filter((d) => d.available).length;
      note('info', `${g.name.trim() || 'That group'}: ${inToday} driver${inToday === 1 ? '' : 's'} in today, ${state.drivers.length - inToday} away.`);
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
      if (!addFromInput('#newLabel', (name) => state.labels.push({ id: uid(), name, color: $('#newLabelColor').value }))) return;
      break;
    default: return;
  }
  save();
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
  save();
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
      const lab = byId(state.labels, d.labelId);
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
  if (field === 'carId') r.carId = b.dataset.pick; else r.driver = b.dataset.pick;
  picking = null;
  save();
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
  const map = { newDriver: 'add-driver', newGroup: 'add-group', newTemplate: 'save-template', newCar: 'add-car', newPos: 'add-position', newLabel: 'add-label' };
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
const ITEM_ACTS = new Set(['up', 'down', 'toggle', 'setLabel', 'del', 'ask-template', 'load-template', 'peek-template', 'group-member', 'apply-group', 'group-empty', 'tag', 'set-tag', 'add-tag']);
const DATA_ACTS = new Set(['link-file', 'reconnect-file', 'unlink-file', 'open-file', 'export', 'import', 'restore', 'dismiss']);

/* The top bar sticks, and anything the browser scrolls into view — a field
   reached with Tab, a question just asked — would otherwise land under it.
   Its height goes into --bar, which the page's content uses as a scroll
   margin. Not as scroll-padding on the page itself: that also moved the page
   for focus in the top bar, hundreds of pixels a Tab, and changed how a
   phone's page settles when its keyboard shortens the window. */
const clearTheBar = () => { document.documentElement.style.setProperty('--bar', `${$('.topbar').offsetHeight + 8}px`); };
window.addEventListener('resize', clearTheBar);

/* Focus moved onto something the sticky top bar covers — Shift+Tab walks up
   into it — is scrolled out from under the bar. The browser's own focus
   scrolling does not know the bar is there, and ignores scroll-margin. */
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el.closest || el.closest('.topbar') || !el.closest('main')) return;
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
  clearTheBar();
  state = await Store.init(defaults, render);
  // A browser with no data of its own but a linked file (new PC, cleared
  // profile, different Windows user) should come back to what is in the file.
  if (!Store.hasUsableLocalData()) {
    const fromFile = await Store.recoverFromFile(defaults);
    if (fromFile) { state = fromFile; note('info', `Loaded your data from ${Store.file.name}.`); }
  }
  notices = notices.concat(Store.takeNotices());
  Store.dailySnapshot(state);
  // Offers, never applications: these only ever add a notice with a button in
  // it. The spot names come first because they are about the data itself
  // rather than about today, and because the question scrolled into view
  // should be the one that has to be answered before share codes work again.
  offerSpotRoundSplit();
  offerTodaysTemplate();
  render();

  const fromLink = Share.readHash();
  if (fromLink) {
    const { share, error } = await Share.decode(fromLink);
    if (error) { note('warn', error); render(); }
    else { tab = 'data'; render(); openShare(share); }
  }
}

start();
