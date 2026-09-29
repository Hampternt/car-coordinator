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

// The checks every printed sheet has to pass, whoever made it: the two sample
// days and every edge fixture alike. Installed into each page load, so any
// evaluate below can hand it the sheets it laid out.
//
// Staying inside the paper is not the same as being readable. Two things fit
// a sheet perfectly well and still make it useless: type set on top of other
// type, and type clipped away by the box holding it. Both happened — a
// quantity of 2147483648 printed through "Rundstykke", and the supplier key
// lost its last codes off the end of the band — and neither moved a single
// bounding box outside the page. The marker, the stamp and the order id are
// in the lists because they are what tells one order from another.
await page.addInitScript(() => {
  window.inspectSheets = (sheets) => {
    const ruler = document.createElement('div');
    ruler.style.cssText = 'width:100mm;position:absolute;visibility:hidden';
    document.body.append(ruler);
    const perPx = 100 / ruler.getBoundingClientRect().width;
    ruler.remove();

    let down = 0;
    let across = 0;
    let clearance = Infinity;
    const collisions = [];
    const clipped = [];
    let printed = '';
    for (const sheet of sheets) {
      const body = sheet.querySelector('.bf-body');
      const foot = sheet.querySelector('.bf-footer');
      const last = body.lastElementChild;
      const bottom = last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().top;
      clearance = Math.min(clearance, (foot.getBoundingClientRect().top - bottom) * perPx);
      down = Math.max(down, (sheet.scrollHeight - sheet.clientHeight) * perPx);

      const edge =
        sheet.getBoundingClientRect().right - parseFloat(getComputedStyle(sheet).paddingRight);
      for (const node of sheet.querySelectorAll(
        '.bf-name, .bf-product, .bf-dpt-name, .bf-total-product, .bf-route-number, .bf-crates, ' +
          '.bf-total-col, .bf-stamp, .bf-marker, .bf-order-id, .bf-row-stamp, .bf-dpt-sub',
      )) {
        across = Math.max(across, (node.getBoundingClientRect().right - edge) * perPx);
      }

      for (const line of sheet.querySelectorAll('.bf-row, .bf-total-row, .bf-total-head, .bf-head-line')) {
        const kids = Array.from(line.children)
          .map((node) => ({ name: node.className.split(' ')[0], box: node.getBoundingClientRect() }))
          .filter((k) => k.box.width > 0);
        for (let i = 0; i < kids.length; i += 1) {
          for (let j = i + 1; j < kids.length; j += 1) {
            const a = kids[i].box;
            const b = kids[j].box;
            const sameLine = a.top < b.bottom - 1 && b.top < a.bottom - 1;
            const over = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            if (sameLine && over > 1) collisions.push(`${kids[i].name}/${kids[j].name}`);
          }
        }
      }
      for (const node of sheet.querySelectorAll(
        '.bf-legend-suppliers, .bf-code, .bf-qty, .bf-total-qty, .bf-name, .bf-total-name, ' +
          '.bf-stamp, .bf-marker, .bf-order-id, .bf-dpt-sub, .bf-product',
      )) {
        if (node.scrollWidth > node.clientWidth + 1) clipped.push(node.className.split(' ')[0]);
      }
      printed += ` ${sheet.textContent}`;
    }

    return {
      sheets: sheets.length,
      // The flag belongs above the stops it covers, never alone at a foot.
      flagLast: sheets
        .filter((sheet) => {
          const last = sheet.querySelector('.bf-body').lastElementChild;
          return last && last.classList.contains('bf-flag');
        })
        .map((sheet) => `${sheet.dataset.route}/${sheet.dataset.page}`),
      down: Math.round(down * 10) / 10,
      across: Math.round(across * 10) / 10,
      clearance: Math.round(clearance * 10) / 10,
      collisions: Array.from(new Set(collisions)),
      clipped: Array.from(new Set(clipped)),
      // A number that went wrong shows up as one of these on the paper.
      nonsense: ['NaN', 'Infinity', 'undefined', '[object'].filter((w) => printed.includes(w)),
      zoomed: sheets.some((sheet) => sheet.style.zoom !== ''),
    };
  };

  // The owner's order for an order's lines (2026-09-29), written out again
  // here so the suite does not take the app's word for it: Sandnes Bakeri,
  // then Bakehuset, then any other supplier A to Z by its code and then its
  // name, then no supplier; within a supplier, by bread name, Norwegian
  // alphabet. Ties keep the file's order.
  window.printOrder = (lines) => {
    const nb = new Intl.Collator('nb');
    const key = (line) => {
      const supplier = String(line.product.supplier || '');
      const lower = supplier.toLowerCase();
      if (supplier.trim() === '') return [3, '', ''];
      if (lower === 'sandnes bakeri') return [0, '', ''];
      if (lower === 'bakehuset') return [1, '', ''];
      return [2, Model.supplierCode(supplier), lower];
    };
    return lines
      .map((line, index) => ({ line, index, key: key(line) }))
      .sort(
        (a, b) =>
          a.key[0] - b.key[0] ||
          nb.compare(a.key[1], b.key[1]) ||
          nb.compare(a.key[2], b.key[2]) ||
          nb.compare(a.line.product.name, b.line.product.name) ||
          a.index - b.index,
      )
      .map((entry) => entry.line);
  };

  // Every order's lines as they printed — a one-order block's by the id in
  // its heading, a shared block's by the id on each line, parts joined — held
  // against printOrder() of the file's own lines (`orders`: Model.fold's, by
  // id, so still in file order). Needs "Show the order ID" on. `reordered`
  // counts the orders the owner's order actually moved.
  window.readOrderLines = (sheets, orders) => {
    const printed = new Map();
    for (const sheet of sheets) {
      for (const block of sheet.querySelectorAll('.bf-block')) {
        const head = block.querySelector(':scope > .bf-head-line .bf-stamp .bf-order-id');
        for (const row of block.querySelectorAll('.bf-row')) {
          const id = Number((row.querySelector('.bf-order-id') || head).textContent);
          if (!printed.has(id)) printed.set(id, []);
          printed.get(id).push([
            Number(row.querySelector('.bf-qty').textContent),
            row.querySelector('.bf-code').textContent,
            row.querySelector('.bf-product').textContent,
          ]);
        }
      }
    }
    const shape = (lines) =>
      lines.map((l) => [l.quantity, Model.supplierCode(l.product.supplier), l.product.name]);
    const problems = [];
    let reordered = 0;
    let bakehusetFirstInFile = 0;
    for (const [id, rows] of printed) {
      const order = orders.get(id);
      if (!order) {
        problems.push(`${id}: printed, but no order of this day`);
        continue;
      }
      const want = shape(printOrder(order.lines));
      if (JSON.stringify(rows) !== JSON.stringify(want)) {
        problems.push(`${id}: printed ${JSON.stringify(rows.map((r) => r[2]))}, wanted ${JSON.stringify(want.map((w) => w[2]))}`);
      }
      if (JSON.stringify(shape(order.lines)) !== JSON.stringify(want)) reordered += 1;
      const codes = order.lines.map((l) => Model.supplierCode(l.product.supplier));
      if (codes.indexOf('BH') !== -1 && codes.lastIndexOf('SB') > codes.indexOf('BH')) bakehusetFirstInFile += 1;
    }
    return { orders: printed.size, reordered, bakehusetFirstInFile, problems: problems.slice(0, 5) };
  };

  // What a printed crate run says: its glyphs counted, or its `×N` groups
  // read, as { large, small }.
  window.readCrates = (node) => {
    const count = { large: 0, small: 0 };
    if (node.classList.contains('bf-crates-compact')) {
      for (const group of node.querySelectorAll('.bf-crate-group')) {
        const n = Number(group.querySelector('.bf-crate-count').textContent.replace('×', ''));
        if (group.querySelector('.bf-crate-full')) count.large += n;
        else count.small += n;
      }
    } else {
      count.large = node.querySelectorAll('.bf-crate-full').length;
      count.small = node.querySelectorAll('.bf-crate-half').length;
    }
    return count;
  };

  // Every block of several orders, read back line by line and held against
  // the orders it prints (`orders`: the model's, by id). A marker or a crate
  // count attached to the wrong order would print wrong without a word, so
  // this is the check that matters: each order's lines, supplier then name, under
  // its own department; its crates and its marker once, on its first line.
  // Returns what disagrees, so an empty list is the pass.
  window.readSharedBlocks = (sheets, orders, rules, bread) => {
    const problems = [];
    const seen = new Map();
    const marks = (rec, holder) => {
      const marker = holder.querySelector('.bf-marker');
      if (marker) {
        if (holder.querySelector('.bf-order-cont')) rec.continued.push(marker.textContent);
        else rec.markers.push([rec.rows.length - 1, marker.textContent]);
      }
      const crates = holder.querySelector('.bf-crates');
      if (crates) rec.crates.push([rec.rows.length - 1, readCrates(crates)]);
    };

    let blocks = 0;
    for (const sheet of sheets) {
      for (const block of sheet.querySelectorAll('.bf-block')) {
        if (!block.querySelector('.bf-row-shared')) continue;
        blocks += 1;
        const name = block.querySelector('.bf-name').textContent;
        // Nothing at the heading's right: the marks belong to the orders, on
        // their own lines. The name line holds the name and perhaps the part
        // tag; any other heading line a department box or the tag.
        Array.from(block.querySelectorAll(':scope > .bf-head-line')).forEach((line, index) => {
          const allowed = index === 0 ? ['bf-name', 'bf-block-part'] : ['bf-dpt', 'bf-block-part'];
          for (const child of line.children) {
            const kind = child.className.split(' ')[0];
            if (!allowed.includes(kind)) problems.push(`${name}: its heading holds ${kind}`);
          }
          if (line.querySelector('.bf-crates, .bf-marker, .bf-stamp, .bf-order-id')) {
            problems.push(`${name}: crates, a marker or an id sit in its heading`);
          }
        });
        const boxed = block.querySelector(':scope > .bf-head-line .bf-dpt:not(.bf-dpt-quiet) .bf-dpt-name');
        let department = boxed ? boxed.textContent : null;
        let last = null;
        for (const node of block.querySelectorAll('.bf-dpt-sub, .bf-row, .bf-order-extra')) {
          if (node.classList.contains('bf-dpt-sub')) {
            department = node.querySelector('.bf-dpt-name').textContent;
            continue;
          }
          if (node.classList.contains('bf-order-extra')) {
            if (last) {
              const own = node.querySelector('.bf-order-id');
              if (!own || Number(own.textContent) !== last.order.id) {
                problems.push(
                  `${name}: a line of crates and a marker says ${own ? own.textContent : 'no id'}, ` +
                    `under ${last.order.id}`,
                );
              }
              marks(last, node);
            } else {
              problems.push(`${name}: crates and a marker on a line of their own, under no order`);
            }
            continue;
          }
          if (!node.classList.contains('bf-row-shared')) {
            problems.push(`${name}: a line with no order id in a block of several orders`);
            continue;
          }
          const idNode = node.querySelector('.bf-row-stamp .bf-order-id');
          const id = idNode ? Number(idNode.textContent) : NaN;
          const order = orders.get(id);
          if (!order) {
            problems.push(`${name}: a line carries "${idNode && idNode.textContent}", no order of this day`);
            continue;
          }
          if (order.customer !== name) problems.push(`${id} printed under ${name}`);
          if ((order.department || null) !== department) {
            problems.push(`${id} printed under department ${department}, belongs to ${order.department}`);
          }
          if (!seen.has(id)) seen.set(id, { order, rows: [], markers: [], continued: [], crates: [] });
          last = seen.get(id);
          last.rows.push([
            Number(node.querySelector('.bf-qty').textContent),
            node.querySelector('.bf-product').textContent,
          ]);
          marks(last, node.querySelector('.bf-row-stamp'));
        }
      }
    }

    for (const [id, rec] of seen) {
      const { order } = rec;
      // In the owner's order — supplier, then name — never the file's.
      const want = printOrder(order.lines).map((line) => [line.quantity, line.product.name]);
      if (JSON.stringify(rec.rows) !== JSON.stringify(want)) {
        problems.push(
          `${id}: prints ${rec.rows.length} lines, the order has ${want.length} (or not supplier, then name)`,
        );
      }
      const answer = `want substitute: ${order.acceptAlternatives}`;
      if (rec.markers.length !== 1 || rec.markers[0][0] !== 0 || rec.markers[0][1] !== answer) {
        problems.push(`${id}: markers ${JSON.stringify(rec.markers)}, wanted "${answer}" once on its first line`);
      }
      if (rec.continued.some((text) => text !== answer)) problems.push(`${id}: a continued marker is wrong`);
      const count = bread ? Model.crateCount(order, rules) : { large: 0, small: 0 };
      const wantCrates = count.large + count.small > 0 ? [[0, count]] : [];
      if (JSON.stringify(rec.crates) !== JSON.stringify(wantCrates)) {
        problems.push(`${id}: crates ${JSON.stringify(rec.crates)}, wanted ${JSON.stringify(wantCrates)}`);
      }
    }
    return { blocks, ids: Array.from(seen.keys()), problems: problems.slice(0, 8) };
  };

  // A customer's block as it came out across pages, part by part: its
  // heading and tag, which orders each part carries, where the continued
  // orders and the crates fall, and any department sub-heading left with no
  // line under it.
  window.readParts = (sheets, customer) => {
    const idOf = (row) => {
      const id = row.querySelector('.bf-order-id');
      return id ? Number(id.textContent) : null;
    };
    return sheets
      .flatMap((sheet) => Array.from(sheet.querySelectorAll('.bf-block')))
      .filter((block) => block.querySelector('.bf-name').textContent === customer)
      .map((block) => {
        const rows = Array.from(block.querySelectorAll('.bf-row'));
        return {
          names: block.querySelectorAll('.bf-name').length,
          tags: Array.from(block.querySelectorAll('.bf-block-part'), (t) => t.textContent),
          ids: Array.from(new Set(rows.map(idOf).filter((id) => id !== null))),
          headIds: Array.from(
            block.querySelectorAll(':scope > .bf-head-line .bf-stamp .bf-order-id'),
            (n) => Number(n.textContent),
          ),
          products: rows.map((row) => row.querySelector('.bf-product').textContent),
          crates: block.querySelectorAll('.bf-crates').length,
          crateCount: Array.from(block.querySelectorAll('.bf-crates'), readCrates).reduce(
            (sum, count) => ({ large: sum.large + count.large, small: sum.small + count.small }),
            { large: 0, small: 0 },
          ),
          markers: block.querySelectorAll('.bf-marker').length,
          continued: rows
            .filter((row) => row.querySelector('.bf-order-cont'))
            .map((row) => [idOf(row), row.querySelectorAll('.bf-marker').length, row.querySelectorAll('.bf-crate').length]),
          falses: rows
            .filter((row) => row.querySelector('.bf-marker b') && !row.querySelector('.bf-order-cont'))
            .map(idOf),
          bareSubs: Array.from(block.querySelectorAll('.bf-dpt-sub')).filter((sub) => {
            const next = sub.nextElementSibling;
            return !next || !next.querySelector('.bf-row');
          }).length,
        };
      });
  };

  // A worksheet as Xlsx hands one over, built from plain values, for checks
  // that must go through Model.readRows itself: a string is a text cell, a
  // number a number cell, true or false a boolean cell, and null no cell.
  window.sheetOf = (dataRows) => {
    const cellOf = (value) =>
      value === null || value === undefined
        ? null
        : typeof value === 'boolean'
          ? { kind: 'boolean', value }
          : typeof value === 'number'
            ? { kind: 'number', value }
            : { kind: 'text', value };
    const row = (number, values) => ({
      number,
      cells: new Map(values.map((v, i) => [i, cellOf(v)]).filter(([, cell]) => cell)),
    });
    return {
      width: Model.COLUMN_COUNT,
      rows: [row(1, Model.HEADERS), ...dataRows.map((values, i) => row(i + 2, values))],
    };
  };

  // One export row as plain values, in column order, with any column given
  // by its Model.COLUMN name overridden.
  window.exportRow = (overrides = {}) => {
    const values = {
      orderId: 1000000501, quantity: 4, productId: 10, productName: 'Grovbrød',
      supplierSku: 'SB-10', position: null, supplier: 'Sandnes Bakeri',
      customer: 'Hinna skole', department: null, deliveryStreet: 'Hinnavegen 1',
      comment: null, routeNickname: '3', routeOrdering: 1, acceptAlternatives: true,
      region: 'Stavanger', ...overrides,
    };
    return Object.entries(Model.COLUMN)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => values[name]);
  };

  // A hand-made route of one-line orders, [id, customer, street, sequence]
  // each, grouped and laid out: its stops as "customer:id+id", and what its
  // sheets' bodies hold in order — a block by its name, the flag as "flag".
  window.handRoute = (specs) => {
    const orders = specs.map(([id, customer, deliveryStreet, sequence]) => ({
      id, customer, department: null, deliveryStreet, route: '1', sequence,
      acceptAlternatives: true, comment: null,
      lines: [{ product: { id: 1, name: 'Grovbrød', sku: '1', supplier: 'Sandnes Bakeri' }, quantity: 2 }],
    }));
    const route = Model.route('1', orders);
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0';
    document.body.append(host);
    try {
      const sheets = Sheet.paginate(
        route,
        { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
        { dates: null, source: 'hand', routeStops: route.stops.length, routeLines: orders.length },
        { host },
      );
      return {
        stops: route.stops.map((s) => `${s.customer}:${s.orders.map((o) => o.id).join('+')}`),
        body: sheets.flatMap((sheet) =>
          Array.from(sheet.querySelector('.bf-body').children, (node) =>
            node.classList.contains('bf-flag')
              ? 'flag'
              : node.classList.contains('bf-block')
                ? node.querySelector('.bf-name').textContent
                : node.className,
          ),
        ),
      };
    } finally {
      host.remove();
    }
  };

  // How a day's orders group into stops, and which routes the customer's
  // place in the tie-break reorders against D2's own key.
  window.stopFigures = (routes) => {
    const d2 = (o) => [
      o.sequence !== 0 ? 0 : 1, o.sequence, o.deliveryStreet,
      o.department === null ? '' : o.department, o.id,
    ];
    return {
      orders: routes.reduce((n, r) => n + r.orders.length, 0),
      stops: routes.reduce((n, r) => n + r.stops.length, 0),
      reordered: routes
        .filter((r) => {
          const byD2 = r.orders.slice().sort((a, b) => Model.compare(d2(a), d2(b)));
          return byD2.map((o) => o.id).join() !== r.orders.map((o) => o.id).join();
        })
        .map((r) => r.nickname),
    };
  };
});

