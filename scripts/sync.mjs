// The shared plan's client contract, in node, without a browser or a relay.
// Run: node scripts/sync.mjs
//
// docs/sync.js is loaded into a vm context the way map.mjs loads map.js, and
// handed the browser globals it may use: WebCrypto, TextEncoder/Decoder,
// atob/btoa, and fake location, history and localStorage that record what is
// done to them. Every expectation about bytes is checked against node's own
// crypto, an implementation independent of sync.js, and against the test
// vectors written in relay/PROTOCOL.md.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import nodeCrypto from 'node:crypto';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const source = await read('docs/sync.js');

const stored = new Map();
let storageBroken = false;
const localStorage = {
  getItem(k) { if (storageBroken) throw new Error('storage refused'); return stored.has(k) ? stored.get(k) : null; },
  setItem(k, v) { if (storageBroken) throw new Error('storage refused'); stored.set(k, String(v)); },
  removeItem(k) { if (storageBroken) throw new Error('storage refused'); stored.delete(k); },
};
const location = { origin: 'https://hampternt.github.io', pathname: '/car-coordinator/', search: '?tab=data', hash: '' };
const replaced = [];
const history = { replaceState: (...args) => { replaced.push(args); } };

const ctx = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, location, history, localStorage, console });
vm.runInContext(source, ctx, { filename: 'docs/sync.js' });
const Sync = vm.runInContext('Sync', ctx);
// Loading must do nothing by itself: the context has no WebSocket or fetch, so
// a load that reached for the network would already have thrown.
const strippedAtLoad = replaced.length;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
// One block of checks; a throw inside fails the block and the run goes on.
const block = async (name, fn) => {
  try { await fn(); } catch (e) { check(name, false, `threw: ${e && e.message}`); }
};
const rejects = async (name, fn) => {
  let threw = false;
  try { await fn(); } catch (e) { threw = !/not implemented/.test(String(e && e.message)); }
  check(name, threw, 'did not reject (or is not implemented)');
};

// --- the reference: PROTOCOL.md §1-2 done with node's crypto ---
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const unb64 = (text) => Buffer.from(text, 'base64url');
const hkdf = (secret, info, len) => Buffer.from(nodeCrypto.hkdfSync('sha256', unb64(secret), Buffer.alloc(0), info, len));
const ref = (secret) => ({
  roomId: b64(hkdf(secret, 'carsync room-id', 16)),
  token: b64(hkdf(secret, 'carsync auth-token', 32)),
  key: hkdf(secret, 'carsync enc-key', 32),
});
const refSeal = (secret, kind, obj) => {
  const { roomId, key } = ref(secret);
  const iv = nodeCrypto.randomBytes(12);
  const c = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`${roomId}:${kind}`, 'utf8'));
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return b64(Buffer.concat([iv, ct]));
};
const refOpen = (secret, kind, body) => {
  const { roomId, key } = ref(secret);
  const raw = unb64(body);
  const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(`${roomId}:${kind}`, 'utf8'));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8'));
};

// PROTOCOL.md's test vectors: the secret is the bytes 0..31.
const VECTOR = {
  secret: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  roomId: 'WC4euC74o8kDhATEpCnxOA',
  token: 'oLAfzK7Ly0MaXxZIV1VTNuD4uhKZtKKZ75X47f2mYdQ',
};
const OTHER = b64(Buffer.alloc(32, 7));
const B64URL43 = /^[A-Za-z0-9_-]{43}$/;

// --- the reference agrees with PROTOCOL.md (checks this file, not sync.js) ---
{
  const r = ref(VECTOR.secret);
  same('the reference HKDF gives PROTOCOL.md\'s vectors', [b64(Buffer.from([...Array(32).keys()])), r.roomId, r.token], [VECTOR.secret, VECTOR.roomId, VECTOR.token]);
}

check('loading sync.js strips no fragment', strippedAtLoad === 0);

// --- constants ---
await block('constants', () => {
  same('the relay is portfolio.dblo.net/carsync', Sync.RELAY, 'wss://portfolio.dblo.net/carsync');
  same('the relay pref', Sync.RELAY_PREF, 'carcoord:pref:relay');
  same('the room pref, never inside carcoord:v1', Sync.ROOM_PREF, 'carcoord:pref:room');
  same('the AAD kinds', Array.from(Sync.KINDS), ['snapshot', 'op', 'version', 'label', 'presence']);
});

// --- where ---
await block('relayUrl', () => {
  stored.clear();
  same('no pref: the default relay', Sync.relayUrl(), Sync.RELAY);
  stored.set('carcoord:pref:relay', 'ws://127.0.0.1:3010');
  same('the pref overrides it', Sync.relayUrl(), 'ws://127.0.0.1:3010');
  stored.set('carcoord:pref:relay', ' ws://127.0.0.1:3010/ ');
  same('trimmed, trailing slash dropped', Sync.relayUrl(), 'ws://127.0.0.1:3010');
  stored.set('carcoord:pref:relay', 'https://evil.example');
  same('a pref that is not ws:// or wss:// is ignored', Sync.relayUrl(), Sync.RELAY);
  stored.set('carcoord:pref:relay', '');
  same('an empty pref is ignored', Sync.relayUrl(), Sync.RELAY);
  storageBroken = true;
  try { same('storage that refuses: the default', Sync.relayUrl(), Sync.RELAY); } finally { storageBroken = false; }
  stored.set('carcoord:pref:relay', 'ws://127.0.0.1:3010');
  same('roomUrl', Sync.roomUrl(VECTOR.roomId), `ws://127.0.0.1:3010/rooms/${VECTOR.roomId}/ws`);
  stored.clear();
  same('roomUrl on the default relay', Sync.roomUrl(VECTOR.roomId), `wss://portfolio.dblo.net/carsync/rooms/${VECTOR.roomId}/ws`);
});

// --- keys ---
await block('newSecret', () => {
  const a = Sync.newSecret();
  const b = Sync.newSecret();
  check('a secret is 43 base64url characters', B64URL43.test(a), a);
  check('and decodes to 32 bytes', unb64(a).length === 32);
  check('two secrets differ', a !== b);
});

await block('deriveKeys', async () => {
  const k = await Sync.deriveKeys(VECTOR.secret);
  same('roomId and token match the test vectors', [k.roomId, k.token], [VECTOR.roomId, VECTOR.token]);
  const fresh = Sync.newSecret();
  const f = await Sync.deriveKeys(fresh);
  const r = ref(fresh);
  same('and node\'s HKDF for a fresh secret', [f.roomId, f.token], [r.roomId, r.token]);
  const again = await Sync.deriveKeys(fresh);
  same('deriving twice gives the same id and token', [again.roomId, again.token], [f.roomId, f.token]);
  check('encKey is a CryptoKey that cannot be exported', k.encKey && k.encKey.type === 'secret' && k.encKey.extractable === false);
  same('encKey is AES-GCM 256', [k.encKey.algorithm.name, k.encKey.algorithm.length], ['AES-GCM', 256]);
  same('encKey encrypts and decrypts', Array.from(k.encKey.usages).sort(), ['decrypt', 'encrypt']);
});
for (const bad of ['', 'short', VECTOR.secret.slice(0, 42), `${VECTOR.secret}=`, VECTOR.secret.replace('A', '+')]) {
  await rejects(`deriveKeys refuses ${JSON.stringify(bad)}`, () => Sync.deriveKeys(bad));
}

