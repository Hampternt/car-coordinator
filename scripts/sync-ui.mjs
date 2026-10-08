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
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { fakeRelay } from './sync-fakerelay.mjs';

// This build's version, so the seeded profiles have seen its update note.
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

// A version as the app pushes one: the same name and a fresh nonce in its
// label and its body (PROTOCOL.md §2).
const versionOf = (secret, name, plan, schema = 6) => {
  const nonce = b64(nodeCrypto.randomBytes(16));
  return { label: seal(secret, 'label', { schema, name, nonce }), body: seal(secret, 'version', { schema, plan, name, nonce }) };
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
  await context.addInitScript(() => {
    window.__sockets = 0;
    const Real = window.WebSocket;
    window.WebSocket = class extends Real { constructor(...a) { window.__sockets++; super(...a); } };
  });
  const page = await context.newPage();
  // Seeded by the first page only: a second tab opened later finds the
  // browser's storage as it is, as a real one does, rather than clearing it
  // under the first (which that tab would take for a change to the plan).
  await page.addInitScript((seed) => {
    if (location.protocol === 'about:') return;
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }
  }, items);
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
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done' } });
  for (const t of TABS) await p.page.click(`[data-act="tab"][data-tab="${t}"]`);
  await p.page.click('[data-act="tab"][data-tab="data"]');
  await wait(2500);
  same('no room: no WebSocket is ever made', await p.page.evaluate(() => window.__sockets), 0);
  same('no room: no socket reaches the network', p.sockets, []);
  same('no room: no request leaves the app\'s own server', p.requests, []);
  check('no room: no status in the bar', (await pill(p.page).count()) === 0);
  same('no room: the Data tab still says nothing is sent', await p.page.locator('#tab-data > .hint').first().innerText(), 'Everything you type stays on this PC. This page never sends it anywhere.');
  check('no room: the Shared plan card is there, offering to start one', (await p.page.locator('#roomCard h3').innerText()).startsWith('Shared plan'));
  check('no room: the QR encoder is not even loaded', await p.page.evaluate(() => typeof QR === 'undefined' && ![...document.scripts].some((t) => /qr\.js/.test(t.src))));
  same('no room: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// In a room: connected, caught up, offline when the relay goes, and back.
{
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token);
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED, 'carcoord:pref:room': secret } });
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
  const p = await profile({ routed: false, items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': `ws://127.0.0.1:${port}`, 'carcoord:pref:room': secret } });
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
  const p = await profile({ items: { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED, 'carcoord:pref:room': secret } });
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
const SEED = { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED };
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
  check('and is drawn as a QR beside it', await p.page.waitForSelector('#roomCard .room-qr svg path', { timeout: 5000 }).then(() => true, () => false));
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

// Create made the room but its plan never reached it: said honestly, since
// the room may stay on the server, and nothing is remembered here.
{
  const p = await profile({ items: SEED });
  await p.page.click('[data-act="tab"][data-tab="data"]');
  for (const [why, code] of [['the connection drops', 1006], ['the relay refuses the plan', 4413]]) {
    const rooms = relay.rooms.size;
    relay.dropNext('snapshot', code);
    await p.page.fill('#roomCode', 'test-create-code');
    await p.page.click('[data-act="room-create"]');
    check(`made, then ${why}: says the shared plan may be on the server without its plan`, await noticeSays(p.page, /may be on the server without its plan\. Ask the server's owner to remove it, or try again/), await p.page.locator('#notices').innerText());
    check('and does not say none was made', !/no shared plan was made|so none was made/.test(await p.page.locator('#notices').innerText()));
    check('the room is on the relay, with no plan', relay.rooms.size === rooms + 1 && [...relay.rooms.values()].at(-1).snapshot === null);
    check('and nothing is remembered here', await p.page.evaluate(() => localStorage.getItem('carcoord:pref:room') === null && document.getElementById('syncStatus') === null));
    await p.page.evaluate(() => { notices = []; render(); });
  }
  same('failed Create: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// Join: the other PC opens the invite. The fragment goes at once; Not now
// changes nothing; Take backs this plan up and puts the room's in its place.
const OTHER = await readFile(new URL('./fixtures/shared-plan-other-pc.json', import.meta.url), 'utf8');
const OTHER_SEED = { 'carcoord:v1': OTHER, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': ROUTED };
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
  const lab = unseal(secret, 'label', v.label);
  check('the relay holds its name sealed as a label, with a fresh nonce', lab.schema === 6 && lab.name === 'Monday final' && /^[0-9a-f]{32}$/.test(lab.nonce) && Object.keys(lab).length === 3, JSON.stringify(lab));
  check('and its plan sealed as a version, as it is on screen, with the label\'s name and nonce', JSON.stringify(unseal(secret, 'version', v.body)) === JSON.stringify({ schema: 6, plan: JSON.parse(aPlan), name: 'Monday final', nonce: lab.nonce }));
  check('which a snapshot key does not open', (() => { try { unseal(secret, 'snapshot', v.body); return false; } catch { return true; } })());
  check('the room\'s snapshot is now the pushed plan, so a later Take gets it', JSON.stringify(unseal(secret, 'snapshot', room.snapshot.body).plan) === aPlan);
  check('the other browser sees it in its list, without a reload', await b.page.waitForFunction(() => [...document.querySelectorAll('#roomCard .room-v-name')].some((n) => n.textContent === 'Monday final'), null, { timeout: 5000 }).then(() => true, () => false));
  // Round 1 checked the other plan was untouched by a push; live, the edit
  // made before the push reaches it as any edit does, and the push adds no
  // change of its own.
  check('the edit made before it reached the other browser live', await b.page.waitForFunction(() => state.routes[0].driver === 'Pushed Pedersen', null, { timeout: 3000 }).then(() => true, () => false));
  same('and the push sent no op of its own', relay.sent('op', k.roomId).length, 1);
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

// ---------------------------------------------------------------------------
// Pull: Look first shows the version without changing anything; Restore puts
// it on screen after a backup, and sends nothing.
{
  const { secret } = created;
  const k = keysOf(secret);
  const b = await profile({ items: inRoom(OTHER_SEED, secret) });
  await pillSays(b.page, 'Connected');
  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.waitForSelector('#roomCard [data-act="room-look"]');
  const writes = () => relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length;
  const wrote = writes();
  const before = await kept(b.page);
  const screen = await b.page.evaluate(() => JSON.stringify(state));

  await b.page.click(`#roomCard [data-act="room-look"][data-id="${pushed.id}"]`);
  check('Look first opens the version, with the preview', await dialogSays(b.page, /Version \u201cMonday final\u201d[\s\S]*Restoring it replaces everything on screen/), await b.page.locator('#roomDlg').innerText().catch(() => ''));
  check('naming what is only on this PC', /Cars: ZZ 90001, ZZ 90002/.test(await b.page.locator('#roomDlg').innerText()));
  check('it fetched the version by id', relay.sent('getVersion', k.roomId).some((f) => f.id === pushed.id));
  await b.page.click('[data-act="room-look-close"]');
  same('Close: nothing changed', await kept(b.page), before);

  // From the list it takes two presses.
  await b.page.click(`#roomCard [data-act="room-restore"][data-id="${pushed.id}"]`);
  check('Restore from the list asks Sure? first', (await b.page.locator(`#roomCard [data-act="room-restore"][data-id="${pushed.id}"]`).innerText()) === 'Sure?');
  same('and has changed nothing yet', await kept(b.page), before);
  await b.page.click(`#roomCard [data-act="room-restore"][data-id="${pushed.id}"]`);
  check('Restore: said so', await noticeSays(b.page, /Restored the shared version \u201cMonday final\u201d/), await b.page.locator('#notices').innerText());
  same('the version is the plan on screen', await b.page.evaluate(() => JSON.stringify(state)), JSON.stringify(pushed.plan));
  const after = await kept(b.page);
  const bk = JSON.parse(after.backups)[0];
  check('and what was on screen is the newest Backup', bk.json === screen && /Before restoring the shared version|Start of day/.test(bk.label), bk.label);
  same('Restore sent nothing to the room', writes(), wrote);

  // Look first, then Restore it from the dialog: one press there.
  await b.page.evaluate(() => { state.routes[0].driver = 'Changed again'; save(); render(); });
  await b.page.click(`#roomCard [data-act="room-look"][data-id="${pushed.id}"]`);
  await dialogSays(b.page, /Restoring it/);
  await b.page.click('#roomDlg [data-act="room-restore"]');
  check('Restore it from Look first: one press, and it is on screen', await b.page.evaluate(() => state.routes[0].driver) === pushed.plan.routes[0].driver && !(await b.page.evaluate(() => document.getElementById('roomDlg').open)));

  // A version pruned since the list was drawn.
  const room = relay.rooms.get(k.roomId);
  const kept50 = room.versions;
  room.versions = [];
  const was = await kept(b.page);
  await b.page.click(`#roomCard [data-act="room-look"][data-id="${pushed.id}"]`);
  check('a version gone from the relay: said so', await noticeSays(b.page, /no longer in the shared plan/));
  same('and nothing changed', await kept(b.page), was);
  room.versions = kept50;
  same('Pull: no console errors', b.errors, []);
  await b.context.close();
}

// ---------------------------------------------------------------------------
// A room written by a newer build: this one only reads it.
{
  const secret = newSecret();
  const k = keysOf(secret);
  const newer = { ...created.plan, schemaVersion: 7, aFieldFromTheFuture: true };
  const older = pushed.plan;
  relay.makeRoom(k.roomId, k.token, {
    snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 7, plan: newer }) },
    versions: [
      versionOf(secret, 'Old one', older),
      versionOf(secret, 'From the future', newer, 7),
    ],
  });
  // Opened as an invite first: it cannot be taken.
  const j = await profile({ items: OTHER_SEED });
  const before = await kept(j.page);
  await openInvite(j.page, `#join=${secret}`);
  check('a newer room offered: Update the app, and no Take', await dialogSays(j.page, /newer version of Car Coordinator\. Update the app to join it/) && (await j.page.locator('[data-act="room-take"]').count()) === 0);
  await j.page.click('[data-act="room-notnow"]');
  same('and nothing changed', await kept(j.page), before);
  await j.context.close();

  // Before the room has said what it holds, nothing can be pushed either.
  relay.holdCatchup();
  const p = await profile({ items: inRoom(SEED, secret) });
  await pillSays(p.page, 'Connected');
  await p.page.click('[data-act="tab"][data-tab="data"]');
  check('connected but not caught up: Push is disabled', await p.page.locator('[data-act="room-push"]').isDisabled());
  await p.page.evaluate(() => { document.getElementById('roomVersionName').value = 'Too early'; return roomPush(); });
  check('and pushing anyway says to wait', await noticeSays(p.page, /still being read, so nothing was pushed/));
  same('sending nothing', relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length, 0);
  relay.releaseCatchup();
  check('in a newer room: the bar says Update the app', await pillSays(p.page, 'Update the app'), await pill(p.page).textContent().catch(() => 'no pill'));
  await p.page.click('[data-act="tab"][data-tab="data"]');
  check('and the card says why', /Update the app to edit the shared plan/.test(await p.page.locator('#roomStatus').innerText()));
  check('Push is disabled', await p.page.locator('[data-act="room-push"]').isDisabled() && await p.page.locator('#roomVersionName').isDisabled());
  await p.page.evaluate(() => { document.getElementById('roomVersionName').disabled = false; document.getElementById('roomVersionName').value = 'Sneaky'; return roomPush(); });
  check('pushing anyway says to update, and', await noticeSays(p.page, /Update the app to push/));
  same('not one snapshot, version or op is sent', relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length, 0);
  const future = p.page.locator('#roomCard li', { hasText: 'From the future' });
  check('a newer version cannot be restored', await future.locator('[data-act="room-restore"]').isDisabled() && /update the app to restore it/.test(await future.innerText()));
  const was = await kept(p.page);
  await p.page.evaluate(() => roomRestore(room.versions.find((v) => v.name === 'From the future').id));
  check('even when asked directly', await noticeSays(p.page, /Update the app to restore \u201cFrom the future\u201d/));
  same('and nothing changed', await kept(p.page), was);
  await future.locator('[data-act="room-look"]').click();
  check('Look first at it says to update, with no Restore', await dialogSays(p.page, /Update the app to restore it/) && (await p.page.locator('#roomDlg [data-act="room-restore"]').count()) === 0);
  await p.page.click('[data-act="room-look-close"]');
  const old = p.page.locator('#roomCard li', { hasText: 'Old one' });
  await old.locator('[data-act="room-restore"]').click();
  await old.locator('[data-act="room-restore"]').click();
  check('an older version still restores on this PC', await noticeSays(p.page, /Restored the shared version \u201cOld one\u201d/) && await p.page.evaluate(() => state.routes[0].driver) === older.routes[0].driver);
  same('and still nothing is sent', relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length, 0);
  same('newer room: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// A room holding ops, a newer build's live edits: this build applies none, so
// it only reads the room, and never sends a snapshot that would make the relay
// delete them (PROTOCOL.md §4.3).
{
  const secret = newSecret();
  const k = keysOf(secret);
  // The ops come after the snapshot and before this browser's welcome, so the
  // catchup lists none of them: only its seq shows they are there.
  relay.makeRoom(k.roomId, k.token, {
    seq: 2,
    snapshot: { seq: 1, body: seal(secret, 'snapshot', { schema: 6, plan: created.plan }) },
    ops: [{ seq: 2, body: seal(secret, 'op', { schema: 6, made: 'up' }) }],
  });
  const writes = () => relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length;
  const j = await profile({ items: OTHER_SEED });
  const before = await kept(j.page);
  await openInvite(j.page, `#join=${secret}`);
  check('a room holding ops offered: Update the app, and no Take', await dialogSays(j.page, /Update the app to join it/) && (await j.page.locator('[data-act="room-take"]').count()) === 0, await j.page.locator('#roomDlg').innerText().catch(() => ''));
  await j.page.click('[data-act="room-notnow"]');
  same('and nothing changed', await kept(j.page), before);
  await j.context.close();

  const p = await profile({ items: inRoom(SEED, secret) });
  check('in a room holding ops: the bar says Update the app', await pillSays(p.page, 'Update the app'), await pill(p.page).textContent().catch(() => 'no pill'));
  await p.page.click('[data-act="tab"][data-tab="data"]');
  check('Push is disabled', await p.page.locator('[data-act="room-push"]').isDisabled());
  await p.page.evaluate(() => { const box = document.getElementById('roomVersionName'); box.disabled = false; box.value = 'Over the ops'; return roomPush(); });
  check('pushing anyway says to update', await noticeSays(p.page, /Update the app to push/));
  same('and sends no snapshot, version or op', writes(), 0);
  same('the room\'s op is still there', relay.rooms.get(k.roomId).ops.map((o) => o.seq), [2]);
  same('ops room: no console errors', p.errors, []);
  await p.context.close();
}
// A live op from another browser makes a room read-only here from then on.
{
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token, { snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan: created.plan }) } });
  const a = await profile({ items: inRoom(SEED, secret) });
  const b = await profile({ items: inRoom(SEED, secret) });
  for (const x of [a, b]) await pillSays(x.page, 'Connected');
  await a.page.click('[data-act="tab"][data-tab="data"]');
  check('before any op, Push is there', !(await a.page.locator('[data-act="room-push"]').isDisabled()));
  await b.page.evaluate((body) => room.conn.send({ type: 'op', body }), seal(secret, 'op', { schema: 6, made: 'up' }));
  check('an op arrives: the bar says Update the app', await pillSays(a.page, 'Update the app'), await pill(a.page).textContent().catch(() => 'no pill'));
  const snaps = relay.sent('snapshot', k.roomId).length;
  await a.page.evaluate(() => { const box = document.getElementById('roomVersionName'); box.disabled = false; box.value = 'After the op'; return roomPush(); });
  same('and a push sends no snapshot over it', relay.sent('snapshot', k.roomId).length, snaps);
  same('the op is still there', relay.rooms.get(k.roomId).ops.map((o) => o.seq), [1]);
  same('live op: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close();
  await b.context.close();
}

// ===========================================================================
// Round 2: live edits. Two browsers in one room, both following it.
// A fresh room holding `plan`, and the ops written to it so far, opened.
const liveRoom = (plan = created.plan) => {
  const secret = newSecret();
  const k = keysOf(secret);
  relay.makeRoom(k.roomId, k.token, { snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan }) } });
  const ops = () => (relay.rooms.get(k.roomId).ops || []).map((o) => ({ seq: o.seq, ...unseal(secret, 'op', o.body) }));
  return { secret, k, ops };
};
const planOf = (pg) => pg.evaluate(() => JSON.stringify(state));
const routeBox = (pg, i, f) => pg.locator('#tab-plan tbody tr').nth(i).locator(`[data-field="${f}"]`);
// Waits until both screens hold the same plan, and says whether they do.
const converged = async (a, b, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [x, y] = [await planOf(a), await planOf(b)];
    if (x === y) return true;
    await wait(100);
  }
  return false;
};
const live = async (seed, secret) => {
  const x = await profile({ items: inRoom(seed, secret) });
  await pillSays(x.page, 'Connected');
  await x.page.waitForFunction(() => !!room && !!room.rep && room.caught, null, { timeout: 5000 }).catch(() => {});
  return x;
};
{
  const { secret, k, ops } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  check('two browsers whose plan is the room\'s follow it live', await a.page.evaluate(() => roomLive()) && await b.page.evaluate(() => roomLive()));
  check('and neither sent anything just for joining', ops().length === 0 && relay.sent('snapshot', k.roomId).length === 0);

  // Send: one field typed in one browser is on the other's screen within a second.
  const was = await b.page.evaluate(() => state.routes[2].driver);
  const t0 = Date.now();
  await routeBox(a.page, 2, 'driver').fill('Live Lena');
  const arrived = await b.page.waitForFunction(() => state.routes[2].driver === 'Live Lena', null, { timeout: 3000 }).then(() => Date.now() - t0, () => null);
  check('a driver typed in one browser is on the other\'s screen within a second', arrived !== null && arrived < 1000, String(arrived));
  check('drawn there, not only in its data', (await routeBox(b.page, 2, 'driver').inputValue()) === 'Live Lena');
  check('and saved there', await b.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:v1')).routes[2].driver === 'Live Lena'));
  const sent = ops();
  same('the relay holds it as one op: one field, with what it was', sent.map((o) => o.changes), [[{ op: 'set', kind: 'route', id: 'rt-03', field: 'driver', value: 'Live Lena', was }]]);
  check('sealed with this build\'s schema and an id of its own', sent[0].schema === 6 && /^[0-9a-f]{16}$/.test(sent[0].oid));
  check('nothing but ops was written for it', relay.sent('snapshot', k.roomId).length === 0 && relay.sent('version', k.roomId).length === 0);
  check('the sender\'s pending edit is confirmed by its ack', await a.page.waitForFunction(() => room.rep.queue.length === 0 && room.rep.seq === 1, null, { timeout: 3000 }).then(() => true, () => false));

  // Typing a word is a few changes, not one per key.
  await routeBox(a.page, 3, 'driver').click();
  await a.page.keyboard.type('Batched Bente', { delay: 20 });
  await converged(a.page, b.page);
  check('a word typed quickly travels as a few ops, not one per key', ops().length - 1 <= 4, String(ops().length - 1));

  // Receive: both edit different routes at the same moment.
  relay.holdWrites();
  await routeBox(a.page, 4, 'driver').fill('Anna A');
  await routeBox(b.page, 5, 'driver').fill('Bjørn B');
  await a.page.locator('#tab-plan tbody tr').nth(6).locator('[data-act="toggle"][data-field="highlight"]').click();
  await b.page.locator('#tab-plan tbody tr').nth(7).locator('[data-field="round"]').fill('9');
  await wait(800);
  relay.releaseWrites();
  check('both edit different routes at once: both end identical', await converged(a.page, b.page), '');
  const both = JSON.parse(await planOf(a.page));
  check('with both browsers\' edits kept', both.routes[4].driver === 'Anna A' && both.routes[5].driver === 'Bjørn B' && both.routes[6].highlight === true && both.routes[7].round === '9', JSON.stringify(both.routes.slice(4, 8).map((r) => [r.driver, r.highlight, r.round])));
  same('and the same plan saved in both', await a.page.evaluate(() => localStorage.getItem('carcoord:v1')), await b.page.evaluate(() => localStorage.getItem('carcoord:v1')));

  // Catch up: a newcomer's Take gets every edit made since the last snapshot.
  const j = await profile({ items: OTHER_SEED });
  await openInvite(j.page, `#join=${secret}`);
  check('a room holding edits is offered with Take', await dialogSays(j.page, /Join this shared plan\?[\s\S]*holds 15 routes/) && (await j.page.locator('[data-act="room-take"]').count()) === 1, await j.page.locator('#roomDlg').innerText().catch(() => ''));
  await j.page.click('[data-act="room-take"]');
  await pillSays(j.page, 'Connected');
  same('a newcomer\'s Take gets every edit made since the snapshot', JSON.parse(await planOf(j.page)).routes.map((r) => [r.driver, r.highlight, r.round]), both.routes.map((r) => [r.driver, r.highlight, r.round]));
  check('and it follows the room live from there', await j.page.waitForFunction(() => roomLive() && room.caught, null, { timeout: 5000 }).then(() => true, () => false));
  await j.page.click('[data-act="tab"][data-tab="plan"]');
  await routeBox(j.page, 0, 'driver').fill('Newcomer Nora');
  check('its own edit reaches the others', await a.page.waitForFunction(() => state.routes[0].driver === 'Newcomer Nora', null, { timeout: 3000 }).then(() => true, () => false)
    && await b.page.waitForFunction(() => state.routes[0].driver === 'Newcomer Nora', null, { timeout: 3000 }).then(() => true, () => false));

  check('and three browsers end on one plan', await converged(a.page, j.page) && await converged(b.page, j.page));
  same('live: no console errors', [...a.errors, ...b.errors, ...j.errors], []);
  for (const x of [a, b, j]) await x.context.close();
}

// Offline and reload: the room's plan as confirmed is kept beside the plan,
// so an edit made with the relay down survives a reload and still goes out,
// and a field both changed meanwhile is flagged on both screens.
const flagsOf = (pg) => pg.evaluate(() => (room ? room.flags.map((f) => ({ type: f.type, kind: f.kind, id: f.id, field: f.field, kept: f.kept, lost: f.lost })) : []));
{
  const { secret, k, ops } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  const base = JSON.parse(await a.page.evaluate(() => localStorage.getItem('carcoord:roomBase')));
  check('the room\'s plan is kept under carcoord:roomBase, for this room, at its seq', base && base.room === k.roomId && base.seq === 0 && JSON.stringify(base.plan) === JSON.stringify(created.plan));
  const others = await elsewhere(a.page);
  check('and is in no other key: not the plan, not Backups', !others.replace(/carcoord:roomBase=.*/, '').includes(k.roomId) && !JSON.parse(await planOf(a.page)).room);

  relay.down();
  await pillSays(a.page, 'Offline');
  await pillSays(b.page, 'Offline');
  await routeBox(a.page, 1, 'driver').fill('Offline Ola');
  await routeBox(a.page, 2, 'driver').fill('From A');
  await routeBox(b.page, 2, 'driver').fill('From B');
  await routeBox(b.page, 4, 'round').fill('7');
  await wait(600);
  same('offline, nothing reaches the relay', ops().length, 0);
  await a.page.reload({ waitUntil: 'networkidle' });
  check('after a reload the offline edit is still on screen', (await routeBox(a.page, 1, 'driver').inputValue()) === 'Offline Ola');
  check('and the base it was made on is still kept', await a.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:roomBase')).seq) === 0);
  relay.up();
  check('back: both Connected', await pillSays(a.page, 'Connected', 10000) && await pillSays(b.page, 'Connected', 10000));
  check('the edit made offline, then reloaded, reaches the other browser', await b.page.waitForFunction(() => state.routes[1].driver === 'Offline Ola', null, { timeout: 5000 }).then(() => true, () => false));
  check('and the other\'s offline edit reaches it', await a.page.waitForFunction(() => state.routes[4].round === '7', null, { timeout: 5000 }).then(() => true, () => false));
  check('both end on one plan', await converged(a.page, b.page));
  const kept = JSON.parse(await planOf(a.page)).routes[2].driver;
  const lost = kept === 'From A' ? 'From B' : 'From A';
  const fa = await flagsOf(a.page);
  const fb = await flagsOf(b.page);
  same('a field both changed offline is flagged, the same on both screens', [fa, fb], [[{ type: 'set', kind: 'route', id: 'rt-03', field: 'driver', kept, lost }], [{ type: 'set', kind: 'route', id: 'rt-03', field: 'driver', kept, lost }]]);
  check('the base moved on with the room', await a.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:roomBase')).seq) === ops().at(-1).seq);

  // A browser opening with its kept base, whose catchup is held while an op
  // comes live: the op is read in its turn, after the catchup.
  const stored = await a.page.evaluate(() => ({ plan: localStorage.getItem('carcoord:v1'), base: localStorage.getItem('carcoord:roomBase') }));
  await routeBox(a.page, 0, 'driver').fill('Before C');
  await converged(a.page, b.page);
  relay.holdCatchup();
  const c = await profile({ items: inRoom({ ...SEED, 'carcoord:v1': stored.plan, 'carcoord:roomBase': stored.base }, secret) });
  await pillSays(c.page, 'Connected');
  await routeBox(a.page, 3, 'driver').fill('While Held');
  await wait(600);
  relay.releaseCatchup();
  check('a browser with a kept base follows live from it, catching up on what it missed', await c.page.waitForFunction(() => state.routes[0].driver === 'Before C' && state.routes[3].driver === 'While Held' && roomLive(), null, { timeout: 5000 }).then(() => true, () => false));
  check('three browsers end on one plan', await converged(a.page, c.page) && await converged(b.page, c.page));

  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.click('[data-act="room-leave"]');
  await b.page.click('[data-act="room-leave"]');
  same('Leave forgets the kept base too', await b.page.evaluate(() => localStorage.getItem('carcoord:roomBase')), null);
  same('offline and reload: no console errors', [...a.errors, ...b.errors, ...c.errors], []);
  for (const x of [a, b, c]) await x.context.close();
}

// Remote changes never disturb the person working: focus, caret, selection,
// scroll, an open picker or menu, an armed button and an open dialog stay.
const focusOf = (pg) => pg.evaluate(() => {
  const el = document.activeElement;
  return el && el.dataset ? { id: el.dataset.id || el.id || null, field: el.dataset.field || null, value: el.value ?? null, sel: typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null } : null;
});
const routeRow = (pg, id) => pg.locator(`#tab-plan tbody tr[data-route="${id}"]`);
{
  const { secret } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);

  // Typing on and on in route 3's driver while the other edits the same
  // route, the one below it, the order, and adds a route.
  const start = await routeRow(a.page, 'rt-03').locator('[data-field="driver"]').inputValue();
  await routeRow(a.page, 'rt-03').locator('[data-field="driver"]').click();
  await a.page.keyboard.press('End');
  const typed = ' Continuous Kari Karlsen';
  const typing = a.page.keyboard.type(typed, { delay: 70 });
  const other = (async () => {
    await wait(250);
    await routeRow(b.page, 'rt-03').locator('[data-field="round"]').fill('5');
    await wait(250);
    await routeRow(b.page, 'rt-04').locator('[data-field="driver"]').fill('Neighbour Nina');
    await wait(250);
    await routeRow(b.page, 'rt-01').locator('[data-act="down"]').click();
    await wait(250);
    await b.page.click('[data-act="add-route"]');
    await wait(250);
    await routeRow(b.page, 'rt-02').locator('[data-act="toggle"][data-field="highlight"]').click();
  })();
  await Promise.all([typing, other]);
  await wait(800);
  const f = await focusOf(a.page);
  same('typing on while the other edits the same route, the next one and the order: not a keystroke lost', f && f.value, start + typed);
  check('the focus stayed in the box', f && f.id === 'rt-03' && f.field === 'driver', JSON.stringify(f));
  same('and the caret stayed at the end of what was typed', f && f.sel, [(start + typed).length, (start + typed).length]);
  const aPlan = JSON.parse(await planOf(a.page));
  check('every one of the other\'s edits is on this screen', aPlan.routes.find((r) => r.id === 'rt-03').round === '5' && aPlan.routes.find((r) => r.id === 'rt-04').driver === 'Neighbour Nina'
    && aPlan.routes[1].id === 'rt-01' && aPlan.routes.length === 16 && aPlan.routes.find((r) => r.id === 'rt-02').highlight === true, JSON.stringify(aPlan.routes.map((r) => r.id)));
  await a.page.keyboard.press('Escape');
  check('and both end on one plan', await converged(a.page, b.page));

  // Two routes added at once: both kept, in the relay's order.
  relay.holdWrites();
  await a.page.click('[data-act="add-route"]');
  await b.page.click('[data-act="add-route"]');
  await wait(600);
  relay.releaseWrites();
  check('two routes added at once: both kept, in the same order on both', await converged(a.page, b.page) && JSON.parse(await planOf(a.page)).routes.length === 18);

  // The same field: typed in here, changed there. The box is never rewritten;
  // what is typed wins on leaving it, and the other value goes into the mark.
  const box = routeRow(a.page, 'rt-05').locator('[data-field="driver"]');
  await box.click();
  await box.fill('');
  await a.page.keyboard.type('Mine', { delay: 30 });
  await wait(800);
  await routeRow(b.page, 'rt-05').locator('[data-field="driver"]').fill('Theirs');
  await b.page.keyboard.press('Tab');
  await wait(800);
  same('the other changes the field being typed in: the box keeps what is typed', await box.inputValue(), 'Mine');
  check('the focus and caret stay', JSON.stringify(await focusOf(a.page)) === JSON.stringify({ id: 'rt-05', field: 'driver', value: 'Mine', sel: [4, 4] }), JSON.stringify(await focusOf(a.page)));
  check('and a quiet mark says what the other wrote', await box.evaluate((el) => el.classList.contains('room-held') && /changed this to “Theirs”/.test(el.title)));
  await a.page.keyboard.type(' too', { delay: 30 });
  await wait(600);
  same('while it is being typed in, the other screen keeps the other value', await b.page.evaluate(() => state.routes.find((r) => r.id === 'rt-05').driver), 'Theirs');
  await a.page.keyboard.press('Escape');
  await a.page.keyboard.press('Tab');
  check('on leaving it, the typed text wins on both screens', await b.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-05').driver === 'Mine too', null, { timeout: 3000 }).then(() => true, () => false) && await converged(a.page, b.page));
  const want = [{ type: 'set', kind: 'route', id: 'rt-05', field: 'driver', kept: 'Mine too', lost: 'Theirs' }];
  same('and the other value is in the same flag on both', [await flagsOf(a.page), await flagsOf(b.page)], [want, want]);
  check('marked on the box on both screens', await routeRow(a.page, 'rt-05').locator('[data-field="driver"]').evaluate((el) => el.classList.contains('room-collided'))
    && await routeRow(b.page, 'rt-05').locator('[data-field="driver"]').evaluate((el) => el.classList.contains('room-collided') && /the other was “Theirs”/.test(el.title)));

  // Only in the box, never typed in: on leaving it takes the other's value.
  const idle = routeRow(a.page, 'rt-06').locator('[data-field="driver"]');
  const idleWas = await idle.inputValue();
  await idle.click();
  await routeRow(b.page, 'rt-06').locator('[data-field="driver"]').fill('Taken Over');
  await b.page.keyboard.press('Tab');
  await wait(800);
  same('a box only clicked into keeps its text while it has the focus', await idle.inputValue(), idleWas);
  await a.page.keyboard.press('Escape');
  await a.page.keyboard.press('Tab');
  check('and takes the other\'s value on leaving, with nothing flagged', await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-06').driver === 'Taken Over', null, { timeout: 3000 }).then(() => true, () => false)
    && (await flagsOf(a.page)).length === 1 && await converged(a.page, b.page));

  // The driver picker, opened by typing a name the roster has more than one of.
  const pick = routeRow(a.page, 'rt-10').locator('[data-field="driver"]');
  await pick.click();
  await pick.fill('');
  await a.page.keyboard.type('a', { delay: 30 });
  const pickerOpen = () => a.page.evaluate(() => !!picking && picking.routeId === 'rt-10' && !document.getElementById('picker').hidden);
  check('the driver picker is open while a name is typed', await pickerOpen());
  await routeRow(b.page, 'rt-04').locator('[data-field="round"]').fill('8');
  await b.page.keyboard.press('Tab');
  await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-04').round === '8', null, { timeout: 3000 });
  check('the driver picker stays open through a change from the room', await pickerOpen());
  same('with the box as typed, caret and all', await focusOf(a.page), { id: 'rt-10', field: 'driver', value: 'a', sel: [1, 1] });
  await a.page.keyboard.press('Backspace');
  await a.page.keyboard.type('Jonas', { delay: 20 });
  await a.page.keyboard.press('Escape');
  await a.page.keyboard.press('Tab');
  await converged(a.page, b.page);

  // Menus, an armed button, a selection and the scroll.
  await a.page.evaluate(() => window.scrollTo(0, 260));
  const y = await a.page.evaluate(() => window.scrollY);
  await routeRow(a.page, 'rt-09').locator('[data-act="del"]').click();
  check('armed: Delete says Sure?', (await routeRow(a.page, 'rt-09').locator('[data-act="del"]').innerText()) === 'Sure?');
  await routeRow(b.page, 'rt-02').locator('[data-field="driver"]').fill('While Armed');
  await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-02').driver === 'While Armed', null, { timeout: 3000 });
  check('an armed Sure? stays armed through a change from the room', (await routeRow(a.page, 'rt-09').locator('[data-act="del"]').innerText()) === 'Sure?');
  same('and the page did not scroll', await a.page.evaluate(() => window.scrollY), y);
  await wait(3200);

  const nameBox = routeRow(a.page, 'rt-11').locator('[data-field="name"]');
  await nameBox.click({ button: 'right' });
  const menuOpen = () => a.page.evaluate(() => !!ctx && !!document.getElementById('ctxMenu') && !document.getElementById('ctxMenu').hidden);
  check('the right-click menu is open', await menuOpen());
  await routeRow(b.page, 'rt-12').locator('[data-field="driver"]').fill('While Menu');
  await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-12').driver === 'While Menu', null, { timeout: 3000 });
  check('a right-click menu stays open through a change from the room', await menuOpen());
  await a.page.keyboard.press('Escape');

  await a.page.locator('#tab-plan [data-act="tag"]').first().click();
  const tagOpen = () => a.page.evaluate(() => !!tagFor && !!document.querySelector('.tag-menu'));
  check('the tag menu is open', await tagOpen());
  await routeRow(b.page, 'rt-hau1').locator('[data-field="driver"]').fill('While Tags');
  await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-hau1').driver === 'While Tags', null, { timeout: 3000 });
  check('a tag menu stays open through a change from the room', await tagOpen());
  await a.page.keyboard.press('Escape');
  await a.page.mouse.click(5, 5);

  await nameBox.click();
  await nameBox.evaluate((el) => el.setSelectionRange(0, 1));
  await routeRow(b.page, 'rt-14').locator('[data-field="driver"]').fill('While Selected');
  await a.page.waitForFunction(() => state.routes.find((r) => r.id === 'rt-14').driver === 'While Selected', null, { timeout: 3000 });
  same('selected text stays selected through a change from the room', await focusOf(a.page), { id: 'rt-11', field: 'name', value: '11', sel: [0, 1] });

  // A note changed there is put straight into its box here, with no redraw.
  await a.page.evaluate(() => { window.__renders = 0; const real = render; window.render = (...x) => { window.__renders++; return real(...x); }; });
  await b.page.click('[data-act="tab"][data-tab="cars"]');
  const carId = await b.page.evaluate(() => state.cars[0].id);
  await b.page.locator(`#tab-cars [data-kind="car"][data-id="${carId}"][data-field="note"]`).fill('Patched in place');
  await a.page.waitForFunction((id) => state.cars.find((c) => c.id === id).note === 'Patched in place', carId, { timeout: 3000 });
  same('a note changed there: only its box is redrawn here', [await a.page.evaluate(() => window.__renders), await a.page.locator(`#tab-cars [data-kind="car"][data-id="${carId}"][data-field="note"]`).inputValue()], [0, 'Patched in place']);

  // An open dialog that goes stale says so, and is drawn from the plan as it is.
  const code = await a.page.evaluate(() => Share.encode(state, 'day'));
  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.fill('#shareIn', code);
  await b.page.click('[data-act="share-read"]');
  await b.page.waitForFunction(() => document.getElementById('shareDlg').open);
  check('a list to load, before any change: no stale line', !(await b.page.locator('#shareDlg').innerText()).includes('changed while this was open'));
  await routeRow(a.page, 'rt-07').locator('[data-field="driver"]').fill('Stale Maker');
  check('it says the plan changed while it was open', await b.page.waitForFunction(() => /The plan changed while this was open/.test(document.getElementById('shareDlg').innerText), null, { timeout: 3000 }).then(() => true, () => false));
  await b.page.click('[data-act="share-cancel"]');
  await b.page.click('[data-act="tab"][data-tab="plan"]');
  await b.page.evaluate(() => { askTemplate(state.templates.find((t) => t.routes.length)); render(); });
  await routeRow(a.page, 'rt-08').locator('[data-field="driver"]').fill('Stale Again');
  check('so does a template\'s load question', await b.page.waitForFunction(() => /changed while this was open/.test(document.getElementById('notices').innerText), null, { timeout: 3000 }).then(() => true, () => false));
  same('never disturbed: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close();
  await b.context.close();
}

// Removed while you edit: the edit is never lost silently. The route goes,
// the card says so on both screens, and Put it back brings the route back
// with the edit, for both.
const removeRoute = async (pg, id) => {
  await routeRow(pg, id).locator('[data-act="del"]').click();
  await routeRow(pg, id).locator('[data-act="del"]').click();
};
const hasRoute = (pg, id) => pg.evaluate((x) => state.routes.some((r) => r.id === x), id);
const removedFlag = (pg, id) => pg.evaluate((x) => (room ? room.flags.filter((f) => f.type === 'removed' && f.id === x).map((f) => ({ driver: f.item.driver, after: f.after })) : []), id);
{
  const { secret } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);

  // The remove reaches the relay first, then what was typed into the route.
  relay.holdWrites();
  await removeRoute(b.page, 'rt-07');
  await wait(500);
  await routeRow(a.page, 'rt-07').locator('[data-field="driver"]').click();
  await a.page.keyboard.press('End');
  await a.page.keyboard.type(' Typed On', { delay: 30 });
  await wait(600);
  relay.releaseWrites();
  check('removed, then typed into: the route is gone on both screens', await until(async () => !(await hasRoute(a.page, 'rt-07')) && !(await hasRoute(b.page, 'rt-07'))));
  await converged(a.page, b.page);
  const want = [{ driver: 'Guro Typed On', after: 'rt-06' }];
  same('and both screens keep the edit in a flag, with where the route was', [await removedFlag(a.page, 'rt-07'), await removedFlag(b.page, 'rt-07')], [want, want]);
  check('the bar says there is something to look at, quietly', (await a.page.locator('#syncFlags').innerText()) === '1 to look at' && (await b.page.locator('#syncFlags').count()) === 1);
  await a.page.click('#syncFlags');
  const card = await a.page.locator('#roomCard').innerText();
  check('which opens the Data tab, where the card says what was lost', /Route 7 was removed while it was being changed \(its driver: “Guro Typed On”\)/.test(card), card);
  same('no dialog opened for it', await a.page.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open)), false);
  await a.page.locator('#roomCard [data-act="room-putback"]').click();
  check('Put it back: the route is back, with the edit, on both screens', await b.page.waitForFunction(() => { const i = state.routes.findIndex((r) => r.id === 'rt-07'); return i === 6 && state.routes[i].driver === 'Guro Typed On'; }, null, { timeout: 3000 }).then(() => true, () => false)
    && await converged(a.page, b.page));
  check('and the flag is gone from both', await until(async () => (await removedFlag(a.page, 'rt-07')).length === 0 && (await removedFlag(b.page, 'rt-07')).length === 0) && (await a.page.locator('#syncFlags').count()) === 0);

  // The edit reaches the relay first, then a remove from a browser that had
  // not seen it.
  await a.page.click('[data-act="tab"][data-tab="plan"]');
  relay.holdWrites();
  await routeRow(a.page, 'rt-08').locator('[data-field="driver"]').fill('Edited First');
  await a.page.keyboard.press('Tab');
  await wait(500);
  await removeRoute(b.page, 'rt-08');
  await wait(500);
  relay.releaseWrites();
  check('edited, then removed by one who had not seen the edit: gone on both', await until(async () => !(await hasRoute(a.page, 'rt-08')) && !(await hasRoute(b.page, 'rt-08'))));
  const want2 = [{ driver: 'Edited First', after: 'rt-07' }];
  same('and the edit is in the same flag on both', [await removedFlag(a.page, 'rt-08'), await removedFlag(b.page, 'rt-08')], [want2, want2]);
  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.locator('#roomCard [data-act="room-dismiss"]').click();
  same('Dismiss puts the flag away on that screen only, changing nothing', [(await removedFlag(b.page, 'rt-08')).length, await hasRoute(b.page, 'rt-08'), (await removedFlag(a.page, 'rt-08')).length], [0, false, 1]);

  // A removed route seen and removed again: nothing to flag.
  await converged(a.page, b.page);
  await b.page.click('[data-act="tab"][data-tab="plan"]');
  await removeRoute(b.page, 'rt-09');
  await until(async () => !(await hasRoute(a.page, 'rt-09')));
  same('a route removed with nothing changed in it is not flagged', [await removedFlag(a.page, 'rt-09'), await removedFlag(b.page, 'rt-09')], [[], []]);
  same('removed while editing: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close();
  await b.context.close();
}

// Collisions: both change one field at once. The last to reach the relay
// wins on both screens; both show the same flag, on the field and on the card.
{
  const { secret } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  // Two cars neither of which is on route 2 yet.
  const cars = await a.page.evaluate(() => state.cars.filter((c) => c.id !== state.routes.find((r) => r.id === 'rt-02').carId).slice(0, 2).map((c) => ({ id: c.id, reg: c.reg })));
  relay.holdWrites();
  await routeRow(a.page, 'rt-02').locator('[data-field="carId"]').selectOption(cars[0].id);
  await routeRow(b.page, 'rt-02').locator('[data-field="carId"]').selectOption(cars[1].id);
  await wait(600);
  relay.releaseWrites();
  check('both pick a car for one route at once: one plan on both', await converged(a.page, b.page));
  same('the last to reach the relay wins', JSON.parse(await planOf(a.page)).routes.find((r) => r.id === 'rt-02').carId, cars[1].id);
  const want = [{ type: 'set', kind: 'route', id: 'rt-02', field: 'carId', kept: cars[1].id, lost: cars[0].id }];
  same('both screens hold the same flag', [await flagsOf(a.page), await flagsOf(b.page)], [want, want]);
  const markOn = (pg) => routeRow(pg, 'rt-02').locator('[data-field="carId"]').evaluate((el) => el.classList.contains('room-collided') && el.title);
  const ma = await markOn(a.page);
  check('a quiet mark on the field, saying what was kept and what was lost', !!ma && ma.includes(`Kept “${cars[1].reg}”`) && ma.includes(`the other was “${cars[0].reg}”`), String(ma));
  same('the same mark on the other screen', await markOn(b.page), ma);
  const line = async (pg) => { await pg.click('[data-act="tab"][data-tab="data"]'); return pg.locator('#roomCard .room-flags li').allInnerTexts(); };
  const la = await line(a.page);
  check('and one line on the Shared plan card, with both values', la.length === 1 && la[0].includes(`Route 2's car was changed by both of you at once. Kept “${cars[1].reg}”; the other was “${cars[0].reg}”.`), JSON.stringify(la));
  same('the same line on the other screen', await line(b.page), la);
  check('no dialog for it, anywhere', !(await a.page.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open))) && !(await b.page.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open))));
  await a.page.locator('#roomCard .room-flags [data-act="room-putback"]').click();
  check('Put it back: the lost car is on the route again, on both', await b.page.waitForFunction((id) => state.routes.find((r) => r.id === 'rt-02').carId === id, cars[0].id, { timeout: 3000 }).then(() => true, () => false) && await converged(a.page, b.page));
  check('and the flag has gone from both, with nothing new flagged', await until(async () => (await flagsOf(a.page)).length === 0 && (await flagsOf(b.page)).length === 0));

  // Text, typed by both and left before the other's arrived: the same flag.
  await a.page.click('[data-act="tab"][data-tab="plan"]');
  await b.page.click('[data-act="tab"][data-tab="plan"]');
  relay.holdWrites();
  await routeRow(a.page, 'rt-03').locator('[data-field="round"]').fill('4');
  await a.page.keyboard.press('Tab');
  await routeRow(b.page, 'rt-03').locator('[data-field="round"]').fill('6');
  await b.page.keyboard.press('Tab');
  await wait(600);
  relay.releaseWrites();
  await converged(a.page, b.page);
  const want2 = [{ type: 'set', kind: 'route', id: 'rt-03', field: 'round', kept: '6', lost: '4' }];
  same('a round typed in both at once: the same flag on both', [await flagsOf(a.page), await flagsOf(b.page)], [want2, want2]);
  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.locator('#roomCard .room-flags [data-act="room-dismiss"]').click();
  same('Dismiss: gone from that screen, the value as it was', [(await flagsOf(b.page)).length, JSON.parse(await planOf(b.page)).routes.find((r) => r.id === 'rt-03').round, (await flagsOf(a.page)).length], [0, '6', 1]);
  same('collisions: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close();
  await b.context.close();
}

