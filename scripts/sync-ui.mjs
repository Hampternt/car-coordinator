// The shared plan in a real browser: the Data tab's Shared plan card, the
// status in the bar, and what the app sends and refuses to send. Run:
// node scripts/sync-ui.mjs
//
// The relay is scripts/sync-fakerelay.mjs, PROTOCOL.md in JS behind
// Playwright's WebSocket routing, shared by every browser context here as
// two managers' PCs share the real one. Bodies are sealed and opened on this
// side with node's own crypto, never with sync.js, so a mistake there cannot
// hide itself. All plans are made up.
import { chromium } from 'playwright';
import net from 'node:net';
import nodeCrypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startServer } from './serve.mjs';
import { fakeRelay } from './sync-fakerelay.mjs';

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
// Polls a condition in node, for what the relay saw.
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(50); }
  return false;
};

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

// A port nothing listens on: a relay that is not there, reached for real.
const deadPort = async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
};

// Made-up plans: dev-data.json is the repo's invented fleet.
const DEV = await readFile(new URL('./fixtures/dev-data.json', import.meta.url), 'utf8');
const ROUTED = 'ws://127.0.0.1:9';   // the fake relay's address; nothing listens there
const relay = fakeRelay();

/* One browser profile: its own localStorage, seeded once before the first
   load (sessionStorage remembers it across reloads), and every way it could
   reach the network counted: WebSocket constructions (counted inside the
   page, so even one the page's policy blocks), real sockets, and requests to
   anywhere but the app's own server. */
async function profile({ items = {}, routed = true } = {}) {
  const context = await browser.newContext();
  if (routed) await relay.attach(context);
  await context.addInitScript((seed) => {
    if (location.protocol === 'about:') return;
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }
    window.__sockets = 0;
    const Real = window.WebSocket;
    window.WebSocket = class extends Real { constructor(...a) { window.__sockets++; super(...a); } };
  }, items);
  const page = await context.newPage();
  const errors = [];
  const sockets = [];
  const requests = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('websocket', (ws) => sockets.push(ws.url()));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  return { context, page, errors, sockets, requests };
}
const pill = (pg) => pg.locator('#syncStatus');
const pillSays = async (pg, text, ms = 5000) => {
  try { await pg.waitForFunction((t) => document.getElementById('syncStatus')?.textContent === `Shared plan: ${t}`, text, { timeout: ms }); return true; } catch { return false; }
};
const TABS = ['plan', 'drivers', 'cars', 'positions', 'labels', 'data', 'preview'];

