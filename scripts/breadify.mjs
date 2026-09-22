// Headless smoke test for Breadify. Serves docs/, drives the four steps with
// the two real exports, and checks the printed sheets against the figures the
// Breadify repo's docs state — the route 8 worked example, Customer 012's
// crate count, Kneippbrød's tray dots, the freezer day's sheet count.
//
// Those numbers are the point. Anyone can rewrite the layout; the test is
// whether it still prints the same picking list. Run: npm run test:breadify
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer();
const base = server.base;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const BREAD = 'PSR-BREAD-2026-03-04-to-2026-03-04 (1).xlsx';
const FREEZER = 'PSR-FREEZER-2026-01-23-to-2026-01-23 (1).xlsx';

const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));

await page.goto(`${base}breadify/`, { waitUntil: 'networkidle' });

// Every measurement on the sheet assumes these eight faces. A face that did
// not load silently re-typesets the whole page, so this is checked first.
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return [
    ['Space Grotesk', '11pt "Space Grotesk"'],
    ['Archivo 800', '800 14pt Archivo'],
    ['Archivo 900', '900 25pt Archivo'],
    ['IBM Plex Mono', '11pt "IBM Plex Mono"'],
  ].filter(([, face]) => !document.fonts.check(face)).map(([name]) => name);
});
same('the sheet’s own faces all load', fonts, []);

// ── 01 Open ────────────────────────────────────────────────────────────────

// The two jokes. They carry no information, but a 404 behind one is still a
// broken asset shipped to Pages.
const noBread = await page.evaluate(
  () =>
    getComputedStyle(document.querySelector('#step-open .drop'), '::before').backgroundImage,
);
check(
  'the Open step wears its joke while nothing is open',
  noBread.includes('nobread.jpg'),
  noBread,
);

await page.setInputFiles('#file', `scripts/fixtures/${BREAD}`);
await page.waitForSelector('#step-check:not([hidden])', { timeout: 20000 });

const breadGuy = await page.evaluate(() => ({
  image: getComputedStyle(document.getElementById('step-check'), '::before').backgroundImage,
  // The finding cards are translucent for his sake; an opaque one deletes him.
  cards: getComputedStyle(document.querySelector('.finding')).backgroundColor,
  openJokeGone: !document.getElementById('step-open').classList.contains('empty-handed'),
}));
check(
  'the Check step wears its own, behind translucent finding cards',
  breadGuy.image.includes('breadmve.jpg') && /rgba\(.+0\.5\d*\)/.test(breadGuy.cards),
  `${breadGuy.image} / ${breadGuy.cards}`,
);
check('the Open step’s joke retires once a file is open', breadGuy.openJokeGone);

// ── 02 Check ───────────────────────────────────────────────────────────────

const read = await page.evaluate(() => ({
  stats: Array.from(document.querySelectorAll('.stat')).map((s) => [
    s.querySelector('b').textContent,
    s.querySelector('span').textContent,
  ]),
  kind: document.getElementById('mode').dataset.kind,
  findings: Array.from(document.querySelectorAll('.finding')).map((f) => [
    f.dataset.severity,
    f.querySelector('summary').lastChild.textContent,
  ]),
}));

same(
  'the bread export reads as 16 routes, 148 stops, 352 lines',
  read.stats,
  [
    ['16', 'routes'],
    ['148', 'stops'],
    ['352', 'lines'],
    ['2026-03-04', 'delivery'],
  ],
);
check('the kind comes from the filename', read.kind === 'bread');
// docs/freezer-format.md §4: this file yields exactly two notices.
same(
  'the sample validates with two notices and nothing blocking',
  read.findings,
  [
    ['notice', '37 rows have no position in their route'],
    ['notice', 'Column O carries no header'],
  ],
);

// ── The data spine, against the figures the docs state ─────────────────────

// The app keeps its own state private, so these are recomputed inside the
// page from the very modules it loaded. The fixtures live outside docs/ and
// are not served, so they are handed in as bytes.
const { readFile } = await import('node:fs/promises');
const breadBytes = Array.from(await readFile(`scripts/fixtures/${BREAD}`));

