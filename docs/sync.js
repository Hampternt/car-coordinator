'use strict';
/* The shared plan's client side: the room's keys, encryption, the invite link
   and the connection to the relay.

   The wire contract is relay/PROTOCOL.md; the relay (relay/, Rust) is built
   to the same file. In short: the invite link carries a 32-byte secret after
   the '#', which no server ever sees. HKDF turns it into the room's id, the
   token that proves the link to the relay, and an AES-GCM key that never
   leaves this browser. The relay stores and forwards only ciphertext.

   Plaintexts are JSON objects, and every one carries `schema` (Store's data
   version), so an older build can tell it is looking at a newer plan and stay
   read-only rather than drop fields it does not know:
     snapshot            {schema, plan}       pack 2 fixes what `plan` holds
     version             {schema, plan, name, nonce}
     label               {schema, name, nonce}  a version's name, "Monday final"
   A version's body and its label are sealed apart, so the relay could pair
   one version's label with another's body. Each push puts the same name and
   a fresh random nonce in both, and the app refuses a body whose name or
   nonce is not its label's ("This version does not match its name").
     op                  {schema, oid, changes}  one batch of edits; see
                         "changes" below for what `changes` holds
     presence            pack 4

   The secret is kept per browser under carcoord:pref:room (Store.pref('room')),
   never in carcoord:v1, so Export, Backups, Archives and recover.html never
   hold it.

   Nothing here touches the network until connect() is called: a browser that
   has not joined a room makes no network calls at all.

   Exposed as window.Sync. */

