// Drives the app the way a leader would on a Monday morning, screenshotting
// each tab on the way through. Run: npm run screens
//
// It is also a practical test: everything here goes through the real UI, so
// if a button, a select or a warning stops working the run fails or the
// picture shows it.
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

// Anchored to the repo, not the cwd: line 2 below is a recursive force delete.
const OUT = fileURLToPath(new URL('../screens', import.meta.url));
const server = await startServer();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1360, height: 940 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const shot = async (name) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${OUT}/${name}.png`);
};
const tab = (name) => page.click(`[data-act="tab"][data-tab="${name}"]`);

await page.goto(server.base, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle' });

console.log('first run');
// The one notice a first-ever open shows is the hint about the ⓘ buttons.
if ((await page.locator('#notices .notice').count()) !== 1 || !(await page.locator('#notices .notice').innerText()).includes('New here? Click any \u24d8')) {
  console.log('\na first-ever open did not show the ⓘ hint alone');
  process.exit(1);
}
await shot('01-first-run');

// --- build a fleet, the way you would on day one: paste the lot in at once
console.log('cars');
await tab('cars');
await page.fill('#newCar', 'AA11111 AA22222 AA33333 AA44444 AA55555 AA66666 AA77777 AA88888');
await page.click('#tab-cars [data-act="add-car"]');

// a car goes to the workshop, with a note — this is the "tags on a car" path
const row = (reg) => page.locator('#tab-cars tbody tr', { has: page.locator(`[data-field="reg"][value="${reg}"]`) });
await row('AA33333').locator('.chip', { hasText: 'Workshop' }).click();
await row('AA33333').locator('[data-field="note"]').fill('Back Friday');
// and a parked one goes too: it is the one the printout lists
await row('AA77777').locator('.chip', { hasText: 'Workshop' }).click();

// and one gets its registration corrected — the "change cars" path
await row('AA66666').locator('[data-field="reg"]').fill('BB99999');
await page.keyboard.press('Tab');

// --- a new label of your own
console.log('labels');
await tab('labels');
await page.fill('#newLabel', 'No fuel card');
await page.fill('#newLabelColor', '#1565c0');
await page.click('[data-act="add-label"]');
// Workshop cars are listed on the printout; No fuel card ones are not.
await page.locator('#tab-labels tbody tr', { has: page.locator('[data-field="name"][value="Workshop"]') })
  .locator('[data-field="onSheet"]').check();
await shot('07-labels');

// tag a car with the new label straight away
await tab('cars');
await row('AA55555').locator('.chip', { hasText: 'No fuel card' }).click();
await row('AA88888').locator('.chip', { hasText: 'No fuel card' }).click();

// --- positions: rename one and mark another unavailable
console.log('positions');
await tab('positions');
const pos = (name) => page.locator('#tab-positions tbody tr', { has: page.locator(`[data-field="name"][value="${name}"]`) });
await pos('Spot 5').locator('[data-field="name"]').fill('Port 3');
await page.keyboard.press('Tab');
await page.fill('#newPos', 'Spot 6');
await page.click('[data-act="add-position"]');
await pos('Spot 6').locator('.chip', { hasText: 'Out of service' }).click();
await pos('Spot 6').locator('[data-field="note"]').fill('Pallet jack parked in it');
await shot('06-positions');

// --- the roster, and a crew you can put in with one click
console.log('drivers and day groups');
await tab('drivers');
await page.fill('#newDriver', 'Ana Ruiz, Bo Lind, Cai Mensah, Dee Okafor, Efe Yilmaz, Fia Berg, Gus Hald, Hana Sol, Ida Ngo');
await page.click('#tab-drivers [data-act="add-driver"]');
await page.fill('#newGroup', 'Monday');
await page.click('[data-act="add-group"]');
const monday = page.locator('#tab-drivers .group', { has: page.locator('[data-field="name"][value="Monday"]') });
for (const who of ['Ana Ruiz', 'Bo Lind', 'Cai Mensah', 'Dee Okafor', 'Efe Yilmaz', 'Fia Berg', 'Gus Hald', 'Ida Ngo']) {
  await monday.locator('.chip', { hasText: who }).click();
}
await monday.locator('[data-act="apply-group"]').click();
if ((await page.locator('#tab-drivers tbody tr.away').count()) !== 1) {
  console.log(`\nexpected one driver left out of Monday, got ${await page.locator('#tab-drivers tbody tr.away').count()}`);
  process.exit(1);
}
// Usual days, a tag and a note, through the row itself.
const driverRow = (name) => page.locator('#tab-drivers tbody tr', { has: page.locator(`[data-field="name"][value="${name}"]`) });
const usual = (name, day) => driverRow(name).locator(`[data-act="crew-day"][data-day="${day}"]`).click();
await usual('Ana Ruiz', 2);                 // makes a Tuesday group
await usual('Bo Lind', 2);
await usual('Cai Mensah', 3);               // and a Wednesday one
await driverRow('Hana Sol').locator('.chip', { hasText: 'Sick' }).click();
await driverRow('Bo Lind').locator('[data-field="note"]').fill('Back from leave Monday');
if ((await page.locator('#tab-drivers tbody tr.away').count()) !== 1
  || (await page.evaluate(() => state.driverGroups.map((g) => `${g.name}:${g.driverIds.length}`).join()))  !== 'Monday:8,Tuesday:2,Wednesday:1') {
  console.log(`\nthe usual days did not make the groups expected: ${await page.evaluate(() => state.driverGroups.map((g) => `${g.name}:${g.driverIds.length}`).join())}`);
  process.exit(1);
}
await shot('02-drivers');
await page.setViewportSize({ width: 900, height: 700 });
await shot('28-drivers-at-900');
await page.setViewportSize({ width: 1360, height: 940 });

// --- the day plan, including deliberate mistakes
console.log('day plan, with mistakes left in on purpose');
await tab('plan');
const routes = page.locator('#tab-plan tbody tr');
// Option labels carry live annotations ("AA11111 \u00b7 on route 1"), so pick by
// the value behind the option whose text starts with what we asked for.
const pick = async (select, prefix) => {
  const value = await select.locator('option').filter({ hasText: new RegExp(`^${prefix}( |$)`) }).first().getAttribute('value');
  await select.selectOption(value);
};
const assign = async (i, driver, car, position) => {
  await routes.nth(i).locator('[data-field="driver"]').fill(driver);
  if (car) await pick(routes.nth(i).locator('[data-field="carId"]'), car);
  if (position) await pick(routes.nth(i).locator('[data-field="positionId"]'), position);
};
await assign(0, 'Ana Ruiz', 'AA11111', 'Spot 1');
await assign(1, 'Bo Lind', 'AA22222', 'Spot 2');
await assign(2, 'Cai Mensah', 'AA44444', 'Spot 3');
// mistake 1: the same car on two routes
await assign(3, 'Dee Okafor', 'AA11111', 'Spot 4');
// mistake 2: a position already taken
await assign(4, 'Efe Yilmaz', 'AA55555', 'Spot 1');
// mistake 3: a car that is in the workshop
await assign(5, 'Fia Berg', 'AA33333', 'Port 3');
// mistake 4 came earlier and for free: AA55555 was tagged 'No fuel card'
// and a normal one that shares the garage, which is allowed
await assign(6, 'Gus Hald', 'BB99999', 'Garage');

// Rounds. Routes 1 and 5 are in the same spot in the same round, which is a
// clash and stays one. Route 8 is in that spot too, in round 2, which is what
// rounds are for — the assertion below is that nothing new is raised for it.
const round = (i, value) => routes.nth(i).locator('[data-field="round"]').fill(value);
await round(0, '1');
await round(1, '1');
await round(2, '2');
await round(4, '1');
await assign(7, 'Ida Ngo', '', 'Spot 1');
await round(7, '2');

await routes.nth(13).locator('[data-field="driver"]').fill('Hana Sol');
await routes.nth(13).locator('[data-act="toggle"][data-field="highlight"]').click();

const warned = await page.locator('.problems li').allInnerTexts();
console.log(`  ${warned.length} warnings raised:`);
warned.forEach((w) => console.log(`    - ${w}`));

// Assert, do not narrate: without this the run prints '0 warnings shown as
// expected' and exits 0 when problems() is broken.
const expected = [
  'AA11111 is on 2 routes (1, 4)',            // same car twice
  'Spot 1 in round 1 is taken by 2 routes (1, 5)',      // same spot, same round
  'AA33333 is marked Workshop but is on route 6',
  'AA55555 is marked No fuel card but is on route 5',
];
const missing = expected.filter((e) => !warned.includes(e));
const extra = warned.filter((w) => !expected.includes(w));
if (missing.length || extra.length) {
  console.log(`\nwarnings did not match.\n  missing: ${missing.join(' | ') || 'none'}\n  unexpected: ${extra.join(' | ') || 'none'}`);
  process.exit(1);
}
// The rail is the editor now, so it lists the whole roster — the one who is
// away is dimmed rather than dropped, because someone away has to be
// reachable to be brought back.
if ((await page.locator('#tab-plan [data-panel="drivers"] li').count()) !== 9
  || (await page.locator('#tab-plan [data-panel="drivers"] li.away').count()) !== 1
  || (await page.locator('#tab-plan [data-panel="cars"] li').count()) !== 8) {
  console.log('\nthe rail beside the plan is not showing the crew and the fleet');
  process.exit(1);
}
if ((await page.locator('#tab-plan tbody tr.warn').count()) !== 4) {
  console.log(`\nexpected 4 flagged rows, got ${await page.locator('#tab-plan tbody tr.warn').count()}`);
  process.exit(1);
}

// --- the plan you make again: save it as a template, set it for Mondays
console.log('day templates');
// The shelf starts with Monday to Friday, empty (0.13.0), so saving "Monday"
// fills that one; it is the only one with routes to load.
await page.fill('#newTemplate', 'Monday');
await page.click('[data-act="save-template"]');
const saved = page.locator('#tab-plan .tpl', { has: page.locator('[data-act="ask-template"]') });
if ((await saved.count()) !== 1) {
  console.log(`\nexpected one template with routes on the shelf after saving Monday, got ${await saved.count()}`);
  process.exit(1);
}
await saved.locator('select[data-field="weekday"]').selectOption('1');
await shot('03-day-plan-with-warnings');

// An ⓘ's bubble, open beside it on the day plan.
console.log('an info bubble');
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#tab-plan .info-btn[data-info="plan-drivers"]');
await page.waitForSelector('#infoBubble:not([hidden])');
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/33-info-bubble.png` });
console.log(`  ${OUT}/33-info-bubble.png`);
await page.keyboard.press('Escape');

