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
/* For the checks whose answer is a list: the failure reads better when it
   prints what it got than when it prints `false`. */
const same = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

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
check('a first run is no load trouble, and has no saved text', await page.evaluate(() => Store.loadTrouble() === false && Store.savedText() === null));
check('the release notes load, newest first at the running version', await page.evaluate(() =>
  typeof UPDATES !== 'undefined' && Array.isArray(UPDATES) && UPDATES[0].version === APP_VERSION),
  await page.evaluate(() => `${typeof UPDATES === 'undefined' ? 'no UPDATES' : UPDATES[0] && UPDATES[0].version} / ${APP_VERSION}`));

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
await page.click('#tab-cars [data-act="add-car"]');
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
await page.click('#tab-drivers [data-act="add-driver"]');
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
await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').click();
same('the roster reaches the day plan, as a grid to pick from',
  await page.locator('#picker .pick-name').allInnerTexts(), ['Roster One', 'Roster Three']);
await page.keyboard.press('Escape');
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
const crew = () => page.locator('#tab-plan [data-panel="drivers"] .rail-count').innerText();
const inToday = () => page.locator('#tab-plan [data-panel="drivers"] li:not(.away)')
  .evaluateAll((rows) => rows.map((r) => r.querySelector('.rail-name').value));
check('marking someone away leaves them on the rail, marked away',
  (await page.locator('#tab-plan [data-panel="drivers"] li').count()) === 2
  && (await page.locator('#tab-plan [data-panel="drivers"] li.away').count()) === 1
  && (await crew()) === '1 in · 1 away', await crew());
// The one worth seeing: away, and still written into route 2.
check('and still shows the route they were written into',
  (await page.locator('#tab-plan [data-panel="drivers"] li.away .assign').innerText()).includes('Route 2'));
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
await page.click('#tab-drivers [data-act="add-driver"]');          // roster: Roster One, Group One, Group Two
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
check('applying a group sets who is in today', (await crew()) === '2 in · 1 away', await crew());
check('and says how the day now stands', (await page.locator('#notices .notice').last().innerText()).includes('Monday: 2 drivers in today, 1 away'),
  await page.locator('#notices .notice').last().innerText());

// The one that matters: applying a second group must take the first group's
// leftovers out, not simply add its own people in.
await page.locator('#tab-plan [data-panel="drivers"] [data-act="apply-group"]', { hasText: 'Weekend' }).click();
check('applying another group replaces the crew rather than adding to it',
  JSON.stringify(await inToday()) === JSON.stringify(['Group Two']), JSON.stringify(await inToday()));

await page.reload({ waitUntil: 'networkidle' });
check('the applied crew survives a reload',
  JSON.stringify(await inToday()) === JSON.stringify(['Group Two']), JSON.stringify(await inToday()));
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
const firstCar = page.locator('#tab-plan [data-panel="cars"] li').first();
check('the rail says where the assigned one went',
  (await firstCar.locator('.rail-name').inputValue()) === 'AA11111'
  && (await firstCar.locator('.assign').innerText()).trim() === 'Route 1',
  await firstCar.innerText());
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
check('export is valid Car Coordinator JSON', parsed.schemaVersion === 4 && parsed.cars.length === 3);

