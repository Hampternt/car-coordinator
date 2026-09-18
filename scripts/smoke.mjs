// Headless smoke test. Serves docs/ over http (File System Access and
// clipboard APIs need a secure-ish origin), drives the UI, and fails on any
// console error. Run: npm test
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { startServer } from './serve.mjs';

const server = await startServer();
const base = server.base;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

// CI and this container ship Chromium at a fixed path; fall back to whatever
// Playwright manages locally.
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
// The share handlers encode/decode asynchronously; wait for the result
// rather than reading straight after the click.
const copyCode = async (pg, mode) => {
  await pg.evaluate(() => { const t = document.querySelector('#shareOut'); if (t) t.value = ''; });
  await pg.click(`[data-act="share-make"][data-mode="${mode}"]`);
  await pg.waitForFunction(() => { const t = document.querySelector('#shareOut'); return t && t.value.startsWith('CC1'); });
  return pg.locator('#shareOut').inputValue();
};
const readCode = async (pg, code) => {
  await pg.fill('#shareIn', code);
  await pg.click('[data-act="share-read"]');
  await pg.waitForSelector('#shareDlg[open]', { timeout: 5000 }).catch(() => {});
};

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: 'networkidle' });

// --- first run ---
// The tab's own empty message, not the template shelf's further down it.
check('loads with an empty car list', await page.locator('#tab-plan > .empty').isVisible());
check('a first run shows no warnings', (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

// An unescaped quote in an inline data: URI silently dumps the rest of the
// attribute into the document as text, which nothing else here would catch.
const leaked = await page.evaluate(() => {
  let text = '', n = document.body.firstChild;
  while (n && n.nodeType === Node.TEXT_NODE) { text += n.textContent.trim(); n = n.nextSibling; }
  const first = document.body.children[0];
  return { text, first: first ? first.tagName : 'none', ok: text === '' && first === document.querySelector('header.topbar') };
});
// Report what is actually first, not the text walk: a leaked attribute
// becomes an element, so leaked.text is empty even when this fails.
check('no markup leaked into the page', leaked.ok, leaked.ok ? '' : `body starts with <${leaked.first}> ${leaked.text}`);

// --- add cars, assign one, mark another ---
await page.click('[data-act="tab"][data-tab="cars"]');
await page.fill('#newCar', 'AA11111 BB22222 CC33333');
await page.click('[data-act="add-car"]');
check('adds three cars from one box', (await page.locator('#tab-cars tbody tr').count()) === 3);

await page.click('[data-act="tab"][data-tab="plan"]');
const firstRow = page.locator('#tab-plan tbody tr').first();
await firstRow.locator('[data-field="driver"]').fill('Test Driver');
await firstRow.locator('[data-field="carId"]').selectOption({ index: 1 });
await firstRow.locator('[data-field="positionId"]').selectOption({ index: 1 });
check('assigns a driver, car and position', (await firstRow.locator('[data-field="driver"]').inputValue()) === 'Test Driver');

// --- the packing round is a column of its own ---
await firstRow.locator('[data-field="round"]').fill('2');
check('position and round are separate columns', (await page.locator('#tab-plan thead th').allInnerTexts()).join('|').includes('Position|Round'));
check('the round takes free text', (await firstRow.locator('[data-field="round"]').inputValue()) === '2');

// Leaving a round redraws the plan, because the clash rule moved with it. The
// click that ends the edit must still land: a redraw between mousedown and
// mouseup would swallow it, and the leader would silently lose every click
// made straight after typing a round.
const secondRow = page.locator('#tab-plan tbody tr').nth(1);
const thirdRow = page.locator('#tab-plan tbody tr').nth(2);
await secondRow.locator('[data-field="round"]').click();
await page.keyboard.type('3');
await thirdRow.locator('[data-act="toggle"][data-field="highlight"]').click();
check('a click that ends a round edit still lands',
  (await secondRow.locator('[data-field="round"]').inputValue()) === '3' && (await thirdRow.getAttribute('class')).includes('hl'),
  `round=${await secondRow.locator('[data-field="round"]').inputValue()} class=${await thirdRow.getAttribute('class')}`);
await thirdRow.locator('[data-act="toggle"][data-field="highlight"]').click();   // put it back

// --- the driver roster ---
// The roster starts empty, like the car list, and only ever offers names: the
// day plan's driver box stays free text, so nothing here can refuse a name.
await page.click('[data-act="tab"][data-tab="drivers"]');
check('the roster starts empty', await page.locator('#tab-drivers .empty').first().isVisible());
await page.fill('#newDriver', 'Roster One, Roster Two');
await page.click('[data-act="add-driver"]');
check('one box adds several drivers, split on commas not spaces',
  (await page.locator('#tab-drivers tbody tr').count()) === 2
  && (await page.locator('#tab-drivers tbody tr').first().locator('[data-field="name"]').inputValue()) === 'Roster One');
await page.click('#tab-drivers tbody tr:nth-child(2) [data-act="up"]');
check('the roster reorders', (await page.locator('#tab-drivers tbody tr').first().locator('[data-field="name"]').inputValue()) === 'Roster Two');
await page.locator('#tab-drivers tbody tr').first().locator('[data-field="name"]').fill('Roster Three');
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-act="tab"][data-tab="drivers"]');
check('roster edits survive a reload', (await page.locator('#tab-drivers tbody tr').first().locator('[data-field="name"]').inputValue()) === 'Roster Three');

await page.click('[data-act="tab"][data-tab="plan"]');
check('the roster reaches the day plan as suggestions',
  (await page.locator('#driverNames option').count()) === 2
  && (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').getAttribute('list')) === 'driverNames');
check('the rail shows who is in today', (await page.locator('#tab-plan [data-panel="drivers"] li').count()) === 2);
// The driver typed into row 1 earlier is not on the roster, which is allowed:
// put a roster name on row 2 and the rail should find it.
await page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="driver"]').fill('roster three ');
// Deliberately no tab switch here. Leaving and returning forces a full
// render() and would hide the thing actually under test: typing a name has to
// move the rail by itself, while the leader is still looking at the plan.
check('the rail follows a name as it is typed, with no other interaction',
  (await page.locator('#tab-plan [data-panel="drivers"] li').first().innerText()).includes('Route 2'),
  await page.locator('#tab-plan [data-panel="drivers"] li').first().innerText());
check('the rail matches a name however it was typed',
  (await page.locator('#tab-plan [data-panel="drivers"] li').first().innerText()).includes('Route 2'),
  await page.locator('#tab-plan [data-panel="drivers"] li').first().innerText());
await page.locator('#tab-plan [data-panel="drivers"] li').first().locator('[data-act="toggle"]').click();
check('marking someone away takes them out of the rail', (await page.locator('#tab-plan [data-panel="drivers"] li').count()) === 1);
check('but leaves the route they were written into alone',
  (await page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="driver"]').inputValue()) === 'roster three ');

// Deleting a driver must not touch the day plan: that text is the plan.
await page.click('[data-act="tab"][data-tab="drivers"]');
const delDriver = page.locator('#tab-drivers tbody tr').first().locator('[data-act="del"]');
await delDriver.click();
await delDriver.click();                              // two-click confirm
check('a deleted driver leaves the roster', (await page.locator('#tab-drivers tbody tr').count()) === 1);
await page.click('[data-act="tab"][data-tab="plan"]');
check('and the route keeps the name that was typed there',
  (await page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="driver"]').inputValue()) === 'roster three ');
await page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="driver"]').fill('');

// --- driver day groups ---
// A group is a named set of people, and applying it answers "who is in
// today". It says nothing about who drives which route.
await page.click('[data-act="tab"][data-tab="drivers"]');
await page.fill('#newDriver', 'Group One, Group Two');
await page.click('[data-act="add-driver"]');          // roster: Roster One, Group One, Group Two
await page.fill('#newGroup', 'Monday');
await page.click('[data-act="add-group"]');
await page.fill('#newGroup', 'Weekend');
await page.click('[data-act="add-group"]');
check('two groups can be made', (await page.locator('#tab-drivers .group').count()) === 2);

const group = (name) => page.locator('#tab-drivers .group', { has: page.locator(`[data-field="name"][value="${name}"]`) });
await group('Monday').locator('.chip', { hasText: 'Roster One' }).click();
await group('Monday').locator('.chip', { hasText: 'Group One' }).click();
await group('Weekend').locator('.chip', { hasText: 'Group Two' }).click();
check('a group holds the drivers ticked into it', (await group('Monday').locator('.chip.on').count()) === 2);

await group('Monday').locator('[data-act="apply-group"]').click();
await page.click('[data-act="tab"][data-tab="plan"]');
check('applying a group sets who is in today', (await page.locator('#tab-plan [data-panel="drivers"] li').count()) === 2);
check('and says how the day now stands', (await page.locator('#notices .notice').last().innerText()).includes('Monday: 2 drivers in today, 1 away'),
  await page.locator('#notices .notice').last().innerText());

// The one that matters: applying a second group must take the first group's
// leftovers out, not simply add its own people in.
await page.locator('#tab-plan [data-panel="drivers"] [data-act="apply-group"]', { hasText: 'Weekend' }).click();
const inToday = () => page.locator('#tab-plan [data-panel="drivers"] li').allInnerTexts();
check('applying another group replaces the crew rather than adding to it',
  (await inToday()).length === 1 && (await inToday())[0].includes('Group Two'), JSON.stringify(await inToday()));

await page.reload({ waitUntil: 'networkidle' });
check('the applied crew survives a reload', (await page.locator('#tab-plan [data-panel="drivers"] li').count()) === 1);
await page.click('[data-act="tab"][data-tab="drivers"]');
check('and so do the groups and their members',
  (await page.locator('#tab-drivers .group').count()) === 2 && (await group('Monday').locator('.chip.on').count()) === 2);

// A driver who leaves the roster leaves the groups with them.
const delRosterOne = page.locator('#tab-drivers tbody tr', { has: page.locator('[data-field="name"][value="Roster One"]') }).locator('[data-act="del"]');
await delRosterOne.click();
await delRosterOne.click();                           // two-click confirm
check('deleting a driver takes them out of every group', (await group('Monday').locator('.chip.on').count()) === 1);
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-act="tab"][data-tab="drivers"]');
check('and that sticks, with no repair notice on the way back',
  (await group('Monday').locator('.chip.on').count()) === 1 && (await page.locator('#notices .notice').count()) === 0,
  await page.locator('#notices').innerText());

// Renaming and deleting a group.
await group('Weekend').locator('[data-field="name"]').fill('Saturday');
// Typing does not redraw (that is what keeps the caret), so come back to the
// tab before matching on the value the markup carries.
await page.click('[data-act="tab"][data-tab="plan"]');
await page.click('[data-act="tab"][data-tab="drivers"]');
const delGroup = group('Saturday').locator('[data-act="del"]');
await delGroup.click();
await delGroup.click();
check('a group can be renamed and deleted', (await page.locator('#tab-drivers .group').count()) === 1);
await page.click('[data-act="tab"][data-tab="plan"]');

// --- the left rail carries the fleet beside the plan ---
check('the rail lists every car', (await page.locator('#tab-plan [data-panel="cars"] li').count()) === 3);
check('the rail says where the assigned one went',
  (await page.locator('#tab-plan [data-panel="cars"] li').first().innerText()).replace(/\s+/g, ' ') === 'AA11111 Route 1',
  await page.locator('#tab-plan [data-panel="cars"] li').first().innerText());
check('the rail calls the others free', (await page.locator('#tab-plan [data-panel="cars"] .assign.none').count()) === 2);
check('the pools below the table are gone', (await page.locator('#tab-plan .pool').count()) === 0);

// --- the sheet reflects the plan ---
await page.click('[data-act="tab"][data-tab="preview"]');
const sheet = await page.locator('#sheet').innerText();
check('sheet shows the driver', sheet.includes('Test Driver'));
check('sheet shows the car', sheet.includes('AA11111'));
// Four columns is the whole constraint: the sheet mirrors the paper list on
// the pillar, so the round rides inside the packing cell rather than taking a
// column of its own.
check('sheet folds the round into the packing cell', /Spot 1\/2/.test(sheet), sheet.split('\n').slice(0, 3).join(' / '));
check('sheet still has four columns', (await page.locator('#sheet thead th').count()) === 4);
check('and the gap spacer still spans all four', (await page.locator('#sheet tr.spacer td').first().getAttribute('colspan')) === '4');

// --- survives a reload (localStorage) ---
await page.reload({ waitUntil: 'networkidle' });
check('state survives a reload', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Test Driver');
check('the round survives a reload', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="round"]').inputValue()) === '2');

// --- backups and restore ---
await page.click('[data-act="clear-day"]');
await page.click('[data-act="clear-day"]');           // two-click confirm
check('clear wipes the driver', (await firstRow.locator('[data-field="driver"]').inputValue()) === '');
check('clear wipes the round too', (await firstRow.locator('[data-field="round"]').inputValue()) === '');
await page.click('[data-act="tab"][data-tab="data"]');
check('clearing left a backup', (await page.locator('#tab-data table tbody tr').count()) >= 1);
const restoreBtn = page.locator('[data-act="restore"]').first();
await restoreBtn.click();
await restoreBtn.click();                             // two-click confirm
await page.click('[data-act="tab"][data-tab="plan"]');
check('restore brings the driver back', (await firstRow.locator('[data-field="driver"]').inputValue()) === 'Test Driver');
check('restore brings the round back', (await firstRow.locator('[data-field="round"]').inputValue()) === '2');

// --- export / import round trip ---
await page.click('[data-act="tab"][data-tab="data"]');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
const exported = await readFile(await download.path(), 'utf8');
const parsed = JSON.parse(exported);
check('export is valid Car Coordinator JSON', parsed.schemaVersion === 3 && parsed.cars.length === 3);

parsed.cars[0].reg = 'ZZ99999';
await page.setInputFiles('#importFile', { name: 'day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(parsed)) });
await page.click('[data-act="tab"][data-tab="cars"]');
check('import replaces the data', (await page.locator('#tab-cars tbody tr').first().locator('[data-field="reg"]').inputValue()) === 'ZZ99999');

// --- corrupt and hostile saved data ---
await page.evaluate(() => localStorage.setItem('carcoord:v1', '{not json at all'));
await page.reload({ waitUntil: 'networkidle' });
check('survives corrupt saved data', await page.locator('#notices .notice.warn').isVisible());

await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: 'not-a-date', labels: 'nope', cars: [{ id: 'c1', reg: 'DD44444' }],
  positions: [{ id: 'p1', name: 'Spot 9' }],
  routes: [{ id: 'r1', name: '1', carId: 'ghost', positionId: 'p1', driver: 'Kept' }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('repairs a dangling car reference', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="carId"]').inputValue()) === '');
check('keeps the good fields while repairing', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Kept');

// --- data saved by the previous version (no round, no roster) ---
// The fields v1 never wrote must arrive at their defaults, quietly: a leader
// opening the new build on Monday should see nothing at all happen.
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', labels: [], cars: [{ id: 'c1', reg: 'AA11111' }],
  positions: [{ id: 'p1', name: 'Spot 1' }],
  routes: [{ id: 'r1', name: '1', driver: 'Kept', carId: 'c1', positionId: 'p1' }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('v1 data loads with no repair notice', (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());
check('v1 data gains round, drivers and driver groups', await page.evaluate(() =>
  state.routes.every((r) => r.round === '') && Array.isArray(state.drivers) && state.drivers.length === 0
  && Array.isArray(state.driverGroups) && state.driverGroups.length === 0));

// --- data saved by the build before templates (v2) ---
// Same story one version on: the plan a leader already has must open with an
// empty template shelf and nothing to read about it.
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 2, date: '2026-09-18', labels: [], cars: [{ id: 'c1', reg: 'AA11111' }],
  positions: [{ id: 'p1', name: 'Spot 1' }],
  routes: [{ id: 'r1', name: '1', driver: 'Kept', carId: 'c1', positionId: 'p1', round: '2' }],
  drivers: [{ id: 'd1', name: 'Kept', available: true }], driverGroups: [],
})));
await page.reload({ waitUntil: 'networkidle' });
check('v2 data loads with an empty template list and no repair notice',
  (await page.evaluate(() => Array.isArray(state.templates) && state.templates.length === 0))
  && (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

// A template is stored state like any other, so it goes through the same
// repair: a car deleted since it was saved must not come back as a ghost id.
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 2, date: '2026-09-18', labels: [], cars: [{ id: 'c1', reg: 'AA11111' }],
  positions: [{ id: 'p1', name: 'Spot 1' }],
  routes: [{ id: 'r1', name: '1' }],
  templates: [{ id: 't1', name: 'Monday', weekday: 'whenever', routes: [
    { name: '1', driver: 'Kept', carId: 'gone', positionId: 'p1', round: '2' },
    { name: '2', driver: 'Kept too', carId: 'c1', positionId: 'p1' },
  ] }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('a template keeps its routes but loses a car that is gone', await page.evaluate(() => {
  const t = state.templates[0];
  return t.routes.length === 2 && t.routes[0].carId === '' && t.routes[0].driver === 'Kept'
    && t.routes[1].carId === 'c1' && t.routes[0].round === '2' && t.routes[1].round === '';
}));
check('and says so once, not once per route',
  (await page.locator('#notices .notice.info').innerText()).includes('the Monday template pointed at a car that is gone'),
  await page.locator('#notices').innerText());
check('a weekday that is not a day is no weekday at all', await page.evaluate(() => state.templates[0].weekday === ''));

await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({ schemaVersion: 99, date: '2026-01-01', cars: [], positions: [], labels: [], routes: [] })));
await page.reload({ waitUntil: 'networkidle' });
check('warns about data from a newer version', (await page.locator('#notices .notice.warn').innerText()).includes('newer version'));

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- the round inside a spot's name: the plan, before anything is written ---
// spotRoundPlan() is the whole migration as data. It is what the offer reads
// out and what applying it works from, so it is worth pinning down on its own:
// a merge, a round someone typed by hand, and two spots that disagree.
const fixture = {
  positions: [
    { id: 'p1', name: 'Spot 1/1', multi: false, labelId: '', note: '' },
    { id: 'p2', name: 'Spot 1/2', multi: true, labelId: 'L1', note: 'lift parked in it' },
    { id: 'p3', name: 'Spot 2/1', multi: false, labelId: '', note: '' },
    { id: 'p4', name: 'Garage', multi: true, labelId: '', note: '' },
  ],
  routes: [
    { id: 'r1', name: '1', positionId: 'p1', round: '' },        // gains round 1
    { id: 'r2', name: '2', positionId: 'p2', round: '' },        // gains round 2, and moves to p1
    { id: 'r3', name: '3', positionId: 'p2', round: '3' },       // keeps the 3 someone typed
    { id: 'r4', name: '4', positionId: 'p4', round: '' },        // the Garage is not touched at all
  ],
  templates: [{ id: 't1', name: 'Monday', routes: [{ positionId: 'p2', round: '' }, { positionId: 'p4', round: '' }] }],
};
const planned = await page.evaluate((fx) => {
  const before = JSON.stringify(fx);
  const plan = spotRoundPlan(fx);
  return {
    untouched: JSON.stringify(fx) === before,
    spots: plan.spots.map((s) => ({ name: s.name, keepId: s.keepId, keepName: s.keepName, round: s.round, absorbed: s.absorbed.map((a) => a.name), conflicts: s.conflicts })),
    movesTo: plan.moveTo.get('p2'),
    garageTouched: plan.roundFrom.has('p4') || plan.moveTo.has('p4'),
    routes: plan.routes,
    templates: plan.templates,
    // Nothing to split out: the answer on every PC that started after this
    // shipped, and the reason the offer stays quiet there.
    quiet: spotRoundPlan({ positions: [{ id: 'z', name: 'Spot 1' }, { id: 'y', name: 'Garage' }], routes: [] }).spots.length,
  };
}, fixture);
check('the plan describes itself without touching the state it read', planned.untouched);
check('two spots to split, and the Garage is left out of it', planned.spots.length === 2 && !planned.garageTouched, JSON.stringify(planned.spots));
check('the lowest round keeps the position, the rest merge into it',
  planned.spots[0].name === 'Spot 1' && planned.spots[0].keepId === 'p1' && planned.spots[0].round === '1'
  && planned.spots[0].absorbed.join() === 'Spot 1/2' && planned.movesTo === 'p1', JSON.stringify(planned.spots[0]));
check('and the settings the merge has to decide are named, not resolved in silence',
  planned.spots[0].conflicts.join(', ') === '"many cars", the status, the note', planned.spots[0].conflicts.join(', '));
check('a spot with nothing to merge into it is still split', planned.spots[1].keepName === 'Spot 2/1' && planned.spots[1].name === 'Spot 2' && !planned.spots[1].absorbed.length);
check('routes: two gain the round their spot spelled out, one keeps the round it was given',
  planned.routes.filled === 2 && planned.routes.kept === 1, JSON.stringify(planned.routes));
check('a saved template migrates with the plan', planned.templates.length === 1 && planned.templates[0].name === 'Monday' && planned.templates[0].filled === 1, JSON.stringify(planned.templates));
check('and a fleet with no round in any name has nothing to offer', planned.quiet === 0);

// "Spot 1" and "Spot 1/2" side by side have to end as one spot, not two of
// one name: two positions of one name is what makes a share code blank the
// position on every route. The one already named "Spot 1" is the survivor —
// it is the name the leader keeps, and its routes have no round to gain.
const already = await page.evaluate(() => {
  const plan = spotRoundPlan({
    positions: [{ id: 'q1', name: 'Spot 1', multi: false, labelId: '', note: '' }, { id: 'q2', name: 'Spot 1/2', multi: false, labelId: '', note: '' }],
    routes: [{ id: 'r1', positionId: 'q1', round: '' }, { id: 'r2', positionId: 'q2', round: '' }],
  });
  const s = plan.spots[0];
  return { spots: plan.spots.length, keepId: s.keepId, name: s.name, round: s.round, absorbed: s.absorbed.map((a) => a.id), routes: plan.routes };
});
check('a spot that already has the plain name absorbs the numbered one',
  already.spots === 1 && already.keepId === 'q1' && already.name === 'Spot 1' && already.absorbed.join() === 'q2', JSON.stringify(already));
check('and its own routes are left alone, rather than being given a round out of nowhere',
  already.round === null && already.routes.filled === 1 && already.routes.kept === 0, JSON.stringify(already.routes));

// --- sharing between two PCs ---
// Seed a plan on "PC A", copy the code, and load it on a fresh profile that
// has its own ids for everything: the payload must survive that.
const planA = {
  schemaVersion: 2, date: '2026-09-18',
  labels: [{ id: 'L1', name: 'Workshop', color: '#6a1b9a' }],
  drivers: [{ id: 'd1', name: 'Ana', available: true }, { id: 'd2', name: 'Bo', available: false }],
  driverGroups: [{ id: 'g1', name: 'Monday', driverIds: ['d1'] }],
  cars: [{ id: 'a1', reg: 'AA11111', labelId: '', note: '' }, { id: 'a2', reg: 'BB22222', labelId: 'L1', note: 'back Friday' }],
  positions: [{ id: 'q1', name: 'Spot 1', multi: false, labelId: '', note: '' }, { id: 'q2', name: 'Garage', multi: true, labelId: '', note: '' }],
  routes: [
    { id: 'x1', name: '1', driver: 'Ana', carId: 'a1', positionId: 'q1', round: '2', highlight: true, gapBefore: false },
    { id: 'x2', name: 'HAU 1', driver: 'Bo', carId: 'a2', positionId: 'q2', highlight: false, gapBefore: true },
  ],
};
await page.evaluate((d) => localStorage.setItem('carcoord:v1', JSON.stringify(d)), planA);
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-act="tab"][data-tab="data"]');
const dayCode = await copyCode(page, 'day');
check('day-plan code is tagged and compact', dayCode.startsWith('CC1.') && dayCode.length < 400, `${dayCode.length} chars`);

const allCode = await copyCode(page, 'all');
check('everything code is longer than the day plan', allCode.length > dayCode.length);

// The round is per route, so it rides with the day plan — and it has to ride
// where a build that predates it will not trip over it: appended after the
// flags, with the version tag left at 1.
const shape = await page.evaluate(async (code) => {
  const { share, error } = await Share.decode(code);
  return error ? { error } : { v: share.v, row: share.r[0], hasRoster: 'dr' in share };
}, dayCode);
check('the day-plan payload is still v1, with the round appended after the flags',
  shape.v === 1 && shape.row.length === 6 && shape.row[4] === 1 && shape.row[5] === '2',
  shape.error || JSON.stringify(shape.row));
check('and it does not carry the roster', shape.hasRoster === false);
const allShape = await page.evaluate(async (code) => {
  const { share } = await Share.decode(code);
  return { drivers: share.dr, groups: share.dg };
}, allCode);
check('"everything" carries the roster and the groups by name',
  allShape.drivers.length === 2 && allShape.groups[0][0] === 'Monday' && allShape.groups[0][1][0] === 'Ana',
  JSON.stringify(allShape));

// A code made before rounds existed has five slots per route. It must load,
// not throw, and leave the round blank.
const oldCode = await page.evaluate(() => {
  const json = JSON.stringify({ v: 1, d: '2026-09-18', r: [['1', 'Ana', '', 'Spot 1', 0]], m: [] });
  return 'CC1U.' + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});
const oldRead = await page.evaluate(async (code) => {
  const { share, error } = await Share.decode(code);
  if (error) return { error };
  const { state: next } = Share.apply(state, share, { mode: 'day', addMissing: true });
  return { routes: next.routes.length, round: next.routes[0].round, driver: next.routes[0].driver };
}, oldCode);
check('a code from before rounds existed still loads, with a blank round',
  oldRead.round === '' && oldRead.driver === 'Ana' && oldRead.routes === 1, oldRead.error || JSON.stringify(oldRead));

// --- the QR on the printed sheet ---
// 30mm at 300dpi is ~354px, so decoding at that size is the question that
// actually matters: will it scan off the paper?
await page.click('[data-act="tab"][data-tab="preview"]');
await page.waitForSelector('#sheet .qr svg', { timeout: 5000 }).catch(() => {});
check('the sheet carries a QR code', (await page.locator('#sheet .qr svg').count()) === 1);

// jsQR is a test-only dependency: the app writes QR codes but never reads
// them, so the decoder does not ship. Inject it here to check our own output.
await page.addScriptTag({ content: await readFile('node_modules/jsqr/dist/jsQR.js', 'utf8') });
const qrRead = await page.evaluate(async () => {
  const svg = document.querySelector('#sheet .qr svg');
  if (!svg) return { error: 'no qr on the sheet' };
  const markup = new XMLSerializer().serializeToString(svg);
  const decodeAt = (px) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = px; c.height = px;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      const d = ctx.getImageData(0, 0, px, px);
      const r = window.jsQR(d.data, px, px, { inversionAttempts: 'dontInvert' });
      resolve(r ? r.data : null);
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
  });
  return { at354: await decodeAt(354), at200: await decodeAt(200) };
});
check('the printed-size QR decodes (30mm at 300dpi)', typeof qrRead.at354 === 'string' && qrRead.at354.length > 0, qrRead.error || '');
check('it still decodes at a rougher 200px scan', typeof qrRead.at200 === 'string');

if (typeof qrRead.at354 === 'string') {
  const round = await page.evaluate(async (scanned) => {
    const m = /#d=(.+)$/.exec(scanned);
    const { share, error } = await Share.decode(m ? decodeURIComponent(m[1]) : scanned);
    return error ? { error } : { routes: share.r.length, date: share.d, driver: share.r[0][1] };
  }, qrRead.at354);
  check('the QR carries the whole day plan', round.routes === 2 && round.date === '2026-09-18' && round.driver === 'Ana', round.error || JSON.stringify(round));
}
await page.click('[data-act="tab"][data-tab="data"]');

// "PC B": different ids, one car in common, one it has never seen.
const pcB = await browser.newContext();
const b = await pcB.newPage();
const bErrors = [];
b.on('console', (m) => m.type() === 'error' && bErrors.push(m.text()));
b.on('pageerror', (e) => bErrors.push(String(e)));
await b.goto(base, { waitUntil: 'networkidle' });
await b.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-01-01', labels: [], routes: [],
  cars: [{ id: 'zzz', reg: 'aa11111', labelId: '', note: '' }],        // same car, different id AND case
  positions: [{ id: 'yyy', name: 'Spot 1', multi: false, labelId: '', note: '' }],
  drivers: [{ id: 'dl', name: 'Local Only', available: true }], driverGroups: [],
})));
await b.reload({ waitUntil: 'networkidle' });
await b.click('[data-act="tab"][data-tab="data"]');
await readCode(b, dayCode);
const preview = await b.locator('#shareDlg').innerText();
check('preview names the date and route count', preview.includes('18/09/2026') && preview.includes('2 routes'));
check('preview flags what PC B is missing', preview.includes('BB22222') && preview.includes('Garage'));
await b.click('[data-act="share-apply"]');