/** The inspection's verdicts, for a set of sheets already on the page. */
const inspected = (what, seen) => {
  check(
    `${what}: nothing runs off the paper`,
    seen.down <= 0.5 && seen.across <= 0.5 && !seen.zoomed,
    `${seen.down} mm down, ${seen.across} mm across, ${seen.sheets} sheets` +
      (seen.zoomed ? ', measured zoomed' : ''),
  );
  check(`${what}: every sheet still keeps its 10 mm`, seen.clearance >= 10, `${seen.clearance} mm`);
  same(`${what}: nothing is set on top of anything else`, seen.collisions, []);
  same(`${what}: nothing is clipped away by the box holding it`, seen.clipped, []);
  same(`${what}: nothing nonsensical is printed`, seen.nonsense, []);
  same(`${what}: no page ends with the "no position assigned" flag`, seen.flagLast, []);
};

/**
 * What every substitute marker in the preview reads. One look for both
 * answers: the words, and only the word false in bold (a departure from
 * D8/D21 the owner asked for).
 */
const markerReport = () =>
  page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll('#preview .bf-marker'));
    const odd = markers
      .map((m) => ({
        text: m.textContent,
        kids: Array.from(m.children).map(
          (c) => `${c.tagName}:${c.textContent}:${getComputedStyle(c).fontWeight}`,
        ),
      }))
      .filter(
        ({ text, kids }) =>
          !(text === 'want substitute: true' && kids.length === 0) &&
          !(text === 'want substitute: false' && kids.length === 1 && kids[0] === 'B:false:700'),
      );
    // One marker per order: a continued order repeats its marker beside the
    // word "continued", and a later part of a cut one-order block repeats it
    // in its heading. Those repeats are not another order's.
    const laterPart = (m) => {
      const tag = m.closest('.bf-block').querySelector('.bf-block-part');
      return tag && !/^part 1 of/.test(tag.textContent) && !m.closest('.bf-row, .bf-order-extra');
    };
    const once = markers.filter((m) => !m.parentElement.querySelector('.bf-order-cont') && !laterPart(m));
    // One look: every phrase set alike, wherever it sits — a heading, a
    // shared line, a line of its own — and the bold word differing in
    // weight alone.
    const look = (node, weight) => {
      const s = getComputedStyle(node);
      return JSON.stringify([s.fontFamily, weight || s.fontWeight, s.fontSize, s.color,
        s.textTransform, s.fontStyle]);
    };
    return {
      styles: Array.from(new Set(markers.map((m) => look(m)))),
      bolds: Array.from(new Set(markers.flatMap((m) =>
        Array.from(m.querySelectorAll('b'), (b) => `${getComputedStyle(b).fontWeight} ${look(b, '500')}`)))),
      markers: once.length,
      trues: once.filter((m) => m.textContent === 'want substitute: true').length,
      falses: markers.filter((m) => m.textContent === 'want substitute: false').length,
      odd: odd.slice(0, 3),
      loud: document.querySelectorAll('#preview .bf-marker-loud').length,
      noteSays: Array.from(document.querySelectorAll('#preview .bf-note')).some((n) =>
        /substitute/i.test(n.textContent),
      ),
    };
  });

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