// --- ciphertext ---
const plan = { schema: 9, plan: { date: '2026-10-07', routes: [{ name: 'Route 7', driver: 'Testa Testesen' }] } };
await block('seal and open', async () => {
  const keys = await Sync.deriveKeys(VECTOR.secret);
  const body = await Sync.seal(keys, 'snapshot', plan);
  check('a body is base64url', /^[A-Za-z0-9_-]+$/.test(body), body.slice(0, 40));
  same('it holds iv, ciphertext and tag', unb64(body).length, 12 + Buffer.byteLength(JSON.stringify(plan)) + 16);
  same('it round-trips', await Sync.open(keys, 'snapshot', body), plan);
  same('node opens it with AAD roomId:kind', refOpen(VECTOR.secret, 'snapshot', body), plan);
  same('Sync opens what node sealed', await Sync.open(keys, 'version', refSeal(VECTOR.secret, 'version', plan)), plan);
  check('every seal has a fresh iv', (await Sync.seal(keys, 'snapshot', plan)) !== body);
  const label = { schema: 9, name: 'Monday final' };
  same('a label round-trips', await Sync.open(keys, 'label', await Sync.seal(keys, 'label', label)), label);
  const twin = await Sync.deriveKeys(VECTOR.secret);
  same('a key derived again opens it', await Sync.open(twin, 'snapshot', body), plan);
});

await block('what open refuses', async () => {
  const keys = await Sync.deriveKeys(VECTOR.secret);
  const body = await Sync.seal(keys, 'snapshot', plan);
  const other = await Sync.deriveKeys(OTHER);
  await rejects('a wrong key is rejected', () => Sync.open(other, 'snapshot', body));
  await rejects('a swapped kind is rejected', () => Sync.open(keys, 'version', body));
  await rejects('the same key under another room id is rejected', () => Sync.open({ ...keys, roomId: other.roomId }, 'snapshot', body));
  const raw = unb64(body);
  raw[20] ^= 1;
  await rejects('a flipped bit is rejected', () => Sync.open(keys, 'snapshot', b64(raw)));
  await rejects('a truncated body is rejected', () => Sync.open(keys, 'snapshot', body.slice(0, 30)));
  await rejects('a body that is not base64url is rejected', () => Sync.open(keys, 'snapshot', 'not base64url!'));
  await rejects('seal refuses an unknown kind', () => Sync.seal(keys, 'secret', plan));
  await rejects('open refuses an unknown kind', () => Sync.open(keys, 'secret', body));
  await rejects('seal refuses a plaintext without schema', () => Sync.seal(keys, 'snapshot', { plan: {} }));
  // Pack 2's own: what the other side sealed must say its schema too, or an
  // older build could not tell it is looking at a newer plan.
  await rejects('open refuses a plaintext without schema', () => Sync.open(keys, 'snapshot', refSeal(VECTOR.secret, 'snapshot', { plan: {} })));
  await rejects('open refuses a body shorter than an iv and a tag', () => Sync.open(keys, 'snapshot', b64(Buffer.alloc(27))));
});

// --- invite link ---
await block('inviteLink', () => {
  same('the link is this page plus #join=', Sync.inviteLink(VECTOR.secret), `https://hampternt.github.io/car-coordinator/#join=${VECTOR.secret}`);
});

await block('readInvite', () => {
  replaced.length = 0;
  same('a join link gives its secret', Sync.readInvite(`#join=${VECTOR.secret}`), VECTOR.secret);
  same('and is stripped from the address bar', replaced, [[null, '', '/car-coordinator/?tab=data']]);
  replaced.length = 0;
  same('a mangled secret gives null', Sync.readInvite(`#join=${VECTOR.secret.slice(0, 40)}`), null);
  same('but is stripped all the same', replaced.length, 1);
  replaced.length = 0;
  same('a share link is not an invite', Sync.readInvite('#d=CC1.abc'), null);
  same('an empty hash is not an invite', Sync.readInvite(''), null);
  same('and neither is stripped here', replaced.length, 0);
});

// --- connect(): pack 2's own checks, on a fake WebSocket ---
// A second context with timers, so the one above still proves that loading
// sync.js reaches for nothing. Each FakeSocket is one dial; the test plays the
// relay by calling its open/frame/drop.
{
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; this.closed = null; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close(code) { this.closed = code ?? 1005; }
    open() { this.onopen && this.onopen({}); }
    frame(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
    drop(code) { this.onclose && this.onclose({ code }); }
  }
  const timed = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, location, history, localStorage, console, setTimeout, clearTimeout });
  vm.runInContext(source, timed, { filename: 'docs/sync.js' });
  const S = vm.runInContext('Sync', timed);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const retry = { first: 20, max: 40 };

  await block('connect', async () => {
    stored.clear();
    const keys = await S.deriveKeys(VECTOR.secret);
    sockets.length = 0;
    const seen = [];
    const c = S.connect({ keys, WebSocket: FakeSocket, retry });
    c.on('status', (st, code) => seen.push(code ? `${st}:${code}` : st));
    same('it dials the room on the default relay', sockets[0].url, `wss://portfolio.dblo.net/carsync/rooms/${VECTOR.roomId}/ws`);
    same('and starts connecting', c.status, 'connecting');
    check('send is refused before welcome', c.send({ type: 'catchup', since: 0 }) === false && sockets[0].sent.length === 0);
    sockets[0].open();
    same('its first frame is hello with the token', sockets[0].sent, [{ type: 'hello', token: VECTOR.token }]);
    sockets[0].frame({ type: 'welcome', seq: 7 });
    same('welcome makes it connected, at the room\'s seq', [c.status, c.seq, seen], ['connected', 7, ['connected']]);
    const frames = [];
    const off = c.on('frame', (f) => frames.push(f.type));
    check('send works once connected', c.send({ type: 'catchup', since: 0 }) === true);
    same('and puts the frame on the wire', sockets[0].sent[1], { type: 'catchup', since: 0 });
    sockets[0].frame({ type: 'catchup', seq: 7, snapshot: null, ops: [], versions: [] });
    off();
    sockets[0].frame({ type: 'ack', seq: 1 });
    same('frames after welcome reach on(\'frame\'), until unsubscribed', frames, ['catchup']);

    // 1011 (a storage error on the relay) joined the list in 41d1851.
    for (const code of [1001, 1006, 1011, 4429, 4507]) {
      const n = sockets.length;
      sockets[n - 1].drop(code);
      same(`${code}: offline`, [c.status, c.closeCode], ['offline', code]);
      check(`${code}: send is refused while offline`, c.send({ type: 'catchup', since: 0 }) === false);
      await wait(80);
      check(`${code}: it dials again`, sockets.length === n + 1);
      sockets[n].open();
      same(`${code}: and says hello again`, sockets[n].sent, [{ type: 'hello', token: VECTOR.token }]);
      sockets[n].frame({ type: 'welcome', seq: 7 });
      same(`${code}: connected again`, c.status, 'connected');
    }
    const n = sockets.length;
    c.close();
    same('close() closes the socket and says closed', [sockets[n - 1].closed, c.status], [1000, 'closed']);
    await wait(80);
    check('and nothing dials after it', sockets.length === n);
  });

  for (const code of [4400, 4401, 4403, 4409, 4413]) {
    await block(`connect refused ${code}`, async () => {
      const keys = await S.deriveKeys(VECTOR.secret);
      sockets.length = 0;
      const c = S.connect({ keys, WebSocket: FakeSocket, retry });
      sockets[0].open();
      sockets[0].drop(code);
      same(`${code}: refused, with its code`, [c.status, c.closeCode], ['refused', code]);
      await wait(80);
      check(`${code}: and it never dials again`, sockets.length === 1);
    });
  }

  await block('connect: create', async () => {
    const keys = await S.deriveKeys(VECTOR.secret);
    sockets.length = 0;
    const c = S.connect({ keys, create: { createCode: 'test-code' }, url: 'ws://127.0.0.1:1/rooms/x/ws', WebSocket: FakeSocket, retry });
    same('url overrides the address', sockets[0].url, 'ws://127.0.0.1:1/rooms/x/ws');
    sockets[0].open();
    same('the first frame is create, with the code', sockets[0].sent, [{ type: 'create', token: VECTOR.token, createCode: 'test-code' }]);
    sockets[0].frame({ type: 'created' });
    same('created alone is not connected yet', c.status, 'connecting');
    sockets[0].frame({ type: 'welcome', seq: 0 });
    same('welcome after it is', c.status, 'connected');
    sockets[0].drop(1006);
    await wait(80);
    sockets[1].open();
    same('a made room is rejoined with hello, never created twice', sockets[1].sent, [{ type: 'hello', token: VECTOR.token }]);
    c.close();
  });

  await block('connect: closed from its own offline listener', async () => {
    const keys = await S.deriveKeys(VECTOR.secret);
    sockets.length = 0;
    const c = S.connect({ keys, WebSocket: FakeSocket, retry });
    c.on('status', (st) => { if (st === 'offline') c.close(); });
    sockets[0].drop(1006);
    await wait(80);
    same('a close() made while it says offline stops the redial', [c.status, sockets.length], ['closed', 1]);
  });

  await block('connect: a network error with no close', async () => {
    const keys = await S.deriveKeys(VECTOR.secret);
    sockets.length = 0;
    const c = S.connect({ keys, WebSocket: FakeSocket, retry });
    sockets[0].onerror({});
    await wait(1700);
    same('an error that is never followed by a close still means offline', c.status, 'offline');
    c.close();
  });

  await block('connect: a socket that cannot be made', async () => {
    const keys = await S.deriveKeys(VECTOR.secret);
    class Throws { constructor() { throw new Error('SecurityError'); } }
    const c = S.connect({ keys, WebSocket: Throws, retry });
    same('a WebSocket that throws means offline, not a crash', c.status, 'offline');
    c.close();
  });
}

