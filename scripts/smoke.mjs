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
  && (await page.locator('#notices [data-act="save-day-crew"]').innerText()) === 'Save as Wednesday');
await page.click('#notices [data-act="save-day-crew"]');
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
  (await page.evaluate(() => state.drivers.every((d) => d.available))) && (await page.locator('#notices [data-act="save-day-crew"]').count()) === 1);
await page.evaluate(() => { state.drivers[5].available = false; render(); });
await page.click('#notices [data-act="save-day-crew"]');
check('the offer counts who is in when it is pressed, and fills the empty crew rather than making a second',
  await page.evaluate(() => state.driverGroups.filter((g) => groupWeekday(g.name) === 4).length === 1
    && state.driverGroups.find((g) => g.id === 'g2').driverIds.length === 29));

await page.evaluate(() => { note('warn', 'A question about the data', { act: 'split-rounds', kind: '', id: '', text: 'Answer it' }); render(); });
await dayBtn('Sat').click();
check('a question about a day leaves every other question up',
  (await page.locator('#notices [data-act="split-rounds"]').count()) === 1 && (await page.locator('#notices [data-act="save-day-crew"]').count()) === 1);
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
await page.locator('#notices [data-act="save-day-crew"]').waitFor();
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
check('the question a day raises comes into view clear of the top bar',
  await page.evaluate(() => {
    const b = document.querySelector('#notices [data-act="save-day-crew"]').getBoundingClientRect();
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
  (await page.locator('#notices .notice .say').last().evaluate((s) => s.getBoundingClientRect().width)) > 200);
await page.evaluate(() => { notices = []; render(); });

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
