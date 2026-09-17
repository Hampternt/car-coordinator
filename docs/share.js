'use strict';
/* Sharing a finished list between PCs without a server.

   The payload refers to cars, positions and labels by their name or
   registration, never by id: ids are generated per install, so they mean
   nothing on anyone else's machine.

   Wire format: "CC1." + base64url(deflate-raw(JSON)), or "CC1U." + base64url(JSON)
   where the browser has no CompressionStream. Both stay short enough for a
   URL fragment, which browsers never send to the server.

   Exposed as window.Share. */

const Share = (() => {
  const TAG = 'CC1.';
  const TAG_RAW = 'CC1U.';
  const HI = 1;      // route is highlighted pink
  const GAP = 2;     // blank line above the route

  /* ---------- base64url ---------- */
  function toB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(text) {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* ---------- compression (optional) ---------- */
  const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  async function pump(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  /* ---------- state -> payload ---------- */
  const nameOf = (list, id) => { const x = list.find((i) => i.id === id); return x ? (x.reg || x.name) : ''; };

  function pack(state, mode) {
    const out = {
      v: 1,
      d: state.date,
      r: state.routes.map((r) => [
        r.name,
        r.driver,
        nameOf(state.cars, r.carId),
        nameOf(state.positions, r.positionId),
        (r.highlight ? HI : 0) | (r.gapBefore ? GAP : 0),
      ]),
    };
    if (mode === 'all') {
      out.l = state.labels.map((l) => [l.name, l.color]);
      out.c = state.cars.map((c) => [c.reg, nameOf(state.labels, c.labelId), c.note]);
      out.p = state.positions.map((p) => [p.name, p.multi ? 1 : 0, nameOf(state.labels, p.labelId), p.note]);
    }
    return out;
  }

  async function encode(state, mode) {
    const json = JSON.stringify(pack(state, mode));
    const bytes = new TextEncoder().encode(json);
    if (!canCompress()) return TAG_RAW + toB64url(bytes);
    return TAG + toB64url(await pump(bytes, new CompressionStream('deflate-raw')));
  }

  /* ---------- payload -> state ---------- */
  async function decode(text) {
    const clean = String(text || '').trim().replace(/\s+/g, '');
    const body = clean.startsWith(TAG) ? clean.slice(TAG.length)
      : clean.startsWith(TAG_RAW) ? clean.slice(TAG_RAW.length)
        : null;
    if (body === null) {
      return { error: clean ? 'That is not a Car Coordinator list. A shared list starts with "CC1.".' : 'Paste a shared list first.' };
    }
    let json;
    try {
      const bytes = fromB64url(body);
      const plain = clean.startsWith(TAG_RAW) ? bytes : await pump(bytes, new DecompressionStream('deflate-raw'));
      json = JSON.parse(new TextDecoder().decode(plain));
    } catch {
      return { error: 'That list is damaged — some of it went missing in the copy. Ask for it again.' };
    }
    if (!json || json.v !== 1 || !Array.isArray(json.r)) {
      return { error: 'That list was made by a different version of Car Coordinator.' };
    }
    return { share: json };
  }

  /* ---------- merging ----------
     Match on what a human would match on: the registration, the position
     name, the label name. Case and stray spaces should not matter. */
  const key = (s) => String(s || '').trim().toUpperCase();

  function summarise(state, share, addMissing) {
    const haveCar = new Map(state.cars.map((c) => [key(c.reg), c]));
    const havePos = new Map(state.positions.map((p) => [key(p.name), p]));
    const unknownCars = [];
    const unknownPos = [];
    for (const [, , reg, pos] of share.r) {
      if (reg && !haveCar.has(key(reg)) && !unknownCars.includes(reg)) unknownCars.push(reg);
      if (pos && !havePos.has(key(pos)) && !unknownPos.includes(pos)) unknownPos.push(pos);
    }
    return {
      date: share.d,
      routes: share.r.length,
      hasEverything: Array.isArray(share.c),
      cars: share.c ? share.c.length : 0,
      positions: share.p ? share.p.length : 0,
      unknownCars,
      unknownPos,
      addMissing,
    };
  }

  /* Returns a brand new state; the caller decides whether to keep it. */
  function apply(state, share, opts) {
    const { mode, addMissing } = opts;          // mode: 'day' | 'all'
    const uid = () => Math.random().toString(36).slice(2, 10);
    const next = JSON.parse(JSON.stringify(state));
    const skipped = { cars: [], positions: [] };

    const labelIdByName = () => new Map(next.labels.map((l) => [key(l.name), l.id]));

    if (mode === 'all' && share.l) {
      for (const [name, color] of share.l) {
        const at = next.labels.find((l) => key(l.name) === key(name));
        if (at) at.color = color;
        else next.labels.push({ id: uid(), name, color });
      }
    }

    if (mode === 'all' && share.c) {
      const labels = labelIdByName();
      for (const [reg, labelName, note] of share.c) {
        const at = next.cars.find((c) => key(c.reg) === key(reg));
        const labelId = labelName ? (labels.get(key(labelName)) || '') : '';
        if (at) { at.labelId = labelId; at.note = note || ''; }
        else next.cars.push({ id: uid(), reg, labelId, note: note || '' });
      }
    }

    if (mode === 'all' && share.p) {
      const labels = labelIdByName();
      for (const [name, multi, labelName, note] of share.p) {
        const at = next.positions.find((p) => key(p.name) === key(name));
        const labelId = labelName ? (labels.get(key(labelName)) || '') : '';
        if (at) { at.multi = !!multi; at.labelId = labelId; at.note = note || ''; }
        else next.positions.push({ id: uid(), name, multi: !!multi, labelId, note: note || '' });
      }
    }

    // Day plan last, so it can point at anything the step above just added.
    const findCar = (reg) => next.cars.find((c) => key(c.reg) === key(reg));
    const findPos = (name) => next.positions.find((p) => key(p.name) === key(name));

    next.date = share.d || next.date;
    next.routes = share.r.map(([name, driver, reg, pos, flags]) => {
      let car = reg ? findCar(reg) : null;
      if (reg && !car) {
        if (addMissing) { car = { id: uid(), reg, labelId: '', note: '' }; next.cars.push(car); }
        else if (!skipped.cars.includes(reg)) skipped.cars.push(reg);
      }
      let position = pos ? findPos(pos) : null;
      if (pos && !position) {
        if (addMissing) { position = { id: uid(), name: pos, multi: false, labelId: '', note: '' }; next.positions.push(position); }
        else if (!skipped.positions.includes(pos)) skipped.positions.push(pos);
      }
      return {
        id: uid(), name: name || '', driver: driver || '',
        carId: car ? car.id : '', positionId: position ? position.id : '',
        highlight: !!(flags & HI), gapBefore: !!(flags & GAP),
      };
    });

    return { state: next, skipped };
  }

  /* ---------- link ---------- */
  const linkFor = (payload) => `${location.origin}${location.pathname}#d=${payload}`;

  function readHash() {
    const m = /^#d=(.+)$/.exec(location.hash || '');
    if (!m) return null;
    // Drop it immediately: a share link should not survive a bookmark or a
    // reload, and it has already done its job.
    history.replaceState(null, '', location.pathname + location.search);
    return decodeURIComponent(m[1]);
  }

  return { encode, decode, apply, summarise, linkFor, readHash, canCompress };
})();