const bread = await page.evaluate(async ([bytes]) => {
  const book = await Xlsx.open(new Uint8Array(bytes).buffer);
  const rows = Model.readRows(await book.sheet('Data'));
  const routes = Model.group(Model.fold(rows));
  const rules = Model.defaultCrateRules();

  const route8 = routes.find((r) => r.nickname === '8');
  const total8 = Model.routeTotal(route8);
  const route11 = routes.find((r) => r.nickname === '11');
  const kneipp = Model.routeTotal(route11)
    .columns.flatMap((c) => c.lines)
    .find((l) => /Kneipp/i.test(l.product.name));
  const c012 = routes
    .flatMap((r) => r.stops)
    .filter((s) => s.customer === 'Customer 012');

  return {
    order: routes.map((r) => r.nickname),
    route8: route8.stops.map((s) => [
      s.sequence,
      s.customer,
      s.deliveryStreet,
      Model.crateCount(s, rules),
    ]),
    total8: [
      Model.totalTypes(total8),
      Model.totalUnits(total8),
      Model.totalFullTens(total8),
      total8.columns.map((c) => [c.supplier, c.lines.length, Model.columnUnits(c)]),
    ],
    kneippDots: kneipp.fullTens,
    kneippUnits: kneipp.units,
    c012: [c012.length, c012.reduce((n, s) => n + Model.crateTotal(Model.crateCount(s, rules)), 0)],
    pallets: routes
      .filter((r) => Model.routeCrates(r, rules) > Model.PALLET_THRESHOLD)
      .map((r) => r.nickname),
  };
}, [breadBytes]);

// docs/print-spec.md §2 and excel-format.md §4: the natural sort. Sorting
// these as text gives 1, 10, 11, … 2, which is the single most likely bug in
// this app.
same(
  'routes sort naturally, not lexically',
  bread.order,
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', 'hau 1', 'hau 2'],
);

// docs/excel-format.md §5, worked example.
same(
  'route 8 is the five stops the worked example names, in order',
  bread.route8,
  [
    [100, 'Customer 024', 'Street 24', { large: 1, small: 1 }],
    [1100, 'Customer 041', 'Street 42', { large: 1, small: 0 }],
    [2100, 'Customer 005', 'Street 05', { large: 1, small: 0 }],
    // Unsequenced, tiebroken by address: Street 55 before Street 71.
    [0, 'Customer 054', 'Street 55', { large: 1, small: 0 }],
    [0, 'Customer 070', 'Street 71', { large: 0, small: 1 }],
  ],
);

// docs/print-spec.md §10.
same(
  'route 8’s total is 7 types, 43 units and one full tray',
  bread.total8,
  [
    7,
    43,
    1,
    [
      ['sandnes bakeri', 6, 33],
      ['bakehuset', 1, 10],
    ],
  ],
);

// docs/print-spec.md §13, acceptance check 8: the dots count full tens
// *within an order*, so 2+7+4+10+11+20+6+8 is four, not six.
check(
  'the tray dots count full tens inside one order',
  bread.kneippUnits === 68 && bread.kneippDots === 4,
  `${bread.kneippUnits} units, ${bread.kneippDots} dots`,
);

// docs/print-spec.md §10: "Customer 012 is 13 crates, not nine." Nine is the
// department count.
same('Customer 012 is nine departments and thirteen crates', bread.c012, [9, 13]);

// D25: more than 16 crates on a route and the page note asks for a pallet.
same('six routes ask for a pallet', bread.pallets, ['3', '4', '5', '9', '11', '13']);

// ── 03 Configure ───────────────────────────────────────────────────────────

await page.click('#advance');
await page.waitForSelector('#step-configure:not([hidden])');
check(
  'the configure step lists every bread for sizing',
  (await page.locator('.size').count()) === 35,
);
check('the crate rules are offered for a bread list', await page.locator('#cratePane').isVisible());

// ── 04 Print ───────────────────────────────────────────────────────────────

await page.click('#advance');
await page.waitForSelector('#step-print:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#preview .bf-sheet').length > 0, {
  timeout: 30000,
});