// The week under the route list, Monday's crew lit: at the exe's default
// width, and on a phone, where it scrolls sideways in its own box.
if ((await page.locator('#planWeek .week-col[data-day="1"] .week-load.lit').count()) !== 1) {
  console.log("\nthe week does not show Monday's crew as the one in");
  process.exit(1);
}
for (const [width, height, name] of [[1280, 850, '25-week-at-1280'], [390, 844, '26-week-on-a-phone']]) {
  await page.setViewportSize({ width, height });
  await page.locator('#planWeek').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.locator('#planWeek').screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
}
await page.setViewportSize({ width: 1360, height: 940 });
await page.evaluate(() => window.scrollTo(0, 0));

// The parking map under the week, as the walkthrough left the plan: Spot 5
// renamed Port 3, Spot 6 added out of service, and Spot 1 taken twice in
// round 1. Asserted against the map's own gate name.
const parking = await page.evaluate(() => {
  const box = (key) => document.querySelector(`#planMap .parking-${key}`)?.innerText.replace(/\s+/g, ' ').trim() || '';
  return {
    gate: ParkingMap.GATE_NAMES[0],
    spot1: box('spot1'), spot1Red: !!document.querySelector('#planMap .parking-spot1.parking-red'),
    spot5: box('spot5'), gateBox: box('gate'),
    listed: [...document.querySelectorAll('#planMap .parking-item')].map((i) => i.innerText.replace(/\s+/g, ' ').trim()),
  };
});
const listedHas = (name, more = '') => parking.listed.some((t) => t.startsWith(name) && t.includes(more));
if (!parking.spot5.includes('No position named Spot 5') || !listedHas('Port 3') || !listedHas('Spot 6', 'Out of service · Pallet jack parked in it')
  || !parking.spot1Red || !/Round 1 Taken by 2 routes in round 1 route 1 .*route 5 .*Round 2 route 8/.test(parking.spot1)
  || !parking.gateBox.includes(`No position named ${parking.gate}`)) {
  console.log(`\nthe parking map does not show the plan as expected:\n${JSON.stringify(parking, null, 1)}`);
  process.exit(1);
}
await page.locator('#planMap .parking').scrollIntoViewIfNeeded();
await page.waitForTimeout(150);
await page.locator('#planMap .parking').screenshot({ path: `${OUT}/27-parking-map.png` });
console.log(`  ${OUT}/27-parking-map.png`);
await page.evaluate(() => window.scrollTo(0, 0));