// --- joinPreview: what stays behind when a shared plan is taken ---
await block('joinPreview', () => {
  const local = {
    cars: [{ reg: 'AB 12345' }, { reg: 'zz 90001' }, { reg: 'ZZ  90001 ' }, { reg: '' }],
    positions: [{ name: 'Spot 1' }, { name: 'Back yard' }],
    labels: [{ name: 'Out of service' }],
    drivers: [{ name: 'Anders' }, { name: 'Testa Testesen' }],
    driverGroups: [{ name: 'Night crew' }, { name: 'monday crew' }],
    templates: [{ name: 'Holiday rota' }, { name: 'Saturday' }],
    routes: [{}, {}],
  };
  const shared = {
    date: '2026-10-09',
    cars: [{ reg: 'ab12345' }, { reg: 'AB 12345' }, { reg: 'EL 1' }],
    positions: [{ name: 'spot 1' }],
    labels: [{ name: 'Out of service' }],
    drivers: [{ name: 'anders' }],
    driverGroups: [{ name: 'Monday crew' }],
    templates: [{ name: 'Saturday' }, { name: 'Monday' }],
    routes: [{}, {}, {}],
  };
  const p = Sync.joinPreview(local, shared);
  same('it counts what the shared plan holds', [p.date, p.routes, p.cars, p.drivers, p.templates], ['2026-10-09', 3, 3, 1, 2]);
  same('and names what is only here, matched as a person reads it, once each', p.onlyHere, {
    cars: ['zz 90001'], positions: ['Back yard'], labels: [], drivers: ['Testa Testesen'], crews: ['Night crew'], templates: ['Holiday rota'],
  });
  same('a plan with lists missing is read as empty, not a throw', Sync.joinPreview({}, null).onlyHere.cars, []);
});

// --- pack 3: changes, diff and apply ---
// A seeded generator, so a failure names the seed that makes it again.
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const J = (v) => JSON.stringify(v);
// A made-up plan in the shape store.js writes.
function samplePlan() {
  return {
    schemaVersion: 6, date: '2026-10-09', qrOnSheet: false,
    positions: [{ id: 'p1', name: 'Spot 1', multi: false, labelId: '', note: '' }, { id: 'p2', name: 'Garage', multi: true, labelId: '', note: '' }],
    labels: [{ id: 'l1', name: 'Workshop', color: '#6a1b9a', onSheet: false }],
    cars: [{ id: 'c1', reg: 'ZZ 10001', labelId: '', note: '' }, { id: 'c2', reg: 'ZZ 10002', labelId: 'l1', note: 'brakes' }],
    routes: ['1', '2', '3', '4', 'HAU 1'].map((n, i) => ({ id: `r${i + 1}`, name: n, driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore: n === 'HAU 1' })),
    drivers: [{ id: 'd1', name: 'Testa Testesen', available: true, tagId: '', note: '' }, { id: 'd2', name: 'Prøve Person', available: false, tagId: 't1', note: '' }],
    driverTags: [{ id: 't1', name: 'Sick', color: '#c62828' }],
    driverGroups: [{ id: 'g1', name: 'Monday', driverIds: ['d1'] }],
    templates: [{ id: 'tpl-weekday-1', name: 'Monday', weekday: '1', routes: [{ name: '1', driver: 'Testa Testesen', carId: 'c1', positionId: '', round: '', highlight: false, gapBefore: false }] }],
    weekdayTemplates: true,
  };
}
const FIELDS = {
  routes: { name: 's', driver: 's', carId: 's', positionId: 's', round: 's', highlight: 'b', gapBefore: 'b' },
  cars: { reg: 's', labelId: 's', note: 's' }, positions: { name: 's', multi: 'b', labelId: 's', note: 's' },
  labels: { name: 's', color: 's', onSheet: 'b' }, drivers: { name: 's', available: 'b', tagId: 's', note: 's' },
  driverTags: { name: 's', color: 's' }, driverGroups: { name: 's', driverIds: 'ids' }, templates: { name: 's', weekday: 's', routes: 'rows' },
};
// One random edit of the kinds the app makes, on a copy.
function mutate(plan, rand, tag) {
  const p = JSON.parse(J(plan));
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const word = () => pick(['Anna', 'Bob', 'Cato', 'Dina', 'Eli', '', 'ZZ 4', 'Spot 9', 'æøå']) + (rand() < 0.3 ? String(Math.floor(rand() * 100)) : '');
  const key = pick(Object.keys(FIELDS));
  const list = p[key];
  const r = rand();
  if (r < 0.06) { p.date = `2026-10-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`; return p; }
  if (r < 0.08) { p.qrOnSheet = !p.qrOnSheet; return p; }
  if (r < 0.5 && list.length) {
    const item = pick(list);
    const [f, t] = pick(Object.entries(FIELDS[key]));
    item[f] = t === 'b' ? !item[f] : t === 'ids' ? p.drivers.filter(() => rand() < 0.5).map((d) => d.id)
      : t === 'rows' ? [{ name: word(), driver: word(), carId: '', positionId: '', round: '', highlight: rand() < 0.5, gapBefore: false }] : word();
    return p;
  }
  if (r < 0.68) {
    const item = { id: `${tag}${Math.floor(rand() * 1e9).toString(36)}` };
    for (const [f, t] of Object.entries(FIELDS[key])) item[f] = t === 'b' ? false : t === 'ids' || t === 'rows' ? [] : word();
    list.splice(Math.floor(rand() * (list.length + 1)), 0, item);
    return p;
  }
  if (r < 0.8 && list.length) { list.splice(Math.floor(rand() * list.length), 1); return p; }
  if (r < 0.9 && list.length > 1) { const [x] = list.splice(Math.floor(rand() * list.length), 1); list.splice(Math.floor(rand() * (list.length + 1)), 0, x); return p; }
  if (r < 0.93 && list.length > 1) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return p; }
  if (r < 0.95 && list.length) { delete pick(list).note; return p; }
  if (r < 0.97 && list.length) { pick(list).extra = word(); return p; }
  return p;
}