parsed.cars[0].reg = 'ZZ99999';
await page.setInputFiles('#importFile', { name: 'day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(parsed)) });
await page.click('[data-act="tab"][data-tab="cars"]');
check('import replaces the data', (await page.locator('#tab-cars tbody tr').first().locator('[data-field="reg"]').inputValue()) === 'ZZ99999');

// --- corrupt and hostile saved data ---
await page.evaluate(() => localStorage.setItem('carcoord:v1', '{not json at all'));
await page.reload({ waitUntil: 'networkidle' });
check('survives corrupt saved data', await page.locator('#notices .notice.warn').isVisible());
check('an unreadable save is load trouble, and its text is kept byte for byte',
  await page.evaluate(() => Store.loadTrouble() === true && Store.savedText() === '{not json at all'));

await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 1, date: 'not-a-date', labels: 'nope', cars: [{ id: 'c1', reg: 'DD44444' }],
  positions: [{ id: 'p1', name: 'Spot 9' }],
  routes: [{ id: 'r1', name: '1', carId: 'ghost', positionId: 'p1', driver: 'Kept' }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('repairs a dangling car reference', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="carId"]').inputValue()) === '');
check('keeps the good fields while repairing', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Kept');
check('a repaired but usable save is no load trouble', await page.evaluate(() => Store.loadTrouble() === false));

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
check('and a save from a newer version is load trouble', await page.evaluate(() => Store.loadTrouble() === true));

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

// --- the offer: the list, spelled out, before anything is written ---
// Data as a leader who started before this change still has it: the round
// baked into the spot name, two of those names meaning one spot, and a round
// already typed onto one route by hand.
const oldNames = {
  schemaVersion: 3, date: '2026-09-18', qrOnSheet: false,
  labels: [{ id: 'L1', name: 'Out of service', color: '#c62828' }],
  cars: [{ id: 'c1', reg: 'AA11111', labelId: '', note: '' }],
  positions: [
    { id: 'p1', name: 'Spot 1/1', multi: false, labelId: '', note: '' },
    { id: 'p2', name: 'Spot 1/2', multi: true, labelId: 'L1', note: 'pallet jack in it' },
    { id: 'p3', name: 'Garage', multi: true, labelId: '', note: '' },
  ],
  routes: [
    { id: 'r1', name: '1', driver: 'Ana', carId: 'c1', positionId: 'p1', round: '', highlight: false, gapBefore: false },
    { id: 'r2', name: '2', driver: 'Bo', carId: '', positionId: 'p2', round: '', highlight: false, gapBefore: false },
    { id: 'r3', name: '3', driver: 'Cai', carId: '', positionId: 'p2', round: '4', highlight: false, gapBefore: false },
    { id: 'r4', name: '4', driver: 'Dee', carId: '', positionId: 'p3', round: '', highlight: false, gapBefore: false },
  ],
  drivers: [], driverGroups: [],
  templates: [{ id: 't1', name: 'Monday', weekday: '', routes: [{ name: '1', driver: 'Ana', carId: 'c1', positionId: 'p2', round: '', highlight: false, gapBefore: false }] }],
};
const loadOldNames = async (pg) => {
  await pg.evaluate((plan) => localStorage.setItem('carcoord:v1', JSON.stringify(plan)), oldNames);
  await pg.reload({ waitUntil: 'networkidle' });
};
await loadOldNames(page);
const offer = page.locator('#notices .notice.warn');
check('old spot names raise the offer', (await offer.count()) === 1 && (await offer.locator('[data-act="split-rounds"]').innerText()) === 'Split the rounds out', await page.locator('#notices').innerText());
const offerLines = await offer.locator('li').allInnerTexts();
check('it names every spot, old name to new, with the round it carried',
  offerLines[0] === 'Spot 1/1 → Spot 1, round 1' && offerLines[1] === 'Spot 1/2 → Spot 1, round 2 — the same Spot 1: two spots become one',
  offerLines.slice(0, 2).join(' | '));
check('and says nothing about the spot it is not touching', !offerLines.join(' ').includes('Garage'));
check('the counts separate a round it fills in from a round someone typed',
  offerLines.some((l) => l === '2 routes have their rounds filled in from the spot name.')
  && offerLines.some((l) => l.startsWith('1 route already has a round typed in and is left exactly as it is')),
  offerLines.join(' | '));
check('a saved template is counted too, by name', offerLines.some((l) => l === 'The Monday template moves with the plan: 1 route filled in.'), offerLines.join(' | '));
check('the merge conflict is named, and so is what wins',
  offerLines.some((l) => l === 'Spot 1/1 and Spot 1/2 do not agree about "many cars", the status and the note. Spot 1 keeps what Spot 1/1 has — the lowest round wins.'),
  offerLines.join(' | '));
check('it tells both PCs to do this before swapping codes again', offerLines.some((l) => l.includes('before swapping share codes again')));

// Dismissing is not an answer, and must cost nothing: the saved data has to
// come back byte for byte, because the offer is raised again next time.
const savedBefore = await page.evaluate(() => localStorage.getItem('carcoord:v1'));
await offer.locator('[data-act="dismiss"]').click();
check('dismissing takes the question away', (await page.locator('#notices .notice').count()) === 0);
check('and leaves the saved data byte for byte as it was', (await page.evaluate(() => localStorage.getItem('carcoord:v1'))) === savedBefore);
await page.reload({ waitUntil: 'networkidle' });
check('the question comes back on the next load', (await page.locator('#notices .notice.warn [data-act="split-rounds"]').count()) === 1);

// --- applying it: exactly the plan that was shown, and nothing besides ---
// The page is still on the offer raised above, so this is the leader's own
// route into it: read the list, press the button.
await page.locator('[data-act="split-rounds"]').click();
const done = await page.evaluate(() => ({
  positions: state.positions.map((p) => [p.id, p.name, p.multi, p.labelId, p.note].join('|')),
  routes: state.routes.map((r) => [r.id, r.positionId, r.round].join('|')),
  template: state.templates[0].routes.map((r) => [r.positionId, r.round].join('|')),
  offers: notices.filter((n) => n.offer).length,
  backup: Store.backups()[0].label,
}));
check('the two spots are one spot now, and the Garage is untouched',
  done.positions.join(' / ') === 'p1|Spot 1|false|| / p3|Garage|true||', done.positions.join(' / '));
check('every route on either name stands on the survivor',
  done.routes.slice(0, 3).every((r) => r.split('|')[1] === 'p1'), done.routes.join(' / '));
check('a blank round is filled in from the name the route stood on',
  done.routes[0] === 'r1|p1|1' && done.routes[1] === 'r2|p1|2', done.routes.join(' / '));
check('a round someone typed is left exactly as it was', done.routes[2] === 'r3|p1|4', done.routes[2]);
check('a route on a spot with no round in its name is not touched at all', done.routes[3] === 'r4|p3|', done.routes[3]);
check('the saved template moved with the plan', done.template.join() === 'p1|2', done.template.join());
check('the question is answered and gone', done.offers === 0);
check('and the report says what was done', (await page.locator('#notices .notice.info').innerText()).includes('2 routes had the round filled in'), await page.locator('#notices .notice.info').innerText());
check('a backup was taken first, named for what it was taken before', done.backup === 'Splitting the round out of the spot names', done.backup);

// The point of the whole exercise: the paper sheet is unchanged. "Spot 1"
// packed in round 1 prints as "Spot 1/1", exactly as the old name did.
await page.click('[data-act="tab"][data-tab="preview"]');
const splitSheet = await page.locator('#sheet').innerText();
check('the printed sheet reads exactly as it did before the split',
  splitSheet.includes('Spot 1/1') && splitSheet.includes('Spot 1/2') && splitSheet.includes('Spot 1/4'), splitSheet.split('\n').slice(0, 6).join(' / '));

await page.reload({ waitUntil: 'networkidle' });
check('the offer does not come back once there is nothing to split', (await page.locator('#notices .notice').count()) === 0, await page.locator('#notices').innerText());

// One click in Backups undoes the lot. It is the only way back, so it is
// worth a check of its own rather than trusting the label.
await page.click('[data-act="tab"][data-tab="data"]');
const undoSplit = page.locator('[data-act="restore"]').first();
await undoSplit.click();
await undoSplit.click();                              // two-click confirm
check('restoring the backup brings the old names, and the routes, back', await page.evaluate(() =>
  state.positions.map((p) => p.name).join() === 'Spot 1/1,Spot 1/2,Garage'
  && state.routes.map((r) => `${r.positionId}:${r.round}`).join() === 'p1:,p2:,p2:4,p3:'));

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
// them, so the decoder does not ship. Serve it from the page's own origin
// rather than inlining it: the app ships a CSP of script-src 'self', and a
// test that had to be let through it would be testing a different page.
await page.route('**/jsqr-test-only.js', async (r) =>
  r.fulfill({ contentType: 'text/javascript', body: await readFile('node_modules/jsqr/dist/jsQR.js', 'utf8') }));
await page.addScriptTag({ url: 'jsqr-test-only.js' });
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

// --- the case the whole pack exists for: one PC splits, the other has not ---
// Positions travel between PCs by name, so the two managers have to migrate
// before they swap codes again: while one says "Spot 1" and the other still
// calls it "Spot 1/1", the routes arrive with no position at all. That is
// what the offer warns about, and it is worth failing here on purpose so the
// warning cannot quietly stop being true.
const oldNamesB = {
  schemaVersion: 3, date: '2026-01-01', qrOnSheet: false, labels: [],
  cars: [{ id: 'bc1', reg: 'AA11111', labelId: '', note: '' }],
  positions: [
    { id: 'b1', name: 'Spot 1/1', multi: false, labelId: '', note: '' },
    { id: 'b2', name: 'Spot 1/2', multi: false, labelId: '', note: '' },
    { id: 'b3', name: 'Garage', multi: true, labelId: '', note: '' },
  ],
  routes: [], drivers: [], driverGroups: [], templates: [],
};
const pcSplit = await browser.newContext();
const one = await pcSplit.newPage();
one.on('pageerror', (e) => bErrors.push(String(e)));
await one.goto(base, { waitUntil: 'networkidle' });
await loadOldNames(one);
await one.locator('[data-act="split-rounds"]').click();
await one.click('[data-act="tab"][data-tab="data"]');
const splitCode = await copyCode(one, 'day');

const pcBehind = await browser.newContext();
const two = await pcBehind.newPage();
two.on('pageerror', (e) => bErrors.push(String(e)));
await two.goto(base, { waitUntil: 'networkidle' });
await two.evaluate((plan) => localStorage.setItem('carcoord:v1', JSON.stringify(plan)), oldNamesB);
await two.reload({ waitUntil: 'networkidle' });
await two.click('[data-act="tab"][data-tab="data"]');
await readCode(two, splitCode);
check('the PC that has not split is told the spot is one it has never heard of',
  (await two.locator('#shareDlg').innerText()).includes('1 position you do not have (Spot 1)'), await two.locator('#shareDlg').innerText());
await two.uncheck('#shareAdd');
await two.click('[data-act="share-apply"]');
check('and the list lands with the position blank on every route that used it',
  (await two.locator('#notices .notice.info').last().innerText()).includes('Left blank: Spot 1'), await two.locator('#notices').innerText());
check('which is three routes with nowhere to pack',
  (await two.evaluate(() => state.routes.filter((r) => !r.positionId).length)) === 3,
  await two.evaluate(() => JSON.stringify(state.routes.map((r) => r.positionId))));

// Now PC B takes the same offer, and the same code lands properly.
await two.reload({ waitUntil: 'networkidle' });
await two.locator('[data-act="split-rounds"]').click();
await two.click('[data-act="tab"][data-tab="data"]');
await readCode(two, splitCode);
check('once both have split, the code says nothing is missing',
  !(await two.locator('#shareDlg').innerText()).includes('do not have'), await two.locator('#shareDlg').innerText());
await two.click('[data-act="share-apply"]');
check('and every route lands on the spot this PC already had, with its round',
  (await two.evaluate(() => state.routes.map((r) => `${r.positionId}:${r.round}`).join())) === 'b1:1,b1:2,b1:4,b3:',
  await two.evaluate(() => state.routes.map((r) => `${r.positionId}:${r.round}`).join()));

await one.click('[data-act="tab"][data-tab="preview"]');
await two.click('[data-act="tab"][data-tab="preview"]');
check('so both PCs print the same sheet, reading exactly as the pillar list always did',
  (await two.locator('#sheet').innerText()) === (await one.locator('#sheet').innerText()),
  (await two.locator('#sheet').innerText()).split('\n').slice(0, 4).join(' / '));
await pcSplit.close();
await pcBehind.close();

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
// The damaged saves above left a rescue in Archives. The first table on this
// tab must still be Backups: the cards above it are rows, not tables.
check('a rescue is in Archives while the Backups table is read', await page.evaluate(() => Store.archives().some((a) => a.kind === 'rescue')));
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

// ── the rail is where the day is assembled ────────────────────────────────
//
// It used to sit on the left and only report. On a wide screen the space to
// the right of the table was empty and adding a name meant leaving the plan,
// so it moved across, widened, and became editable. Everything here is also
// doable from the Drivers and Cars tabs; this is the short way round.

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setViewportSize({ width: 1680, height: 1000 });

const railNames = (panel) =>
  page.locator(`#tab-plan [data-panel="${panel}"] .rail-name`).evaluateAll((n) => n.map((x) => x.value));

await page.fill('#railDriver', 'Ana Novak, Bo Dahl, Cato Lie');
await page.click('[data-act="add-driver"][data-from]');
await page.fill('#railCar', 'SD12345 SE67890');
await page.click('[data-act="add-car"][data-from]');
same('the rail adds drivers without leaving the plan', await railNames('drivers'),
  ['Ana Novak', 'Bo Dahl', 'Cato Lie']);
same('and the fleet too', await railNames('cars'), ['SD12345', 'SE67890']);

check('the rail sits to the right of the table', await page.evaluate(() => {
  const rail = document.querySelector('#tab-plan .rail').getBoundingClientRect();
  const table = document.querySelector('#tab-plan .grid').getBoundingClientRect();
  return rail.left >= table.right - 1;
}));
// A row that is wider than the rail puts its buttons off the edge, where they
// cannot be pressed. The rail's inner grid column used to do exactly that.
same('and nothing in it is pushed off the edge', await page.evaluate(() => {
  const rail = document.querySelector('#tab-plan .rail').getBoundingClientRect();
  return Array.from(document.querySelectorAll('#tab-plan .rail-row'))
    .filter((r) => r.scrollWidth > r.clientWidth + 1 || r.getBoundingClientRect().right > rail.right + 1)
    .map((r) => r.querySelector('.rail-name').value);
}), []);

// Carrying a name onto the route it drives.
const carry = async (from, to) => {
  await from.hover(); await page.mouse.down();
  await to.hover(); await to.hover(); await page.mouse.up();
};
const planRow = (n) => page.locator('#tab-plan tbody tr').nth(n);
await carry(page.locator('#tab-plan [data-panel="drivers"] li').first().locator('.grip'), planRow(2));
check('a driver dragged onto a route is written into it',
  (await planRow(2).locator('[data-field="driver"]').inputValue()) === 'Ana Novak',
  await planRow(2).locator('[data-field="driver"]').inputValue());
await carry(page.locator('#tab-plan [data-panel="cars"] li').first().locator('.grip'), planRow(0));
check('and a car dragged onto one is selected on it',
  (await planRow(0).locator('[data-field="carId"] option:checked').innerText()).includes('SD12345'),
  await planRow(0).locator('[data-field="carId"] option:checked').innerText());
check('the rail then says where that car went',
  (await page.locator('#tab-plan [data-panel="cars"] li').first().locator('.assign').innerText()).includes('Route 1'));

// Dragging inside the rail reorders the roster itself.
const orderWas = await railNames('drivers');
await carry(page.locator('#tab-plan [data-panel="drivers"] li').first().locator('.grip'),
            page.locator('#tab-plan [data-panel="drivers"] li').nth(2));
const orderNow = await railNames('drivers');
check('dragging a driver within the rail reorders the roster',
  JSON.stringify(orderNow) !== JSON.stringify(orderWas) && orderNow.length === 3
  && orderNow.slice().sort().join() === orderWas.slice().sort().join(),
  `${orderWas} -> ${orderNow}`);

// A tag, made and applied without opening the Labels tab.
await page.locator('#tab-plan [data-panel="cars"] li').first().locator('[data-act="tag"]').click();
check('the tag menu offers the tags that exist', (await page.locator('.tag-menu .tag-choice').count()) === 4);
await page.fill('#newTagName', 'No fuel card');
await page.click('[data-act="add-tag"]');
check('a tag made in the rail is applied to the row it was made on',
  (await page.locator('#tab-plan [data-panel="cars"] li').first().getAttribute('title')).includes('No fuel card'));
await page.click('[data-act="tab"][data-tab="labels"]');
check('and joins the labels every other list uses',
  (await page.locator('#tab-labels tbody tr [data-field="name"]').evaluateAll((n) => n.map((x) => x.value)))
    .includes('No fuel card'));
await page.click('[data-act="tab"][data-tab="plan"]');

// Drivers carry a tag of their own now, which they did not before.
await page.locator('#tab-plan [data-panel="drivers"] li').first().locator('[data-act="tag"]').click();
await page.locator('.tag-menu .tag-choice', { hasText: 'Workshop' }).click();
check('a driver can be tagged too',
  (await page.locator('#tab-plan [data-panel="drivers"] li').first().getAttribute('title')).includes('Workshop'));

await page.reload({ waitUntil: 'networkidle' });
same('none of it disappears on a reload', await railNames('drivers'), orderNow);
check('including the tags', (await page.locator('#tab-plan [data-panel="drivers"] li').first().getAttribute('title')).includes('Workshop'));

// A template says what is in it, not only what it is called.
await page.fill('#newTemplate', 'Monday');
await page.click('[data-act="save-template"]');
check('a template is closed on the shelf to begin with', (await page.locator('.tpl-body').count()) === 0);
await page.locator('[data-act="peek-template"]').first().click();
check('opening one lists the routes it would put on the plan',
  (await page.locator('.tpl-body tbody tr').count()) === 15);
check('with the driver and car each route was saved with',
  (await page.locator('.tpl-body tbody tr').nth(2).innerText()).includes('Ana Novak'),
  await page.locator('.tpl-body tbody tr').nth(2).innerText());
await page.locator('[data-act="peek-template"]').first().click();
check('and it closes again', (await page.locator('.tpl-body').count()) === 0);

// --- the tag menu is never cut off ---
// It was drawn inside its row, and the rows sit in a list that scrolls, so the
// list cut it off after its first choice: the rest was there only by
// scrolling. On a roster of two, which is where it was reported.
const cutOff = (sel) => page.locator(sel).evaluate((box) => {
  const m = box.getBoundingClientRect();
  const out = [];
  if (m.top < 0 || m.left < 0 || m.bottom > innerHeight + 0.5 || m.right > document.documentElement.clientWidth + 0.5) out.push('the screen');
  for (let el = box.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const b = el.getBoundingClientRect();
    if (m.top < b.top - 0.5 || m.bottom > b.bottom + 0.5 || m.left < b.left - 0.5 || m.right > b.right + 0.5) out.push(el.className || el.tagName);
  }
  return out;
});
const railFixture = (drivers, labels) => page.evaluate(([drivers, labels]) => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 4, date: '2026-09-24', qrOnSheet: false,
  labels: labels.map((name, i) => ({ id: `L${i}`, name, color: '#1565c0' })),
  cars: [{ id: 'c1', reg: 'AA11111', labelId: '', note: '' }], positions: [],
  routes: [{ id: 'r1', name: '1', driver: drivers[0], carId: '', positionId: '', round: '', highlight: false, gapBefore: false }],
  drivers: drivers.map((name, i) => ({ id: `d${i}`, name, available: true, labelId: '', note: '' })),
  driverGroups: [], templates: [],
})), [drivers, labels]);
const tagButton = (n) => page.locator('#tab-plan [data-panel="drivers"] li').nth(n).locator('[data-act="tag"]');

await page.setViewportSize({ width: 1600, height: 940 });
await railFixture(['jesper', 'je lo'], ['Course', 'New']);
await page.reload({ waitUntil: 'networkidle' });
await tagButton(0).click();
same('the tag menu opens whole, cut off by nothing', await cutOff('#tagMenu'), []);
check('every choice and the new-tag box are on show, not behind a scroll',
  await page.locator('#tagMenu').evaluate((m) => {
    const box = m.getBoundingClientRect();
    return [...m.querySelectorAll('.tag-choice, #newTagName, [data-act="add-tag"]')].every((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
    });
  }));
check('the keyboard is taken to it', await page.evaluate(() => document.activeElement?.classList.contains('tag-choice')));
await page.keyboard.press('ArrowDown');
check('and moves through it with the arrows', (await page.evaluate(() => document.activeElement?.textContent.trim())) === 'Course');
await page.keyboard.press('Escape');
check('Escape shuts it and hands the focus back to its button',
  await page.locator('#tagMenu').isHidden()
  && await page.evaluate(() => document.activeElement?.dataset.act === 'tag' && document.activeElement?.dataset.id === 'd0'));

// A long roster, scrolled down to its end: tagging a name near the bottom
// used to throw the list back to the top, and the row clicked out of sight.
await railFixture(Array.from({ length: 30 }, (_, i) => `Driver ${String(i + 1).padStart(2, '0')}`), ['Course']);
await page.reload({ waitUntil: 'networkidle' });
const driverList = page.locator('#tab-plan [data-panel="drivers"] .rail-list');
await driverList.evaluate((l) => { l.scrollTop = l.scrollHeight; });
const listWas = await driverList.evaluate((l) => l.scrollTop);
await tagButton(28).click();
const listNow = await page.locator('#tab-plan [data-panel="drivers"] .rail-list').evaluate((l) => l.scrollTop);
check('tagging near the bottom of a long roster leaves the list where it was', listWas > 0 && listNow === listWas, `${listWas} -> ${listNow}`);
same('and that menu is whole too', await cutOff('#tagMenu'), []);
check('beside the button it came from',
  await page.evaluate(() => {
    const b = document.querySelector('#tab-plan [data-act="tag"][data-id="d28"]').getBoundingClientRect();
    const m = document.querySelector('#tagMenu').getBoundingClientRect();
    return Math.abs(m.top - b.bottom) <= 4 || Math.abs(m.bottom - b.top) <= 4;
  }));
await page.click('#tab-plan thead');
check('a click anywhere else shuts it', await page.locator('#tagMenu').isHidden());

// Forty tags on a short screen: the choices scroll inside the menu, and the
// box for a new one stays in sight below them.
await page.setViewportSize({ width: 1280, height: 600 });
await railFixture(['jesper', 'je lo'], Array.from({ length: 40 }, (_, i) => `Tag ${i + 1}`));
await page.reload({ waitUntil: 'networkidle' });
await tagButton(0).click();
same('forty tags on a short screen still fit it', await cutOff('#tagMenu'), []);
check('with the choices scrolling inside and the new-tag box in sight',
  await page.locator('#tagMenu').evaluate((m) => {
    const c = m.querySelector('.tag-choices');
    const box = m.getBoundingClientRect(), input = m.querySelector('#newTagName').getBoundingClientRect();
    return c.scrollHeight > c.clientHeight && input.bottom <= box.bottom + 0.5 && input.top >= box.top;
  }));
await page.keyboard.press('Escape');

// The route picker lives by the same rule on a short screen.
await railFixture(Array.from({ length: 30 }, (_, i) => `Driver ${String(i + 1).padStart(2, '0')}`), []);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').click();
same('the driver grid fits a short screen rather than running off it', await cutOff('#picker'), []);
await page.keyboard.press('Escape');

// --- the week, as a row of days beside the plan ---
// All, then Monday to Sunday. A group named for a day is that day's button,
// however it was written; a group that is not a day keeps a button of its own.
same('a group is matched to its day the way people write them',
  await page.evaluate(() => ['Monday', 'mon', 'Mondays', 'Monday crew', 'Mandag', ' tirsdag ', 'Weds', 'LØRDAG', 'søndag', 'Tor', 'Weekend', 'Mon-Fri']
    .map((n) => groupWeekday(n))),
  [1, 1, 1, 1, 1, 2, 3, 6, 0, -1, -1, -1]);
await page.setViewportSize({ width: 1600, height: 940 });
await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 4, date: '2026-09-24', qrOnSheet: false, labels: [], cars: [], positions: [], routes: [],
  drivers: ['Ana', 'Bo', 'Cai', 'Dee', 'Efe'].map((name, i) => ({ id: `d${i}`, name, available: true, labelId: '', note: '' })),
  driverGroups: [
    { id: 'g1', name: 'Monday', driverIds: ['d0', 'd1'] },
    { id: 'g2', name: 'Tuesdays', driverIds: ['d2'] },
    { id: 'g3', name: 'Weekend crew', driverIds: ['d3'] },
    { id: 'g4', name: 'Mon', driverIds: ['d4'] },
  ],
  templates: [],
})));
await page.reload({ waitUntil: 'networkidle' });
const week = () => page.locator('#tab-plan .day-bar .day').evaluateAll((bs) => bs.map((b) =>
  b.textContent.trim() + (b.classList.contains('on') ? '*' : '') + (b.classList.contains('none') ? '-' : '')));
const dayBtn = (text) => page.locator('#tab-plan .day-bar .day', { hasText: text });
same('the drivers panel shows the week: All, then Monday to Sunday, the days with no crew quiet',
  await week(), ['All*', 'Mon', 'Tue', 'Wed-', 'Thu-', 'Fri-', 'Sat-', 'Sun-']);
check("today's day is marked", await page.evaluate(() =>
  document.querySelector('#tab-plan .day-bar .day.today')?.textContent.trim() === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()]));
same('a group that is not a day, or is a day twice over, keeps a button of its own',
  await page.locator('#tab-plan .rail-groups .btn').allInnerTexts(), ['Weekend crew', 'Mon']);