// Replacing the whole plan in a room changes it for both: the confirm each
// action already has says so in one line, Backups first as ever, and a
// Cancel sends nothing. No new dialog.
{
  const { secret, ops } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  const BOTH = 'This changes the shared plan for both of you.';
  await b.page.evaluate(() => { window.__dialogs = []; const real = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = function (...x) { window.__dialogs.push(this.id); return real.apply(this, x); }; });
  const quiet = async (what, n) => { await wait(900); same(`${what}: nothing is sent`, ops().length, n); };
  const newestBackup = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('carcoord:backups'))[0]);

  // A version to restore later.
  await a.page.click('[data-act="tab"][data-tab="data"]');
  await a.page.fill('#roomVersionName', 'Before the loads');
  await a.page.press('#roomVersionName', 'Enter');
  await noticeSays(a.page, /Pushed “Before the loads”/);
  const v1 = JSON.parse(await planOf(a.page));
  await b.page.click('[data-act="tab"][data-tab="data"]');
  await b.page.waitForSelector('#roomCard [data-act="room-look"]');

  // A share code.
  const code = await b.page.evaluate(() => Share.encode({ ...state, routes: state.routes.map((r) => ({ ...r, driver: `Coded ${r.name}` })) }, 'day'));
  let n = ops().length;
  await b.page.fill('#shareIn', code);
  await b.page.click('[data-act="share-read"]');
  await b.page.waitForFunction(() => document.getElementById('shareDlg').open);
  check('a share code\'s Load this list? says it changes the shared plan for both', (await b.page.locator('#shareDlg').innerText()).includes(BOTH));
  await b.page.click('[data-act="share-cancel"]');
  await quiet('Cancel on it', n);
  await b.page.click('[data-act="share-read"]');
  await b.page.click('[data-act="share-apply"]');
  check('Load it: Backups first', (await newestBackup(b.page)).label === 'Loading a shared list');
  check('and the other screen has the loaded list', await a.page.waitForFunction(() => state.routes.every((r) => r.driver === `Coded ${r.name}`), null, { timeout: 4000 }).then(() => true, () => false) && await converged(a.page, b.page));

  // A version, from Look first, and from the list.
  n = ops().length;
  await b.page.click('#roomCard [data-act="room-look"]');
  check('a version\'s Look first says it changes the shared plan for both', await dialogSays(b.page, new RegExp(BOTH.replace('.', '\\.'))));
  await b.page.click('[data-act="room-look-close"]');
  await quiet('Close on it', n);
  const restoreBtn = b.page.locator('#roomCard [data-act="room-restore"]').first();
  await restoreBtn.click();
  check('the list\'s Restore, armed, says it beside Sure?', (await restoreBtn.innerText()) === 'Sure?' && (await b.page.locator('#roomCard .room-versions').innerText()).includes(BOTH));
  await wait(3300);
  same('left to disarm, it sends nothing', ops().length, n);
  await b.page.click('#roomCard [data-act="room-look"]');
  await dialogSays(b.page, /Restoring it/);
  await b.page.click('#roomDlg [data-act="room-restore"]');
  check('Restore it: said so, for both of you', await noticeSays(b.page, /Restored the shared version “Before the loads” for both of you/));
  check('Backups first', /Before restoring the shared version/.test((await newestBackup(b.page)).label));
  check('and the other screen has the version', await a.page.waitForFunction((d) => state.routes[0].driver === d, v1.routes[0].driver, { timeout: 4000 }).then(() => true, () => false) && await converged(a.page, b.page));

  // A backup.
  n = ops().length;
  const backupBtn = b.page.locator('#backupsCard [data-act="restore"]').first();
  await backupBtn.click();
  check('Restore from Backups, armed, says it beside Sure?', (await backupBtn.innerText()) === 'Sure?' && (await b.page.locator('#backupsCard').innerText()).includes(BOTH));
  await wait(3300);
  same('left to disarm, it sends nothing', ops().length, n);
  const target = JSON.parse((await newestBackup(b.page)).json);
  await backupBtn.click();
  await backupBtn.click();
  check('restored: Backups first', (await newestBackup(b.page)).label === 'Restoring a backup');
  check('and the other screen has the backup\'s plan', await a.page.waitForFunction((d) => state.routes.map((r) => r.driver).join() === d, target.routes.map((r) => r.driver).join(), { timeout: 4000 }).then(() => true, () => false) && await converged(a.page, b.page));

  // Import: its confirm is the file picker, so the card says it beside it.
  n = ops().length;
  check('Import says it on its card while in the room', (await b.page.locator('#tab-data').innerText()).includes(`Importing replaces everything on screen. ${BOTH}`));
  await b.page.setInputFiles('#importFile', []);
  await quiet('a picker closed with no file', n);
  await b.page.setInputFiles('#importFile', { name: 'other-pc.json', mimeType: 'application/json', buffer: Buffer.from(OTHER) });
  check('Import: Backups first', /^Importing other-pc\.json$/.test((await newestBackup(b.page)).label));
  check('and the other screen has the imported plan', await a.page.waitForFunction(() => state.cars.some((c) => c.reg === 'ZZ 90001'), null, { timeout: 4000 }).then(() => true, () => false) && await converged(a.page, b.page));

  const opened = await b.page.evaluate(() => [...new Set(window.__dialogs)].sort());
  check('no new dialog: only the ones these actions already had', opened.every((id) => ['roomDlg', 'shareDlg'].includes(id)), JSON.stringify(opened));
  const legacy = await profile({ items: inRoom(OTHER_SEED, liveRoom().secret) });
  await pillSays(legacy.page, 'Not live');
  await legacy.page.click('[data-act="tab"][data-tab="data"]');
  check('a browser not following a room does not say it', !(await legacy.page.locator('#tab-data').innerText()).includes(BOTH));
  same('replace everything: no console errors', [...a.errors, ...b.errors, ...legacy.errors], []);
  for (const x of [a, b, legacy]) await x.context.close();
}

