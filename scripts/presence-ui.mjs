// Round 3, pack 4: who is editing (docs/presence.js), checked with two
// browsers on one fake relay, the way scripts/sync-ui.mjs does.
// Run: node scripts/presence-ui.mjs
//
// The pack's done-when line (manifests/2026-10-07-shared-plan.md), plus what
// keeps it quiet: the row the other is in is tinted with their name tag and
// the box outlined, within a second of their focus moving; entering a row the
// other is in shows the quiet note and never blocks; marks clear on leave and
// after the timeout; the top bar says who is here and on which tab; the fake
// relay never stores presence; a browser in no shared plan sends and draws
// nothing. Bodies are sealed and opened here with node's own crypto. All
// plans and names are made up.
import { chromium } from 'playwright';
import nodeCrypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startServer } from './serve.mjs';
import { fakeRelay } from './sync-fakerelay.mjs';

const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const server = await startServer();
const base = server.base;
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(50); }
  return false;
};
// Polls a condition in the page; true when it held within `ms`.
const pageUntil = (pg, fn, arg, ms = 3000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 25 }).then(() => true, () => false);

// --- PROTOCOL.md §1-2 with node's crypto ---
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const hkdf = (secret, info, len) => Buffer.from(nodeCrypto.hkdfSync('sha256', Buffer.from(secret, 'base64url'), Buffer.alloc(0), info, len));
const keysOf = (secret) => ({ roomId: b64(hkdf(secret, 'carsync room-id', 16)), token: b64(hkdf(secret, 'carsync auth-token', 32)), key: hkdf(secret, 'carsync enc-key', 32) });
const newSecret = () => b64(nodeCrypto.randomBytes(32));
const seal = (secret, kind, obj) => {
  const { roomId, key } = keysOf(secret);
  const iv = nodeCrypto.randomBytes(12);
  const c = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`${roomId}:${kind}`, 'utf8'));
  return b64(Buffer.concat([iv, c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]));
};
const unseal = (secret, kind, body) => {
  const { roomId, key } = keysOf(secret);
  const raw = Buffer.from(body, 'base64url');
  const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(`${roomId}:${kind}`, 'utf8'));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8'));
};

// Made-up plans: dev-data.json is the repo's invented fleet.
const DEV = await readFile(new URL('./fixtures/dev-data.json', import.meta.url), 'utf8');
const ROUTED = 'ws://127.0.0.1:9';   // the fake relay's address; nothing listens there
const relay = fakeRelay();
const BASE_SEED = { 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done' };

/* One browser profile, as in sync-ui.mjs: its own storage, seeded once before
   the first load, and every way it could reach the network counted. */
async function profile({ items = {}, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ colorScheme, viewport: { width: 1600, height: 1000 } });
  await relay.attach(context);
  await context.addInitScript(() => {
    window.__sockets = 0;
    const Real = window.WebSocket;
    window.WebSocket = class extends Real { constructor(...a) { window.__sockets++; super(...a); } };
  });
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    if (location.protocol === 'about:') return;
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }
  }, items);
  const errors = [];
  const requests = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  return { context, page, errors, requests };
}
const tabTo = (pg, t) => pg.click(`[data-act="tab"][data-tab="${t}"]`);

// The plan both browsers hold and the room's snapshot carries: DEV as this
// build reads it, so neither browser takes the room for another plan.
const { PLAN, SCHEMA } = await (async () => {
  const p = await profile({ items: { ...BASE_SEED, 'carcoord:v1': DEV } });
  const got = await p.page.evaluate(() => ({ PLAN: JSON.stringify(state), SCHEMA: Store.SCHEMA }));
  await p.context.close();
  return got;
})();
const SEED = { ...BASE_SEED, 'carcoord:v1': PLAN, 'carcoord:pref:relay': ROUTED };

// A fresh room holding PLAN; its id and secret.
const liveRoom = () => {
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token, { snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: SCHEMA, plan: JSON.parse(PLAN) }) } });
  return { secret, k };
};
// A browser in the room, following it live. `who` is its name and colour.
const live = async (secret, who = {}, opts = {}) => {
  const items = { ...SEED, 'carcoord:pref:room': secret };
  if (who.name) items['carcoord:pref:presenceName'] = who.name;
  if (who.color) items['carcoord:pref:presenceColor'] = who.color;
  const x = await profile({ items, ...opts });
  const ok = await pageUntil(x.page, () => typeof roomLive === 'function' && roomLive() && !!room.caught && room.conn.status === 'connected', null, 8000);
  if (!ok) console.log('  note  a browser did not reach live');
  return x;
};
// The presence frames a room's relay forwarded, opened.
const presenceOf = (secret, k) => relay.sent('presence', k.roomId).map((f) => unseal(secret, 'presence', f.body));