// A stop is a block: the day's 148 orders print as 123, because a customer's
// orders at one stop share one (the owner, 2026-09-29).
same(
  'the bread export reads as 16 routes, 123 stops, 352 lines',
  read.stats,
  [
    ['16', 'routes'],
    ['123', 'stops'],
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
    .flatMap((r) => r.orders)
    .filter((s) => s.customer === 'Customer 012');

  return {
    order: routes.map((r) => r.nickname),
    route8: route8.orders.map((s) => [
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
    refusing: routes.flatMap((r) => r.orders).filter((o) => o.acceptAlternatives === false).length,
    stops: stopFigures(routes),
    c017: route11.stops
      .filter((s) => s.customer === 'Customer 017')
      .map((s) => s.orders.map((o) => o.id)),
    c061: route11.stops
      .filter((s) => s.customer === 'Customer 061')
      .map((s) => [s.deliveryStreet, s.orders.map((o) => o.id)]),
    c012stop: routes
      .find((r) => r.nickname === '14')
      .stops.filter((s) => s.customer === 'Customer 012')
      .map((s) => [s.orders.length, s.orders.reduce((n, o) => n + o.lines.length, 0)]),
  };
}, [breadBytes]);

// One block per customer at a stop, departments included (the owner,
// 2026-09-29): 148 orders print as 123 stops. The customer joins D2's
// tie-break, and that moves no order on any route of this day.
same('the bread day groups 148 orders into 123 stops', [bread.stops.orders, bread.stops.stops], [148, 123]);
same('the new tie-break reorders nothing on the bread day', bread.stops.reordered, []);
same(
  'route 11’s Customer 017 is one stop: three orders with no department, then Department 09',
  bread.c017,
  [[1000619017, 1000619019, 1000619029, 1000622398]],
);
same(
  'Customer 061 on route 11 is two stops, one per street',
  bread.c061,
  [
    ['Street 112', [1000622508]],
    ['Street 62', [1000621633, 1000622154, 1000622155]],
  ],
);
same('Customer 012 on route 14 is one stop of nine orders and 30 lines', bread.c012stop, [[9, 30]]);

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
// The substitute marker has one look, so there is nothing to choose.
check(
  'the configure step offers no substitute choices',
  (await page.locator('#step-configure [data-marker], #step-configure :text("substitute")').count()) === 0,
);

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
inspected(
  'the bread day',
  await page.evaluate(() => inspectSheets(Array.from(document.querySelectorAll('#preview .bf-sheet')))),
);

const breadMarkers = await markerReport();
same('every bread marker reads true or false in the one look', breadMarkers.odd, []);
check(
  'every bread order that refuses substitutes prints false: 18 of them',
  bread.refusing === 18 && breadMarkers.falses === bread.refusing,
  `${breadMarkers.falses} printed, ${bread.refusing} in the file`,
);
// Counting only the falses let an order with no marker at all pass. Every
// one of the 148 orders prints exactly one, and 130 of them say true.
same(
  'every bread order prints one marker, 130 of them true',
  [breadMarkers.markers, breadMarkers.trues],
  [148, 148 - bread.refusing],
);

/**
 * The one quiet look: every marker phrase alike, at weight 500 and never
 * capitalised, and the bold "false" the same but for weight 700.
 */
const oneLook = (what, report) => {
  const [style] = report.styles;
  const [, weight, , , transform] = style ? JSON.parse(style) : [];
  check(
    `${what}: every marker phrase is set in one quiet look`,
    report.styles.length === 1 && weight === '500' && transform === 'none',
    report.styles.join(' | '),
  );
  same(`${what}: and the bold false differs from it in weight alone`, report.bolds, [`700 ${style}`]);
};
oneLook('the bread day', breadMarkers);
check(
  'no loud marker is left, and the page note explains none',
  breadMarkers.loud === 0 && !breadMarkers.noteSays,
  JSON.stringify(breadMarkers),
);

// ── One block per customer at a stop (the owner, 2026-09-29) ─────────────

/**
 * Every block of several orders in the preview, held against the day's
 * orders; which stops of several orders did not print as one block; and the
 * lines of the named blocks, as [id, quantity, crate glyphs] with the
 * department sub-headings between them.
 */
const sharedReport = (bytes, kind, named) =>
  page.evaluate(
    async ([b, kind, named]) => {
      const book = await Xlsx.open(new Uint8Array(b).buffer);
      // The folded orders, not the route's: their lines are still in the
      // file's order, so the line-order checks below compare against the file.
      const folded = Model.fold(Model.readRows(await book.sheet('Data')));
      const routes = Model.group(folded);
      const orders = new Map(folded.map((o) => [o.id, o]));
      const sheets = Array.from(document.querySelectorAll('#preview .bf-sheet'));
      const read = readSharedBlocks(sheets, orders, Model.defaultCrateRules(), kind === Model.BREAD);
      const lineOrder = readOrderLines(sheets, orders);
      const printed = new Set(read.ids);
      const apart = routes.flatMap((r) =>
        r.stops
          .filter((s) => s.orders.length > 1 && !s.orders.every((o) => printed.has(o.id)))
          .map((s) => `${r.nickname}: ${s.customer}`),
      );
      const lines = {};
      for (const [route, customer] of named) {
        const block = sheets
          .filter((s) => s.dataset.route === route)
          .flatMap((s) => Array.from(s.querySelectorAll('.bf-block')))
          .find((n) => n.querySelector('.bf-name').textContent === customer && n.querySelector('.bf-row-shared'));
        lines[`${route}: ${customer}`] = block
          ? Array.from(block.querySelectorAll('.bf-dpt-sub, .bf-row')).map((node) =>
              node.classList.contains('bf-dpt-sub')
                ? ['dpt', node.querySelector('.bf-dpt-name').textContent]
                : [
                    Number(node.querySelector('.bf-order-id').textContent),
                    Number(node.querySelector('.bf-qty').textContent),
                    Array.from(node.querySelectorAll('.bf-crate'), (c) =>
                      c.classList.contains('bf-crate-full') ? 'full' : 'half',
                    ),
                  ],
            )
          : null;
      }
      const ids = Array.from(document.querySelectorAll('#preview .bf-row-shared .bf-order-id'));
      return {
        read,
        lineOrder,
        apart,
        lines,
        ink: Array.from(
          new Set(ids.map((n) => `${getComputedStyle(n).color} ${getComputedStyle(n).fontWeight}`)),
        ),
        subsMisclassed: document.querySelectorAll(
          '#preview .bf-dpt-sub.bf-row, #preview .bf-dpt-sub.bf-block',
        ).length,
        subs: document.querySelectorAll('#preview .bf-dpt-sub').length,
      };
    },
    [Array.from(bytes), kind, named],
  );

const breadShared = await sharedReport(breadBytes, 'bread', [
  ['11', 'Customer 017'],
  ['9', 'Customer 092'],
]);
same(
  'every order in a bread block of several prints its own lines, crates and marker, under its own department',
  breadShared.read.problems,
  [],
);
// Customer 012's nine orders at one stop are taller than a page as one block,
// so the block is cut between two of its orders: eight stops, nine blocks.
same(
  'every bread stop of several orders prints as its own block, Customer 012 in two parts',
  [breadShared.read.blocks, breadShared.apart],
  [9, []],
);
same(
  'route 11’s Customer 017: 7, 4 and 10 Kneippbrød with crates full, half, full, then Department 09',
  breadShared.lines['11: Customer 017'],
  [
    [1000619017, 7, ['full']],
    [1000619019, 4, ['half']],
    [1000619029, 10, ['full']],
    ['dpt', 'Department 09'],
    [1000622398, 3, ['full']],
    [1000622398, 7, []],
  ],
);
same(
  'Customer 092’s two identical orders each carry 2 full and 1 half, not 4 full and 1 half',
  breadShared.lines['9: Customer 092'].filter((row) => row[2].length > 0),
  [
    [1000619939, 12, ['full', 'full', 'half']],
    [1000619941, 12, ['full', 'full', 'half']],
  ],
);
// The owner, 2026-09-29: within each order, Sandnes Bakeri's breads first,
// then Bakehuset's, each A to Z — never mixing two orders' lines. Held against
// the file's own lines, so it fails if the sort is ever taken out: it moves
// real orders on this day, some of them listing Bakehuset before Sandnes.
same('every bread order prints its lines by supplier, then name', breadShared.lineOrder.problems, []);
check(
  'all 148 bread orders are read back, and the sort moves real ones',
  breadShared.lineOrder.orders === 148 &&
    breadShared.lineOrder.reordered > 0 &&
    breadShared.lineOrder.bakehusetFirstInFile > 0,
  JSON.stringify(breadShared.lineOrder),
);

const c012Parts = await page.evaluate(() =>
  readParts(Array.from(document.querySelectorAll('#preview .bf-sheet[data-route="14"]')), 'Customer 012'),
);
check(
  'route 14’s Customer 012 is cut in two parts, between orders, each with its heading and tag',
  c012Parts.length === 2 &&
    c012Parts.every((p, i) => p.names === 1 && p.tags[0] === `part ${i + 1} of 2`) &&
    c012Parts[0].ids.every((id) => !c012Parts[1].ids.includes(id)) &&
    c012Parts.every((p) => p.continued.length === 0 && p.bareSubs === 0),
  JSON.stringify(c012Parts.map((p) => [p.tags, p.ids, p.continued])),
);
same('an order id in a shared block stays quiet: grey, never bold', breadShared.ink, [
  'rgb(156, 156, 156) 400',
]);
check(
  'a department sub-heading is neither a bread line nor a block',
  breadShared.subs > 0 && breadShared.subsMisclassed === 0,
  `${breadShared.subs} sub-headings, ${breadShared.subsMisclassed} misclassed`,
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
//
// The fourth order shares the third's customer, street and sequence in
// another department, so the route has a stop of two orders; and the stop
// names must print, so an empty render cannot pass.
const sequenceLeak = await page.evaluate(() => {
  const marks = [811931, 811933, 811937];
  const order = (index, sequence, department) => ({
    id: 1000000000 + index,
    customer: `Stop ${Math.min(index, 2)}`,
    department,
    deliveryStreet: `Street ${Math.min(index, 2)}`,
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
  });
  const route = Model.route('1', [
    ...marks.map((sequence, index) => order(index, sequence, index === 1 ? 'Kitchen' : null)),
    order(3, marks[2], 'Bakery'),
  ]);
  const settings = {
    kind: Model.BREAD,
    showOrderId: true,
    crates: Model.defaultCrateRules(),
  };
  const printed = Sheet.paginate(
    route,
    settings,
    { dates: null, source: 'test', routeStops: route.stops.length, routeLines: 4 },
    {},
  )
    .map((sheet) => sheet.textContent)
    .join(' ');
  return {
    stops: route.stops.map((s) => s.orders.length),
    leaked: marks.filter((mark) => printed.includes(String(mark))),
    named: ['Stop 0', 'Stop 1', 'Stop 2'].filter((name) => printed.includes(name)),
  };
});
same('the sequence number is never printed', sequenceLeak.leaked, []);
same(
  'and the stops it hides in print, one of them two orders',
  [sequenceLeak.stops, sequenceLeak.named],
  [[1, 1, 2], ['Stop 0', 'Stop 1', 'Stop 2']],
);

// ── What makes a stop ──────────────────────────────────────────────────────

// The customer comes before the order id in the tie-break. Without it, Kafé
// A's orders 21 and 23 would sort either side of Kafé B's 22 at the same
// street and position, and print as two Kafé A blocks.
const tieBreak = await page.evaluate(() =>
  handRoute([
    [21, 'Kafé A', 'Torget 1', 700],
    [22, 'Kafé B', 'Torget 1', 700],
    [23, 'Kafé A', 'Torget 1', 700],
  ]),
);
same('one customer’s orders at a shared street and position sit together', tieBreak.stops, [
  'Kafé A:21+23',
  'Kafé B:22',
]);
same('and print as one Kafé A block', tieBreak.body.filter((n) => n === 'Kafé A'), ['Kafé A']);

// The position in the route is part of what makes a stop. One customer at
// one street with a position and without one is two stops, and the
// unsequenced flag stands between them; at two positions it is two stops.
const bySequence = await page.evaluate(() => ({
  placedAndNot: handRoute([
    [31, 'Kafé C', 'Street 9', 5],
    [32, 'Kafé C', 'Street 9', 0],
  ]),
  twoPlaces: handRoute([
    [33, 'Kafé D', 'Street 9', 5],
    [34, 'Kafé D', 'Street 9', 6],
  ]),
}));
same(
  'a customer at one street, placed and unplaced, is two stops with the flag between',
  [bySequence.placedAndNot.stops, bySequence.placedAndNot.body],
  [['Kafé C:31', 'Kafé C:32'], ['Kafé C', 'flag', 'Kafé C', 'bf-total']],
);
same('and at two positions, two stops', bySequence.twoPlaces.stops, ['Kafé D:33', 'Kafé D:34']);

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

// Nothing is ever printed wrong: a value the layout cannot print correctly is
// refused out loud instead. A stop handed in where an order belongs has no
// substitute answer and no id of its own, and must never print as "false" or
// "undefined".
const refusals = await page.evaluate(() => {
  const order = () => ({
    id: 1000000001, customer: 'Kafé 01', department: null, deliveryStreet: 'Street 01',
    route: '1', sequence: 100, acceptAlternatives: true, comment: null,
    lines: [{ product: { id: 1, name: 'Grovbrød', sku: 'x', supplier: 'sandnes bakeri' }, quantity: 3 }],
  });
  const attempt = (stop) => {
    try {
      Sheet.paginate(
        Model.route('1', [stop]),
        { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
        { dates: null, source: 'test', routeStops: 1, routeLines: 1 },
        {},
      );
      return 'printed';
    } catch (error) {
      return String(error.message);
    }
  };
  const noAnswer = order();
  delete noAnswer.acceptAlternatives;
  const noId = order();
  delete noId.id;
  return { noAnswer: attempt(noAnswer), noId: attempt(noId), whole: attempt(order()) };
});
check(
  'an order with no substitute answer is refused, not printed',
  /neither true nor false/.test(refusals.noAnswer),
  refusals.noAnswer,
);
check(
  'an order with no id is refused while ids are shown',
  /not a number/.test(refusals.noId),
  refusals.noId,
);
check('and a whole order still prints', refusals.whole === 'printed', refusals.whole);

// A block of several orders carries each order's marker on that order's first
// line, so a refusing order can never lend its "false" to the one beside it —
// and a check line whose name will not fit beside a marker and an id wraps
// the name rather than leaving the paper.
const handBuilt = await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.append(host);
  const order = (id, accept, department, names) => ({
    id, customer: 'Kafé 02', department, deliveryStreet: 'Street 02', route: '1',
    sequence: 200, acceptAlternatives: accept, comment: null,
    lines: names.map((name, i) => ({
      product: { id: 10 + i, name, sku: String(10 + i), supplier: 'Asko' },
      quantity: 3 + i,
    })),
  });
  const lay = (kind, orders) => {
    const route = Model.route('1', orders);
    const sheets = Sheet.paginate(
      route,
      { kind, showOrderId: false, crates: Model.defaultCrateRules() },
      { dates: null, source: 'test', routeStops: route.stops.length, routeLines: 4 },
      { host },
    );
    for (const sheet of sheets) host.append(sheet);
    return { route, sheets, given: orders };
  };
  try {
    const two = lay(Model.BREAD, [
      order(1000000011, true, null, ['Grovbrød', 'Loff']),
      order(1000000012, false, null, ['Grovbrød', 'Loff']),
    ]);
    const markers = Array.from(host.querySelectorAll('.bf-row-shared'), (row) => [
      Number(row.querySelector('.bf-order-id').textContent),
      row.querySelector('.bf-marker') ? row.querySelector('.bf-marker').textContent : null,
    ]);
    host.innerHTML = '';

    const long =
      'Torskefilet i blokk uten skinn og bein, frossen, 400 g, First Price, ' +
      'fra Lofoten Sjømat AS, pakket i kartong på 12';
    const freezer = lay(Model.FREEZER, [
      order(1000000021, false, null, [long, 'Pitabrød']),
      order(1000000022, true, 'Kjøkken', ['Pitabrød', long]),
    ]);
    // The orders as handed in, lines still in their given order.
    const orders = new Map(freezer.given.map((o) => [o.id, o]));
    return {
      markers,
      freezer: inspectSheets(freezer.sheets),
      freezerRead: readSharedBlocks(freezer.sheets, orders, Model.defaultCrateRules(), false).problems,
      noteFields: host.querySelectorAll('.bf-note-field').length,
      rows: host.querySelectorAll('.bf-row').length,
    };
  } finally {
    host.remove();
  }
});
same('in a block of two orders, only the refusing order’s first line says false', handBuilt.markers, [
  [1000000011, 'want substitute: true'],
  [1000000011, null],
  [1000000012, 'want substitute: false'],
  [1000000012, null],
]);
inspected('a freezer block of several orders with a long product name', handBuilt.freezer);
same('and each of its orders prints its own lines and marker', handBuilt.freezerRead, []);
check(
  'and every check line in it keeps its note field',
  handBuilt.rows === 4 && handBuilt.noteFields === 4,
  `${handBuilt.noteFields} of ${handBuilt.rows}`,
);

// An order's first line in a shared block carries its crates, marker and id,
// which leaves the name its 30 mm and no more. A word longer than that used
// to spill out of the name's box onto the crate glyphs — "…kker" printed over
// the first crate — while the line itself measured as fitting. The name has
// to fit its own box, not just the line.
const crowdedFirstLine = await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.append(host);
  const loaf = (id, name, supplier, quantity) => ({
    product: { id, name, sku: String(id), supplier },
    quantity,
  });
  const order = (id, accept, lines) => ({
    id, customer: 'Kafé 03', department: null, deliveryStreet: 'Street 03', route: '1',
    sequence: 300, acceptAlternatives: accept, comment: null, lines,
  });
  // Loff is Bakehuset's, so the owner's sort keeps the long word first.
  const orders = [
    order(1000000031, false, [
      loaf(61, 'Surdeigsrundstykker Sandnes Bakeri', 'Sandnes Bakeri', 50),
      loaf(62, 'Loff', 'Bakehuset', 1),
    ]),
    order(1000000032, true, [loaf(63, 'Grovbrød', 'Sandnes Bakeri', 2)]),
    // Too long even beside the compact crates: its crates and marker take a
    // line of their own, which must carry its id.
    order(1000000033, true, [
      loaf(64, 'Surdeigsrundstykkermedkanelogkardemommeogrosiner', 'Sandnes Bakeri', 20),
      loaf(65, 'Grovbrød', 'Bakehuset', 1),
    ]),
  ];
  try {
    const sheets = Sheet.paginate(
      Model.route('1', orders),
      { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
      { dates: null, source: 'test', routeStops: 1, routeLines: 3 },
      { host },
    );
    for (const sheet of sheets) host.append(sheet);
    return {
      seen: inspectSheets(sheets),
      extras: Array.from(host.querySelectorAll('.bf-order-extra'), (line) =>
        Array.from(line.querySelectorAll('.bf-order-id'), (n) => Number(n.textContent)),
      ),
      spilled: Array.from(host.querySelectorAll('.bf-row-shared .bf-product'))
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .map((n) => n.textContent),
      read: readSharedBlocks(
        sheets,
        new Map(orders.map((o) => [o.id, o])),
        Model.defaultCrateRules(),
        true,
      ).problems,
    };
  } finally {
    host.remove();
  }
});
inspected('a shared first line whose bread name is one long word', crowdedFirstLine.seen);
same('and no bread name spills out of its box onto the crates', crowdedFirstLine.spilled, []);
same('and its orders still print their own lines, crates and marker', crowdedFirstLine.read, []);
same('a line of its own for crates and a marker carries its order’s id', crowdedFirstLine.extras, [
  [1000000033],
]);

// When the layout does refuse, the Print step says why and prints nothing.
const laidOutWrong = await page.evaluate(() => {
  const real = Sheet.day;
  const tick = document.querySelector('#routes input[type="checkbox"]');
  Sheet.day = () => {
    throw new Error('a stand-in failure');
  };
  try {
    tick.click();
    return {
      summary: document.getElementById('printSummary').textContent,
      sheets: document.querySelectorAll('#preview .bf-sheet').length,
      printDisabled: document.getElementById('print').disabled,
    };
  } finally {
    Sheet.day = real;
    tick.click();
  }
});
same('a layout that fails says why, shows no sheets and cannot be printed', laidOutWrong, {
  summary: 'The sheets could not be laid out, so nothing will print: a stand-in failure',
  sheets: 0,
  printDisabled: true,
});
check(
  'and the sheets come back once it lays out again',
  (await page.locator('#preview .bf-sheet').count()) === sheets.length &&
    !(await page.locator('#print').isDisabled()),
);

// "Show the order ID" is for one-order blocks. In a block of several orders
// the id is what tells them apart, so it prints on every line regardless.
await page.click('[data-step="configure"]');
await page.uncheck('#showOrderId');
await page.click('#advance');
await page.waitForFunction(() => document.querySelectorAll('#preview .bf-sheet').length > 0);
const idsOff = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#preview .bf-row-shared'));
  const idsOf = (route, customer) =>
    Array.from(document.querySelectorAll(`#preview .bf-sheet[data-route="${route}"] .bf-block`))
      .filter((b) => b.querySelector('.bf-name').textContent === customer)
      .flatMap((b) => Array.from(b.querySelectorAll('.bf-order-id'), (n) => Number(n.textContent)));
  return {
    rows: rows.length,
    rowsWithoutId: rows.filter((r) => !r.querySelector('.bf-order-id')).length,
    idsElsewhere: Array.from(document.querySelectorAll('#preview .bf-order-id')).filter(
      (n) => !n.closest('.bf-row-shared'),
    ).length,
    c092: Array.from(new Set(idsOf('9', 'Customer 092'))),
    c061: Array.from(new Set(idsOf('11', 'Customer 061'))),
  };
});
check(
  'with Show the order ID off, every line of a shared block still prints its id',
  idsOff.rows > 0 && idsOff.rowsWithoutId === 0,
  JSON.stringify(idsOff),
);
check('and no one-order block prints one', idsOff.idsElsewhere === 0, JSON.stringify(idsOff));
same(
  'Customer 092’s pair and Customer 061’s three orders at Street 62 still show their ids',
  [idsOff.c092, idsOff.c061],
  [
    [1000619939, 1000619941],
    [1000621633, 1000622154, 1000622155],
  ],
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
// 115 orders, 94 blocks: a customer's orders at one stop count once.
same(
  'the freezer export reads as 15 routes and 94 stops',
  await page.$$eval('.stat', (cards) =>
    cards.slice(0, 2).map((s) => [s.querySelector('b').textContent, s.querySelector('span').textContent]),
  ),
  [
    ['15', 'routes'],
    ['94', 'stops'],
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
    noteFields: all.reduce((n, s) => n + s.querySelectorAll('.bf-note-field').length, 0),
    lines: all.reduce((n, s) => n + s.querySelectorAll('.bf-row').length, 0),
    tens: all.reduce((n, s) => n + s.querySelectorAll('.bf-total-dots .bf-dot').length, 0),
    route13: all.filter((s) => s.dataset.route === '13').length,
  };
});