// The question that guards the one destructive button on the main screen. It
// is dismissed rather than answered: the plan below it is the day being built.
await page.click('#tab-plan .tpl [data-act="ask-template"]');
await page.waitForSelector('#notices .notice.warn [data-act="load-template"]');
await shot('04-template-question');
await page.click('#notices .notice.warn [data-act="dismiss"]');
if ((await page.locator('#tab-plan tbody tr').count()) !== 15) {
  console.log(`\ndismissing the question changed the plan: ${await page.locator('#tab-plan tbody tr').count()} routes`);
  process.exit(1);
}

await tab('cars');
await shot('05-cars');

// --- data tab and the share code
console.log('data and sharing');
await tab('data');
await page.click('[data-act="share-make"][data-mode="day"]');
await page.waitForFunction(() => document.querySelector('#shareOut')?.value.startsWith('CC1'));
await shot('08-data');

// --- the import preview another PC would see
await page.click('[data-act="tab"][data-tab="data"]');
const code = await page.locator('#shareOut').inputValue();
await page.fill('#shareIn', code);
await page.click('[data-act="share-read"]');
await page.waitForSelector('#shareDlg[open]');
await page.screenshot({ path: `${OUT}/09-import-preview.png` });
console.log(`  ${OUT}/09-import-preview.png`);
await page.click('[data-act="share-cancel"]');