// Compaction: after 200 ops a browser that has applied them sends a snapshot
// at the seq it has applied, so the relay holds fewer than 200; a newcomer,
// and a browser away the whole time, still get the full plan.
{
  const { secret, k } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  // A browser that will be away for all of it, with the pair it would keep.
  const away = await a.page.evaluate(() => ({ plan: localStorage.getItem('carcoord:v1'), base: localStorage.getItem('carcoord:roomBase') }));
  // 250 changes, each sent as its own op (the gathering is skipped on purpose).
  await a.page.evaluate(async () => {
    for (let i = 0; i < 250; i++) {
      state.routes[i % state.routes.length].round = `c${i}`;
      save();
      roomFlush(room);
      if (i % 25 === 24) await new Promise((go) => setTimeout(go, 30));
    }
  });
  const roomNow = () => relay.rooms.get(k.roomId);
  check('250 changes reach the relay', await until(() => roomNow().seq >= 250, 15000), String(roomNow().seq));
  check('the relay holds a snapshot past 200 and fewer than 200 ops', await until(() => roomNow().snapshot && roomNow().snapshot.seq >= 200 && roomNow().ops.length < 200, 10000),
    JSON.stringify({ snap: roomNow().snapshot && roomNow().snapshot.seq, ops: roomNow().ops.length }));
  const snaps = relay.sent('snapshot', k.roomId);
  check('every snapshot was at or below the seq its sender had applied, and the room\'s', snaps.every((f) => f.seq <= roomNow().seq) && relay.open >= 2);
  check('both browsers end on one plan', await converged(a.page, b.page));
  const snap = unseal(secret, 'snapshot', roomNow().snapshot.body);
  check('the snapshot holds the plan as it was at its seq', snap.plan.routes.some((r) => /^c\d+$/.test(r.round) && Number(r.round.slice(1)) >= 185));

  const j = await profile({ items: OTHER_SEED });
  await openInvite(j.page, `#join=${secret}`);
  await dialogSays(j.page, /holds 15 routes/);
  await j.page.click('[data-act="room-take"]');
  await pillSays(j.page, 'Connected');
  same('a newcomer still gets the full plan', await planOf(j.page), await planOf(a.page));

  const c = await profile({ items: inRoom({ ...SEED, 'carcoord:v1': away.plan, 'carcoord:roomBase': away.base }, secret) });
  check('a browser away for all of it catches up from the snapshot', await c.page.waitForFunction(() => roomLive() && room.caught, null, { timeout: 5000 }).then(() => true, () => false) && await converged(c.page, a.page));
  await routeBox(a.page, 0, 'driver').fill('After Compaction');
  check('and follows live from there', await c.page.waitForFunction(() => state.routes[0].driver === 'After Compaction', null, { timeout: 3000 }).then(() => true, () => false));
  same('compaction: no console errors', [...a.errors, ...b.errors, ...j.errors, ...c.errors], []);
  for (const x of [a, b, j, c]) await x.context.close();
}

