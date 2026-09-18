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
await shot('01-first-run');

// --- build a fleet, the way you would on day one: paste the lot in at once
console.log('cars');
await tab('cars');
await page.fill('#newCar', 'AA11111 AA22222 AA33333 AA44444 AA55555 AA66666');
await page.click('[data-act="add-car"]');

// a car goes to the workshop, with a note — this is the "tags on a car" path
const row = (reg) => page.locator('#tab-cars tbody tr', { has: page.locator(`[data-field="reg"][value="${reg}"]`) });
await row('AA33333').locator('.chip', { hasText: 'Workshop' }).click();
await row('AA33333').locator('[data-field="note"]').fill('Back Friday');

// and one gets its registration corrected — the "change cars" path
await row('AA66666').locator('[data-field="reg"]').fill('BB99999');
await page.keyboard.press('Tab');

// --- a new label of your own
console.log('labels');
await tab('labels');
await page.fill('#newLabel', 'No fuel card');
await page.fill('#newLabelColor', '#1565c0');
await page.click('[data-act="add-label"]');
await shot('06-labels');

// tag a car with the new label straight away
await tab('cars');
await row('AA55555').locator('.chip', { hasText: 'No fuel card' }).click();

// --- positions: rename one and mark another unavailable
console.log('positions');
await tab('positions');
const pos = (name) => page.locator('#tab-positions tbody tr', { has: page.locator(`[data-field="name"][value="${name}"]`) });
await pos('Spot 5/1').locator('[data-field="name"]').fill('Port 3');
await page.keyboard.press('Tab');
await page.fill('#newPos', 'Spot 6/1');
await page.click('[data-act="add-position"]');
await pos('Spot 2/2').locator('.chip', { hasText: 'Out of service' }).click();
await pos('Spot 2/2').locator('[data-field="note"]').fill('Pallet jack parked in it');
await shot('05-positions');

// --- the roster, and a crew you can put in with one click
console.log('drivers and day groups');
await tab('drivers');
await page.fill('#newDriver', 'Ana Ruiz, Bo Lind, Cai Mensah, Dee Okafor, Efe Yilmaz, Fia Berg, Gus Hald, Hana Sol, Ida Ngo');
await page.click('[data-act="add-driver"]');
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
await shot('02-drivers');

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
await assign(0, 'Ana Ruiz', 'AA11111', 'Spot 1/1');
await assign(1, 'Bo Lind', 'AA22222', 'Spot 1/2');
await assign(2, 'Cai Mensah', 'AA44444', 'Spot 2/1');
// mistake 1: the same car on two routes
await assign(3, 'Dee Okafor', 'AA11111', 'Spot 3/1');
// mistake 2: a position already taken
await assign(4, 'Efe Yilmaz', 'AA55555', 'Spot 1/1');
// mistake 3: a car that is in the workshop
await assign(5, 'Fia Berg', 'AA33333', 'Spot 3/2');
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
await assign(7, 'Ida Ngo', '', 'Spot 1/1');
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
  'Spot 1/1 in round 1 is taken by 2 routes (1, 5)',   // same spot, same round
  'AA33333 is marked Workshop but is on route 6',
  'AA55555 is marked No fuel card but is on route 5',
];
const missing = expected.filter((e) => !warned.includes(e));
const extra = warned.filter((w) => !expected.includes(w));
if (missing.length || extra.length) {
  console.log(`\nwarnings did not match.\n  missing: ${missing.join(' | ') || 'none'}\n  unexpected: ${extra.join(' | ') || 'none'}`);
  process.exit(1);
}
if ((await page.locator('#tab-plan [data-panel="drivers"] li').count()) !== 8
  || (await page.locator('#tab-plan [data-panel="cars"] li').count()) !== 6) {
  console.log('\nthe rail beside the plan is not showing the crew and the fleet');
  process.exit(1);
}
if ((await page.locator('#tab-plan tbody tr.warn').count()) !== 4) {
  console.log(`\nexpected 4 flagged rows, got ${await page.locator('#tab-plan tbody tr.warn').count()}`);
  process.exit(1);
}
await shot('03-day-plan-with-warnings');

await tab('cars');
await shot('04-cars');

// --- data tab and the share code
console.log('data and sharing');
await tab('data');
await page.click('[data-act="share-make"][data-mode="day"]');
await page.waitForFunction(() => document.querySelector('#shareOut')?.value.startsWith('CC1'));
await shot('07-data');

// --- the import preview another PC would see
await page.click('[data-act="tab"][data-tab="data"]');
const code = await page.locator('#shareOut').inputValue();
await page.fill('#shareIn', code);
await page.click('[data-act="share-read"]');
await page.waitForSelector('#shareDlg[open]');
await page.screenshot({ path: `${OUT}/08-import-preview.png` });
console.log(`  ${OUT}/08-import-preview.png`);
await page.click('[data-act="share-cancel"]');

// --- the printout
console.log('printout');
await tab('preview');
await page.waitForSelector('#sheet .qr svg');
await shot('09-print-preview');
await page.pdf({ path: `${OUT}/10-printed-sheet.pdf`, format: 'A4', printBackground: true });
console.log(`  ${OUT}/10-printed-sheet.pdf`);

await browser.close();
server.close();

if (errors.length) {
  console.log(`\n${errors.length} console error(s): ${errors.join(' | ')}`);
  process.exit(1);
}
console.log(`\nno console errors, ${warned.length} warnings raised and asserted`);