await block('diff and apply', () => {
  const a = samplePlan();
  same('the same plan: no changes', Sync.diff(a, JSON.parse(J(a))), []);
  const b = JSON.parse(J(a));
  b.routes[2].driver = 'Anna';
  same('one field: one set, with what it was', Sync.diff(a, b), [{ op: 'set', kind: 'route', id: 'r3', field: 'driver', value: 'Anna', was: '' }]);
  b.date = '2026-10-10';
  same('the date is a meta set', Sync.diff(a, b)[0], { op: 'set', kind: 'meta', field: 'date', value: '2026-10-10', was: '2026-10-09' });
  const c = JSON.parse(J(a));
  c.routes.splice(1, 0, { id: 'rX', name: '1b', driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore: false });
  same('an inserted route is an add after the one before it, not an order', Sync.diff(a, c).map((x) => [x.op, x.after]), [['add', 'r1']]);
  const d = JSON.parse(J(a));
  d.routes.push(d.routes.shift());
  same('a moved route is an order', Sync.diff(a, d).map((x) => x.op), ['order']);
  const e = JSON.parse(J(a));
  e.cars.splice(0, 1);
  same('a removed car is a remove, carrying the car as it was', Sync.diff(a, e), [{ op: 'remove', kind: 'car', id: 'c1', was: a.cars[0] }]);
  const f = JSON.parse(J(a));
  f.driverGroups[0].driverIds.push('d2');
  same('a day group\'s drivers are one field', Sync.diff(a, f), [{ op: 'set', kind: 'driverGroup', id: 'g1', field: 'driverIds', value: ['d1', 'd2'], was: ['d1'] }]);
  const g = JSON.parse(J(a));
  g.routes[1].id = 'r1';
  same('two routes sharing an id: the list goes whole', Sync.diff(a, g).map((x) => [x.op, x.kind, x.field]), [['set', 'meta', 'routes']]);
  const h = JSON.parse(J(a));
  delete h.cars[1].note;
  same('a field gone is a set with del', Sync.diff(a, h), [{ op: 'set', kind: 'car', id: 'c2', field: 'note', del: true, was: 'brakes' }]);
  same('and applies back', J(Sync.apply(a, Sync.diff(a, h)[0])), J(h));
  check('apply never changes its input', J(a) === J(samplePlan()));
});

await block('diff and apply: random edit sequences round-trip', () => {
  let bad = null;
  for (let seed = 1; seed <= 300 && !bad; seed++) {
    const rand = rng(seed);
    let plan = samplePlan();
    for (let step = 0; step < 25 && !bad; step++) {
      let next = plan;
      const n = 1 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) next = mutate(next, rand, `s${seed}x`);
      const changes = JSON.parse(J(Sync.diff(plan, next)));   // as it travels
      const got = Sync.applyAll(plan, changes);
      if (J(got) !== J(next)) bad = `seed ${seed} step ${step}: ${J(changes).slice(0, 300)}`;
      plan = next;
    }
  }
  check('300 random sequences of 25 edits: applyAll(prev, diff(prev, next)) is next, byte for byte', !bad, bad);
});

await block('apply is safe to repeat', () => {
  const a = samplePlan();
  const add = { op: 'add', kind: 'route', item: { id: 'rN', name: 'N' }, after: 'r2' };
  const once = Sync.apply(a, add);
  same('an add of an id already there changes nothing', J(Sync.apply(once, add)), J(once));
  same('an add after an item that is gone goes to the end', Sync.apply(a, { ...add, after: 'nope' }).routes.at(-1).id, 'rN');
  same('an add after null goes to the top', Sync.apply(a, { ...add, after: null }).routes[0].id, 'rN');
  same('a remove of one already gone changes nothing', J(Sync.apply(a, { op: 'remove', kind: 'route', id: 'nope' })), J(a));
  same('a set on one gone changes nothing', J(Sync.apply(a, { op: 'set', kind: 'route', id: 'nope', field: 'driver', value: 'X' })), J(a));
  const ord = Sync.apply(once, { op: 'order', kind: 'route', ids: ['r5', 'r4', 'r3', 'r2', 'r1', 'gone'] });
  same('an order keeps an item it does not name after the one it followed, and brings none back', ord.routes.map((r) => r.id), ['r5', 'r4', 'r3', 'r2', 'rN', 'r1']);
  for (const bad of [{ op: 'nuke', kind: 'route' }, { op: 'set', kind: 'spaceship', id: 'x', field: 'f', value: 1 }, { op: 'set', kind: 'route', id: 'r1', field: '__proto__', value: {} }, { op: 'set', kind: 'route', id: 'r1', field: 'id', value: 'r2' }, { op: 'add', kind: 'route', item: { name: 'no id' }, after: null }]) {
    let threw = false;
    try { Sync.apply(a, bad); } catch { threw = true; }
    check(`apply refuses a change this build does not know: ${J(bad)}`, threw);
  }
});

await block('collision', () => {
  const a = samplePlan();
  a.routes[0].driver = 'Bob';
  same('a set whose sender saw what is there: none', Sync.collision(a, { op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'Anna', was: 'Bob' }), null);
  same('a set over a value its sender never saw: kept and lost', Sync.collision(a, { op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'Anna', was: '' }),
    { type: 'set', kind: 'route', id: 'r1', field: 'driver', kept: 'Anna', lost: 'Bob' });
  same('the same value both ways is no collision', Sync.collision(a, { op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'Bob', was: '' }), null);
  same('a set on a removed item', Sync.collision(a, { op: 'set', kind: 'route', id: 'gone', field: 'driver', value: 'Anna', was: '' }).type, 'gone');
  same('a remove of what its sender saw: none', Sync.collision(a, { op: 'remove', kind: 'route', id: 'r1', was: a.routes[0] }), null);
  const hit = Sync.collision(a, { op: 'remove', kind: 'route', id: 'r2', was: { ...a.routes[1], driver: 'Old' } });
  same('a remove of an item changed since its sender saw it', [hit.type, hit.item.id, hit.after], ['removed', 'r2', 'r1']);
});