// The rest of the "Two people at once" table: one car on two routes at once,
// a slow connection, and a question whose counts move under it.
{
  const { secret } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);

  // Both put one car on two routes at once: the clash warning, as today.
  const car = await a.page.evaluate(() => { const c = state.cars.find((x) => !['rt-01', 'rt-02'].some((id) => state.routes.find((r) => r.id === id).carId === x.id)); return { id: c.id, reg: c.reg }; });
  relay.holdWrites();
  await routeRow(a.page, 'rt-01').locator('[data-field="carId"]').selectOption(car.id);
  await routeRow(b.page, 'rt-02').locator('[data-field="carId"]').selectOption(car.id);
  await wait(600);
  relay.releaseWrites();
  check('one car put on two routes at once: both kept, one plan', await converged(a.page, b.page) && await a.page.evaluate((id) => ['rt-01', 'rt-02'].every((x) => state.routes.find((r) => r.id === x).carId === id), car.id));
  for (const [who, x] of [['this', a], ['the other', b]]) {
    await x.page.waitForFunction((reg) => (document.querySelector('#tab-plan .problems')?.innerText || '').includes(reg), car.reg, { timeout: 3000 }).catch(() => {});
    check(`the clash warning shows on ${who} screen: the amber box and both rows striped`, (await x.page.locator('#tab-plan .problems').innerText()).includes(car.reg)
      && await routeRow(x.page, 'rt-01').evaluate((el) => el.classList.contains('warn')) && await routeRow(x.page, 'rt-02').evaluate((el) => el.classList.contains('warn')));
  }
  same('a warning, not a block, and no flag: they changed different routes', [await flagsOf(a.page), await flagsOf(b.page)], [[], []]);

  // A slow connection: the edit is on screen and saved at once; the pill says
  // Sending… until the relay has it.
  relay.holdWrites();
  await routeBox(a.page, 2, 'driver').fill('Slow Sigrid');
  same('slow: the edit is on screen at once', await routeBox(a.page, 2, 'driver').inputValue(), 'Slow Sigrid');
  check('and saved in this browser at once', await a.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:v1')).routes[2].driver === 'Slow Sigrid'));
  check('the pill quietly says Sending… while the relay has not got it', await pillSays(a.page, 'Sending…', 4000), await pill(a.page).textContent());
  check('nothing else is blocked meanwhile', await a.page.evaluate(() => [...document.querySelectorAll('dialog')].every((d) => !d.open)) && !(await routeBox(a.page, 3, 'driver').isDisabled()));
  relay.releaseWrites();
  check('let through: Connected again, and the other has it', await pillSays(a.page, 'Connected', 4000) && await b.page.waitForFunction(() => state.routes[2].driver === 'Slow Sigrid', null, { timeout: 3000 }).then(() => true, () => false));

  // A template's load question redraws its counts when the room changes the plan.
  await b.page.evaluate(() => { askTemplate(state.templates.find((t) => t.routes.length)); render(); });
  const says = () => b.page.locator('#notices .tpl-says').innerText();
  check('the load question counts the routes on screen', /Replaces your 15 routes/.test(await says()), await says());
  await a.page.click('[data-act="add-route"]');
  check('a route added by the other: it counts 16, and says the plan changed', await b.page.waitForFunction(() => /Replaces your 16 routes/.test(document.querySelector('#notices .tpl-says')?.innerText || '') && /changed while this was open/.test(document.getElementById('notices').innerText), null, { timeout: 3000 }).then(() => true, () => false), await says());
  await b.page.locator('#notices [data-act="load-template"]').click();
  check('Load acts on the plan as it is now: its Backup holds the 16 routes', JSON.parse(JSON.parse(await b.page.evaluate(() => localStorage.getItem('carcoord:backups')))[0].json).routes.length === 16);
  check('and the loaded template reaches the other screen', await converged(a.page, b.page));
  same('the rest of the table: no console errors', [...a.errors, ...b.errors], []);
  await a.context.close();
  await b.context.close();
}