await dayBtn('Mon').click();
same('Mon makes exactly the Monday crew the ones in', await inToday(), ['Ana', 'Bo']);
same('and is lit, with All no longer lit', await week(), ['All', 'Mon*', 'Tue', 'Wed-', 'Thu-', 'Fri-', 'Sat-', 'Sun-']);
await dayBtn('Tue').click();
same('Tue then replaces them rather than adding to them', await inToday(), ['Cai']);
await dayBtn('All').click();
same('All puts everyone in', await inToday(), ['Ana', 'Bo', 'Cai', 'Dee', 'Efe']);

await dayBtn('Mon').click();
await dayBtn('Wed').click();
check('a day with no crew yet only asks', (await page.evaluate(() => state.driverGroups.length)) === 4
  && (await page.locator('#tab-plan .day-ask [data-act="save-day-crew"]').innerText()) === 'Save as Wednesday');
await page.click('#tab-plan .day-ask [data-act="save-day-crew"]');
check('and saving makes a Wednesday group of who is in',
  await page.evaluate(() => state.driverGroups.some((g) => g.name === 'Wednesday' && g.driverIds.join() === 'd0,d1')));
same('which is the Wed button from then on, lit because it is in force', await week(), ['All', 'Mon*', 'Tue', 'Wed*', 'Thu-', 'Fri-', 'Sat-', 'Sun-']);

await page.click('[data-act="tab"][data-tab="drivers"]');
check('the Drivers tab says which button each group is',
  (await page.locator('#tab-drivers .group', { has: page.locator('[data-field="name"][value="Monday"]') }).locator('.day-badge').innerText()) === 'Mon button'
  && (await page.locator('#tab-drivers .group', { has: page.locator('[data-field="name"][value="Mon"]') }).locator('.day-badge').innerText()) === 'Monday twice');
same('and offers the days that have no crew yet', await page.locator('#tab-drivers .day-add .btn').allInnerTexts(), ['Thu', 'Fri', 'Sat', 'Sun']);
await page.locator('#tab-drivers .day-add .btn', { hasText: 'Fri' }).click();
check('one click makes that day its group', await page.evaluate(() => state.driverGroups.some((g) => g.name === 'Friday' && g.driverIds.length === 0)));
await page.click('[data-act="tab"][data-tab="plan"]');

// --- what an independent check of the tag menu and the week found ---
same('more of the ways a day gets written are read as that day',
  await page.evaluate(() => ['Mondays.', "Monday's crew", 'Monday team', 'Monday-crew', 'Mandager', 'Søndager'].map((n) => groupWeekday(n))),
  [1, 1, 1, 1, 1, 0]);
const weekFixture = (extra = {}) => page.evaluate((extra) => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 4, date: '2026-09-24', qrOnSheet: false, labels: [], cars: [], positions: [],
  routes: Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: String(i + 1), driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore: false })),
  drivers: Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, name: `Driver ${String(i + 1).padStart(2, '0')}`, available: true, labelId: '', note: '' })),
  driverGroups: [{ id: 'g1', name: 'Monday', driverIds: ['d0', 'd1', 'd2'] }],
  templates: [], ...extra,
})), extra);
const railList = (panel) => page.locator(`#tab-plan [data-panel="${panel}"] .rail-list`);

await page.setViewportSize({ width: 1600, height: 940 });
await weekFixture({ driverGroups: [{ id: 'g1', name: 'Monday', driverIds: ['d0', 'd1'] }, { id: 'g2', name: 'Thursday', driverIds: [] }] });
await page.reload({ waitUntil: 'networkidle' });
same('an empty crew is as quiet as a missing one, and not lit', await week(), ['All*', 'Mon', 'Tue-', 'Wed-', 'Thu-', 'Fri-', 'Sat-', 'Sun-']);
await dayBtn('Thu').click();
check('pressing it asks rather than sending everyone away',
  (await page.evaluate(() => state.drivers.every((d) => d.available))) && (await page.locator('#tab-plan .day-ask [data-act="save-day-crew"]').count()) === 1);
await page.evaluate(() => { state.drivers[5].available = false; render(); });
await page.click('#tab-plan .day-ask [data-act="save-day-crew"]');
check('the offer counts who is in when it is pressed, and fills the empty crew rather than making a second',
  await page.evaluate(() => state.driverGroups.filter((g) => groupWeekday(g.name) === 4).length === 1
    && state.driverGroups.find((g) => g.id === 'g2').driverIds.length === 29));

await page.evaluate(() => { note('warn', 'A question about the data', { act: 'split-rounds', kind: '', id: '', text: 'Answer it' }); render(); });
await dayBtn('Sat').click();
check('a question about a day leaves every other question up',
  (await page.locator('#notices [data-act="split-rounds"]').count()) === 1 && (await page.locator('#tab-plan .day-ask [data-act="save-day-crew"]').count()) === 1);
await page.evaluate(() => { notices = []; render(); window.scrollTo(0, 0); });

const rowWas = await page.locator('#tab-plan .day-bar').evaluate((b) => b.getBoundingClientRect().top);
await dayBtn('Mon').click();
check('pressing a day adds no notice, so the row stays under the pointer',
  (await page.locator('#notices .notice').count()) === 0
  && Math.abs((await page.locator('#tab-plan .day-bar').evaluate((b) => b.getBoundingClientRect().top)) - rowWas) < 1);
await dayBtn('All').click();

await railList('drivers').evaluate((l) => { l.scrollTop = 400; });
await page.waitForTimeout(50);
await page.click('[data-act="tab"][data-tab="drivers"]');
await page.click('[data-act="tab"][data-tab="plan"]');
check('a trip to another tab leaves the rail lists where they were', (await railList('drivers').evaluate((l) => l.scrollTop)) === 400,
  String(await railList('drivers').evaluate((l) => l.scrollTop)));
await dayBtn('Mon').click();
check('but pressing a day shows the crew it brought in, at the top', (await railList('drivers').evaluate((l) => l.scrollTop)) === 0);

await dayBtn('Tue').focus();
await page.keyboard.press('Enter');
await page.locator('#tab-plan .day-ask [data-act="save-day-crew"]').waitFor();
check('a day with no crew pressed from the keyboard takes the focus to its question',
  await page.evaluate(() => document.activeElement?.dataset.act === 'save-day-crew'));
await dayBtn('Mon').focus();
await page.keyboard.press('Enter');
check('and a day pressed from the keyboard keeps the focus on itself',
  await page.evaluate(() => document.activeElement?.closest('.day-bar') && document.activeElement.textContent.trim() === 'Mon'));
await page.evaluate(() => { notices = []; render(); });

// The offer is in view, not under the top bar, even from the bottom of a long plan.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await dayBtn('Fri').click();
check('the question a day raises is in view, clear of the top bar',
  await page.evaluate(() => {
    const b = document.querySelector('#tab-plan .day-ask [data-act="save-day-crew"]').getBoundingClientRect();
    return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.dataset.act === 'save-day-crew';
  }));
await page.evaluate(() => { notices = []; render(); window.scrollTo(0, 0); });

// A click into a box while a tag menu is open lands in the box.
await page.locator('#tab-plan [data-panel="drivers"] li').first().locator('[data-act="tag"]').click();
await page.locator('#tab-plan [data-panel="drivers"] li').nth(1).locator('.rail-name').click();
await page.keyboard.type('X');
check('a click into a text box with a tag menu open is not lost',
  await page.locator('#tagMenu').isHidden() && (await page.locator('#tab-plan [data-panel="drivers"] li').nth(1).locator('.rail-name').inputValue()).endsWith('X'));

// Templates: each keeps its own place in its list.
await weekFixture({ templates: ['Monday', 'Friday'].map((name, t) => ({ id: `t${t}`, name, weekday: '',
  routes: Array.from({ length: 30 }, (_, i) => ({ name: String(i + 1), driver: `${name} ${i}`, carId: '', positionId: '', round: '', highlight: false, gapBefore: false })) })) });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('[data-act="peek-template"]').first().click();
await page.locator('.tpl-body').evaluate((b) => { b.scrollTop = 300; });
await page.waitForTimeout(50);
await page.locator('[data-act="peek-template"]').nth(1).click();
check('a second template opens at its own top, not where the first was left', (await page.locator('.tpl-body').evaluate((b) => b.scrollTop)) === 0);

// A group renamed into a day is badged as it is typed.
await page.click('[data-act="tab"][data-tab="drivers"]');
await page.locator('#tab-drivers .group [data-field="name"]').first().fill('Thursday');
check('renaming a group into a day changes its badge there and then',
  (await page.locator('#tab-drivers .group').first().locator('.day-badge').innerText()) === 'Thu button');
await page.click('[data-act="tab"][data-tab="plan"]');

// On a stacked screen, a tag menu whose row scrolls up under the top bar goes with it.
await page.setViewportSize({ width: 1100, height: 800 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('#tab-plan [data-panel="drivers"] li').nth(2).locator('[data-act="tag"]').click();
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(100);
check('a tag menu whose row scrolls up under the top bar shuts', await page.locator('#tagMenu').isHidden());

// A phone: the whole week on screen, and a question that can be read.
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
check('on a phone every day of the week is on screen',
  await page.locator('#tab-plan .day-bar .day').evaluateAll((bs) => bs.length === 8 && bs.every((b) => {
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= document.documentElement.clientWidth;
  })));
await dayBtn('Sat').click();
check("and a day's question reads as a sentence, not a word per line",
  (await page.locator('#tab-plan .day-ask span').first().evaluate((s) => s.getBoundingClientRect().width)) > 200);
await page.evaluate(() => { notices = []; render(); });

// --- what a second check of those fixes found ---
same('Norwegian writes the crew into the day, and has its own short forms',
  await page.evaluate(() => ['Mandagsgjeng', 'Fredagsvakta', 'Tirsdagslaget', 'Man', 'Ons', 'Lør', 'Tor'].map((n) => groupWeekday(n))),
  [1, 5, 2, 1, 3, 6, -1]);
await page.setViewportSize({ width: 1600, height: 940 });
await weekFixture({ labels: [{ id: 'L1', name: 'Course', color: '#1565c0' }],
  cars: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, reg: `EL${10000 + i}`, labelId: '', note: '' })),
  driverGroups: [{ id: 'g1', name: 'Weekend', driverIds: [] }] });
await page.reload({ waitUntil: 'networkidle' });

await page.locator('#tab-plan [data-panel="drivers"] li').nth(3).locator('[data-act="tag"]').click();
await page.click('#newTagName');
await page.keyboard.type('Nights');
await page.keyboard.press('Enter');
check('Enter in the new-tag box adds the tag and the menu stays shut, with the focus back on its button',
  await page.locator('#tagMenu').isHidden()
  && await page.evaluate(() => document.activeElement?.dataset.act === 'tag' && state.drivers[3].labelId === state.labels.find((l) => l.name === 'Nights')?.id));

await page.locator('#tab-plan .rail-groups .btn', { hasText: 'Weekend' }).click();
check('an empty group under the week sends nobody away, and says why',
  await page.evaluate(() => state.drivers.every((d) => d.available))
  && (await page.locator('#tab-plan .day-ask').innerText()).includes('Weekend has nobody in it yet'));

// (The tag just made raised a notice of its own; clear it, so what follows
// counts only what setting up the week adds.)
await page.evaluate(() => { notices = []; render(); });
await dayBtn('Tue').click();
await page.click('#tab-plan .day-ask [data-act="save-day-crew"]');
await dayBtn('Wed').click();
await page.evaluate(() => { state.drivers.slice(10).forEach((d) => { d.available = false; }); render(); });
check('the question counts who is in as it stands', (await page.locator('#tab-plan .day-ask').innerText()).includes('Save the 10 in now'));
await page.click('#tab-plan .day-ask [data-act="save-day-crew"]');
check('setting up the week from the row piles nothing up above the plan: one line, the latest answer',
  (await page.locator('#notices .notice').count()) === 0 && (await page.locator('#tab-plan .day-ask').count()) === 1
  && (await page.locator('#tab-plan .day-ask').innerText()).startsWith("Saved: Wednesday's crew is the 10"));
await page.click('#tab-plan .day-ask [data-act="day-ask-close"]');

// A list emptied and filled again starts at its top, not at a place the old
// list had been scrolled to.
await railList('cars').evaluate((l) => { l.scrollTop = l.scrollHeight; });
await page.waitForTimeout(50);
await page.evaluate(() => { state.cars = []; render(); state.cars = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, reg: `ZZ${100 + i}`, labelId: '', note: '' })); render(); });
check('a list emptied and filled again opens at its top', (await railList('cars').evaluate((l) => l.scrollTop)) === 0);

// Notices keep their offer and their ✕ together at any width.
await page.setViewportSize({ width: 560, height: 900 });
await page.evaluate(() => { note('warn', 'A question with a long sentence that has to wrap onto more than one line at this width, the way the spot-names question does', { act: 'split-rounds', kind: '', id: '', text: 'Split the rounds out' }); render(); });
check("a notice's offer and its ✕ stay side by side",
  await page.locator('#notices .notice').last().evaluate((n) => {
    const o = n.querySelector('[data-act="split-rounds"]').getBoundingClientRect(), x = n.querySelector('[data-act="dismiss"]').getBoundingClientRect();
    return Math.abs(o.top - x.top) < 2 && x.left > o.right;
  }));
await page.evaluate(() => { notices = []; render(); });