// The relay, the network and two or three browsers, simulated: each
// browser's replica edits, sends, and takes what comes back in the order a
// relay gives it (PROTOCOL.md §4.5: acks and others' ops on one connection
// in seq order). Edits made but not yet captured ride on top, as on screen.
function simulate(seed, { browsers = 2, steps = 400, drops = false } = {}) {
  const rand = rng(seed);
  const base = samplePlan();
  const log = [];   // [{seq, changes, oid}]
  const B = [...Array(browsers)].map((_, i) => ({ i, R: Sync.replica(0, base), screen: JSON.parse(J(base)), out: [], inn: [], acks: [], up: true }));
  const receive = (b) => {
    const m = b.inn.shift();
    const local = Sync.diff(b.R.shadow, b.screen);
    if (m.type === 'ack') { const batch = b.acks.shift(); b.R.take(m.seq, batch.changes, batch.oid); } else b.R.take(m.seq, m.changes, m.oid);
    b.R.drain();
    b.screen = Sync.applyAll(b.R.shadow, local);
  };
  const reconnect = (b) => {
    b.up = true;
    for (const e of log) b.R.take(e.seq, JSON.parse(J(e.changes)), e.oid);
    const local = Sync.diff(b.R.shadow, b.screen);
    b.R.drain();
    b.screen = Sync.applyAll(b.R.shadow, local);
  };
  const relay = (b) => {
    const m = b.out.shift();
    const seq = log.length + 1;
    log.push({ seq, changes: m.changes, oid: m.oid });
    if (b.up) b.inn.push({ type: 'ack', seq });
    for (const o of B) if (o !== b && o.up) o.inn.push({ type: 'op', seq, changes: JSON.parse(J(m.changes)), oid: m.oid });
  };
  const send = (b) => {
    if (!b.up) return;
    for (const batch of b.R.unsent()) { batch.sent = true; b.out.push({ changes: JSON.parse(J(batch.changes)), oid: batch.oid }); b.acks.push(batch); }
  };
  for (let s = 0; s < steps; s++) {
    const b = B[Math.floor(rand() * B.length)];
    const r = rand();
    if (r < 0.3) b.screen = mutate(b.screen, rand, `b${b.i}s${s}`);
    else if (r < 0.45) b.R.capture(b.screen);
    else if (r < 0.6) send(b);
    else if (r < 0.8) { if (b.out.length) relay(b); }
    else if (r < 0.97) { if (b.inn.length) receive(b); }
    else if (drops && b.up) {
      // Dropped: what was in flight either reached the relay or did not, and
      // nothing more comes back on this connection.
      while (b.out.length) { if (rand() < 0.5) relay(b); else b.out.shift(); }
      b.inn = []; b.acks = []; b.up = false; b.R.lost();
    } else if (!b.up) reconnect(b);
  }
  // Everyone back, everything captured, sent and delivered.
  for (const b of B) if (!b.up) reconnect(b);
  for (let round = 0; round < 5; round++) {
    for (const b of B) { b.R.capture(b.screen); send(b); }
    for (const b of B) while (b.out.length) relay(b);
    for (const b of B) while (b.inn.length) receive(b);
  }
  const truth = log.reduce((p, e) => Sync.applyAll(p, e.changes), base);
  return { B, truth, log };
}
await block('replicas fed the same ops in relay order end identical', () => {
  let bad = null;
  let ops = 0;
  for (let seed = 1; seed <= 150 && !bad; seed++) {
    const { B, truth, log } = simulate(seed, { browsers: 2 + (seed % 2) });
    ops += log.length;
    for (const b of B) {
      if (J(b.screen) !== J(truth)) bad = `seed ${seed}: browser ${b.i}'s screen is not the relay's plan`;
      else if (J(b.R.confirmed) !== J(truth) || b.R.queue.length) bad = `seed ${seed}: browser ${b.i} still has something unconfirmed`;
    }
  }
  check(`150 random runs of two or three browsers (${ops} ops): every screen ends as the relay's plan`, !bad, bad);
});
await block('replicas: dropped connections and catchups', () => {
  let bad = null;
  for (let seed = 1; seed <= 150 && !bad; seed++) {
    const { B, truth } = simulate(1000 + seed, { drops: true });
    for (const b of B) if (J(b.screen) !== J(truth) || J(b.R.confirmed) !== J(truth)) bad = `seed ${1000 + seed}: browser ${b.i} differs`;
  }
  check('150 runs with connections dropping mid-send: still identical', !bad, bad);
});

await block('replica: collisions are found alike on both', () => {
  const base = samplePlan();
  const A = Sync.replica(0, base);
  const B = Sync.replica(0, base);
  const sa = JSON.parse(J(base)); sa.routes[0].driver = 'Anna';
  const sb = JSON.parse(J(base)); sb.routes[0].driver = 'Bob';
  const ba = A.capture(sa);
  const bb = B.capture(sb);
  // The relay takes B's first, then A's.
  B.take(1, bb.changes, bb.oid); const fb1 = B.drain().flags;
  A.take(1, JSON.parse(J(bb.changes)), bb.oid); const fa1 = A.drain().flags;
  same('A keeps its own on screen while it is unconfirmed', A.shadow.routes[0].driver, 'Anna');
  A.take(2, ba.changes, ba.oid); const fa2 = A.drain().flags;
  B.take(2, JSON.parse(J(ba.changes)), ba.oid); const fb2 = B.drain().flags;
  same('no collision before the second arrives', [fa1, fb1], [[], []]);
  same('the second to reach the relay wins, on both', [A.shadow.routes[0].driver, B.shadow.routes[0].driver], ['Anna', 'Anna']);
  same('and both find the same collision: Anna kept, Bob lost', [fa2, fb2], [[{ type: 'set', kind: 'route', id: 'r1', field: 'driver', kept: 'Anna', lost: 'Bob' }], [{ type: 'set', kind: 'route', id: 'r1', field: 'driver', kept: 'Anna', lost: 'Bob' }]]);

  // A removes route 2 while B edits it; B's edit arrives after the remove.
  const s2a = JSON.parse(J(A.shadow)); s2a.routes.splice(1, 1);
  const s2b = JSON.parse(J(B.shadow)); s2b.routes[1].driver = 'Cato';
  const ra = A.capture(s2a); const rb = B.capture(s2b);
  A.take(3, ra.changes, ra.oid); A.drain(); B.take(3, JSON.parse(J(ra.changes)), ra.oid); B.drain();
  A.take(4, JSON.parse(J(rb.changes)), rb.oid); const ga = A.drain().flags;
  B.take(4, rb.changes, rb.oid); const gb = B.drain().flags;
  same('an edit to a removed route: the route stays removed', [A.shadow.routes.some((r) => r.id === 'r2'), B.shadow.routes.some((r) => r.id === 'r2')], [false, false]);
  check('and both offer it back with the edit, after the route it followed', J(ga) === J(gb) && ga[0].type === 'removed' && ga[0].item.driver === 'Cato' && ga[0].after === 'r1', J([ga, gb]));

  // Both orders: B edits route 3 first, A removes it without having seen it.
  const s3b = JSON.parse(J(B.shadow)); s3b.routes[1].driver = 'Dina';
  const s3a = JSON.parse(J(A.shadow)); s3a.routes.splice(1, 1);
  const eb = B.capture(s3b); const ea = A.capture(s3a);
  B.take(5, eb.changes, eb.oid); B.drain(); A.take(5, JSON.parse(J(eb.changes)), eb.oid); A.drain();
  A.take(6, ea.changes, ea.oid); const ha = A.drain().flags;
  B.take(6, JSON.parse(J(ea.changes)), ea.oid); const hb = B.drain().flags;
  check('a remove of a route edited meanwhile: both offer it back with that edit', J(ha) === J(hb) && ha[0] && ha[0].type === 'removed' && ha[0].item.driver === 'Dina', J([ha, hb]));
  same('and the two replicas are one plan', J(A.confirmed), J(B.confirmed));
});

await block('replica: a field held back, and what its was says', () => {
  const base = samplePlan();
  const A = Sync.replica(0, base);
  const s = JSON.parse(J(base)); s.routes[0].driver = 'Typed'; s.routes[1].driver = 'Other';
  const key = Sync.fieldKey('route', 'r1', 'driver');
  const b1 = A.capture(s, { skip: (c) => c.op === 'set' && Sync.fieldKey(c.kind, c.id, c.field) === key });
  same('a skipped field stays out of the batch', b1.changes.map((c) => c.id), ['r2']);
  same('and out of the shadow, so it is still to send', A.shadow.routes[0].driver, '');
  const b2 = A.capture(s, { was: new Map([[key, 'Seen']]) });
  same('sent later, with the was it is told', b2.changes, [{ op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'Typed', was: 'Seen' }]);
  let threw = false;
  A.take(1, [{ op: 'warp', kind: 'route' }]);
  try { A.drain(); } catch { threw = true; }
  check('an op holding a change this build does not know throws, and applies nothing', threw && A.seq === 0);
});

