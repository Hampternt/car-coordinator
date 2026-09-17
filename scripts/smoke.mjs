// Headless smoke test. Serves docs/ over http (File System Access and
// clipboard APIs need a secure-ish origin), drives the UI, and fails on any
// console error. Run: npm test
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

// CI and this container ship Chromium at a fixed path; fall back to whatever
// Playwright manages locally.
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: 'networkidle' });

// --- first run ---
check('loads with an empty car list', await page.locator('#tab-plan .empty').isVisible());

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

// --- the sheet reflects the plan ---
await page.click('[data-act="tab"][data-tab="preview"]');
const sheet = await page.locator('#sheet').innerText();
check('sheet shows the driver', sheet.includes('Test Driver'));
check('sheet shows the car', sheet.includes('AA11111'));

// --- survives a reload (localStorage) ---
await page.reload({ waitUntil: 'networkidle' });
check('state survives a reload', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Test Driver');

// --- backups and restore ---
await page.click('[data-act="clear-day"]');
await page.click('[data-act="clear-day"]');           // two-click confirm
check('clear wipes the driver', (await firstRow.locator('[data-field="driver"]').inputValue()) === '');
await page.click('[data-act="tab"][data-tab="data"]');
check('clearing left a backup', (await page.locator('#tab-data table tbody tr').count()) >= 1);
const restoreBtn = page.locator('[data-act="restore"]').first();
await restoreBtn.click();
await restoreBtn.click();                             // two-click confirm
await page.click('[data-act="tab"][data-tab="plan"]');
check('restore brings the driver back', (await firstRow.locator('[data-field="driver"]').inputValue()) === 'Test Driver');

// --- export / import round trip ---
await page.click('[data-act="tab"][data-tab="data"]');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
const exported = await readFile(await download.path(), 'utf8');
const parsed = JSON.parse(exported);
check('export is valid Car Coordinator JSON', parsed.schemaVersion === 1 && parsed.cars.length === 3);

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
  positions: [{ id: 'p1', name: 'Spot 9/9' }],
  routes: [{ id: 'r1', name: '1', carId: 'ghost', positionId: 'p1', driver: 'Kept' }],
})));
await page.reload({ waitUntil: 'networkidle' });
check('repairs a dangling car reference', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="carId"]').inputValue()) === '');
check('keeps the good fields while repairing', (await page.locator('#tab-plan tbody tr').first().locator('[data-field="driver"]').inputValue()) === 'Kept');

await page.evaluate(() => localStorage.setItem('carcoord:v1', JSON.stringify({ schemaVersion: 99, date: '2026-01-01', cars: [], positions: [], labels: [], routes: [] })));
await page.reload({ waitUntil: 'networkidle' });
check('warns about data from a newer version', (await page.locator('#notices .notice.warn').innerText()).includes('newer version'));

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
