// The upgrade check. Run: npm run upgrade -- <old checkout>
//
// Opens an older build of the app in a real browser profile, leaves data in
// it the way a leader would, then opens this build in the same profile on
// the same address, and checks that nothing saved was lost or changed, that
// the untouched copy went into Archives, and that the update note shows what
// it should. localStorage belongs to an address, so both builds are served
// on one fixed port, one after the other, and each scenario keeps its own
// profile from the old build to this one.
//
// The old checkout is any directory holding the old docs/, for example
//   git worktree add --detach ../cc-v0.2.4 v0.2.4
//
// Every load first asserts which build it is looking at, so a server left
// on the port or a checkout of this very build fails loudly instead of
// passing on the wrong code.
import { chromium } from 'playwright';
import { readFile, mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const NEW_DOCS = join(HERE, 'docs');
const PORT = Number(process.env.UPGRADE_PORT) || 5199;
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;

const oldRoot = process.argv[2] && resolve(process.argv[2]);
if (!oldRoot || !existsSync(join(oldRoot, 'docs', 'index.html'))) {
  console.log('Usage: npm run upgrade -- <old checkout>   (a directory holding the old docs/)');
  process.exit(2);
}
const OLD_DOCS = join(oldRoot, 'docs');
const oldVersion = JSON.parse(await readFile(join(oldRoot, 'package.json'), 'utf8')).version;
const NEW = JSON.parse(await readFile(join(HERE, 'package.json'), 'utf8')).version;
const devPlan = await readFile(join(HERE, 'scripts', 'fixtures', 'dev-data.json'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(await readFile(join(NEW_DOCS, 'updates.js'), 'utf8'), ctx);
const RELEASES = vm.runInContext('UPDATES', ctx);

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
  return ok;
};
class BuildMismatch extends Error {}

// What the note must show a browser whose marker is `seen`, by the rules the
// container sets: every `must` entry in full, the newest others up to three,
// and a count of the rest.
function expectedNote(seen) {
  const at = seen == null ? -1 : RELEASES.findIndex((r) => r.version === seen);
  const unseen = at < 0 ? RELEASES : RELEASES.slice(0, at);
  const must = unseen.filter((r) => r.must === true);
  const fill = unseen.filter((r) => r.must !== true).slice(0, Math.max(0, 3 - must.length));
  const full = unseen.filter((r) => must.includes(r) || fill.includes(r)).map((r) => r.version);
  return { full, more: unseen.length - full.length };
}

/* ---------- one browser profile, reopened from build to build ---------- */
let server = null;
async function serve(docs) {
  if (server) await server.close();
  server = await startServer(PORT, docs);
  if (server.base !== `http://localhost:${PORT}/`) throw new Error(`could not take port ${PORT}`);
  return server.base;
}

// Every context still open, so a scenario that stops early lets go of its
// profile before the next one starts.
const live = new Set();
async function open(profile, docs) {
  const base = await serve(docs);
  const context = await chromium.launchPersistentContext(profile, EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  live.add(context);
  context.on('close', () => live.delete(context));
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);   // start() awaits the save file's handle
  return { context, page, errors, base };
}

// Which build is on screen: the old one must not be this one, and this one
// must be exactly this one.
async function assertBuild(page, want) {
  const seen = await page.evaluate(() => ({
    version: typeof APP_VERSION === 'undefined' ? null : APP_VERSION,
    notes: typeof UPDATES === 'undefined' ? null : UPDATES[0] && UPDATES[0].version,
    archives: typeof Store.archive === 'function',
  }));
  const ok = want === 'old' ? seen.version !== NEW
    : want === 'new' ? seen.version === NEW && seen.notes === NEW && seen.archives
      : seen.version === NEW && seen.notes === null && !seen.archives;   // 'mixed'
  if (!ok) throw new BuildMismatch(`expected the ${want} build, found APP_VERSION ${seen.version}, updates ${seen.notes}, archives ${seen.archives}`);
}

const everything = (page) => page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
  return o;
});
const noteOn = (page) => page.evaluate(() => {
  const n = [...document.querySelectorAll('#notices .notice.update')];
  return {
    count: n.length,
    last: !!document.querySelector('#notices .notice:last-child.update'),
    say: n[0] ? n[0].querySelector('.say').firstChild.textContent : '',
    heads: n[0] ? [...n[0].querySelectorAll('li b')].map((b) => b.textContent).filter((t) => t.startsWith('What\'s new in ')) : [],
    more: n[0] ? [...n[0].querySelectorAll('li')].map((l) => l.textContent).find((t) => t.startsWith('And ')) || '' : '',
  };
});
const importPlan = async (page, text) => {
  await page.click('[data-act="tab"][data-tab="data"]');
  await page.setInputFiles('#importFile', { name: 'dev-data.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(() => state.cars.length > 0, null, { timeout: 5000 });
};
const linkOpfs = (page, text) => page.evaluate(async (text) => {
  const dir = await navigator.storage.getDirectory();
  const h = await dir.getFileHandle('car-coordinator.json', { create: true });
  const w = await h.createWritable(); await w.write(text); await w.close();
  await new Promise((res, rej) => {
    const r = indexedDB.open('carcoord', 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch { /* there */ } };
    r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(h, 'fileHandle'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    r.onerror = () => rej(r.error);
  });
}, text);
const opfsText = (page) => page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('car-coordinator.json')).getFile()).text());