// The copy shipped as 0.15.0 (round 1) applies no ops: in a room this build
// has written live edits to, it must still only read, and never take it or
// push a snapshot over the ops. Served from git as it shipped, so this
// proves its behaviour rather than assuming it.
{
  const SHIPPED = 'b26529f';   // "Announce the shared plan and cut 0.15.0"
  const repo = fileURLToPath(new URL('..', import.meta.url));
  let dir = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'cc-0.15.0-'));
    execSync(`git -C "${repo}" archive ${SHIPPED} docs | tar -x -C "${dir}"`, { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; }
  if (!dir) {
    // A shallow clone (CI's default checkout) does not hold the commit.
    console.log(`  skip  0.15.0 in a room with ops: commit ${SHIPPED} is not in this clone; run it in a full clone`);
  } else {
    const old = await startServer(0, join(dir, 'docs'));
    const { secret, k, ops } = liveRoom();
    const a = await live(SEED, secret);
    await routeBox(a.page, 0, 'driver').fill('Live From 0.16');
    await until(() => ops().length === 1);
    const context = await browser.newContext();
    await relay.attach(context);
    const page = await context.newPage();
    await page.addInitScript((seed) => {
      if (location.protocol === 'about:' || sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1'); localStorage.clear(); for (const [key, v] of Object.entries(seed)) localStorage.setItem(key, v);
    }, { ...inRoom(SEED, secret), 'carcoord:pref:seenUpdate': '0.15.0' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(old.base, { waitUntil: 'networkidle' });
    same('the old copy is really 0.15.0', await page.evaluate(() => APP_VERSION), '0.15.0');
    check('0.15.0 in a room holding live ops: Update the app', await pillSays(page, 'Update the app'), await pill(page).textContent().catch(() => 'no pill'));
    const writes = () => relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length;
    const wrote = writes();
    await page.click('[data-act="tab"][data-tab="data"]');
    check('its Push is disabled', await page.locator('[data-act="room-push"]').isDisabled());
    await page.evaluate(() => { const box = document.getElementById('roomVersionName'); box.disabled = false; box.value = 'Old over new'; return roomPush(); });
    await wait(800);
    same('and pushing anyway sends no snapshot, version or op', writes(), wrote);
    same('the live op is still in the room', relay.rooms.get(k.roomId).ops.map((o) => o.seq), [1]);
    // Another PC on 0.15.0, opening the invite.
    const joiner = await browser.newContext();
    await relay.attach(joiner);
    const jp = await joiner.newPage();
    await jp.addInitScript((seed) => {
      if (location.protocol === 'about:' || sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1'); localStorage.clear(); for (const [key, v] of Object.entries(seed)) localStorage.setItem(key, v);
    }, { ...OTHER_SEED, 'carcoord:pref:seenUpdate': '0.15.0' });
    jp.on('pageerror', (e) => errors.push(String(e)));
    await jp.goto(old.base, { waitUntil: 'networkidle' });
    await jp.goto('about:blank');
    await jp.goto(`${old.base}#join=${secret}`, { waitUntil: 'networkidle' });
    check('offered the room, 0.15.0 says to update and has no Take', await dialogSays(jp, /Update the app to join it/) && (await jp.locator('[data-act="room-take"]').count()) === 0, await jp.locator('#roomDlg').innerText().catch(() => 'no dialog'));
    same('0.15.0: no page errors', [...errors, ...a.errors], []);
    await joiner.close();
    await context.close();
    await a.context.close();
    await old.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// A relay restored from an older copy: its seqs are behind this browser's.
// It never sends on top of numbers that now mean something else; it starts
// over, and with its plan differing from the room's, offers to take it.
{
  const { secret, k, ops } = liveRoom();
  const a = await live(SEED, secret);
  await routeBox(a.page, 0, 'driver').fill('Lost In Restore');
  await until(() => ops().length === 1);
  await a.page.waitForFunction(() => room.rep.seq === 1, null, { timeout: 3000 });
  relay.makeRoom(k.roomId, k.token, { snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan: created.plan }) } });
  relay.down();
  await pillSays(a.page, 'Offline');
  relay.up();
  check('a room behind this browser: Not live, offering to take it', await pillSays(a.page, 'Not live', 10000), await pill(a.page).textContent().catch(() => 'no pill'));
  await routeBox(a.page, 1, 'driver').fill('Not Over Old Seqs');
  await wait(800);
  same('and nothing is sent to it', ops().length, 0);
  same('the plan here is kept as it was', await a.page.evaluate(() => state.routes[0].driver), 'Lost In Restore');
  same('restored relay: no console errors', a.errors, []);
  await a.context.close();
}

// Ops of a newer schema: applied by no browser of this build, which only
// reads the room from then on, live or on joining.
{
  const { secret, k, ops } = liveRoom();
  const a = await live(SEED, secret);
  const newer = { schema: 7, oid: 'f'.repeat(16), changes: [{ op: 'set', kind: 'route', id: 'rt-01', field: 'driver', value: 'From The Future' }] };
  await a.page.evaluate((body) => room.conn.send({ type: 'op', body }), seal(secret, 'op', newer));
  const b = await profile({ items: inRoom(SEED, secret) });
  check('a room holding an op of a newer schema: Update the app', await pillSays(b.page, 'Update the app'), await pill(b.page).textContent().catch(() => 'no pill'));
  check('and its edit is not applied', await b.page.evaluate(() => state.routes[0].driver) !== 'From The Future');
  await routeBox(b.page, 1, 'driver').fill('Stays Here');
  await wait(800);
  same('nothing is sent from it', ops().length, 1);
  await b.page.evaluate((body) => room.conn.send({ type: 'op', body }), seal(secret, 'op', newer));
  const c = await profile({ items: inRoom(SEED, secret) });
  await pillSays(c.page, 'Update the app');
  check('live, a newer op that arrives makes a following browser read-only too', await pillSays(a.page, 'Update the app') && await a.page.evaluate(() => state.routes[0].driver) !== 'From The Future');
  const j = await profile({ items: OTHER_SEED });
  await openInvite(j.page, `#join=${secret}`);
  check('offered: Update the app to join it, and no Take', await dialogSays(j.page, /Update the app to join it/) && (await j.page.locator('[data-act="room-take"]').count()) === 0);
  same('newer ops: no console errors', [...a.errors, ...b.errors, ...c.errors, ...j.errors], []);
  for (const x of [a, b, c, j]) await x.context.close();
  void k;
}

// A browser that joined before live updates, whose plan is not the room's,
// does not follow it: its plan would be sent as edits over the other's.
{
  const { secret, k, ops } = liveRoom();
  const p = await profile({ items: inRoom(OTHER_SEED, secret) });
  check('a browser with no record of the room and another plan: Not live', await pillSays(p.page, 'Not live'), await pill(p.page).textContent().catch(() => 'no pill'));
  await routeBox(p.page, 0, 'driver').fill('Not Sent Nils');
  await wait(800);
  same('its edits are not sent', [ops().length, relay.sent('snapshot', k.roomId).length], [0, 0]);
  await p.page.click('[data-act="tab"][data-tab="data"]');
  check('the card says why, and offers to take the shared plan', /joined it before live updates/.test(await p.page.locator('#roomStatus').innerText()) && (await p.page.locator('[data-act="room-retake"]').count()) === 1);
  await p.page.click('[data-act="room-retake"]');
  check('which opens the offer it already has', await dialogSays(p.page, /Join this shared plan\?[\s\S]*Taking it replaces everything on screen/), await p.page.locator('#roomDlg').innerText().catch(() => ''));
  await p.page.click('[data-act="room-take"]');
  check('taken: it follows live', await pillSays(p.page, 'Connected') && await p.page.waitForFunction(() => roomLive(), null, { timeout: 5000 }).then(() => true, () => false));
  same('with the room\'s plan on screen', JSON.parse(await planOf(p.page)).routes[0].driver, created.plan.routes[0].driver);
  check('and its own in Backups', /Not Sent Nils/.test(JSON.parse(await p.page.evaluate(() => localStorage.getItem('carcoord:backups')))[0].json));
  same('not live: no console errors', p.errors, []);
  await p.context.close();
}

// >>> review fixes: the concurrency and live-data review of round 2 (each
// section failed on 7ff16fc before its fix).
// The pair a browser keeps, as a profile reopening it would find it.
const keptPair = (pg) => pg.evaluate(() => ({ plan: localStorage.getItem('carcoord:v1'), base: localStorage.getItem('carcoord:roomBase') }));
const opsAfter = (ops, seq) => ops().filter((o) => o.seq > seq);

// The base moves with this browser's own edits once they are confirmed: a
// browser closed after its edit was acked, reopened after the other removed
// what it added, never sends that edit again over the removal.
{
  const { secret, ops } = liveRoom();
  const a = await live(SEED, secret);
  const b = await live(SEED, secret);
  await a.page.click('[data-act="add-route"]');
  const added = await a.page.evaluate(() => state.routes.at(-1).id);
  check('own edit: the added route reaches the other browser', await b.page.waitForFunction((id) => state.routes.some((r) => r.id === id), added, { timeout: 3000 }).then(() => true, () => false));
  await a.page.waitForFunction(() => room.rep.queue.length === 0 && room.rep.seq === 1, null, { timeout: 3000 });
  await wait(300);
  const pair = await keptPair(a.page);
  await a.context.close();
  await removeRoute(b.page, added);
  await until(() => ops().length === 2);
  const removedAt = ops().at(-1).seq;
  const a2 = await profile({ items: inRoom({ ...SEED, 'carcoord:v1': pair.plan, 'carcoord:roomBase': pair.base }, secret) });
  await a2.page.waitForFunction(() => roomLive() && room.caught, null, { timeout: 5000 }).catch(() => {});
  await wait(1000);
  same('reopened after the other removed what it added: nothing is sent again', opsAfter(ops, removedAt).map((o) => o.changes), []);
  check('and the route stays removed on both screens', !(await hasRoute(a2.page, added)) && !(await hasRoute(b.page, added)) && await converged(a2.page, b.page));
  same('base after own ack: no console errors', [...a2.errors, ...b.errors], []);
  for (const x of [a2, b]) await x.context.close();
}

// A relay restored from an older copy that holds an op past its snapshot:
// starting over reads the room whole (catchup since 0), so a room holding
// this browser's own plan is followed again rather than taken for a newer
// build's.
{
  const { secret, k, ops } = liveRoom();
  const a = await live(SEED, secret);
  for (const [i, name] of [[0, 'Restored One'], [1, 'Restored Two'], [2, 'Restored Three']]) {
    await routeBox(a.page, i, 'driver').fill(name);
    await until(() => ops().length === i + 1);
  }
  await a.page.waitForFunction(() => room.rep.seq === 3 && !room.rep.queue.length, null, { timeout: 3000 });
  // The copy restored: the snapshot at 0, and one op carrying all three edits.
  const changes = [['rt-01', 'Restored One'], ['rt-02', 'Restored Two'], ['rt-03', 'Restored Three']].map(([id, value]) => ({ op: 'set', kind: 'route', id, field: 'driver', value }));
  relay.makeRoom(k.roomId, k.token, { seq: 1, snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan: created.plan }) }, ops: [{ seq: 1, body: seal(secret, 'op', { schema: 6, oid: 'e'.repeat(16), changes }) }] });
  try {
    relay.down();
    await pillSays(a.page, 'Offline');
  } finally { relay.up(); }
  check('a restored room with an op past its snapshot, holding this plan: followed again, not Update the app', await pillSays(a.page, 'Connected', 10000) && await a.page.waitForFunction(() => roomLive() && room.caught && room.rep.seq === 1, null, { timeout: 3000 }).then(() => true, () => false),
    `${await pill(a.page).textContent().catch(() => 'no pill')} ${await a.page.evaluate(() => JSON.stringify({ ahead: room.ahead, legacy: room.legacy, seq: room.rep && room.rep.seq }))}`);
  await routeBox(a.page, 3, 'driver').fill('After Restore');
  check('and an edit after it goes to the room at its next seq', await until(() => ops().some((o) => o.seq === 2 && o.changes.some((c) => c.value === 'After Restore'))), JSON.stringify(ops().map((o) => o.seq)));
  same('restored relay with ops: no console errors', a.errors, []);
  await a.context.close();
}
// <<< review fixes