await b.click('[data-act="tab"][data-tab="plan"]');
const rowsB = b.locator('#tab-plan tbody tr');
check('both routes arrived', (await rowsB.count()) === 2);
check('driver came across', (await rowsB.first().locator('[data-field="driver"]').inputValue()) === 'Ana');
// The round is part of the day plan, so a day-plan code carries it. Before
// this it was dropped in silence, wiping the round on every route of any list
// that was loaded — including one made minutes earlier on the same PC.
check('the round came across too', (await rowsB.first().locator('[data-field="round"]').inputValue()) === '2');
const carSel = rowsB.first().locator('[data-field="carId"]');
check('matched the car it already had, case-insensitively', (await carSel.inputValue()) === 'zzz');
check('added the car it did not have', (await rowsB.nth(1).locator('[data-field="carId"] option:checked').innerText()).includes('BB22222'));
await b.click('[data-act="tab"][data-tab="preview"]');
const sheetB = await b.locator('#sheet').innerText();
check('the pink row and the gap survived', (await b.locator('#sheet tr.hl').count()) === 1 && (await b.locator('#sheet tr.spacer').count()) === 1);
check('sheet on PC B shows the shared date', sheetB.includes('18/09/2026'));
check('the printed sheet on PC B carries the round', sheetB.includes('Spot 1/2'));
await b.click('[data-act="tab"][data-tab="drivers"]');
check('a day plan leaves the roster where it was', (await b.locator('#tab-drivers tbody tr').count()) === 1);

