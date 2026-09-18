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

// Indexed by Date.getDay(), which is how a weekday is stored: Sunday is 0.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    positions: ['Spot 1/1', 'Spot 1/2', 'Spot 2/1', 'Spot 2/2', 'Spot 3/1', 'Spot 3/2',
      'Spot 4/1', 'Spot 5/1', 'Garage'].map(pos),
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
    `<button class="chip ${item.labelId === l.id ? 'on' : ''}" style="--c:${esc(l.color)}" data-act="setLabel" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(l.id)}">${esc(l.name)}</button>`
  ).join('');
}

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

/* ---------- the day plan's left rail ----------
   The fleet as it stands, beside the plan being made: which car is out on
   which route, which one is marked up. All of it is on the Cars tab too —
   this is the version you can read without leaving the plan you are typing. */
function railCars(use) {
  const rows = state.cars.map((c) => {
    const lab = byId(state.labels, c.labelId);
    const on = use.cars[c.id];
    // The same sentence the Cars tab prints in its "Assigned to" column,
    // shortened to what fits: the route number is the bit you look for.
    const where = on
      ? `<span class="assign yes">Route ${routeNames(on)}</span>`
      : `<span class="assign ${lab ? 'down' : 'none'}">${lab ? esc(labelName(lab)) : 'Free'}</span>`;
    const full = [c.reg, lab && labelName(lab), c.note].filter(Boolean).join(' · ');
    return `<li title="${esc(full)}"><span class="dot" style="--c:${esc(lab ? lab.color : '#2e7d32')}"></span><b>${esc(c.reg)}</b>${where}</li>`;
  }).join('');
  const out = state.cars.filter((c) => use.cars[c.id]).length;
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).length;
  return `<section class="rail-panel" data-panel="cars">
    <h3>Cars <span class="rail-count">${out} out · ${free} free</span></h3>
    ${state.cars.length
      ? `<ul class="rail-list">${rows}</ul>`
      : '<p class="rail-empty">No cars yet — add them on the Cars tab.</p>'}
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
function railDrivers() {
  const assigned = driverUsage();
  const inToday = state.drivers.filter((d) => d.available);
  const rows = inToday.map((d) => {
    const on = assigned[fold(d.name)];
    const where = on
      ? `<span class="assign yes">Route ${routeNames(on)}</span>`
      : '<span class="assign none">Free</span>';
    return `<li><b>${esc(d.name)}</b>${where}${actBtn('toggle', 'driver', d.id, '\u2715', '', 'data-field="available" title="Not in today"')}</li>`;
  }).join('');
  const away = state.drivers.length - inToday.length;
  // Monday morning is one click: the groups are here, where the day is set up.
  const groups = state.driverGroups.map((g) =>
    actBtn('apply-group', 'driverGroup', g.id, esc(g.name), '', 'title="Everyone in this group is in today"')).join('');
  return `<section class="rail-panel" data-panel="drivers">
    <h3>Drivers <span class="rail-count">${inToday.length} in${away ? ` \u00b7 ${away} away` : ''}</span></h3>
    ${groups ? `<p class="rail-groups">${groups}</p>` : ''}
    ${state.drivers.length
      ? (inToday.length ? `<ul class="rail-list">${rows}</ul>` : '<p class="rail-empty">Nobody is in today. Bring someone back on the Drivers tab.</p>')
      : '<p class="rail-empty">No drivers yet \u2014 add them on the Drivers tab.</p>'}
  </section>`;
}

function renderPlan() {
  const { lines: found, rows: flagged, use } = problems();
  const rows = state.routes.map((r, at) => {
    const warns = [];
    // Options stay pickable even when they clash; the note says what you are
    // walking into and the row flags it afterwards.
    const carOpts = state.cars.map((c) => {
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
    return `<tr class="${cls}">
      <td>${field('route', r.id, 'name', r.name, 'class="short"')}</td>
      <td>${field('route', r.id, 'driver', r.driver, 'placeholder="-" list="driverNames"')}</td>
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
      <aside class="rail">${railDrivers()}${railCars(use)}</aside>
      <table class="grid">
        <thead><tr><th>Route</th><th>Driver</th><th>Car</th><th>Position</th><th>Round</th><th></th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${renderTemplates()}`;
}

/* ---------- day templates ----------
   The plan that gets made again: Monday's routes, the weekend's. A template is
   the route list as it stands minus the date, kept on this PC — it travels
   between the two managers in the exported JSON file, never in a share code. */
function renderTemplates() {
  const shelf = state.templates.map((t) => `<div class="tpl">
      ${actBtn('ask-template', 'template', t.id, esc(t.name), 'primary-ish', 'title="Put this template back over the plan"')}
      <span class="rail-count">${t.routes.length} route${t.routes.length === 1 ? '' : 's'}</span>
      <select data-kind="template" data-id="${esc(t.id)}" data-field="weekday" title="Offer this template when the app is opened on that day">
        <option value="">Never offer it</option>
        ${WEEKDAYS.map((d, n) => `<option value="${n}" ${t.weekday === String(n) ? 'selected' : ''}>On ${d}s</option>`).join('')}
      </select>
      ${actBtn('del', 'template', t.id, armed === `del:${t.id}` ? 'Sure?' : '✕', armed === `del:${t.id}` ? 'armed' : '', 'title="Delete this template"')}
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
  const cards = state.driverGroups.map((g) => {
    const members = state.drivers.map((d) =>
      `<button class="chip ${g.driverIds.includes(d.id) ? 'on' : ''}" style="--c:var(--steel)" data-act="group-member" data-kind="driverGroup" data-id="${esc(g.id)}" data-driver="${esc(d.id)}">${esc(d.name)}</button>`).join('');
    return `<div class="group">
      <div class="bar">
        ${field('driverGroup', g.id, 'name', g.name, 'style="width:180px"')}
        ${actBtn('apply-group', 'driverGroup', g.id, 'Use for today', 'primary-ish', 'title="Set who is in today to this group"')}
        ${moveDel('driverGroup', g.id)}
      </div>
      ${state.drivers.length ? `<div class="chips">${members}</div>` : '<p class="hint" style="margin:0">Add drivers above, then tick them into this group.</p>'}
    </div>`;
  }).join('');
  return `<h2 style="margin-top:22px">Day groups</h2>
    <p class="hint">A group is a set of names you use again \u2014 a Monday crew, a weekend crew. "Use for today" makes exactly those drivers the ones in today; everyone else goes to away.</p>
    <div class="bar">
      <input id="newGroup" type="text" placeholder="Group name, e.g. Monday">
      <button class="btn" data-act="add-group">+ Add group</button>
    </div>
    ${cards || '<p class="empty">No groups yet. Make one for the crew you plan with most \u2014 it takes one click to put them all in.</p>'}`;
}