// docs/freezer-list.md says "The sample freezer day prints as 15 routes over
// 21 sheets", and it did until a customer's orders at one stop shared a block
// (the owner, 2026-09-29). Route 13's Customer 012 has eight orders there:
// as one block with eight department sub-headings it is shorter than eight
// blocks with eight headings, and the route now fits one sheet instead of two.
check(
  'the freezer day is 15 routes over 20 sheets',
  freezer.routes === 15 && freezer.count === 20 && freezer.route13 === 1,
  `${freezer.routes} routes over ${freezer.count} sheets, route 13 on ${freezer.route13}`,
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
inspected(
  'the freezer day',
  await page.evaluate(() => inspectSheets(Array.from(document.querySelectorAll('#preview .bf-sheet')))),
);

const freezerModel = await page.evaluate(async ([bytes]) => {
  const book = await Xlsx.open(new Uint8Array(bytes).buffer);
  const routes = Model.group(Model.fold(Model.readRows(await book.sheet('Data'))));
  return {
    refusing: routes.flatMap((r) => r.orders).filter((o) => o.acceptAlternatives === false).length,
    stops: stopFigures(routes),
  };
}, [freezerBytes]);
const freezerRefusing = freezerModel.refusing;
same(
  'the freezer day groups 115 orders into 94 stops',
  [freezerModel.stops.orders, freezerModel.stops.stops],
  [115, 94],
);
same('the new tie-break reorders nothing on the freezer day', freezerModel.stops.reordered, []);
const freezerMarkers = await markerReport();
same('every freezer marker reads true or false in the one look', freezerMarkers.odd, []);
check(
  'every freezer order that refuses substitutes prints false: 10 of them',
  freezerRefusing === 10 && freezerMarkers.falses === freezerRefusing,
  `${freezerMarkers.falses} printed, ${freezerRefusing} in the file`,
);
same(
  'every freezer order prints one marker, 105 of them true',
  [freezerMarkers.markers, freezerMarkers.trues],
  [115, 115 - freezerRefusing],
);
oneLook('the freezer day', freezerMarkers);
check(
  'the freezer sheets have no loud marker and no convention in the note either',
  freezerMarkers.loud === 0 && !freezerMarkers.noteSays,
  JSON.stringify(freezerMarkers),
);

const freezerShared = await sharedReport(freezerBytes, 'freezer', [
  ['11', 'Customer 159'],
  ['4', 'Customer 017'],
]);
same(
  'every order in a freezer block of several prints its own lines and marker, under its own department',
  freezerShared.read.problems,
  [],
);
// The freezer's wholesalers are neither house bakery, so its lines go A to Z
// by supplier code, then by name.
same('every freezer order prints its lines by supplier, then name', freezerShared.lineOrder.problems, []);
check(
  'all 115 freezer orders are read back, and the sort moves real ones',
  freezerShared.lineOrder.orders === 115 && freezerShared.lineOrder.reordered > 0,
  JSON.stringify(freezerShared.lineOrder),
);
same(
  'every freezer stop of several orders is one block',
  [freezerShared.read.blocks, freezerShared.apart],
  [10, []],
);
// Customer 159's two orders share Department 38, so the boxed department stays
// in the heading and nothing divides the block. Customer 017 on route 4 mixes
// a refusing order with three that take substitutes.
same(
  'a block whose orders share a department has no sub-heading',
  freezerShared.lines['11: Customer 159'].filter((row) => row[0] === 'dpt'),
  [],
);
same(
  'route 4’s Customer 017: no department first, then 09, 22 and 32',
  freezerShared.lines['4: Customer 017'].filter((row) => row[0] === 'dpt').map((row) => row[1]),
  ['Department 09', 'Department 22', 'Department 32'],
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
  ['edge', 'suppliers-12', 'twelve bakeries on one route'],
  ['edge', 'supplier-code-collision', 'two bakeries deriving the same code'],
  ['edge', 'one-giant-stop', 'one order with 300 product lines'],
  ['edge', '200-stops', 'two hundred stops on one route'],
  ['edge', 'long-customer', 'a customer name 200 characters long'],
  ['edge', 'long-department', 'a department spelled out in full'],
  ['edge', 'long-route-name', 'a route nicknamed in a sentence'],
  ['edge', 'long-supplier', 'a bakery with nine words in its name'],
  // Numbers wider than the slots that hold them. Nothing ran off the paper
  // for these; the quantity simply printed on top of the product name.
  ['edge', 'busy-real-day', 'a school kitchen ordering 400 of one bread'],
  // The total was drawn for two bakeries. Three or four is the change the
  // warehouse might really make; four used to print three columns at 59 mm
  // and a fourth stretched across the whole 194 mm measure.
  ['edge', 'bakeries-3', 'a third bakery'],
  ['edge', 'bakeries-4', 'a fourth bakery'],
  ['edge', 'bakeries-5', 'a fifth bakery'],
  ['edge', 'four-figure-line', 'a four-figure quantity on one line'],
  // One block per customer at a stop: a customer taller than a page, cut
  // across departments; a name and a crate count too wide for their line; a
  // department every order in the block shares.
  ['edge', 'one-customer-many-orders', 'one customer with many orders at one stop'],
  ['shape', 'quantity-2-billion', 'a quantity far past anything real'],
  ['shape', 'quantity-beyond-float', 'a quantity past what a double holds'],
];

for (const [folder, fixture, what] of EDGE) {
  const bytes = Array.from(
    await readFile(`scripts/fixtures/${folder}/PSR-BREAD-2026-03-04-to-2026-03-04-${fixture}.xlsx`),
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
            crates: Model.defaultCrateRules(),
      };
      const pages = [];
      for (const route of Model.group(Model.fold(rows))) {
        pages.push(
          ...Sheet.paginate(
            route,
            settings,
            { dates: null, source: 'edge', routeStops: route.orders.length,
              routeLines: Model.lineCount(route) },
            { host },
          ),
        );
      }
      for (const sheet of pages) host.appendChild(sheet);

      const seen = inspectSheets(pages);

      // Every code the lines print has to be spelled out in the key above them.
      const codes = new Set(Array.from(host.querySelectorAll('.bf-code'), (n) => n.textContent));
      const key = pages[0].querySelector('.bf-legend-suppliers').textContent;
      const unexplained = Array.from(codes).filter((code) => !key.includes(code));

      // One bakery, one column — and every column the same width. A wrapping
      // flex row stretched whatever landed on the last row to fill it, so a
      // fourth bakery printed three columns at 59 mm and a fourth at 194.
      const widths = new Set();
      for (const sheet of pages) {
        for (const col of sheet.querySelectorAll('.bf-total-col')) {
          widths.add(Math.round(col.getBoundingClientRect().width * perPx));
        }
      }

      return {
        seen,
        unexplained,
        columnWidths: Array.from(widths).sort((a, b) => a - b),
      };
    } finally {
      host.remove();
    }
  }, [bytes]);

  inspected(what, shape.seen);
  same(`${what}: no code prints without the key explaining it`, shape.unexplained, []);
  check(
    `${what}: the bakery columns are all one width`,
    shape.columnWidths.length <= 1,
    `${shape.columnWidths.join(', ')} mm`,
  );
}