// "Everything" mode carries the car notes and labels too.
await b.click('[data-act="tab"][data-tab="data"]');
await readCode(b, allCode);
await b.check('#shareDlg input[value="all"]');
await b.click('[data-act="share-apply"]');
await b.click('[data-act="tab"][data-tab="cars"]');
const bbRow = b.locator('#tab-cars tbody tr', { has: b.locator('[data-field="reg"][value="BB22222"]') });
check('everything mode brings the note across', (await bbRow.locator('[data-field="note"]').inputValue()) === 'back Friday');
check('everything mode brings the label across', (await bbRow.locator('.chip.on').innerText()) === 'Workshop');
await b.click('[data-act="tab"][data-tab="drivers"]');
check('everything mode brings the roster across, merged with the local one',
  (await b.locator('#tab-drivers tbody tr').count()) === 3);
check('including who was away', (await b.locator('#tab-drivers tbody tr', { has: b.locator('[data-field="name"][value="Bo"]') }).locator('[data-act="toggle"]').innerText()) === 'Away');
check('and the group, with its members matched back by name',
  (await b.locator('#tab-drivers .group').count()) === 1
  && (await b.locator('#tab-drivers .group .chip.on').allInnerTexts()).join() === 'Ana',
  (await b.locator('#tab-drivers .group .chip.on').allInnerTexts()).join());

