'use strict';
/* Storage: validation, rolling backups, and an optional auto-saved file.
   Nothing here talks to the network. Exposed as window.Store. */

const Store = (() => {
  const KEY = 'carcoord:v1';
  const BACKUP_KEY = 'carcoord:backups';
  const MAX_BACKUPS = 12;
  const SCHEMA = 1;
  const FILE_DEBOUNCE = 800;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
  const bool = (v) => v === true;

  /* ---------- validation ----------
     localStorage can hold anything: a half-written blob, data from an older
     build, or something a newer build wrote. Rather than trusting it and
     crashing on the first render, coerce it into a shape the UI can draw. */

  function normalise(raw, defaults) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: defaults(), repaired: ['not an object'] };
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
        carId: str(r.carId), positionId: str(r.positionId),
        highlight: bool(r.highlight), gapBefore: bool(r.gapBefore),
      }));

    // Drop references to things that no longer exist, so the UI never has to
    // guess what a dangling id meant.
    const has = (list, id) => !id || list.some((x) => x.id === id);
    for (const c of cars) if (!has(labels, c.labelId)) { c.labelId = ''; repaired.push(`${c.reg} pointed at a missing label`); }
    for (const p of positions) if (!has(labels, p.labelId)) { p.labelId = ''; repaired.push(`${p.name} pointed at a missing label`); }
    for (const r of routes) {
      if (!has(cars, r.carId)) { r.carId = ''; repaired.push(`route ${r.name} pointed at a missing car`); }
      if (!has(positions, r.positionId)) { r.positionId = ''; repaired.push(`route ${r.name} pointed at a missing position`); }
    }

    const date = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.date)) ? raw.date : defaults().date;
    if (date !== raw.date && raw.date !== undefined) repaired.push('date was not a valid day');
    const qrOnSheet = raw.qrOnSheet === undefined ? true : bool(raw.qrOnSheet);

    return { state: { schemaVersion: SCHEMA, date, qrOnSheet, positions, labels, cars, routes }, repaired };
  }

  /* ---------- versioning ---------- */
  let notices = [];
  const takeNotices = () => { const n = notices; notices = []; return n; };

  function migrate(raw, defaults) {
    if (!raw || typeof raw !== 'object') return normalise(null, defaults);
    const v = Number(raw.schemaVersion) || 0;
    if (v > SCHEMA) {
      // Written by a newer build. Load it anyway (fields we know still work),
      // but say so, because saving will drop whatever we did not understand.
      notices.push({ kind: 'warn', text: 'This data was saved by a newer version of Car Coordinator. Anything that version added will be lost once you make a change here.' });
    }
    // v0 (no schemaVersion) has the same field names, so normalise covers it.
    return normalise(raw, defaults);
  }

  /* ---------- localStorage ---------- */
  function readLocal(defaults) {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { notices.push({ kind: 'warn', text: 'Saved data could not be read and was replaced with a fresh start. Check Backups below before entering anything.' }); }
    const { state, repaired } = migrate(raw, defaults);
    if (repaired.length) notices.push({ kind: 'info', text: `Repaired saved data: ${repaired.slice(0, 3).join('; ')}${repaired.length > 3 ? `; and ${repaired.length - 3} more` : ''}.` });
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

  function snapshot(state, label) {
    const list = backups();
    const entry = { t: new Date().toISOString(), label, json: JSON.stringify(state) };
    // Skip a snapshot identical to the newest one (nothing actually changed).
    if (list[0] && list[0].json === entry.json) return;
    list.unshift(entry);
    while (list.length > MAX_BACKUPS) list.pop();
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list)); } catch { list.length = Math.max(1, list.length - 3); }
  }

  function dailySnapshot(state) {
    const today = new Date().toISOString().slice(0, 10);
    if (backups().some((b) => b.t.slice(0, 10) === today && b.label === 'Start of day')) return;
    snapshot(state, 'Start of day');
  }

  const restore = (entry, defaults) => migrate(JSON.parse(entry.json), defaults).state;

  /* ---------- IndexedDB (one key: the save-file handle) ---------- */
  function idb(fn) {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('carcoord', 1); } catch { return resolve(undefined); }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(undefined);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        const out = fn(tx.objectStore('kv'));
        tx.oncomplete = () => { db.close(); resolve(out && out.result); };
        tx.onerror = () => { db.close(); resolve(undefined); };
      };
    });
  }
  const getHandle = () => idb((s) => s.get('fileHandle'));
  const putHandle = (h) => idb((s) => s.put(h, 'fileHandle'));
  const clearHandle = () => idb((s) => s.delete('fileHandle'));

  /* ---------- auto-saved file (File System Access API) ---------- */
  const fileSupported = () => typeof window.showSaveFilePicker === 'function';

  const file = { handle: null, name: '', permission: 'unsupported', lastSaved: null, error: '' };
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
    if (!file.handle || file.permission !== 'granted') return;
    try {
      const w = await file.handle.createWritable();
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

  function flush() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    const s = pending;
    pending = null;
    if (s) writeFile(s);
  }

  async function linkFile(state) {
    if (!fileSupported()) return false;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'car-coordinator.json',
        types: [{ description: 'Car Coordinator data', accept: { 'application/json': ['.json'] } }],
      });
      file.handle = handle;
      file.name = handle.name;
      file.permission = await permissionFor(handle, true);
      await putHandle(handle);
      await writeFile(state);
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
      file.permission = await permissionFor(handle, true);
      await putHandle(handle);
      return text;
    } catch { return null; }
  }

  async function reconnect(state) {
    file.permission = await permissionFor(file.handle, true);
    if (file.permission === 'granted') await writeFile(state);
    onChange();
    return file.permission === 'granted';
  }

  async function unlink() {
    file.handle = null;
    file.name = '';
    file.permission = fileSupported() ? 'none' : 'unsupported';
    file.lastSaved = null;
    file.error = '';
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
  async function init(defaults, changed) {
    onChange = changed || (() => {});
    const state = readLocal(defaults);
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
     a cleared profile, a different Windows user. */
  async function recoverFromFile(defaults) {
    if (!file.handle || file.permission !== 'granted') return null;
    try {
      const text = await (await file.handle.getFile()).text();
      if (!text.trim()) return null;
      const { state } = parseImport(text, defaults);
      return state || null;
    } catch { return null; }
  }

  const hadLocalData = () => {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  };

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  return {
    SCHEMA, init, recoverFromFile, hadLocalData,
    save(state) { writeLocal(state); queueFileWrite(state); },
    flush, snapshot, dailySnapshot, backups, restore,
    file, persistence, fileSupported, linkFile, openFile, reconnect, unlink,
    download, parseImport, takeNotices, migrate,
  };
})();
