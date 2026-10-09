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
// 3. Receiving: who else is here, by id; gone on bye, on going quiet, and
// while this browser is offline.
const pillOf = (pg) => pg.evaluate(() => document.getElementById('syncStatus')?.textContent || '');
const pillIs = (pg, text, ms = 3000) => pageUntil(pg, (t) => document.getElementById('syncStatus')?.textContent === t, text, ms);
// Presence frames from this page vanish from now on, while it stays live:
// a browser gone quiet without a goodbye.
const silence = (pg) => pg.evaluate(() => {
  const c = room.conn, send = c.send.bind(c);
  c.send = (f) => (f && f.type === 'presence' ? true : send(f));
});
{
  const { secret, k } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  check('alone in the room: the bar says nothing more', await pillIs(a.page, 'Shared plan: Connected'), await pillOf(a.page));
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  check('the other joins: the bar says who is here, and on which tab', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Day plan', 2000), await pillOf(a.page));
  check('and the newcomer sees the one already here at once, not after a heartbeat', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Day plan', 2000), await pillOf(b.page));
  await tabTo(b.page, 'drivers');
  check('the other changes tab: the bar follows within a second', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Drivers', 1000), await pillOf(a.page));
  check('its own messages are not someone else', !(await pillOf(a.page)).includes('Kari') && !(await pillOf(b.page)).includes('Ola'));

  // Nonsense from another build: nobody, and no error.
  await b.page.evaluate(() => Promise.all([
    roomSendPresence({ schema: 6, who: 5, tab: 'plan', at: null, t: 1 }),
    roomSendPresence({ schema: 6, who: { id: 'x'.repeat(500), name: 'Long' }, tab: 'plan', at: null, t: 1 }),
    roomSendPresence({ schema: 6, who: { id: 'odd1', name: 'Odd', color: '#123456' }, tab: 'nowhere', at: { kind: 7 }, t: 1 }),
  ]));
  await wait(500);
  check('odd messages: no name from the broken ones; an unknown tab and colour are left out', !/Long/.test(await pillOf(a.page)));
  await b.page.evaluate(() => roomSendPresence({ schema: 6, who: { id: 'odd1' }, tab: 'plan', at: null, t: 1, bye: true }));
  check('a bye: gone at once', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Drivers', 1500), await pillOf(a.page));

  const bId = presenceOf(secret, k).find((m) => m.who.name === 'Ola').who.id;
  await b.page.evaluate((id) => roomSendPresence({ schema: 6, who: { id, name: 'Ola', color: 'violet' }, tab: 'drivers', at: null, t: Date.now(), bye: true }), bId);
  check('the other leaves (bye): gone from the bar at once', await pillIs(a.page, 'Shared plan: Connected', 1000), await pillOf(a.page));
  await tabTo(b.page, 'plan');
  check('and back when it next says where it is', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Day plan', 1500), await pillOf(a.page));

  relay.down();
  check('offline: nobody else is here', await pageUntil(a.page, () => !/is here/.test(document.getElementById('syncStatus')?.textContent || ''), null, 3000), await pillOf(a.page));
  relay.up();
  check('back online: both see each other again', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Day plan', 12000)
    && await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Day plan', 3000), `${await pillOf(a.page)} | ${await pillOf(b.page)}`);
  same('receiving: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// ---------------------------------------------------------------------------
// 4. Day plan marks: the other's row tinted with their name tag, their box
// ringed; following their focus within a second; back after every redraw;
// nothing moving or stopping for the person working.
const marksOf = (pg) => pg.evaluate(() => ({
  rows: [...document.querySelectorAll('#tab-plan tbody tr.presence-row')].map((r) => ({
    id: r.dataset.route,
    colour: [...r.classList].find((c) => c.startsWith('pr-c-')) || null,
    tag: r.cells[0].getAttribute('data-presence-who'),
    drawn: getComputedStyle(r.cells[0], '::before').content,
  })),
  boxes: [...document.querySelectorAll('#tab-plan .presence-box')].map((b) => `${b.closest('tr')?.dataset.route}:${b.dataset.field}`),
}));
const markedAt = (pg, id, field, ms = 1000) => pageUntil(pg, ([i, f]) => {
  const r = document.querySelector(`#tab-plan tbody tr[data-route="${i}"]`);
  return !!r && r.classList.contains('presence-row') && !!r.querySelector(`.presence-box[data-field="${f}"]`)
    && document.querySelectorAll('#tab-plan tbody tr.presence-row').length === 1;
}, [id, field], ms);
// Where every row and box of the plan is, to the pixel.
const layoutOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('#tab-plan tbody tr, #tab-plan tbody input, #tab-plan tbody select, .rail-row')]
  .map((el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(';') + `|${scrollX},${scrollY}`);
{
  const { secret } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Day plan');
  const ids = await a.page.evaluate(() => state.routes.map((r) => r.id));
  const layoutBefore = await layoutOf(b.page);
  let t0 = Date.now();
  await row(a.page, 3).locator('[data-field="driver"]').focus();
  const first = await markedAt(b.page, ids[3], 'driver');
  const took = Date.now() - t0;
  check('the other\'s row and box are marked within a second of their focus', first && took < 1000, `${first} in ${took} ms`);
  const m = await marksOf(b.page);
  same('the row: tinted in their colour, with their name tag at its start', m.rows, [{ id: ids[3], colour: 'pr-c-teal', tag: 'Kari', drawn: '"Kari"' }]);
  same('the box: ringed', m.boxes, [`${ids[3]}:driver`]);
  check('the tint is painted over the row', await b.page.evaluate((i) => /gradient/.test(getComputedStyle(document.querySelector(`tr[data-route="${i}"] td`)).backgroundImage), ids[3]));
  same('nothing on the page moved for the one looking', await layoutOf(b.page), layoutBefore);
  same('and the tag takes no click', await b.page.evaluate((i) => getComputedStyle(document.querySelector(`tr[data-route="${i}"] td`), '::before').pointerEvents, ids[3]), 'none');
  check('nobody marks their own place', (await marksOf(a.page)).rows.length === 0);

  // Coming, going, changing tab and moving: only the marks and the bar's
  // words change here, never a redraw of the page.
  await b.page.evaluate(() => { window.__renders = 0; const real = render; window.render = (...x) => { window.__renders++; return real(...x); }; });
  await tabTo(a.page, 'cars');
  check('the other changes tab: the bar says so', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Cars', 1000), await pillOf(b.page));
  await tabTo(a.page, 'plan');
  await row(a.page, 4).locator('[data-field="driver"]').focus();
  await markedAt(b.page, ids[4], 'driver');
  same('and nothing of the page here was redrawn for it', await b.page.evaluate(() => window.__renders), 0);
  check('the bar after: back on the Day plan', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Day plan', 1000), await pillOf(b.page));

  t0 = Date.now();
  await row(a.page, 5).locator('[data-field="carId"]').focus();
  check('moving to another row\'s car box: the marks follow within a second', await markedAt(b.page, ids[5], 'carId') && Date.now() - t0 < 1000, JSON.stringify(await marksOf(b.page)));

  // Typing in the row the other is in, while they move about: every key
  // lands, the focus and the caret stay.
  await row(b.page, 5).locator('[data-field="round"]').click();
  await b.page.keyboard.press('End');
  const typed = 'Nine3';
  for (const [i, ch] of [...typed].entries()) {
    await b.page.keyboard.type(ch);
    if (i % 2 === 0) await row(a.page, i % 4 === 0 ? 5 : 6).locator(`[data-field="${i % 4 === 0 ? 'driver' : 'round'}"]`).focus();
    await wait(120);
  }
  await row(a.page, 5).locator('[data-field="driver"]').focus();
  await wait(500);
  const now = await b.page.evaluate(() => { const el = document.activeElement; return { route: el.closest('tr')?.dataset.route, field: el.dataset.field, value: el.value, caret: el.selectionStart }; });
  const wasRound = JSON.parse(PLAN).routes[5].round || '';
  same('typing in a marked row: never blocked or interrupted', now, { route: ids[5], field: 'round', value: wasRound + typed, caret: (wasRound + typed).length });
  check('and it is still marked as theirs', await markedAt(b.page, ids[5], 'driver'));

  // A redraw of the whole plan (the other's edit to a car): the marks are
  // drawn again on the new rows.
  await b.page.evaluate(() => { for (const r of document.querySelectorAll('#tab-plan tbody tr')) r.__old = true; });
  await row(a.page, 7).locator('[data-field="carId"]').selectOption({ index: 4 });
  await row(a.page, 7).locator('[data-field="carId"]').focus();
  const redrawn = await pageUntil(b.page, () => !document.querySelector('#tab-plan tbody tr').__old, null, 3000);
  check('a remote edit redraws the plan, and the marks are back on the new rows', redrawn && await markedAt(b.page, ids[7], 'carId', 1500), JSON.stringify(await marksOf(b.page)));
  same('and the focus of the one working stays where it was', await b.page.evaluate(() => [document.activeElement.closest('tr')?.dataset.route, document.activeElement.dataset.field]), [ids[5], 'round']);
  await b.page.evaluate(() => document.activeElement.blur());

  // Leaving: focus gone from the plan, or on another tab with no item.
  await a.page.evaluate(() => document.activeElement.blur());
  check('the other leaves the box: the marks go within a second', await pageUntil(b.page, () => !document.querySelector('.presence-row, .presence-box, [data-presence-who]'), null, 1000));
  await row(a.page, 2).locator('[data-field="name"]').focus();
  await markedAt(b.page, ids[2], 'name');
  relay.down();
  check('offline: the marks go', await pageUntil(b.page, () => !document.querySelector('.presence-row, .presence-box, [data-presence-who]'), null, 3000));
  relay.up();
  check('back online: they are back', await markedAt(b.page, ids[2], 'name', 12000));
  same('marks: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// ---------------------------------------------------------------------------
// 5. Elsewhere: the rail, the Drivers, Cars and Positions tabs and the
// template cards carry the same marks; the bar names the tab.
const marked = (pg, sel) => pg.evaluate((q) => [...document.querySelectorAll(q)].map((r) => {
  const start = r.tagName === 'TR' ? r.cells[0] : r;
  return { tag: start.getAttribute('data-presence-who'), drawn: getComputedStyle(start, '::before').content, colour: [...r.classList].find((c) => c.startsWith('pr-c-')) || null };
}), sel);
const ringed = (pg, sel) => pg.evaluate((q) => [...document.querySelectorAll(q)].filter((el) => el.classList.contains('presence-box')).length, sel);
{
  const { secret } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'blue' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  const plan = JSON.parse(PLAN);
  const driver = plan.drivers[2], car = plan.cars[3], pos = plan.positions[1], tpl = plan.templates.find((t) => t.routes.length);
  const KARI = [{ tag: 'Kari', drawn: '"Kari"', colour: 'pr-c-blue' }];
  const railBefore = await layoutOf(b.page);

  await tabTo(a.page, 'drivers');
  await a.page.locator(`#tab-drivers [data-kind="driver"][data-id="${driver.id}"][data-field="note"]`).focus();
  check('the other on the Drivers tab: the bar says so', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Drivers', 1500), await pillOf(b.page));
  check('in a driver\'s row there: that driver\'s rail row is marked here', await pageUntil(b.page, (id) => !!document.querySelector(`.rail-row[data-drag="driver"][data-id="${id}"].presence-row`), driver.id, 1000));
  same('with their name tag and colour', await marked(b.page, '.rail-row.presence-row'), KARI);
  same('and nothing on the rail moved', await layoutOf(b.page), railBefore);
  await tabTo(b.page, 'drivers');
  same('the Drivers tab here: the same row marked', await marked(b.page, '#tab-drivers tbody tr.presence-row'), KARI);
  same('and the note box ringed', await ringed(b.page, `#tab-drivers [data-id="${driver.id}"][data-field="note"]`), 1);

  await tabTo(a.page, 'cars');
  await a.page.locator(`#tab-cars [data-kind="car"][data-id="${car.id}"][data-field="reg"]`).focus();
  check('the Cars tab: the bar says so', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Cars', 1500), await pillOf(b.page));
  await tabTo(b.page, 'cars');
  check('the car\'s row on the Cars tab here is marked', await pageUntil(b.page, () => document.querySelectorAll('#tab-cars tbody tr.presence-row').length === 1, null, 1000));
  same('with their tag', await marked(b.page, '#tab-cars tbody tr.presence-row'), KARI);
  same('the registration ringed, here and on the rail', [await ringed(b.page, `#tab-cars [data-id="${car.id}"][data-field="reg"]`), await ringed(b.page, `.rail-row [data-id="${car.id}"][data-field="reg"]`)], [1, 1]);
  same('the driver they left is marked no more', await marked(b.page, '#tab-drivers tbody tr.presence-row, .rail-row[data-drag="driver"].presence-row'), []);
  await tabTo(b.page, 'plan');
  same('and on the Day plan\'s rail, the car\'s row', await marked(b.page, `.rail-row[data-drag="car"][data-id="${car.id}"].presence-row`), KARI);

  await tabTo(a.page, 'positions');
  await a.page.locator(`#tab-positions [data-kind="position"][data-id="${pos.id}"][data-field="name"]`).focus();
  check('the Positions tab: the bar says so', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Positions', 1500), await pillOf(b.page));
  await tabTo(b.page, 'positions');
  check('the position\'s row there is marked', await pageUntil(b.page, () => document.querySelectorAll('#tab-positions tbody tr.presence-row').length === 1, null, 1000));
  same('with their tag', await marked(b.page, '#tab-positions tbody tr.presence-row'), KARI);

  await tabTo(a.page, 'plan');
  await tabTo(b.page, 'plan');
  await a.page.locator(`.tpl-head[data-tpl="${tpl.id}"] [data-act="resave-template"]`).focus();
  check('a template card the other is on: marked here', await pageUntil(b.page, (id) => !!document.querySelector(`.tpl-head[data-tpl="${id}"].presence-row`), tpl.id, 1000));
  same('with their tag', await marked(b.page, '.tpl-head.presence-row'), KARI);
  check('the tag sits inside the card, never above it', await b.page.evaluate((id) => {
    const h = document.querySelector(`.tpl-head[data-tpl="${id}"]`);
    return getComputedStyle(h, '::before').transform === 'none';
  }, tpl.id));
  await tabTo(a.page, 'preview');
  check('the Print preview: the bar names it as the tab does', await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Print preview', 1500), await pillOf(b.page));
  check('and no row is marked: they are in none', await pageUntil(b.page, () => !document.querySelector('.presence-row'), null, 1000));
  same('elsewhere: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// ---------------------------------------------------------------------------
// 6. The quiet note: entering a row the other is in says so beside it, and
// never stops the typing.
const noteOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('[data-presence-note]')].map((el) => {
  const pseudo = el.tagName === 'TD' ? '::after' : '::before';
  return { where: el.closest('tr')?.dataset.route || el.dataset.id || el.dataset.tpl || el.tagName, text: el.getAttribute('data-presence-note'), drawn: getComputedStyle(el, pseudo).content };
}));
const anyDialog = (pg) => pg.evaluate(() => !!document.querySelector('dialog[open]'));
{
  const { secret } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  const ids = await a.page.evaluate(() => state.routes.map((r) => r.id));
  const NOTE = 'Kari is editing this line';
  await row(a.page, 3).locator('[data-field="driver"]').focus();
  await markedAt(b.page, ids[3], 'driver');
  same('no note while this browser is in no row of theirs', await noteOf(b.page), []);
  const noticesBefore = await b.page.locator('#notices').innerHTML();
  const layoutBefore = await layoutOf(b.page);
  const t0 = Date.now();
  await row(b.page, 3).locator('[data-field="round"]').click();
  check('entering the row the other is in: the quiet note, at once', await pageUntil(b.page, () => !!document.querySelector('[data-presence-note]'), null, 500), String(Date.now() - t0));
  same('beside the row, in words', await noteOf(b.page), [{ where: ids[3], text: NOTE, drawn: `"${NOTE}"` }]);
  check('not a dialog, and not a notice', !(await anyDialog(b.page)) && (await b.page.locator('#notices').innerHTML()) === noticesBefore);
  same('and nothing moved', await layoutOf(b.page), layoutBefore);
  await b.page.keyboard.press('End');
  await b.page.keyboard.type('Q7', { delay: 40 });
  const was3 = JSON.parse(PLAN).routes[3].round || '';
  same('typing goes on as ever: every key, the focus and the caret', await b.page.evaluate(() => { const el = document.activeElement; return [el.dataset.field, el.value, el.selectionStart]; }), ['round', `${was3}Q7`, `${was3}Q7`.length]);
  check('and the edit reaches the other', await pageUntil(a.page, ([i, v]) => state.routes.find((r) => r.id === i).round === v, [ids[3], `${was3}Q7`], 3000));
  check('it works both ways: the one already in the row sees the newcomer\'s note', await pageUntil(a.page, (t) => document.querySelector('[data-presence-note]')?.getAttribute('data-presence-note') === t, 'Ola is editing this line', 1500));

  await row(b.page, 4).locator('[data-field="round"]').focus();
  check('moving to another row: the note goes', await pageUntil(b.page, () => !document.querySelector('[data-presence-note]'), null, 500));
  await row(b.page, 3).locator('[data-field="name"]').focus();
  check('back in theirs: it is back', await pageUntil(b.page, (t) => document.querySelector('[data-presence-note]')?.getAttribute('data-presence-note') === t, NOTE, 500));
  await a.page.evaluate(() => document.activeElement.blur());
  check('the other leaves the row: the note goes within a second', await pageUntil(b.page, () => !document.querySelector('[data-presence-note]'), null, 1000));

  // The rail and a template card: the note takes the tag's place.
  const driver = JSON.parse(PLAN).drivers[1];
  await tabTo(a.page, 'drivers');
  await a.page.locator(`#tab-drivers [data-kind="driver"][data-id="${driver.id}"][data-field="name"]`).focus();
  await b.page.locator(`.rail-row[data-id="${driver.id}"] .rail-name`).focus();
  check('on the rail: the note in the row\'s tag', await pageUntil(b.page, ([id, t]) => {
    const li = document.querySelector(`.rail-row[data-id="${id}"]`);
    return li.getAttribute('data-presence-note') === t && getComputedStyle(li, '::before').content === `"${t}"`;
  }, [driver.id, NOTE], 1500));
  same('one note only', (await noteOf(b.page)).length, 1);
  same('the note: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// Dark mode: the tag, the tint and the ring in the dark values, still seen.
{
  const { secret } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' }, { colorScheme: 'dark' });
  const ids = await a.page.evaluate(() => state.routes.map((r) => r.id));
  await row(a.page, 1).locator('[data-field="driver"]').focus();
  check('dark: the marks are drawn', await markedAt(b.page, ids[1], 'driver', 2000));
  const look = await b.page.evaluate((i) => {
    const td = document.querySelector(`tr[data-route="${i}"] td`);
    const tag = getComputedStyle(td, '::before');
    return { page: getComputedStyle(document.body).backgroundColor, tag: tag.backgroundColor, text: tag.color, tint: getComputedStyle(td).backgroundImage, ring: getComputedStyle(document.querySelector(`tr[data-route="${i}"] [data-field="driver"]`)).boxShadow };
  }, ids[1]);
  same('dark: the page is dark', look.page, 'rgb(18, 20, 22)');
  same('dark: the tag is the light teal, with dark text on it', [look.tag, look.text], ['rgb(77, 182, 172)', 'rgb(18, 20, 22)']);
  check('dark: the tint is the dark one', look.tint.includes('rgba(77, 182, 172, 0.22)'), look.tint);
  check('dark: the ring is the light teal', look.ring.includes('rgb(77, 182, 172)'), look.ring);
  const light = await a.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presence-teal').trim());
  same('light: the same key is the darker teal', light, '#00796b');
  same('dark: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close(); await b.context.close();
}

// Quiet for a while: the heartbeat keeps saying where a browser is, and one
// gone quiet without a goodbye is let go after about 45 s.
{
  const { secret, k } = liveRoom();
  const a = await live(secret, { name: 'Kari', color: 'teal' });
  const b = await live(secret, { name: 'Ola', color: 'violet' });
  const fromA = () => presenceOf(secret, k).filter((m) => m.who.name === 'Kari');
  check('both see each other', await pillIs(a.page, 'Shared plan: Connected \u00b7 Ola is here \u00b7 Day plan') && await pillIs(b.page, 'Shared plan: Connected \u00b7 Kari is here \u00b7 Day plan'));
  await row(a.page, 1).locator('[data-field="round"]').focus();
  await row(b.page, 1).locator('[data-field="driver"]').focus();
  await wait(1000);
  check('in one row: each sees the note', (await noteOf(a.page)).length === 1 && (await noteOf(b.page)).length === 1);
  await silence(b.page);
  const quietFrom = fromA().length;
  const silentAt = Date.now();
  const rid = await a.page.evaluate(() => state.routes[1].id);
  await wait(21500);
  const beats = fromA().slice(quietFrom);
  check('nothing moving for 21 s: the heartbeat says it again', beats.length >= 1 && beats.every((m) => sameAt(m, { kind: 'route', id: rid, field: 'round' })), JSON.stringify(beats.map((m) => m.at)));
  check('and only about every 20 s', beats.length <= 2, String(beats.length));
  check('the other, quiet for 21 s, is still here', (await pillOf(a.page)).includes('Ola is here'));
  check('and their row still marked', (await marksOf(a.page)).rows.length === 1);
  check('the one still talking is kept for as long as it talks', (await pillOf(b.page)).includes('Kari is here'));
  const gone = await pillIs(a.page, 'Shared plan: Connected', 30000);
  const after = Math.round((Date.now() - silentAt) / 1000);
  check('quiet with no goodbye: let go after about 45 s', gone && after >= 44 && after <= 49, `${gone} after ${after} s`);
  check('and their marks and the note go with them', (await marksOf(a.page)).rows.length === 0 && (await marksOf(a.page)).boxes.length === 0 && (await noteOf(a.page)).length === 0);
  check('while the one still talking stays', (await pillOf(b.page)).includes('Kari is here') && (await marksOf(b.page)).rows.length === 1);
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