// The fixture's customers each group into exactly one stop holding every one
// of their orders, in printing order: no department first, then by department.
const manyBytes = Array.from(
  await readFile('scripts/fixtures/edge/PSR-BREAD-2026-03-04-to-2026-03-04-one-customer-many-orders.xlsx'),
);
const manyStops = await page.evaluate(async ([b]) => {
  const book = await Xlsx.open(new Uint8Array(b).buffer);
  return Model.group(Model.fold(Model.readRows(await book.sheet('Data')))).map((r) => [
    r.nickname,
    r.stops.map((s) => s.orders.map((o) => o.id)),
  ]);
}, [manyBytes]);
same('the tall, wide and shared-department customers are one stop each', manyStops, [
  ['1', [[7000], [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108, 7112, 7113, 7114, 7109, 7110, 7111]]],
  ['2', [[7203, 7201, 7202]]],
  ['3', [[7301, 7302]]],
]);

const TALL = 'Hinna skole og barnehage';
const WIDE =
  'Stavanger kommune, Hinna bydel, Oppvekst og levekår: kantinedrift og ' +
  'storkjøkken ved Hinna skole, idrettshall og svømmehall';
const WIDE_DEPT = 'Avdeling for storhusholdning og institusjonskjøkken';
const manyPrinted = await page.evaluate(async ([b, tall, wide]) => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.append(host);
  try {
    const book = await Xlsx.open(new Uint8Array(b).buffer);
    const folded = Model.fold(Model.readRows(await book.sheet('Data')));
    const routes = Model.group(folded);
    const settings = { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() };
    const all = [];
    const byRoute = {};
    for (const route of routes) {
      byRoute[route.nickname] = Sheet.paginate(
        route,
        settings,
        { dates: null, source: 'edge', routeStops: route.stops.length, routeLines: Model.lineCount(route) },
        { host },
      );
      for (const sheet of byRoute[route.nickname]) host.append(sheet);
      all.push(...byRoute[route.nickname]);
    }
    const blocksOf = (route, customer) =>
      byRoute[route]
        .flatMap((s) => Array.from(s.querySelectorAll('.bf-block')))
        .filter((n) => n.querySelector('.bf-name').textContent === customer);
    const firstRow = (blocks, id) =>
      blocks
        .flatMap((n) => Array.from(n.querySelectorAll('.bf-row-shared')))
        .find((row) => row.querySelector('.bf-order-id').textContent === String(id));
    const subs = (blocks) =>
      blocks.flatMap((n) => Array.from(n.querySelectorAll('.bf-dpt-sub .bf-dpt-name'), (d) => d.textContent));

    const wideBlocks = blocksOf('2', wide);
    const sharedBlocks = blocksOf('3', 'Madla sykehjem');
    const tallBlocks = blocksOf('1', tall);
    const orders = new Map(folded.map((o) => [o.id, o]));
    return {
      read: readSharedBlocks(all, orders, settings.crates, true).problems,
      lineOrder: readOrderLines(all, orders),
      wide: {
        blocks: wideBlocks.length,
        compact: !!firstRow(wideBlocks, 7201).querySelector('.bf-crates-compact'),
        refusing: firstRow(wideBlocks, 7202).querySelector('.bf-marker').textContent,
        subs: subs(wideBlocks),
      },
      shared: {
        blocks: sharedBlocks.length,
        boxed: Array.from(
          sharedBlocks[0].querySelectorAll(':scope > .bf-head-line .bf-dpt:not(.bf-dpt-quiet) .bf-dpt-name'),
          (d) => d.textContent,
        ),
        subs: subs(sharedBlocks),
      },
      tall: readParts(byRoute['1'], tall),
      tallSharedRows: tallBlocks.reduce((n, b) => n + b.querySelectorAll('.bf-row-shared').length, 0),
    };
  } finally {
    host.remove();
  }
}, [manyBytes, TALL, WIDE]);
same('every order in the fixture’s shared blocks prints its own lines, crates and marker', manyPrinted.read, []);
same('and every order in the fixture prints its lines by supplier, then name, across its parts',
  manyPrinted.lineOrder.problems, []);