// Phone.
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
const tueAt = await dayBtn('Tue').evaluate((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await dayBtn('Thu').click();
check('on a phone a quiet day asks under the week, and nothing moves under the next tap',
  await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent.trim() === 'Tue', tueAt));
await page.click('#tab-plan .day-ask [data-act="day-ask-close"]');

const tableBox = page.locator('#tab-plan .plan-table');
await tableBox.evaluate((b) => { b.scrollLeft = 300; });
await page.waitForTimeout(50);
await page.evaluate(() => { state.routes[0].highlight = !state.routes[0].highlight; render(); });
check('on a phone the route table keeps its sideways place across a redraw', (await tableBox.evaluate((b) => b.scrollLeft)) === 300,
  String(await tableBox.evaluate((b) => b.scrollLeft)));

const tagAt = await page.locator('#tab-plan [data-panel="drivers"] li').first().locator('[data-act="tag"]').evaluate((b) => b.getBoundingClientRect().top + scrollY);
await page.evaluate((y) => window.scrollTo(0, y - 60), tagAt);
await page.locator('#tab-plan [data-panel="drivers"] li').first().locator('[data-act="tag"]').evaluate((b) => b.focus({ preventScroll: true }));
await page.keyboard.press('Enter');
check('a tag button reached under the top bar still opens its menu, in sight', await page.locator('#tagMenu').isVisible() && (await cutOff('#tagMenu')).length === 0);
await page.click('#newTagName');
await page.keyboard.type('Half');
await page.setViewportSize({ width: 390, height: 520 });
await page.waitForTimeout(100);
check("a phone's keyboard shortening the screen keeps the menu, what was typed, and the box on screen",
  await page.locator('#tagMenu').isVisible() && (await page.locator('#newTagName').inputValue()) === 'Half'
  && await page.locator('#newTagName').evaluate((i) => { const r = i.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1600, height: 940 });

// The second press of a delete can be made from the keyboard.
const carsBefore = await page.evaluate(() => state.cars.length);
await page.locator('#tab-plan [data-panel="cars"] li').first().locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
check('a delete confirmed from the keyboard deletes', (await page.evaluate(() => state.cars.length)) === carsBefore - 1);

// --- and what a third check found ---
await weekFixture({ driverGroups: [{ id: 'g1', name: 'Weekend', driverIds: [] }] });
await page.reload({ waitUntil: 'networkidle' });
await dayBtn('Wed').click();
await page.evaluate(() => { state.driverGroups.push({ id: 'gw', name: 'Wednesday', driverIds: ['d3', 'd4'] }); render(); });
check('a question overtaken on the Drivers tab turns into the answer, with no Save left in it',
  (await page.locator('#tab-plan .day-ask').innerText()).includes('Wednesday has a crew now')
  && (await page.locator('#tab-plan .day-ask [data-act="save-day-crew"]').count()) === 0);
await page.locator('#tab-plan .rail-groups .btn', { hasText: 'Weekend' }).click();
await page.evaluate(() => { state.driverGroups.find((g) => g.id === 'g1').driverIds.push('d5'); render(); });
check('and a line about an empty crew goes once names are ticked into it', (await page.locator('#tab-plan .day-ask').count()) === 0);

await page.evaluate(() => window.scrollTo(0, 800));
await page.evaluate(() => document.querySelector('.tabs button').focus());
check('focus in the top bar does not move the page', (await page.evaluate(() => scrollY)) === 800);
await page.evaluate(() => window.scrollTo(0, 0));

await page.click('[data-act="tab"][data-tab="drivers"]');
const rosterWas = await page.evaluate(() => state.drivers.length);
await page.fill('#newDriver', 'Enter Kari');
await page.press('#newDriver', 'Enter');
check('Enter in the Drivers tab box adds to the roster', (await page.evaluate(() => state.drivers.length)) === rosterWas + 1);
await page.locator('#tab-drivers tbody tr').first().locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
check('a delete confirmed from the keyboard works on the Drivers tab too', (await page.evaluate(() => state.drivers.length)) === rosterWas);
await page.locator('#tab-drivers tbody tr').first().locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await page.focus('#newDriver');
await page.keyboard.type('A');
await page.waitForTimeout(3300);
await page.keyboard.type('B');
check('the disarm three seconds later leaves the focus, and the typing, where they were', (await page.inputValue('#newDriver')) === 'AB');
await page.click('[data-act="tab"][data-tab="plan"]');

// --- and a fourth ---
await page.setViewportSize({ width: 1600, height: 940 });
await weekFixture();
await page.reload({ waitUntil: 'networkidle' });
const planRowN = (n) => page.locator('#tab-plan tbody tr').nth(n);

await planRowN(0).locator('[data-act="del"]').click();
check('a delete armed with the mouse does not keep the focus on it', await page.evaluate(() => !document.activeElement?.classList.contains('armed')));
await page.evaluate(() => { armed = null; render(); });

await planRowN(0).locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await planRowN(1).locator('[data-act="toggle"][data-field="gapBefore"]').focus();
await page.waitForTimeout(3300);
check('the disarm puts the focus back on the very button it was on, not its neighbour',
  await page.evaluate(() => document.activeElement?.dataset.field === 'gapBefore' && document.activeElement?.closest('tr')?.dataset.route === 'r1'));

await planRowN(0).locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await planRowN(1).locator('[data-field="name"]').evaluate((i) => { i.focus(); i.select(); });
await page.waitForTimeout(3300);
await page.keyboard.type('7');
check('and keeps the whole selection, so typing replaces rather than adds', (await page.evaluate(() => state.routes[1].name)) === '7',
  await page.evaluate(() => state.routes[1].name));

const dayWas = await page.evaluate(() => state.routes[1].name);
await page.locator('[data-act="clear-day"]').focus();
await page.keyboard.down('Enter');
await page.keyboard.down('Enter');
await page.keyboard.up('Enter');
check('holding Enter on Clear does not confirm it by repeat', (await page.evaluate(() => state.routes[1].name)) === dayWas);
await page.evaluate(() => { armed = null; render(); });

await page.setViewportSize({ width: 390, height: 844 });
const boxAt = await planRowN(20).locator('[data-act="del"]').evaluate((b) => b.getBoundingClientRect().top + scrollY);
await page.evaluate((y) => window.scrollTo(0, y - 60), boxAt);
await planRowN(21).locator('[data-field="name"]').evaluate((i) => i.focus({ preventScroll: true }));
await page.keyboard.press('Shift+Tab');
await page.waitForTimeout(100);
check('Shift+Tab onto something under the top bar scrolls it clear of the bar',
  await planRowN(20).locator('[data-act="del"]').evaluate((b) => document.activeElement === b
    && b.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom));

// But not for the mouse, and not for the app putting the focus back: a press
// on a button half under the bar lands, and a disarm leaves the page where the
// user scrolled it.
await page.setViewportSize({ width: 1600, height: 940 });
const markAt = await planRowN(12).locator('[data-act="toggle"][data-field="highlight"]').evaluate((b) => b.getBoundingClientRect().top + scrollY);
await page.evaluate((y) => window.scrollTo(0, y - 55), markAt);
const markBox = await planRowN(12).locator('[data-act="toggle"][data-field="highlight"]').evaluate((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.bottom - 4]; });
await page.mouse.move(markBox[0], markBox[1]);
await page.mouse.down();
await page.waitForTimeout(100);
await page.mouse.up();
check('a mouse press on a button half under the top bar lands', await page.evaluate(() => state.routes[12].highlight === true));
await page.evaluate(() => window.scrollTo(0, 0));
await planRowN(3).locator('[data-act="del"]').focus();
await page.keyboard.press('Enter');
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(3300);
check('a disarm leaves the page where the user scrolled it', (await page.evaluate(() => scrollY)) === 900, String(await page.evaluate(() => scrollY)));
// Even with the focus in the Date box, which Chromium scrolls to whatever it is told.
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('[data-act="clear-day"]').click();
await page.click('#date');
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(3300);
check('a disarm leaves the page where it is with the focus in the Date box too', (await page.evaluate(() => scrollY)) === 900, String(await page.evaluate(() => scrollY)));
// Escape from the route picker hands the focus back to a box scrolled under
// the top bar meanwhile: it comes out from under the bar.
await page.evaluate(() => window.scrollTo(0, 0));
const drvAt = await planRowN(12).locator('[data-field="driver"]').evaluate((i) => i.getBoundingClientRect().top + scrollY);
await page.evaluate((y) => window.scrollTo(0, y - 150), drvAt);
await planRowN(12).locator('[data-field="driver"]').click();
await page.keyboard.press('ArrowDown');
await page.evaluate((y) => window.scrollTo(0, y - 30), drvAt);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
check('Escape from the picker brings its box out from under the top bar',
  await planRowN(12).locator('[data-field="driver"]').evaluate((i) => document.activeElement === i
    && i.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom));
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 390, height: 844 });

