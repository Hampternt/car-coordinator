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

    for (const code of [1001, 1006, 4429, 4507]) {
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