same(
  'the wide customer is one block: ×N crates on its 250 breads, its refusing order false, its long department a sub-heading',
  manyPrinted.wide,
  { blocks: 1, compact: true, refusing: 'want substitute: false', subs: [WIDE_DEPT] },
);
same('a shared department stays boxed in the heading, with no sub-heading', manyPrinted.shared, {
  blocks: 1,
  boxed: ['Avdeling 2'],
  subs: [],
});

// ── A block taller than a page, cut between orders ─────────────────────────
//
// Whole orders first; only an order taller than a page of its own is cut
// between its lines. Every part says which part it is, reopens the department
// its lines belong to, and a continued order says so where its crates were.

/** What every set of parts must show, whoever made them. */
const partsHold = (what, parts) => {
  check(
    `${what}: each part prints one heading with its part N of M`,
    parts.length > 1 &&
      parts.every(
        (p, i) => p.names === 1 && JSON.stringify(p.tags) === JSON.stringify([`part ${i + 1} of ${parts.length}`]),
      ),
    JSON.stringify(parts.map((p) => [p.names, p.tags])),
  );
  same(`${what}: no department sub-heading ends a part without a line under it`,
    parts.map((p) => p.bareSubs).filter((n) => n > 0), []);
};

const tall = manyPrinted.tall;
const TALL_IDS = [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108, 7109, 7110, 7111, 7112, 7113, 7114];
partsHold('the tall customer', tall);
check('the tall customer prints as one block, cut into parts', manyPrinted.tallSharedRows === 304,
  `${manyPrinted.tallSharedRows} of 304 lines in shared parts`);
const partsOf = (id) => tall.map((p, i) => (p.ids.includes(id) ? i : -1)).filter((i) => i >= 0);
same('every order id prints', TALL_IDS.filter((id) => partsOf(id).length === 0), []);
same(
  'only the 80-line order runs onto a second part; every other order sits on one',
  TALL_IDS.filter((id) => partsOf(id).length > 1),
  [7106],
);
same(
  'the 80-line order opens each later part with continued and its marker, and no crates',
  tall.flatMap((p, i) => p.continued.map((row) => [i, ...row])),
  partsOf(7106).slice(1).map((i) => [i, 7106, 1, 0]),
);
check(
  'there is one crate run per order across all the parts',
  tall.reduce((n, p) => n + p.crates, 0) === TALL_IDS.length,
  `${tall.reduce((n, p) => n + p.crates, 0)} runs for ${TALL_IDS.length} orders`,
);
same('only the two refusing orders read false', tall.flatMap((p) => p.falses), [7107, 7111]);

