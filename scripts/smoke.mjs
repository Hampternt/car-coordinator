// Headless smoke test. Serves docs/ over http (File System Access and
// clipboard APIs need a secure-ish origin), drives the UI, and fails on any
// console error. Run: npm test
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

// --- prints to A4 ---
const pdf = await page.pdf({ format: 'A4', printBackground: true });
check('renders a non-empty A4 PDF', pdf.length > 1000, `${pdf.length} bytes`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