// --- the printout
console.log('printout');
await tab('preview');
await page.waitForSelector('#sheet table');
// The lists under the table: only parked cars whose label is ticked are not
// available. AA77777 is parked in the workshop; AA88888's label is unticked;
// AA33333 is in the workshop but on route 6, so it is on its row only.
const printed = await page.evaluate(() => ({
  down: [...document.querySelectorAll('#sheet .extra h4')].find((h) => h.textContent === 'Cars not available')
    ? document.querySelector('#sheet .extra').innerText.split('Free cars')[0] : '',
  sheet: document.querySelector('#sheet').innerText,
  extra: document.querySelector('#sheet .extra').innerText,
}));
if (!printed.down.includes('AA77777: Workshop') || printed.sheet.includes('AA88888') || printed.extra.includes('AA33333')) {
  console.log(`\nthe printout's lists are wrong:\n${printed.extra}`);
  process.exit(1);
}
await shot('10-print-preview');
await page.pdf({ path: `${OUT}/11-printed-sheet.pdf`, format: 'A4', printBackground: true });
console.log(`  ${OUT}/11-printed-sheet.pdf`);

// --- right-click menus, on the plan built above. The screen as it is, not
// the whole page: the menu opens where the pointer is.
console.log('right-click menus');
const viewShot = async (name) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
};
const rightClickMark = async () => {
  const mark = page.locator('#tab-plan tr[data-route]').first().locator('[data-field="highlight"]');
  await mark.scrollIntoViewIfNeeded();
  await mark.click({ button: 'right' });
  await page.waitForSelector('#ctxMenu:not([hidden])');
};
await tab('plan');
await rightClickMark();
await viewShot('29-route-menu');
await page.click('#ctxMenu [data-act="del"]');
await page.waitForSelector('#ctxMenu [data-act="del"].armed');
await viewShot('30-armed-delete');
await page.keyboard.press('Escape');
await page.waitForSelector('#ctxMenu', { state: 'hidden' });
const railDriver = page.locator('#tab-plan .rail-row[data-drag="driver"] .assign').first();
await railDriver.scrollIntoViewIfNeeded();
await railDriver.click({ button: 'right' });
await page.waitForSelector('#ctxMenu:not([hidden])');
await viewShot('31-rail-driver-menu');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 390, height: 844 });
await rightClickMark();
await viewShot('32-phone-menu');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1360, height: 940 });