// ---------------------------------------------------------------------------
// Push seals first, which takes a moment: what the room says meanwhile still
// counts, and a push that is no longer allowed sends nothing.
{
  const { secret } = created;
  const k = keysOf(secret);
  const p = await profile({ items: inRoom(SEED, secret) });
  await pillSays(p.page, 'Connected');
  await p.page.click('[data-act="tab"][data-tab="data"]');
  await p.page.waitForSelector('[data-act="room-push"]:not([disabled])');
  const writes = () => relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length;
  // Holds every seal until let go, then flips the room while Push waits.
  const racePush = (flip) => p.page.evaluate(async (what) => {
    const real = Sync.seal;
    let go;
    const held = new Promise((resolve) => { go = resolve; });
    Sync.seal = async (...args) => { await held; return real(...args); };
    document.getElementById('roomVersionName').value = `Raced by ${what}`;
    const pushing = roomPush();
    if (what === 'reconnect') room.caught = false; else room.ahead = true;
    go();
    await pushing;
    Sync.seal = real;
    if (what === 'reconnect') room.caught = true; else room.ahead = false;
  }, flip);
  const wrote = writes();
  await racePush('reconnect');
  check('a reconnect during Push: nothing sent, and said so', writes() === wrote && await noticeSays(p.page, /changed while the version was being made, so nothing was pushed/), String(writes() - wrote));
  await racePush('ops');
  check('the room read-only by the time it is sealed: nothing sent, and said so', writes() === wrote && await noticeSays(p.page, /Update the app to push/), String(writes() - wrote));
  same('push race: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// What comes out of the room is shown as text, never as markup: the date
// included, which is the one part of a preview drawn without esc() before.
{
  const secret = newSecret();
  const k = keysOf(secret);
  const evil = '<img src=x onerror="window.__xss=1">';
  const plan = { ...created.plan, date: evil };
  relay.makeRoom(k.roomId, k.token, {
    snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan }) },
    versions: [versionOf(secret, `${evil} name`, plan)],
  });
  const p = await profile({ items: inRoom(SEED, secret) });
  await pillSays(p.page, 'Connected');
  await p.page.click('[data-act="tab"][data-tab="data"]');
  await p.page.waitForSelector('#roomCard [data-act="room-look"]');
  check('a version\'s name with markup in it is shown as text', (await p.page.locator('#roomCard .room-v-name').innerText()) === `${evil} name` && (await p.page.locator('#roomCard img').count()) === 0);
  await p.page.click('#roomCard [data-act="room-look"]');
  check('a date that is not a date: Look first says no date', await dialogSays(p.page, /It is dated no date/), await p.page.locator('#roomDlg').innerText().catch(() => ''));
  await wait(300);
  check('and draws none of it as markup', (await p.page.locator('#roomDlg img').count()) === 0 && await p.page.evaluate(() => window.__xss === undefined));
  await p.page.click('[data-act="room-look-close"]');
  same('markup: no console errors', p.errors, []);
  await p.context.close();
}

