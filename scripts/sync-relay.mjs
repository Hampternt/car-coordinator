// The long-poll fallback end to end: the real relay (relay/, built here with
// cargo), the real app in Chromium under its own security policy, and two
// managers in one shared plan, one of them on a network that lets no
// WebSocket through. Run: node scripts/sync-relay.mjs
//
// The other browser tests use sync-fakerelay.mjs, which speaks the WebSocket
// only. This one is what proves the fallback: that the relay's answers reach
// the page across origins, that the page's policy lets the requests out, and
// that the app creates, joins, edits live and reconnects over plain requests
// as it does over a socket. Without cargo on the PATH it says so and passes.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { pollNoise } from './sync-fakerelay.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'relay', 'Cargo.toml');
const CODE = 'sync-relay-code';

if (spawnSync('cargo', ['--version']).status !== 0) {
  console.log('sync-relay: SKIPPED, cargo is not on the PATH (the relay could not be built)');
  process.exit(0);
}
const build = spawnSync('cargo', ['build', '--quiet', '--manifest-path', MANIFEST], { stdio: 'inherit' });
if (build.status !== 0) { console.error('sync-relay: the relay did not build'); process.exit(1); }
const BINARY = join(ROOT, 'relay', 'target', 'debug', 'carsync-relay');

const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const DEV = await readFile(new URL('./fixtures/dev-data.json', import.meta.url), 'utf8');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer();
const base = server.base;
const origin = new URL(base).origin;
const data = await mkdtemp(join(tmpdir(), 'carsync-e2e-'));