// The old build's work, then this build's first open: data kept, the copy
// taken, the note as the rules say. Shared by the full setup and the save file.
async function expectKeptAndNoted(label, profile, before, extra = async () => {}) {
  const now = await open(profile, NEW_DOCS);
  await assertBuild(now.page, 'new');
  const after = await everything(now.page);
  check(`${label}: carcoord:v1 byte for byte on open`, after['carcoord:v1'] === before['carcoord:v1']);
  check(`${label}: Backups byte for byte on open`, after['carcoord:backups'] === before['carcoord:backups']);
  const changed = Object.keys(before).filter((k) => !k.startsWith('carcoord:pref:') && after[k] !== before[k]);
  check(`${label}: every other saved key as it was`, !changed.length, changed.join(', '));
  let arch = [];
  try { arch = JSON.parse(after['carcoord:archives']); } catch { /* none */ }
  check(`${label}: one update archive, equal to the old carcoord:v1`,
    arch.length === 1 && arch[0].kind === 'update' && arch[0].to === NEW && arch[0].text === before['carcoord:v1'], JSON.stringify(arch.map((a) => [a.kind, a.to])));
  const want = expectedNote(before['carcoord:pref:seenUpdate'] ?? null);
  const note = await noteOn(now.page);
  check(`${label}: one note, last, with ${want.full.join(' and ')} in full`,
    note.count === 1 && note.last && JSON.stringify(note.heads) === JSON.stringify(want.full.map((v) => `What's new in ${v}:`))
    && (want.more ? note.more.startsWith(`And ${want.more} other update`) : !note.more), JSON.stringify(note));
  check(`${label}: the marker is set`, after['carcoord:pref:seenUpdate'] === NEW);
  await extra(now, note);
  check(`${label}: no console errors`, !now.errors.length, now.errors.join(' | '));
  await now.page.reload({ waitUntil: 'networkidle' });
  await now.page.waitForTimeout(300);
  check(`${label}: a reload shows no note`, (await noteOn(now.page)).count === 0);
  await now.context.close();
}

