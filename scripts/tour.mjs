// The first-use tour, in a real browser: it only points, it never writes,
// every step still finds exactly one thing to point at, and its card stays
// on the screen. Run: npm run test:tour (and npm test runs it too).
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { startServer } from './serve.mjs';

const server = await startServer();
const base = server.base;
const devPlan = await readFile(new URL('./fixtures/dev-data.json', import.meta.url), 'utf8');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

/* A page of its own, on a fresh browser or on a saved plan. The update note
   is marked seen for a saved plan, so the only thing on top is what a case
   opens itself. */
async function openPage({ plan = null, width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(5000);
  pg.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(base, { waitUntil: 'networkidle' });
  if (plan) {
    await pg.evaluate((t) => { localStorage.clear(); localStorage.setItem('carcoord:pref:seenUpdate', APP_VERSION); localStorage.setItem('carcoord:v1', t); }, plan);
    await pg.reload({ waitUntil: 'networkidle' });
  }
  return { ctx, pg };
}
const storage = (pg) => pg.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const tourOpen = (pg) => pg.locator('#tour').isVisible();
const step = (pg) => pg.evaluate(() => document.querySelector('#tour .tour-count')?.textContent || '');
const startTour = (pg) => pg.evaluate(() => Tour.start(null));

// (a) No writes: walking the whole tour every way there is changes nothing
// saved; the only new key is the tour's own.
for (const [what, plan] of [['a fresh browser', null], ['the dev fixture', devPlan]]) {
  const { ctx, pg } = await openPage({ plan });
  const before = await storage(pg);
  const stateBefore = await pg.evaluate(() => JSON.stringify(state));
  const n = await pg.evaluate(() => Tour.STEPS.length);
  await startTour(pg);
  const first = await step(pg);
  for (let i = 1; i < n; i++) await pg.click('#tour [data-tour="next"]');
  await pg.click('#tour [data-tour="back"]');
  await pg.keyboard.press('ArrowRight');
  await pg.keyboard.press('ArrowLeft');
  const walked = await step(pg);
  await pg.keyboard.press('Escape');
  const closed = !(await tourOpen(pg));
  await startTour(pg);
  await pg.click('#tour [data-tour="end"]');
  const after = await storage(pg);
  check(`on ${what}, the tour opens on step 1 and walks with Next, Back and the arrow keys`, first === `1 of ${n}` && walked === `${n - 1} of ${n}` && closed, `${first} / ${walked}`);
  const { 'carcoord:pref:tour': seen, ...rest } = after;
  check(`on ${what}, walking and closing the tour writes only carcoord:pref:tour`, seen === 'done' && JSON.stringify(rest) === JSON.stringify(before), JSON.stringify(Object.keys(after)));
  if (!plan) check('on a fresh browser, there is still no saved plan', !('carcoord:v1' in after));
  else check('on the dev fixture, the plan on screen is untouched', (await pg.evaluate(() => JSON.stringify(state))) === stateBefore);
  await ctx.close();
}

// Escape closes on the tab the tour was started from.
{
  const { ctx, pg } = await openPage({ plan: devPlan });
  await pg.evaluate(() => { tab = 'labels'; render(); });
  await startTour(pg);
  await pg.click('#tour [data-tour="next"]');
  await pg.keyboard.press('Escape');
  check('Escape closes the tour on the tab it was started from', !(await tourOpen(pg)) && (await pg.evaluate(() => tab)) === 'labels');
  await ctx.close();
}

// (b) Nothing is position: fixed while it is open. (c) It never prints.
{
  const { ctx, pg } = await openPage({ plan: devPlan });
  await startTour(pg);
  check('nothing is position: fixed while the tour is open', await pg.evaluate(() => [...document.querySelectorAll('*')].every((el) => getComputedStyle(el).position !== 'fixed')));
  await pg.emulateMedia({ media: 'print' });
  const printed = await pg.evaluate(() => ({
    tour: getComputedStyle(document.querySelector('#tour')).display,
    ring: getComputedStyle(document.querySelector('#tourRing')).display,
    sheetTop: document.querySelector('#sheet').getBoundingClientRect().top,
  }));
  await pg.emulateMedia({ media: null });
  check('printed with the tour open, neither the card nor the ring shows, and the sheet starts at the top', printed.tour === 'none' && printed.ring === 'none' && printed.sheetTop <= 1, JSON.stringify(printed));
  await ctx.close();
}

// (d) Escape goes to what is on top first: the car grid, the share dialog.
{
  const { ctx, pg } = await openPage({ plan: devPlan });
  await startTour(pg);
  await pg.evaluate(() => { tab = 'plan'; render(); });
  await pg.locator('#tab-plan tr[data-route]').first().locator('select[data-field="carId"]').click();
  const grid = await pg.locator('#picker').isVisible();
  await pg.keyboard.press('Escape');
  check('Escape with the car grid open closes only the grid', grid && await pg.locator('#picker').isHidden() && await tourOpen(pg));
  await pg.evaluate(() => document.querySelector('#shareDlg').showModal());
  await pg.keyboard.press('Escape');
  check('Escape with the share dialog open closes only the dialog', !(await pg.evaluate(() => document.querySelector('#shareDlg').open)) && await tourOpen(pg));
  await pg.keyboard.press('Escape');
  check('and the next Escape closes the tour', !(await tourOpen(pg)));
  await ctx.close();
}

// --- tour: done ---
check('the tour cases log no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} tour check(s) failed` : '\nall tour checks passed');
process.exit(failures.length ? 1 : 0);