// ---------------------------------------------------------------------------
// A version's body must be the one its name was pushed with, and a plan whose
// own schemaVersion is newer is never taken or restored, whatever its
// envelope says.
{
  const secret = newSecret();
  const k = keysOf(secret);
  const plan = created.plan;
  const swapped = { ...plan, routes: plan.routes.map((r, i) => (i === 0 ? { ...r, driver: 'Swapped Sara' } : r)) };
  const tuesday = versionOf(secret, 'Tuesday', plan);
  const wednesday = versionOf(secret, 'Wednesday', swapped);
  relay.makeRoom(k.roomId, k.token, {
    snapshot: { seq: 0, body: seal(secret, 'snapshot', { schema: 6, plan }) },
    versions: [
      // 1: Tuesday's name with Wednesday's body, as a relay could pair them.
      { label: tuesday.label, body: wednesday.body },
      // 2: a body with no name or nonce at all.
      { label: seal(secret, 'label', { schema: 6, name: 'Unbound' }), body: seal(secret, 'version', { schema: 6, plan: swapped }) },
      // 3: an envelope of this build's schema round a newer plan.
      versionOf(secret, 'Newer inside', { ...swapped, schemaVersion: 7 }),
    ],
  });
  const p = await profile({ items: inRoom(SEED, secret) });
  await pillSays(p.page, 'Connected');
  await p.page.click('[data-act="tab"][data-tab="data"]');
  await p.page.waitForSelector('#roomCard [data-act="room-look"]');
  const was = await kept(p.page);
  const fresh = () => p.page.evaluate(() => { notices = []; render(); });
  const dialogOpen = () => p.page.evaluate(() => !!document.getElementById('roomDlg')?.open);
  const mismatch = /This version does not match its name, so nothing was changed/;
  for (const id of [1, 2]) {
    await fresh();
    await p.page.click(`#roomCard [data-act="room-look"][data-id="${id}"]`);
    check(`version ${id}, Look first: does not match its name, and shows nothing`, await noticeSays(p.page, mismatch) && !(await dialogOpen()));
    await fresh();
    await p.page.click(`#roomCard [data-act="room-restore"][data-id="${id}"]`);
    await p.page.click(`#roomCard [data-act="room-restore"][data-id="${id}"]`);
    check(`version ${id}, Restore: does not match its name`, await noticeSays(p.page, mismatch));
  }
  same('and nothing changed', await kept(p.page), was);
  check('the swapped plan is not on screen', await p.page.evaluate(() => state.routes[0].driver) !== 'Swapped Sara');
  await p.page.click('#roomCard [data-act="room-look"][data-id="3"]');
  check('a newer plan in a current envelope: Look first says to update, with no Restore', await dialogSays(p.page, /Update the app to restore it/) && (await p.page.locator('#roomDlg [data-act="room-restore"]').count()) === 0);
  await p.page.click('[data-act="room-look-close"]');
  await fresh();
  await p.page.evaluate(() => roomRestore(3));
  check('and Restore refuses it', await noticeSays(p.page, /Update the app to restore \u201cNewer inside\u201d/));
  same('nothing changed', await kept(p.page), was);
  same('binding: no console errors', p.errors, []);
  await p.context.close();

  // A snapshot whose plan is newer than its envelope: the offer has no Take.
  const secret2 = newSecret();
  const k2 = keysOf(secret2);
  relay.makeRoom(k2.roomId, k2.token, { snapshot: { seq: 0, body: seal(secret2, 'snapshot', { schema: 6, plan: { ...plan, schemaVersion: 7 } }) } });
  const j = await profile({ items: OTHER_SEED });
  const before = await kept(j.page);
  await openInvite(j.page, `#join=${secret2}`);
  check('a newer plan in a current snapshot: the offer says to update, with no Take', await dialogSays(j.page, /Update the app to join it/) && (await j.page.locator('[data-act="room-take"]').count()) === 0);
  await j.page.click('[data-act="room-notnow"]');
  same('and nothing changed', await kept(j.page), before);
  await j.context.close();
}

