// Checking a file that read cleanly for the things that would make its
// printed pages wrong.
//
// Every invariant the layout relies on holds across the exports it was derived
// from — one file per list, one day each. That is not proof, so the loader
// checks rather than assumes, and reports what it finds instead of refusing
// the file. See docs/excel-format.md §6 in the Breadify repo.

'use strict';

const Validate = (() => {
  /** How much a finding should worry the user, most serious first. */
  const BLOCKING = 'blocking';
  const WARNING = 'warning';
  const NOTICE = 'notice';
  const SEVERITY_ORDER = { [BLOCKING]: 0, [WARNING]: 1, [NOTICE]: 2 };

  /** Which check produced a finding — for grouping, filtering and tests. */
  const KIND_ORDER = [
    'blank-required-field',
    'order-lines-disagree',
    'address-on-two-routes',
    'product-details-disagree',
    'unfamiliar-value',
    'unsequenced-stops',
    'unlabelled-column',
  ];

  /**
   * The suppliers every export of a kind has drawn from so far, in the
   * spelling the file uses. Bread has its two bakeries; the freezer list draws
   * on a warehouse of wholesalers.
   */
  const KNOWN_SUPPLIERS = {
    [Model.BREAD]: ['sandnes bakeri', 'bakehuset'],
    [Model.FREEZER]: [
      'asko',
      'fatland',
      'møremat',
      'ytterøy',
      'holmens as',
      'sørlandskjøtt as',
      'gabbas',
    ],
  };

  /** `"a", "b" and "c"`, for a sentence. */
  function quoted(values) {
    const parts = Array.from(values)
      .sort()
      .map((value) => JSON.stringify(value));
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }

  /**
   * Groups rows by a key, keeping the keys and the rows within each key in a
   * stable order so findings read the same on every run.
   */
  function groupBy(rows, key) {
    const grouped = new Map();
    for (const row of rows) {
      const value = key(row);
      if (!grouped.has(value)) grouped.set(value, []);
      grouped.get(value).push(row);
    }
    return Array.from(grouped).sort((left, right) =>
      Model.compare([left[0]], [right[0]]),
    );
  }

  function rowNumbers(lines) {
    return lines.map((row) => row.excelRow);
  }

  /**
   * The columns that must carry text. A cell can exist and still be blank,
   * which the reader cannot catch on its own.
   */
  function blankRequiredFields(rows) {
    const required = [
      ['Product Name', 'productName'],
      ['Supplier SKU', 'supplierSku'],
      ['Supplier', 'supplier'],
      ['Customer', 'customer'],
      ['Delivery street', 'deliveryStreet'],
      ['Route nickname', 'routeNickname'],
    ];

    const findings = [];
    for (const row of rows) {
      for (const [column, field] of required) {
        if (row[field] !== '') continue;
        findings.push({
          severity: BLOCKING,
          kind: 'blank-required-field',
          headline: `${column} is empty on row ${row.excelRow}`,
          detail:
            `Row ${row.excelRow} of order ${row.orderId} has no ${column}. ` +
            'Every line needs one.',
          rows: [row.excelRow],
        });
      }
    }
    return findings;
  }

  /**
   * Everything except the product and the quantity belongs to the order and is
   * repeated onto each of its lines. If two lines disagree, folding them into
   * one order would silently pick a winner.
   */
  function ordersThatDisagree(rows) {
    const attributes = [
      ['customer', (row) => row.customer],
      ['department', (row) => row.department || ''],
      ['delivery street', (row) => row.deliveryStreet],
      ['route', (row) => row.routeNickname],
      ['route ordering', (row) => String(row.routeOrdering)],
      ['accept alternatives', (row) => String(row.acceptAlternatives)],
    ];

    const findings = [];
    for (const [orderId, lines] of groupBy(rows, (row) => row.orderId)) {
      for (const [name, read] of attributes) {
        const values = new Set(lines.map(read));
        if (values.size < 2) continue;
        findings.push({
          severity: BLOCKING,
          kind: 'order-lines-disagree',
          headline: `Order ${orderId} has two values for ${name}`,
          detail:
            `The lines of order ${orderId} disagree about ${name}: ${quoted(values)}. ` +
            'Everything but the product and the quantity belongs to the order.',
          rows: rowNumbers(lines),
        });
      }

      // The note is the one order-level value a line may simply not carry:
      // this export repeats it onto every line, but writing it once would be
      // just as valid. Only two *different* notes are a problem.
      const notes = new Set(lines.map((row) => row.comment).filter(Boolean));
      if (notes.size >= 2) {
        findings.push({
          severity: BLOCKING,
          kind: 'order-lines-disagree',
          headline: `Order ${orderId} carries two different notes`,
          detail:
            `The lines of order ${orderId} carry ${quoted(notes)}. ` +
            'Only one can be printed.',
          rows: rowNumbers(lines),
        });
      }
    }
    return findings;
  }

  /**
   * The address is the most reliable identity a stop has, and the printed
   * order of a route depends on it belonging to exactly one route.
   */
  function addressesOnTwoRoutes(rows) {
    const findings = [];
    for (const [address, lines] of groupBy(rows, (row) => row.deliveryStreet)) {
      const routes = new Set(lines.map((row) => row.routeNickname));
      if (routes.size < 2) continue;
      findings.push({
        severity: BLOCKING,
        kind: 'address-on-two-routes',
        headline: `${address} is on more than one route`,
        detail:
          `${address} appears on routes ${Array.from(routes).sort().join(', ')}. ` +
          'One address belongs to one route.',
        rows: rowNumbers(lines),
      });
    }
    return findings;
  }

  /**
   * A product identifier that means two different things would put the wrong
   * bread on a page.
   */
  function productsThatDisagree(rows) {
    const attributes = [
      ['name', (row) => row.productName],
      ['SKU', (row) => row.supplierSku],
      ['supplier', (row) => row.supplier],
    ];

    const findings = [];
    for (const [productId, lines] of groupBy(rows, (row) => row.productId)) {
      for (const [name, read] of attributes) {
        const values = new Set(lines.map(read));
        if (values.size < 2) continue;
        findings.push({
          severity: BLOCKING,
          kind: 'product-details-disagree',
          headline: `Product ${productId} has two values for ${name}`,
          detail: `Product ${productId} appears with ${quoted(values)} as its ${name}.`,
          rows: rowNumbers(lines),
        });
      }
    }
    return findings;
  }

  /**
   * A route nickname is familiar if it is a number, or a name followed by one
   * — `7`, `hau 2`. The freezer list also names routes with words alone —
   * `hau`, `Svg Employee` — so a digit-free name is familiar there too.
   */
  function isFamiliarRoute(nickname, kind) {
    if (nickname === '') return false;
    if (/^\d+$/.test(nickname)) return true;
    if (kind === Model.FREEZER && !/\d/.test(nickname)) return true;
    return /^.+\s\d+$/.test(nickname);
  }

  /**
   * Values outside what every export of this kind has contained so far. Not
   * wrong — the app has simply never seen them, and someone should look before
   * printing.
   */
  function unfamiliarValues(rows, kind) {
    const known = KNOWN_SUPPLIERS[kind] || KNOWN_SUPPLIERS[Model.BREAD];

    const columns = [
      ['region', (row) => (row.region !== 'Stavanger' ? row.region : null)],
      [
        'supplier',
        (row) =>
          known.some((name) => name.toLowerCase() === row.supplier.toLowerCase())
            ? null
            : row.supplier,
      ],
      [
        'route nickname',
        (row) => (isFamiliarRoute(row.routeNickname, kind) ? null : row.routeNickname),
      ],
    ];

    const findings = [];
    for (const [column, oddOneOut] of columns) {
      const byValue = new Map();
      for (const row of rows) {
        const value = oddOneOut(row);
        if (value === null) continue;
        if (!byValue.has(value)) byValue.set(value, []);
        byValue.get(value).push(row.excelRow);
      }
      for (const [value, numbers] of Array.from(byValue).sort()) {
        findings.push({
          severity: NOTICE,
          kind: 'unfamiliar-value',
          headline: `New ${column}: ${value}`,
          detail:
            `${value} has not appeared in this column before. ` +
            `It appears on ${numbers.length} row(s).`,
          rows: numbers,
        });
      }
    }
    return findings;
  }

  /**
   * Not a problem — but the user should know before printing that some stops
   * will come out after the sequenced ones, under a flag, because the export
   * gave them no position.
   */
  function unsequencedStops(rows) {
    const unsequenced = rows.filter((row) => row.routeOrdering === 0);
    if (unsequenced.length === 0) return [];

    const customers = new Set(unsequenced.map((row) => row.customer));
    const routes = new Set(unsequenced.map((row) => row.routeNickname));
    return [
      {
        severity: NOTICE,
        kind: 'unsequenced-stops',
        headline: `${unsequenced.length} rows have no position in their route`,
        detail:
          `${customers.size} customers across ${routes.size} routes. ` +
          'They print after the sequenced stops, under a flag saying the order ' +
          'is the driver’s to choose.',
        rows: rowNumbers(unsequenced),
      },
    ];
  }

  /**
   * The fifteenth column has data in every row and no header. Worth saying
   * once, because a reader that trusts the header row drops it silently.
   */
  function unlabelledColumn(rows) {
    const values = new Set(rows.map((row) => row.region));
    if (values.size === 0) return [];
    return [
      {
        severity: NOTICE,
        kind: 'unlabelled-column',
        headline: 'Column O carries no header',
        detail:
          `Read positionally. It holds ${quoted(values)} on all ${rows.length} rows; ` +
          'nothing is keyed off it.',
        rows: [],
      },
    ];
  }

  /**
   * Runs every check over a file's rows.
   *
   * The invariants are the same for both lists; what counts as *familiar* —
   * suppliers, route nickname shapes — depends on which list this is, so the
   * caller says. Returns the findings most severe first; an empty list means
   * the file matches every invariant the layout relies on.
   */
  function run(rows, kind) {
    const findings = [
      ...blankRequiredFields(rows),
      ...ordersThatDisagree(rows),
      ...addressesOnTwoRoutes(rows),
      ...productsThatDisagree(rows),
      ...unfamiliarValues(rows, kind),
      ...unsequencedStops(rows),
      ...unlabelledColumn(rows),
    ];

    findings.sort(
      (left, right) =>
        SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
        KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
        Model.compare(left.rows, right.rows),
    );
    return findings;
  }

  /** Whether anything found would make the printed pages wrong. */
  function blocks(findings) {
    return findings.some((finding) => finding.severity === BLOCKING);
  }

  return { BLOCKING, WARNING, NOTICE, run, blocks, isFamiliarRoute };
})();

if (typeof module !== 'undefined') module.exports = Validate;