await block('replica: a snapshot past it, with edits of its own queued', () => {
  const base = samplePlan();
  const A = Sync.replica(0, base);
  const B = Sync.replica(0, base);
  const ops = [];
  let plan = base;
  for (let i = 1; i <= 5; i++) {
    const next = JSON.parse(J(plan)); next.routes[i % 5].round = String(i);
    ops.push({ seq: i, changes: Sync.diff(plan, next) });
    plan = next;
  }
  for (const o of ops) A.take(o.seq, o.changes);
  A.drain();
  // B was away for all five, then edited; the room compacted at 4.
  const mine = JSON.parse(J(B.shadow)); mine.routes[0].driver = 'Away Edit';
  B.capture(mine);
  B.reset(4, A.confirmed.routes ? Sync.applyAll(base, ops.slice(0, 4).flatMap((o) => o.changes)) : null);
  B.take(5, ops[4].changes);
  B.drain();
  same('reset to a snapshot, then its ops: the room\'s plan', J(B.confirmed), J(A.confirmed));
  same('with this browser\'s own edit still on top', B.shadow.routes[0].driver, 'Away Edit');
  same('and still to send', B.unsent().length, 1);
});

await block('replica: an edit to an item gone with no record of its removal', () => {
  const base = samplePlan();
  const without = (plan, id) => ({ ...JSON.parse(J(plan)), routes: plan.routes.filter((r) => r.id !== id) });
  // The remover reloaded since: its replica starts without r2, and nothing
  // in it says r2 was ever there. The other's edit to r2 arrives late.
  const A = Sync.replica(1, without(base, 'r2'));
  A.take(2, [{ op: 'set', kind: 'route', id: 'r2', field: 'driver', value: 'Late', was: '' }], 'b'.repeat(16));
  const fa = A.drain().flags;
  same('a late edit to an item removed before a reload is still flagged, with what it set', fa.map((f) => [f.type, f.kind, f.id, f.field, f.value, f.item]), [['removed', 'route', 'r2', 'driver', 'Late', null]]);

  // A snapshot past this browser drops the item it has an edit queued for:
  // the edit is flagged at once, with the item as this browser had it.
  const B = Sync.replica(0, base);
  const mine = JSON.parse(J(base)); mine.routes[1].driver = 'Mine';
  const bb = B.capture(mine);
  B.reset(1, without(base, 'r2'));
  const fb = B.drain().flags;
  same('reset to a snapshot without an item this browser edited: flagged, with its edit and place', fb.map((f) => [f.type, f.id, f.field, f.item && f.item.driver, f.after]), [['removed', 'r2', 'driver', 'Mine', 'r1']]);
  same('and the item is gone from the screen\'s plan', B.shadow.routes.some((r) => r.id === 'r2'), false);
  B.take(2, bb.changes, bb.oid);
  const fb2 = B.drain().flags;
  same('its own edit coming back still carries the item, to put back', fb2.map((f) => [f.type, f.id, f.item && f.item.driver]), [['removed', 'r2', 'Mine']]);
});

// --- round 3, pack 5: when each change was made ---
await block('times: a batch says when it was made, and an op carries it', () => {
  const base = samplePlan();
  const R = Sync.replica(0, base);
  const t0 = Date.now();
  const screen = JSON.parse(J(base)); screen.routes[0].driver = 'Anna';
  const b1 = R.capture(screen);
  check('a batch is stamped with the time it was taken, by default', Number.isFinite(b1.at) && b1.at >= t0 && b1.at <= Date.now(), String(b1.at));
  screen.routes[1].driver = 'Bob';
  const b2 = R.capture(screen, { at: 1760000000000 });
  same('or with the time it is given', b2.at, 1760000000000);
  // Sequenced: the op's own time comes back with it, and a flag it raises
  // carries it.
  R.take(1, b1.changes, b1.oid, b1.at);
  R.take(2, [{ op: 'set', kind: 'route', id: 'r2', field: 'driver', value: 'Other', was: '' }], 'theirs', 1760000300000);
  R.take(3, [{ op: 'set', kind: 'route', id: 'r3', field: 'driver', value: 'Old', was: '' }], null);
  const res = R.drain();
  same('drain says which ops it applied, whose, and when they were made', res.ops.map((o) => [o.seq, o.own, o.at]), [[1, true, b1.at], [2, false, 1760000300000], [3, false, null]]);
  same('with their changes', res.ops[2].changes.map((c) => c.value), ['Old']);
  same('the queue keeps the batch not yet sequenced, with its time', R.queue.map((b) => b.at), [1760000000000]);
  R.take(4, b2.changes, b2.oid, b2.at);
  same('an op whose was it never saw: the flag carries the op\'s time', R.drain().flags.map((f) => [f.type, f.kept, f.lost, f.opAt]), [['set', 'Bob', 'Other', 1760000000000]]);
  const Q = Sync.replica(0, base);
  Q.take(1, [{ op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'X', was: 'nope' }], null, 'not a time');
  const q = Q.drain();
  same('an op with no time (0.16.0 and before): at null, and its flag says no time', [q.ops[0].at, 'opAt' in q.flags[0]], [null, false]);
});

await block('changeKey: what a change is about', () => {
  same('a set: its field', Sync.changeKey({ op: 'set', kind: 'route', id: 'r1', field: 'driver', value: 'x' }), Sync.fieldKey('route', 'r1', 'driver'));
  same('a meta set: the field', Sync.changeKey({ op: 'set', kind: 'meta', field: 'date', value: 'x' }), Sync.fieldKey('meta', null, 'date'));
  same('an add and a remove of one item: the same key', Sync.changeKey({ op: 'add', kind: 'car', item: { id: 'c9' }, after: null }), Sync.changeKey({ op: 'remove', kind: 'car', id: 'c9' }));
  check('an item\'s key is none of its fields\'', Sync.itemKey('car', 'c9') !== Sync.fieldKey('car', 'c9', '') && !Sync.fieldKey('car', 'c9', 'reg').startsWith(`${Sync.itemKey('car', 'c9')}\u0001`));
  same('an order: its list', Sync.changeKey({ op: 'order', kind: 'route', ids: [] }), Sync.changeKey({ op: 'order', kind: 'route', ids: ['r1'] }));
});