const Sync = (() => {
  // nginx strips /carsync in front of the relay (PROTOCOL.md §3).
  const RELAY = 'wss://portfolio.dblo.net/carsync';
  // Full localStorage keys; Store.pref('relay') and Store.pref('room') read
  // the same two.
  const RELAY_PREF = 'carcoord:pref:relay';
  const ROOM_PREF = 'carcoord:pref:room';
  // The AAD kinds (PROTOCOL.md §2). A body sealed as one never opens as another.
  const KINDS = Object.freeze(['snapshot', 'op', 'version', 'label', 'presence']);
  // HKDF info strings (PROTOCOL.md §1).
  const INFO = Object.freeze({ roomId: 'carsync room-id', token: 'carsync auth-token', encKey: 'carsync enc-key' });
  // Close codes the relay uses (PROTOCOL.md §5).
  const CLOSE = Object.freeze({
    BAD_FRAME: 4400, NOT_ALLOWED: 4401, WRONG_CREATE_CODE: 4403, HELLO_TIMEOUT: 4408,
    ROOM_EXISTS: 4409, TOO_LARGE: 4413, RATE_LIMITED: 4429, FULL: 4507,
  });


  /* ---------- base64url (PROTOCOL.md §1: no padding) ---------- */
  const B64URL = /^[A-Za-z0-9_-]+$/;
  const SECRET = /^[A-Za-z0-9_-]{43}$/;
  function toB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Checked before atob, which would take '+', '/' and '=' as well.
  function fromB64url(text) {
    if (typeof text !== 'string' || !B64URL.test(text)) throw new TypeError('not base64url');
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const utf8 = (text) => new TextEncoder().encode(text);
  const aad = (keys, kind) => utf8(`${keys.roomId}:${kind}`);
  function checkKind(kind) {
    if (!KINDS.includes(kind)) throw new TypeError(`Sync: unknown kind ${JSON.stringify(kind)}`);
  }

  /* ---------- where ---------- */

  // relayUrl() -> string
  //   The pref carcoord:pref:relay when it holds a ws:// or wss:// address
  //   (trimmed, any trailing '/' dropped), else RELAY. Reads localStorage
  //   inside a try: a browser that refuses storage gets RELAY.
  function relayUrl() {
    let v = null;
    try { v = localStorage.getItem(RELAY_PREF); } catch { return RELAY; }
    const url = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
    return /^wss?:\/\/\S+$/i.test(url) ? url : RELAY;
  }

  // roomUrl(roomId) -> string
  //   `${relayUrl()}/rooms/${roomId}/ws`
  function roomUrl(roomId) { return `${relayUrl()}/rooms/${roomId}/ws`; }

  /* ---------- keys ---------- */

  // newSecret() -> string
  //   32 bytes from crypto.getRandomValues, base64url without padding (43 chars).
  function newSecret() { return toB64url(crypto.getRandomValues(new Uint8Array(32))); }

  // async deriveKeys(secret) -> {roomId, token, encKey}
  //   HKDF-SHA256 over the 32 decoded bytes of `secret`, empty salt:
  //     roomId  base64url of 16 bytes (22 chars), info 'carsync room-id'
  //     token   base64url of 32 bytes (43 chars), info 'carsync auth-token'
  //     encKey  a non-extractable AES-GCM-256 CryptoKey, info 'carsync enc-key'
  //   Rejects with a TypeError when `secret` is not 43 base64url characters.
  async function deriveKeys(secret) {
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new TypeError('Sync: a room secret is 43 base64url characters');
    const ikm = await crypto.subtle.importKey('raw', fromB64url(secret), 'HKDF', false, ['deriveBits', 'deriveKey']);
    const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) });
    const bits = async (info, bytes) => new Uint8Array(await crypto.subtle.deriveBits(hkdf(info), ikm, bytes * 8));
    return {
      roomId: toB64url(await bits(INFO.roomId, 16)),
      token: toB64url(await bits(INFO.token, 32)),
      encKey: await crypto.subtle.deriveKey(hkdf(INFO.encKey), ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    };
  }

  /* ---------- ciphertext ---------- */

  // async seal(keys, kind, obj) -> string
  //   base64url(iv[12] ‖ AES-GCM(keys.encKey, iv, utf8(JSON.stringify(obj)),
  //   aad = utf8(keys.roomId + ':' + kind))), a fresh random iv every call.
  //   Throws a TypeError for a kind not in KINDS, or an obj without an integer
  //   `schema`.
  async function seal(keys, kind, obj) {
    checkKind(kind);
    if (!obj || typeof obj !== 'object' || !Number.isInteger(obj.schema)) throw new TypeError('Sync: a plaintext carries an integer schema');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(keys, kind) }, keys.encKey, utf8(JSON.stringify(obj))));
    const out = new Uint8Array(12 + sealed.length);
    out.set(iv);
    out.set(sealed, 12);
    return toB64url(out);
  }

  // async open(keys, kind, body) -> object
  //   The inverse of seal. Rejects on a wrong key, a different kind, any
  //   tampering or truncation, or a body that is not base64url. Throws a
  //   TypeError for a kind not in KINDS.
  async function open(keys, kind, body) {
    checkKind(kind);
    const raw = fromB64url(body);
    // The iv and a whole tag, at the least; WebCrypto would refuse it anyway.
    if (raw.length < 12 + 16) throw new TypeError('Sync: a body too short to be sealed');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12), additionalData: aad(keys, kind) }, keys.encKey, raw.subarray(12));
    const obj = JSON.parse(new TextDecoder().decode(plain));
    if (!obj || typeof obj !== 'object' || !Number.isInteger(obj.schema)) throw new TypeError('Sync: a plaintext without a schema');
    return obj;
  }

  /* ---------- invite link ---------- */

  // inviteLink(secret) -> string
  //   `${location.origin}${location.pathname}#join=${secret}`
  function inviteLink(secret) { return `${location.origin}${location.pathname}#join=${secret}`; }

  // readInvite(hash) -> string | null
  //   `hash` is location.hash. For '#join=…' it first strips the fragment
  //   (history.replaceState(null, '', location.pathname + location.search)),
  //   as Share.readHash does, whether or not the secret is well-formed, then
  //   returns the secret, or null when it is not 43 base64url characters.
  //   Any other hash: null, and nothing is stripped.
  function readInvite(hash) {
    const m = /^#join=(.*)$/.exec(typeof hash === 'string' ? hash : '');
    if (!m) return null;
    // Gone from the address bar before anything else, well-formed or not: the
    // secret must not stay in history or reach a synced browser history.
    history.replaceState(null, '', location.pathname + location.search);
    return SECRET.test(m[1]) ? m[1] : null;
  }

  /* ---------- connection ---------- */

  // connect({keys, create, url, WebSocket}) -> Connection
  //   keys       from deriveKeys
  //   create     {createCode} to make the room (first frame `create`), or
  //              absent to join it (`hello`)
  //   url        defaults to roomUrl(keys.roomId)
  //   WebSocket  defaults to the browser's; tests pass their own
  //
  // Connection
  //   .status        'connecting' | 'connected' | 'offline' | 'refused' | 'closed'
  //   .seq           the room's seq from the last welcome
  //   .on(type, fn)  -> unsubscribe function. Types:
  //                    'status' fn(status, closeCode)
  //                    'frame'  fn(frame) for every server frame after welcome
  //   .send(frame)   a protocol frame object, bodies already sealed; returns
  //                  false (and sends nothing) unless connected
  //   .close()       closes and stops reconnecting; status 'closed'
  //
  //   On a network error, 1001, 1006, 4429 or 4507: 'offline', and it
  //   reconnects with backoff, saying hello again. On 4400, 4401, 4403, 4409
  //   or 4413: 'refused', with no retry. Pack 2 owns this shape; packs 3 and 4
  //   build on it.
  //
  //   Also: .closeCode, the code of the last close (null while connected),
  //   and opts.retry {first, max} in ms, the backoff (1 s doubling to 30 s),
  //   which tests shorten. Any other close code reconnects, as a network
  //   error does (1011, a storage error on the relay, among them): only the
  //   codes that would fail the same way again stop it.
  const REFUSED = new Set([CLOSE.BAD_FRAME, CLOSE.NOT_ALLOWED, CLOSE.WRONG_CREATE_CODE, CLOSE.ROOM_EXISTS, CLOSE.TOO_LARGE]);
  function connect(opts) {
    const { keys } = opts;
    let create = opts.create || null;
    const url = opts.url || roomUrl(keys.roomId);
    const WS = opts.WebSocket || globalThis.WebSocket;
    const first = (opts.retry && opts.retry.first) || 1000;
    const max = (opts.retry && opts.retry.max) || 30000;
    const listeners = { status: new Set(), frame: new Set() };
    let ws = null;
    let welcomed = false;
    let stopped = false;
    let attempt = 0;
    let retryTimer = null;
    let errorTimer = null;

    const emit = (type, ...args) => {
      for (const fn of [...listeners[type]]) {
        try { fn(...args); } catch (e) { console.error('Sync listener failed', e); }
      }
    };
    const setStatus = (status, code = null) => {
      conn.status = status;
      conn.closeCode = code;
      emit('status', status, code);
    };

    function dial() {
      retryTimer = null;
      welcomed = false;
      let sock = null;
      try { sock = new WS(url); } catch { ws = {}; lost(ws, 1006); return; }
      ws = sock;
      sock.onopen = () => {
        if (ws !== sock) return;
        sock.send(JSON.stringify(create ? { type: 'create', token: keys.token, createCode: create.createCode } : { type: 'hello', token: keys.token }));
      };
      sock.onmessage = (e) => {
        if (ws !== sock || typeof e.data !== 'string') return;
        let frame;
        try { frame = JSON.parse(e.data); } catch { return; }
        if (!frame || typeof frame !== 'object' || typeof frame.type !== 'string') return;
        if (!welcomed) {
          // Once made, the room is joined like any other: a reconnect says hello.
          if (frame.type === 'created') create = null;
          else if (frame.type === 'welcome') {
            welcomed = true;
            attempt = 0;
            conn.seq = Number.isInteger(frame.seq) ? frame.seq : 0;
            setStatus('connected');
          }
          return;
        }
        emit('frame', frame);
      };
      sock.onclose = (e) => lost(sock, e && Number.isInteger(e.code) ? e.code : 1006);
      // An error is followed by a close, except when the browser refused the
      // address itself (the page's security policy): then no close may come.
      sock.onerror = () => {
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => lost(sock, 1006), 1500);
      };
    }

    function lost(sock, code) {
      if (ws !== sock) return;
      ws = null;
      clearTimeout(errorTimer);
      if (sock && typeof sock.close === 'function') {
        sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
        try { sock.close(); } catch { /* already gone */ }
      }
      if (stopped) return;
      if (REFUSED.has(code)) { stopped = true; setStatus('refused', code); return; }
      setStatus('offline', code);
      // A listener may have given up on it just now.
      if (stopped) return;
      const wait = Math.min(max, first * 2 ** attempt);
      attempt++;
      // A little jitter, so two browsers that lost the relay together do not
      // knock on it together for ever.
      retryTimer = setTimeout(dial, Math.round(wait * (0.8 + Math.random() * 0.4)));
    }

    const conn = {
      status: 'connecting',
      seq: 0,
      closeCode: null,
      on(type, fn) {
        listeners[type].add(fn);
        return () => listeners[type].delete(fn);
      },
      send(frame) {
        if (conn.status !== 'connected' || !ws || typeof ws.send !== 'function') return false;
        try { ws.send(JSON.stringify(frame)); return true; } catch { return false; }
      },
      close() {
        if (stopped && conn.status === 'closed') return;
        stopped = true;
        clearTimeout(retryTimer);
        clearTimeout(errorTimer);
        const sock = ws;
        ws = null;
        if (sock && typeof sock.close === 'function') {
          sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
          try { sock.close(1000); } catch { /* already gone */ }
        }
        setStatus('closed');
      },
    };
    dial();
    return conn;
  }

  /* ---------- what taking a shared plan changes ---------- */

  // joinPreview(local, shared) -> {date, routes, cars, drivers, templates, onlyHere}
  //   For the offer to take a shared plan (or restore a version): what the
  //   other plan holds, and what exists only in `local` and so stays behind,
  //   in the Backup taken first. Matched the way share.js matches, on what a
  //   person reads (a registration, a name), case and spaces aside, because
  //   ids are random per PC. onlyHere lists, by their names as written here:
  //   cars, positions, labels, drivers, crews (day groups) and templates.
  const fold = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  function joinPreview(local, shared) {
    const list = (s, k) => (s && Array.isArray(s[k]) ? s[k] : []);
    const only = (k, field) => {
      const there = new Set(list(shared, k).map((x) => fold(x && x[field])));
      const out = [];
      for (const x of list(local, k)) {
        const name = String((x && x[field]) ?? '').trim();
        if (name && !there.has(fold(name)) && !out.some((o) => fold(o) === fold(name))) out.push(name);
      }
      return out;
    };
    return {
      date: shared && typeof shared.date === 'string' ? shared.date : '',
      routes: list(shared, 'routes').length,
      cars: list(shared, 'cars').length,
      drivers: list(shared, 'drivers').length,
      templates: list(shared, 'templates').length,
      onlyHere: {
        cars: only('cars', 'reg'),
        positions: only('positions', 'name'),
        labels: only('labels', 'name'),
        drivers: only('drivers', 'name'),
        crews: only('driverGroups', 'name'),
        templates: only('templates', 'name'),
      },
    };
  }

  /* ---------- changes: what an edit is, on the wire ----------
     Live edits travel as small changes worked out by comparing two plans, so
     no edit site in the app has to remember to send anything. An op's
     plaintext is {schema, oid, changes}; `oid` is a random id the sender
     knows its own op by when it comes back in a catchup. `changes` is a list,
     applied in order:
       {op:'set', kind, id, field, value, was}  one field of one item. kind
                       'meta' (and no id) is a top-level field, such as the
                       date. `del: true` in place of value: the field is gone.
       {op:'add', kind, item, after}             after: the id it follows,
                       null for the top of the list
       {op:'remove', kind, id, was}              was: the item as its sender
                       last saw it
       {op:'order', kind, ids}                   the list's order
     kind names one of the plan's lists (LISTS). `was` is what the sender saw
     before its change, so a browser applying it can tell when it overwrites
     something its sender never saw: a collision, and every browser applying
     the same ops in the relay's order finds the same ones.

     A list with an item lacking a string id, or two items sharing one, cannot
     be told apart item by item; it travels whole, as a meta set. A template's
     routes and a day group's drivers are single fields, set whole. */
  const LISTS = Object.freeze({
    route: 'routes', car: 'cars', position: 'positions', label: 'labels',
    driver: 'drivers', driverTag: 'driverTags', driverGroup: 'driverGroups', template: 'templates',
  });
  const KIND_OF = Object.freeze(Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [v, k])));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // Plans are JSON, so a JSON copy is a whole copy.
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  // Equal as data: objects in any key order, arrays in theirs. A missing field
  // and an undefined one are the same thing, as JSON has it.
  function equal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
    if (isObj(a) && isObj(b)) {
      const ka = Object.keys(a).filter((k) => a[k] !== undefined);
      const kb = Object.keys(b).filter((k) => b[k] !== undefined);
      return ka.length === kb.length && ka.every((k) => own(b, k) && equal(a[k], b[k]));
    }
    return false;
  }
  // A field name a change may carry: never one that would reach a prototype.
  const FIELD = (f) => typeof f === 'string' && f !== '' && f !== '__proto__' && f !== 'constructor' && f !== 'prototype';
  const byIdable = (list) => {
    if (!Array.isArray(list)) return false;
    const seen = new Set();
    for (const x of list) {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) return false;
      seen.add(x.id);
    }
    return true;
  };
  const fieldKey = (kind, id, field) => `${kind}\u0000${kind === 'meta' ? '' : id}\u0000${field}`;

  // diff(prev, next) -> changes, so that applyAll(prev, changes) is next.
  // Removes first, then adds in the new order (each after the one before it),
  // then the order if the items both hold were moved, then the fields.
  function diff(prev, next) {
    const out = [];
    const keys = [...Object.keys(next || {}), ...Object.keys(prev || {}).filter((k) => !own(next || {}, k))];
    for (const key of keys) {
      const a = prev ? prev[key] : undefined;
      const b = next ? next[key] : undefined;
      const kind = own(KIND_OF, key) ? KIND_OF[key] : null;
      if (kind && byIdable(a) && byIdable(b)) listDiff(kind, a, b, out);
      else if (!equal(a, b) && FIELD(key)) out.push(setChange('meta', null, key, a, b, next || {}));
    }
    return out;
  }
  function setChange(kind, id, field, a, b, holder) {
    const c = kind === 'meta' ? { op: 'set', kind, field } : { op: 'set', kind, id, field };
    if (own(holder, field) && b !== undefined) c.value = clone(b); else c.del = true;
    if (a !== undefined) c.was = clone(a);
    return c;
  }
  function listDiff(kind, a, b, out) {
    const inA = new Map(a.map((x) => [x.id, x]));
    const inB = new Map(b.map((x) => [x.id, x]));
    for (const x of a) if (!inB.has(x.id)) out.push({ op: 'remove', kind, id: x.id, was: clone(x) });
    let after = null;
    for (const x of b) {
      if (!inA.has(x.id)) out.push({ op: 'add', kind, item: clone(x), after });
      after = x.id;
    }
    const keptA = a.filter((x) => inB.has(x.id)).map((x) => x.id);
    const keptB = b.filter((x) => inA.has(x.id)).map((x) => x.id);
    if (keptA.some((id, i) => id !== keptB[i])) out.push({ op: 'order', kind, ids: b.map((x) => x.id) });
    for (const x of b) {
      const y = inA.get(x.id);
      if (!y) continue;
      const fields = [...Object.keys(x), ...Object.keys(y).filter((k) => !own(x, k))];
      for (const f of fields) if (f !== 'id' && FIELD(f) && !equal(y[f], x[f])) out.push(setChange(kind, x.id, f, y[f], x[f], x));
    }
  }

  // check(change): throws a TypeError unless this build knows how to apply it.
  // An op holding one it does not know was written by a newer build.
  function check(c) {
    if (!isObj(c)) throw new TypeError('Sync: a change is an object');
    const list = c.kind === 'meta' ? null : own(LISTS, c.kind) ? LISTS[c.kind] : undefined;
    if (list === undefined) throw new TypeError(`Sync: unknown kind ${JSON.stringify(c.kind)}`);
    const idOk = typeof c.id === 'string' && c.id !== '';
    switch (c.op) {
      case 'set':
        if (!FIELD(c.field) || (list && (c.field === 'id' || !idOk)) || (!c.del && !own(c, 'value'))) throw new TypeError('Sync: a malformed set');
        return;
      case 'add':
        if (!list || !isObj(c.item) || typeof c.item.id !== 'string' || !c.item.id || !(c.after === null || typeof c.after === 'string')) throw new TypeError('Sync: a malformed add');
        return;
      case 'remove':
        if (!list || !idOk) throw new TypeError('Sync: a malformed remove');
        return;
      case 'order':
        if (!list || !Array.isArray(c.ids) || !c.ids.every((x) => typeof x === 'string')) throw new TypeError('Sync: a malformed order');
        return;
      default:
        throw new TypeError(`Sync: unknown change ${JSON.stringify(c.op)}`);
    }
  }

  // apply(plan, change) -> plan. Never changes its input. Safe to apply twice:
  // an add whose id is there already, a remove or set of one that is gone,
  // and an order naming ids that are gone all leave the plan as it is (or as
  // the first time), because a catchup can repeat what arrived live.
  function apply(plan, c) {
    check(c);
    if (c.kind === 'meta') {
      const next = { ...plan };
      if (c.del) delete next[c.field]; else next[c.field] = clone(c.value);
      return next;
    }
    const key = LISTS[c.kind];
    const list = plan[key];
    if (!Array.isArray(list)) return plan;
    const at = (id) => list.findIndex((x) => isObj(x) && x.id === id);
    let out;
    switch (c.op) {
      case 'set': {
        const i = at(c.id);
        if (i < 0) return plan;
        const item = { ...list[i] };
        if (c.del) delete item[c.field]; else item[c.field] = clone(c.value);
        out = list.slice();
        out[i] = item;
        break;
      }
      case 'add': {
        if (at(c.item.id) >= 0) return plan;
        // After the item it followed; at the end when that one is gone.
        const i = c.after === null ? 0 : at(c.after) + 1 || list.length;
        out = list.slice();
        out.splice(i, 0, clone(c.item));
        break;
      }
      case 'remove': {
        const i = at(c.id);
        if (i < 0) return plan;
        out = list.slice();
        out.splice(i, 1);
        break;
      }
      case 'order': {
        // The ids named, in that order; one not named (added meanwhile by the
        // other browser) stays after the item it followed.
        const named = new Set();
        out = [];
        for (const id of c.ids) {
          const i = at(id);
          if (i >= 0 && !named.has(id)) { named.add(id); out.push(list[i]); }
        }
        list.forEach((x, i) => {
          if (isObj(x) && named.has(x.id)) return;
          const before = i > 0 ? out.indexOf(list[i - 1]) : -1;
          out.splice(before + 1, 0, x);
        });
        break;
      }
      default:
        return plan;
    }
    return { ...plan, [key]: out };
  }
  const applyAll = (plan, changes) => changes.reduce(apply, plan);

  // collision(plan, change) -> null | what applying `change` to `plan` would
  // overwrite that its sender had not seen:
  //   {type:'set', kind, id, field, kept, lost}  a field both changed
  //   {type:'removed', kind, id, item, after}     an item removed with changes
  //                                               its remover never saw
  //   {type:'gone', kind, id, field, value}       a field set on an item that
  //                                               was removed before it arrived
  function collision(plan, c) {
    if (c.op === 'set') {
      let holder = plan;
      if (c.kind !== 'meta') {
        const list = plan[LISTS[c.kind]];
        holder = Array.isArray(list) ? list.find((x) => isObj(x) && x.id === c.id) : null;
        if (!holder) return { type: 'gone', kind: c.kind, id: c.id, field: c.field, value: c.del ? undefined : clone(c.value) };
      }
      const now = holder[c.field];
      const value = c.del ? undefined : c.value;
      if (equal(now, c.was) || equal(now, value)) return null;
      return { type: 'set', kind: c.kind, id: c.kind === 'meta' ? null : c.id, field: c.field, kept: clone(value), lost: clone(now) };
    }
    if (c.op === 'remove' && own(c, 'was')) {
      const list = plan[LISTS[c.kind]];
      const i = Array.isArray(list) ? list.findIndex((x) => isObj(x) && x.id === c.id) : -1;
      if (i < 0 || equal(list[i], c.was)) return null;
      return { type: 'removed', kind: c.kind, id: c.id, item: clone(list[i]), after: i > 0 && isObj(list[i - 1]) ? list[i - 1].id : null };
    }
    return null;
  }

  /* ---------- a replica: one browser's view of the room ----------
     confirmed  the plan after every op the relay has sequenced, up to `seq`
     queue      this browser's own batches the relay has not sequenced yet,
                oldest first: {oid, changes, sent}
     shadow     confirmed with the queue on top: the plan this browser has
                said it holds

     capture(screen) turns what the screen holds beyond the shadow into a
     batch. take() and drain() fold sequenced ops (anyone's, this browser's
     own included) into confirmed strictly in seq order, waiting at a gap;
     the queue is replayed on top, so a browser's own unsequenced edits stay
     on its screen, and once every batch is sequenced every replica holds
     the same plan. drain() returns the collisions it met, the same on every
     replica that applied the same ops, and an edit that arrived for an item
     already removed: a `removed` flag with the item to put back, or with
     item null and the value set when this replica kept no copy of it.
     Nothing here touches the network. */
  const newOid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  function replica(seq, plan) {
    // Keeps list[i], removed, with the id it followed.
    const bury = (kind, id, list, i) => {
      const dead = { item: clone(list[i]), after: i > 0 && isObj(list[i - 1]) ? list[i - 1].id : null };
      R.graveyard.set(`${kind}\u0000${id}`, dead);
      if (R.graveyard.size > 100) R.graveyard.delete(R.graveyard.keys().next().value);
      return dead;
    };
    const R = {
      seq,
      confirmed: clone(plan),
      shadow: clone(plan),
      queue: [],
      inbox: new Map(),
      // `${kind}\u0000${id}` -> {item, after}: what removes took away, so an
      // edit arriving for one afterwards can be offered back with the item.
      graveyard: new Map(),
      // Flags a reset found, for the next drain to return.
      later: [],
      // capture(screen, {skip, was}) -> batch | null
      //   skip(change): leave it out, on the screen only, for now (a field
      //   being typed in); was: Map fieldKey -> the value its `was` says.
      capture(screen, opts = {}) {
        let changes = diff(R.shadow, screen);
        if (opts.skip) changes = changes.filter((c) => !opts.skip(c));
        if (!changes.length) return null;
        if (opts.was) {
          for (const c of changes) {
            const k = c.op === 'set' ? fieldKey(c.kind, c.id, c.field) : null;
            if (k && opts.was.has(k)) { const w = opts.was.get(k); if (w === undefined) delete c.was; else c.was = clone(w); }
          }
        }
        R.shadow = applyAll(R.shadow, changes);
        const batch = { oid: newOid(), changes, sent: false };
        R.queue.push(batch);
        return batch;
      },
      // A sequenced op: anyone's, held until every seq before it is here.
      take(at, changes, oid = null) {
        if (!Number.isInteger(at) || at <= R.seq) return;
        R.inbox.set(at, { changes, oid });
      },
      // -> {applied, flags}; throws (applying nothing of that op) when an op
      // holds a change this build does not know.
      drain() {
        let applied = 0;
        // What a reset found, first: it came before these ops.
        const flags = R.later.splice(0);
        while (R.inbox.has(R.seq + 1)) {
          const { changes, oid } = R.inbox.get(R.seq + 1);
          if (!Array.isArray(changes)) throw new TypeError('Sync: an op without changes');
          changes.forEach(check);
          R.inbox.delete(R.seq + 1);
          for (const c of changes) {
            const hit = collision(R.confirmed, c);
            if (hit && hit.type === 'gone') {
              const k = `${c.kind}\u0000${c.id}`;
              const dead = R.graveyard.get(k);
              if (dead) {
                const item = { ...dead.item };
                if (c.del) delete item[c.field]; else item[c.field] = clone(c.value);
                dead.item = item;
                flags.push({ type: 'removed', kind: c.kind, id: c.id, item: clone(item), after: dead.after, field: c.field });
              } else {
                // Removed before anything here could keep it (a reload since,
                // or long ago): there is no item to offer back, but the edit
                // is not dropped without a word.
                flags.push({ type: 'removed', kind: c.kind, id: c.id, item: null, after: null, field: c.field, value: hit.value });
              }
            } else if (hit) flags.push(hit);
            if (c.op === 'remove') {
              const list = R.confirmed[LISTS[c.kind]];
              const i = Array.isArray(list) ? list.findIndex((x) => isObj(x) && x.id === c.id) : -1;
              if (i >= 0) bury(c.kind, c.id, list, i);
            }
            R.confirmed = apply(R.confirmed, c);
          }
          R.seq++;
          applied++;
          if (oid) R.queue = R.queue.filter((b) => b.oid !== oid);
        }
        for (const k of [...R.inbox.keys()]) if (k <= R.seq) R.inbox.delete(k);
        if (applied) R.replay();
        return { applied, flags };
      },
      // A snapshot past what this browser has applied: start again from it.
      // The queue stays, to be replayed and sent. An item this browser has an
      // edit queued for that the snapshot no longer holds was removed in the
      // ops it skipped: flagged now (the next drain returns it), with the
      // item as this browser had it, so it can be put back with the edit.
      reset(at, plan) {
        const before = R.shadow;
        R.seq = at;
        R.confirmed = clone(plan);
        for (const k of [...R.inbox.keys()]) if (k <= at) R.inbox.delete(k);
        R.replay();
        const seen = new Set();
        for (const c of R.queue.flatMap((b) => b.changes)) {
          if (c.op !== 'set' || c.kind === 'meta' || !own(LISTS, c.kind)) continue;
          const k = `${c.kind}\u0000${c.id}`;
          const now = R.shadow[LISTS[c.kind]];
          if (seen.has(k) || (Array.isArray(now) && now.some((x) => isObj(x) && x.id === c.id))) continue;
          seen.add(k);
          const old = before[LISTS[c.kind]];
          const i = Array.isArray(old) ? old.findIndex((x) => isObj(x) && x.id === c.id) : -1;
          if (i < 0) continue;
          const dead = bury(c.kind, c.id, old, i);
          R.later.push({ type: 'removed', kind: c.kind, id: c.id, item: clone(dead.item), after: dead.after, field: c.field });
        }
      },
      replay() { R.shadow = applyAll(R.confirmed, R.queue.flatMap((b) => b.changes)); },
      // The connection dropped: whether the relay stored what was sent is
      // unknown until the catchup, so all of it counts as unsent again.
      lost() { for (const b of R.queue) b.sent = false; },
      unsent() { return R.queue.filter((b) => !b.sent); },
    };
    return R;
  }

  return {
    RELAY, RELAY_PREF, ROOM_PREF, KINDS, INFO, CLOSE,
    relayUrl, roomUrl, newSecret, deriveKeys, seal, open, inviteLink, readInvite, connect,
    joinPreview,
    LISTS, equal, diff, apply, applyAll, collision, check, replica, fieldKey,
  };
})();
