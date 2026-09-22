// The data spine: an export's rows, folded into the orders and routes the
// printed page is built from.
//
// A port of the Rust app's `sheet`, `order`, `route`, `crates`, `total`,
// `supplier` and `date` modules. The decisions it implements are lettered —
// D1..D25 in the Breadify repo's docs/print-layout.md, F1..F10 in
// docs/freezer-list.md — and quoted where they bite.

'use strict';

const Model = (() => {
  // ── The worksheet ──────────────────────────────────────────────────────

  /** The sheet every export carries its data on. */
  const SHEET_NAME = 'Data';

  /**
   * The 14 headers in `A1:N1`, in order. A fifteenth column follows them with
   * data in every row and no header, which is why this list is one short.
   */
  const HEADERS = [
    'Order ID',
    'Quantity',
    'Product ID',
    'Product Name',
    'Supplier SKU',
    'Position',
    'Supplier',
    'Customer',
    'Department',
    'Delivery street',
    'Comment',
    'Route nickname',
    'Route ordering',
    'Accept alternatives',
  ];

  const COLUMN_COUNT = 15;

  /** Columns by index, so a reader never counts cells to find one. */
  const COLUMN = {
    orderId: 0,
    quantity: 1,
    productId: 2,
    productName: 3,
    supplierSku: 4,
    position: 5,
    supplier: 6,
    customer: 7,
    department: 8,
    deliveryStreet: 9,
    comment: 10,
    routeNickname: 11,
    routeOrdering: 12,
    acceptAlternatives: 13,
    region: 14,
  };

  class ReadError extends Error {}

  /** `A`, `B`, … `O` — for naming a cell in an error. */
  function columnLetter(index) {
    return String.fromCharCode(65 + index);
  }

  /**
   * Text out of a cell, whatever the cell holds. `Supplier SKU` and
   * `Route nickname` look numeric and are not, so a number that reaches here
   * is stringified rather than kept — `1` must stay `"1"`.
   */
  function text(cell) {
    if (!cell) return '';
    if (cell.kind === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
    if (cell.kind === 'number') return String(cell.value);
    return String(cell.value).trim();
  }

  /** Text, or absent. An empty cell is absent, never an empty string. */
  function optional(cell) {
    const value = text(cell);
    return value === '' ? null : value;
  }

  function integer(cell, fallback = 0) {
    if (!cell) return fallback;
    const number = cell.kind === 'number' ? cell.value : Number(cell.value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  /**
   * The number a cell holds before `integer` truncates it, or null where it
   * held no number at all.
   *
   * Kept because truncating is a decision, not a reading: a quantity of 2.5
   * becomes 2 and the picker is told to pick two. validate.js compares the two
   * and says so rather than letting half a bread disappear in silence.
   */
  function exactNumber(cell) {
    if (!cell) return null;
    const number = cell.kind === 'number' ? cell.value : Number(cell.value);
    return Number.isFinite(number) ? number : null;
  }

  /**
   * `Accept alternatives` is a genuine Excel boolean. An exporter that ever
   * writes it as 0/1 or as the words still reads correctly here.
   */
  function boolean(cell) {
    if (!cell) return false;
    if (cell.kind === 'boolean') return cell.value;
    if (cell.kind === 'number') return cell.value !== 0;
    return /^(1|true|yes)$/i.test(String(cell.value).trim());
  }

  /**
   * Reads the export's one worksheet into raw rows.
   *
   * Throws on anything that makes the columns untrustworthy — a missing
   * sheet, a changed header. Problems *within* a readable file are validation
   * findings instead; see validate.js.
   */
  function readRows(sheet) {
    if (!sheet) throw new ReadError(`the workbook has no sheet named "${SHEET_NAME}"`);
    if (sheet.rows.length === 0) throw new ReadError('the sheet is empty');

    const header = sheet.rows[0];
    if (header.number !== 1) {
      throw new ReadError(
        `the sheet does not start at row 1 (it starts at row ${header.number}), ` +
          'so the columns cannot be trusted',
      );
    }
    // Before the column count, because a file with its headers and nothing
    // under them has 14 columns — the fifteenth carries no header — and
    // "expected 15 columns but the sheet has 14" blames the wrong thing.
    if (sheet.rows.length < 2) {
      throw new ReadError(
        'the sheet has its headers but no order lines under them \u2014 ' +
          'this looks like an export of an empty day',
      );
    }
    if (sheet.width !== COLUMN_COUNT) {
      throw new ReadError(
        `expected ${COLUMN_COUNT} columns (A to O) but the sheet has ${sheet.width}`,
      );
    }

    HEADERS.forEach((expected, index) => {
      const found = text(header.cells.get(index));
      if (found !== expected) {
        throw new ReadError(
          `cell ${columnLetter(index)}1 should be the header "${expected}" ` +
            `but reads "${found}"`,
        );
      }
    });
    const fifteenth = text(header.cells.get(COLUMN.region));
    if (fifteenth !== '') {
      throw new ReadError(
        `cell O1 should be empty — the fifteenth column has no header — ` +
          `but reads "${fifteenth}"`,
      );
    }

    return sheet.rows.slice(1).map((row) => {
      const cell = (index) => row.cells.get(index);
      return {
        excelRow: row.number,
        orderId: integer(cell(COLUMN.orderId)),
        quantity: integer(cell(COLUMN.quantity)),
        quantityExact: exactNumber(cell(COLUMN.quantity)),
        productId: integer(cell(COLUMN.productId)),
        productName: text(cell(COLUMN.productName)),
        supplierSku: text(cell(COLUMN.supplierSku)),
        position: optional(cell(COLUMN.position)),
        supplier: text(cell(COLUMN.supplier)),
        customer: text(cell(COLUMN.customer)),
        department: optional(cell(COLUMN.department)),
        deliveryStreet: text(cell(COLUMN.deliveryStreet)),
        comment: optional(cell(COLUMN.comment)),
        routeNickname: text(cell(COLUMN.routeNickname)),
        routeOrdering: integer(cell(COLUMN.routeOrdering)),
        acceptAlternatives: boolean(cell(COLUMN.acceptAlternatives)),
        region: text(cell(COLUMN.region)),
      };
    });
  }

  // ── What the filename says ─────────────────────────────────────────────

  const BREAD = 'bread';
  const FREEZER = 'freezer';
  const PREFIX = { [BREAD]: 'PSR-BREAD-', [FREEZER]: 'PSR-FREEZER-' };
  const EXPORT_KINDS = [BREAD, FREEZER];

  /** `PSR-BREAD-2026-03-04-to-2026-03-04 (1).xlsx` -> the stem, suffix gone. */
  function stem(filename) {
    const dot = filename.lastIndexOf('.');
    const withoutExtension = dot === -1 ? filename : filename.slice(0, dot);
    // A browser that downloaded the same file twice appends " (1)".
    return withoutExtension.trim().replace(/\s*\(\d+\)$/, '').trim();
  }

  function parseDate(part) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  function formatDate(date) {
    const pad = (value, width) => String(value).padStart(width, '0');
    return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
  }

  function sameDay(left, right) {
    return (
      left.year === right.year && left.month === right.month && left.day === right.day
    );
  }

  function formatDates(dates) {
    if (!dates) return 'date unknown';
    return sameDay(dates.from, dates.to)
      ? formatDate(dates.from)
      : `${formatDate(dates.from)} to ${formatDate(dates.to)}`;
  }

  /**
   * Which list a file is, and the day it delivers — both out of the filename,
   * because no column of the export carries a date.
   *
   * A name that says nothing is not an error: the kind falls back to bread
   * (the stricter reading, and the kind every check was derived from) and the
   * date is the user's to enter.
   */
  function fromFilename(filename) {
    const name = stem(filename || '');
    for (const kind of EXPORT_KINDS) {
      if (!name.startsWith(PREFIX[kind])) continue;
      const rest = name.slice(PREFIX[kind].length);
      const separator = rest.indexOf('-to-');
      if (separator === -1) return { kind, dates: null, named: true };
      const from = parseDate(rest.slice(0, separator));
      const to = parseDate(rest.slice(separator + 4));
      return {
        kind,
        dates: from && to ? { from, to } : null,
        named: true,
      };
    }
    return { kind: BREAD, dates: null, named: false };
  }

  /** The stem, for the footer: `PSR-BREAD-2026-03-04`. */
  function sourceLabel(filename, dates) {
    const parsed = fromFilename(filename);
    if (!parsed.named || !dates) return stem(filename || '') || 'unnamed export';
    return `${PREFIX[parsed.kind]}${formatDate(dates.from)}`;
  }

  // ── The suppliers ──────────────────────────────────────────────────────

  /**
   * The bakeries the bread page knows: the export's spelling, the code every
   * bread line carries, and the name a heading spells out. Dropping the
   * repeated name for a two-letter code is what paid for the 11 pt body (D4).
   */
  const KNOWN_SUPPLIERS = [
    ['sandnes bakeri', 'SB', 'Sandnes Bakeri'],
    ['bakehuset', 'BH', 'Bakehuset'],
  ];

  function knownSupplier(supplier) {
    const wanted = String(supplier).toLowerCase();
    return KNOWN_SUPPLIERS.find(([name]) => name.toLowerCase() === wanted) || null;
  }

  /**
   * The short code. A wholesaler nobody has configured falls back to its
   * initials, or its first two letters when it is a single word.
   *
   * Capped at three, because the code prints in a fixed 8 mm slot on every
   * bread line: "Det Store Sandnes og Jæren Håndverksbakeri og Konditori AS"
   * derived nine initials and set them straight through the product name
   * beside it. Two suppliers can still derive the same code — nothing here
   * can tell Sola Bakeri from Stavanger Bakeri — which is why validate.js
   * says so and the legend names both.
   */
  const CODE_LENGTH = 3;

  function supplierCode(supplier) {
    const known = knownSupplier(supplier);
    if (known) return known[1];

    const initials = String(supplier)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => Array.from(word)[0] || '')
      .join('');
    const derived =
      Array.from(initials).length >= 2
        ? initials
        : Array.from(String(supplier)).slice(0, 2).join('');
    return Array.from(derived).slice(0, CODE_LENGTH).join('').toUpperCase();
  }

  function supplierName(supplier) {
    const known = knownSupplier(supplier);
    if (known) return known[2];
    return String(supplier)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => Array.from(word)[0].toUpperCase() + word.slice(1))
      .join(' ');
  }

  /** The house order first, then anything new, alphabetically. */
  function supplierPosition(supplier) {
    const rank = KNOWN_SUPPLIERS.findIndex(
      ([name]) => name.toLowerCase() === String(supplier).toLowerCase(),
    );
    return [rank === -1 ? KNOWN_SUPPLIERS.length : rank, String(supplier).toLowerCase()];
  }

  // ── Orders ─────────────────────────────────────────────────────────────

  /**
   * Folds rows into orders, keeping both the orders and their lines in the
   * order the file lists them.
   *
   * A row is one product on one order; everything else on it belongs to the
   * order and is repeated onto each line. One order is one stop, one block and
   * one crate label (D16).
   */
  function fold(rows) {
    const orders = [];
    const positionOf = new Map();

    for (const row of rows) {
      const line = {
        product: {
          id: row.productId,
          name: row.productName,
          sku: row.supplierSku,
          supplier: row.supplier,
        },
        quantity: row.quantity,
      };

      const position = positionOf.get(row.orderId);
      if (position !== undefined) {
        const order = orders[position];
        order.lines.push(line);
        // The note is the one order-level value a line may simply not carry.
        if (order.comment === null) order.comment = row.comment;
        continue;
      }

      positionOf.set(row.orderId, orders.length);
      orders.push({
        id: row.orderId,
        customer: row.customer,
        department: row.department,
        deliveryStreet: row.deliveryStreet,
        route: row.routeNickname,
        sequence: row.routeOrdering,
        acceptAlternatives: row.acceptAlternatives,
        comment: row.comment,
        lines: [line],
      });
    }

    return orders;
  }

  /** Total breads on an order. This is what the crate arithmetic counts. */
  function units(order) {
    return order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  /**
   * Whether the export gave this stop a position in its route.
   *
   * `0` is a sentinel for "nobody assigned one", not position zero — five
   * stops share it on route 5 alone (D3).
   */
  function isSequenced(order) {
    return order.sequence !== 0;
  }

  // ── Routes ─────────────────────────────────────────────────────────────

  /**
   * How a route nickname sorts: by its leading number where it has one,
   * otherwise by name and then by the number that follows it.
   *
   * `1, 2, … 14, hau 1, hau 2` — never `1, 10, 11, … 2`, which is the single
   * most likely bug in this app.
   */
  function naturalKey(nickname) {
    const leading = /^(\d+)([\s\S]*)$/.exec(nickname);
    if (leading) return [0, Number(leading[1]), leading[2], 0];

    const trimmed = nickname.trimEnd();
    const trailing = /^([\s\S]*?)\s*(\d+)$/.exec(trimmed);
    if (trailing) return [1, 0, trailing[1], Number(trailing[2])];
    return [1, 0, trimmed, 0];
  }

  function compare(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const a = left[index];
      const b = right[index];
      if (a === b) continue;
      if (a === undefined) return -1;
      if (b === undefined) return 1;
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a) < String(b) ? -1 : 1;
    }
    return 0;
  }

  /**
   * What decides where a stop prints: sequenced stops in ascending sequence,
   * then the unsequenced ones, with address, department and order id breaking
   * ties so two runs of one file print identically (D2).
   *
   * Equal sequences are legitimate — one site with several delivery points —
   * which is exactly why the tiebreak is not optional.
   */
  function printingPosition(stop) {
    return [
      isSequenced(stop) ? 0 : 1,
      stop.sequence,
      stop.deliveryStreet,
      stop.department === null ? '' : stop.department,
      stop.id,
    ];
  }

  function sortStops(stops) {
    stops.sort((left, right) => compare(printingPosition(left), printingPosition(right)));
    return stops;
  }

  /** Groups orders into routes, both in printing order. */
  function group(orders) {
    const byNickname = new Map();
    for (const order of orders) {
      if (!byNickname.has(order.route)) byNickname.set(order.route, []);
      byNickname.get(order.route).push(order);
    }

    const routes = Array.from(byNickname, ([nickname, stops]) => ({
      nickname,
      stops: sortStops(stops),
    }));
    routes.sort((left, right) =>
      compare(naturalKey(left.nickname), naturalKey(right.nickname)),
    );
    return routes;
  }

  function unsequencedStops(route) {
    return route.stops.filter((stop) => !isSequenced(stop));
  }

  function lineCount(route) {
    return route.stops.reduce((sum, stop) => sum + stop.lines.length, 0);
  }

  // ── Crates (D17, D24, D25) ─────────────────────────────────────────────

  /** A bread that takes exactly one slot. Half-size items are 50, bulky 200. */
  const STANDARD_SIZE = 100;

  /**
   * The sizes worth a button, as the fraction a driver would say out loud.
   *
   * Thirds round down — three at 33 come to 99 hundredths and fill one slot,
   * which is right; at 34 they would ask for two.
   */
  const SIZE_PRESETS = [
    ['1/4', 25],
    ['1/3', 33],
    ['1/2', 50],
    ['2/3', 66],
    ['1', STANDARD_SIZE],
    ['1 1/2', 150],
    ['2', 200],
    ['3', 300],
  ];

  function defaultCrateRules() {
    return { largeCapacity: 10, smallCapacity: 5, sizePercent: {} };
  }

  function sizeOf(rules, productId) {
    const size = rules.sizePercent[productId];
    return size === undefined ? STANDARD_SIZE : size;
  }

  /**
   * Marks a bread as taking `percent` of a slot.
   *
   * Setting one back to a whole slot forgets it rather than recording the
   * default, so "which breads has someone had to say something about" stays
   * answerable.
   */
  function setSize(rules, productId, percent) {
    if (percent === STANDARD_SIZE) delete rules.sizePercent[productId];
    else rules.sizePercent[productId] = percent;
    return rules;
  }

  /** How a size reads: the fraction if it is a button, the percentage if not. */
  function spokenSize(percent) {
    const preset = SIZE_PRESETS.find(([, value]) => value === percent);
    return preset ? preset[0] : `${percent} %`;
  }

  /**
   * Slots an order fills, rounding a part-slot up to a whole one.
   *
   * A bread at 50 % and a quantity of 3 fills two slots, not one and a half:
   * half a slot still occupies a slot's worth of crate.
   */
  function slots(order, rules) {
    const hundredths = order.lines.reduce(
      (sum, line) => sum + line.quantity * sizeOf(rules, line.product.id),
      0,
    );
    return Math.ceil(hundredths / STANDARD_SIZE);
  }

  /**
   * How many crates of each size an order needs, in the fewest containers.
   *
   * A remainder that fits a small crate takes one; a remainder too big for one
   * takes a large crate rather than two smalls.
   */
  function crateCount(order, rules) {
    const capacity = Math.max(rules.largeCapacity, 1);
    const small = Math.max(Math.min(rules.smallCapacity, capacity - 1), 1);

    const filled = slots(order, rules);
    const large = Math.floor(filled / capacity);
    const remainder = filled % capacity;

    if (remainder === 0) return { large, small: 0 };
    if (remainder <= small) return { large, small: 1 };
    return { large: large + 1, small: 0 };
  }

  function crateTotal(count) {
    return count.large + count.small;
  }

  /** More than this on one route and the sheet asks for a pallet (D25). */
  const PALLET_THRESHOLD = 16;

  /** Every crate a route needs, all stops summed. */
  function routeCrates(route, rules) {
    return route.stops.reduce(
      (sum, stop) => sum + crateTotal(crateCount(stop, rules)),
      0,
    );
  }

  // ── Route totals (D15, F9) ─────────────────────────────────────────────

  /**
   * How much of each bread the whole route needs, split by bakery.
   *
   * The receiving check against what the bakeries delivered that morning,
   * rather than picking work — so no tick boxes.
   */
  function routeTotal(route) {
    const byProduct = new Map();
    for (const stop of route.stops) {
      for (const line of stop.lines) {
        let entry = byProduct.get(line.product.id);
        if (!entry) {
          entry = { product: line.product, units: 0, fullTens: 0 };
          byProduct.set(line.product.id, entry);
        }
        entry.units += line.quantity;
        // Full tens *inside a single order* — how many trays can be pulled
        // whole. An order of 11 and an order of 9 make one, not two.
        entry.fullTens += Math.floor(line.quantity / 10);
      }
    }

    const bySupplier = new Map();
    for (const entry of byProduct.values()) {
      const key = entry.product.supplier;
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key).push(entry);
    }

    const columns = Array.from(bySupplier, ([supplier, lines]) => ({
      supplier,
      lines: lines.sort(
        (left, right) =>
          right.units - left.units ||
          (left.product.name < right.product.name ? -1 : left.product.name > right.product.name ? 1 : 0),
      ),
    }));
    columns.sort((left, right) =>
      compare(supplierPosition(left.supplier), supplierPosition(right.supplier)),
    );
    return { columns };
  }

  /**
   * The same total flattened into one list, most needed first — the freezer
   * sheet's closing count, where the supplier is a cue on the line rather than
   * a column of its own (F4, F9).
   */
  function flatTotal(route) {
    const lines = routeTotal(route).columns.flatMap((column) => column.lines);
    lines.sort(
      (left, right) =>
        right.units - left.units ||
        (left.product.name < right.product.name ? -1 : left.product.name > right.product.name ? 1 : 0),
    );
    return lines;
  }

  function columnUnits(column) {
    return column.lines.reduce((sum, line) => sum + line.units, 0);
  }

  function totalTypes(total) {
    return total.columns.reduce((sum, column) => sum + column.lines.length, 0);
  }

  function totalUnits(total) {
    return total.columns.reduce((sum, column) => sum + columnUnits(column), 0);
  }

  function totalFullTens(total) {
    return total.columns.reduce(
      (sum, column) => sum + column.lines.reduce((n, line) => n + line.fullTens, 0),
      0,
    );
  }

  function plural(count, word) {
    return count === 1 ? word : `${word}s`;
  }

  /** `6 types · 33 units`, pluralised — one bread reads `1 type · 10 units`. */
  function summary(types, unitCount) {
    return `${types} ${plural(types, 'type')} · ${unitCount} ${plural(unitCount, 'unit')}`;
  }

  return {
    SHEET_NAME,
    HEADERS,
    COLUMN,
    COLUMN_COUNT,
    ReadError,
    readRows,
    BREAD,
    FREEZER,
    EXPORT_KINDS,
    PREFIX,
    fromFilename,
    sourceLabel,
    formatDate,
    formatDates,
    parseDate,
    KNOWN_SUPPLIERS,
    supplierCode,
    supplierName,
    supplierPosition,
    fold,
    units,
    isSequenced,
    naturalKey,
    compare,
    sortStops,
    group,
    unsequencedStops,
    lineCount,
    STANDARD_SIZE,
    SIZE_PRESETS,
    defaultCrateRules,
    sizeOf,
    setSize,
    spokenSize,
    slots,
    crateCount,
    crateTotal,
    PALLET_THRESHOLD,
    routeCrates,
    routeTotal,
    flatTotal,
    columnUnits,
    totalTypes,
    totalUnits,
    totalFullTens,
    summary,
  };
})();

if (typeof module !== 'undefined') module.exports = Model;