// A share link does the same thing on arrival.
const pcC = await browser.newContext();
const c = await pcC.newPage();
c.on('pageerror', (e) => bErrors.push(String(e)));
await c.goto(base + '#d=' + encodeURIComponent(dayCode), { waitUntil: 'networkidle' });
await c.waitForSelector('#shareDlg[open]');
check('a share link opens the same dialog', (await c.locator('#shareDlg').innerText()).includes('2 routes'));
check('the link is cleared from the address bar', !(await c.evaluate(() => location.hash)));
await c.click('[data-act="share-apply"]');
await c.click('[data-act="tab"][data-tab="plan"]');
check('link import lands the plan', (await c.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Ana');

// Damaged and foreign codes fail politely.
await b.click('[data-act="tab"][data-tab="data"]');
await readCode(b, dayCode.slice(0, -8) + 'XXXXXXXX');
await b.waitForSelector('#notices .notice.warn');
check('a damaged code is rejected, not swallowed', (await b.locator('#notices .notice.warn').last().innerText()).includes('damaged'));
await readCode(b, 'just some text someone pasted');
await b.waitForFunction(() => /CC1\./.test([...document.querySelectorAll('#notices .notice.warn')].pop()?.innerText || ''));
check('an unrelated paste is rejected', (await b.locator('#notices .notice.warn').last().innerText()).includes('CC1.'));
check('no console errors on PC B or C', bErrors.length === 0, bErrors.join(' | '));

await pcB.close();
await pcC.close();

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- the plan and the banner must never disagree ---
// Duplicate route ids come from imported files; identifying rows by id made
// the banner count clashes that no row was flagged for.
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18',
  labels: [{ id: 'L1', name: '', color: '#6a1b9a' }],
  cars: [{ id: 'c1', reg: 'AA11111', labelId: 'L1' }],
  positions: [{ id: 'p1', name: 'Spot 1' }],
  routes: [
    { id: 'dup', name: '1', driver: 'Ana', carId: 'c1', positionId: 'p1' },
    { id: 'dup', name: '', driver: 'Bo', carId: 'c1', positionId: 'p1' },
  ],
})));
await page.reload({ waitUntil: 'networkidle' });
const banner = await page.locator('#tab-plan .problems').innerText();
check('duplicate route ids still flag both rows', (await page.locator('#tab-plan tbody tr.warn').count()) === 2);
check('the banner counts routes, not sentences', banner.includes('2 routes to look at'), banner.split('\n')[0]);
check('a blank route name does not dangle', !/\(1, \)|route 1, $/m.test(banner), banner);
check('a nameless status still says something', banner.includes('a status with no name'), banner);
const carOption = await page.locator('#tab-plan tbody tr').first().locator('[data-field="carId"] option:checked').innerText();
check('the dropdown shows the mark even with a blank label name', carOption.includes('status with no name'), carOption);