await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('#tab-plan [data-panel="drivers"] li').nth(7).locator('[data-act="tag"]').click();
await page.click('#newTagName');
await page.keyboard.type('Flat');
await page.setViewportSize({ width: 390, height: 450 });
await page.waitForTimeout(150);
check('a window shortened under a menu opened low in the list keeps it, its words, and its box in view',
  await page.locator('#tagMenu').isVisible() && (await page.locator('#newTagName').inputValue()) === 'Flat'
  && await page.locator('#newTagName').evaluate((i) => { const r = i.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1600, height: 940 });

await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

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

// --- a share code is written by people, so nothing in it is taken on trust ---
// These are payloads no honest build produces: a row truncated to nothing by a
// chat client, a colour typed by someone curious, a date that is a sentence.
// All three used to reach code that assumed otherwise.
const rawCode = (payload) => 'CC1U.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
const pcHostile = await browser.newContext();
const h = await pcHostile.newPage();
const hErrors = [];
h.on('console', (m) => m.type() === 'error' && hErrors.push(m.text()));
h.on('pageerror', (e) => hErrors.push(String(e)));
await h.goto(base, { waitUntil: 'networkidle' });
await h.click('[data-act="tab"][data-tab="data"]');

// A row that is not a row. Before this it threw out of the click that pasted
// it: no dialog, no message, nothing to tell the leader what went wrong.
await readCode(h, rawCode({ v: 1, d: '2026-09-18', r: [['1', 'Ana', '', '', 0, ''], null] }));
await h.waitForSelector('#notices .notice.warn');
check('a code with a row missing is reported, not thrown',
  (await h.locator('#notices .notice.warn').last().innerText()).includes('damaged')
  && !(await h.locator('#shareDlg[open]').count()));

// A label colour goes into a style attribute, and esc() has no reason to
// escape a semicolon: unchecked, this is CSS on someone else's screen.
const hostile = 'red;position:fixed;inset:0;z-index:99';
await readCode(h, rawCode({
  v: 1, d: '2026-09-18', r: [], m: [],
  l: [['Workshop', hostile]], c: [['AA11111', 'Workshop', '']], p: [], dr: [], dg: [],
}));
await h.waitForSelector('#shareDlg[open]');
await h.check('#shareDlg input[value="all"]');
await h.click('[data-act="share-apply"]');
await h.click('[data-act="tab"][data-tab="cars"]');
const styles = await h.evaluate(() =>
  [...document.querySelectorAll('[style*="--c"]')].map((el) => el.getAttribute('style')));
check('a colour out of a share code cannot smuggle CSS into the page',
  styles.length > 0 && styles.every((s) => /^--c:#[0-9a-f]{6}$/i.test(s.trim().replace(/;$/, ''))),
  styles.slice(0, 4).join(' | '));
check('and nothing it sent is laid over the page',
  (await h.evaluate(() => [...document.querySelectorAll('*')].every((el) => getComputedStyle(el).position !== 'fixed'))));

// A date that is not a date printed as "//" across the top of the sheet.
const dateBefore = await h.evaluate(() => state.date);
await h.click('[data-act="tab"][data-tab="data"]');
await readCode(h, rawCode({ v: 1, d: 'the day after tomorrow', r: [['1', 'Ana', '', '', 0, '']] }));
await h.waitForSelector('#shareDlg[open]');
await h.click('[data-act="share-apply"]');
check('a date that is not a date leaves the day on screen alone',
  (await h.evaluate(() => state.date)) === dateBefore, await h.evaluate(() => state.date));
check('no console errors on the hostile-code PC', hErrors.length === 0, hErrors.join(' | '));
await pcHostile.close();

// --- the backup promise, when the browser has no room left ---
// Every destructive action in the app says "a backup is taken first". A
// snapshot that cannot be written has to say so: trimming the list and
// walking away leaves that sentence a lie with nothing on screen to correct it.
const pcFull = await browser.newContext();
const f = await pcFull.newPage();
const fErrors = [];
// Saving to a full localStorage logs on purpose; everything else is a failure.
f.on('console', (m) => m.type() === 'error' && !m.text().includes('localStorage save failed') && fErrors.push(m.text()));
f.on('pageerror', (e) => fErrors.push(String(e)));
await f.goto(base, { waitUntil: 'networkidle' });
const quota = await f.evaluate(() => {
  localStorage.removeItem('carcoord:backups');
  let chunks = 0;
  try { for (; chunks < 2000; chunks++) localStorage.setItem(`fill:${chunks}`, 'x'.repeat(64 * 1024)); } catch { /* full */ }
  // The last 64KB, a kilobyte at a time, so not even one small backup fits.
  try { for (let i = 0; i < 4000; i++) localStorage.setItem(`grain:${i}`, 'x'.repeat(1024)); } catch { /* full */ }
  Store.snapshot(state, 'Will not fit');
  return { chunks, stored: Store.backups().length, said: Store.takeNotices().map((n) => n.text).join(' ') };
});
check('the test really did fill this browser up', quota.chunks > 0 && quota.chunks < 2000, `${quota.chunks} chunks`);
check('a backup that cannot fit says so rather than failing in silence',
  quota.stored === 0 && /storage is full/.test(quota.said), JSON.stringify(quota).slice(0, 240));

// --- one unreadable backup must not take every render down with it ---
await f.evaluate(() => {
  localStorage.clear();
  const t = new Date().toISOString();
  localStorage.setItem('carcoord:backups', JSON.stringify([
    { t, label: 'Half written', json: '{"routes":[' },
    { t, label: 'Whole', json: JSON.stringify({ schemaVersion: 3, date: '2026-09-18', labels: [], cars: [], positions: [], routes: [{ id: 'r1', name: '7' }] }) },
  ]));
});
await f.reload({ waitUntil: 'networkidle' });
await f.click('[data-act="tab"][data-tab="data"]');
// A third row joins them: the start-of-day snapshot this very load took.
const rowsF = f.locator('#tab-data .card:last-child tbody tr');
const halfRow = rowsF.filter({ hasText: 'Half written' });
const wholeRow = rowsF.filter({ hasText: 'Whole' });
check('a half-written backup is listed as unreadable, not crashed on',
  (await rowsF.count()) === 3 && (await halfRow.innerText()).includes('Unreadable'),
  `${await rowsF.count()} rows`);
check('and it has no Restore button to press', (await halfRow.locator('[data-act="restore"]').count()) === 0);
check('while the good one beside it still restores',
  (await wholeRow.locator('[data-act="restore"]').count()) === 1);
await wholeRow.locator('[data-act="restore"]').click();
await wholeRow.locator('[data-act="restore"]').click();
await f.click('[data-act="tab"][data-tab="plan"]');
check('and restoring it works', (await f.locator('#tab-plan tbody tr').count()) === 1);
check('no crash when a backup is only half there', fErrors.length === 0, fErrors.join(' | '));
await pcFull.close();

// --- the grid a route's driver and car are picked from ---
// Typed in out of order on purpose, and more than a dozen of them: what is
// under test is the alphabet, and how many can be seen at once. No Æ Ø Å here —
// where those sort depends on the PC's language, which is the point of them.
const pickNames = ['Zara Moe', 'Bo Lind', 'Hana Sol', 'Ana Ruiz', 'Ida Ngo', 'Cai Mensah', 'Efe Yilmaz',
  'Dee Okafor', 'Gus Hald', 'Fia Berg', 'Jon Kvam', 'Kai Lund', 'Liv Dahl'];
await page.evaluate((names) => localStorage.setItem('carcoord:v1', JSON.stringify({
  schemaVersion: 4, date: '2026-09-23', qrOnSheet: false,
  labels: [{ id: 'L1', name: 'Workshop', color: '#c62828' }],
  cars: [['c1', 'EL10002'], ['c2', 'AB12345'], ['c3', 'CD55555'], ['c4', 'AA11111']]
    .map(([id, reg]) => ({ id, reg, labelId: id === 'c3' ? 'L1' : '', note: '' })),
  positions: [{ id: 'p1', name: 'Spot 1', multi: false, labelId: '', note: '' }],
  routes: [
    { id: 'r1', name: '1', driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore: false },
    { id: 'r2', name: '2', driver: 'Bo Lind', carId: 'c4', positionId: '', round: '', highlight: false, gapBefore: false },
  ],
  drivers: names.map((name, i) => ({ id: `d${i}`, name, available: name !== 'Gus Hald', labelId: '', note: '' })),
  driverGroups: [], templates: [],
})), pickNames);
await page.reload({ waitUntil: 'networkidle' });
const pickRow = page.locator('#tab-plan tbody tr').first();
const picker = page.locator('#picker');
const shown = () => picker.locator('.pick-name').allInnerTexts();

await pickRow.locator('[data-field="driver"]').click();
same("clicking a route's driver opens the whole roster, A to Z", await shown(), [...pickNames].sort());
const inView = await picker.locator('.picker-grid').evaluate((g) => {
  const box = g.getBoundingClientRect();
  const seen = [...g.querySelectorAll('.pick')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
  });
  return { across: getComputedStyle(g).gridTemplateColumns.split(' ').length, seen: seen.length };
});
check('four across, with at least a dozen in view before any scrolling', inView.across === 4 && inView.seen >= 12, JSON.stringify(inView));
check('each name says where it stands: out on another route, or away',
  (await picker.locator('.pick', { hasText: 'Bo Lind' }).innerText()).includes('Route 2')
  && (await picker.locator('.pick', { hasText: 'Gus Hald' }).innerText()).includes('Away'));

await pickRow.locator('[data-field="driver"]').pressSequentially('li');
same('typing narrows it', await shown(), ['Bo Lind', 'Liv Dahl']);
await picker.locator('.pick', { hasText: 'Liv Dahl' }).click();
check('picking a name writes it on the route and closes the grid',
  (await pickRow.locator('[data-field="driver"]').inputValue()) === 'Liv Dahl' && await picker.isHidden());
await pickRow.locator('[data-field="driver"]').fill('Somebody New');
check('a name nobody on the roster has is kept as typed, with no grid in the way',
  (await pickRow.locator('[data-field="driver"]').inputValue()) === 'Somebody New' && await picker.isHidden());

await pickRow.locator('[data-field="driver"]').fill('');
await pickRow.locator('[data-field="driver"]').press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
check('the keyboard does it too: down into the grid, across, Enter — and back in the box',
  (await pickRow.locator('[data-field="driver"]').inputValue()) === 'Bo Lind'
  && await page.evaluate(() => document.activeElement?.dataset.field === 'driver'),
  await pickRow.locator('[data-field="driver"]').inputValue());

await pickRow.locator('[data-field="carId"]').click();
same('the cars open as the same grid, A to Z', await shown(), ['AA11111', 'AB12345', 'CD55555', 'EL10002']);
check('and say which is out and which is marked',
  (await picker.locator('.pick', { hasText: 'AA11111' }).innerText()).includes('Route 2')
  && (await picker.locator('.pick', { hasText: 'CD55555' }).innerText()).includes('Workshop'));
same('the dropdown underneath is in the same order, for the arrow keys',
  await pickRow.locator('[data-field="carId"] option').allInnerTexts(),
  ['-', 'AA11111 · on route 2', 'AB12345', 'CD55555 · Workshop', 'EL10002']);
await picker.locator('.pick', { hasText: 'AB12345' }).click();
check('picking a car puts it on the route', (await pickRow.locator('[data-field="carId"]').inputValue()) === 'c2' && await picker.isHidden());
await pickRow.locator('[data-field="carId"]').click();
await picker.locator('[data-pick=""]').click();
check('and No car takes it off again', (await pickRow.locator('[data-field="carId"]').inputValue()) === '');
await pickRow.locator('[data-field="carId"]').click();
await page.keyboard.press('Escape');
check('Escape closes the grid', await picker.isHidden());
await pickRow.locator('[data-field="carId"]').click();
await page.click('#tab-plan thead');
check('and so does a click anywhere else', await picker.isHidden());

// --- the save file is never written over unread ---
// The save file's handle lives in IndexedDB, which cannot hold a stand-in with
// methods, so each case puts one straight onto Store.file: the state init()
// leaves after a restart, a handle whose permission is back to "prompt". What
// decides the answer is what the page started from, and whether the "check the
// file first" marker survived, which the reloads before each case set up.
const devPlan = await readFile(new URL('./fixtures/dev-data.json', import.meta.url), 'utf8');
const pcFile = await browser.newContext();
const fp = await pcFile.newPage();
const fpErrors = [];
fp.on('console', (m) => m.type() === 'error' && fpErrors.push(m.text()));
fp.on('pageerror', (e) => fpErrors.push(String(e)));
const linkStandIn = (pg, text, opts = {}) => pg.evaluate(([text, opts]) => {
  const disk = window.__disk = { text, writes: 0, throwRead: !!opts.throwRead, lastModified: Date.parse('2026-09-27T15:00:00') };
  if (typeof window.showSaveFilePicker !== 'function') window.showSaveFilePicker = async () => { throw new Error('not in this test'); };
  let perm = opts.perm || 'prompt';
  Store.file.handle = {
    name: 'car-coordinator.json',
    queryPermission: async () => perm,
    requestPermission: async () => (perm = 'granted'),
    getFile: async () => {
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (disk.throwRead) throw new DOMException('offline placeholder', 'NotReadableError');
      return new File([disk.text], 'car-coordinator.json', { lastModified: disk.lastModified });
    },
    createWritable: async () => {
      let out = '';
      return { write: async (t) => { out += t; }, close: async () => { disk.text = out; disk.writes++; }, abort: async () => {} };
    },
  };
  Store.file.name = 'car-coordinator.json';
  Store.file.permission = perm;
  Store.file.hold = null;
  render();
}, [text, opts]);
const onData = (pg) => pg.evaluate(() => { tab = 'data'; render(); });
const reconnect = async (pg) => {
  await onData(pg);
  await pg.click('[data-act="reconnect-file"]');
  await pg.waitForFunction(() => Store.file.permission === 'granted');
};
const disk = (pg) => pg.evaluate(() => ({ ...window.__disk, backups: Store.backups(), hold: Store.file.hold && Store.file.hold.kind,
  marker: localStorage.getItem('carcoord:pref:fileNeedsCheck') }));
const settle = (pg) => pg.evaluate(async () => { save(); await Store.flush(); });
const fresh = async (pg) => { await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' }); };

// 1. A browser with nothing of its own: the file is the only copy.
await fp.goto(base, { waitUntil: 'networkidle' });
await linkStandIn(fp, devPlan);
await reconnect(fp);
check('Reconnect on an empty browser asks instead of writing',
  (await fp.locator('[data-act="file-keep-file"]').isVisible()) && (await disk(fp)).writes === 0);
const ask = await fp.locator('#tab-data .card').first().innerText();
check('and says what the file and the screen each hold', ask.includes('17 cars') && ask.includes('0 cars'), ask.replace(/\s+/g, ' '));
await fp.evaluate(() => { state.routes[0].driver = 'Typed while asking'; });
await settle(fp);
check('nothing reaches the file while the question is up', (await disk(fp)).writes === 0);
await fp.click('[data-act="file-keep-file"]');
const loaded = await disk(fp);
check('Load the file brings its plan back', await fp.evaluate(() => state.cars.length === 17 && state.routes[0].driver === 'Anders'));
check('and leaves the file exactly as it was', loaded.text === devPlan && loaded.writes === 0);
const screenCopy = loaded.backups.find((b) => b.label === 'Before loading the save file');
check('and what was on screen went into Backups first', screenCopy && JSON.parse(screenCopy.json).routes[0].driver === 'Typed while asking',
  loaded.backups.map((b) => b.label).join(' | '));
check('and the file counts as checked from then on', loaded.marker === null && loaded.hold === null);

// 2. The loss the first version of this fix let through: typing after an
// unreadable save, then a reload, used to count as a plan of this browser's own.
await fp.evaluate(() => localStorage.setItem('carcoord:v1', '{not json at all'));
await fp.reload({ waitUntil: 'networkidle' });
await fp.evaluate(() => { state.routes[0].driver = 'Typed after the warning'; save(); });
await fp.reload({ waitUntil: 'networkidle' });
check('a plan typed after an unreadable save still reads as usable on reload', await fp.evaluate(() => Store.hasUsableLocalData()));
await linkStandIn(fp, devPlan);
await reconnect(fp);
check('but Reconnect still asks, one reload later', (await fp.locator('[data-act="file-keep-screen"]').isVisible()) && (await disk(fp)).writes === 0);
await fp.click('[data-act="file-keep-screen"]');
const written = await disk(fp);
check('Write this screen puts the screen in the file', written.writes === 1 && JSON.parse(written.text).routes[0].driver === 'Typed after the warning');
const overwritten = written.backups.find((b) => b.label === 'The save file, before it was written over');
check('and what the file held went into Backups first', overwritten && JSON.parse(overwritten.json).routes[0].driver === 'Anders',
  written.backups.map((b) => b.label).join(' | '));

// 3. A file that cannot be read is held, not treated as empty.
await fresh(fp);
await linkStandIn(fp, devPlan, { throwRead: true });
await reconnect(fp);
const unread = await disk(fp);
check('a file that cannot be read is held, not written over', unread.hold === 'unreadable' && unread.writes === 0,
  (await fp.locator('#tab-data .card').first().innerText()).replace(/\s+/g, ' '));
await fp.evaluate(() => { window.__disk.throwRead = false; });
await fp.click('[data-act="reconnect-file"]');
await fp.waitForFunction(() => Store.file.hold && Store.file.hold.kind === 'differs', null, { timeout: 3000 }).catch(() => {});
check('and Try again reads it and asks', (await disk(fp)).hold === 'differs' && (await disk(fp)).writes === 0);
await fp.click('[data-act="unlink-file"]');
const unlinked = await disk(fp);
check('Stop using this file lets it go with nothing written', unlinked.writes === 0 && unlinked.hold === null && unlinked.marker === null
  && await fp.evaluate(() => Store.file.handle === null));

// 4. Something that is not a plan (a half-synced copy) is held too, and only
// two deliberate clicks write over it.
await fresh(fp);
await linkStandIn(fp, devPlan.slice(0, -200));
await reconnect(fp);
check('a file that is not a plan is held', (await disk(fp)).hold === 'notPlan' && (await disk(fp)).writes === 0);
await fp.click('[data-act="file-overwrite"]');
check('one click on Write this screen over it writes nothing', (await disk(fp)).writes === 0);
await fp.click('[data-act="file-overwrite"]');
check('the second one does', (await disk(fp)).writes === 1 && (await disk(fp)).hold === null);

// 5. No copy in Backups, no overwrite.
await fresh(fp);
await linkStandIn(fp, devPlan);
await reconnect(fp);
await fp.evaluate(() => {
  const real = Storage.prototype.setItem;
  window.__realSetItem = real;
  Storage.prototype.setItem = function (k, v) { if (k === 'carcoord:backups') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
});
await fp.click('[data-act="file-keep-screen"]');
const full = await disk(fp);
await fp.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
check('with Backups full, Write this screen writes nothing and keeps asking', full.writes === 0 && full.hold === 'differs');
check('and says why', (await fp.locator('#notices').innerText()).includes('storage is full'));

// 6. A file that already holds the plan on screen is left alone, even when
// every id in it is different (another PC, or a fresh start, mints its own).
await fresh(fp);
await fp.evaluate((text) => { state = Store.parseImport(text, defaults).state; render(); }, devPlan);
const renamed = devPlan.replace(/"((?:lbl|pos|car|drv|grp|rt|tpl)-[a-z0-9]+)"/g, '"x-$1"');
await linkStandIn(fp, renamed);
await reconnect(fp);
const alike = await disk(fp);
check('a file holding the same plan under other ids: no question, no write', alike.hold === null && alike.writes === 0 && alike.marker === null);

// 7. An edit queued just before Reconnect cannot reach the file while it is read.
await fresh(fp);
await linkStandIn(fp, devPlan, { delay: 1200 });
await onData(fp);
await fp.evaluate(() => { state.routes[0].driver = 'Queued before Reconnect'; save(); });
await fp.click('[data-act="reconnect-file"]');
await fp.waitForFunction(() => Store.file.permission === 'granted', null, { timeout: 5000 });
await fp.waitForTimeout(200);
const queued = await disk(fp);
check('a write queued just before Reconnect does not slip in while the file is read', queued.writes === 0 && queued.hold === 'differs');

// 8. Start-up recovery reads the same three ways.
await fresh(fp);
await linkStandIn(fp, devPlan, { perm: 'granted' });
const rec = await fp.evaluate(async () => { const s = await Store.recoverFromFile(defaults); return { cars: s && s.cars.length, marker: localStorage.getItem('carcoord:pref:fileNeedsCheck') }; });
check('recovery at start-up reads the plan back and counts the file as checked', rec.cars === 17 && rec.marker === null);
await fresh(fp);
await linkStandIn(fp, devPlan.slice(0, -200), { perm: 'granted' });
check('recovery from a file that is not a plan holds it', await fp.evaluate(async () => (await Store.recoverFromFile(defaults)) === null && Store.file.hold.kind === 'notPlan'));
await settle(fp);
check('and the first save does not reach it', (await disk(fp)).writes === 0);

// 9. A plan recovered from the file descends from it: edits made since are
// written without asking, as they always were.
await fresh(fp);
await linkStandIn(fp, devPlan, { perm: 'granted' });
await fp.evaluate(async () => { state = await Store.recoverFromFile(defaults); state.routes[0].driver = 'Edited after recovery'; Store.file.permission = 'prompt'; save(); render(); });
await reconnect(fp);
await settle(fp);
const recovered = await disk(fp);
check('a plan recovered from the file and then edited reconnects without asking',
  recovered.hold === null && recovered.writes >= 1 && JSON.parse(recovered.text).routes[0].driver === 'Edited after recovery');

// 10. At start-up, a plan of this browser's own but a file never checked
// against it, with the file already writable: checked before the first save.
await fp.evaluate((text) => {
  const s = Store.parseImport(text, defaults).state;
  s.routes[0].driver = 'Saved since the loss';
  localStorage.setItem('carcoord:v1', JSON.stringify(s));
  localStorage.setItem('carcoord:pref:fileNeedsCheck', '1');
}, devPlan);
await fp.reload({ waitUntil: 'networkidle' });
await linkStandIn(fp, devPlan, { perm: 'granted' });
await fp.evaluate(() => Store.checkFileAtStart(state, defaults));
await settle(fp);
const atStart = await disk(fp);
check('an unchecked file writable at start-up is checked before the first save', atStart.hold === 'differs' && atStart.writes === 0);

// 11. Try again reads the file with the permission already granted: an edit
// typed during that read must still not reach the file.
await fresh(fp);
await linkStandIn(fp, devPlan, { throwRead: true });
await reconnect(fp);
await fp.evaluate(() => { window.__disk.throwRead = false; });
await fp.evaluate(() => {   // a slow read from here on, like an online-only OneDrive file
  const h = Store.file.handle, get = h.getFile;
  h.getFile = async () => { await new Promise((r) => setTimeout(r, 1500)); return get(); };
});
await fp.click('[data-act="reconnect-file"]');
await fp.evaluate(() => { state.routes[0].driver = 'Typed during Try again'; save(); });
await fp.waitForTimeout(1100);
check('an edit typed while Try again reads the file does not reach it', (await disk(fp)).writes === 0);
await fp.waitForFunction(() => Store.file.hold && Store.file.hold.kind === 'differs', null, { timeout: 4000 }).catch(() => {});
check('and the question still comes', (await disk(fp)).hold === 'differs' && (await disk(fp)).writes === 0);

// 12. The same during start-up recovery, which reads the file too.
await fresh(fp);
await linkStandIn(fp, devPlan, { perm: 'granted', delay: 1500 });
await fp.evaluate(() => { window.__recovering = Store.recoverFromFile(defaults); state.routes[0].driver = 'Typed during recovery'; save(); });
await fp.waitForTimeout(1100);
check('an edit typed while start-up recovery reads the file does not reach it', (await disk(fp)).writes === 0);
check('and recovery still brings the plan back', await fp.evaluate(async () => (await window.__recovering).cars.length === 17));

// 13. A hold raised at start-up is said on the day plan, not only on the Data tab.
await fp.evaluate((text) => {
  const s = Store.parseImport(text, defaults).state;
  s.routes[0].driver = 'Saved since the loss';
  localStorage.setItem('carcoord:v1', JSON.stringify(s));
  localStorage.setItem('carcoord:pref:fileNeedsCheck', '1');
}, devPlan);
await fp.reload({ waitUntil: 'networkidle' });
await linkStandIn(fp, devPlan, { perm: 'granted' });
await fp.evaluate(async () => { tab = 'plan'; await Store.checkFileAtStart(state, defaults); noteFileHold(); render(); });
const v1BeforeOffer = await fp.evaluate(() => localStorage.getItem('carcoord:v1'));
check('a hold raised at start-up is named on the day plan', (await fp.locator('#notices').innerText()).includes('Saving to car-coordinator.json is paused'));
await fp.click('#notices [data-act="show-data"]');
check('and its button opens the question without saving anything',
  (await fp.locator('[data-act="file-keep-file"]').isVisible()) && (await fp.evaluate(() => localStorage.getItem('carcoord:v1'))) === v1BeforeOffer);

// 14. The unreadable-save warning sends you to Backups on the Data tab; going
// there must not put the empty screen over the plan it could not read.
await fp.evaluate(() => localStorage.setItem('carcoord:v1', '{not json at all'));
await fp.reload({ waitUntil: 'networkidle' });
await fp.click('[data-act="tab"][data-tab="data"]');
await fp.click('[data-act="tab"][data-tab="plan"]');
check('switching tabs after an unreadable save leaves it as it was', (await fp.evaluate(() => localStorage.getItem('carcoord:v1'))) === '{not json at all');

// 15. Choose save file… offers existing files too. Picking the old save file
// after a loss must not replace it unread; a new, empty file is just written.
await fresh(fp);
await linkStandIn(fp, devPlan);
await fp.evaluate(() => { const h = Store.file.handle; Store.file.handle = null; Store.file.permission = 'none'; window.showSaveFilePicker = async () => h; render(); });
await onData(fp);
await fp.click('[data-act="link-file"]');
await fp.waitForFunction(() => Store.file.hold && Store.file.hold.kind !== 'checking', null, { timeout: 3000 }).catch(() => {});
check('choosing an existing save file that holds another plan asks first', (await disk(fp)).hold === 'differs' && (await disk(fp)).writes === 0);
await fresh(fp);
await linkStandIn(fp, '');
await fp.evaluate(() => { const h = Store.file.handle; Store.file.handle = null; Store.file.permission = 'none'; window.showSaveFilePicker = async () => h; render(); });
await onData(fp);
await fp.click('[data-act="link-file"]');
await fp.waitForFunction(() => window.__disk.writes > 0, null, { timeout: 3000 }).catch(() => {});
check('a new, empty save file is written straight away', (await disk(fp)).writes === 1 && (await disk(fp)).hold === null);

// 16. A browser that started from a plan of its own keeps it up to date, as before.
await fp.evaluate((text) => { localStorage.clear(); localStorage.setItem('carcoord:v1', JSON.stringify(Store.parseImport(text, defaults).state)); }, devPlan);
await fp.reload({ waitUntil: 'networkidle' });
await linkStandIn(fp, JSON.stringify({ schemaVersion: 4, date: '2026-01-01', cars: [], routes: [] }));
await reconnect(fp);
const kept = await disk(fp);
check('with a plan of its own, Reconnect writes it to the file without asking',
  kept.writes === 1 && JSON.parse(kept.text).cars.length === 17 && kept.hold === null);
check('the save-file cases log no console errors', fpErrors.length === 0, fpErrors.join(' | '));
await pcFile.close();

// --- the update note's pieces in the Store ---
// On a context of its own, so what it stores cannot leak into the cases above.
const pcNote = await browser.newContext();
const un = await pcNote.newPage();
const unErrors = [];
un.on('console', (m) => m.type() === 'error' && unErrors.push(m.text()));
un.on('pageerror', (e) => unErrors.push(String(e)));
await un.goto(base, { waitUntil: 'networkidle' });

// A per-browser pref is stored beside the plan, never in it.
const prefTrip = await un.evaluate(() => {
  const stored = Store.setPref('smokeTest', 'a value');
  const back = Store.pref('smokeTest');
  const raw = localStorage.getItem('carcoord:pref:smokeTest');
  Store.setPref('smokeTest', null);
  return { stored, back, raw, gone: Store.pref('smokeTest'), unset: Store.pref('neverSet') };
});
same('a pref round-trips, and null removes it', prefTrip, { stored: true, back: 'a value', raw: 'a value', gone: null, unset: null });
await un.evaluate(() => { Store.setPref('seenUpdate', '0.0.1'); Store.setPref('fileNeedsCheck', '1'); save(); tab = 'data'; render(); });
const [prefExport] = await Promise.all([un.waitForEvent('download'), un.click('[data-act="export"]')]);
const prefExported = await readFile(await prefExport.path(), 'utf8');
check('an Export carries no pref', !/seenUpdate|fileNeedsCheck|carcoord:pref/.test(prefExported)
  && !Object.keys(JSON.parse(prefExported)).some((k) => /pref|seen/i.test(k)), Object.keys(JSON.parse(prefExported)).join(','));
await un.evaluate(() => { localStorage.clear(); });
await un.reload({ waitUntil: 'networkidle' });

// Load trouble describes the load, not what happens after it.
await un.setInputFiles('#importFile', { name: 'newer.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ schemaVersion: 99, date: '2026-01-01', cars: [{ id: 'c1', reg: 'NEW1' }], positions: [], labels: [], routes: [] })) });
await un.waitForFunction(() => state.cars.length === 1);
check('importing newer data is not load trouble', await un.evaluate(() => Store.loadTrouble() === false));
// The saved text, whatever it is, exactly as stored.
for (const text of ['{not json', '{"schemaVersion":4,"date":"2026-09-29","cars":[],"routes":[]}   ', '[]']) {
  await un.evaluate((t) => localStorage.setItem('carcoord:v1', t), text);
  await un.reload({ waitUntil: 'networkidle' });
  check(`savedText() returns ${JSON.stringify(text)} byte for byte`, (await un.evaluate(() => Store.savedText())) === text);
}
await un.evaluate(() => { localStorage.clear(); });

// --- archives: the untouched copy, outside the rolling Backups ---
// A plan saved with a layout of its own, so a copy normalised on the way
// through would show.
const oddText = '{"schemaVersion":4, "date":"2026-09-29","cars":[{"id":"c1","reg":"ARC1","extra":"kept"}],  "routes":[]}';
await un.evaluate((t) => localStorage.setItem('carcoord:v1', t), oddText);
await un.reload({ waitUntil: 'networkidle' });
const byteCopy = await un.evaluate(() => {
  const r = Store.archive({ kind: 'update', from: 'test', to: 'byte-copy', t: new Date().toISOString(), text: Store.savedText() });
  const mine = Store.archives().find((a) => a.to === 'byte-copy');
  return { ok: r.ok, same: !!mine && mine.text === localStorage.getItem('carcoord:v1'),
    stored: JSON.parse(localStorage.getItem('carcoord:archives')).some((a) => a.to === 'byte-copy' && a.text === localStorage.getItem('carcoord:v1')) };
});
check('an update archive holds the saved text byte for byte', byteCopy.ok && byteCopy.same && byteCopy.stored, JSON.stringify(byteCopy));

const arch = (kind, to, text = `{"routes":[],"to":"${to}"}`) => ({ kind, from: kind === 'update' ? 'before' : null, to: kind === 'update' ? to : null, t: `2026-09-2${to === null ? 0 : String(to).slice(-1)}T08:00:00.000Z`, text });
const fourth = await un.evaluate(([u1, u2, r, u3, u4]) => {
  localStorage.setItem('carcoord:archives', JSON.stringify([u3, r, u2, u1]));
  const res = Store.archive(u4);
  return { res, kept: Store.archives().map((a) => a.kind === 'rescue' ? 'rescue' : a.to) };
}, [arch('update', 'u1'), arch('update', 'u2'), arch('rescue', null, '{broken'), arch('update', 'u3'), arch('update', 'u4')]);
same('a fourth update archive drops only the oldest, and the rescue stays', fourth, { res: { ok: true, dropped: 1 }, kept: ['u4', 'u3', 'rescue', 'u2'] });
const newRescue = await un.evaluate(([r2]) => { Store.archive(r2); return Store.archives().map((a) => a.kind === 'rescue' ? a.text : a.to); }, [arch('rescue', null, '{broken again')]);
same('a new rescue replaces the old one and keeps every update archive', newRescue, ['{broken again', 'u4', 'u3', 'u2']);

// An unreadable save is copied the moment it is found, before any change.
await un.evaluate(() => { localStorage.clear(); localStorage.setItem('carcoord:v1', '{"routes":[{"name":"lost'); });
await un.reload({ waitUntil: 'networkidle' });
const rescued = await un.evaluate(() => Store.archives().filter((a) => a.kind === 'rescue').map((a) => a.text));
same('an unreadable save is rescued as it loads', rescued, ['{"routes":[{"name":"lost']);
check('and the warning points at Archives', (await un.locator('#notices .notice.warn').innerText()).includes('An untouched copy is kept in Archives on the Data tab'),
  await un.locator('#notices').innerText());
await un.reload({ waitUntil: 'networkidle' });
check('a reload on the same unreadable save keeps one copy', (await un.evaluate(() => Store.archives().length)) === 1);
await un.evaluate(() => { state.routes[0].driver = 'Typed after the loss'; save(); });
await un.reload({ waitUntil: 'networkidle' });
same('the first change afterwards leaves the rescue intact',
  await un.evaluate(() => Store.archives().filter((a) => a.kind === 'rescue').map((a) => a.text)), ['{"routes":[{"name":"lost']);

// Twelve new backups, the whole rolling list, push no archive out.
const rolled = await un.evaluate(([u1, u2]) => {
  localStorage.setItem('carcoord:archives', JSON.stringify([u2, JSON.parse(localStorage.getItem('carcoord:archives')).find((a) => a.kind === 'rescue'), u1]));
  const before = localStorage.getItem('carcoord:archives');
  for (let i = 0; i < 13; i++) Store.snapshot({ ...state, date: `2026-10-${String(i + 1).padStart(2, '0')}` }, `Roll ${i}`);
  return { backups: Store.backups().length, same: localStorage.getItem('carcoord:archives') === before };
}, [arch('update', 'u1'), arch('update', 'u2')]);
check('twelve new backups leave every archive in place', rolled.backups === 12 && rolled.same, JSON.stringify(rolled));

// With this browser's storage really full, an archive that cannot fit is not
// written at all, and nothing else is touched to make room.
const fullArchive = await un.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('carcoord:v1', JSON.stringify({ schemaVersion: 4, date: '2026-09-29', cars: [], routes: [] }));
  localStorage.setItem('carcoord:backups', JSON.stringify([{ t: new Date().toISOString(), label: 'Kept', json: '{"routes":[]}' }]));
  const big = (c, n) => c.repeat(n * 1024);
  localStorage.setItem('carcoord:archives', JSON.stringify([
    { kind: 'update', from: 'b', to: 'B', t: '2026-09-02T00:00:00.000Z', text: big('b', 200) },
    { kind: 'update', from: 'a', to: 'A', t: '2026-09-01T00:00:00.000Z', text: big('a', 200) },
  ]));
  let chunks = 0;
  try { for (; chunks < 2000; chunks++) localStorage.setItem(`fill:${chunks}`, 'x'.repeat(64 * 1024)); } catch { /* full */ }
  try { for (let i = 0; i < 4000; i++) localStorage.setItem(`grain:${i}`, 'x'.repeat(1024)); } catch { /* full */ }
  const keys = ['carcoord:archives', 'carcoord:v1', 'carcoord:backups'];
  const before = keys.map((k) => localStorage.getItem(k));
  const tooBig = Store.archive({ kind: 'update', from: 'B', to: 'N', t: new Date().toISOString(), text: big('n', 450) });
  const untouched = keys.map((k, i) => localStorage.getItem(k) === before[i]);
  // One that fits once the oldest has made room: the newer one stays.
  const fits = Store.archive({ kind: 'update', from: 'B', to: 'M', t: new Date().toISOString(), text: big('m', 150) });
  const after = Store.archives().map((a) => a.to);
  for (let i = 0; i < chunks; i++) localStorage.removeItem(`fill:${i}`);
  for (let i = 0; i < 4000; i++) localStorage.removeItem(`grain:${i}`);
  return { chunks, tooBig, untouched, fits, after };
});
check('the archive test really did fill this browser up', fullArchive.chunks > 0 && fullArchive.chunks < 2000, `${fullArchive.chunks} chunks`);
same('an archive that does not fit leaves the archives, the plan and the Backups byte for byte',
  { tooBig: fullArchive.tooBig, untouched: fullArchive.untouched }, { tooBig: { ok: false, dropped: 0 }, untouched: [true, true, true] });
same('and one that fits once the oldest makes room keeps the newer one', { fits: fullArchive.fits, after: fullArchive.after }, { fits: { ok: true, dropped: 1 }, after: ['M', 'B'] });
await un.evaluate(() => { localStorage.clear(); });

// --- a notice line can carry a heading, and the update note has a style ---
await un.evaluate(() => {
  notices = [];   // only the made-up note, whatever the last load raised
  note('update', 'Updated to <b>9.9.9</b>.', null, [{ head: 'What\'s new in <i>9.9.9</i>:', text: 'Something <b>bold</b>.' }, 'A plain <b>line</b>.']);
  render();
});
const synth = un.locator('#notices .notice.update');
const synthShape = await synth.evaluate((n) => ({
  bold: [...n.querySelectorAll('b')].map((b) => b.textContent),
  italic: n.querySelectorAll('i').length,
  text: n.querySelector('.say').textContent,
  buttons: [...n.querySelectorAll('button')].map((b) => b.textContent),
}));
same('an update note escapes what it is given, and sets only each line\'s heading in bold', synthShape, {
  bold: ['What\'s new in <i>9.9.9</i>:'], italic: 0,
  text: 'Updated to <b>9.9.9</b>.What\'s new in <i>9.9.9</i>: Something <b>bold</b>.A plain <b>line</b>.', buttons: ['\u2715'] });
check('it looks like the top bar: ink, with a hi-vis edge', await synth.evaluate((n) => {
  const cs = getComputedStyle(n);
  return cs.backgroundColor === 'rgb(26, 28, 30)' && cs.borderLeftColor === 'rgb(255, 212, 0)';
}));
await synth.locator('[data-act="dismiss"]').click();
check('and \u2715 takes it away', (await un.locator('#notices .notice.update').count()) === 0);

// --- who sees the note, and who gets an archive: the rules on their own ---
await un.goto(base, { waitUntil: 'networkidle' });
const rules = await un.evaluate(() => {
  const all = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o); };
  const before = all();
  const R = (version, must) => ({ version, title: `t${version}`, changed: 'c', affects: 'a', data: 'd', ...(must ? { must: true } : {}) });
  const list = [R('0.6.0'), R('0.5.0', true), R('0.4.0'), R('0.3.0'), R('0.2.5', true)];
  const base = { version: '0.6.0', releases: list, seen: null, firstRun: false, trouble: false, link: false };
  const run = (over) => {
    const r = updateNoteFor({ ...base, ...over });
    return { full: r.show && r.show.full.map((e) => e.version), more: r.show && r.show.more, mark: r.mark };
  };
  const out = {
    seenThis: run({ seen: '0.6.0' }),
    firstRun: run({ firstRun: true }),
    firstRunByLink: run({ firstRun: true, link: true }),
    trouble: run({ trouble: true }),
    troubleAndLink: run({ trouble: true, link: true }),
    link: run({ link: true }),
    downgrade: run({ seen: '9.9.9' }),
    staleList: run({ releases: list.slice(1) }),
    noList: run({ releases: undefined }),
    allUnseen: run({}),
    unknownMarker: run({ seen: '0.1.0' }),
    fromListed: run({ seen: '0.4.0' }),
    mustBeyondThree: run({ releases: [R('0.6.0', true), R('0.5.0'), R('0.4.0', true), R('0.3.0', true), R('0.2.5', true)] }),
    tenAfterNine: run({ version: '0.10.0', releases: [R('0.10.0'), R('0.9.0')], seen: '0.9.0' }),
    nineIsNotNewer: run({ version: '0.10.0', releases: [R('0.10.0'), R('0.9.0')], seen: '0.10.0' }),
    tenIsNewerThanNine: run({ version: '0.9.0', releases: [R('0.9.0')], seen: '0.10.0' }),
  };
  const A = (over) => archiveNeeded({ version: '0.6.0', usableText: '{"routes":[]}', archives: [], seen: '0.5.0', ...over });
  out.archive = {
    returning: A({}),
    noMarker: A({ seen: null }),
    downgrade: A({ seen: '9.9.9' }),
    alreadyShownHere: A({ seen: '0.6.0' }),
    alreadyArchived: A({ archives: [{ kind: 'update', to: '0.6.0' }] }),
    olderArchiveOnly: A({ archives: [{ kind: 'update', to: '0.5.0' }] }),
    rescueDoesNotCount: A({ archives: [{ kind: 'rescue', to: null }] }),
    nothingUsable: A({ usableText: null }),
  };
  out.untouched = all() === before;
  return out;
});
const none = { full: null, more: null, mark: false };
same('the note: already shown for this version, nothing', rules.seenThis, none);
same('the note: a first run marks and shows nothing', rules.firstRun, { full: null, more: null, mark: true });
same('the note: a first open by share link marks too', rules.firstRunByLink, { full: null, more: null, mark: true });
same('the note: a troubled load waits, marker left alone', rules.trouble, none);
same('the note: trouble ahead of a link still waits', rules.troubleAndLink, none);
same('the note: opened by a share link waits', rules.link, none);
same('the note: a downgrade shows nothing', rules.downgrade, none);
same('the note: a stale list shows nothing and does not mark', rules.staleList, none);
same('the note: no list at all shows nothing', rules.noList, none);
same('the note: every must entry in full, the newest others fill to three', rules.allUnseen, { full: ['0.6.0', '0.5.0', '0.2.5'], more: 2, mark: true });
same('the note: a marker not in the list counts as nothing seen', rules.unknownMarker, rules.allUnseen);
same('the note: only what came after the marker', rules.fromListed, { full: ['0.6.0', '0.5.0'], more: 0, mark: true });
same('the note: must entries beyond three are all in full', rules.mustBeyondThree, { full: ['0.6.0', '0.4.0', '0.3.0', '0.2.5'], more: 1, mark: true });
same('the note: 0.10.0 comes after 0.9.0', rules.tenAfterNine, { full: ['0.10.0'], more: 0, mark: true });
same('the note: 0.10.0 already seen is not shown again', rules.nineIsNotNewer, none);
same('the note: a 0.10.0 marker is newer than 0.9.0', rules.tenIsNewerThanNine, none);
same('the archive: taken for a returning leader, no marker, and a downgrade; not twice, not after this version ran here, not without a usable plan', rules.archive, {
  returning: true, noMarker: true, downgrade: true, alreadyShownHere: false, alreadyArchived: false,
  olderArchiveOnly: true, rescueDoesNotCount: true, nothingUsable: false });
check('deciding stores nothing: localStorage byte for byte the same', rules.untouched);

check('the update note\'s Store cases log no console errors', unErrors.length === 0, unErrors.join(' | '));
await pcNote.close();

// --- opening after an update: the archive first, the note last ---
// Every case sets up this browser as an older version would have left it,
// then opens the app. The version is read from the page, never written here.
const upPlan = JSON.stringify({ schemaVersion: 4, date: '2026-09-29', labels: [], positions: [], drivers: [], driverGroups: [], templates: [],
  cars: [{ id: 'c1', reg: 'UP11111' }], routes: [{ id: 'r1', name: '1', driver: 'Returning Leader', carId: 'c1' }] });
const otherPlan = JSON.stringify({ schemaVersion: 4, date: '2026-09-01', labels: [], positions: [], cars: [], routes: [{ id: 'x', name: 'From the file' }] });
// A real file in this origin's private file system, linked the way Choose
// save file links one, so start-up finds it without a stand-in.
const linkOpfs = (pg, text) => pg.evaluate(async (text) => {
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
const opfsText = (pg) => pg.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('car-coordinator.json')).getFile()).text());
const leaveAs = (pg, items) => pg.evaluate((items) => { localStorage.clear(); for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, items);
const opened = (pg) => pg.evaluate(() => ({
  notes: document.querySelectorAll('#notices .notice.update').length,
  last: !!document.querySelector('#notices .notice:last-child.update'),
  text: document.querySelector('#notices .notice.update')?.innerText.replace(/\s+/g, ' ') || '',
  // The note's own sentences, without the entries listed under them.
  say: document.querySelector('#notices .notice.update .say')?.firstChild.textContent || '',
  archives: Store.archives().map((a) => ({ kind: a.kind, from: a.from, to: a.to, sameAsSaved: a.text === localStorage.getItem('carcoord:v1') })),
  marker: localStorage.getItem('carcoord:pref:seenUpdate'),
  saved: localStorage.getItem('carcoord:v1'),
}));
const newContext = async (setup) => {
  const ctx = await browser.newContext();
  if (setup) await setup(ctx);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(base, { waitUntil: 'networkidle' });
  return { ctx, pg, errs };
};

const upA = await newContext();
const up = upA.pg;
const V = await up.evaluate(() => APP_VERSION);
const listed = await up.evaluate(() => UPDATES.map((u) => u.version));

// A returning leader: a plan saved by an older version, and no marker.
await leaveAs(up, { 'carcoord:v1': upPlan });
await up.reload({ waitUntil: 'networkidle' });
const back = await opened(up);
check('a returning leader gets exactly one update note, last on the page', back.notes === 1 && back.last, JSON.stringify(back).slice(0, 300));
check(`and it shows ${listed.slice(0, 2).join(' and ')} in full`,
  listed.slice(0, 2).every((v) => back.text.includes(`What's new in ${v}:`)) && back.text.includes('What it affects:') && back.text.includes('Your data:'), back.text.slice(0, 400));
check('and says the plan and setup were copied into Archives first', back.text.includes('copied unchanged into Archives on the Data tab'));
check('and, with no file linked, offers Choose save file', back.text.includes('use Choose save file… on the Data tab'));
same('one update archive, byte for byte the saved plan, from before this version', back.archives, [{ kind: 'update', from: '0.2.4 or earlier', to: V, sameAsSaved: true }]);
check('the marker is set, and the saved plan is byte for byte as it was', back.marker === V && back.saved === upPlan);

// Nothing on the second open, nor on a first run, nor after a first run's
// first change: nothing from before an update to tell anyone about.
await up.reload({ waitUntil: 'networkidle' });
const again = await opened(up);
check('a second open: no note, no new archive', again.notes === 0 && again.archives.length === 1, JSON.stringify(again).slice(0, 200));
await leaveAs(up, {});
await up.reload({ waitUntil: 'networkidle' });
const first = await opened(up);
check('a first run: no note, no archive, marker written', first.notes === 0 && first.archives.length === 0 && first.marker === V, JSON.stringify(first).slice(0, 200));
await up.evaluate(() => { state.routes[0].driver = 'Typed on day one'; save(); });
await up.reload({ waitUntil: 'networkidle' });
const firstThen = await opened(up);
check('a first run, one change and a reload: still no note, no archive', firstThen.notes === 0 && firstThen.archives.length === 0, JSON.stringify(firstThen).slice(0, 200));

// A downgrade: an older build about to rewrite newer data keeps a copy.
await leaveAs(up, { 'carcoord:v1': upPlan, 'carcoord:pref:seenUpdate': '9.9.9' });
await up.reload({ waitUntil: 'networkidle' });
const down = await opened(up);
check('a downgrade: no note, but an archive, and the marker left alone',
  down.notes === 0 && down.archives.length === 1 && down.archives[0].to === V && down.marker === '9.9.9', JSON.stringify(down).slice(0, 200));

// Held loads wait for the next clean open, and leave the marker alone.
await leaveAs(up, { 'carcoord:v1': '{not json at all' });
await up.reload({ waitUntil: 'networkidle' });
const corrupt = await opened(up);
same('an unreadable save: a rescue only, no note, no marker',
  { notes: corrupt.notes, kinds: corrupt.archives.map((a) => a.kind), marker: corrupt.marker }, { notes: 0, kinds: ['rescue'], marker: null });
await up.evaluate(() => { state.routes[0].driver = 'Typed after the loss'; save(); });
await up.reload({ waitUntil: 'networkidle' });
const afterLoss = await opened(up);
check('once it is overwritten and the page reloaded, the note comes', afterLoss.notes === 1 && afterLoss.marker === V, JSON.stringify(afterLoss).slice(0, 200));
const newer = JSON.stringify({ schemaVersion: 99, date: '2026-09-29', cars: [], positions: [], labels: [], routes: [{ id: 'r1', name: 'Newer' }] });
await leaveAs(up, { 'carcoord:v1': newer });
await up.reload({ waitUntil: 'networkidle' });
const fromNewer = await opened(up);
same('a save from a newer version: an archive, no note, no marker',
  { notes: fromNewer.notes, archives: fromNewer.archives, marker: fromNewer.marker }, { notes: 0, archives: [{ kind: 'update', from: '0.2.4 or earlier', to: V, sameAsSaved: true }], marker: null });

// A share link: the dialog it opens has the screen, and the note waits.
const shareCode = await up.evaluate(async () => Share.encode(state, 'day'));
await leaveAs(up, { 'carcoord:v1': upPlan });
await up.goto('about:blank');
await up.goto(`${base}#d=${shareCode}`, { waitUntil: 'networkidle' });
await up.waitForSelector('#shareDlg[open]', { timeout: 5000 }).catch(() => {});
const byLink = await opened(up);
check('a returning browser opened by a share link: the dialog opens, no note, no marker, but the archive',
  (await up.locator('#shareDlg[open]').count()) === 1 && byLink.notes === 0 && byLink.marker === null && byLink.archives.length === 1, JSON.stringify(byLink).slice(0, 200));
await up.click('[data-act="share-cancel"]');
await leaveAs(up, {});
await up.goto('about:blank');
await up.goto(`${base}#d=${shareCode}`, { waitUntil: 'networkidle' });
await up.waitForSelector('#shareDlg[open]', { timeout: 5000 }).catch(() => {});
const firstByLink = await opened(up);
check('a first open by a share link marks, shows no note, and opens the dialog',
  (await up.locator('#shareDlg[open]').count()) === 1 && firstByLink.notes === 0 && firstByLink.marker === V && firstByLink.archives.length === 0, JSON.stringify(firstByLink).slice(0, 200));
await up.click('[data-act="share-cancel"]');

// The save-file sentence, linked: written to, and held.
await leaveAs(up, { 'carcoord:v1': upPlan });
await linkOpfs(up, upPlan);
await up.reload({ waitUntil: 'networkidle' });
const linked = await opened(up);
check('with a save file linked and allowed, the note says changes are written to it',
  linked.notes === 1 && linked.text.includes('Changes are also written to your save file, car-coordinator.json.'), linked.text.slice(0, 400));
await leaveAs(up, { 'carcoord:v1': upPlan, 'carcoord:pref:fileNeedsCheck': '1' });
await linkOpfs(up, otherPlan);
await up.reload({ waitUntil: 'networkidle' });
await up.waitForFunction(() => Store.file.hold && Store.file.hold.kind !== 'checking', null, { timeout: 4000 }).catch(() => {});
const held = await opened(up);
check('while a save-file hold is up, the note leaves the save file out, and the hold is said',
  held.notes === 1 && !/save file|Export on the Data tab/.test(held.say)
  && (await up.locator('#notices').innerText()).includes('Saving to car-coordinator.json is paused'), held.say);
check('and nothing was written to the file', (await opfsText(up)) === otherPlan);
check('opening after an update logs no console errors', upA.errs.length === 0, upA.errs.join(' | '));
await upA.ctx.close();

// No file picker (Firefox, Safari): the note says Export instead.
const noPicker = await newContext((ctx) => ctx.addInitScript(() => { delete window.showSaveFilePicker; }));
await leaveAs(noPicker.pg, { 'carcoord:v1': upPlan });
await noPicker.pg.reload({ waitUntil: 'networkidle' });
const plain = await opened(noPicker.pg);
check('with no file picker, the note says Export', plain.text.includes('To keep a copy outside this browser, use Export on the Data tab.'), plain.text.slice(0, 400));
check('no console errors without a picker', noPicker.errs.length === 0, noPicker.errs.join(' | '));
await noPicker.ctx.close();

// The Windows app: no save-file sentence until the owner has checked it there.
const inTauri = await newContext((ctx) => ctx.addInitScript(() => { window.__TAURI__ = {}; }));
await leaveAs(inTauri.pg, { 'carcoord:v1': upPlan });
await inTauri.pg.reload({ waitUntil: 'networkidle' });
const exe = await opened(inTauri.pg);
check('in the Windows app, the note leaves the save file out', exe.notes === 1 && !/save file|Export on the Data tab/.test(exe.say), exe.say);
await inTauri.ctx.close();

// Storage full: the copy is not made, and the note says so.
const fullUp = await newContext();
fullUp.pg.removeAllListeners('console');
fullUp.pg.on('console', (m) => m.type() === 'error' && !m.text().includes('localStorage save failed') && fullUp.errs.push(m.text()));
// Bigger than the last kilobyte the fill can leave, so the copy cannot fit.
const bigPlan = JSON.stringify({ ...JSON.parse(upPlan), cars: [{ id: 'c1', reg: 'UP11111', note: 'n'.repeat(4096) }] });
const filledUp = await fullUp.pg.evaluate((plan) => {
  localStorage.clear();
  localStorage.setItem('carcoord:v1', plan);
  let chunks = 0;
  try { for (; chunks < 2000; chunks++) localStorage.setItem(`fill:${chunks}`, 'x'.repeat(64 * 1024)); } catch { /* full */ }
  try { for (let i = 0; i < 4000; i++) localStorage.setItem(`grain:${i}`, 'x'.repeat(1024)); } catch { /* full */ }
  return chunks;
}, bigPlan);
await fullUp.pg.reload({ waitUntil: 'networkidle' });
const noRoom = await opened(fullUp.pg);
check('with storage full, no archive, and the note says storage is full',
  filledUp > 0 && noRoom.archives.length === 0 && noRoom.say.includes('No copy could be put in Archives, because this browser\'s storage is full. Use Export on the Data tab to keep one.'),
  `${JSON.stringify(noRoom.archives)} ${noRoom.say}`);
check('and the saved plan is untouched', noRoom.saved === bigPlan);
check('no console errors when storage is full', fullUp.errs.length === 0, fullUp.errs.join(' | '));
await fullUp.ctx.close();

// Isolation: the archive step failing must not switch off 0.2.5's protection.
const broken = await newContext((ctx) => ctx.route('**/store.js*', async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: `${await res.text()}\nStore.archive = () => { throw new Error('archive broke'); };\n` });
}));
await leaveAs(broken.pg, { 'carcoord:v1': upPlan, 'carcoord:pref:fileNeedsCheck': '1' });
await linkOpfs(broken.pg, otherPlan);
await broken.pg.reload({ waitUntil: 'networkidle' });
await broken.pg.waitForFunction(() => Store.file.hold && Store.file.hold.kind !== 'checking', null, { timeout: 4000 }).catch(() => {});
check('with the archive step broken, the save-file hold is still raised at start-up',
  (await broken.pg.evaluate(() => Store.file.hold && Store.file.hold.kind)) === 'differs'
  && (await broken.pg.locator('#notices').innerText()).includes('Saving to car-coordinator.json is paused'));