// One order of 300 lines: every part carries the heading, the tag and the
// marker, and the crates print once — they used to print on every part, each
// counted from that part's lines alone.
const giantRead = await page.evaluate(async ([b]) => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.append(host);
  try {
    const book = await Xlsx.open(new Uint8Array(b).buffer);
    const [route] = Model.group(Model.fold(Model.readRows(await book.sheet('Data'))));
    const sheets = Sheet.paginate(
      route,
      { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
      { dates: null, source: 'edge', routeStops: 1, routeLines: 300 },
      { host },
    );
    for (const sheet of sheets) host.append(sheet);
    return {
      parts: readParts(sheets, 'Customer 001'),
      want: Model.crateCount(route.orders[0], Model.defaultCrateRules()),
    };
  } finally {
    host.remove();
  }
}, [Array.from(await readFile('scripts/fixtures/edge/PSR-BREAD-2026-03-04-to-2026-03-04-one-giant-stop.xlsx'))]);
const giant = giantRead.parts;
partsHold('one order of 300 lines', giant);
same(
  // One bakery and zero-padded names, so the owner's order is the file's too.
  'its 300 lines print once each, in order',
  giant.flatMap((p) => p.products),
  Array.from({ length: 300 }, (_, i) => `Bread variety number ${String(i).padStart(3, '0')}`),
);
same('its crates print once, on its first part', giant.map((p) => p.crates),
  giant.map((_, i) => (i === 0 ? 1 : 0)));
// Once is not enough: the one run must be the whole order's count, not the
// first part's lines' — 300 lines of 3 is 900 breads, 90 full crates.
same('and that run is the whole order’s 90 full crates', [giant[0].crateCount, giantRead.want], [
  { large: 90, small: 0 },
  { large: 90, small: 0 },
]);
check(
  'and every later part still carries its marker and its id',
  giant.slice(1).every((p) => p.markers === 1 && JSON.stringify(p.headIds) === '[1]'),
  JSON.stringify(giant.slice(1).map((p) => [p.markers, p.headIds])),
);

// ── Changes to the export's own shape ──────────────────────────────────────
//
// The format is unlikely to change, which is why it is worth knowing what
// happens if it does. Each of these is one change to the file's shape, or one
// number at the edge of what a spreadsheet holds. The rule is the same for all
// of them: REFUSED with a message naming the problem, or read correctly.
// Never printed wrong, never a throw.
//
// scripts/make_shape_fixtures.py regenerates them.

const REFUSED = 'refused';
const SHAPES = [
  // What the reader must not accept, and roughly what it must say about it.
  ['extra-16th-column', REFUSED, /16/],
  ['one-column-short', REFUSED, /14/],
  ['header-renamed', REFUSED, /H1.*Customer/],
  ['columns-reordered', REFUSED, /A1.*Order ID/],
  ['header-on-column-O', REFUSED, /O1/],
  ['sheet-renamed', REFUSED, /no sheet named/],
  ['starts-at-row-2', REFUSED, /does not start at row 1/],
  ['header-only-no-data', REFUSED, /no order lines/],
  // What it must take in its stride.
  ['baseline', 1, null],
  ['blank-row-midway', 2, null],
  ['formula-cell', 2, null],
  ['quantity-as-text', 1, null],
  ['whitespace-padded', 1, null],
  ['unicode-everywhere', 1, null],
  ['order-id-huge', 1, null],
  ['product-id-zero', 1, null],
  ['sequence-negative', 1, null],
  ['quantity-2-billion', 1, null],
  ['quantity-beyond-float', 1, null],
  // What it must take, and say something about.
  ['quantity-negative', 1, null],
  ['quantity-zero', 1, null],
  ['quantity-fractional', 1, null],
  ['error-cell', 2, null],
];

for (const [fixture, expected, saying] of SHAPES) {
  const bytes = Array.from(
    await readFile(`scripts/fixtures/shape/PSR-BREAD-2026-03-04-to-2026-03-04-${fixture}.xlsx`),
  );
  const got = await page.evaluate(async ([b]) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px';
    document.body.append(host);
    try {
      const book = await Xlsx.open(new Uint8Array(b).buffer);
      let rows;
      try {
        rows = Model.readRows(await book.sheet('Data'));
      } catch (error) {
        return { outcome: 'refused', why: String(error.message || error) };
      }
      const findings = Validate.run(rows, Model.BREAD);
      const settings = { kind: Model.BREAD, showOrderId: true,
                         crates: Model.defaultCrateRules() };
      let printed = '';
      for (const route of Model.group(Model.fold(rows))) {
        for (const sheet of Sheet.paginate(
          route, settings,
          { dates: null, source: 'shape', routeStops: route.orders.length,
            routeLines: Model.lineCount(route) },
          { host },
        )) {
          host.appendChild(sheet);
          printed += ` ${sheet.textContent}`;
        }
      }
      return {
        outcome: 'read',
        rows: rows.length,
        said: findings.map((f) => f.kind),
        // A number that went wrong shows up as one of these on the paper.
        nonsense: ['NaN', 'Infinity', 'undefined', '[object'].filter((w) => printed.includes(w)),
      };
    } catch (error) {
      return { outcome: 'threw', why: String((error && error.message) || error) };
    } finally {
      host.remove();
    }
  }, [bytes]);

  if (expected === REFUSED) {
    check(
      `${fixture}: refused, and the message names the problem`,
      got.outcome === 'refused' && saying.test(got.why),
      got.why || got.outcome,
    );
  } else {
    check(
      `${fixture}: read as ${expected} row(s), nothing nonsensical printed`,
      got.outcome === 'read' && got.rows === expected && got.nonsense.length === 0,
      JSON.stringify(got),
    );
  }
}

// Nothing checked the quantity column at all, so these three printed as they
// stood: a line reading -5, a line reading 0, and a 2.5 silently made a 2.
const quantitySays = await page.evaluate(async ([neg, zero, half]) => {
  const read = async (bytes) => {
    const book = await Xlsx.open(new Uint8Array(bytes).buffer);
    const rows = Model.readRows(await book.sheet('Data'));
    return Validate.run(rows, Model.BREAD)
      .filter((f) => f.kind === 'impossible-quantity')
      .map((f) => [f.severity, f.headline]);
  };
  return { negative: await read(neg), zero: await read(zero), fractional: await read(half) };
}, await Promise.all(
  ['quantity-negative', 'quantity-zero', 'quantity-fractional'].map(async (n) =>
    Array.from(await readFile(`scripts/fixtures/shape/PSR-BREAD-2026-03-04-to-2026-03-04-${n}.xlsx`))),
));

same('a negative quantity blocks the print', quantitySays.negative,
  [['blocking', '1 line(s) ask for a negative quantity']]);

// One address on two routes is allowed — two departments at one school on
// two vans — so it is said, not blocked, and the address prints on both.
const twoRoutes = await page.evaluate(() => {
  const row = (excelRow, orderId, route, department) => ({
    excelRow, orderId, orderIdExact: orderId, quantity: 4, quantityExact: 4, productId: 10,
    productName: 'Grovbrød',
    supplierSku: 'SB-10', position: null, supplier: 'Sandnes Bakeri', customer: 'Hinna skole',
    department, deliveryStreet: 'Hinnavegen 1', comment: null, routeNickname: route,
    routeOrdering: 1, acceptAlternatives: false, acceptAlternativesExact: false,
    region: 'Stavanger',
  });
  const rows = [row(2, 501, '3', 'Kantine'), row(3, 502, '7', 'SFO')];
  const findings = Validate.run(rows, Model.BREAD);
  return {
    said: findings.filter((f) => f.kind === 'address-on-two-routes').map((f) => [f.severity, f.headline]),
    blocks: Validate.blocks(findings),
    printedOn: Model.group(Model.fold(rows))
      .filter((r) => r.orders.some((s) => s.deliveryStreet === 'Hinnavegen 1')).map((r) => r.nickname),
  };
});
same('one address on two routes is a notice, not a block', twoRoutes.said,
  [['notice', 'Hinnavegen 1 is on more than one route']]);
check('and does not stop the print', twoRoutes.blocks === false);
same('and the address prints on both routes', twoRoutes.printedOn, ['3', '7']);

// A row with no Order ID reads as order 0, so two of them for one customer
// used to fold quietly into one order and print as one.
const noOrderId = await page.evaluate(() => {
  const row = (excelRow, productId) => ({
    excelRow, orderId: 0, orderIdExact: null, quantity: 4, quantityExact: 4, productId,
    productName: `Brød ${productId}`, supplierSku: `SB-${productId}`, position: null,
    supplier: 'Sandnes Bakeri', customer: 'Hinna skole', department: null,
    deliveryStreet: 'Hinnavegen 1', comment: null, routeNickname: '3', routeOrdering: 1,
    acceptAlternatives: true, acceptAlternativesExact: true, region: 'Stavanger',
  });
  const findings = Validate.run([row(2, 10), row(3, 11)], Model.BREAD);
  return {
    said: findings
      .filter((f) => f.kind === 'blank-required-field')
      .map((f) => [f.severity, f.headline]),
    blocks: Validate.blocks(findings),
  };
});
same('a missing Order ID is said for each row, as blocking', noOrderId.said, [
  ['blocking', 'Order ID is empty or not a number on row 2'],
  ['blocking', 'Order ID is empty or not a number on row 3'],
]);
check('and it would make the pages wrong', noOrderId.blocks === true);

// Read through the reader itself: a blank or whitespace Order ID cell used
// to read as the number 0, and 0 passed as a number.
const blankIds = await page.evaluate(() =>
  Validate.run(
    Model.readRows(
      sheetOf([
        exportRow({ orderId: '' }),
        exportRow({ orderId: '   ' }),
        exportRow({ orderId: 1000000502, productId: 11, productName: 'Loff', supplierSku: 'SB-11' }),
      ]),
    ),
    Model.BREAD,
  )
    .filter((f) => f.kind === 'blank-required-field')
    .map((f) => [f.severity, f.headline]),
);
same('a blank or whitespace Order ID cell is said for its row, as blocking', blankIds, [
  ['blocking', 'Order ID is empty or not a number on row 2'],
  ['blocking', 'Order ID is empty or not a number on row 3'],
]);