// --- round 3, pack 5: offline work against the room's, before it is sent ---
const T = (hhmm) => Date.parse(`2026-10-09T${hhmm}:00Z`);
const setC = (id, field, value, was) => ({ op: 'set', kind: 'route', id, field, value, was });
await block('overlap: what sending offline work would write over', () => {
  const base = samplePlan();
  const route = (id) => base.routes.find((r) => r.id === id);
  const mine = [{ at: T('09:10'), changes: [setC('r1', 'driver', 'Mine', '')] }, { at: T('09:14'), changes: [setC('r3', 'round', '5', '')] }];
  const theirs = [{ at: T('09:18'), changes: [setC('r1', 'driver', 'Theirs', '')] }, { at: T('09:20'), changes: [setC('r4', 'driver', 'Elsewhere', '')] }];
  const o = Sync.overlap(base, mine, theirs);
  same('one field both changed: one clash, with both values and both times', o.changes.filter((e) => e.clash).map((e) => [e.kind, e.id, e.field, e.value, e.was, e.at, e.clash.type, e.clash.theirs, e.clash.at]),
    [['route', 'r1', 'driver', 'Mine', '', T('09:10'), 'set', 'Theirs', T('09:18')]]);
  same('every change of mine is listed, in plan order, with its time', o.changes.map((e) => [e.id, e.field, e.at, !!e.clash]), [['r1', 'driver', T('09:10'), true], ['r3', 'round', T('09:14'), false]]);
  same('with the item it is about, for its name', o.changes.map((e) => e.item && e.item.name), ['1', '3']);
  same('the counts and the newest times on each side', [o.clashes, o.mine, o.theirs, o.clashLast], [1, { count: 2, last: T('09:14') }, { count: 2, last: T('09:20') }, T('09:18')]);

  same('both set the same value: no clash, nothing is written over', Sync.overlap(base, [{ at: 1, changes: [setC('r1', 'driver', 'Same', '')] }], [{ at: 2, changes: [setC('r1', 'driver', 'Same', '')] }]).clashes, 0);
  same('different fields of one route: no clash (both are kept)', Sync.overlap(base, [{ at: 1, changes: [setC('r1', 'driver', 'A', '')] }], [{ at: 2, changes: [setC('r1', 'round', '2', '')] }]).clashes, 0);
  same('nothing from the room: no clash', Sync.overlap(base, mine, []).clashes, 0);

  const gone = Sync.overlap(base, [{ at: 1, changes: [setC('r2', 'driver', 'On a gone route', '')] }], [{ at: T('09:30'), changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }]);
  same('the other removed a route I changed: a clash, with when it was removed', gone.changes.map((e) => [e.id, e.field, e.clash && e.clash.type, e.clash && e.clash.at, e.item.name]), [['r2', 'driver', 'removed', T('09:30'), '2']]);
  const removed = Sync.overlap(base, [{ at: T('09:05'), changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }], [{ at: T('09:31'), changes: [setC('r2', 'driver', 'Kept on it', '')] }]);
  same('I removed a route the other changed: a clash, with the route as the other has it', removed.changes.map((e) => [e.op, e.id, e.at, e.clash && e.clash.type, e.clash && e.clash.item.driver, e.clash && e.clash.at]), [['remove', 'r2', T('09:05'), 'changed', 'Kept on it', T('09:31')]]);
  same('both removed it: no clash', Sync.overlap(base, [{ at: 1, changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }], [{ at: 2, changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }]).clashes, 0);
  const date = Sync.overlap(base, [{ at: 1, changes: [{ op: 'set', kind: 'meta', field: 'date', value: '2026-10-12', was: base.date }] }], [{ at: 2, changes: [{ op: 'set', kind: 'meta', field: 'date', value: '2026-10-13', was: base.date }] }]);
  same('the date both changed: a clash on the plan itself', date.changes.map((e) => [e.kind, e.id, e.field, e.value, e.clash && e.clash.theirs]), [['meta', null, 'date', '2026-10-12', '2026-10-13']]);
  const added = Sync.overlap(base, [{ at: T('08:00'), changes: [{ op: 'add', kind: 'route', item: { id: 'rN', name: 'New' }, after: 'r5' }, { op: 'set', kind: 'route', id: 'rN', field: 'driver', value: 'On it' }] }], [{ at: 2, changes: [setC('r1', 'driver', 'X', '')] }]);
  same('a route I added: listed once, never a clash', added.changes.map((e) => [e.op, e.id, e.item.driver, e.at, e.clash]), [['add', 'rN', 'On it', T('08:00'), null]]);

  const back = Sync.overlap(base, [{ at: T('09:01'), changes: [setC('r1', 'driver', 'Briefly', '')] }, { at: T('09:02'), changes: [setC('r1', 'driver', '', 'Briefly')] }], [{ at: T('09:20'), changes: [setC('r1', 'driver', 'Theirs', '')] }]);
  same('changed and changed back, while the other changed it: still a clash, since sending it writes over theirs', back.changes.map((e) => [e.id, e.field, e.value, e.was, e.clash && e.clash.theirs]), [['r1', 'driver', '', '', 'Theirs']]);

  const untimed = Sync.overlap(base, [{ at: T('09:10'), changes: [setC('r1', 'driver', 'Mine', '')] }], [{ at: null, changes: [setC('r1', 'driver', 'From 0.16', '')] }]);
  same('the other\'s op with no time (0.16.0): the clash says unknown', [untimed.clashes, untimed.changes[0].clash.at, untimed.theirs.last, untimed.clashLast], [1, null, null, null]);
  const timed = Sync.overlap(base, [{ at: T('09:00'), times: { [Sync.fieldKey('route', 'r1', 'driver')]: T('08:45') }, changes: [setC('r1', 'driver', 'Mine', ''), setC('r2', 'driver', 'Too', '')] }], []);
  same('a batch\'s own times per change win over its at', timed.changes.map((e) => e.at), [T('08:45'), T('09:00')]);

  // The room compacted while this browser was away: its ops start from a
  // snapshot past the base, which already holds the other's earlier change.
  const snap = Sync.applyAll(base, [setC('r1', 'driver', 'In the snapshot', '')]);
  const compacted = Sync.overlap(base, [{ at: T('09:10'), changes: [setC('r1', 'driver', 'Mine', ''), setC('r2', 'driver', 'Mine too', '')] }], [{ at: T('09:40'), changes: [setC('r2', 'driver', 'After it', '')] }], snap);
  same('compacted past the base: a clash with the snapshot\'s change (no time) and with the ops after it', compacted.changes.map((e) => [e.id, e.clash && e.clash.theirs, e.clash && e.clash.at]), [['r1', 'In the snapshot', null], ['r2', 'After it', T('09:40')]]);
  same('and the room\'s count is everything since the base', compacted.theirs.count, 2);
  // An edit of this browser's sent before the connection dropped, sequenced
  // but not acked: part of the room's plan, never the other's.
  const ownOp = Sync.overlap(base, [{ at: T('09:12'), changes: [setC('r1', 'driver', 'Then this', 'First this')] }], [{ at: T('09:11'), own: true, changes: [setC('r1', 'driver', 'First this', '')] }]);
  same('this browser\'s own op, sequenced before the drop: no clash, and not counted as the other\'s', [ownOp.clashes, ownOp.theirs], [0, { count: 0, last: null }]);
  // A box typed in while the other changed it, rebuilt after a reload: its
  // was is older than the base. A live collision, flagged as it goes out,
  // not offline work.
  const typed = Sync.applyAll(base, [setC('r1', 'driver', 'Theirs, live', '')]);
  same('an edit whose was is older than the base (a held box, reloaded): no clash', Sync.overlap(typed, [{ at: 1, changes: [setC('r1', 'driver', 'Typed', '')] }], []).clashes, 0);
  check('overlap never changes what it is given', J(base) === J(samplePlan()));
});