// ---------------------------------------------------------------------------
// No room: exactly as before, and not one connection.
{
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done' } });
  for (const t of TABS) await p.page.click(`[data-act="tab"][data-tab="${t}"]`);
  await p.page.click('[data-act="tab"][data-tab="data"]');
  await wait(2500);
  same('no room: no WebSocket is ever made', await p.page.evaluate(() => window.__sockets), 0);
  same('no room: no socket reaches the network', p.sockets, []);
  same('no room: no request leaves the app\'s own server', p.requests, []);
  check('no room: no status in the bar', (await pill(p.page).count()) === 0);
  same('no room: the Data tab still says nothing is sent', await p.page.locator('#tab-data > .hint').first().innerText(), 'Everything you type stays on this PC. This page never sends it anywhere.');
  check('no room: the Shared plan card is there, offering to start one', (await p.page.locator('#roomCard h3').innerText()).startsWith('Shared plan'));
  same('no room: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// In a room: connected, caught up, offline when the relay goes, and back.
{
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token);
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED, 'carcoord:pref:room': secret } });
  check('in a room: the bar says Connected', await pillSays(p.page, 'Connected'), await pill(p.page).textContent().catch(() => 'no pill'));
  check('it said hello with the room\'s token', relay.sent('hello', k.roomId).some((f) => f.token === k.token));
  check('and caught up', await until(() => relay.sent('catchup', k.roomId).length === 1));
  await p.page.click('[data-act="tab"][data-tab="data"]');
  same('the Data card says so', await p.page.locator('#roomStatus').innerText(), 'Connected to the shared plan.');
  check('the Data tab no longer says nothing is ever sent', !(await p.page.locator('#tab-data > .hint').first().innerText()).includes('never sends'));

  relay.down();
  check('the relay gone: the bar says Offline', await pillSays(p.page, 'Offline'), await pill(p.page).textContent());
  check('and the card says it is working locally', (await p.page.locator('#roomStatus').innerText()).startsWith('Offline, working locally.'));
  await p.page.click('[data-act="tab"][data-tab="plan"]');
  const box = p.page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]');
  await box.fill('Offline Olsen');
  check('editing still works offline, and is saved on this PC', await p.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:v1')).routes[0].driver === 'Offline Olsen'));
  const hellos = relay.sent('hello', k.roomId).length;
  relay.up();
  check('the relay back: Connected again', await pillSays(p.page, 'Connected', 10000), await pill(p.page).textContent());
  check('having said hello again', relay.sent('hello', k.roomId).length > hellos);
  check('and caught up again', relay.sent('catchup', k.roomId).length >= 2);
  same('in a room: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// A relay that is really not there, through the page's real security policy.
{
  const port = await deadPort();
  const secret = newSecret();
  const p = await profile({ routed: false, items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': `ws://127.0.0.1:${port}`, 'carcoord:pref:room': secret } });
  check('unreachable: the bar says Offline', await pillSays(p.page, 'Offline'), await pill(p.page).textContent().catch(() => 'no pill'));
  check('the socket was really made, so the policy lets ws://127.0.0.1 through', p.sockets.length >= 1, JSON.stringify(p.sockets));
  const box = p.page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]');
  await box.fill('Nowhere Nilsen');
  check('editing still works', await p.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:v1')).routes[0].driver === 'Nowhere Nilsen'));
  // Chrome logs every failed socket as an error; that is the only one allowed.
  const other = p.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/rooms\/[A-Za-z0-9_-]{22}\/ws' failed/.test(e));
  same('unreachable: nothing broke the policy, and no other console errors', other, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// A room the relay does not know: refused, and never knocked on again.
{
  const secret = newSecret();
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED, 'carcoord:pref:room': secret } });
  check('an unknown room: the bar says Refused', await pillSays(p.page, 'Refused'), await pill(p.page).textContent().catch(() => 'no pill'));
  const tries = relay.sent('hello', keysOf(secret).roomId).length;
  await wait(2500);
  same('and it does not try again', relay.sent('hello', keysOf(secret).roomId).length, tries);
  await p.page.click('[data-act="tab"][data-tab="data"]');
  check('the card says the relay does not know it, and the plan is still here', /does not know this shared plan.*still on this PC/.test(await p.page.locator('#roomStatus').innerText()));
  same('an unknown room: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// Create: a wrong code makes nothing; the right one seeds the room from this
// plan, and the invite link and its QR are shown.
const SEED = { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED };
// Every value this browser stores, but the room's own pref, joined: where the
// secret and the token must never turn up.
const elsewhere = (pg) => pg.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'carcoord:pref:room').map((k) => `${k}=${localStorage.getItem(k)}`).join('\n'));
const noticeSays = async (pg, re, ms = 5000) => {
  try { await pg.waitForFunction((src) => new RegExp(src).test(document.getElementById('notices').innerText), re.source, { timeout: ms }); return true; } catch { return false; }
};
let created = null;   // { secret, plan }: the room the next sections join
{
  const p = await profile({ items: SEED });
  await p.page.click('[data-act="tab"][data-tab="data"]');
  const rooms = relay.rooms.size;
  await p.page.click('[data-act="room-create"]');
  check('Create with no code asks for one, and calls nobody', await noticeSays(p.page, /Type the create code first/) && await p.page.evaluate(() => window.__sockets) === 0);
  await p.page.fill('#roomCode', 'not-the-code');
  await p.page.click('[data-act="room-create"]');
  check('a wrong create code: said so', await noticeSays(p.page, /create code was not accepted/), await p.page.locator('#notices').innerText());
  check('and nothing made or remembered', relay.rooms.size === rooms && await p.page.evaluate(() => localStorage.getItem('carcoord:pref:room') === null && document.getElementById('syncStatus') === null));

  relay.down();
  await p.page.fill('#roomCode', 'test-create-code');
  await p.page.click('[data-act="room-create"]');
  check('the server unreachable: said so, nothing remembered', await noticeSays(p.page, /Could not reach the shared plan's server/) && await p.page.evaluate(() => localStorage.getItem('carcoord:pref:room') === null));
  relay.up();
  const dialled = relay.dialled;
  await wait(2500);
  same('and a failed Create does not keep knocking', relay.dialled, dialled);

  await p.page.fill('#roomCode', 'test-create-code');
  await p.page.press('#roomCode', 'Enter');
  check('the right code: the bar says Connected', await pillSays(p.page, 'Connected'), await pill(p.page).textContent().catch(() => 'no pill'));
  const secret = await p.page.evaluate(() => localStorage.getItem('carcoord:pref:room'));
  check('the room\'s secret is kept under carcoord:pref:room', /^[A-Za-z0-9_-]{43}$/.test(String(secret)), secret);
  const k = keysOf(secret);
  const stored = relay.rooms.get(k.roomId);
  check('the relay holds the room under its id, and only the token\'s hash', !!stored && stored.hash === nodeCrypto.createHash('sha256').update(Buffer.from(k.token, 'base64url')).digest('hex'));
  const snap = stored && stored.snapshot && unseal(secret, 'snapshot', stored.snapshot.body);
  const onScreen = await p.page.evaluate(() => JSON.stringify(state));
  check('its snapshot opens, with this key, to this plan', !!snap && snap.schema === 6 && JSON.stringify(snap.plan) === onScreen);
  same('at seq 0', stored && stored.snapshot.seq, 0);
  same('the create frame carried the code', relay.sent('create', k.roomId).map((f) => f.createCode), ['test-create-code']);
  same('the invite link is this page plus #join=', await p.page.locator('#roomInvite').inputValue(), `${base}#join=${secret}`);
  check('and is drawn as a QR beside it', (await p.page.locator('#roomCard .room-qr svg path').count()) === 1);
  const rest = await elsewhere(p.page);
  check('neither the secret nor the token is stored anywhere else', !rest.includes(secret) && !rest.includes(k.token));
  check('nor in the plan, which is what Export writes', !onScreen.includes(secret) && !onScreen.includes(k.token));
  check('the create code is kept nowhere', !rest.includes('test-create-code') && !(await p.page.evaluate(() => localStorage.getItem('carcoord:pref:room'))).includes('test-create-code'));
  await p.page.goto(`${base}recover.html`, { waitUntil: 'networkidle' });
  const page = await p.page.locator('body').innerText();
  check('recover.html lists the plan but never the shared plan\'s secret', page.includes('The plan and setup') && !page.includes(secret) && !page.includes('carcoord:pref:room'));
  same('Create: no console errors', p.errors, []);
  created = { secret, plan: JSON.parse(onScreen) };
  await p.context.close();
}

// ---------------------------------------------------------------------------
// Join: the other PC opens the invite. The fragment goes at once; Not now
// changes nothing; Take backs this plan up and puts the room's in its place.
const OTHER = await readFile(new URL('./fixtures/shared-plan-other-pc.json', import.meta.url), 'utf8');
const OTHER_SEED = { 'carcoord:v1': OTHER, 'carcoord:pref:seenUpdate': '0.14.1', 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED };
const kept = (pg) => pg.evaluate(() => ({ plan: localStorage.getItem('carcoord:v1'), backups: localStorage.getItem('carcoord:backups'), room: localStorage.getItem('carcoord:pref:room') }));
// An invite opened the way a link is: a fresh load of the page.
const openInvite = async (pg, hash) => { await pg.goto('about:blank'); await pg.goto(`${base}${hash}`, { waitUntil: 'networkidle' }); };
const href = (pg) => pg.evaluate(() => location.href);
const dialogSays = async (pg, re, ms = 5000) => {
  try { await pg.waitForFunction((src) => { const d = document.getElementById('roomDlg'); return !!d && d.open && new RegExp(src).test(d.innerText); }, re.source, { timeout: ms }); return true; } catch { return false; }
};
{
  const { secret } = created;
  const k = keysOf(secret);
  const p = await profile({ items: OTHER_SEED });
  // A first save, so carcoord:v1 is this build's own text before the invite.
  await p.page.evaluate(() => { save(); });
  const before = await kept(p.page);
  const hellos = relay.sent('hello', k.roomId).length;
  await openInvite(p.page, `#join=${secret}`);
  check('the invite is stripped from the address bar', await href(p.page) === base, await href(p.page));
  check('an invite opens the offer, with a preview', await dialogSays(p.page, /Join this shared plan\?[\s\S]*holds 15 routes/), await p.page.locator('#roomDlg').innerText().catch(() => 'no dialog'));
  const offer = await p.page.locator('#roomDlg').innerText();
  check('which says it replaces everything, and that a backup is taken first', /Taking it replaces everything on screen[\s\S]*Backups first/.test(offer));
  check('and names the cars, templates and day groups only on this PC, as staying in that Backup',
    /kept in that Backup/.test(offer) && /Cars: ZZ 90001, ZZ 90002/.test(offer) && /Templates: Holiday rota/.test(offer) && /Day groups: Night crew/.test(offer) && /Positions: Back yard/.test(offer), offer);
  check('but not what the shared plan has too', !/EL 41027/.test(offer) && !/Templates:[^\n]*Saturday/.test(offer));
  check('opening the offer said hello to the room, once', relay.sent('hello', k.roomId).length === hellos + 1);
  check('nothing is kept before the answer', (await kept(p.page)).room === null && (await pill(p.page).count()) === 0);

  await p.page.click('[data-act="room-notnow"]');
  check('Not now closes the offer', !(await p.page.evaluate(() => document.getElementById('roomDlg').open)));
  same('Not now: the plan, Backups and the room pref are exactly as they were', await kept(p.page), before);
  await wait(2500);
  same('and the offer\'s connection is gone for good', [relay.open, relay.sent('hello', k.roomId).length], [0, hellos + 1]);
  check('Not now: no status in the bar', (await pill(p.page).count()) === 0);

  // A mangled invite: stripped, and nothing else at all.
  const sockets = await p.page.evaluate(() => window.__sockets);
  await openInvite(p.page, `#join=${secret.slice(0, 30)}`);
  check('a mangled invite is stripped too', await href(p.page) === base, await href(p.page));
  check('and opens nothing', !(await p.page.evaluate(() => !!document.getElementById('roomDlg')?.open)) && await p.page.evaluate(() => window.__sockets) === 0, String(sockets));

  // Pasted into the address bar of the open page: only the fragment changes,
  // and Esc is Not now as well.
  await p.page.evaluate((h) => { location.hash = h; }, `#join=${secret}`);
  await dialogSays(p.page, /holds 15 routes/);
  await p.page.keyboard.press('Escape');
  check('an invite pasted into the open page is offered and stripped as well', await href(p.page) === base, await href(p.page));
  check('Esc on the offer changes nothing either', JSON.stringify(await kept(p.page)) === JSON.stringify(before));

  await openInvite(p.page, `#join=${secret}`);
  await dialogSays(p.page, /holds 15 routes/);
  await p.page.click('[data-act="room-take"]');
  const after = await kept(p.page);
  same('Take: the room is kept under carcoord:pref:room', after.room, secret);
  const backups = JSON.parse(after.backups || '[]');
  // Labelled for the join, or the Start of day backup when that already held
  // exactly this plan: Store.snapshot never stores the same plan twice running.
  check('Take: this PC\'s own plan is the newest Backup',
    backups.length > 0 && ['Before joining the shared plan', 'Start of day'].includes(backups[0].label) && backups[0].json === JSON.stringify(JSON.parse(before.plan)), JSON.stringify(backups.map((b) => b.label)));
  same('and the plan is now the shared one', await p.page.evaluate(() => JSON.stringify(state)), JSON.stringify(created.plan));
  same('saved as such', after.plan, JSON.stringify(created.plan));
  check('Take: the bar says Connected', await pillSays(p.page, 'Connected'));
  const rest = await elsewhere(p.page);
  check('Take: the secret is in no Backup and nowhere else', !rest.includes(secret) && !rest.includes(k.token));
  check('Take: no dialog left open', !(await p.page.evaluate(() => document.getElementById('roomDlg').open)));
  same('Join: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// Push: a named version from one browser shows in the other's list at once,
// and becomes the plan a later Take gets.
const inRoom = (seed, secret) => ({ ...seed, 'carcoord:pref:room': secret });
const versionNames = (pg) => pg.locator('#roomCard .room-versions .room-v-name').allInnerTexts();
let pushed = null;   // { id, plan } for the Restore section
{
  const { secret } = created;
  const k = keysOf(secret);
  const a = await profile({ items: inRoom(SEED, secret) });
  const b = await profile({ items: inRoom({ ...OTHER_SEED, 'carcoord:v1': JSON.stringify(created.plan) }, secret) });
  for (const x of [a, b]) { await pillSays(x.page, 'Connected'); await x.page.click('[data-act="tab"][data-tab="data"]'); }
  same('no versions yet', await a.page.locator('#roomCard .empty').innerText(), 'No versions pushed yet.');

  await a.page.click('[data-act="room-push"]');
  check('Push with no name asks for one, and sends nothing', await noticeSays(a.page, /Name the version first/) && relay.sent('version', k.roomId).length === 0);

  // An edit, so the version is this browser's plan and not the room's.
  await a.page.click('[data-act="tab"][data-tab="plan"]');
  await a.page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').fill('Pushed Pedersen');
  await a.page.click('[data-act="tab"][data-tab="data"]');
  await a.page.fill('#roomVersionName', '  Monday   final ');
  await a.page.press('#roomVersionName', 'Enter');
  check('Push: said so', await noticeSays(a.page, /Pushed \u201cMonday final\u201d to the shared plan/), await a.page.locator('#notices').innerText());
  same('and it is in this browser\'s list', await versionNames(a.page), ['Monday final']);
  const room = relay.rooms.get(k.roomId);
  const v = room.versions[room.versions.length - 1];
  const aPlan = await a.page.evaluate(() => JSON.stringify(state));
  same('the relay holds its name sealed as a label', unseal(secret, 'label', v.label), { schema: 6, name: 'Monday final' });
  check('and its plan sealed as a version, as it is on screen', JSON.stringify(unseal(secret, 'version', v.body)) === JSON.stringify({ schema: 6, plan: JSON.parse(aPlan) }));
  check('which a snapshot key does not open', (() => { try { unseal(secret, 'snapshot', v.body); return false; } catch { return true; } })());
  check('the room\'s snapshot is now the pushed plan, so a later Take gets it', JSON.stringify(unseal(secret, 'snapshot', room.snapshot.body).plan) === aPlan);
  check('the other browser sees it in its list, without a reload', await b.page.waitForFunction(() => [...document.querySelectorAll('#roomCard .room-v-name')].some((n) => n.textContent === 'Monday final'), null, { timeout: 5000 }).then(() => true, () => false));
  check('and its plan is untouched by it', !(await b.page.evaluate(() => JSON.stringify(state))).includes('Pushed Pedersen'));
  const rest = await elsewhere(a.page);
  check('Push: the secret is still nowhere else', !rest.includes(secret) && !rest.includes(k.token));

  relay.down();
  await pillSays(a.page, 'Offline');
  check('offline, Push is disabled', await a.page.locator('[data-act="room-push"]').isDisabled());
  const sent = relay.sent('version', k.roomId).length;
  await a.page.fill('#roomVersionName', 'Not sent');
  await a.page.evaluate(() => roomPush());
  check('and pushing anyway says so and sends nothing', await noticeSays(a.page, /cannot be reached right now, so nothing was pushed/) && relay.sent('version', k.roomId).length === sent);
  relay.up();
  check('back online, the list is caught up again', await pillSays(a.page, 'Connected', 10000) && JSON.stringify(await versionNames(a.page)) === JSON.stringify(['Monday final']));
  same('Push: no console errors', [...a.errors, ...b.errors], []);
  pushed = { id: v.id, plan: JSON.parse(aPlan) };
  await a.context.close();
  await b.context.close();
}

await browser.close();
await server.close();
console.log(failures.length ? `\n${failures.length} sync-ui check(s) failed` : '\nsync-ui checks passed');
process.exit(failures.length ? 1 : 0);