await broken.pg.evaluate(async () => { state.routes[0].driver = 'Typed after start-up'; save(); await Store.flush(); });
check('and nothing is written to the file', (await opfsText(broken.pg)) === otherPlan);
const brokenNote = await opened(broken.pg);
check('and the note claims no copy it did not make', brokenNote.notes === 1 && !/Archives|save file/.test(brokenNote.say), brokenNote.say);
check('no console errors with the archive step broken', broken.errs.length === 0, broken.errs.join(' | '));
await broken.ctx.close();

// Missing pieces, as after a deploy with some files still cached: no release
// notes, and a store.js without archives or prefs.
const partial = await newContext(async (ctx) => {
  await ctx.route('**/updates.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/store.js*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${await res.text()}\ndelete Store.archive; delete Store.archives; delete Store.pref; delete Store.setPref;\n` });
  });
});
await leaveAs(partial.pg, { 'carcoord:v1': upPlan });
await partial.pg.reload({ waitUntil: 'networkidle' });
check('with pieces missing, the plan is still drawn', (await partial.pg.locator('#tab-plan tbody tr [data-field="driver"]').first().inputValue()) === 'Returning Leader');
await partial.pg.click('[data-act="tab"][data-tab="data"]');
check('and the Data tab opens', await partial.pg.locator('#tab-data h2').isVisible());
check('and nothing is logged as an error', partial.errs.length === 0, partial.errs.join(' | '));
check('and localStorage holds no archive and no marker', await partial.pg.evaluate(() =>
  localStorage.getItem('carcoord:archives') === null && localStorage.getItem('carcoord:pref:seenUpdate') === null));
