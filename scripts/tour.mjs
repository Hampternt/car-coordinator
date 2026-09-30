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

// (f) Placement: at every width, for a target in the top bar, one far down
// the page, one in the rail (stacked above the table at 1180 and below) and
// a missing one, the card stays in the window and under the bar, the target
// stays uncovered, and the tour adds no sideways scroll. Steps of its own,
// on this page only.
const PLACES = [
  { tab: 'preview', target: '.topbar [data-act="print"]', title: 'In the top bar', text: 'x' },
  { tab: 'plan', target: '#planMap', title: 'Far down the page', text: 'x' },
  { tab: 'plan', target: '#tab-plan .rail-panel[data-panel="cars"] .rail-add', title: 'In the rail', text: 'x' },
  { tab: 'plan', target: '#noSuchThing', title: 'Missing', text: 'x' },
  { tab: 'cars', target: '#newCar', title: 'A box to type in', text: 'x' },
];
const measure = (pg) => pg.evaluate(() => {
  const c = document.querySelector('#tour').getBoundingClientRect();
  const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
  const el = document.querySelector(Tour.STEPS[Number(document.querySelector('#tour .tour-count').textContent.split(' ')[0]) - 1].target);
  const a = el && el.getBoundingClientRect();
  const cx = a && a.left + a.width / 2, cy = a && a.top + a.height / 2;
  // A target in the top bar is in view in the bar; any other, below it.
  const ceiling = el && el.closest('.topbar') ? 0 : bar;
  const inView = !!a && a.width > 0 && cy >= ceiling && cy <= innerHeight && cx >= 0 && cx <= document.documentElement.clientWidth;
  const hit = inView ? document.elementFromPoint(cx, cy) : null;
  return {
    inWindow: c.left >= -0.5 && c.right <= document.documentElement.clientWidth + 0.5 && c.bottom <= innerHeight + 0.5,
    underBar: c.top >= bar - 0.5,
    uncovered: !inView || (!!hit && el.contains(hit)),
    inView,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ring: !document.querySelector('#tourRing').hidden,
    at: [Math.round(c.top), Math.round(c.bottom), Math.round(bar), a && Math.round(a.top), Math.round(scrollY)],
  };
});
for (const [width, height] of [[1680, 1000], [1280, 900], [1024, 768], [900, 600], [390, 844]]) {
  const { ctx, pg } = await openPage({ plan: devPlan, width, height });
  const baseline = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await pg.evaluate((steps) => { Tour.STEPS.splice(0, Tour.STEPS.length, ...steps); }, PLACES);
  await startTour(pg);
  for (let i = 0; i < PLACES.length; i++) {
    if (i) await pg.evaluate((n) => Tour.go(n), i);
    const m = await measure(pg);
    const name = `at ${width}, "${PLACES[i].title}"`;
    check(`${name}: the card is inside the window and under the top bar`, m.inWindow && m.underBar, JSON.stringify(m));
    if (PLACES[i].target === '#noSuchThing') check(`${name}: no ring`, !m.ring);
    else check(`${name}: the target is in view and not covered`, m.inView && m.uncovered, JSON.stringify(m));
    check(`${name}: no sideways scroll beyond the page's own (${baseline}px)`, m.sideways <= baseline, `${m.sideways}px`);
  }
  // Typing while the tour points at a box lands in the box.
  await pg.click('#newCar');
  await pg.keyboard.type('ZZ99999');
  check(`at ${width}, typing into the box the tour points at lands`, (await pg.inputValue('#newCar')) === 'ZZ99999' && await tourOpen(pg));
  // The page scrolled with the tour open: the card follows, still in the
  // window and under the bar.
  await pg.evaluate(() => Tour.go(1));
  await pg.mouse.wheel(0, 250);
  await pg.waitForTimeout(100);
  const m = await measure(pg);
  check(`at ${width}, with the page scrolled under it, the card stays in the window and under the bar`, m.inWindow && m.underBar && m.uncovered, JSON.stringify(m));
  await ctx.close();
}

