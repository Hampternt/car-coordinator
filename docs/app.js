'use strict';

const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const byId = (arr, id) => arr.find((x) => x.id === id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function newRoute(name, gapBefore = false) {
  return { id: uid(), name, driver: '', carId: '', positionId: '', highlight: false, gapBefore };
}

function defaults() {
  const pos = (name) => ({ id: uid(), name, multi: name === 'Garage', labelId: '', note: '' });
  return {
    schemaVersion: Store.SCHEMA,
    date: today(),
    positions: ['Spot 1/1', 'Spot 1/2', 'Spot 2/1', 'Spot 2/2', 'Spot 3/1', 'Spot 3/2',
      'Spot 4/1', 'Spot 5/1', 'Garage'].map(pos),
    labels: [
      { id: uid(), name: 'Out of service', color: '#c62828' },
      { id: uid(), name: 'Unavailable', color: '#ef6c00' },
      { id: uid(), name: 'Workshop', color: '#6a1b9a' },
    ],
    cars: [],
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

const listFor = (kind) => ({ route: state.routes, car: state.cars, position: state.positions, label: state.labels })[kind];

/* ---------- small html helpers ---------- */
const field = (kind, id, name, value, extra = '') =>
  `<input type="text" data-kind="${kind}" data-id="${id}" data-field="${name}" value="${esc(value)}" ${extra}>`;
const actBtn = (act, kind, id, text, cls = '', extra = '') =>
  `<button class="btn ${cls}" data-act="${act}" data-kind="${kind}" data-id="${id}" ${extra}>${text}</button>`;
const moveDel = (kind, id) =>
  actBtn('up', kind, id, '↑', '', 'title="Move up"') +
  actBtn('down', kind, id, '↓', '', 'title="Move down"') +
  actBtn('del', kind, id, armed === `del:${id}` ? 'Sure?' : '✕', armed === `del:${id}` ? 'armed' : '', 'title="Delete"');

function labelChips(kind, item) {
  const ok = `<button class="chip ok ${item.labelId ? '' : 'on'}" data-act="setLabel" data-kind="${kind}" data-id="${item.id}" data-label="">OK</button>`;
  return ok + state.labels.map((l) =>
    `<button class="chip ${item.labelId === l.id ? 'on' : ''}" style="--c:${esc(l.color)}" data-act="setLabel" data-kind="${kind}" data-id="${item.id}" data-label="${l.id}">${esc(l.name)}</button>`
  ).join('');
}

function usage() {
  const cars = {}, pos = {};
  for (const r of state.routes) {
    if (r.carId) (cars[r.carId] ??= []).push(r);
    if (r.positionId) (pos[r.positionId] ??= []).push(r);
  }
  return { cars, pos };
}

/* ---------- views ---------- */
function renderPlan() {
  const use = usage();
  const rows = state.routes.map((r) => {
    const warns = [];
    const carOpts = state.cars.map((c) => {
      const lab = byId(state.labels, c.labelId);
      const others = (use.cars[c.id] || []).filter((x) => x.id !== r.id);
      const note = lab ? ` (${lab.name})` : others.length ? ` (route ${others.map((o) => o.name).join(', ')})` : '';
      const sel = c.id === r.carId;
      if (sel && lab) warns.push(`${c.reg} is marked ${lab.name}`);
      if (sel && others.length) warns.push(`${c.reg} also on route ${others.map((o) => o.name).join(', ')}`);
      return `<option value="${c.id}" ${sel ? 'selected' : ''} ${!sel && (lab || others.length) ? 'disabled' : ''}>${esc(c.reg + note)}</option>`;
    }).join('');
    const posOpts = state.positions.map((p) => {
      const lab = byId(state.labels, p.labelId);
      const others = p.multi ? [] : (use.pos[p.id] || []).filter((x) => x.id !== r.id);
      const note = lab ? ` (${lab.name})` : others.length ? ` (route ${others.map((o) => o.name).join(', ')})` : '';
      const sel = p.id === r.positionId;
      if (sel && lab) warns.push(`${p.name} is marked ${lab.name}`);
      if (sel && others.length) warns.push(`${p.name} also used by route ${others.map((o) => o.name).join(', ')}`);
      return `<option value="${p.id}" ${sel ? 'selected' : ''} ${!sel && (lab || others.length) ? 'disabled' : ''}>${esc(p.name + note)}</option>`;
    }).join('');
    const cls = [r.highlight && 'hl', r.gapBefore && 'gap', warns.length && 'warn'].filter(Boolean).join(' ');
    return `<tr class="${cls}">
      <td>${field('route', r.id, 'name', r.name, 'class="short"')}</td>
      <td>${field('route', r.id, 'driver', r.driver, 'placeholder="-"')}</td>
      <td><select data-kind="route" data-id="${r.id}" data-field="carId"><option value="">-</option>${carOpts}</select></td>
      <td><select data-kind="route" data-id="${r.id}" data-field="positionId"><option value="">-</option>${posOpts}</select></td>
      <td class="btns">
        ${actBtn('toggle', 'route', r.id, 'Mark', r.highlight ? 'on' : '', 'data-field="highlight" title="Pink highlight on the printout"')}
        ${actBtn('toggle', 'route', r.id, 'Gap', r.gapBefore ? 'on' : '', 'data-field="gapBefore" title="Blank line above this route"')}
        ${moveDel('route', r.id)}
      </td>
      <td class="warntext">${esc(warns.join('; '))}</td>
    </tr>`;
  }).join('');

  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]);
  const down = state.cars.filter((c) => c.labelId);
  const tag = (c) => {
    const l = byId(state.labels, c.labelId);
    return `<span class="tag" style="--c:${esc(l ? l.color : '#2e7d32')}">${esc(c.reg)}${l ? ' · ' + esc(l.name) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span>`;
  };

  const noCars = state.cars.length
    ? ''
    : `<p class="empty">No cars yet. Add your registrations on the <b>Cars</b> tab and they become pickable here.</p>`;

  $('#tab-plan').innerHTML = `
    ${noCars}
    <div class="bar">
      <label for="date">Date</label>
      <input id="date" type="date" data-kind="meta" data-field="date" value="${esc(state.date)}">
      <button class="btn" data-act="add-route">+ Add route</button>
      <button class="btn ${armed === 'clear' ? 'armed' : ''}" data-act="clear-day">${armed === 'clear' ? 'Sure? Click again' : 'Clear drivers, cars and positions'}</button>
    </div>
    <table class="grid">
      <thead><tr><th>Route</th><th>Driver</th><th>Car</th><th>Packing round</th><th></th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pool">
      <div><h3>Free cars (${free.length})</h3>${free.map(tag).join('') || '<em>None</em>'}</div>
      <div><h3>Not available (${down.length})</h3>${down.map(tag).join('') || '<em>None</em>'}</div>
    </div>`;
}

function assignCell(routes) {
  if (!routes) return '<span class="assign none">Not assigned</span>';
  return routes.map((r) => {
    const pos = byId(state.positions, r.positionId)?.name;
    return `<span class="assign yes">Route ${esc(r.name)}${r.driver ? ', ' + esc(r.driver) : ''}${pos ? ', ' + esc(pos) : ''}</span>`;
  }).join('');
}

function renderCars() {
  const use = usage();
  const onRoute = state.cars.filter((c) => use.cars[c.id]).length;
  const down = state.cars.filter((c) => c.labelId).length;
  const free = state.cars.filter((c) => !c.labelId && !use.cars[c.id]).length;
  const rows = state.cars.map((c) => `<tr class="${use.cars[c.id] ? 'assigned' : ''}">
    <td>${field('car', c.id, 'reg', c.reg, 'class="short" style="width:110px"')}</td>
    <td>${assignCell(use.cars[c.id])}</td>
    <td>${labelChips('car', c)}</td>
    <td>${field('car', c.id, 'note', c.note, 'placeholder="Note (e.g. back Friday)"')}</td>
    <td class="btns">${moveDel('car', c.id)}</td></tr>`).join('');
  $('#tab-cars').innerHTML = `
    <h2>Cars</h2>
    <p class="hint">Click a label to mark a car. Marked cars can't be picked in the day plan and are listed on the printout.</p>
    <p class="counts"><span class="assign yes">${onRoute} on a route</span><span class="assign none">${free} free</span><span class="assign down">${down} not available</span></p>
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
    <td><label><input type="checkbox" data-kind="position" data-id="${p.id}" data-field="multi" ${p.multi ? 'checked' : ''}> Many cars</label></td>
    <td>${labelChips('position', p)}</td>
    <td>${field('position', p.id, 'note', p.note, 'placeholder="Note"')}</td>
    <td class="btns">${moveDel('position', p.id)}</td></tr>`).join('');
  $('#tab-positions').innerHTML = `
    <h2>Positions</h2>
    <p class="hint">Packing spots, garage, ports. "Many cars" lets several routes share it (like Garage).</p>
    <div class="bar">
      <input id="newPos" type="text" placeholder="Name, e.g. Spot 6/1 or Port 3">
      <button class="btn" data-act="add-position">+ Add position</button>
    </div>
    <table class="grid"><thead><tr><th>Name</th><th>Sharing</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLabels() {
  const rows = state.labels.map((l) => `<tr>
    <td>${field('label', l.id, 'name', l.name)}</td>
    <td><input type="color" data-kind="label" data-id="${l.id}" data-field="color" value="${esc(l.color)}"></td>
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
    `<div class="notice ${n.kind}">${esc(n.text)}<button class="btn" data-act="dismiss" data-index="${i}" title="Dismiss">\u2715</button></div>`).join('');
}

