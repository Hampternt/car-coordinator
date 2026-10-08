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
     op                  pack 3
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

  return {
    RELAY, RELAY_PREF, ROOM_PREF, KINDS, INFO, CLOSE,
    relayUrl, roomUrl, newSecret, deriveKeys, seal, open, inviteLink, readInvite, connect,
    joinPreview,
  };
})();