const sheets = await page.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'width:100mm;position:absolute;visibility:hidden';
  document.body.append(probe);
  const perPx = 100 / probe.getBoundingClientRect().width;
  probe.remove();

  return Array.from(document.querySelectorAll('#preview .bf-sheet')).map((sheet) => {
    const body = sheet.querySelector('.bf-body');
    const footer = sheet.querySelector('.bf-footer');
    const last = body.lastElementChild;
    const top = last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().top;
    return {
      route: sheet.dataset.route,
      page: Number(sheet.dataset.page),
      of: Number(sheet.dataset.of),
      clearance: (footer.getBoundingClientRect().top - top) * perPx,
      overflow: (sheet.scrollHeight - sheet.clientHeight) * perPx,
      masthead: sheet.querySelector('.bf-route-number').textContent,
      note: sheet.querySelector('.bf-note div').textContent,
      footer: footer.firstElementChild.textContent,
      blocks: sheet.querySelectorAll('.bf-block').length,
      hasTotal: !!sheet.querySelector('.bf-total'),
      products: Array.from(sheet.querySelectorAll('.bf-product')).map((n) => n.textContent),
      // The stop blocks, less the fields that legitimately carry digits of
      // their own: the order id, the quantities, and the product names, which
      // are full of them (`Oppskåret 750g`, `12biter 1370g`) and print
      // verbatim by D14. The blocks are where a sequence number would surface
      // if D6 were broken — the page furniture's counts and subtotals are
      // derived numbers that have nothing to do with it.
      blockProse: (() => {
        const copy = sheet.cloneNode(true);
        for (const node of copy.querySelectorAll('.bf-order-id, .bf-qty, .bf-product')) {
          node.remove();
        }
        return Array.from(copy.querySelectorAll('.bf-block'))
          .map((block) => block.textContent)
          .join(' ');
      })(),
    };
  });
});

// D1: a route always starts a fresh page, and no page ever carries two. The
// sheets come out in route order, so a route whose sheets are not contiguous
// would mean one of them landed on another route's paper.
const order = sheets.map((s) => s.route);
const contiguous = order.every((route, index) => index === 0 || route === order[index - 1] || !order.slice(0, index).includes(route));
check(
  'the day is one route per sheet set',
  new Set(order).size === 16 && contiguous && sheets.every((s) => s.page <= s.of),
  `${new Set(order).size} routes over ${sheets.length} sheets`,
);

// docs/print-spec.md §9 and the handoff's page budgets: below 10 mm a printer
// with slightly different text metrics silently clips a row.
const tight = sheets.filter((s) => s.clearance < 10);
same(
  'every sheet keeps 10 mm of clearance above its footer',
  tight.map((s) => [s.route, s.page, Math.round(s.clearance * 10) / 10]),
  [],
);
const spilling = sheets.filter((s) => s.overflow > 0.5);
same(
  'nothing runs off the bottom of a sheet',
  spilling.map((s) => [s.route, s.page, Math.round(s.overflow * 10) / 10]),
  [],
);

// The handoff's verified budget: route 8 is 5 stops, 13 lines and its total,
// on one sheet.
const route8 = sheets.filter((s) => s.route === '8');
check(
  'route 8 fits one sheet, total and all',
  route8.length === 1 && route8[0].blocks === 5 && route8[0].hasTotal,
  `${route8.length} sheets, ${route8[0] && route8[0].blocks} blocks`,
);

// Each route's total closes its last page and nothing else.
const totals = sheets.filter((s) => s.hasTotal);
check(
  'each route’s total closes its last page',
  totals.length === 16 && totals.every((s) => s.page === s.of),
  `${totals.length} totals`,
);

// docs/print-spec.md §13, acceptance check 6.
const hau = sheets.find((s) => s.route === 'hau 1');
check(
  '`hau 1` prints as `hau 1`, never as `1`',
  hau && hau.masthead === 'hau 1' && hau.note.startsWith('Route hau 1 in full'),
  hau ? `${hau.masthead} / ${hau.note}` : 'no sheet',
);

// acceptance check 5: the order of the blocks carries the sequence, so the
// number itself never prints (D6).
//
// Scanning the real sheets for the real sequences only finds `Customer 100`
// and `Oppskåret 750g`, so the check is made exact instead: a route whose
// sequences are values nothing else on a page could be. If any of them
// surfaces, `Route ordering` is being printed.
const sequenceLeak = await page.evaluate(() => {
  const marks = [811931, 811933, 811937];
  const route = {
    nickname: '1',
    stops: marks.map((sequence, index) => ({
      id: 1000000000 + index,
      customer: `Stop ${index}`,
      department: index === 1 ? 'Kitchen' : null,
      deliveryStreet: `Street ${index}`,
      route: '1',
      sequence,
      acceptAlternatives: index !== 2,
      comment: null,
      lines: [
        {
          product: { id: 1, name: 'Grovbrød', sku: 'x', supplier: 'sandnes bakeri' },
          quantity: 3,
        },
      ],
    })),
  };
  const settings = {
    kind: Model.BREAD,
    showOrderId: true,
    marker: 'word-only',
    crates: Model.defaultCrateRules(),
  };
  const printed = Sheet.paginate(
    route,
    settings,
    { dates: null, source: 'test', routeStops: 3, routeLines: 3 },
    {},
  )
    .map((sheet) => sheet.textContent)
    .join(' ');
  return marks.filter((mark) => printed.includes(String(mark)));
});
same('the sequence number is never printed', sequenceLeak, []);

