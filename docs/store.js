'use strict';
/* Storage: validation, rolling backups, and an optional auto-saved file.
   Nothing here talks to the network. Exposed as window.Store. */

const Store = (() => {
  const KEY = 'carcoord:v1';
  const BACKUP_KEY = 'carcoord:backups';
  const MAX_BACKUPS = 12;
  const SCHEMA = 4;
  const FILE_DEBOUNCE = 800;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
  const bool = (v) => v === true;

  /* ---------- validation ----------
     localStorage can hold anything: a half-written blob, data from an older
     build, or something a newer build wrote. Rather than trusting it and
     crashing on the first render, coerce it into a shape the UI can draw. */

  function normalise(raw, defaults) {
    // Three different cases, and conflating any two of them loses data:
    // nothing saved yet (a first run, say nothing), something saved that we
    // cannot use (say so loudly, and do NOT let it stand in for real data),
    // and something usable (repair what needs it).
    if (raw === null || raw === undefined) return { state: defaults(), repaired: [], usable: false };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { state: defaults(), repaired: ['the saved data was not a Car Coordinator plan'], usable: false };
    }
    const repaired = [];
    const arr = (v, what) => {
      if (Array.isArray(v)) return v;
      if (v !== undefined) repaired.push(`${what} was not a list`);
      return [];
    };

    const labels = arr(raw.labels, 'labels')
      .filter((l) => l && typeof l === 'object')
      .map((l) => ({ id: str(l.id) || uid(), name: str(l.name, 'Label'), color: /^#[0-9a-f]{6}$/i.test(str(l.color)) ? l.color : '#c62828' }));

    const cars = arr(raw.cars, 'cars')
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({ id: str(c.id) || uid(), reg: str(c.reg), labelId: str(c.labelId), note: str(c.note) }))
      .filter((c) => c.reg);

    const positions = arr(raw.positions, 'positions')
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ id: str(p.id) || uid(), name: str(p.name), multi: bool(p.multi), labelId: str(p.labelId), note: str(p.note) }))
      .filter((p) => p.name);

    const routes = arr(raw.routes, 'routes')
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        id: str(r.id) || uid(), name: str(r.name), driver: str(r.driver),
        carId: str(r.carId), positionId: str(r.positionId), round: str(r.round),
        highlight: bool(r.highlight), gapBefore: bool(r.gapBefore),
      }));

    // The roster: who drives, kept apart from the day plan because it outlives
    // any one day. `available` is who is in today, so a driver saved before
    // that field existed counts as available rather than silently vanishing
    // from the rail.
    const drivers = arr(raw.drivers, 'drivers')
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({
        id: str(d.id) || uid(), name: str(d.name),
        available: d.available === undefined ? true : bool(d.available),
        // A driver carries a status the same way a car does — on holiday, on
        // a course, new and not yet cleared for the long routes. The labels
        // are the same list, because a warehouse has one vocabulary for
        // "why is this not usable today" and it should not fork by kind.
        labelId: str(d.labelId), note: str(d.note),
      }))
      .filter((d) => d.name);

    // A group is a named set of drivers ("Monday"), nothing more: it holds
    // ids, and the names stay on the roster so renaming a driver reaches
    // every group at once.
    const driverGroups = arr(raw.driverGroups, 'driverGroups')
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({
        id: str(g.id) || uid(), name: str(g.name),
        driverIds: arr(g.driverIds, 'the drivers in a group').map((x) => str(x)).filter(Boolean),
      }))
      .filter((g) => g.name);

    // A day template is a route list worth planning again — Monday's plan, the
    // weekend's. It carries no date: loading one fills in the day you are on.
    // Its routes carry no id either, because a template is a copy to mint
    // routes from rather than the routes themselves; ids are minted on load.
    const templates = arr(raw.templates, 'templates')
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({
        id: str(t.id) || uid(), name: str(t.name),
        // '' is "no day", and it is what every template starts as: nothing here
        // applies itself by the calendar until a weekday is chosen for it.
        weekday: /^[0-6]$/.test(str(t.weekday)) ? t.weekday : '',
        routes: arr(t.routes, 'the routes in a template')
          .filter((r) => r && typeof r === 'object')
          .map((r) => ({
            name: str(r.name), driver: str(r.driver), carId: str(r.carId),
            positionId: str(r.positionId), round: str(r.round),
            highlight: bool(r.highlight), gapBefore: bool(r.gapBefore),
          })),
      }))
      .filter((t) => t.name);

    // Drop references to things that no longer exist, so the UI never has to
    // guess what a dangling id meant.
    const has = (list, id) => !id || list.some((x) => x.id === id);
    for (const c of cars) if (!has(labels, c.labelId)) { c.labelId = ''; repaired.push(`${c.reg} pointed at a missing label`); }
    for (const p of positions) if (!has(labels, p.labelId)) { p.labelId = ''; repaired.push(`${p.name} pointed at a missing label`); }
    for (const d of drivers) if (!has(labels, d.labelId)) { d.labelId = ''; repaired.push(`${d.name} pointed at a missing label`); }
    for (const r of routes) {
      if (!has(cars, r.carId)) { r.carId = ''; repaired.push(`route ${r.name} pointed at a missing car`); }
      if (!has(positions, r.positionId)) { r.positionId = ''; repaired.push(`route ${r.name} pointed at a missing position`); }
    }
    for (const g of driverGroups) {
      const onRoster = g.driverIds.filter((id) => drivers.some((d) => d.id === id));
      if (onRoster.length !== g.driverIds.length) repaired.push(`the ${g.name} group listed a driver who is no longer on the roster`);
      g.driverIds = onRoster;
    }
    for (const t of templates) {
      const lost = { car: 0, position: 0 };
      for (const r of t.routes) {
        if (!has(cars, r.carId)) { r.carId = ''; lost.car++; }
        if (!has(positions, r.positionId)) { r.positionId = ''; lost.position++; }
      }
      // One line per template, not one per route: a template built when the
      // fleet was different would otherwise fill the notice with the same
      // sentence fifteen times over.
      const gone = (n, what) => `the ${t.name} template pointed at ${n === 1 ? `a ${what} that is gone` : `${n} ${what}s that are gone`}`;
      if (lost.car) repaired.push(gone(lost.car, 'car'));
      if (lost.position) repaired.push(gone(lost.position, 'position'));
    }

    const date = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.date)) ? raw.date : defaults().date;
    if (date !== raw.date && raw.date !== undefined) repaired.push('date was not a valid day');
    const qrOnSheet = raw.qrOnSheet === undefined ? true : bool(raw.qrOnSheet);

    return { state: { schemaVersion: SCHEMA, date, qrOnSheet, positions, labels, cars, routes, drivers, driverGroups, templates }, repaired, usable: true };
  }

  /* ---------- versioning ---------- */
  let notices = [];
  const takeNotices = () => { const n = notices; notices = []; return n; };

  function migrate(raw, defaults) {
    const v = raw && typeof raw === 'object' ? Number(raw.schemaVersion) || 0 : 0;
    if (v > SCHEMA) {
      // Written by a newer build. Load it anyway (fields we know still work),
      // but say so, because saving will drop whatever we did not understand.
      notices.push({ kind: 'warn', text: 'This data was saved by a newer version of Car Coordinator. Anything that version added will be lost once you make a change here.' });
    }
    // v0 (no schemaVersion), v1 (no round, no roster) and v2 (no templates)
    // use the same field names for everything they do have, so normalise
    // covers them all: what they never wrote comes back as its default.
    //
    // Templates bumped this to v3. Not because loading needs it — v2 data
    // loads fine either way — but because of the other direction: the two
    // managers swap JSON files, so a build from before templates will meet one
    // that has them. Without the bump it drops them on the first change and
    // says nothing; with it, the v > SCHEMA branch above speaks up first.
    //
    // v4 is a driver's own status and note, and it is the same argument: a
    // build without them meeting a roster that has them would drop what the
    // other manager typed without a word.
    return normalise(raw, defaults);
  }

  /* ---------- per-browser preferences ----------
     What belongs to this browser rather than to the plan: which update note
     it has shown, whether the save file has to be read before it is written.
     Kept under carcoord:pref:, never on the plan, so none of it travels into
     Export, the save file, backups or share codes. Every access is wrapped,
     so a browser that refuses storage still starts. */
  const PREF = 'carcoord:pref:';
  // undefined when storage cannot be read at all, which is not the same as
  // never set (null): a caller that must fail closed can tell them apart.
  function pref(name) {
    try { return localStorage.getItem(PREF + name); } catch { return undefined; }
  }
  // null removes it. Returns whether storage took the change.
  function setPref(name, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(PREF + name);
      else localStorage.setItem(PREF + name, String(value));
      return true;
    } catch { return false; }
  }

  /* ---------- localStorage ---------- */
  let localUsable = false;
  // The saved text exactly as this load found it, so the update archive can
  // keep it byte for byte, and whether this load was one the update note must
  // wait out: unreadable, or written by a newer version. Both describe the
  // load only; an import later on changes neither.
  let localText = null;
  let trouble = false;
  let appVersion = null;

  function readLocal(defaults) {
    let raw = null;
    let text = null;
    let unreadable = false;
    try { text = localStorage.getItem(KEY); raw = JSON.parse(text); } catch { unreadable = true; }
    localText = text;
    const { state, repaired, usable } = migrate(raw, defaults);
    localUsable = usable;
    trouble = !!raw && typeof raw === 'object' && (Number(raw.schemaVersion) || 0) > SCHEMA;
    if (unreadable || (!usable && text !== null)) {
      trouble = true;
      notices.push({ kind: 'warn', text: 'The data saved in this browser could not be read, so the plan on screen started empty. Check Backups below, or your save file, before typing anything \u2014 the first change you make will overwrite it.' });
    } else if (repaired.length) {
      notices.push({ kind: 'info', text: `Repaired saved data: ${repaired.slice(0, 3).join('; ')}${repaired.length > 3 ? `; and ${repaired.length - 3} more` : ''}.` });
    }
    return state;
  }

  function writeLocal(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      notices.push({ kind: 'warn', text: 'Could not save to this browser (storage may be full). Use Export to keep a copy.' });
      console.error('localStorage save failed', e);
      return false;
    }
  }

  /* ---------- rolling backups ----------
     Cheap insurance against a mis-clicked "Clear" or delete. Kept separate
     from the live key so a corrupt save cannot take the history with it. */

  function backups() {
    try {
      const list = JSON.parse(localStorage.getItem(BACKUP_KEY));
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  // Returns whether the plan is now in Backups: true when it was written, and
  // true when it was skipped because the newest entry already holds exactly
  // it; false only when storage is full and nothing could be stored. A caller
  // about to overwrite something checks this before it goes ahead.
  function snapshot(state, label) {
    const list = backups();
    const entry = { t: new Date().toISOString(), label, json: JSON.stringify(state) };
    // Skip a snapshot identical to the newest one (nothing actually changed).
    if (list[0] && list[0].json === entry.json) return true;
    list.unshift(entry);
    while (list.length > MAX_BACKUPS) list.pop();
    // Storage can be full, and dropping the oldest entries is worth nothing
    // unless the write is tried again afterwards. Every destructive action in
    // the app promises "a backup is taken first", so a snapshot that fails
    // quietly turns that promise into a lie: trim until it fits, and if it
    // never does, leave the backups already stored alone and say so.
    while (list.length) {
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list)); return true; } catch { list.pop(); }
    }
    notices.push({ kind: 'warn', text: `Could not take a backup before "${label}" \u2014 this browser's storage is full. Export a copy from the Data tab before you go any further.` });
    return false;
  }

  function dailySnapshot(state) {
    const today = new Date().toISOString().slice(0, 10);
    if (backups().some((b) => b.t.slice(0, 10) === today && b.label === 'Start of day')) return;
    snapshot(state, 'Start of day');
  }

  // Returns null rather than throwing: a backup written by a half-finished
  // save is exactly the case this list exists for, and the tab that lists it
  // must stay usable so the one beside it can be restored instead.
  function restore(entry, defaults) {
    try { return migrate(JSON.parse(entry.json), defaults).state; }
    catch {
      notices.push({ kind: 'warn', text: 'That backup could not be read \u2014 it was only half written. Try the one above or below it.' });
      return null;
    }
  }

  /* ---------- IndexedDB (one key: the save-file handle) ---------- */
  /* Every path out of here has to resolve. init() awaits this before the first
     render, so a promise left pending is not a lost file handle — it is an app
     that never finishes starting, on a blank page, with no way to say why.
     A missing object store throws on .get(), another tab holding an older
     version fires onblocked and nothing else, and neither used to resolve. */
  function idb(fn) {
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(guard); resolve(v); };
      const guard = setTimeout(() => resolve(undefined), 4000);
      let req;
      try { req = indexedDB.open('carcoord', 1); } catch { return done(undefined); }
      req.onupgradeneeded = () => { try { req.result.createObjectStore('kv'); } catch { /* already there */ } };
      req.onerror = () => done(undefined);
      req.onblocked = () => done(undefined);
      req.onsuccess = () => {
        const db = req.result;
        let tx, out;
        try {
          tx = db.transaction('kv', 'readwrite');
          out = fn(tx.objectStore('kv'));
        } catch { db.close(); return done(undefined); }
        tx.oncomplete = () => { db.close(); done(out && out.result); };
        tx.onerror = () => { db.close(); done(undefined); };
        tx.onabort = () => { db.close(); done(undefined); };
      };
    });
  }
  const getHandle = () => idb((s) => s.get('fileHandle'));
  const putHandle = (h) => idb((s) => s.put(h, 'fileHandle'));
  const clearHandle = () => idb((s) => s.delete('fileHandle'));

  /* ---------- auto-saved file (File System Access API) ---------- */
  const fileSupported = () => typeof window.showSaveFilePicker === 'function';

  // `hold` stops every write to the file until the leader has answered for
  // it: { kind: 'differs', state, raw, modified, differ } when the file holds
  // a different plan from the screen, { kind: 'unreadable' } when it could not
  // be read, { kind: 'notPlan' } when it holds something that is not a plan.
  const file = { handle: null, name: '', permission: 'unsupported', lastSaved: null, error: '', hold: null };

  /* Whether the file has to be read before anything is written to it. Set on
     every load that finds no usable plan of this browser's own, because then
     the file may be the only good copy, and kept in storage rather than for
     this load only: typing a few names after a loss saves a small plan that
     the next load would otherwise take for this browser's own. Cleared only
     when the file and the screen have been brought together: a question
     answered, a file found empty or holding the same plan, a plan recovered
     from it, or a file linked, opened or let go. If it cannot be stored it
     holds in memory, which errs towards asking, and storage that cannot be
     read counts as set. A per-browser pref: carcoord:pref:fileNeedsCheck. */
  const CHECK = 'fileNeedsCheck';
  let checkThisSession = false;
  const needsCheck = () => {
    if (checkThisSession) return true;
    const v = pref(CHECK);
    return v === undefined || v === '1';
  };
  const markCheck = () => { if (!setPref(CHECK, '1')) checkThisSession = true; };
  const clearCheck = () => {
    checkThisSession = false;
    setPref(CHECK, null);   // a removal that fails leaves it set, which still asks
  };
  let pending = null;
  let timer = null;
  let onChange = () => {};

  async function permissionFor(handle, request) {
    if (!handle) return 'none';
    try {
      const opts = { mode: 'readwrite' };
      const q = await handle.queryPermission(opts);
      if (q === 'granted' || !request) return q;
      return await handle.requestPermission(opts);
    } catch { return 'denied'; }
  }

  async function writeFile(state) {
    if (!file.handle || file.permission !== 'granted' || file.hold) return;
    try {
      const w = await file.handle.createWritable();
      // A hold raised while the file was being opened wins over this write.
      if (file.hold) { try { await w.abort(); } catch { /* nothing was written */ } return; }
      await w.write(JSON.stringify(state, null, 2));
      await w.close();
      file.lastSaved = new Date();
      file.error = '';
    } catch (e) {
      // Typically the file was moved, or the drive went away.
      file.error = e && e.name === 'NotAllowedError' ? 'Permission to write the file was lost. Reconnect it.' : 'Could not write the file. It may have been moved or renamed.';
      file.permission = e && e.name === 'NotAllowedError' ? 'prompt' : file.permission;
      console.warn('file save failed', e);
    }
    onChange();
  }

  function queueFileWrite(state) {
    if (!file.handle) return;
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; const s = pending; pending = null; writeFile(s); }, FILE_DEBOUNCE);
  }

  // Returns the write, so a caller that says "written" can wait for it.
  function flush() {
    if (!timer) return Promise.resolve();
    clearTimeout(timer);
    timer = null;
    const s = pending;
    pending = null;
    return s ? writeFile(s) : Promise.resolve();
  }

  async function linkFile(state, defaults) {
    if (!fileSupported()) return false;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'car-coordinator.json',
        types: [{ description: 'Car Coordinator data', accept: { 'application/json': ['.json'] } }],
      });
      file.handle = handle;
      file.name = handle.name;
      file.hold = null;
      file.permission = await permissionFor(handle, true);
      await putHandle(handle);
      // The picker also offers files that already exist, and choosing one
      // replaces it: after a loss, that can be the only good copy. So it is
      // read first, as Reconnect reads, and a different plan in it raises the
      // same question. A new or empty file is simply written.
      if (file.permission === 'granted' && await reconcile(state, defaults, true)) await writeFile(state);
      return true;
    } catch { return false; } // user cancelled the picker
  }

  async function openFile() {
    if (typeof window.showOpenFilePicker !== 'function') return null;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Car Coordinator data', accept: { 'application/json': ['.json'] } }],
      });
      const text = await (await handle.getFile()).text();
      file.handle = handle;
      file.name = handle.name;
      file.hold = null;
      clearCheck();
      file.permission = await permissionFor(handle, true);
      await putHandle(handle);
      return text;
    } catch { return null; }
  }

  /* Reconnect writes what is on screen to the file, because this browser's
     own plan is the one being kept up to date. When the check marker is set,
     the file may be the only good copy, and the person most likely to press
     Reconnect is the one whose plan has gone missing: so the file is read
     first, and nothing is written unless it is empty or already holds the
     plan on screen. Otherwise a hold goes up and the Data tab asks. The
     permission is only recorded once that is settled, and anything queued
     from before is dropped (the screen is still in this browser), so no
     write can slip in while the file is being read. */
  async function reconnect(state, defaults) {
    clearTimeout(timer);
    timer = null;
    pending = null;
    // Held from the start, not cleared: an edit typed while the file is
    // being read must not reach it before the answer is known (Try again
    // runs this with the permission already granted).
    file.hold = { kind: 'checking' };
    const permission = await permissionFor(file.handle, true);
    const write = permission === 'granted' ? await reconcile(state, defaults) : false;
    if (permission !== 'granted') file.hold = null;
    file.permission = permission;
    if (write) await writeFile(state);
    onChange();
    return permission === 'granted';
  }

  // Whether the screen may now be written to the file; raises a hold when not.
  // A 'checking' hold covers the read itself, so nothing is written to the
  // file while its contents are still unknown.
  async function reconcile(state, defaults, always = false) {
    if (!always && !needsCheck()) { file.hold = null; return true; }
    file.hold = { kind: 'checking' };
    const found = await readFileState(defaults);
    if (found.empty) { file.hold = null; clearCheck(); return true; }
    if (found.kind) { file.hold = { kind: found.kind }; return false; }
    const onScreen = migrate(JSON.parse(JSON.stringify(state)), defaults).state;
    if (samePlan(found.state, onScreen)) { file.hold = null; clearCheck(); return false; }
    file.hold = { kind: 'differs', ...found, differ: routesDiffering(found.state, onScreen) };
    return false;
  }

  // The leader has answered the hold: the file and the screen are one again.
  function release() {
    file.hold = null;
    clearCheck();
  }

  async function unlink() {
    file.handle = null;
    file.name = '';
    file.permission = fileSupported() ? 'none' : 'unsupported';
    file.lastSaved = null;
    file.error = '';
    file.hold = null;
    clearCheck();
    await clearHandle();
    onChange();
  }

  /* ---------- browser storage persistence ---------- */
  const persistence = { state: 'unknown' };
  async function askPersist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) { persistence.state = 'unsupported'; return; }
      persistence.state = (await navigator.storage.persisted()) || (await navigator.storage.persist()) ? 'granted' : 'denied';
    } catch { persistence.state = 'unknown'; }
    onChange();
  }

  /* ---------- export / import ---------- */
  function download(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `car-coordinator-${state.date || 'data'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function parseImport(text, defaults) {
    let raw;
    try { raw = JSON.parse(text); } catch { return { error: 'That file is not Car Coordinator data (it is not valid JSON).' }; }
    if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.routes) && !Array.isArray(raw.cars))) {
      return { error: 'That file does not look like Car Coordinator data — no routes or cars in it.' };
    }
    const { state, repaired } = migrate(raw, defaults);
    return { state, repaired };
  }

  /* ---------- startup ---------- */
  // `version` is the running APP_VERSION, passed in rather than read from
  // app.js, so the Store never depends on which app.js it was paired with.
  async function init(defaults, changed, version) {
    onChange = changed || (() => {});
    appVersion = typeof version === 'string' ? version : null;
    const state = readLocal(defaults);
    if (!localUsable) markCheck();
    askPersist();

    const handle = await getHandle();
    if (handle) {
      file.handle = handle;
      file.name = handle.name || 'save file';
      file.permission = await permissionFor(handle, false);
      onChange();
    } else if (fileSupported()) {
      file.permission = 'none';
    }
    return state;
  }

  /* Read the linked file when this browser has nothing of its own — a new PC,
     a cleared profile, a different Windows user. A file that cannot be read
     is held, not written over: the plan on screen is only the defaults. */
  async function recoverFromFile(defaults) {
    if (!file.handle || file.permission !== 'granted') return null;
    file.hold = { kind: 'checking' };   // nothing typed meanwhile reaches it
    const found = await readFileState(defaults);
    file.hold = found.kind ? { kind: found.kind } : null;
    if (found.state || !found.kind) clearCheck();
    return found.state || null;
  }

  // At start-up, when this browser has a plan again but the marker says the
  // file was never checked against it, and the file can already be written:
  // check it now, before the first save reaches it.
  async function checkFileAtStart(state, defaults) {
    if (!file.handle || file.permission !== 'granted' || !needsCheck()) return;
    await reconcile(state, defaults);
    onChange();
  }

  /* What the linked file holds. Three answers, because they call for three
     different things: { empty: true } has nothing to lose; { kind:
     'unreadable' } or { kind: 'notPlan' } cannot be looked at, so must not
     be written over unasked; { state, raw, modified } is a plan, and raw
     keeps whatever a newer version put in it for the backup. */
  async function readFileState(defaults) {
    let f, text;
    try {
      f = await file.handle.getFile();
      text = await f.text();
    } catch { return { kind: 'unreadable' }; }
    if (!text.trim()) return { empty: true };
    let raw, state;
    try { raw = JSON.parse(text); ({ state } = parseImport(text, defaults)); } catch { return { kind: 'notPlan' }; }
    return state ? { state, raw, modified: f.lastModified } : { kind: 'notPlan' };
  }

  /* Two plans are the same when they read the same. Ids are random per PC and
     per fresh start, so every id is swapped for the name it stands for and
     the things' own ids are left out. Generic on purpose: a field a later
     version adds is compared without anyone having to list it here. */
  function readable(s) {
    const names = new Map();
    for (const [list, key] of [['cars', 'reg'], ['positions', 'name'], ['labels', 'name'], ['drivers', 'name']]) {
      for (const x of s[list] || []) names.set(x.id, `${list}:${x[key]}`);
    }
    return (v) => JSON.stringify(v, (k, x) => (k === 'id' ? undefined : typeof x === 'string' && names.has(x) ? names.get(x) : x));
  }
  const samePlan = (a, b) => readable(a)(a) === readable(b)(b);
  function routesDiffering(a, b) {
    const ra = readable(a), rb = readable(b);
    let n = 0;
    for (let i = 0; i < Math.max(a.routes.length, b.routes.length); i++) if (ra(a.routes[i]) !== rb(b.routes[i])) n++;
    return n;
  }

  // Only usable data should stop us reading the linked save file back.
  const hasUsableLocalData = () => localUsable;
  const savedText = () => localText;
  const loadTrouble = () => trouble;

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  return {
    SCHEMA, init, recoverFromFile, checkFileAtStart, hasUsableLocalData, savedText, loadTrouble,
    pref, setPref,
    save(state) { writeLocal(state); queueFileWrite(state); },
    // This browser only, leaving the file as it is until the next real change.
    saveLocal(state) { writeLocal(state); },
    flush, snapshot, dailySnapshot, backups, restore,
    file, persistence, fileSupported, linkFile, openFile, reconnect, release, unlink,
    download, parseImport, takeNotices, migrate,
  };
})();