// --- the car counters partition the fleet ---
await page.click('[data-act="tab"][data-tab="cars"]');
const counts = (await page.locator('#tab-cars .counts').innerText()).match(/\d+/g).map(Number);
check('on a route + free + parked equals the fleet', counts[0] + counts[1] + counts[2] === 1, JSON.stringify(counts));

// --- a shared position survives a day-plan-only share ---
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', labels: [], cars: [{ id: 'c1', reg: 'AA11111' }],
  positions: [{ id: 'p1', name: 'Garage', multi: true }],
  routes: [
    { id: 'r1', name: '1', driver: 'Ana', carId: 'c1', positionId: 'p1' },
    { id: 'r2', name: '2', driver: 'Bo', carId: '', positionId: 'p1' },
    { id: 'r3', name: '3', driver: 'Cai', carId: '', positionId: 'p1' },
  ],
})));
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-act="tab"][data-tab="data"]');
const garageCode = await copyCode(page, 'day');

const pcD = await browser.newContext();
const d = await pcD.newPage();
d.on('pageerror', (e) => bErrors.push(String(e)));
await d.goto(base, { waitUntil: 'networkidle' });
await d.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-01-01', labels: [], cars: [], positions: [], routes: [],
})));
await d.reload({ waitUntil: 'networkidle' });
await d.click('[data-act="tab"][data-tab="data"]');
await readCode(d, garageCode);
await d.click('[data-act="share-apply"]');
await d.click('[data-act="tab"][data-tab="plan"]');
check('a shared position stays shared after a day-plan import', (await d.locator('#tab-plan .problems').count()) === 0,
  await d.locator('#tab-plan .problems').innerText().catch(() => ''));
await d.click('[data-act="tab"][data-tab="positions"]');
check('and it arrives with Many cars ticked', await d.locator('#tab-positions [data-field="multi"]').first().isChecked());
await pcD.close();

// --- damaged saved data must not masquerade as a first run ---
// A scalar in the key used to be silently swallowed: no notice, and the
// linked save file was never consulted because the key still existed.
for (const bad of ['42', '"hello"', 'true', 'null', '[]', '{oops']) {
  await page.evaluate((v) => localStorage.setItem('carcoord:v1', v), bad);
  await page.reload({ waitUntil: 'networkidle' });
  check(`damaged save (${bad}) is reported, not swallowed`, (await page.locator('#notices .notice.warn').count()) === 1);
}