// acceptance check 7: names print exactly as the file has them (D14).
const truncated = sheets
  .flatMap((s) => s.products)
  .filter((name) => name.includes('…') || name.includes('...'));
same('no product name is truncated', truncated.slice(0, 3), []);

// The footer says where the route goes next.
const continued = sheets.filter((s) => s.of > 1 && s.page < s.of);
check(
  'a continued route says so in its footer',
  continued.every((s) => s.footer === `Route ${s.route} continues on page ${s.page + 1}`),
  continued[0] && continued[0].footer,
);
check(
  'a route’s last sheet says it ends',
  sheets.filter((s) => s.page === s.of).every((s) => s.footer === `Route ${s.route} — end of route`),
);

// ── The freezer list ───────────────────────────────────────────────────────

const freezerBytes = Array.from(await readFile(`scripts/fixtures/${FREEZER}`));
await page.goto(`${base}breadify/`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.setInputFiles('#file', `scripts/fixtures/${FREEZER}`);
await page.waitForSelector('#step-check:not([hidden])', { timeout: 20000 });

check(
  'the freezer export is recognised from its filename',
  (await page.getAttribute('#mode', 'data-kind')) === 'freezer',
);
same(
  'the freezer sample validates with the same two notices',
  await page.$$eval('.finding', (ns) =>
    ns.map((f) => [f.dataset.severity, f.querySelector('summary').lastChild.textContent]),
  ),
  [
    ['notice', '28 rows have no position in their route'],
    ['notice', 'Column O carries no header'],
  ],
);

await page.click('#advance');
await page.waitForSelector('#step-configure:not([hidden])');
// F4: nothing on a freezer sheet reads the crate sizes.
check(
  'the crate rules are not offered for a freezer list',
  !(await page.locator('#cratePane').isVisible()),
);

await page.click('#advance');
await page.waitForSelector('#step-print:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#preview .bf-sheet').length > 0, {
  timeout: 30000,
});

const freezer = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('#preview .bf-sheet'));
  const first = all[0];
  return {
    count: all.length,
    routes: new Set(all.map((s) => s.dataset.route)).size,
    note: first.querySelector('.bf-note div').textContent,
    legend: first.querySelector('.bf-legend').textContent.replace(/\s+/g, ' ').trim(),
    crates: all.reduce((n, s) => n + s.querySelectorAll('.bf-block .bf-crate').length, 0),
    noteFields: first.querySelectorAll('.bf-note-field').length,
    lines: first.querySelectorAll('.bf-row').length,
    tens: all.reduce((n, s) => n + s.querySelectorAll('.bf-total-dots .bf-dot').length, 0),
  };
});

// docs/freezer-list.md: "The sample freezer day prints as 15 routes over 21
// sheets."
check(
  'the freezer day is 15 routes over 21 sheets',
  freezer.routes === 15 && freezer.count === 21,
  `${freezer.routes} routes over ${freezer.count} sheets`,
);
// F7: the page note says `check list`, so the two sheets cannot be mistaken
// for one another in a stack.
check(
  'the freezer page note says it is a check list',
  freezer.note.includes('check list'),
  freezer.note,
);
// F7/F8: `P Picked` becomes `C Checked`, `F` is gone, and there is no crate key.
check(
  'the freezer legend reads C Checked · M Missing with no crates',
  freezer.legend.includes('Checked') &&
    freezer.legend.includes('Missing') &&
    !freezer.legend.includes('Fixed') &&
    !freezer.legend.includes('CRATES') &&
    !/Crates/i.test(freezer.legend),
  freezer.legend,
);
// F4: a checker counts nothing into crates, and F9 drops the tray dots too.
check('a freezer sheet draws no crate glyphs', freezer.crates === 0, String(freezer.crates));
check('a freezer total has no tray dots', freezer.tens === 0, String(freezer.tens));
// F8: every check line carries the dotted field for the checker's pen.
check(
  'every check line has a note field',
  freezer.noteFields === freezer.lines,
  `${freezer.noteFields} of ${freezer.lines}`,
);