// The review asks by line (owner, 2026-10-09: "the other person changed lines
// you also changed offline"): a route, a car, a driver… both changed anything
// on, or one removed while the other changed it. Send's merge and its flags
// stay per field (e.clash).
await block('overlap: by line, as the owner decided', () => {
  const base = samplePlan();
  const route = (id) => base.routes.find((r) => r.id === id);
  const lineOf = (o) => o.changes.map((e) => [e.id, e.field, e.line && e.line.removed, e.line && e.line.theirs.map((t) => [t.field, t.value, t.at])]);
  const fields = Sync.overlap(base, [{ at: T('09:14'), changes: [setC('r3', 'driver', 'Mine', '')] }], [{ at: T('09:20'), changes: [setC('r3', 'round', '5', '')] }]);
  same('different fields of one route: a line both changed, with what the other changed on it and when', lineOf(fields), [['r3', 'driver', false, [['round', '5', T('09:20')]]]]);
  same('one line clashes, none of its fields (both are kept on Send), and the time is the other\'s', [fields.lines, fields.clashes, fields.lineLast, fields.clashLast], [1, 0, T('09:20'), null]);
  const two = Sync.overlap(base, [{ at: T('09:14'), changes: [setC('r3', 'driver', 'Mine', ''), setC('r3', 'round', '4', '')] }], [{ at: T('09:20'), changes: [setC('r3', 'round', '5', ''), setC('r3', 'carId', 'c1', '')] }]);
  same('two changes of mine on one line: one line', [two.lines, two.clashes, two.changes.filter((e) => e.line).length], [1, 1, 2]);
  same('each marked with every field the other changed on it', two.changes[0].line.theirs.map((t) => t.field).sort(), ['carId', 'round']);
  same('other routes: no line', Sync.overlap(base, [{ at: 1, changes: [setC('r3', 'driver', 'Mine', '')] }], [{ at: 2, changes: [setC('r5', 'driver', 'Theirs', '')] }]).lines, 0);
  same('both set the same value, and nothing else on the line: no line', Sync.overlap(base, [{ at: 1, changes: [setC('r1', 'driver', 'Same', '')] }], [{ at: 2, changes: [setC('r1', 'driver', 'Same', '')] }]).lines, 0);
  const gone = Sync.overlap(base, [{ at: 1, changes: [setC('r2', 'driver', 'On a gone route', '')] }], [{ at: T('09:30'), changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }]);
  same('the other removed a route I changed: a line, removed', [gone.lines, gone.changes[0].line.removed, gone.lineLast], [1, true, T('09:30')]);
  const removed = Sync.overlap(base, [{ at: 1, changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }], [{ at: T('09:31'), changes: [setC('r2', 'round', '9', '')] }]);
  same('I removed a route the other changed: a line, with what they changed', [removed.lines, removed.changes[0].line.theirs.map((t) => [t.field, t.value])], [1, [['round', '9']]]);
  same('both removed it: no line', Sync.overlap(base, [{ at: 1, changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }], [{ at: 2, changes: [{ op: 'remove', kind: 'route', id: 'r2', was: route('r2') }] }]).lines, 0);
  const car = Sync.overlap(base, [{ at: 1, changes: [{ op: 'set', kind: 'car', id: 'c1', field: 'note', value: 'Mine', was: '' }] }], [{ at: 2, changes: [{ op: 'set', kind: 'car', id: 'c1', field: 'labelId', value: 'l1', was: '' }] }]);
  same('a car is a line too', car.lines, 1);
  same('a route I added: never a line', Sync.overlap(base, [{ at: 1, changes: [{ op: 'add', kind: 'route', item: { id: 'rN', name: 'New' }, after: 'r5' }] }], [{ at: 2, changes: [setC('r1', 'driver', 'X', '')] }]).lines, 0);
  same('the date both changed: a line', Sync.overlap(base, [{ at: 1, changes: [{ op: 'set', kind: 'meta', field: 'date', value: '2026-10-12', was: base.date }] }], [{ at: 2, changes: [{ op: 'set', kind: 'meta', field: 'date', value: '2026-10-13', was: base.date }] }]).lines, 1);
  same('this browser\'s own op on the line, sequenced before the drop: no line', Sync.overlap(base, [{ at: 2, changes: [setC('r1', 'driver', 'Then this', '')] }], [{ at: 1, own: true, changes: [setC('r1', 'round', '3', '')] }]).lines, 0);
  const typed = Sync.applyAll(base, [setC('r1', 'round', 'Theirs, live', '')]);
  same('the other\'s change from before the base: no line', Sync.overlap(typed, [{ at: 1, changes: [setC('r1', 'driver', 'Typed', '')] }], []).lines, 0);
  const snap = Sync.applyAll(base, [setC('r1', 'round', 'In the snapshot', '')]);
  same('compacted past the base: a change only in the snapshot is on the line, with no time', lineOf(Sync.overlap(base, [{ at: 1, changes: [setC('r1', 'driver', 'Mine', '')] }], [], snap)), [['r1', 'driver', false, [['round', 'In the snapshot', null]]]]);
});

await block('overlap: every field that clashes is on a line that clashes', () => {
  let bad = null;
  let fieldOnly = 0;
  for (let seed = 1; seed <= 300 && !bad; seed++) {
    const rand = rng(seed * 104729);
    const base = samplePlan();
    const side = (tag) => {
      const R = Sync.replica(0, base);
      let screen = base;
      const out = [];
      for (let i = 0, n = 1 + Math.floor(rand() * 4); i < n; i++) {
        for (let j = 0, m = 1 + Math.floor(rand() * 3); j < m; j++) screen = mutate(screen, rand, `${tag}${seed}x`);
        const b = R.capture(screen, { at: 1000 * (i + 1) });
        if (b) out.push(JSON.parse(J(b)));
      }
      return out;
    };
    const o = Sync.overlap(base, side('m'), side('t'));
    const loose = o.changes.find((e) => e.clash && !e.line);
    if (loose) bad = `seed ${seed}: ${loose.key} clashes, but not its line`;
    else if (o.lines < (o.clashes ? 1 : 0)) bad = `seed ${seed}: ${o.clashes} clashes but ${o.lines} lines`;
    if (o.lines && !o.clashes) fieldOnly++;
  }
  check('300 random sessions: no field clash off a clashing line', !bad, bad);
  check('and some lines clash with no field clashing (the owner\'s case)', fieldOnly > 10, String(fieldOnly));
});

await block('overlap: its clashes are exactly the flags sending would raise', () => {
  const keyOf = (f) => (f.type === 'set' || f.field ? Sync.fieldKey(f.kind, f.id, f.field) : Sync.itemKey(f.kind, f.id));
  let bad = null;
  let withClashes = 0;
  for (let seed = 1; seed <= 300 && !bad; seed++) {
    const rand = rng(seed * 7919);
    const base = samplePlan();
    // Each side edits offline from the same base, in batches, as captures do.
    const side = (tag) => {
      const R = Sync.replica(0, base);
      let screen = base;
      const out = [];
      for (let i = 0, n = 1 + Math.floor(rand() * 5); i < n; i++) {
        for (let j = 0, m = 1 + Math.floor(rand() * 3); j < m; j++) screen = mutate(screen, rand, `${tag}${seed}x`);
        const b = R.capture(screen, { at: 1000 * (i + 1) });
        if (b) out.push(JSON.parse(J(b)));
      }
      return out;
    };
    const mine = side('m');
    const theirs = side('t');
    const o = Sync.overlap(base, mine, theirs);
    // Send: the room holds theirs, then mine is sequenced after it.
    const X = Sync.replica(0, base);
    let seq = 0;
    for (const b of theirs) X.take(++seq, b.changes, `t${seq}`, b.at);
    X.drain();
    for (const b of mine) X.take(++seq, b.changes, `m${seq}`, b.at);
    const flagged = [...new Set(X.drain().flags.map(keyOf))].sort();
    const found = o.changes.filter((e) => e.clash).map((e) => e.key).sort();
    if (found.length) withClashes++;
    if (J(flagged) !== J(found)) bad = `seed ${seed}: flags ${J(flagged)} but overlap ${J(found)}`;
  }
  check('300 random offline sessions on both sides: overlap finds the very fields and items sending flags', !bad, bad);
  check('and the sessions were not all clash-free', withClashes > 50, String(withClashes));
});

// --- one name at the top level, and none that clash with the app's ---
{
  const declared = [...source.matchAll(/^(?:const|let|var|function|class) ([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
  same('Sync is the only top-level name sync.js declares', declared, ['Sync']);
  const names = new Set();
  for (const f of ['store.js', 'share.js', 'updates.js', 'map.js', 'app.js']) {
    for (const x of (await read(`docs/${f}`)).matchAll(/^(?:const|let|var|function|class|async function) ([A-Za-z_$][\w$]*)/gm)) names.add(x[1]);
  }
  check('no script of the app declares Sync', !names.has('Sync'));
}

console.log(failures.length ? `\n${failures.length} sync check(s) failed` : '\nsync checks passed');
process.exit(failures.length ? 1 : 0);