// ---------------------------------------------------------------------------
// A second tab of the same browser changes the plan while this one cannot
// follow the room (its plan is not the room's, so it is Not live): this one
// is stale, so it saves and pushes nothing until it is reloaded. Round 1
// blocked it with a dialog; now only the pill says so (owner, 2026-10-08).
{
  const { secret } = created;
  const k = keysOf(secret);
  const p = await profile({ items: inRoom(SEED, secret) });
  await pillSays(p.page, 'Not live');
  await p.page.click('[data-act="tab"][data-tab="data"]');
  const second = await p.context.newPage();
  await second.goto(base, { waitUntil: 'networkidle' });
  await pillSays(second, 'Not live');
  const anyDialog = (pg) => pg.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open));
  await wait(500);
  check('opening a second tab leaves the first as it was', !(await anyDialog(p.page)) && await pillSays(p.page, 'Not live', 500));
  const driver = () => p.page.evaluate(() => JSON.parse(localStorage.getItem('carcoord:v1')).routes[0].driver);
  await second.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').fill('Second Tab Svendsen');
  same('the second tab saves its edit', await driver(), 'Second Tab Svendsen');
  check('the bar of the first tab says to reload', await pillSays(p.page, 'Reload this tab'));
  check('and no dialog opens for it', !(await anyDialog(p.page)) && (await p.page.locator('#elsewhereDlg').count()) === 0);
  await p.page.evaluate(() => { state.routes[0].driver = 'Stale Stian'; save(); });
  same('a save in the stale tab writes nothing over it', await driver(), 'Second Tab Svendsen');
  const writes = () => relay.log.filter((x) => x.roomId === k.roomId && ['snapshot', 'version', 'op'].includes(x.frame.type)).length;
  const wrote = writes();
  await p.page.evaluate(() => { const box = document.getElementById('roomVersionName'); box.value = 'From the stale tab'; return roomPush(); });
  check('and a push from it sends nothing', await noticeSays(p.page, /changed in another tab, so nothing was pushed/) && writes() === wrote);
  await p.page.reload({ waitUntil: 'networkidle' });
  await pillSays(p.page, 'Not live');
  same('Reload: the first tab now shows the second tab\'s plan', await p.page.evaluate(() => state.routes[0].driver), 'Second Tab Svendsen');
  check('and is a normal tab again', !(await pillSays(p.page, 'Reload this tab', 500)));
  same('second tab: no console errors', p.errors, []);
  await p.context.close();
}

// Two tabs of one browser following the room live: each is one more
// receiver. They edit in turn with no dialog and end identical to the other PC.
{
  const { secret } = liveRoom();
  const a1 = await live(SEED, secret);
  const a2 = { page: await a1.context.newPage() };
  await a2.page.goto(base, { waitUntil: 'networkidle' });
  await pillSays(a2.page, 'Connected');
  await a2.page.waitForFunction(() => roomLive() && room.caught, null, { timeout: 5000 });
  const b = await live(SEED, secret);
  const anyDialog = (pg) => pg.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open));
  check('a second tab of the same browser follows the room live too', await a2.page.evaluate(() => roomLive()));
  await routeBox(a1.page, 0, 'driver').fill('Tab One');
  await a1.page.keyboard.press('Tab');
  await routeBox(a2.page, 1, 'driver').fill('Tab Two');
  await a2.page.keyboard.press('Tab');
  await routeBox(b.page, 2, 'driver').fill('Other PC');
  await b.page.keyboard.press('Tab');
  await routeBox(a1.page, 3, 'round').fill('3');
  await a1.page.keyboard.press('Tab');
  await routeBox(a2.page, 4, 'round').fill('4');
  await a2.page.keyboard.press('Tab');
  check('two tabs and the other PC end on one plan', await converged(a1.page, b.page) && await converged(a2.page, b.page));
  const end = JSON.parse(await planOf(b.page));
  check('holding every edit', end.routes[0].driver === 'Tab One' && end.routes[1].driver === 'Tab Two' && end.routes[2].driver === 'Other PC' && end.routes[3].round === '3' && end.routes[4].round === '4');
  check('with no dialog and no Reload this tab in either tab', !(await anyDialog(a1.page)) && !(await anyDialog(a2.page)) && await pillSays(a1.page, 'Connected', 500) && await pillSays(a2.page, 'Connected', 500));
  same('and the browser\'s saved plan is that plan', await a1.page.evaluate(() => localStorage.getItem('carcoord:v1')), await planOf(b.page));
  same('two tabs: no console errors', [...a1.errors, ...b.errors], []);
  await a1.context.close();
  await b.context.close();
}

// ---------------------------------------------------------------------------
// Leave: the key is forgotten, the plan stays, and the network goes quiet,
// in this tab, in another tab of the same browser, and after a reload.
{
  const { secret } = created;
  const k = keysOf(secret);
  const p = await profile({ items: inRoom(SEED, secret) });
  const second = await p.context.newPage();
  await second.goto(base, { waitUntil: 'networkidle' });
  await pillSays(p.page, 'Connected');
  // Its plan is no longer the room's (the sections above edited it live), so
  // the pill may say Not live: either way it is in the room.
  check('a second tab of the same browser is in the room too', await pillSays(second, 'Connected', 2000) || await pillSays(second, 'Not live'));
  await p.page.click('[data-act="tab"][data-tab="data"]');
  const plan = await p.page.evaluate(() => JSON.stringify(state));
  const saved = (await kept(p.page)).plan;
  await p.page.click('[data-act="room-leave"]');
  check('Leave asks Sure? first, and is still in the room', (await p.page.locator('[data-act="room-leave"]').innerText()) === 'Sure?' && (await kept(p.page)).room === secret);
  await p.page.click('[data-act="room-leave"]');
  check('Leave: said so', await noticeSays(p.page, /Left the shared plan\. Your plan stays on this PC/));
  same('the key is forgotten', (await kept(p.page)).room, null);
  same('the plan on screen is unchanged', await p.page.evaluate(() => JSON.stringify(state)), plan);
  same('and so is the saved one', (await kept(p.page)).plan, saved);
  check('no status in the bar', (await pill(p.page).count()) === 0);
  check('the card offers Create again', (await p.page.locator('#roomCard [data-act="room-create"]').count()) === 1);
  check('the Data tab says nothing is sent again', (await p.page.locator('#tab-data > .hint').first().innerText()).includes('never sends'));
  check('the other tab left with it', await second.waitForFunction(() => !document.getElementById('syncStatus'), null, { timeout: 5000 }).then(() => true, () => false));
  check('and no socket to the room is open', await until(() => relay.open === 0));
  const made = await p.page.evaluate(() => window.__sockets);
  const dials = relay.dialled;
  await wait(2500);
  same('after Leave: no new socket, in either tab', [await p.page.evaluate(() => window.__sockets) - made, relay.dialled - dials], [0, 0]);
  await p.page.reload({ waitUntil: 'networkidle' });
  for (const t of TABS) await p.page.click(`[data-act="tab"][data-tab="${t}"]`);
  await wait(2500);
  same('after Leave and a reload: no WebSocket at all', await p.page.evaluate(() => window.__sockets), 0);
  same('no request leaves the app\'s own server', p.requests, []);
  same('and the plan is still the one left with', await p.page.evaluate(() => JSON.stringify(state)), plan);
  same('Leave: no console errors', p.errors, []);
  await p.context.close();
}

await browser.close();
await server.close();
console.log(failures.length ? `\n${failures.length} sync-ui check(s) failed` : '\nsync-ui checks passed');
process.exit(failures.length ? 1 : 0);