// (e) Step sync: every step's tab is one of the seven, and its selector
// matches exactly one thing that can be seen, on a first open, on the
// fixture, and on the fixture with a template's contents open (which once
// gave the plan a second first row), at every width the app is used at.
const TABS = ['plan', 'drivers', 'cars', 'positions', 'labels', 'data', 'preview'];
for (const [width, height] of [[1680, 1000], [1280, 900], [1024, 768], [900, 600]]) {
  for (const [what, plan, peek] of [['a first open', null, false], ['the fixture', devPlan, false], ['the fixture with a template open', devPlan, true]]) {
    const { ctx, pg } = await openPage({ plan, width, height });
    if (peek) await pg.evaluate(() => { tplOpen = state.templates[0].id; render(); });
    const found = await pg.evaluate((tabs) => Tour.STEPS.map((s, i) => {
      tab = s.tab;
      render();
      const seen = [...document.querySelectorAll(s.target)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return { step: i + 1, target: s.target, tabOk: tabs.includes(s.tab), seen: seen.length };
    }), TABS);
    const bad = found.filter((f) => !f.tabOk || f.seen !== 1);
    check(`at ${width}, on ${what}, every step's selector matches exactly one thing on a real tab`, !bad.length && found.length === 9,
      bad.map((f) => `step ${f.step} ${f.target}: ${f.tabOk ? '' : 'no such tab, '}${f.seen} seen`).join('; '));
    await ctx.close();
  }
}

// The Tour button, right of Print, opens the tour from every tab and never
// saves: the saved plan is byte-identical either side of the press. Tabs are
// reached with the app's own switch, not a tab click, which saves.
{
  const { ctx, pg } = await openPage({ plan: devPlan });
  const opened = [];
  for (const t of ['plan', 'drivers', 'cars', 'positions', 'labels', 'data', 'preview']) {
    await pg.evaluate((x) => { tab = x; render(); }, t);
    const before = await pg.evaluate(() => localStorage.getItem('carcoord:v1'));
    await pg.click('.topbar [data-act="tour"]');
    const open = await tourOpen(pg) && (await step(pg)).startsWith('1 of');
    const after = await pg.evaluate(() => localStorage.getItem('carcoord:v1'));
    if (!open || after !== before) opened.push(t);
    await pg.keyboard.press('Escape');
  }
  check('the Tour button opens the tour from every tab, and the saved plan is byte-identical either side of the press', !opened.length, opened.join(', '));
  await pg.click('.topbar [data-act="tour"]');
  await pg.keyboard.press('Escape');
  check('closing it puts the focus back on the Tour button', await pg.evaluate(() => document.activeElement.dataset.act === 'tour'));
  check('and it sits right of Print', await pg.evaluate(() => document.querySelector('.topbar [data-act="print"]').nextElementSibling?.dataset.act === 'tour'));
  await pg.click('.topbar [data-act="tour"]');
  await pg.evaluate(() => Tour.go(Tour.STEPS.length - 1));
  check('the last step says where the Tour button is', (await pg.locator('#tour').innerText()).includes('Tour button, right of Print in the top bar'));
  await pg.keyboard.press('Escape');
  await ctx.close();
}

// Room in the top bar, with the Tour button in it: no sideways scroll and no
// tab name on two lines at any of these widths, and above 1180, where the
// rail sticks beside the plan, it sticks below the bar.
{
  let oneLine = null;
  for (const width of [1680, 1250, 1180, 1024, 900]) {
    const { ctx, pg } = await openPage({ plan: devPlan, width, height: 800 });
    const m = await pg.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tabs button')].map((b) => b.getBoundingClientRect().height);
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      const rail = document.querySelector('#tab-plan .rail');
      return {
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tallest: Math.max(...tabs),
        railTop: parseFloat(getComputedStyle(rail).top),
        railSticks: getComputedStyle(rail).position === 'sticky',
        barHeight: bar.height,
      };
    });
    if (oneLine === null) oneLine = m.tallest;
    check(`at ${width}, with the Tour button in the bar, the page does not scroll sideways`, m.sideways <= 0, `${m.sideways}px`);
    check(`at ${width}, no tab name goes onto two lines`, m.tallest <= oneLine + 0.5, `${m.tallest}px against ${oneLine}px`);
    if (width > 1180) check(`at ${width}, the rail sticks below the bar`, m.railSticks && m.railTop >= m.barHeight, JSON.stringify(m));
    await ctx.close();
  }
}