// ---------------------------------------------------------------------------
// 1. Name and colour: on the Shared plan card, kept per browser, never in
// the plan, and typing there is not an edit.
{
  const { secret, k } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret);
  await tabTo(a.page, 'data');
  same('the card shows the name kept on this PC', await a.page.locator('#roomCard #presenceName').inputValue(), 'Kari');
  check('and the colour picked', await a.page.locator('#presenceColour-teal').isChecked());
  check('six colours to pick from', (await a.page.locator('#roomCard input[name="presenceColour"]').count()) === 6);

  await tabTo(b.page, 'data');
  const planBefore = await b.page.evaluate(() => JSON.stringify(state));
  const opsBefore = relay.sent('op', k.roomId).length;
  same('a browser with no name yet shows an empty box', await b.page.locator('#presenceName').inputValue(), '');
  check('and still one colour picked for it', (await b.page.locator('#roomCard input[name="presenceColour"]:checked').count()) === 1);
  await b.page.locator('#presenceName').pressSequentially('Ola Nord');
  same('the box keeps the focus while typing', await b.page.evaluate(() => document.activeElement.id), 'presenceName');
  // One not picked yet, so the click is a change.
  const other = (await b.page.locator('#roomCard input[name="presenceColour"]:checked').inputValue()) === 'violet' ? 'green' : 'violet';
  await b.page.locator(`#presenceColour-${other}`).check();
  same('the name is kept per browser', await b.page.evaluate(() => localStorage.getItem('carcoord:pref:presenceName')), 'Ola Nord');
  same('so is the colour', await b.page.evaluate(() => localStorage.getItem('carcoord:pref:presenceColor')), other);
  check('neither is in the plan, the room or a Backup', await b.page.evaluate(() => !/Ola Nord|presence/.test(localStorage.getItem('carcoord:v1') + (localStorage.getItem('carcoord:backups') || '') + (localStorage.getItem('carcoord:roomBase') || ''))));
  check('typing a name is not an edit: the plan is as it was', await b.page.evaluate(() => JSON.stringify(state)) === planBefore);
  await wait(600);
  same('and no change is sent', relay.sent('op', k.roomId).length, opsBefore);

  await b.page.reload({ waitUntil: 'networkidle' });
  await tabTo(b.page, 'data');
  same('after a reload: the name is still there', await b.page.locator('#presenceName').inputValue(), 'Ola Nord');
  check('and the colour', await b.page.locator(`#presenceColour-${other}`).isChecked());
  same('the card: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// ---------------------------------------------------------------------------
// 2. Sending: where this browser is, when it moves, and nothing more.
const row = (pg, i) => pg.locator('#tab-plan tbody tr').nth(i);
const atOf = (pg) => pg.evaluate(() => { const d = document.activeElement?.dataset || {}; return d.kind ? { kind: d.kind, id: d.id || null, field: d.field || null } : null; });
const sameAt = (m, at) => JSON.stringify(m.at) === JSON.stringify(at);
{
  const { secret, k } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  const fromA = () => presenceOf(secret, k).filter((m) => m.who.name === 'Kari');
  check('joining says where this browser is, at once', await until(() => fromA().length >= 1, 3000));
  const first = fromA()[0] || {};
  check('in the contract\'s shape: schema, who, tab, at, t', first.schema === SCHEMA && /^[0-9a-f]{16}$/.test(first.who?.id) && first.who.name === 'Kari' && first.who.color === 'teal'
    && first.tab === 'plan' && first.at === null && Number.isFinite(first.t) && !('bye' in first), JSON.stringify(first));
  check('the relay was sent a presence body it cannot read', relay.sent('presence', k.roomId).every((f) => typeof f.body === 'string' && !/Kari|route/.test(f.body)));

  const rid = await a.page.evaluate(() => state.routes[2].id);
  let t0 = Date.now();
  await row(a.page, 2).locator('[data-field="driver"]').focus();
  check('focus into a driver box says so within a second', await until(() => fromA().some((m) => sameAt(m, { kind: 'route', id: rid, field: 'driver' })), 1000), String(Date.now() - t0));
  await row(a.page, 2).locator('[data-field="carId"]').focus();
  check('and into the car box of that row', await until(() => fromA().some((m) => sameAt(m, { kind: 'route', id: rid, field: 'carId' })), 1000));
  let n = fromA().length;
  await row(a.page, 2).locator('[data-field="driver"]').focus();
  await wait(400);
  n = fromA().length;
  await a.page.keyboard.type('Testy Tester', { delay: 20 });
  await wait(600);
  same('typing in the box sends nothing more: the place has not changed', fromA().length, n);

  const did = await a.page.evaluate(() => state.drivers[0].id);
  await a.page.locator(`.rail-row[data-id="${did}"] .rail-name`).focus();
  check('a rail row: the driver, by id', await until(() => fromA().some((m) => sameAt(m, { kind: 'driver', id: did, field: 'name' })), 1000));
  const tid = await a.page.evaluate(() => state.templates.find((t) => t.routes.length)?.id || null);
  if (tid) {
    await a.page.locator(`.tpl-head[data-tpl="${tid}"] [data-act="resave-template"]`).focus();
    check('a template card: the template, by id', await until(() => fromA().some((m) => m.at && m.at.kind === 'template' && m.at.id === tid), 1000));
  }
  await a.page.locator('#date').focus();
  check('the Date box: meta, with no id', await until(() => fromA().some((m) => sameAt(m, { kind: 'meta', id: null, field: 'date' })), 1000));
  await a.page.evaluate(() => document.activeElement.blur());
  check('focus gone from the plan: at is null', await until(() => { const l = fromA().at(-1); return l && l.at === null; }, 1000));
  await tabTo(a.page, 'cars');
  check('a tab change says the tab', await until(() => { const l = fromA().at(-1); return l && l.tab === 'cars'; }, 1000));
  const cid = await a.page.evaluate(() => state.cars[1].id);
  await a.page.locator(`#tab-cars [data-kind="car"][data-id="${cid}"][data-field="note"]`).focus();
  check('the Cars tab: the car\'s box', await until(() => fromA().some((m) => m.tab === 'cars' && sameAt(m, { kind: 'car', id: cid, field: 'note' })), 1000));

  // Moving fast: at most four a second, and the last place always goes.
  await tabTo(a.page, 'plan');
  await row(a.page, 0).locator('[data-field="name"]').focus();
  await wait(600);
  const before = fromA().length;
  t0 = Date.now();
  for (let i = 0; i < 40; i++) await a.page.keyboard.press('Tab');
  const spent = Date.now() - t0;
  const lastPlace = await atOf(a.page);
  await wait(700);
  const burst = fromA().length - before;
  check('forty moves in a row send at most about four a second', burst <= Math.ceil(spent / 250) + 2, `${burst} in ${spent} ms`);
  check('and the last place is the last one sent', sameAt(fromA().at(-1), lastPlace), JSON.stringify([fromA().at(-1)?.at, lastPlace]));

  // A redraw (the other's edit) puts the focus back: nothing is said again,
  // and the two do not set each other off.
  await row(a.page, 4).locator('[data-field="driver"]').focus();
  await wait(500);
  await row(b.page, 6).locator('[data-field="carId"]').selectOption({ index: 3 });
  await row(b.page, 6).locator('[data-field="round"]').focus();
  await wait(800);
  const settled = presenceOf(secret, k).length;
  await wait(2500);
  same('after the other\'s edit redraws this screen: no presence goes back and forth', presenceOf(secret, k).length - settled, 0);
  same('sending: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// ---------------------------------------------------------------------------
// Quiet for a while: the heartbeat keeps saying where this browser is.
{
  const { secret, k } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  const fromA = () => presenceOf(secret, k).filter((m) => m.who.name === 'Kari');
  await row(a.page, 3).locator('[data-field="driver"]').focus();
  await wait(1000);
  const quietFrom = fromA().length;
  const rid = await a.page.evaluate(() => state.routes[3].id);
  await wait(21500);
  const beats = fromA().slice(quietFrom);
  check('nothing moving for 21 s: the heartbeat says it again', beats.length >= 1 && beats.every((m) => sameAt(m, { kind: 'route', id: rid, field: 'driver' })), JSON.stringify(beats.map((m) => m.at)));
  check('and only about every 20 s', beats.length <= 2, String(beats.length));
  await a.context.close(); await b.context.close();
}

// A browser that only reads the room (a newer build's) says nothing either.
{
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token, { snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: SCHEMA + 1, plan: JSON.parse(PLAN) }) } });
  const p = await profile({ items: { ...SEED, 'carcoord:pref:room': secret, 'carcoord:pref:presenceName': 'Kari' } });
  check('a newer build\'s room: this one only reads it', await pageUntil(p.page, () => /^Shared plan: Update the app/.test(document.getElementById('syncStatus')?.textContent || ''), null, 5000));
  await row(p.page, 1).locator('[data-field="driver"]').focus();
  await tabTo(p.page, 'cars');
  await wait(1500);
  same('a read-only room: no presence sent', relay.sent('presence', k.roomId).length, 0);
  await p.context.close();
}

// No room: nothing of this on the card, nothing sent, nothing drawn.
{
  const p = await profile({ items: { ...SEED, 'carcoord:pref:presenceName': 'Kari' } });
  await row(p.page, 1).locator('[data-field="driver"]').focus();
  for (const t of ['drivers', 'cars', 'positions', 'data', 'plan']) await tabTo(p.page, t);
  await tabTo(p.page, 'data');
  check('no room: no name and colour on the card', (await p.page.locator('#presenceName').count()) === 0);
  await wait(1500);
  same('no room: no WebSocket is ever made', await p.page.evaluate(() => window.__sockets), 0);
  same('no room: no request leaves the app\'s own server', p.requests, []);
  same('no room: no console errors', p.errors, []);
  await p.context.close();
}

await browser.close();
await server.close();
console.log(failures.length ? `\n${failures.length} presence-ui check(s) failed` : '\npresence-ui checks passed');
process.exit(failures.length ? 1 : 0);