// --- a hostile imported file cannot execute or brick the app ---
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', labels: [], positions: [{ id: 'p1', name: 'Spot 1' }],
  cars: [{ id: '"><img src=x onerror="window.__pwned=1">', reg: 'AA11111' }],
  routes: [{ id: 'r1', name: '1', carId: '"><img src=x onerror="window.__pwned=1">', positionId: 'p1' }],
})));
await page.reload({ waitUntil: 'networkidle' });
const injected = await page.evaluate(() => ({ pwned: !!window.__pwned, imgs: document.querySelectorAll('#tab-plan img').length }));
check('an id from an imported file cannot inject markup', !injected.pwned && injected.imgs === 0, JSON.stringify(injected));

await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', labels: [], positions: [],
  cars: [{ id: '__proto__', reg: 'AA11111' }],
  routes: [{ id: 'r1', name: '1', carId: '__proto__' }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('a car id of __proto__ does not brick the app', (await page.locator('#tab-plan tbody tr').count()) === 1);

// --- the printed sheet carries the clashes it is showing on screen ---
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', qrOnSheet: false,
  labels: [{ id: 'L1', name: 'Workshop', color: '#6a1b9a' }],
  cars: [{ id: 'c1', reg: 'AA11111', labelId: '' }, { id: 'c2', reg: 'BB22222', labelId: 'L1' }],
  positions: [{ id: 'p1', name: 'Spot 1', multi: false }, { id: 'p2', name: 'Garage', multi: true }],
  routes: [
    { id: 'r1', name: '1', driver: 'Ana', carId: 'c1', positionId: 'p1' },
    { id: 'r2', name: '2', driver: 'Bo', carId: 'c1', positionId: 'p1' },
    { id: 'r3', name: '3', driver: 'Cai', carId: 'c2', positionId: 'p2' },
  ],
})));
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-act="tab"][data-tab="preview"]');
const clashSheet = await page.locator('#sheet').innerText();
check('the sheet names the doubled car', clashSheet.includes('AA11111 is on 2 routes'));
check('the sheet names the doubled spot', clashSheet.includes('Spot 1 is taken by 2 routes'));
check('the sheet names the car that should be in the workshop', clashSheet.includes('BB22222 is marked Workshop'));
check('the sheet marks the rows involved', (await page.locator('#sheet tr.warn').count()) === 3);
check('a shared Garage is not called a clash', !clashSheet.includes('Garage is taken'));

// --- the clash rule is per round, not per spot ---
// The headline feature. Two routes in one spot are a clash only when they are
// packed in the same round; in different rounds that is exactly what rounds
// are for, and warning about it would train the leader to ignore the box.
const spotPlan = (routes) => ({
  schemaVersion: 2, date: '2026-09-18', qrOnSheet: false, labels: [], cars: [],
  positions: [{ id: 'p1', name: 'Spot 1' }, { id: 'p2', name: 'Garage', multi: true }],
  routes: routes.map(([name, round, positionId], i) => ({ id: `r${i + 1}`, name, driver: '', round, positionId: positionId || 'p1' })),
});
const loadPlan = async (plan) => {
  await page.evaluate((d) => localStorage.setItem('carcoord:v1', JSON.stringify(d)), plan);
  await page.reload({ waitUntil: 'networkidle' });
};
const problemCount = () => page.locator('#tab-plan .problems').count();
const problemText = () => page.locator('#tab-plan .problems').innerText().catch(() => '');
const warnRows = () => page.locator('#tab-plan tbody tr.warn').count();

await loadPlan(spotPlan([['1', '1'], ['2', '2']]));
check('the same spot in two rounds does not warn', (await problemCount()) === 0 && (await warnRows()) === 0, await problemText());
const noteFor = async (row, spot) => (await page.locator('#tab-plan tbody tr').nth(row).locator(`[data-field="positionId"] option`).filter({ hasText: spot }).first().innerText());
check('and the dropdown does not call it taken either', (await noteFor(0, 'Spot 1')) === 'Spot 1', await noteFor(0, 'Spot 1'));

await loadPlan(spotPlan([['1', '2'], ['2', '2']]));
check('the same spot in the same round still warns', (await problemText()).includes('Spot 1 in round 2 is taken by 2 routes (1, 2)'), await problemText());
check('and both rows are flagged', (await warnRows()) === 2);
await page.click('[data-act="tab"][data-tab="preview"]');
check('the printed sheet says so too', (await page.locator('#sheet').innerText()).includes('Spot 1 in round 2 is taken by 2 routes'));
await page.click('[data-act="tab"][data-tab="plan"]');

await loadPlan(spotPlan([['1', ''], ['2', '']]));
check('two blank rounds in one spot are still a clash', (await problemText()).includes('Spot 1 is taken by 2 routes (1, 2)'), await problemText());

await loadPlan(spotPlan([['1', ''], ['2', '2']]));
check('a blank round is its own round, not every round', (await problemCount()) === 0, await problemText());

await loadPlan(spotPlan([['1', ' a '], ['2', 'A']]));
check('a stray space or a capital does not silence the warning', (await problemText()).includes('is taken by 2 routes'), await problemText());

await loadPlan(spotPlan([['1', '2', 'p2'], ['2', '2', 'p2']]));
check('a shared spot is still shared, round or no round', (await problemCount()) === 0, await problemText());

// Typing a round has to answer the warning immediately: the leader fixes the
// clash and looks straight at the box to see it go.
await loadPlan(spotPlan([['1', '2'], ['2', '2']]));
const clashRound = page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="round"]');
await clashRound.click();
await page.keyboard.press('End');
await page.keyboard.type('X');
await page.waitForFunction(() => !document.querySelector('#tab-plan .problems'), null, { timeout: 2000 }).catch(() => {});
check('moving a route to another round clears the warning there and then', (await problemCount()) === 0, await problemText());
check('and the caret is still in the round being typed', await page.evaluate(() =>
  document.activeElement.dataset.field === 'round' && document.activeElement.selectionStart === 2));
await page.keyboard.type('Y');
check('so typing simply carries on', (await clashRound.inputValue()) === '2XY');

// --- day templates: saving the plan that gets made again ---
// A template is the route list as it stands minus the date. Saving is not
// destructive; saving over a name already used is, so that one is snapshotted.
const templatePlan = {
  schemaVersion: 2, date: '2026-09-18', qrOnSheet: false, labels: [],
  cars: [{ id: 'c1', reg: 'AA11111' }, { id: 'c2', reg: 'BB22222' }],
  positions: [{ id: 'p1', name: 'Spot 1' }, { id: 'p2', name: 'Spot 2' }],
  routes: [
    { id: 'r1', name: '1', driver: 'Weekday One', carId: 'c1', positionId: 'p1', round: '1', highlight: true },
    { id: 'r2', name: '2', driver: 'Weekday Two', carId: 'c2', positionId: 'p2', round: '2', gapBefore: true },
    { id: 'r3', name: '3' },
  ],
};
await loadPlan(templatePlan);
const shelf = page.locator('#tab-plan .tpl');
await page.fill('#newTemplate', 'Monday');
await page.click('[data-act="save-template"]');
check('saving puts a template on the shelf under the plan',
  (await shelf.count()) === 1 && (await shelf.innerText()).replace(/\s+/g, ' ').includes('Monday 3 routes'),
  await shelf.innerText());