// A blank or unrecognised Accept alternatives cell used to read as false and
// print bold "want substitute: false" with nothing said at Check. The file's
// own spellings — a real boolean, 1/0, yes/no — still pass.
const answers = await page.evaluate(() => {
  const row = (orderId, answer) =>
    exportRow({ orderId, acceptAlternatives: answer, productId: orderId % 1000, supplierSku: `SB-${orderId}` });
  const rows = Model.readRows(
    sheetOf([
      row(1000000601, null),
      row(1000000602, 'ja'),
      row(1000000603, 'no'),
      row(1000000604, 1),
      row(1000000605, false),
    ]),
  );
  const findings = Validate.run(rows, Model.BREAD);
  return {
    said: findings.filter((f) => /Accept alternatives/.test(f.headline)).map((f) => [f.severity, f.headline]),
    read: rows.map((r) => r.acceptAlternativesExact),
    blocks: Validate.blocks(findings),
  };
});
same('a blank or unrecognised substitute answer is said for its row, as blocking', answers.said, [
  ['blocking', 'Accept alternatives is empty or not true/false on row 2'],
  ['blocking', 'Accept alternatives is empty or not true/false on row 3'],
]);
same('and the plain answers read as the file gives them', answers.read, [null, null, false, true, false]);
check('and it would make the pages wrong, so Continue anyway is the leader’s call', answers.blocks === true);

// 400 of one bread is a school kitchen and prints without comment. Four
// figures is a decimal point in the wrong place — it still prints, because the
// app cannot know, but it says the number out loud first.
const scale = await page.evaluate(async ([busy, four]) => {
  const said = async (bytes) => {
    const book = await Xlsx.open(new Uint8Array(bytes).buffer);
    const rows = Model.readRows(await book.sheet('Data'));
    return Validate.run(rows, Model.BREAD)
      .filter((f) => f.kind === 'impossible-quantity')
      .map((f) => f.headline);
  };
  return { busy: await said(busy), four: await said(four) };
}, await Promise.all(['busy-real-day', 'four-figure-line'].map(async (n) =>
  Array.from(await readFile(`scripts/fixtures/edge/PSR-BREAD-2026-03-04-to-2026-03-04-${n}.xlsx`)))));

same('a 400-bread order is a big day, not a mistake', scale.busy, []);
same('a four-figure line is called out before it prints', scale.four,
  ['1 line(s) ask for 1000 or more of one bread']);
same('a line asking for nothing is called out', quantitySays.zero,
  [['warning', '1 line(s) ask for nothing']]);
same('half a bread is not quietly made whole', quantitySays.fractional,
  [['warning', '1 quantity(ies) are not whole breads']]);

// ── More bakeries than the key can name ────────────────────────────────────
//
// The key is furniture: it prints on every sheet, so whatever it costs, it
// costs once per page. Unbounded, it eats the page it sits on — 250 bakeries
// on one route grew the band to 228 mm, left 15 mm of body, and emitted 500
// near-empty sheets that still spilled, saying nothing. The key gives up the
// names first, then the codes, rather than the page.

const crowded = await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px';
  document.body.append(host);
  const ruler = document.createElement('div');
  ruler.style.cssText = 'width:100mm;position:absolute;visibility:hidden';
  document.body.append(ruler);
  const perPx = 100 / ruler.getBoundingClientRect().width;
  ruler.remove();

  const measure = (count) => {
    const lines = Array.from({ length: count }, (_, i) => ({
      quantity: 12,
      product: { id: 500 + i, name: `Brød nummer ${i + 1}`, sku: String(500 + i),
                 supplier: `Bakeri Nummer ${i + 1}` },
    }));
    const route = Model.route('3', [{
      id: 1, customer: 'Kafé 01', department: null, deliveryStreet: 'Street 01',
      route: '3', sequence: 100, acceptAlternatives: true, comment: null, lines,
    }]);
    const pages = Sheet.paginate(
      route,
      { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
      { dates: null, source: 'crowded', routeStops: 1, routeLines: count },
      { host },
    );
    for (const sheet of pages) host.appendChild(sheet);
    let spill = 0;
    let clearance = Infinity;
    for (const sheet of pages) {
      spill = Math.max(spill, (sheet.scrollHeight - sheet.clientHeight) * perPx);
      const body = sheet.querySelector('.bf-body');
      const foot = sheet.querySelector('.bf-footer');
      const last = body.lastElementChild;
      const bottom = last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().top;
      clearance = Math.min(clearance, (foot.getBoundingClientRect().top - bottom) * perPx);
    }
    const legend = Math.round(pages[0].querySelector('.bf-legend').getBoundingClientRect().height * perPx);
    const key = pages[0].querySelector('.bf-legend-suppliers').textContent;
    const parts = readParts(pages, 'Kafé 01');
    const products = parts.flatMap((p) => p.products);
    host.innerHTML = '';
    return { pages: pages.length, legend, spill: Math.round(spill),
             clearance: Math.round(clearance), spelled: /Bakeri Nummer/.test(key),
             saysMore: /\+\d+ more/.test(key),
             parts: parts.length,
             crates: parts.map((p) => p.crates).join(''),
             firstCrates: parts[0].crateCount,
             wantCrates: Model.crateCount(route.orders[0], Model.defaultCrateRules()),
             inOrder: products.length === count &&
               // 250 bakeries: in the owner's order, by code, then name.
               JSON.stringify(products) ===
                 JSON.stringify(printOrder(lines).map((line) => line.product.name)) };
  };

  try {
    return { twelve: measure(12), many: measure(250) };
  } finally {
    host.remove();
  }
});

check('a dozen bakeries are still spelled out in the key',
  crowded.twelve.spelled && crowded.twelve.legend <= 24,
  JSON.stringify(crowded.twelve));
check('far more bakeries than the key can name does not eat the page',
  crowded.many.legend <= 24 && crowded.many.spill === 0 && crowded.many.clearance >= 10,
  JSON.stringify(crowded.many));
check('and the sheet count stays sane rather than one page per line',
  crowded.many.pages < 40,
  `${crowded.many.pages} sheets for 250 lines`);
check('the key says how many it could not name', crowded.many.saysMore,
  JSON.stringify(crowded.many));
check(
  'its 250 lines print once each, in order, with the crates on the first part alone',
  crowded.many.inOrder && crowded.many.parts > 1 &&
    crowded.many.crates === `1${'0'.repeat(crowded.many.parts - 1)}`,
  JSON.stringify(crowded.many),
);
same('and its first part carries the whole order’s crates', crowded.many.firstCrates, crowded.many.wantCrates);

// The flag says the stops below it were never given a position, so it must
// never end a page alone. An unsequenced stop that fitted a page but not the
// room left beside the flag used to push the flag onto a page of its own.
const flagSweep = await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.append(host);
  const loaf = (i) => ({
    product: { id: 100 + i, name: `Brød ${i + 1}`, sku: String(100 + i), supplier: 'sandnes bakeri' },
    quantity: 2,
  });
  // The second stop is unsequenced (under the flag) or given a position of
  // its own (no flag), and printed; the parts it took are counted.
  const lay = (lines, sequence) => {
    const route = Model.route('5', [
      { id: 1, customer: 'Kafé 01', department: null, deliveryStreet: 'Street 01', route: '5',
        sequence: 100, acceptAlternatives: true, comment: null, lines: [loaf(0)] },
      { id: 2, customer: 'Kafé 02', department: null, deliveryStreet: 'Street 02', route: '5',
        sequence, acceptAlternatives: true, comment: null,
        lines: Array.from({ length: lines }, (_, i) => loaf(i)) },
    ]);
    const sheets = Sheet.paginate(
      route,
      { kind: Model.BREAD, showOrderId: true, crates: Model.defaultCrateRules() },
      { dates: null, source: 'sweep', routeStops: 2, routeLines: lines + 1 },
      { host },
    );
    for (const sheet of sheets) host.append(sheet);
    const seen = inspectSheets(sheets);
    const parts = readParts(sheets, 'Kafé 02').length;
    host.innerHTML = '';
    return { seen, parts };
  };
  const wrong = [];
  const cuts = [];
  try {
    for (let lines = 30; lines <= 70; lines += 1) {
      const { seen, parts } = lay(lines, 0);
      if (seen.flagLast.length > 0 || seen.clearance < 10 || seen.down > 0.5) {
        wrong.push([lines, seen.flagLast, seen.clearance, seen.down]);
      }
      if (lines >= 38 && lines <= 41) cuts.push([lines, parts, lay(lines, 200).parts]);
    }
    return { wrong, cuts };
  } finally {
    host.remove();
  }
});
same(
  'an unsequenced stop of 30 to 70 lines after a sequenced one never leaves the flag alone at a foot',
  flagSweep.wrong,
  [],
);
// The price of that, kept on purpose: at 39 and 40 lines the stop fits a
// page of its own whole, but not the room beside the flag, so under the flag
// it is cut in two. [lines, parts under the flag, parts with a position]
same('a stop that fits a page but not beside the flag is cut, and only then', flagSweep.cuts, [
  [38, 1, 1],
  [39, 2, 1],
  [40, 2, 1],
  [41, 2, 2],
]);

// A file that is not this file at all still fails with a sentence, not a stack.
for (const [what, bytes] of [
  ['an empty file', []],
  ['a CSV someone renamed', Array.from(Buffer.from('a,b,c\n1,2,3\n'))],
]) {
  const said = await page.evaluate(async ([b]) => {
    try {
      await Xlsx.open(new Uint8Array(b).buffer);
      return 'opened it, which it should not have';
    } catch (error) {
      return String((error && error.message) || error);
    }
  }, [bytes]);
  check(`${what} is refused in words`, /not a zip file|not a workbook/.test(said), said);
}

// The Rust binary answers `breadify licences`; the page owes the same answer.
const colophon = await page.evaluate(() => {
  const foot = document.querySelector('.colophon');
  if (!foot) return null;
  return Array.from(foot.querySelectorAll('a'), (a) => a.getAttribute('href'));
});
same('the three typefaces ship their licences, and the page links them', colophon, [
  'fonts/Archivo-OFL.txt',
  'fonts/SpaceGrotesk-OFL.txt',
  'fonts/IBMPlexMono-OFL.txt',
]);

same('no console errors', errors.slice(0, 5), []);

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