await partial.ctx.close();

// --- What's new and Archives on the Data tab ---
const dataUp = await newContext();
const dt = dataUp.pg;
const beforePlan = upPlan;   // what the leader had before the update
const sincePlan = JSON.stringify({ schemaVersion: 4, date: '2026-10-01', labels: [], positions: [], cars: [], drivers: [], driverGroups: [], templates: [],
  routes: [{ id: 'rb', name: 'Changed since' }] });
const tA = '2026-09-29T06:00:00.000Z', tR = '2026-09-28T06:00:00.000Z';
const archivesAB = (to) => JSON.stringify([
  { kind: 'update', from: '0.2.4 or earlier', to, t: tA, text: beforePlan },
  { kind: 'rescue', from: null, to: null, t: tR, text: '{"routes":[{"name":"half' },
]);
await leaveAs(dt, { 'carcoord:v1': sincePlan, 'carcoord:archives': archivesAB(V), 'carcoord:pref:seenUpdate': V });
await dt.reload({ waitUntil: 'networkidle' });
await dt.click('[data-act="tab"][data-tab="data"]');
same('What\'s new and Archives sit above Backups, which is still the last card',
  await dt.locator('#tab-data .card h3').allInnerTexts(),
  ['Auto-save to a file', 'This browser', 'Send this list to another PC', 'Load a list someone sent you', 'Your own copy', 'What\'s new', 'Archives', 'Backups']);