check('and says what it saved', (await page.locator('#notices .notice').last().innerText()).includes('Saved Monday: a template of 3 routes'),
  await page.locator('#notices .notice').last().innerText());
check('a template carries every route field the plan does, and no date', await page.evaluate(() => {
  const t = state.templates[0];
  const [one, two] = t.routes;
  return t.routes.length === 3 && !('date' in t) && t.weekday === ''
    && one.driver === 'Weekday One' && one.carId === 'c1' && one.positionId === 'p1'
    && one.round === '1' && one.highlight === true && two.gapBefore === true
    && !('id' in one);                                 // ids are minted on load, not stored
}));

await page.reload({ waitUntil: 'networkidle' });
check('a saved template survives a reload', (await shelf.locator('[data-act="ask-template"]').innerText()) === 'Monday');

// Saving a name that is already used replaces it: the second Monday is a
// correction of the first, not a second Monday to choose between.
await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').fill('Weekday Changed');
await page.fill('#newTemplate', 'monday');             // the same name, typed differently
await page.click('[data-act="save-template"]');
check('saving the same name again replaces it rather than making a second',
  (await shelf.count()) === 1 && (await page.evaluate(() => state.templates[0].routes[0].driver)) === 'Weekday Changed');
check('and keeps the name it was given rather than the capitals just typed',
  (await page.evaluate(() => state.templates[0].name)) === 'Monday');
check('and says so', (await page.locator('#notices .notice').last().innerText()).includes('Replaced the Monday template'),
  await page.locator('#notices .notice').last().innerText());
await page.click('[data-act="tab"][data-tab="data"]');
check('the template it replaced is in the backups', (await page.locator('#tab-data table tbody').first().innerText()).includes('Replacing the Monday template'));

await page.click('[data-act="tab"][data-tab="plan"]');
const delTemplate = shelf.locator('[data-act="del"]');
await delTemplate.click();
await delTemplate.click();                             // two-click confirm, like every other delete
check('a template can be deleted', (await shelf.count()) === 0);

// A car the template pointed at, deleted from the fleet, must leave the
// template with it — otherwise the next reload repairs a template nobody
// touched, and says so.
await page.fill('#newTemplate', 'Monday');
await page.click('[data-act="save-template"]');
await page.click('[data-act="tab"][data-tab="cars"]');
const delCar = page.locator('#tab-cars tbody tr', { has: page.locator('[data-field="reg"][value="AA11111"]') }).locator('[data-act="del"]');
await delCar.click();
await delCar.click();
check('deleting a car takes it out of the templates too',
  await page.evaluate(() => state.templates[0].routes[0].carId === ''));
await page.reload({ waitUntil: 'networkidle' });
check('so the reload after it has nothing to repair', (await page.locator('#notices .notice').count()) === 0,
  await page.locator('#notices').innerText());

// --- loading a template, behind a confirmation that says what it costs ---
// The only destructive action a click away from the plan. It asks first, in
// words, and snapshots before it writes: everything below is that promise.
const mondayRoutes = [
  { name: '1', driver: 'Weekday One', carId: 'c1', positionId: 'p1', round: '1', highlight: true },
  { name: '2', driver: 'Weekday Two', carId: 'c2', positionId: 'p2', round: '2', gapBefore: true },
  { name: '3' },
];
const plannedToday = { id: 'r9', name: '9', driver: 'Typed This Morning', carId: 'c1', positionId: 'p2', round: '5' };
const withMonday = {
  ...templatePlan,
  labels: [{ id: 'l1', name: 'Workshop', color: '#6a1b9a' }],
  routes: [plannedToday],
  templates: [{ id: 't1', name: 'Monday', weekday: '', routes: mondayRoutes }],
};
await loadPlan(withMonday);
const backupCount = () => page.evaluate(() => Store.backups().length);
const planDrivers = () => page.evaluate(() => state.routes.map((r) => r.driver));
const before = await backupCount();

await page.click('#tab-plan .tpl [data-act="ask-template"]');
check('clicking a template asks before it does anything',
  (await page.locator('#notices .notice.warn').innerText()).includes("replaces the 1 route there now with the template's 3"),
  await page.locator('#notices .notice.warn').innerText());
check('and the plan is untouched while the question stands',
  JSON.stringify(await planDrivers()) === '["Typed This Morning"]');

await page.click('#notices .notice.warn [data-act="dismiss"]');
check('dismissing the question changes nothing at all',
  (await page.locator('#notices .notice').count()) === 0
  && JSON.stringify(await planDrivers()) === '["Typed This Morning"]'
  && (await backupCount()) === before,
  `${await backupCount()} backups, was ${before}`);