// (g) The offer: on a first-ever open, one notice and it is the offer; never
// with a saved plan, an unreadable save, a share link, the tour already seen
// or a save file linked. Show me around takes that notice away and no other.
{
  const offers = (pg) => pg.locator('#notices .notice [data-act="tour"]').count();
  const fresh = await openPage();
  const pg = fresh.pg;
  check('a fresh browser shows exactly one notice, the offer of the tour, and no warning', (await pg.locator('#notices .notice').count()) === 1
    && (await offers(pg)) === 1 && (await pg.locator('#notices .notice.warn').count()) === 0, await pg.locator('#notices').innerText());
  const before = await storage(pg);
  await pg.evaluate(() => { note('info', 'Something else to say.'); render(); });
  await pg.click('#notices [data-act="tour"]');
  check('Show me around opens the tour and takes the offer away, and only the offer', await tourOpen(pg) && (await offers(pg)) === 0
    && (await pg.locator('#notices .notice', { hasText: 'Something else to say.' }).count()) === 1);
  check('and nothing is saved', !(await pg.evaluate(() => localStorage.getItem('carcoord:v1'))));
  await pg.click('#tour [data-tour="end"]');
  const after = await storage(pg);
  const { 'carcoord:pref:tour': seen, ...rest } = after;
  check('Skip tour writes carcoord:pref:tour and nothing else', seen === 'done' && JSON.stringify(rest) === JSON.stringify(before), JSON.stringify(Object.keys(after)));
  await pg.reload({ waitUntil: 'networkidle' });
  check('with the tour seen, the next open offers nothing', (await offers(pg)) === 0);
  await fresh.ctx.close();

  const cases = [
    ['a saved plan', async (p) => { await p.evaluate((t) => { localStorage.clear(); localStorage.setItem('carcoord:v1', t); }, devPlan); await p.reload({ waitUntil: 'networkidle' }); }],
    ['an unreadable save', async (p) => { await p.evaluate(() => { localStorage.clear(); localStorage.setItem('carcoord:v1', '{"schemaVersion":4, broken'); }); await p.reload({ waitUntil: 'networkidle' }); }],
    // Through a blank page: from the app's own address, a new hash alone is
    // not a new load, and start() would never see it.
    ['a share link', async (p) => { await p.evaluate(() => localStorage.clear()); await p.goto('about:blank'); await p.goto(`${base}#d=CC1notarealcode`, { waitUntil: 'networkidle' }); }],
  ];
  for (const [what, open] of cases) {
    const { ctx, pg: p } = await openPage();
    await open(p);
    check(`no offer with ${what}`, (await offers(p)) === 0, await p.locator('#notices').innerText());
    await ctx.close();
  }
  // A save file linked: checked on the rule itself, since a real handle
  // cannot be put in place before the page starts.
  const { ctx, pg: p } = await openPage();
  const linked = await p.evaluate(() => {
    notices = []; tourOffer = null; firstRun = true;
    Store.file.handle = { name: 'car-coordinator.json' };
    offerTour(false);
    const offered = notices.some((n) => n.offer && n.offer.act === 'tour');
    Store.file.handle = null;
    notices = []; render();
    return offered;
  });
  check('no offer with a save file linked', linked === false);
  await ctx.close();
}

// A right-click on the tour's card is the browser's, with no app entries.
{
  const { ctx, pg } = await openPage({ plan: devPlan });
  await startTour(pg);
  await pg.evaluate(() => { window.addEventListener('contextmenu', (e) => { window.__native = !e.defaultPrevented; }); });
  await pg.locator('#tour h3').click({ button: 'right' });
  check('a right-click on the tour\'s card keeps the browser\'s menu', (await pg.evaluate(() => window.__native)) === true && await pg.locator('#ctxMenu').isHidden());
  await ctx.close();
}

// --- tour: done ---
check('the tour cases log no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} tour check(s) failed` : '\nall tour checks passed');
process.exit(failures.length ? 1 : 0);