// The relay on `bind`; resolves with it and the address it is listening on.
function startRelay(bind) {
  const child = spawn(BINARY, [], {
    env: { ...process.env, RELAY_BIND: bind, RELAY_DATA: data, RELAY_CREATE_CODE: CODE, RELAY_ORIGINS: origin },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let said = '';
    const timer = setTimeout(() => reject(new Error(`the relay did not start: ${said}`)), 10000);
    child.stderr.on('data', (chunk) => {
      said += chunk;
      const m = /listening on (\S+)/.exec(said);
      if (m) { clearTimeout(timer); resolve({ child, addr: m[1] }); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the relay exited (${code}): ${said}`)); });
  });
}
const stopRelay = (relay) => new Promise((resolve) => {
  relay.child.removeAllListeners('exit');
  relay.child.once('exit', resolve);
  relay.child.kill('SIGTERM');
});

let relay = await startRelay('127.0.0.1:0');
const relayWs = `ws://${relay.addr}`;
const SEED = { 'carcoord:v1': DEV, 'carcoord:pref:seenUpdate': VERSION, 'carcoord:pref:infoHint': 'done', 'carcoord:pref:relay': relayWs };

const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});

/* One browser profile, seeded once, with what it sent beyond the app's own
   server counted. `blocked`: a network whose proxy refuses every WebSocket,
   the way the managers' office network does. */
async function profile({ items, blocked = false }) {
  const context = await browser.newContext();
  if (blocked) await context.routeWebSocket(/.*/, (ws) => ws.close({ code: 1006, reason: 'blocked by the proxy' }));
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
  // While the relay is restarted on purpose, Chrome logs each refused socket
  // and request; those are the relay being down, not the app going wrong.
  const down = (m) => /^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/rooms\/[A-Za-z0-9_-]{22}\/ws' failed/.test(m.text());
  page.on('console', (m) => m.type() === 'error' && !pollNoise(m) && !down(m) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base)) requests.push(r.url()); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return { context, page, errors, requests };
}
const pillSays = async (pg, text, ms = 10000) => {
  try { await pg.waitForFunction((t) => (document.getElementById('syncStatus')?.textContent || '').split(' · ')[0] === `Shared plan: ${t}`, text, { timeout: ms }); return true; } catch { return false; }
};
const pillText = (pg) => pg.locator('#syncStatus').textContent().catch(() => 'no pill');
const transport = (pg) => pg.evaluate(() => room && room.conn && room.conn.transport);
const caught = (pg) => pg.waitForFunction(() => !!room && !!room.rep && room.caught, null, { timeout: 10000 }).then(() => true, () => false);
const routeBox = (pg, i, f) => pg.locator('#tab-plan tbody tr').nth(i).locator(`[data-field="${f}"]`);
const driverOn = (pg, i) => pg.evaluate((n) => state.routes[n].driver, i);
const reaches = (pg, i, want, ms = 10000) => pg.waitForFunction(([n, w]) => state.routes[n].driver === w, [i, want], { timeout: ms }).then(() => true, () => false);

try {
  // A: WebSockets blocked. Creating the shared plan goes over plain requests.
  const a = await profile({ items: SEED, blocked: true });
  await a.page.click('[data-act="tab"][data-tab="data"]');
  await a.page.fill('#roomCode', CODE);
  await a.page.press('#roomCode', 'Enter');
  check('blocked WebSockets: Create still connects', await pillSays(a.page, 'Connected'), await pillText(a.page));
  same('over long-poll', await transport(a.page), 'poll');
  check('and the Data card says why it may be slower', (await a.page.locator('#roomStatus').innerText()).includes('This network blocks the usual connection'), await a.page.locator('#roomStatus').innerText());
  const secret = await a.page.evaluate(() => localStorage.getItem('carcoord:pref:room'));
  check('and the shared plan is made', /^[A-Za-z0-9_-]{43}$/.test(String(secret)), secret);
  const poll = `http://${relay.addr}/rooms/`;
  check('every request it made was the relay\'s long-poll, through the page\'s policy', a.requests.length > 0 && a.requests.every((u) => u.startsWith(poll) && /\/poll\/(open|recv|send|close)$/.test(u)), JSON.stringify(a.requests.slice(0, 5)));
  check('and none of them carries the session id in its address', !a.requests.some((u) => /\/poll\/[A-Za-z0-9_-]{22}/.test(u)));

  // B: an ordinary network, on the WebSocket, in the same plan.
  const b = await profile({ items: { ...SEED, 'carcoord:pref:room': secret } });
  check('the other manager joins on the WebSocket', await pillSays(b.page, 'Connected'), await pillText(b.page));
  same('and says so', await transport(b.page), 'ws');
  await b.page.click('[data-act="tab"][data-tab="data"]');
  check('its Data card says nothing about a blocked network', !(await b.page.locator('#roomStatus').innerText()).includes('blocks'));
  await b.page.click('[data-act="tab"][data-tab="plan"]');
  check('both caught up', await caught(a.page) && await caught(b.page));

  await a.page.click('[data-act="tab"][data-tab="plan"]');
  await routeBox(a.page, 0, 'driver').fill('Polly Proxy');
  await a.page.keyboard.press('Tab');
  check('an edit over long-poll reaches the WebSocket side live', await reaches(b.page, 0, 'Polly Proxy'), await driverOn(b.page, 0));
  await routeBox(b.page, 1, 'driver').fill('Sock Etsen');
  await b.page.keyboard.press('Tab');
  check('and one the other way reaches the long-poll side', await reaches(a.page, 1, 'Sock Etsen'), await driverOn(a.page, 1));

  // The relay restarts: A says offline, then comes back over long-poll.
  await stopRelay(relay);
  check('the relay gone: the blocked side says Offline', await pillSays(a.page, 'Offline'), await pillText(a.page));
  await routeBox(a.page, 2, 'driver').fill('While Away');
  await a.page.keyboard.press('Tab');
  relay = await startRelay(relay.addr);
  check('the relay back: Connected again, over long-poll', await pillSays(a.page, 'Connected', 30000) && await transport(a.page) === 'poll', await pillText(a.page));
  check('and the edit made while it was away reaches the other side', await reaches(b.page, 2, 'While Away', 30000), await driverOn(b.page, 2));

  // A reload starts over: the WebSocket first, then long-poll again.
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  check('reloaded: Connected over long-poll', await pillSays(a.page, 'Connected') && await transport(a.page) === 'poll', await pillText(a.page));
  check('caught up', await caught(a.page));
  same('holding what the other side has', await driverOn(a.page, 1), 'Sock Etsen');

  // Leaving tells the relay the session is over.
  await a.page.evaluate(() => room.conn.close());
  check('close() sends the relay a close', await a.page.waitForEvent('request', { predicate: (r) => r.url().endsWith('/poll/close'), timeout: 1000 }).then(() => true, () => a.requests.some((u) => u.endsWith('/poll/close'))));

  same('long-poll side: no console errors', a.errors, []);
  same('WebSocket side: no console errors', b.errors, []);
  await a.context.close();
  await b.context.close();
} catch (e) {
  check('sync-relay ran to the end', false, e && e.stack);
} finally {
  await browser.close();
  await stopRelay(relay).catch(() => {});
  await server.close();
  await rm(data, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\n${failures.length} sync-relay check(s) failed`);
  process.exit(1);
}
console.log('\nsync-relay checks passed');