await page.click('#tab-plan .tpl [data-act="ask-template"]');
await page.click('#notices [data-act="load-template"]');
check('loading replaces every route field the template carries', await page.evaluate(() => {
  const [one, two, three] = state.routes;
  return state.routes.length === 3
    && one.driver === 'Weekday One' && one.carId === 'c1' && one.positionId === 'p1'
    && one.round === '1' && one.highlight === true
    && two.gapBefore === true && three.driver === '' && three.carId === ''
    && new Set(state.routes.map((r) => r.id)).size === 3;   // ids minted, not shared
}));
check('the day plan on screen is the template', (await page.locator('#tab-plan tbody tr').count()) === 3
  && (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Weekday One');
check('a template has no date of its own to bring', (await page.evaluate(() => state.date)) === '2026-09-18');
check('and the question is answered rather than left on screen',
  (await page.locator('#notices .notice.warn').count()) === 0
  && (await page.locator('#notices .notice.info').innerText()).includes('Loaded the Monday template: 3 routes'));

await page.click('[data-act="tab"][data-tab="data"]');
check('the backup taken before the load is in the Data tab',
  (await page.locator('#tab-data table tbody').first().innerText()).includes('Loading the Monday template'));
const undo = page.locator('[data-act="restore"]').first();
await undo.click();
await undo.click();                                    // two-click confirm
check('and restoring it brings back the plan that was replaced',
  JSON.stringify(await planDrivers()) === '["Typed This Morning"]', JSON.stringify(await planDrivers()));

// A template holds cars by id, so one that has gone to the workshop since it
// was saved comes back with the app's usual warning rather than a refusal.
await page.click('[data-act="tab"][data-tab="cars"]');
await page.locator('#tab-cars tbody tr', { has: page.locator('[data-field="reg"][value="AA11111"]') }).locator('.chip', { hasText: 'Workshop' }).click();
await page.click('[data-act="tab"][data-tab="plan"]');
await page.click('#tab-plan .tpl [data-act="ask-template"]');
await page.click('#notices [data-act="load-template"]');
check('a template that brings back a car in the workshop warns, and still loads',
  (await page.locator('#tab-plan .problems').innerText()).includes('AA11111 is marked Workshop')
  && (await page.locator('#tab-plan tbody tr').count()) === 3,
  await page.locator('#tab-plan .problems').innerText());

// --- the weekday offer: off by default, and an offer even when it is on ---
// The rule the pack exists for. A template never applies itself: the most it
// ever does is raise the same question the shelf raises.
await loadPlan(withMonday);
check('a template is set for no day when it is saved', await page.evaluate(() => state.templates[0].weekday === ''));
check('so opening the app raises nothing, whatever day it is',
  (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

const weekday = page.locator('#tab-plan .tpl select[data-field="weekday"]');
const dayNow = new Date().getDay();
await weekday.selectOption(String((dayNow + 1) % 7));
await page.reload({ waitUntil: 'networkidle' });
check('a weekday sticks to the template it was set on',
  (await page.evaluate(() => state.templates[0].weekday)) === String((dayNow + 1) % 7));
check('and a template set for another day says nothing today',
  (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

await weekday.selectOption(String(dayNow));
await page.reload({ waitUntil: 'networkidle' });
check('a template set for today offers itself on the way in',
  (await page.locator('#notices .notice [data-act="ask-template"]').innerText()) === 'Use Monday',
  await page.locator('#notices').innerText());
check('and has loaded nothing while it waits to be asked',
  JSON.stringify(await planDrivers()) === '["Typed This Morning"]');

await page.click('#notices [data-act="ask-template"]');
check('taking the offer asks the same question the shelf asks',
  (await page.locator('#notices .notice.warn').innerText()).includes("replaces the 1 route there now with the template's 3"),
  await page.locator('#notices .notice.warn').innerText());
await page.click('#notices [data-act="load-template"]');
check('and only then is anything replaced, with the same backup taken first',
  (await page.evaluate(() => state.routes.length)) === 3
  && (await page.evaluate(() => Store.backups()[0].label)) === 'Loading the Monday template',
  await page.evaluate(() => Store.backups()[0].label));

// Back to no day, and the offer goes with it.
await weekday.selectOption('');
await page.reload({ waitUntil: 'networkidle' });
check('turning the weekday off again stops the offer',
  (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

// A repair notice and the offer, on screen together: exactly what a template
// that lost a car, on its own weekday, produces. Dismiss buttons carry the
// notice's index, so the wrong one going away would be quiet and wrong.
await loadPlan({
  ...withMonday,
  templates: [{
    id: 't1', name: 'Monday', weekday: String(dayNow),
    routes: [{ name: '1', driver: 'Weekday One', carId: 'gone' }, ...mondayRoutes.slice(1)],
  }],
});
check('a repair notice and an offer sit side by side', (await page.locator('#notices .notice').count()) === 2,
  await page.locator('#notices').innerText());
await page.click('#notices [data-act="ask-template"]');
check('and the question joins them rather than piling up',
  (await page.locator('#notices .notice').count()) === 2 && (await page.locator('#notices .notice.warn').count()) === 1,
  await page.locator('#notices').innerText());
await page.click('#notices .notice.warn [data-act="dismiss"]');
check('dismissing the question takes the question, not the notice beside it',
  (await page.locator('#notices .notice').count()) === 1
  && (await page.locator('#notices .notice').innerText()).includes('Repaired saved data')
  && JSON.stringify(await planDrivers()) === '["Typed This Morning"]',
  await page.locator('#notices').innerText());

// --- templates are private to this PC, and travel in the JSON file ---
// The decisions table's call, asserted in both directions: a share code
// neither carries a template nor disturbs one, and the exported file does
// carry them, because `normalise()` now names the field.
await loadPlan(withMonday);
await page.click('[data-act="tab"][data-tab="data"]');
const ownCode = await copyCode(page, 'day');
await readCode(page, ownCode);
await page.click('[data-act="share-apply"]');
check('loading a shared list leaves the templates on this PC alone',
  await page.evaluate(() => state.templates.length === 1 && state.templates[0].name === 'Monday'));

const [tplFile] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
const tplJson = JSON.parse(await readFile(await tplFile.path(), 'utf8'));
check('an exported copy carries the templates to the other manager',
  tplJson.templates.length === 1 && tplJson.templates[0].routes.length === 3);

await loadPlan(templatePlan);                          // a PC with no templates of its own
await page.click('[data-act="tab"][data-tab="data"]');
await page.setInputFiles('#importFile', { name: 'day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tplJson)) });
await page.click('[data-act="tab"][data-tab="plan"]');
check('and importing it brings them in', (await page.locator('#tab-plan .tpl').count()) === 1);

// --- app notices must not print on the sheet ---
await page.evaluate(() => {
  document.querySelector('#notices').innerHTML = '<div class="notice info">Loaded 15 routes for 2026-09-18.</div>';
});
await page.emulateMedia({ media: 'print' });
const printed = await page.evaluate(() => {
  const n = document.querySelector('#notices');
  const rail = document.querySelector('#tab-plan .rail');
  return {
    display: getComputedStyle(n).display,
    // Boxes, not computed display: the rail's own display stays `grid` while
    // the main it sits in is hidden, so only "does it lay out" answers this.
    railBoxes: rail ? rail.getClientRects().length : 0,
    sheetTop: document.querySelector('#sheet').getBoundingClientRect().top,
  };
});
await page.emulateMedia({ media: null });
check('notices are hidden when printing', printed.display === 'none', `display=${printed.display}`);
// The rail is inside main, which the print rules already hide. Nothing about
// the sheet's own stylesheet changed, and this is the check that says so.
check('the rail does not reach the paper', printed.railBoxes === 0, `${printed.railBoxes} boxes`);
check('the sheet still starts at the top of the page', printed.sheetTop <= 1, `top=${printed.sheetTop}`);

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- a question raised from the shelf has to be somewhere you can see it ---
// The shelf sits at the foot of a full day plan while notices render at its
// head. Every other assertion about the question passes whether or not it is
// on screen, so this is the only one that catches the click that looks dead.
await page.fill('#newTemplate', 'Monday');
await page.click('[data-act="save-template"]');
await page.locator('#newTemplate').scrollIntoViewIfNeeded();
const shelfWasBelow = await page.evaluate(() =>
  document.querySelector('#newTemplate').getBoundingClientRect().top > window.innerHeight / 2);
check('the shelf is far enough down the plan for this to be a real test', shelfWasBelow);
await page.locator('[data-act="ask-template"]').first().click();
check('asking from the shelf scrolls the question into view', await page.evaluate(() => {
  const q = document.querySelector('#notices .notice.warn');
  if (!q) return false;
  const r = q.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}));

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- the server turns a bad URL into a 404, not a dead process ---
const malformed = await fetch(base + '%').then((r) => r.status, () => 'connection died');
check('a malformed URL is a 404, not a crash', malformed === 404, String(malformed));
check('the server is still alive after it', (await fetch(base).then((r) => r.status, () => 0)) === 200);

// --- the page a phone opens must not scroll sideways ---
// The QR on the printed sheet exists so a phone can open this page, so phone
// width is a real use, not a courtesy.
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: '2026-09-18', labels: [],
  cars: [{ id: 'c1', reg: 'AA11111' }],
  positions: [{ id: 'p1', name: 'Spot 1' }],
  routes: [{ id: 'r1', name: '1', driver: 'Ana Ruiz', carId: 'c1', positionId: 'p1' }],
  // A saved template too: the shelf card is the widest row the day plan can
  // grow — name button, route count, weekday select and delete, side by side.
  templates: [{ id: 't1', name: 'Monday', weekday: '1',
    routes: [{ name: '1', driver: 'Ana Ruiz', carId: 'c1', positionId: 'p1', round: '1' }] }],
})));
await page.reload({ waitUntil: 'networkidle' });
for (const name of ['plan', 'drivers', 'cars', 'positions', 'labels', 'data']) {
  await page.click(`[data-act="tab"][data-tab="${name}"]`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`the ${name} tab fits a phone screen`, !wide);
}
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- prints to A4 ---
const pdf = await page.pdf({ format: 'A4', printBackground: true });
check('renders a non-empty A4 PDF', pdf.length > 1000, `${pdf.length} bytes`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
