// A relay in the test process, for the browser tests: relay/PROTOCOL.md done
// in plain JS over Playwright's WebSocket routing, so two browser contexts
// can share one room without the Rust relay. Used by scripts/sync-ui.mjs.
//
// It speaks the protocol as written: hello and create, welcome, acks,
// snapshots, versions (the newest 50), getVersion, catchup, op and presence,
// with the close codes of §5 for what it refuses. It keeps everything in
// memory, and it can be taken down and brought back like a real one.
//
// Routed sockets bypass the page's Content-Security-Policy and never show in
// page.on('websocket'), so a test that needs either uses a real address with
// no route (see sync-ui.mjs).
import nodeCrypto from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const sha256 = (token) => nodeCrypto.createHash('sha256').update(Buffer.from(token, 'base64url')).digest('hex');
const isUint = (v) => Number.isInteger(v) && v >= 0 && v < 2 ** 53;

export function fakeRelay({ createCode = 'test-create-code', maxVersions = 50 } = {}) {
  const rooms = new Map();      // roomId -> { hash, seq, snapshot, ops, versions, nextId }
  const live = new Set();       // every open routed socket: { ws, roomId, welcomed }
  const log = [];               // [{ roomId, frame }] every frame a client sent, as parsed
  let down = false;
  let dialled = 0;

  function attach(target) {
    return target.routeWebSocket(/\/rooms\/[^/]+\/ws$/, (ws) => {
      dialled++;
      const roomId = new URL(ws.url()).pathname.split('/')[2];
      // Down: the socket opens in the page (routing always does) and drops at
      // once with 1006, as a relay that is not there looks to the app.
      if (down) { ws.close({ code: 1006, reason: 'down' }); return; }
      const c = { ws, roomId, welcomed: false };
      live.add(c);
      ws.onClose(() => live.delete(c));
      ws.onMessage((text) => handle(c, text));
    });
  }

  const send = (c, obj) => c.ws.send(JSON.stringify(obj));
  const shut = (c, code) => { live.delete(c); c.ws.close({ code, reason: String(code) }); };
  const others = (c) => [...live].filter((o) => o !== c && o.roomId === c.roomId && o.welcomed);

  function handle(c, text) {
    let f;
    try { f = JSON.parse(String(text)); } catch { shut(c, 4400); return; }
    if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.type !== 'string') { shut(c, 4400); return; }
    log.push({ roomId: c.roomId, frame: f });
    const room = rooms.get(c.roomId);
    if (!c.welcomed) {
      if (f.type === 'hello') {
        if (typeof f.token !== 'string' || !TOKEN.test(f.token)) { shut(c, 4400); return; }
        if (!room || room.hash !== sha256(f.token)) { shut(c, 4401); return; }
        c.welcomed = true;
        send(c, { type: 'welcome', seq: room.seq });
        return;
      }
      if (f.type === 'create') {
        if (typeof f.token !== 'string' || !TOKEN.test(f.token) || typeof f.createCode !== 'string') { shut(c, 4400); return; }
        if (!createCode || f.createCode !== createCode) { shut(c, 4403); return; }
        if (room) { shut(c, 4409); return; }
        rooms.set(c.roomId, { hash: sha256(f.token), seq: 0, snapshot: null, ops: [], versions: [], nextId: 1 });
        c.welcomed = true;
        send(c, { type: 'created' });
        send(c, { type: 'welcome', seq: 0 });
        return;
      }
      shut(c, ['snapshot', 'op', 'version', 'getVersion', 'catchup', 'presence'].includes(f.type) ? 4401 : 4400);
      return;
    }
    const body = (v) => typeof v === 'string' && v.length > 0 && B64URL.test(v);
    switch (f.type) {
      case 'snapshot':
        if (!isUint(f.seq) || !body(f.body) || f.seq > room.seq) { shut(c, 4400); return; }
        if (!room.snapshot || f.seq >= room.snapshot.seq) {
          room.snapshot = { seq: f.seq, body: f.body };
          room.ops = room.ops.filter((o) => o.seq > f.seq);
        }
        send(c, { type: 'ack', seq: room.snapshot.seq });
        return;
      case 'op': {
        if (!body(f.body)) { shut(c, 4400); return; }
        const seq = ++room.seq;
        room.ops.push({ seq, body: f.body });
        send(c, { type: 'ack', seq });
        for (const o of others(c)) send(o, { type: 'op', seq, body: f.body });
        return;
      }
      case 'version': {
        if (!body(f.body) || !body(f.label)) { shut(c, 4400); return; }
        const v = { id: room.nextId++, at: Date.now(), label: f.label, body: f.body };
        room.versions.push(v);
        if (room.versions.length > maxVersions) room.versions.splice(0, room.versions.length - maxVersions);
        send(c, { type: 'ack', id: v.id, at: v.at });
        for (const o of others(c)) send(o, { type: 'version', id: v.id, at: v.at, label: v.label });
        return;
      }
      case 'getVersion': {
        if (!isUint(f.id)) { shut(c, 4400); return; }
        const v = room.versions.find((x) => x.id === f.id);
        send(c, v ? { type: 'version', id: v.id, at: v.at, label: v.label, body: v.body } : { type: 'noVersion', id: f.id });
        return;
      }
      case 'catchup':
        if (!isUint(f.since)) { shut(c, 4400); return; }
        send(c, {
          type: 'catchup',
          seq: room.seq,
          snapshot: room.snapshot,
          ops: room.ops.filter((o) => o.seq > f.since),
          versions: room.versions.map(({ id, at, label }) => ({ id, at, label })),
        });
        return;
      case 'presence':
        if (!body(f.body)) { shut(c, 4400); return; }
        for (const o of others(c)) send(o, { type: 'presence', body: f.body });
        return;
      default:
        shut(c, 4400);
    }
  }

  return {
    attach,
    rooms,
    log,
    // Frames of one type that clients sent, optionally for one room.
    sent: (type, roomId) => log.filter((x) => x.frame.type === type && (!roomId || x.roomId === roomId)).map((x) => x.frame),
    get dialled() { return dialled; },
    get open() { return live.size; },
    // Every open socket drops with 1006 and every new one is dropped until up().
    down() { down = true; for (const c of [...live]) shut(c, 1006); },
    up() { down = false; },
    // A room made directly, as if another browser had created it.
    makeRoom(roomId, token, { seq = 0, snapshot = null, versions = [] } = {}) {
      rooms.set(roomId, { hash: sha256(token), seq, snapshot, ops: [], versions: versions.map((v, i) => ({ id: i + 1, at: Date.now(), ...v })), nextId: versions.length + 1 });
    },
  };
}