check('and the tab\'s one table is Backups\'', await dt.evaluate(() =>
  document.querySelectorAll('#tab-data table').length === 1 && !!document.querySelector('#tab-data .card:last-child table')));
const news = await dt.locator('#tab-data .card.whatsnew').innerText();
const newest = await dt.evaluate(() => UPDATES[0]);
check('What\'s new names the running version and the newest entry\'s four parts',
  news.includes(`You are running version ${V}.`) && [newest.title, newest.changed, newest.affects, newest.data].every((x) => news.includes(x)), news.slice(0, 300));
const archRows = dt.locator('#tab-data .arch-row');
const updRow = archRows.filter({ hasText: `Before ${V}` });
const rescueRow = archRows.filter({ hasText: 'Could not be read' });
check('an update row says what it holds before anything is replaced',
  (await updRow.innerText()).includes(`Before ${V} (from 0.2.4 or earlier)`) && (await updRow.innerText()).includes('1 route, 1 car, 0 drivers, 0 templates, dated 29/09/2026'),
  await updRow.innerText());
check('a rescue row offers Download only',
  (await rescueRow.locator('[data-act="archive-download"]').count()) === 1 && (await rescueRow.locator('[data-act="archive-restore"]').count()) === 0);

// Arming a Backups row and then pressing an Archives row restores nothing.
const routeNames = () => dt.evaluate(() => state.routes.map((r) => r.name));
const dtBackupCount = () => dt.evaluate(() => Store.backups().length);
const nBackups = await dtBackupCount();
await dt.locator('#tab-data .card:last-child [data-act="restore"]').first().click();
await updRow.locator('[data-act="archive-restore"]').click();
check('arming a Backups row, then pressing Restore on an archive, restores nothing',
  JSON.stringify(await routeNames()) === '["Changed since"]' && (await dtBackupCount()) === nBackups
  && (await updRow.locator('[data-act="archive-restore"]').innerText()) === 'Sure?');
await dt.waitForTimeout(3100);   // let the arming lapse

// Restore: two clicks, a backup of the screen first, then the old plan back.
await dt.evaluate(() => { state.routes[0].driver = 'Typed today'; save(); render(); });
await updRow.locator('[data-act="archive-restore"]').click();
check('one click on Restore changes nothing', JSON.stringify(await routeNames()) === '["Changed since"]');
await updRow.locator('[data-act="archive-restore"]').click();
const restored = await dt.evaluate(() => ({ routes: state.routes.map((r) => r.name), saved: JSON.parse(localStorage.getItem('carcoord:v1')).routes.map((r) => r.name),
  backup: Store.backups()[0] && { label: Store.backups()[0].label, drivers: JSON.parse(Store.backups()[0].json).routes.map((r) => r.driver) } }));
same('the second click puts the archived plan back, after backing up the screen', restored,
  { routes: ['1'], saved: ['1'], backup: { label: `Restoring the copy from before ${V}`, drivers: ['Typed today'] } });

// Download is the archive's text byte for byte, and imports to the same plan.
const [archFile] = await Promise.all([dt.waitForEvent('download'), updRow.locator('[data-act="archive-download"]').click()]);
const archText = await readFile(await archFile.path(), 'utf8');
check('Download is the archive byte for byte, named for the version', archText === beforePlan && archFile.suggestedFilename() === `car-coordinator-before-${V}.json`, archFile.suggestedFilename());
await dt.evaluate(() => { state.routes[0].name = 'Changed again'; save(); render(); });
await dt.setInputFiles('#importFile', { name: archFile.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(archText) });
check('and it imports to the same plan', await dt.evaluate((t) => JSON.stringify(state) === JSON.stringify(Store.parseImport(t, defaults).state), archText));
const [rescueFile] = await Promise.all([dt.waitForEvent('download'), rescueRow.locator('[data-act="archive-download"]').click()]);
check('a rescue downloads byte for byte, named for its day',
  (await readFile(await rescueFile.path(), 'utf8')) === '{"routes":[{"name":"half' && rescueFile.suggestedFilename() === 'car-coordinator-unreadable-2026-09-28.json', rescueFile.suggestedFilename());

// An update archive that is not a plan offers no Restore.
await dt.evaluate(() => { localStorage.setItem('carcoord:archives', JSON.stringify([{ kind: 'update', from: 'x', to: 'not-a-plan', t: '2026-09-27T06:00:00.000Z', text: '[]' }])); render(); });
const notPlanRow = archRows.filter({ hasText: 'Before not-a-plan' });
check('an update archive holding [] says it could not be read, and offers no Restore',
  (await notPlanRow.innerText()).includes('Could not be read') && (await notPlanRow.locator('[data-act="archive-restore"]').count()) === 0
  && (await notPlanRow.locator('[data-act="archive-download"]').count()) === 1);

// With no room for the backup, Restore does nothing, and says why.
await dt.evaluate(({ a, b }) => { localStorage.setItem('carcoord:archives', a); state = Store.parseImport(b, defaults).state; save(); render(); }, { a: archivesAB(V), b: sincePlan });
const filledRestore = await dt.evaluate(() => {
  // No older backups to make way either: the one that could not be taken
  // has nothing to trim.
  localStorage.removeItem('carcoord:backups');
  let chunks = 0;
  try { for (; chunks < 2000; chunks++) localStorage.setItem(`fill:${chunks}`, 'x'.repeat(64 * 1024)); } catch { /* full */ }
  try { for (let i = 0; i < 4000; i++) localStorage.setItem(`grain:${i}`, 'x'.repeat(1024)); } catch { /* full */ }
  return chunks;
});
await updRow.locator('[data-act="archive-restore"]').click();
await updRow.locator('[data-act="archive-restore"]').click();
check('with no room for the backup first, Restore changes nothing and says why',
  filledRestore > 0 && JSON.stringify(await routeNames()) === '["Changed since"]'
  && (await dt.locator('#notices').innerText()).includes(`Could not take a backup before "Restoring the copy from before ${V}"`),
  await dt.locator('#notices').innerText());
await dt.evaluate(() => { for (let i = 0; i < 2000; i++) localStorage.removeItem(`fill:${i}`); for (let i = 0; i < 4000; i++) localStorage.removeItem(`grain:${i}`); });
check('the Data tab\'s new cards log no console errors', dataUp.errs.length === 0, dataUp.errs.join(' | '));
await dataUp.ctx.close();

// --- the promise on the tin: nothing the page loads comes from anywhere else ---
// On a context of its own, because a refusal is logged as a console error and
// the run below fails on those — rightly, everywhere but here.
const pcCsp = await browser.newContext();
const p = await pcCsp.newPage();
await p.goto(base, { waitUntil: 'networkidle' });
const csp = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '');
check('the page ships a content security policy', /default-src 'none'/.test(csp) && /script-src 'self'/.test(csp), csp);
check('and it refuses an inline script', await p.evaluate(() => {
  // An inline script is how a markup injection would have to land.
  const s = document.createElement('script');
  s.textContent = 'window.__inlineRan = 1';
  document.body.appendChild(s);
  s.remove();
  return !window.__inlineRan;
}));
check('and the app itself still ran under it', await p.evaluate(() => document.querySelectorAll('#tab-plan tbody tr').length > 0));
await pcCsp.close();

// --- prints to A4 ---
const pdf = await page.pdf({ format: 'A4', printBackground: true });
check('renders a non-empty A4 PDF', pdf.length > 1000, `${pdf.length} bytes`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