// --- the next open after an update: the note, and the Data tab's new cards.
// The marker is taken away, so this browser opens as one the update has not
// reached yet: its plan goes into Archives first and the note comes last.
console.log('after an update');
await page.evaluate(() => localStorage.removeItem('carcoord:pref:seenUpdate'));
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => window.scrollTo(0, 0));   // a reload keeps the scroll it had
if ((await page.locator('#notices .notice.update').count()) !== 1) {
  console.log(`\nexpected one update note after the marker was taken away, got ${await page.locator('#notices .notice.update').count()}`);
  process.exit(1);
}
await shot('12-update-note');
await tab('data');
if ((await page.locator('#tab-data .arch-row [data-act="archive-restore"]').count()) !== 1) {
  console.log('\nthe Data tab shows no archive to restore after the update');
  process.exit(1);
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('13-data-whats-new-and-archives');

// --- when the app will not start: the plain line, and the recovery page.
// On a page of its own, because the broken app.js is meant to fail.
console.log('when the app will not start');
const dead = await browser.newPage({ viewport: { width: 1360, height: 500 }, deviceScaleFactor: 2 });
await dead.route('**/app.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("app.js broken on purpose");' }));
await dead.goto(server.base, { waitUntil: 'networkidle' });
if (!(await dead.locator('#notices .boot-line').isVisible())) {
  console.log('\nwith app.js broken, the line pointing at the recovery page is not there');
  process.exit(1);
}
await dead.screenshot({ path: `${OUT}/14-app-will-not-start.png` });
console.log(`  ${OUT}/14-app-will-not-start.png`);
await dead.close();
await page.goto(`${server.base}recover.html`, { waitUntil: 'networkidle' });
if ((await page.locator('#list [data-key="carcoord:v1"]').count()) !== 1) {
  console.log('\nthe recovery page does not list the plan');
  process.exit(1);
}
await shot('15-recovery-page');

// --- dark: the same app with Dark picked on the Data tab. The sheet stays paper.
console.log('dark');
await page.goto(server.base, { waitUntil: 'networkidle' });
await tab('data');
await page.click('#tab-data [data-act="theme"][data-colours="dark"]');
if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'dark') {
  console.log('\nthe Colours switch did not turn the page dark');
  process.exit(1);
}
await tab('plan');
// the picker on route 4, whose car is also on route 1: a picked choice and its clash note
await routes.nth(3).locator('[data-field="carId"]').click();
await page.waitForSelector('#picker:not([hidden]) .pick.on');
await shot('16-dark-day-plan-and-picker');
await page.keyboard.press('Escape');
await tab('cars');
await shot('17-dark-cars');
await tab('data');
await shot('18-dark-data');
await page.evaluate(() => localStorage.removeItem('carcoord:pref:seenUpdate'));
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForSelector('#notices .notice.update');
await shot('19-dark-update-note');
await tab('preview');
await page.waitForSelector('#sheet table');
await shot('20-dark-print-preview');
await page.pdf({ path: `${OUT}/21-printed-sheet-while-dark.pdf`, format: 'A4', printBackground: true });
console.log(`  ${OUT}/21-printed-sheet-while-dark.pdf`);

// --- a plan whose date has passed, opened: Keep, then the date line both ways.
// On a page of its own, in light, with the update note already seen.
console.log('a passed date');
const dp = await browser.newPage({ viewport: { width: 1360, height: 700 }, deviceScaleFactor: 2 });
dp.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
dp.on('pageerror', (e) => errors.push(String(e)));
const dpShot = async (name) => {
  await dp.waitForTimeout(150);
  await dp.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
};
await dp.goto(server.base, { waitUntil: 'networkidle' });
await dp.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() - 3);
  const past = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.clear();
  localStorage.setItem('carcoord:pref:seenUpdate', APP_VERSION);
  localStorage.setItem('carcoord:v1', JSON.stringify({ schemaVersion: 5, date: past, labels: [], cars: [], positions: [], drivers: [], driverGroups: [], templates: [],
    routes: ['1', '2', '3'].map((name) => ({ id: `r${name}`, name, driver: '', carId: '', positionId: '', round: '', highlight: false, gapBefore: false })) }));
});
await dp.reload({ waitUntil: 'networkidle' });
if (!(await dp.locator('#notices [data-act="keep-date"]').count())) {
  console.log('\na plan dated three days ago was not moved on open');
  process.exit(1);
}
await dpShot('22-date-moved-with-keep');
await dp.click('#notices [data-act="keep-date"]');
await dp.waitForSelector('#dateLine.off [data-act="set-tomorrow"]');
await dpShot('23-date-line-warning');
await dp.click('#dateLine [data-act="set-tomorrow"]');
await dp.waitForSelector('#dateLine:not(.off)');
await dpShot('24-date-line-quiet');
await dp.close();

await browser.close();
server.close();

if (errors.length) {
  console.log(`\n${errors.length} console error(s): ${errors.join(' | ')}`);
  process.exit(1);
}
console.log(`\nno console errors, ${warned.length} warnings raised and asserted`);
