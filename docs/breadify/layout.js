// Turning a route into printed sheets.
//
// The Rust app measures type itself and settles every millimetre before
// drawing. Here the browser is the type-setter, so the shape of the work is
// inverted: each piece — a stop block, the unsequenced flag, the route total —
// is built and measured on its own at the content column's exact width, and
// then the same share-out the Rust paginator performs decides which pieces go
// on which sheet.
//
// The rules it enforces, all from docs/print-spec.md in the Breadify repo:
// one route per sheet set and no page carrying two routes (D1); no stop block
// and no route total ever split across a break (D9); the unsequenced flag
// never left as the last thing on a page; and at least 10 mm of clearance
// between the last content and the footer, below which a printer with
// slightly different metrics silently clips a row.

'use strict';

const Sheet = (() => {
  /** A4, and the margins that leave a 194 mm content column. */
  const PAGE_HEIGHT = 297;
  const MARGIN_TOP = 9;
  const MARGIN_BOTTOM = 5;
  const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

  /** The gap every page keeps between its last content and the footer. */
  const FOOTER_CLEARANCE = 10;

  /* The key is a convenience, and the page furniture is repeated on every
     sheet, so it must never grow to the point where there is no sheet left to
     put anything on. 24 mm is enough to spell out a dozen bakeries over two
     lines, which is the most a real route draws from; past that the key gives
     up the names, then the codes, rather than the page. */
  const LEGEND_MAX_HEIGHT = 24;

  /* Below this there is no honest way to lay a route out: a stop block alone
     is taller. Reaching it means the furniture has eaten the page, and the
     answer is a short sheet rather than hundreds of near-empty ones. */
  const MIN_BODY_HEIGHT = 40;

  /** Crate glyph geometry, for working out whether a run will fit. */
  const CRATE_WIDTH = 7.1;
  const CRATE_GAP = 1.1;
  const TOTAL_DOT = 2.7;
  const TOTAL_DOT_GAP = 0.8;
  const TOTAL_DOT_COLUMN = 18;

  // ── Building blocks ────────────────────────────────────────────────────

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent, ...children) {
    for (const child of children) if (child) parent.appendChild(child);
    return parent;
  }

  // ── Measuring ──────────────────────────────────────────────────────────

  /**
   * A hidden column exactly as wide as the sheet's, where pieces are laid out
   * so they can be measured before anyone knows which page they land on.
   *
   * It carries the `.bf-sheet` class too, because that is where the fonts and
   * the ink variables are declared — measuring outside it would measure a
   * different typeface and every height would be a lie.
   */
  function measuringHost(parent) {
    const host = element('div', 'bf-sheet bf-measure');
    host.style.height = 'auto';
    host.style.padding = '0';
    host.style.display = 'block';
    (parent || document.body).appendChild(host);

    // One probe settles the pixel-to-millimetre ratio for the whole run.
    const probe = element('div');
    probe.style.width = '100mm';
    probe.style.height = '100mm';
    host.appendChild(probe);
    const box = probe.getBoundingClientRect();
    const perPx = box.width > 0 ? 100 / box.width : 0;
    host.removeChild(probe);

    return {
      node: host,
      /**
       * How tall a piece is, once laid out at the column's real width —
       * margins included.
       *
       * `getBoundingClientRect` measures the border box and stops there, so a
       * piece that carries a margin costs the page more than it measured. The
       * route total's 5 mm rule above it is exactly that, and a page that
       * ended on one came out 5 mm tighter than the paginator believed —
       * eating the clearance that exists so a printer with slightly different
       * metrics does not clip the last row.
       */
      height(node) {
        host.appendChild(node);
        const style = getComputedStyle(node);
        const margins = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        const height = (node.getBoundingClientRect().height + margins) * perPx;
        host.removeChild(node);
        return height;
      },
      /** Whether a nowrap row has more in it than it has room for. */
      overflows(node) {
        host.appendChild(node);
        const over = node.scrollWidth > node.clientWidth + 1;
        host.removeChild(node);
        return over;
      },
      destroy() {
        if (host.parentNode) host.parentNode.removeChild(host);
      },
    };
  }

  // ── The crate glyphs (D17, D20, D24) ──────────────────────────────────

  function crateGlyph(full) {
    return element('span', `bf-crate ${full ? 'bf-crate-full' : 'bf-crate-half'}`);
  }

  /** A run of glyphs, full ones first. */
  function crateRun(count) {
    const run = element('span', 'bf-crates');
    for (let index = 0; index < count.large; index += 1) run.appendChild(crateGlyph(true));
    for (let index = 0; index < count.small; index += 1) run.appendChild(crateGlyph(false));
    return run;
  }

  /**
   * The compact form of a count too wide to draw glyph by glyph: `×24` beside
   * one full crate, then `×1` beside one half — the notation the route total
   * already uses when its tray dots outgrow their column (D24).
   *
   * The trade is knowing: the driver reads a number where the run let them
   * count squares. It only appears when the alternative was rows of wrapped
   * glyphs, which were no easier to take in at a glance.
   */
  function crateCompact(count) {
    const run = element('span', 'bf-crates bf-crates-compact');
    for (const [part, full] of [
      [count.large, true],
      [count.small, false],
    ]) {
      if (part === 0) continue;
      const group = element('span', 'bf-crate-group');
      append(group, element('span', 'bf-crate-count', `×${part}`), crateGlyph(full));
      run.appendChild(group);
    }
    return run;
  }

  function crateRunWidth(total) {
    return total === 0 ? 0 : total * (CRATE_WIDTH + CRATE_GAP) - CRATE_GAP;
  }

  // ── The substitute marker (D8, D21) ───────────────────────────────────

  /**
   * Quiet when substitutes are fine, loud when they are not. The words print
   * in Archivo ExtraBold caps under every treatment; the badge and the bar
   * down the block are the non-default extras.
   */
  function marker(stop, settings) {
    if (stop.acceptAlternatives) {
      return element('span', 'bf-marker', 'want substitute: true');
    }
    const badge = settings.marker === 'inverted-badge';
    return element(
      'span',
      `bf-marker-loud${badge ? ' bf-marker-badge' : ''}`,
      'WANT SUBSTITUTE: FALSE',
    );
  }

  /**
   * The marker and the order id, set as one thing: the id is only ever a way
   * of telling two otherwise identical stops apart, so it belongs beside the
   * mark rather than adrift on its own line.
   */
  function stamp(stop, settings) {
    const group = element('span', 'bf-stamp');
    group.appendChild(marker(stop, settings));
    if (settings.showOrderId) {
      group.appendChild(element('span', 'bf-order-id', stop.id));
    }
    return group;
  }

  /** The crate label: a `DPT` tag and the department name in a hard box. */
  function departmentBox(department) {
    const box = element('div', 'bf-dpt');
    append(
      box,
      element('span', 'bf-dpt-tag', 'DPT'),
      element('span', 'bf-dpt-name', department),
    );
    return box;
  }

  // ── A stop block ───────────────────────────────────────────────────────

  /**
   * The heading, placed the way the Rust layout places it.
   *
   * Nothing here is positioned by assuming it will fit. The name can be
   * 127 mm of a 194 mm column, the order id ten digits, and the crate count is
   * unbounded because the per-bread sizes are the warehouse's to set. So each
   * mark is offered the name's line, then the department's, then a line of its
   * own, and takes the first that measures. The marker and the id travel
   * together; the crates may travel without them.
   */
  function heading(stop, settings, count, measure) {
    const nameLine = append(
      element('div', 'bf-head-line'),
      element('div', 'bf-name', stop.customer),
    );
    const departmentLine = stop.department
      ? append(element('div', 'bf-head-line'), departmentBox(stop.department))
      : null;
    const lines = departmentLine ? [nameLine, departmentLine] : [nameLine];

    const total = count.large + count.small;
    let cratesWanted = total > 0;
    let stampWanted = true;

    /**
     * Puts a mark on a line and keeps it only if the line still fits.
     *
     * The line is measured detached, which is why it can be handed straight to
     * the measuring column and taken back again.
     */
    const place = (line, node, before) => {
      line.insertBefore(node, before || null);
      if (!measure.overflows(line)) return true;
      line.removeChild(node);
      return false;
    };

    /** Full glyphs first, then the compact form (D24), then give up here. */
    const placeCrates = (line) => {
      const before = line.querySelector('.bf-stamp');
      if (crateRunWidth(total) <= 194 && place(line, crateRun(count), before)) return true;
      return place(line, crateCompact(count), before);
    };

    for (const line of lines) {
      if (stampWanted && place(line, stamp(stop, settings))) stampWanted = false;
      // The crates sit immediately left of the marker (D20), so they only go
      // on a line whose stamp is already settled.
      if (cratesWanted && !stampWanted && placeCrates(line)) cratesWanted = false;
      if (!stampWanted && !cratesWanted) break;
    }

    // A line of their own, for whatever is left over.
    if (stampWanted || cratesWanted) {
      const spare = element('div', 'bf-head-line');
      if (stampWanted) spare.appendChild(stamp(stop, settings));
      if (cratesWanted) placeCrates(spare);
      lines.push(spare);
    }

    return lines;
  }

  function tickBox(letter) {
    return element('span', 'bf-tick', letter);
  }

  /**
   * One product line, with every second one tinted.
   *
   * The bread list writes a pick line: `P` box, quantity, code, name, then the
   * missing and fixed boxes at the right. The freezer list writes a check line
   * (F8): a *checked* box on the left, a dotted field for a note in the slack
   * after the name, and only the *missing* box on the right.
   */
  function breadLine(line, settings, tinted) {
    const bread = settings.kind === Model.BREAD;
    const row = element(
      'div',
      `bf-row${bread ? '' : ' bf-row-check'}${tinted ? ' bf-row-zebra' : ''}`,
    );

    append(
      row,
      tickBox(bread ? 'P' : 'C'),
      element('span', 'bf-qty', line.quantity),
      element('span', 'bf-code', Model.supplierCode(line.product.supplier)),
      element('span', 'bf-product', line.product.name),
    );

    if (bread) {
      const boxes = element('span', 'bf-ticks');
      append(boxes, tickBox('M'), tickBox('F'));
      row.appendChild(boxes);
    } else {
      // A leader of full stops, clipped to whatever room the name left. A name
      // long enough to leave none simply has no field — nothing wraps.
      row.appendChild(element('span', 'bf-note-field', '.'.repeat(120)));
      row.appendChild(tickBox('M'));
    }
    return row;
  }

  /**
   * The same block again, carrying only some of its lines — the last resort
   * for a stop that cannot fit a page whole.
   *
   * The heading is repeated so the continuation is still addressed to a
   * customer, and marked, so nobody reads it as a second delivery to the same
   * place. D16's "one order, one block" is kept wherever it can be: this only
   * ever runs when the alternative is ink off the edge of the paper.
   */
  function stopSlice(stop, lines, settings, measure, part, parts) {
    const slice = { ...stop, lines };
    const block = stopBlock(slice, settings, measure);
    if (parts > 1) {
      const tag = element('span', 'bf-block-part', `part ${part} of ${parts}`);
      const first = block.querySelector('.bf-head-line');
      if (first) first.appendChild(tag);
      else block.insertBefore(tag, block.firstChild);
    }
    return block;
  }

  /**
   * A stop's block, split across as few pages as it takes.
   *
   * Measured after the fact rather than predicted: the heading's own height
   * depends on how many lines its marks needed, so the only honest way to
   * know how many product lines fit is to build a slice and measure it. The
   * search halves the slice until one fits, then keeps going from there.
   *
   * Returns one piece when the block fits, which is every real stop in both
   * sample exports — this costs nothing until a file needs it.
   */
  function stopPieces(stop, settings, measure, limit) {
    const whole = stopBlock(stop, settings, measure);
    const height = measure.height(whole);
    if (height <= limit || stop.lines.length < 2) {
      return [{ node: whole, height, keepWithNext: false, over: height > limit }];
    }

    // How many lines fit, found once and reused: every slice carries the same
    // heading, so the answer does not change between them.
    let fits = stop.lines.length;
    while (fits > 1) {
      const trial = stopSlice(stop, stop.lines.slice(0, fits), settings, measure, 1, 2);
      if (measure.height(trial) <= limit) break;
      fits = Math.floor(fits / 2);
    }
    for (let more = fits + 1; more <= stop.lines.length; more += 1) {
      const trial = stopSlice(stop, stop.lines.slice(0, more), settings, measure, 1, 2);
      if (measure.height(trial) > limit) break;
      fits = more;
    }

    const parts = Math.ceil(stop.lines.length / fits);
    const pieces = [];
    for (let index = 0; index < parts; index += 1) {
      const node = stopSlice(
        stop,
        stop.lines.slice(index * fits, (index + 1) * fits),
        settings,
        measure,
        index + 1,
        parts,
      );
      pieces.push({ node, height: measure.height(node), keepWithNext: false });
    }
    return pieces;
  }

  /** One order — one stop, one block, one crate label (D16). */
  function stopBlock(stop, settings, measure) {
    const barred = !stop.acceptAlternatives && settings.marker !== 'word-only';
    const block = element('article', `bf-block${barred ? ' bf-block-barred' : ''}`);

    const count =
      settings.kind === Model.BREAD
        ? Model.crateCount(stop, settings.crates)
        : { large: 0, small: 0 };

    for (const line of heading(stop, settings, count, measure)) block.appendChild(line);

    const lines = element('div', 'bf-lines');
    stop.lines.forEach((line, index) => {
      lines.appendChild(breadLine(line, settings, index % 2 === 1));
    });
    block.appendChild(lines);
    return block;
  }

  /**
   * The separator that says the stops below it were never given a position.
   *
   * The design pass dropped this; print-spec §6 puts it back, because without
   * it a driver cannot tell "nobody sequenced this" from "this is the last
   * delivery of the day", and route 5 has five such stops in a row.
   */
  function unsequencedFlag() {
    return element('div', 'bf-flag', 'No position assigned — driver decides the order');
  }

  // ── The route total (D15, D23, F9) ────────────────────────────────────

  /** One dot per full ten, or the compact count when they outgrow 18 mm. */
  function tenDots(fullTens) {
    const dots = element('span', 'bf-total-dots');
    if (fullTens === 0) return dots;

    const run = fullTens * TOTAL_DOT + (fullTens - 1) * TOTAL_DOT_GAP;
    if (run > TOTAL_DOT_COLUMN) {
      append(
        dots,
        element('span', 'bf-total-dots-compact', `×${fullTens}`),
        element('span', 'bf-dot'),
      );
      return dots;
    }
    for (let index = 0; index < fullTens; index += 1) dots.appendChild(element('span', 'bf-dot'));
    return dots;
  }

  function totalRow(line, withDots) {
    const row = element('div', 'bf-total-row');
    append(
      row,
      element('span', 'bf-total-qty', line.units),
      element('span', 'bf-total-product', line.product.name),
      withDots ? tenDots(line.fullTens) : null,
    );
    return row;
  }

  /**
   * The bread route's closing total: one column per bakery, Sandnes Bakeri
   * first, most needed to least.
   */
  /**
   * The same total, carrying only the lines from `from` up to `to` counted
   * across its columns. A column with nothing left in the slice is dropped
   * rather than printed empty.
   */
  function totalSlice(total, from, to) {
    const columns = [];
    let at = 0;
    for (const column of total.columns) {
      const start = Math.max(from - at, 0);
      const end = Math.min(to - at, column.lines.length);
      if (end > start) {
        columns.push({ supplier: column.supplier, lines: column.lines.slice(start, end) });
      }
      at += column.lines.length;
    }
    return { columns };
  }

  /**
   * How many bakery columns go on a row.
   *
   * The page was drawn for two, and two is still what two bakeries get: half
   * the measure each. Beyond that the rule is never more than three to a row,
   * and the rows balanced — so four prints as two and two rather than three
   * and a lone one stretched across the whole page, and five prints as three
   * and two at the same width rather than three narrow and two wide.
   *
   * One bakery keeps two columns' worth of measure, because a single column
   * set across 194 mm is a paragraph, not a list.
   */
  function columnsPerRow(count) {
    if (count <= 1) return 2;
    return Math.ceil(count / Math.ceil(count / 3));
  }

  /** `Route 8 total`, or `Route 8 total · part 2 of 3`. */
  function totalTitle(route, part, parts) {
    const title = element('div', 'bf-total-title', `Route ${route.nickname} total`);
    if (parts > 1) {
      title.appendChild(element('span', 'bf-block-part', `part ${part} of ${parts}`));
    }
    return title;
  }

  function routeTotalBlock(route, slice, part = 1, parts = 1) {
    const full = Model.routeTotal(route);
    const total = slice || full;
    // The headline figures are the route's, not the slice's: a total split
    // across two sheets is still one total, and half a count would be a lie.
    const types = Model.totalTypes(full);
    const units = Model.totalUnits(full);
    const tens = Model.totalFullTens(total);

    const section = element('section', 'bf-total');
    append(
      section,
      totalTitle(route, part, parts),
      element(
        'div',
        'bf-total-meta',
        `${types} bread ${types === 1 ? 'type' : 'types'} · ` +
          `${units} ${units === 1 ? 'unit' : 'units'} · most to least`,
      ),
    );

    if (tens > 0) {
      const note = element('div', 'bf-total-dotnote');
      append(
        note,
        element('span', 'bf-dot'),
        element(
          'span',
          null,
          `one full ten inside a single order — ${tens} on this route`,
        ),
      );
      section.appendChild(note);
    }

    const grid = element('div', 'bf-total-grid');
    grid.style.setProperty('--cols', columnsPerRow(total.columns.length));
    for (const column of total.columns) {
      const holder = element('div', 'bf-total-col');
      const head = element('div', 'bf-total-head');
      append(
        head,
        element('span', 'bf-total-code', Model.supplierCode(column.supplier)),
        element('span', 'bf-total-name', Model.supplierName(column.supplier)),
        element(
          'span',
          'bf-total-subtotal',
          Model.summary(column.lines.length, Model.columnUnits(column)),
        ),
      );
      holder.appendChild(head);
      for (const line of column.lines) holder.appendChild(totalRow(line, true));
      grid.appendChild(holder);
    }
    section.appendChild(grid);
    return section;
  }

  /**
   * The freezer route's closing total (F9): one list in two balanced columns,
   * read down the first then down the second. No bakery columns, no ten-dots
   * and no supplier code — those are receiving-check machinery, and the cue
   * already lives on the stop lines.
   */
  function checkTotalBlock(route, slice, part = 1, parts = 1) {
    const full = Model.flatTotal(route);
    const lines = slice || full;
    const units = full.reduce((sum, line) => sum + line.units, 0);

    const section = element('section', 'bf-total');
    append(
      section,
      totalTitle(route, part, parts),
      element(
        'div',
        'bf-total-meta',
        `${Model.summary(full.length, units)} · most to least`,
      ),
    );

    const half = Math.ceil(lines.length / 2);
    const grid = element('div', 'bf-total-grid');
    grid.style.setProperty('--cols', 2);
    for (const part of [lines.slice(0, half), lines.slice(half)]) {
      const holder = element('div', 'bf-total-col');
      for (const line of part) holder.appendChild(totalRow(line, false));
      grid.appendChild(holder);
    }
    section.appendChild(grid);
    return section;
  }

  /**
   * The route total, split across as many blocks as it takes.
   *
   * A route with more distinct breads than a sheet has room for used to print
   * the ones that fit and send the rest off the bottom of the paper — the same
   * failure as an over-long stop, in the one block that is supposed to be the
   * receiving check for the whole route.
   */
  function totalPieces(route, settings, measure, limit) {
    const bread = settings.kind === Model.BREAD;
    const full = bread ? Model.routeTotal(route) : Model.flatTotal(route);
    const count = bread ? Model.totalTypes(full) : full.length;
    const cut = (from, to, part, parts) =>
      bread
        ? routeTotalBlock(route, totalSlice(full, from, to), part, parts)
        : checkTotalBlock(route, full.slice(from, to), part, parts);

    const whole = bread ? routeTotalBlock(route) : checkTotalBlock(route);
    const height = measure.height(whole);
    if (height <= limit || count < 2) {
      return [{ node: whole, height, keepWithNext: false, over: height > limit }];
    }

    let fits = count;
    while (fits > 1) {
      if (measure.height(cut(0, fits, 1, 2)) <= limit) break;
      fits = Math.floor(fits / 2);
    }
    for (let more = fits + 1; more <= count; more += 1) {
      if (measure.height(cut(0, more, 1, 2)) > limit) break;
      fits = more;
    }

    const parts = Math.ceil(count / fits);
    const pieces = [];
    for (let index = 0; index < parts; index += 1) {
      const node = cut(index * fits, (index + 1) * fits, index + 1, parts);
      pieces.push({ node, height: measure.height(node), keepWithNext: false });
    }
    return pieces;
  }

  // ── Page furniture ─────────────────────────────────────────────────────

  function masthead(route, context, wordmark) {
    const header = element('header', 'bf-masthead');

    const brand = element('div', 'bf-brand');
    const logo = element('div', 'bf-logo');
    const image = element('img');
    image.src = wordmark;
    image.alt = 'Matvare Expressen';
    logo.appendChild(image);
    append(
      brand,
      logo,
      element('div', 'bf-route-label', 'Route'),
      element('div', 'bf-route-number', route.nickname),
      context.page > 1 ? element('div', 'bf-continued', 'continued') : null,
    );

    const right = element('div', 'bf-masthead-right');
    append(
      right,
      element('div', 'bf-date', Model.formatDates(context.dates)),
      element(
        'div',
        'bf-counter',
        `Page ${context.page} of ${context.pages} · ` +
          `${context.routeStops} stops · ${context.routeLines} lines`,
      ),
    );

    return append(header, brand, right);
  }

  /**
   * One sentence of context on the left, the substitute convention on the
   * right.
   *
   * The pallet call is made once for the whole route, so it lives here on
   * every sheet rather than in the total that closes it (D25) — and the line
   * is measured before it grows, which is the lesson D23 paid for. A line
   * already crowded by a long nickname and the unsequenced note gets the short
   * form instead of colliding.
   */
  function pageNote(route, settings, measure) {
    const bread = settings.kind === Model.BREAD;
    const note = element('div', 'bf-note');
    const left = element('div');
    const right = element('div');
    right.innerHTML = '<em>want substitute: true</em> unless marked FALSE';
    append(note, left, right);

    const unsequenced = Model.unsequencedStops(route).length;
    const what = bread ? 'in full' : 'check list';
    const sentence =
      unsequenced === 0
        ? `Route ${route.nickname} ${what} — ${route.stops.length} stops.`
        : `Route ${route.nickname} ${what} — ${route.stops.length} stops, ` +
          `${unsequenced} with no position assigned.`;
    left.textContent = sentence;

    if (bread) {
      const crates = Model.routeCrates(route, settings.crates);
      if (crates > Model.PALLET_THRESHOLD) {
        for (const suffix of [`${crates} crates — take a pallet.`, 'Take a pallet.']) {
          left.textContent = `${sentence} ${suffix}`;
          if (!measure.overflows(note)) break;
          left.textContent = sentence;
        }
      }
    }
    return note;
  }

  /**
   * The tinted band explaining the boxes, the crate glyphs and the supplier
   * codes.
   *
   * The two lists differ in three ways: the freezer sheet has no crates to
   * explain (F4), its `P` means *packed* rather than *picked*, and its
   * suppliers are whichever wholesalers this route actually draws from rather
   * than the two house bakeries.
   */
  function legend(route, settings, measure) {
    const bread = settings.kind === Model.BREAD;
    const band = element('div', 'bf-legend');

    const boxes = bread
      ? [
          ['P', 'Picked'],
          ['M', 'Missing'],
          ['F', 'Fixed'],
        ]
      : [
          ['C', 'Checked'],
          ['M', 'Missing'],
        ];

    const boxGroup = element('div', 'bf-legend-group');
    boxGroup.appendChild(element('span', 'bf-legend-tag', 'Boxes'));
    for (const [letter, word] of boxes) {
      boxGroup.appendChild(tickBox(letter));
      const label = element('span', 'bf-legend-word');
      label.innerHTML = `<b>${letter}</b>${word.slice(1)}`;
      boxGroup.appendChild(label);
    }
    band.appendChild(boxGroup);

    if (bread) {
      const crateGroup = element('div', 'bf-legend-group');
      crateGroup.appendChild(element('span', 'bf-legend-tag', 'Crates'));
      for (const [full, count] of [
        [true, '10'],
        [false, '5'],
      ]) {
        crateGroup.appendChild(crateGlyph(full));
        crateGroup.appendChild(element('span', null, count));
      }
      band.appendChild(crateGroup);
    }

    const suppliers = element('div', 'bf-legend-suppliers');
    band.appendChild(suppliers);

    // Spelled out if it fits, codes alone if not — and if even the codes will
    // not fit three lines, as many as will and a count of the rest.
    //
    // Measured by height as well as width. The band used to be `nowrap`, so
    // too much in it ran off the end and `overflows` caught it; now that it
    // wraps, too much in it grows downwards instead, and an unchecked key on
    // every sheet is furniture that can starve the page it sits on.
    const tooTall = () => measure.height(band) > LEGEND_MAX_HEIGHT;
    suppliers.innerHTML = supplierKey(route, settings, true);
    if (measure.overflows(band) || tooTall()) {
      suppliers.innerHTML = supplierKey(route, settings, false);
    }
    if (tooTall()) {
      const all = supplierKey(route, settings, false).split(' · ');
      let keep = all.length;
      while (keep > 1) {
        keep = Math.floor(keep / 2);
        suppliers.innerHTML = `${all.slice(0, keep).join(' · ')} · +${all.length - keep} more`;
        if (!tooTall()) break;
      }
    }
    return band;
  }

  /**
   * Which suppliers the band spells out.
   *
   * The two house bakeries are always named on a bread sheet, present on the
   * route or not, so the key reads the same on every sheet of the day. But the
   * codes on the lines come from the file, not from that list: a bakery nobody
   * has configured used to print `WC` against its breads with nothing on the
   * page saying what `WC` was. Whatever the route actually draws from joins
   * the key, in the same order the route total puts its columns.
   */
  function supplierKey(route, settings, spelled) {
    const used = Array.from(
      new Set(
        route.stops.flatMap((stop) => stop.lines).map((line) => line.product.supplier),
      ),
    );
    const house = settings.kind === Model.BREAD ? Model.KNOWN_SUPPLIERS.map(([name]) => name) : [];
    const seen = new Set();
    const list = [...house, ...used]
      .filter((name) => {
        const key = String(name).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) =>
        Model.compare(Model.supplierPosition(left), Model.supplierPosition(right)),
      );

    return list
      .map((name) => {
        const code = `<b>${Model.supplierCode(name)}</b>`;
        return spelled ? `${code} ${Model.supplierName(name)}` : code;
      })
      .join(' · ');
  }

  function footer(route, context) {
    const bar = element('footer', 'bf-footer');
    const state =
      context.page < context.pages
        ? `Route ${route.nickname} continues on page ${context.page + 1}`
        : `Route ${route.nickname} — end of route`;
    append(
      bar,
      element('div', null, state),
      element('div', null, `${context.source} · Matvare Expressen`),
    );
    return bar;
  }

  // ── Sharing the pieces out between sheets ─────────────────────────────

  /**
   * Decides which pieces go on which page.
   *
   * A piece never splits, and a piece marked `keepWithNext` never ends a page
   * — the unsequenced flag belongs above the stops it covers. When the last
   * page would carry nothing but the route total, the stop above it comes down
   * too rather than leave a sheet nearly empty.
   */
  function shareOut(pieces, limit) {
    const pages = [[]];
    let used = 0;

    pieces.forEach((piece, index) => {
      const follower =
        piece.keepWithNext && pieces[index + 1] ? pieces[index + 1].height : 0;
      const fits = used + piece.height + follower <= limit;

      if (!fits && pages[pages.length - 1].length > 0) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(index);
      used += piece.height;
    });

    rebalance(pieces, pages, limit);
    return pages;
  }

  /** Pulls the previous stop down onto a final page that carries only the total. */
  function rebalance(pieces, pages, limit) {
    if (pages.length < 2) return;
    const last = pages[pages.length - 1];
    if (last.length !== 1) return;

    const previous = pages[pages.length - 2];
    if (previous.length < 2) return;
    const moved = previous[previous.length - 1];
    if (pieces[moved].keepWithNext) return;

    // Moving this one down must not leave a separator as the last thing on
    // the page it came from.
    const leftBehind = previous[previous.length - 2];
    if (pieces[leftBehind].keepWithNext) return;

    if (pieces[moved].height + pieces[last[0]].height > limit) return;
    previous.pop();
    last.unshift(moved);
  }

  // ── Laying a route out ─────────────────────────────────────────────────

  /**
   * Every sheet one route needs, as detached elements.
   *
   * `options.wordmark` is the path to the Matvare Expressen mark, and
   * `options.host` an element to measure inside (the measuring column is
   * removed again before this returns).
   */
  function paginate(route, settings, context, options) {
    const wordmark = (options && options.wordmark) || 'assets/matvare-expressen.svg';
    const measure = measuringHost(options && options.host);

    try {
      // Every piece the route puts on paper, in order: its stops, the flag
      // above the unsequenced ones, and the total that closes it.
      // How much of the sheet the furniture leaves for them.
      //
      // Budgeted against the *tallest* masthead, not page 1's. Page 1 has no
      // `continued` line, so it is the shortest; spending its extra room used
      // to be free, on the reasoning that a taller page 2 only eats its own
      // 10 mm of clearance. It does — and a route long enough to need
      // thirteen sheets ate it down to 8.8 mm, under the floor print-spec sets
      // and the floor this app's own suite asserts. A page costs less than a
      // clipped row.
      const probe = { ...context, page: 1, pages: 1 };
      const tallest = { ...context, page: 2, pages: 2 };
      const furnitureHeight = Math.max(
        ...[probe, tallest].map((where) =>
          [
            masthead(route, where, wordmark),
            pageNote(route, settings, measure),
            legend(route, settings, measure),
          ].reduce((sum, node) => sum + measure.height(node), 0),
        ),
      );
      const footerHeight = Math.max(
        measure.height(footer(route, probe)),
        measure.height(footer(route, tallest)),
      );
      const bodyMargin = 1.5;
      // Floored, because furniture that has eaten the page must not turn into
      // one sheet per piece: 250 bakeries on a route produced 500 near-empty
      // pages, each still spilling, and said nothing about it. A floor makes
      // the last sheet overfull instead — visibly wrong on one page rather
      // than invisibly wrong across hundreds.
      const limit = Math.max(
        CONTENT_HEIGHT - furnitureHeight - footerHeight - bodyMargin - FOOTER_CLEARANCE,
        MIN_BODY_HEIGHT,
      );

      // Every piece the route puts on paper, in order: its stops, the flag
      // above the unsequenced ones, and the total that closes it. The limit is
      // worked out first because a stop with more lines than a page can hold
      // has to be cut against it — 300 lines on one order used to print 45 and
      // send the other 255 off the bottom of the paper without a word.
      const pieces = [];
      let flagged = false;
      for (const stop of route.stops) {
        if (!Model.isSequenced(stop) && !flagged) {
          flagged = true;
          const flag = unsequencedFlag();
          pieces.push({ node: flag, height: measure.height(flag), keepWithNext: true });
        }
        pieces.push(...stopPieces(stop, settings, measure, limit));
      }
      pieces.push(...totalPieces(route, settings, measure, limit));

      const pages = shareOut(pieces, limit);
      return pages.map((indices, index) => {
        const sheetContext = { ...context, page: index + 1, pages: pages.length };
        const sheet = element('section', 'bf-sheet');
        sheet.dataset.route = route.nickname;
        sheet.dataset.page = String(index + 1);
        sheet.dataset.of = String(pages.length);

        const body = element('div', 'bf-body');
        for (const piece of indices) body.appendChild(pieces[piece].node);

        append(
          sheet,
          masthead(route, sheetContext, wordmark),
          pageNote(route, settings, measure),
          legend(route, settings, measure),
          body,
          footer(route, sheetContext),
        );
        return sheet;
      });
    } finally {
      measure.destroy();
    }
  }

  /**
   * Every sheet a day's routes need, in printing order. Routes come in the
   * order they are given, each starting a fresh page (D1).
   */
  function day(routes, settings, context, options) {
    return routes.flatMap((route) =>
      paginate(
        route,
        settings,
        {
          ...context,
          routeStops: route.stops.length,
          routeLines: Model.lineCount(route),
        },
        options,
      ),
    );
  }

  return {
    PAGE_HEIGHT,
    CONTENT_HEIGHT,
    FOOTER_CLEARANCE,
    paginate,
    day,
    stopBlock,
    routeTotalBlock,
    checkTotalBlock,
    measuringHost,
  };
})();

if (typeof module !== 'undefined') module.exports = Sheet;
