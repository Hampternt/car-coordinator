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

// --- sharing between two PCs ---
// Seed a plan on "PC A", copy the code, and load it on a fresh profile that
// has its own ids for everything: the payload must survive that.
const planA = {
  schemaVersion: 1, date: '2026-09-18',
  labels: [{ id: 'L1', name: 'Workshop', color: '#6a1b9a' }],
  cars: [{ id: 'a1', reg: 'AA11111', labelId: '', note: '' }, { id: 'a2', reg: 'BB22222', labelId: 'L1', note: 'back Friday' }],
  positions: [{ id: 'q1', name: 'Spot 1/1', multi: false, labelId: '', note: '' }, { id: 'q2', name: 'Garage', multi: true, labelId: '', note: '' }],
  routes: [
    { id: 'x1', name: '1', driver: 'Ana', carId: 'a1', positionId: 'q1', highlight: true, gapBefore: false },
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

// --- the QR on the printed sheet ---
// 30mm at 300dpi is ~354px, so decoding at that size is the question that
// actually matters: will it scan off the paper?
await page.click('[data-act="tab"][data-tab="preview"]');
await page.waitForSelector('#sheet .qr svg', { timeout: 5000 }).catch(() => {});
check('the sheet carries a QR code', (await page.locator('#sheet .qr svg').count()) === 1);

const qrRead = await page.evaluate(async () => {
  await QR.loadDecoder();
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
  positions: [{ id: 'yyy', name: 'Spot 1/1', multi: false, labelId: '', note: '' }],
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
const carSel = rowsB.first().locator('[data-field="carId"]');
check('matched the car it already had, case-insensitively', (await carSel.inputValue()) === 'zzz');
check('added the car it did not have', (await rowsB.nth(1).locator('[data-field="carId"] option:checked').innerText()).includes('BB22222'));
await b.click('[data-act="tab"][data-tab="preview"]');
const sheetB = await b.locator('#sheet').innerText();
check('the pink row and the gap survived', (await b.locator('#sheet tr.hl').count()) === 1 && (await b.locator('#sheet tr.spacer').count()) === 1);
check('sheet on PC B shows the shared date', sheetB.includes('18/09/2026'));

// "Everything" mode carries the car notes and labels too.
await b.click('[data-act="tab"][data-tab="data"]');
await readCode(b, allCode);
await b.check('#shareDlg input[value="all"]');
await b.click('[data-act="share-apply"]');
await b.click('[data-act="tab"][data-tab="cars"]');
const bbRow = b.locator('#tab-cars tbody tr', { has: b.locator('[data-field="reg"][value="BB22222"]') });
check('everything mode brings the note across', (await bbRow.locator('[data-field="note"]').inputValue()) === 'back Friday');
check('everything mode brings the label across', (await bbRow.locator('.chip.on').innerText()) === 'Workshop');

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

// --- prints to A4 ---
const pdf = await page.pdf({ format: 'A4', printBackground: true });
check('renders a non-empty A4 PDF', pdf.length > 1000, `${pdf.length} bytes`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