function renderSheet() {
  const [y, m, d] = (state.date || today()).split('-');
  const dash = (v) => esc(v) || '-';
  const rows = state.routes.map((r) =>
    (r.gapBefore ? '<tr class="spacer"><td colspan="4"></td></tr>' : '') +
    `<tr class="${r.highlight ? 'hl' : ''}">
      <td class="rn">${dash(r.name)}</td>
      <td>${dash(r.driver)}</td>
      <td>${dash(byId(state.cars, r.carId)?.reg)}</td>
      <td>${dash(byId(state.positions, r.positionId)?.name)}</td>
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
    <div class="extra">
      ${downCars ? `<h4>Cars not available</h4>${downCars}` : ''}
      ${downPos ? `<h4>Positions not available</h4>${downPos}` : ''}
      ${free ? `<h4>Free cars</h4><p>${free}</p>` : ''}
    </div>`;
}

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  document.body.classList.toggle('show-sheet', tab === 'preview');
  renderPlan(); renderCars(); renderPositions(); renderLabels(); renderData(); renderSheet();
  renderNotices();
}

/* ---------- events ---------- */
// Typing updates state without a full re-render (keeps focus); selects/checkboxes re-render.
document.addEventListener('input', (e) => {
  const el = e.target;
  const { kind, id, field: name } = el.dataset;
  if (!kind || !name) return;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (kind === 'meta') state[name] = value;
  else {
    const item = byId(listFor(kind) || [], id);
    if (!item) return;
    item[name] = value;
  }
  save();
  if (el.tagName === 'SELECT' || el.type === 'checkbox') render(); else renderSheet();
});

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
  renderSheet();
  try {
    if (window.__TAURI__?.core) { await window.__TAURI__.core.invoke('print_page'); return; }
  } catch (err) { console.warn('native print failed, using window.print()', err); }
  window.print();
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