/* ---------- the scenarios ---------- */
const scenarios = {
  // (a) A whole setup, and backups, as a leader would have them.
  async 'a full setup'(profile) {
    const old = await open(profile, OLD_DOCS);
    await assertBuild(old.page, 'old');
    await importPlan(old.page, devPlan);
    await old.page.evaluate(() => { for (let i = 1; i <= 6; i++) { state.routes[0].driver = `Edit ${i}`; Store.snapshot(state, `Before edit ${i}`); } save(); });
    const before = await everything(old.page);
    await old.context.close();
    const n = JSON.parse(before['carcoord:backups'] || '[]').length;
    check('a full setup: seeded with backups under the cap of 12', n > 1 && n <= 10, `${n} backups`);
    await expectKeptAndNoted('a full setup', profile, before);
  },

  // (b) Saved text the app cannot read: rescued, and the note waits.
  async 'b unreadable save'(profile) {
    const bad = '{"schemaVersion":4,"routes":[{"name":"half';
    const old = await open(profile, OLD_DOCS);
    await assertBuild(old.page, 'old');
    await importPlan(old.page, devPlan);
    await old.page.evaluate((t) => localStorage.setItem('carcoord:v1', t), bad);
    await old.context.close();
    const now = await open(profile, NEW_DOCS);
    await assertBuild(now.page, 'new');
    const after = await everything(now.page);
    let arch = [];
    try { arch = JSON.parse(after['carcoord:archives']); } catch { /* none */ }
    check('unreadable save: a rescue equal to the old text, and no update archive',
      arch.length === 1 && arch[0].kind === 'rescue' && arch[0].text === bad, JSON.stringify(arch.map((a) => a.kind)));
    check('unreadable save: carcoord:v1 not written at boot', after['carcoord:v1'] === bad);
    check('unreadable save: no note, no marker', (await noteOn(now.page)).count === 0 && after['carcoord:pref:seenUpdate'] === undefined);
    await now.page.click('[data-act="tab"][data-tab="plan"]');
    await now.page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').fill('Typed after the loss');
    await now.page.reload({ waitUntil: 'networkidle' });
    await now.page.waitForTimeout(300);
    const note = await noteOn(now.page);
    check('unreadable save: after one change and a reload, the note', note.count === 1, JSON.stringify(note));
    check('unreadable save: and it points at the rescue, copying nothing typed since the loss',
      note.say.includes('What this browser had saved before could not be read') && !note.say.includes('copied unchanged')
      && JSON.parse(await now.page.evaluate(() => localStorage.getItem('carcoord:archives'))).every((a) => a.kind === 'rescue'), note.say);
    check('unreadable save: the rescue is still there', JSON.parse(await now.page.evaluate(() => localStorage.getItem('carcoord:archives'))).some((a) => a.kind === 'rescue' && a.text === bad));
    check('unreadable save: no console errors', !now.errors.length, now.errors.join(' | '));
    await now.context.close();
  },

  // (c) Opened once by the old build, nothing typed: a first run here too.
  async 'c first run'(profile) {
    const old = await open(profile, OLD_DOCS);
    await assertBuild(old.page, 'old');
    const before = await everything(old.page);
    await old.context.close();
    const now = await open(profile, NEW_DOCS);
    await assertBuild(now.page, 'new');
    const after = await everything(now.page);
    check('first run: no archive, no note', after['carcoord:archives'] === undefined && (await noteOn(now.page)).count === 0);
    check('first run: the marker is written', after['carcoord:pref:seenUpdate'] === NEW);
    check('first run: Backups as they were', after['carcoord:backups'] === before['carcoord:backups']);
    check('first run: no console errors', !now.errors.length, now.errors.join(' | '));
    await now.context.close();
  },

  // (d) A full setup with a save file linked and allowed.
  async 'd linked save file'(profile) {
    const old = await open(profile, OLD_DOCS);
    await assertBuild(old.page, 'old');
    await importPlan(old.page, devPlan);
    const saved = await old.page.evaluate(() => localStorage.getItem('carcoord:v1'));
    await linkOpfs(old.page, JSON.stringify(JSON.parse(saved), null, 2));
    await old.page.reload({ waitUntil: 'networkidle' });
    await old.page.waitForTimeout(300);
    const linked = await old.page.evaluate(() => Store.file.name);
    const before = await everything(old.page);
    const fileBefore = await opfsText(old.page);
    await old.context.close();
    check('linked save file: the old build had it linked', linked === 'car-coordinator.json', linked);
    await expectKeptAndNoted('linked save file', profile, before, async (now, note) => {
      check('linked save file: the file is byte for byte as it was on open', (await opfsText(now.page)) === fileBefore);
      check('linked save file: the note says changes are written to it', note.say.includes('Changes are also written to your save file, car-coordinator.json.'), note.say);
    });
  },

  // (e) A browser that kept the old index.html and store.js, and fetched
  // the new app.js: the plan is drawn and the save-file check runs; the copy
  // and the note wait for the first open with every file new.
  async 'e old cached index.html with the new app.js'(profile) {
    const old = await open(profile, OLD_DOCS);
    await assertBuild(old.page, 'old');
    await importPlan(old.page, devPlan);
    const before = await everything(old.page);
    const routes = await old.page.evaluate(() => state.routes.length);
    await old.context.close();
    const mixed = await mkdtemp(join(tmpdir(), 'cc-upgrade-mixed-'));
    try {
      await cp(OLD_DOCS, mixed, { recursive: true });
      await cp(join(NEW_DOCS, 'app.js'), join(mixed, 'app.js'));
      // Record which save-file checks start() makes, on the old store.js.
      await appendFile(join(mixed, 'store.js'), `
;(() => { window.__checks = []; for (const k of ['hasUsableLocalData', 'recoverFromFile', 'checkFileAtStart']) {
  const f = Store[k]; if (typeof f === 'function') Store[k] = (...a) => { window.__checks.push(k); return f(...a); }; } })();
`);
      const now = await open(profile, mixed);
      await assertBuild(now.page, 'mixed');
      const after = await everything(now.page);
      check('mixed files: the plan is drawn', (await now.page.locator('#tab-plan tbody tr').count()) === routes, `${await now.page.locator('#tab-plan tbody tr').count()} of ${routes} routes`);
      const checks = await now.page.evaluate(() => ({ calls: window.__checks, has: typeof Store.checkFileAtStart === 'function' }));
      check('mixed files: the save-file check still runs', checks.calls.includes('hasUsableLocalData') && (!checks.has || checks.calls.includes('checkFileAtStart')), JSON.stringify(checks));
      check('mixed files: no archive, no note, no marker yet',
        after['carcoord:archives'] === undefined && (await noteOn(now.page)).count === 0 && after['carcoord:pref:seenUpdate'] === undefined);
      check('mixed files: carcoord:v1 and Backups as they were', after['carcoord:v1'] === before['carcoord:v1'] && after['carcoord:backups'] === before['carcoord:backups']);
      check('mixed files: no console errors', !now.errors.length, now.errors.join(' | '));
      await now.context.close();
    } finally { await rm(mixed, { recursive: true, force: true }); }
    await expectKeptAndNoted('mixed files, then all new', profile, before);
  },
};

console.log(`Upgrade check: ${oldRoot} (${oldVersion}) to this build (${NEW}), on port ${PORT}${EXECUTABLE ? `, ${EXECUTABLE}` : ''}\n`);
for (const [name, run] of Object.entries(scenarios)) {
  console.log(`(${name})`);
  const profile = await mkdtemp(join(tmpdir(), 'cc-upgrade-profile-'));
  try { await run(profile); } catch (e) {
    check(`${name}: ${e instanceof BuildMismatch ? 'build assertion' : 'ran to the end'}`, false, e.message.split('\n')[0]);
  } finally {
    for (const c of [...live]) await c.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  }
}
if (server) await server.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : `\nupgrade check passed: ${oldVersion} to ${NEW}`);
process.exit(failures.length ? 1 : 0);