// F10: flipping the kind re-runs validation on the spot, since what counts as
// familiar depends on it.
await page.click('[data-step="check"]');
await page.click('.mode-buttons button[data-kind="bread"]');
const flipped = await page.$$eval('.finding', (ns) => ns.length);
check(
  'treating the freezer file as bread reports its unfamiliar suppliers',
  flipped > 2,
  `${flipped} findings`,
);

// ── Console ────────────────────────────────────────────────────────────────

// ── Shapes the warehouse could hand it one morning ─────────────────────────
//
// The two sample exports are one good day. These are the awkward days:
// a third bakery, a canteen with a very long name, an order with more lines
// than a sheet holds. Every one of them used to put ink outside the paper —
// silently, which is the part that mattered: a picking list is only useful if
// what is missing from it is missing from the van too.
//
// scripts/make_edge_fixtures.py regenerates them.

const EDGE = [
  ['suppliers-12', 'twelve bakeries on one route'],
  ['supplier-code-collision', 'two bakeries deriving the same code'],
  ['one-giant-stop', 'one order with 300 product lines'],
  ['200-stops', 'two hundred stops on one route'],
  ['long-customer', 'a customer name 200 characters long'],
  ['long-department', 'a department spelled out in full'],
  ['long-route-name', 'a route nicknamed in a sentence'],
  ['long-supplier', 'a bakery with nine words in its name'],
];

for (const [fixture, what] of EDGE) {
  const bytes = Array.from(
    await readFile(`scripts/fixtures/edge/PSR-BREAD-2026-03-04-to-2026-03-04-${fixture}.xlsx`),
  );
  const shape = await page.evaluate(async ([b]) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0';
    document.body.append(host);
    const ruler = document.createElement('div');
    ruler.style.cssText = 'width:100mm;position:absolute;visibility:hidden';
    document.body.append(ruler);
    const perPx = 100 / ruler.getBoundingClientRect().width;
    ruler.remove();
    try {
      const book = await Xlsx.open(new Uint8Array(b).buffer);
      const rows = Model.readRows(await book.sheet('Data'));
      const settings = {
        kind: Model.BREAD,
        showOrderId: true,
        marker: 'word-only',
        crates: Model.defaultCrateRules(),
      };
      const pages = [];
      for (const route of Model.group(Model.fold(rows))) {
        pages.push(
          ...Sheet.paginate(
            route,
            settings,
            { dates: null, source: 'edge', routeStops: route.stops.length,
              routeLines: Model.lineCount(route) },
            { host },
          ),
        );
      }
      for (const sheet of pages) host.appendChild(sheet);

      let down = 0;
      let across = 0;
      let clearance = Infinity;
      for (const sheet of pages) {
        const body = sheet.querySelector('.bf-body');
        const foot = sheet.querySelector('.bf-footer');
        const last = body.lastElementChild;
        const bottom = last
          ? last.getBoundingClientRect().bottom
          : body.getBoundingClientRect().top;
        clearance = Math.min(clearance, (foot.getBoundingClientRect().top - bottom) * perPx);
        down = Math.max(down, (sheet.scrollHeight - sheet.clientHeight) * perPx);
        const edge =
          sheet.getBoundingClientRect().right -
          parseFloat(getComputedStyle(sheet).paddingRight);
        for (const node of sheet.querySelectorAll('.bf-name, .bf-product, .bf-dpt-name, .bf-total-product, .bf-route-number, .bf-crates, .bf-total-col')) {
          across = Math.max(across, (node.getBoundingClientRect().right - edge) * perPx);
        }
      }
      // Every code the lines print has to be spelled out in the key above them.
      const codes = new Set(Array.from(host.querySelectorAll('.bf-code'), (n) => n.textContent));
      const key = pages[0].querySelector('.bf-legend-suppliers').textContent;
      const unexplained = Array.from(codes).filter((code) => !key.includes(code));
      return {
        pages: pages.length,
        down: Math.round(down * 10) / 10,
        across: Math.round(across * 10) / 10,
        clearance: Math.round(clearance * 10) / 10,
        unexplained,
      };
    } finally {
      host.remove();
    }
  }, [bytes]);

  check(
    `${what}: nothing runs off the paper`,
    shape.down <= 0.5 && shape.across <= 0.5,
    `${shape.down} mm down, ${shape.across} mm across, ${shape.pages} sheets`,
  );
  check(
    `${what}: every sheet still keeps its 10 mm`,
    shape.clearance >= 10,
    `${shape.clearance} mm`,
  );
  same(`${what}: no code prints without the key explaining it`, shape.unexplained, []);
}

same('no console errors', errors.slice(0, 5), []);

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