const note = (kind, text) => {
  notices = notices.filter((n) => n.text !== text);
  notices.push({ kind, text });
};

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
      Store.snapshot(state, `Deleting a ${kind}`);
      list.splice(i, 1);
      if (kind === 'car') state.routes.forEach((r) => { if (r.carId === id) r.carId = ''; });
      if (kind === 'position') state.routes.forEach((r) => { if (r.positionId === id) r.positionId = ''; });
      if (kind === 'label') [...state.cars, ...state.positions].forEach((x) => { if (x.labelId === id) x.labelId = ''; });
      break;
    case 'clear-day':
      if (!confirmTwice('clear')) return;
      Store.snapshot(state, 'Clearing the day');
      state.routes.forEach((r) => { r.driver = ''; r.carId = ''; r.positionId = ''; r.highlight = false; });
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
  const map = { newCar: 'add-car', newPos: 'add-position', newLabel: 'add-label' };
  const act = map[e.target.id];
  if (act) document.querySelector(`[data-act="${act}"]`).click();
});

const DATA_ACTS = new Set(['link-file', 'reconnect-file', 'unlink-file', 'open-file', 'export', 'import', 'restore', 'dismiss']);

async function start() {
  state = await Store.init(defaults, render);
  // A browser with no data of its own but a linked file (new PC, cleared
  // profile, different Windows user) should come back to what is in the file.
  if (!Store.hadLocalData()) {
    const fromFile = await Store.recoverFromFile(defaults);
    if (fromFile) { state = fromFile; note('info', `Loaded your data from ${Store.file.name}.`); }
  }
  notices = notices.concat(Store.takeNotices());
  Store.dailySnapshot(state);
  render();
}

start();