/* The roster as suggestions, never as a rulebook: the day plan's driver box
   stays free text, so everyone is offered, away or not. */
function renderDriverList() {
  $('#driverNames').innerHTML = state.drivers.map((d) => `<option value="${esc(d.name)}"></option>`).join('');
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
      <input id="newPos" type="text" placeholder="Name, e.g. Spot 6/1 or Port 3">
      <button class="btn" data-act="add-position">+ Add position</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Sharing</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLabels() {
  const rows = state.labels.map((l) => `<tr>
    <td>${field('label', l.id, 'name', l.name)}</td>
    <td><input type="color" data-kind="label" data-id="${esc(l.id)}" data-field="color" value="${esc(l.color)}"></td>
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
  const rows = list.map((b, i) => `<tr>
      <td>${esc(when(b.t))}</td>
      <td>${esc(b.label)}</td>
      <td>${JSON.parse(b.json).routes.length} routes, ${JSON.parse(b.json).cars.length} cars</td>
      <td class="btns">${actBtn('restore', 'backup', String(i), armed === `restore:${i}` ? 'Sure?' : 'Restore', armed === `restore:${i}` ? 'armed' : '')}</td>
    </tr>`).join('');

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
  $('#notices').innerHTML = notices.map((n, i) =>
    `<div class="notice ${n.kind}">${esc(n.text)}${n.offer
      ? actBtn(n.offer.act, n.offer.kind, n.offer.id, esc(n.offer.text), 'primary-ish')
      : ''}<button class="btn" data-act="dismiss" data-index="${i}" title="Dismiss">\u2715</button></div>`).join('');

  const asking = notices.findIndex((n) => n.offer);
  if (offerRaised && asking >= 0) {
    offerRaised = false;
    // 'nearest' so a question already on screen does not scroll the plan away.
    $('#notices').children[asking]?.scrollIntoView({ block: 'nearest' });
  }
}

/* The paper list on the pillar has four columns and has to keep them, so the
   round travels inside the packing cell: "Spot 1/1 · 2". */
const spotCell = (r) => [byId(state.positions, r.positionId)?.name, String(r.round || '').trim()].filter(Boolean).join(' \u00b7 ');

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
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  document.body.classList.toggle('show-sheet', tab === 'preview');
  renderPlan(); renderDrivers(); renderDriverList(); renderCars(); renderPositions(); renderLabels(); renderData(); renderShare(); renderSheet();
  queueQr();
  renderNotices();
}

/* ---------- events ---------- */
// Typing updates state without a full re-render (keeps focus); selects/checkboxes re-render.
document.addEventListener('input', (e) => {
  const el = e.target;
  const { kind, id, field: name } = el.dataset;
  if (!kind || !name) return;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  // A round feeds the clash rule, so one keystroke in it can turn a warning on
  // or off; a driver's name is what the rail matches a roster entry against,
  // so one keystroke there moves someone between Free and a route number.
  // Remember how both read before the change, to spot either.
  const watched = kind === 'route' && (name === 'round' || name === 'driver');
  const before = watched ? liveSig() : null;
  if (kind === 'meta') state[name] = value;
  else {
    const item = byId(listFor(kind) || [], id);
    if (!item) return;
    item[name] = value;
  }
  save();
  if (el.tagName === 'SELECT' || el.type === 'checkbox') render();
  else if (before !== null && liveSig() !== before) redrawKeepingCaret(el);
  else renderSheet();
});

/* Redraw the lot without interrupting the typing that caused it: render()
   replaces the very field being typed into, so the caret goes back afterwards.

   Waiting for the field to be left instead would be simpler and is wrong: the
   browser blurs on mousedown, so the redraw lands between mousedown and mouseup
   and the click that ended the edit is swallowed — measured, not guessed. */
function redrawKeepingCaret(el) {
  const { kind, id, field: name } = el.dataset;
  const at = el.selectionStart;
  render();
  const again = document.querySelector(`[data-kind="${kind}"][data-id="${CSS.escape(id)}"][data-field="${name}"]`);
  if (!again) return;
  again.focus();
  again.setSelectionRange(at, at);
}

function confirmTwice(key) {
  if (armed === key) { armed = null; return true; }
  armed = key;
  render();
  setTimeout(() => { if (armed === key) { armed = null; render(); } }, 3000);
  return false;
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

function openShare(share) {
  pending = { share, mode: Array.isArray(share.c) ? 'day' : 'day', addMissing: true };
  renderShareDialog();
}

/* Data-tab actions. These await pickers and disk writes, so they sit outside
   the synchronous switch below. */
async function dataAction(act, b) {
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
      if (!confirmTwice(`restore:${i}`)) return;
      const entry = Store.backups()[i];
      if (!entry) break;
      Store.snapshot(state, 'Restoring a backup');
      state = Store.restore(entry, defaults);
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
let offerRaised = false;

const note = (kind, text, offer = null) => {
  notices = notices.filter((n) => n.text !== text);
  notices.push({ kind, text, offer });
  if (offer) offerRaised = true;
};

/* One live offer at a time: asking about Tuesday takes Monday's question away
   rather than leaving two questions on screen that answer each other. */
const dropOffers = () => { notices = notices.filter((n) => !n.offer); };

/* The confirmation for the only destructive action a click from the day plan.
   It is a notice rather than a dialog because there is room here to say what
   is about to be replaced in words — and because the weekday offer needs a
   notice anyway, so both ways in end at the same question and the same load. */
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
  if (!b) return;
  const { act, kind, id } = b.dataset;
  if (SHARE_ACTS.has(act)) { shareAction(act, b); return; }
  if (DATA_ACTS.has(act)) { dataAction(act, b); return; }
  const list = listFor(kind);
  const i = list ? list.findIndex((x) => x.id === id) : -1;

  switch (act) {
    case 'tab': tab = b.dataset.tab; break;
    case 'print': doPrint(); return;
    case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
    case 'down': if (i >= 0 && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
    case 'toggle': list[i][b.dataset.field] = !list[i][b.dataset.field]; break;
    case 'setLabel': list[i].labelId = b.dataset.label; break;
    case 'del':
      if (!confirmTwice(`del:${id}`)) return;
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
      if (!confirmTwice('clear')) return;
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
      if (!addFromInput('#newCar', (v) => v.toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((reg) => {
        if (!state.cars.some((c) => c.reg === reg)) state.cars.push({ id: uid(), reg, labelId: '', note: '' });
      }))) return;
      break;
    case 'add-driver':
      // Commas and newlines only: a driver's name has spaces in it, unlike a
      // registration, so splitting on whitespace would make two of everyone.
      if (!addFromInput('#newDriver', (v) => v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach((name) => {
        if (!state.drivers.some((d) => fold(d.name) === fold(name))) state.drivers.push({ id: uid(), name, available: true });
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
    case 'load-template': {
      const t = list[i];
      Store.snapshot(state, `Loading the ${t.name} template`);
      // Ids are minted here rather than stored, so loading the same template
      // twice cannot leave two rows sharing one id and editing as one.
      state.routes = t.routes.map((r) => ({ id: uid(), ...r }));
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
    case 'apply-group': {
      const g = list[i];
      // A write across the whole roster, not an addition: picking Monday has
      // to take yesterday's leftovers out, or "who is in today" is a lie by
      // the end of the week.
      state.drivers.forEach((d) => { d.available = g.driverIds.includes(d.id); });
      const inToday = state.drivers.filter((d) => d.available).length;
      note('info', `${g.name.trim() || 'That group'}: ${inToday} driver${inToday === 1 ? '' : 's'} in today, ${state.drivers.length - inToday} away.`);
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
  const act = map[e.target.id];
  if (act) document.querySelector(`[data-act="${act}"]`).click();
});

const SHARE_ACTS = new Set(['share-make', 'share-link', 'share-read', 'share-apply', 'share-cancel']);
const DATA_ACTS = new Set(['link-file', 'reconnect-file', 'unlink-file', 'open-file', 'export', 'import', 'restore', 'dismiss']);

async function start() {
  state = await Store.init(defaults, render);
  // A browser with no data of its own but a linked file (new PC, cleared
  // profile, different Windows user) should come back to what is in the file.
  if (!Store.hasUsableLocalData()) {
    const fromFile = await Store.recoverFromFile(defaults);
    if (fromFile) { state = fromFile; note('info', `Loaded your data from ${Store.file.name}.`); }
  }
  notices = notices.concat(Store.takeNotices());
  Store.dailySnapshot(state);
  // An offer, never an application: this only ever adds a notice with a button
  // in it, and that button asks the same question the shelf asks.
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
