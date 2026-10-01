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
//
// D9 gives way in one place, a departure of the web port's own: a block
// taller than a page is cut rather than run off the paper — between orders
// first, and inside an order only when that order alone is taller than a
// page (see stopPieces()). The Rust app's blocks are one order each; the
// port's can be a customer's several orders at one stop.

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

  /**
   * A bread marked "pay attention" on Configure (the owner, 2026-10-01): one
   * the pickers often get wrong — a name close to another's, say. Wherever
   * its name prints, on the pick line, the check line and the route total, it
   * carries a warning triangle and is set in bold. The triangle is drawn, not
   * a character, so no printer falls back to a face without it. The ids come
   * from the settings each route is laid out with (paginate).
   */
  let marked = new Set();
  const SVG = 'http://www.w3.org/2000/svg';
  function attentionMark() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'bf-attn-mark');
    svg.setAttribute('viewBox', '0 0 20 18');
    svg.setAttribute('aria-label', 'Pay attention');
    svg.setAttribute('role', 'img');
    const sign = document.createElementNS(SVG, 'path');
    sign.setAttribute('d', 'M10 0.6 19.6 17.4H0.4Z');
    sign.setAttribute('fill', 'currentColor');
    const bang = document.createElementNS(SVG, 'path');
    bang.setAttribute('d', 'M8.9 5.6h2.2l-0.4 6.6h-1.4ZM8.8 13.6h2.4v2.2H8.8Z');
    bang.setAttribute('fill', '#fff');
    svg.append(sign, bang);
    return svg;
  }
  function productName(className, product) {
    const span = element('span', className, product.name);
    if (marked.has(product.id)) {
      span.classList.add('bf-attn');
      span.prepend(attentionMark());
    }
    return span;
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
      /**
       * Whether a nowrap row has more in it than it has room for — or, given
       * `outer`, whether `node` inside it does, laid out where it will sit.
       */
      overflows(node, outer = node) {
        host.appendChild(outer);
        const over = node.scrollWidth > node.clientWidth + 1;
        host.removeChild(outer);
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
   * One look for both answers: `want substitute: true` or
   * `want substitute: false`, in the same quiet type, with only the word
   * false in bold.
   *
   * A deliberate departure from D8 and D21, which the Rust app still prints:
   * quiet for true, and loud Archivo capitals for false. The owner asked for
   * one look every time (2026-09-29), and every order states its own value,
   * so nothing relies on the loud form standing out.
   *
   * Anything but a real true or false throws rather than printing. A stop
   * handed in where an order belongs has no answer of its own, and must never
   * come out as "false".
   */
  function marker(order) {
    const answer = order.acceptAlternatives;
    if (answer === true) return element('span', 'bf-marker', 'want substitute: true');
    if (answer === false) {
      const node = element('span', 'bf-marker', 'want substitute: ');
      node.appendChild(element('b', null, 'false'));
      return node;
    }
    throw new Error(
      `an order's substitute answer reads "${String(answer)}", which is neither true nor false`,
    );
  }

  /** An order id, or a throw: a stop has no id of its own to print. */
  function orderId(order) {
    if (!Number.isFinite(order.id)) {
      throw new Error(`an order id reads "${String(order.id)}", which is not a number`);
    }
    return element('span', 'bf-order-id', order.id);
  }

  /**
   * The marker and the order id, set as one thing at the right of a one-order
   * block's heading: the id is only ever a way of telling two otherwise
   * identical stops apart, so it belongs beside the mark rather than adrift
   * on its own line. "Show the order ID" decides whether it prints.
   *
   * A block of several orders has no stamp in its heading, a departure from
   * D20's one column per block: each order carries its marker on its first
   * line and its id on every line, whatever the setting (see orderRows()).
   */
  function stamp(order, settings) {
    const group = element('span', 'bf-stamp');
    group.appendChild(marker(order));
    if (settings.showOrderId) group.appendChild(orderId(order));
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
   * Puts a mark on a line and keeps it only if the line still fits.
   *
   * The line is measured detached, which is why it can be handed straight to
   * the measuring column and taken back again.
   */
  function place(line, node, before, measure) {
    line.insertBefore(node, before || null);
    if (!measure.overflows(line)) return true;
    line.removeChild(node);
    return false;
  }

  /**
   * An order's crates on a line, left of `before`: full glyphs first, then
   * the compact form (D24). False when neither fits, and the line is as it
   * was.
   */
  function placeCrates(line, count, before, measure) {
    const total = count.large + count.small;
    if (crateRunWidth(total) <= 194 && place(line, crateRun(count), before, measure)) {
      return true;
    }
    return place(line, crateCompact(count), before, measure);
  }

  /** The customer's name, on the line every heading starts with. */
  function nameLine(customer) {
    return append(element('div', 'bf-head-line'), element('div', 'bf-name', customer));
  }

  /**
   * A heading's lines before any marks: the name, with a cut block's
   * `part N of M` beside it where that fits and on a line of its own where it
   * does not, then the boxed department when there is one.
   *
   * The tag goes in first and is measured, because a long name can leave it
   * no room — added afterwards, it used to be set past whatever the marks had
   * already been measured into.
   */
  function headLines(customer, department, tag, measure) {
    const lines = [nameLine(customer)];
    if (tag && !place(lines[0], element('span', 'bf-block-part', tag), null, measure)) {
      lines.push(append(element('div', 'bf-head-line'), element('span', 'bf-block-part', tag)));
    }
    if (department) {
      lines.push(append(element('div', 'bf-head-line'), departmentBox(department)));
    }
    return lines;
  }

  /**
   * The heading of a one-order block, placed the way the Rust layout places
   * it.
   *
   * Nothing here is positioned by assuming it will fit. The name can be
   * 127 mm of a 194 mm column, the order id ten digits, and the crate count is
   * unbounded because the per-bread sizes are the warehouse's to set. So each
   * mark is offered the name's line, then the department's, then a line of its
   * own, and takes the first that measures. The marker and the id travel
   * together; the crates may travel without them.
   *
   * A block of several orders carries only crates in its heading lines — one
   * count per department group — and each order's marker on the order's own
   * first line (see sharedBlock() and orderRows()).
   */
  function heading(order, settings, count, measure, tag) {
    const lines = headLines(order.customer, order.department, tag, measure);

    const total = count.large + count.small;
    let cratesWanted = total > 0;
    let stampWanted = true;

    for (const line of lines) {
      if (stampWanted && place(line, stamp(order, settings), null, measure)) stampWanted = false;
      // The crates sit immediately left of the marker (D20), so they only go
      // on a line whose stamp is already settled.
      if (
        cratesWanted &&
        !stampWanted &&
        placeCrates(line, count, line.querySelector('.bf-stamp'), measure)
      ) {
        cratesWanted = false;
      }
      if (!stampWanted && !cratesWanted) break;
    }

    // A line of their own, for whatever is left over.
    if (stampWanted || cratesWanted) {
      const spare = element('div', 'bf-head-line');
      if (stampWanted) spare.appendChild(stamp(order, settings));
      if (cratesWanted) placeCrates(spare, count, spare.querySelector('.bf-stamp'), measure);
      lines.push(spare);
    }

    return lines;
  }

  function tickBox(letter) {
    return element('span', 'bf-tick', letter);
  }

  /**
   * The order line each printed row draws, so coverage() can say which of a
   * route's lines made it onto the paper. Kept off the page, so the sheets
   * print exactly as they did.
   */
  const drawing = new WeakMap();

  /**
   * One product line, with every second one tinted.
   *
   * The bread list writes a pick line: `P` box, quantity, code, name, then the
   * missing and fixed boxes at the right. The freezer list writes a check line
   * (F8): a *checked* box on the left — and beside it a *delivered* box, which
   * F8 does not have (the owner, 2026-09-30) — a dotted field for a note in
   * the slack after the name, and only the *missing* box on the right.
   *
   * The bread line has the dotted field too, a departure from F8, which gives
   * it to the check line alone (the owner, 2026-09-30: "a neat place to write
   * if something should be written"). It shares one cell with the name, in
   * the place the name alone used to have, and takes only what the name
   * leaves: the name is set exactly where and how it was — it still wraps
   * where it wrapped — and a name that fills its room leaves no field at all.
   */
  function breadLine(line, settings, tinted) {
    const bread = settings.kind === Model.BREAD;
    const row = element(
      'div',
      `bf-row${bread ? '' : ' bf-row-check'}${tinted ? ' bf-row-zebra' : ''}`,
    );
    drawing.set(row, line);

    append(
      row,
      tickBox(bread ? 'P' : 'C'),
      // The freezer line's second box, D for delivered, beside C (the owner,
      // 2026-09-30; a departure from F8, which has C alone at the left).
      bread ? null : tickBox('D'),
      // A quantity the file gave as text prints as it says, cut to 20
      // characters (Model.quantityText; the owner, 2026-10-01). A departure
      // from the Rust app, whose quantity is always a number.
      typeof line.quantityText === 'string'
        ? element('span', 'bf-qty bf-qty-text', line.quantityText)
        : element('span', 'bf-qty', line.quantity),
      element('span', 'bf-code', Model.supplierCode(line.product.supplier)),
    );

    if (bread) {
      row.appendChild(
        append(
          element('span', 'bf-product-cell'),
          productName('bf-product', line.product),
          element('span', 'bf-note-field', '.'.repeat(120)),
        ),
      );
      const boxes = element('span', 'bf-ticks');
      append(boxes, tickBox('M'), tickBox('F'));
      row.appendChild(boxes);
    } else {
      row.appendChild(productName('bf-product', line.product));
      // A leader of full stops, clipped to whatever room the name left. A name
      // long enough to leave none simply has no field — nothing wraps (F8).
      // A line of a shared block departs from that: its name wraps when the
      // marker and id beside it would push the line off the paper (orderRows).
      row.appendChild(element('span', 'bf-note-field', '.'.repeat(120)));
      row.appendChild(tickBox('M'));
    }
    return row;
  }

  /**
   * An order's lines in a block of several orders (the owner, 2026-09-29).
   *
   * Every line carries the order's id, small and quiet at its right, because
   * the id is what tells two orders' lines apart — printed whatever "Show the
   * order ID" says. The order's first line also carries its marker, left of
   * the id, so one order's answer is never read as another's. Its crates are
   * not here: a customer-department's orders are packed together, so their
   * one crate count sits on that group's heading line (see sharedBlock()).
   *
   * `segment` is the run of the order's lines this block carries. An order
   * cut across pages opens its next part with a quiet "continued", its marker
   * and its id, so the lines above it on the page before are not taken for
   * all it has.
   *
   * The first line is measured, never assumed to fit, the bread name's own
   * box included: on a check line, whose name does not otherwise wrap, the
   * name wraps first; only then does the marker take a line of its own under
   * it. Any other check line whose name will not fit beside its id wraps the
   * name too.
   */
  function orderRows(order, settings, measure, segment, from = 0) {
    const bread = settings.kind === Model.BREAD;
    const continued = segment.from > 0;
    const cue = () => (continued ? element('span', 'bf-order-cont', 'continued') : null);

    return order.lines.slice(segment.from, segment.to).map((line, index) => {
      const row = breadLine(line, settings, (from + index) % 2 === 1);
      row.classList.add('bf-row-shared');
      const stamp = element('span', 'bf-row-stamp');
      stamp.appendChild(orderId(order));
      // Before the tick boxes at the right-hand end, so the ids stand in one
      // column down the block.
      row.insertBefore(stamp, row.lastElementChild);
      if (index > 0) {
        if (!bread && measure.overflows(row)) row.classList.add('bf-row-wrap');
        return [row];
      }

      const mark = marker(order);
      const lead = cue();
      stamp.insertBefore(mark, stamp.firstChild);
      if (lead) stamp.insertBefore(lead, stamp.firstChild);
      // The line fitting is not enough: the name keeps a 30 mm box, and a
      // word longer than the box spills out of it onto the marker beside it
      // without the line overflowing at all.
      const name = row.querySelector('.bf-product');
      const fits = () => !measure.overflows(row) && !measure.overflows(name, row);
      if (fits()) return [row];
      if (!bread) {
        row.classList.add('bf-row-wrap');
        if (fits()) return [row];
      }

      // A line of their own, under the first, with the id too: a marker on a
      // line of its own must still say whose it is.
      stamp.removeChild(mark);
      if (lead) stamp.removeChild(lead);
      const extra = element(
        'div',
        `bf-head-line bf-order-extra${bread ? '' : ' bf-order-extra-check'}`,
      );
      extra.appendChild(append(element('span', 'bf-stamp'), cue(), marker(order), orderId(order)));
      return [row, extra];
    }).flat();
  }

  /** All of an order's lines: the segment every uncut block carries. */
  function whole(order) {
    return { order, from: 0, to: order.lines.length };
  }

  /**
   * A department inside a block whose orders have different departments: the
   * lines below it are that department's, down to the next.
   *
   * A departure from D19, which boxes the department under the name as half
   * of one crate label. A block of several departments cannot put all of them
   * there, so each divides the block instead, quietly (the owner,
   * 2026-09-29). The orders with no department sort first and sit straight
   * under the name, before any of these.
   */
  function departmentSubHeading(department) {
    const box = departmentBox(department);
    box.classList.add('bf-dpt-quiet');
    return append(element('div', 'bf-head-line bf-dpt-sub'), box);
  }

  /**
   * A heading line with a group's crates at its right-hand end: full glyphs,
   * then the compact form (D24), then a line of their own under it. The
   * crates are never dropped — if even the compact form will not fit there,
   * it prints anyway, and the overflow shows, rather than a group going out
   * with no crate count.
   *
   * Done before the line joins its block: measuring a line lifts it into the
   * measuring column.
   */
  function withCrates(line, count, measure) {
    if (!count || placeCrates(line, count, null, measure)) return [line];
    const spare = element('div', 'bf-head-line');
    if (!placeCrates(spare, count, null, measure)) spare.appendChild(crateCompact(count));
    return [line, spare];
  }

  /**
   * A stop of several orders: one customer at one street and one position in
   * the route, in one block.
   *
   * A departure from D16's "one order, one block", at the owner's request
   * (2026-09-29): the orders share the block, grouped by department and kept
   * apart by order id. The heading is the name, and the boxed department too
   * when every order shares one; otherwise each department is a quiet
   * sub-heading. The zebra restarts under each.
   *
   * Crates are counted per department group — the crate label is the
   * customer and the department, and the warehouse packs a group's bread
   * together whatever orders it came in (the owner, 2026-09-29; D16 counts
   * them per order). Each group's one count sits at the right of its heading
   * line: the name line for the orders with no department, the boxed
   * department's line when every order shares it, or the group's
   * sub-heading. A block cut across pages prints a group's crates once, on
   * the part where its first order starts.
   *
   * `segments` are the runs of the orders' lines this block carries: every
   * order whole, or one part's share of a block cut across pages. A part that
   * starts inside a department opens with that department's sub-heading
   * again, so its lines never read as the department above them, or as none.
   */
  function sharedBlock(stop, segments, settings, measure, tag) {
    const block = element('article', 'bf-block');
    const groups = Model.departmentGroups(stop.orders);
    const shared = groups.length === 1 ? groups[0].department : null;

    /** A group's crates, or null: none on a freezer sheet, none but where it starts. */
    const cratesOf = (group) => {
      if (!group || settings.kind !== Model.BREAD) return null;
      const starts = segments.some((segment) => segment.order === group.orders[0] && segment.from === 0);
      if (!starts) return null;
      const count = Model.packedCrateCount(group.orders, settings.crates);
      return count.large + count.small > 0 ? count : null;
    };

    // The heading's own group: the one department every order shares, boxed
    // on the last heading line; or the orders with no department, on the
    // name line. A block whose orders all have departments of their own
    // keeps its crates on the sub-headings.
    const heads = headLines(stop.customer, shared, tag, measure);
    const headGroup = shared || groups[0].department === null ? groups[0] : null;
    const target = shared ? heads.length - 1 : 0;
    heads.forEach((line, index) => {
      const count = index === target ? cratesOf(headGroup) : null;
      for (const node of withCrates(line, count, measure)) block.appendChild(node);
    });

    let lines = null;
    let department;
    let from = 0;
    for (const segment of segments) {
      if (lines === null || segment.order.department !== department) {
        department = segment.order.department;
        // Lines with no department after a sub-heading would read as that
        // department's. The sort never allows it; this says so if it ever did.
        if (!department && block.querySelector('.bf-dpt-sub')) {
          throw new Error(
            `order ${segment.order.id} has no department but would print under another one`,
          );
        }
        if (department && !shared) {
          const group = groups.find((candidate) => candidate.department === department);
          for (const node of withCrates(departmentSubHeading(department), cratesOf(group), measure)) {
            block.appendChild(node);
          }
        }
        lines = block.appendChild(element('div', 'bf-lines'));
        from = 0;
      }
      for (const node of orderRows(segment.order, settings, measure, segment, from)) {
        lines.appendChild(node);
      }
      from += segment.to - segment.from;
    }
    return block;
  }

  /**
   * One order in a block of its own: the crate label, then the lines
   * `segment` carries.
   *
   * D16 makes every order its own block. The web port keeps that only for a
   * customer with one order at a stop; several share one (see sharedBlock()).
   *
   * A part of an order cut across pages repeats the heading, the marker and
   * the id (when shown), so it is still addressed to a customer, and its
   * `part N of M` says nobody should read it as a second delivery. Its crates
   * print once, on the part where it starts: each part used to count only
   * its own lines, and the parts could add up to more crates than the order
   * packs into.
   */
  function orderBlock(order, settings, measure, segment = whole(order), tag = null) {
    const block = element('article', 'bf-block');

    const count =
      settings.kind === Model.BREAD && segment.from === 0
        ? Model.crateCount(order, settings.crates)
        : { large: 0, small: 0 };

    for (const line of heading(order, settings, count, measure, tag)) block.appendChild(line);

    const lines = element('div', 'bf-lines');
    order.lines.slice(segment.from, segment.to).forEach((line, index) => {
      lines.appendChild(breadLine(line, settings, index % 2 === 1));
    });
    block.appendChild(lines);
    return block;
  }

  /**
   * A stop's block — its one order's, or the block its orders share — or,
   * given `segments`, one part of it.
   */
  function stopBlock(stop, settings, measure, segments = stop.orders.map(whole), tag = null) {
    return stop.orders.length === 1
      ? orderBlock(stop.orders[0], settings, measure, segments[0], tag)
      : sharedBlock(stop, segments, settings, measure, tag);
  }

  /**
   * The most lines, up to `left`, that `fit` accepts — 0 if not even one.
   *
   * Adding a line never makes a part shorter, so one count that fits and one
   * that does not bracket the answer, and halving the gap between them finds
   * it. The bracket is found from `guess` — the take of the part before,
   * which is about what a page of this stop holds — by doubling up until a
   * count fails, or halving down until one fits. Starting from everything
   * still left instead built parts of hundreds of lines for every page of a
   * long order.
   */
  function mostLines(left, fit, guess = left) {
    if (left <= 0) return 0;
    let low = 0; // fits: nothing added
    let high = left + 1; // does not: past the end
    let probe = Math.min(Math.max(guess, 1), left);
    if (fit(probe)) {
      low = probe;
      while (low < left) {
        probe = Math.min(low * 2, left);
        if (!fit(probe)) {
          high = probe;
          break;
        }
        low = probe;
      }
    } else {
      high = probe;
      while (high > 1) {
        probe = Math.floor(high / 2);
        if (fit(probe)) {
          low = probe;
          break;
        }
        high = probe;
      }
    }
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (fit(middle)) low = middle;
      else high = middle;
    }
    return low;
  }

  /**
   * A stop's block, cut across as few pages as it takes. That happens when the
   * alternative is ink off the bottom of the paper — and in one other case,
   * kept on purpose: the first stop under the unsequenced flag must share a
   * page with the flag, so a block that fits a page but not the room beside
   * the flag is cut too (see `first` below).
   *
   * D9 says a stop block never splits. The Rust app can keep that, because
   * its blocks are one order each; the web port's can be a customer's whole
   * morning, so it departs from D9 for a block taller than a page:
   *
   * - whole orders go first: each part takes as many as fit;
   * - only an order taller than a part of its own is cut between its lines,
   *   and its first lines take whatever room is left where it starts;
   * - every part is built exactly as it will print and measured before it is
   *   accepted, because parts differ — only the part a group starts on
   *   carries its crates. Its tag is a stand-in as wide as the stop could
   *   ever need: no stop has more parts than lines, so `part N of N` for N
   *   lines is never outgrown.
   *
   * The parts are then built again with their real tags and measured once
   * more. One that comes out over its page after all is not a reason to
   * print nothing: it and every part after it are cut again, measured with
   * the real tags, until each part fits (see recut()). Only a single line
   * that cannot fit on an empty part throws — there is no cut that helps.
   *
   * Returns one piece when the block fits, which is every real stop in both
   * sample exports — this costs nothing until a file needs it.
   *
   * `first` is the room on the part that opens the stop: less than `limit`
   * right under the unsequenced flag, which must never end a page alone.
   * `standIn` replaces the trial tag; only the test suite sets it, to force
   * a real tag wider than the one the parts were cut against.
   */
  function stopPieces(stop, settings, measure, limit, first = limit, standIn = null) {
    const node = stopBlock(stop, settings, measure);
    const height = measure.height(node);
    const lines = stop.orders.reduce((sum, order) => sum + order.lines.length, 0);
    if (height <= first || lines < 2) {
      return [{ node, height, keepWithNext: false, over: height > limit }];
    }

    const capOf = (at) => (at === 0 ? first : limit);
    const build = (segments, tag) => stopBlock(stop, settings, measure, segments, tag);
    const trialTag = standIn === null ? `part ${lines} of ${lines}` : standIn;
    let parts = cut(stop.orders.map(whole), () => trialTag, 0);

    // Built with their real tags. The part count is known now, so each part
    // can be measured exactly as it will print. A count that moves in a
    // re-cut changes every tag, so every part is measured again; tags only
    // widen as the count grows and narrow as it shrinks, so the count moves
    // one way until it settles, and never past the line count.
    for (let round = 0; round <= lines; round += 1) {
      const count = parts.length;
      const tagOf = (at) => `part ${at + 1} of ${count}`;
      const built = parts.map((segments, at) => {
        const part = build(segments, tagOf(at));
        return { node: part, height: measure.height(part), at };
      });
      const over = built.find((piece) => piece.height > capOf(piece.at));
      if (!over) {
        return built.map((piece) => ({ node: piece.node, height: piece.height, keepWithNext: false }));
      }
      parts = [...parts.slice(0, over.at), ...recut(parts.slice(over.at), tagOf, over.at)];
    }
    throw new Error(`the block for ${stop.customer} could not be cut to fit its pages`);

    /**
     * Cuts `queue` — runs of the stop's lines, in order — into parts from
     * part `start` on, measuring each part with `tagOf(its index)`.
     */
    function cut(queue, tagOf, start) {
      const done = [];
      let current = [];
      let lastTake = lines;
      const at = () => start + done.length;
      const close = () => {
        done.push(current);
        current = [];
      };
      const fits = (segments, index) =>
        measure.height(build(segments, tagOf(index))) <= capOf(index);

      for (const segment of queue) {
        if (fits([...current, segment], at())) {
          current.push(segment);
          continue;
        }
        if (current.length > 0 && fits([segment], at() + 1)) {
          close();
          current.push(segment);
          continue;
        }
        // Taller than a part of its own: cut between its lines.
        let from = segment.from;
        while (from < segment.to) {
          const index = at();
          const take = mostLines(
            segment.to - from,
            (n) => fits([...current, { order: segment.order, from, to: from + n }], index),
            lastTake,
          );
          if (take === 0 && current.length > 0) {
            close();
            continue;
          }
          if (take === 0) {
            throw new Error(
              `a line for ${stop.customer} does not fit on a page even on its own, ` +
                'so no cut can print it',
            );
          }
          lastTake = take;
          current.push({ order: segment.order, from, to: from + take });
          from += take;
          if (from < segment.to) close();
        }
      }
      if (current.length > 0) close();
      return done;
    }

    /**
     * The parts from one that came out over its page, cut again with the
     * real tags. Runs of one order split across those parts are joined first,
     * so the order is treated as whole wherever it now fits whole.
     */
    function recut(rest, tagOf, start) {
      const queue = [];
      for (const segment of rest.flat()) {
        const last = queue[queue.length - 1];
        if (last && last.order === segment.order && last.to === segment.from) last.to = segment.to;
        else queue.push({ ...segment });
      }
      return cut(queue, tagOf, start);
    }
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
      productName('bf-total-product', line.product),
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
   * One sentence of context: the route, its stops, and the pallet call.
   *
   * The right half used to explain the loud capitals — "want substitute:
   * true unless marked FALSE". Every order now states its own answer in one
   * look (see marker()), so the explanation went and the pallet call has the
   * line to itself.
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
    note.appendChild(left);

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
          // Not in F7/F8, which have C and M alone: the owner asked for a box
          // for delivered beside the checked one (2026-09-30).
          ['D', 'Delivered'],
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
        route.orders.flatMap((order) => order.lines).map((line) => line.product.supplier),
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

  // ── Notes in a page's dead space ──────────────────────────────────────

  /** The distance between write-on lines: a comfortable handwriting pitch. */
  const NOTES_PITCH = 7.5;

  /** Fewer write-on lines than this is not worth a heading. */
  const NOTES_MIN_LINES = 2;

  /**
   * A quiet "Notes" heading and dotted write-on lines, for the empty space
   * below a page's last block (the owner, 2026-09-30: "use dead space … as a
   * impromptu comment field"). Not in the Rust app's print spec.
   *
   * It is added after the page's contents are settled and fills only room
   * `room` millimetres tall that is already empty, so it can never move a
   * page break, change a sheet count or put anything on another page. As many
   * lines as measure into the room, and nothing at all if fewer than two do.
   */
  function notesBlock(room, measure) {
    if (!(room > 0)) return null;
    for (let count = Math.floor(room / NOTES_PITCH); count >= NOTES_MIN_LINES; count -= 1) {
      const notes = element('section', 'bf-notes');
      notes.appendChild(element('div', 'bf-notes-title', 'Notes'));
      for (let line = 0; line < count; line += 1) {
        notes.appendChild(element('div', 'bf-notes-line', '.'.repeat(120)));
      }
      if (measure.height(notes) <= room) return notes;
    }
    return null;
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
   * removed again before this returns). `options.partTagStandIn` is for the
   * test suite alone: the tag a block cut across pages is first measured
   * with, set narrower than the real one to prove the re-cut.
   */
  function paginate(route, settings, context, options) {
    marked = new Set(settings.attention || []);
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
      const budget =
        CONTENT_HEIGHT - furnitureHeight - footerHeight - bodyMargin - FOOTER_CLEARANCE;
      const limit = Math.max(budget, MIN_BODY_HEIGHT);

      // Every piece the route puts on paper, in order: its stops, the flag
      // above the unsequenced ones, and the total that closes it. The limit is
      // worked out first because a stop with more lines than a page can hold
      // has to be cut against it — 300 lines on one order used to print 45 and
      // send the other 255 off the bottom of the paper without a word.
      //
      // The stop right under the flag is packed against the page less the
      // flag, because the two must share a page: a stop that fitted a page
      // but not the room beside the flag used to push the flag onto a page of
      // its own.
      const pieces = [];
      let flagged = false;
      // Only the test suite sets this: see stopPieces().
      const standIn =
        options && typeof options.partTagStandIn === 'string' ? options.partTagStandIn : null;
      for (const stop of route.stops) {
        let first = limit;
        if (!Model.isSequenced(stop) && !flagged) {
          flagged = true;
          const flag = unsequencedFlag();
          const flagHeight = measure.height(flag);
          pieces.push({ node: flag, height: flagHeight, keepWithNext: true });
          first = limit - flagHeight;
        }
        pieces.push(...stopPieces(stop, settings, measure, limit, first, standIn));
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
        for (const piece of indices) {
          body.appendChild(pieces[piece].node);
          if (pieces[piece].over) taller.add(pieces[piece].node);
        }
        // The page is shared out; now its dead space, if any, gets Notes lines.
        // Only the real budget counts — never the floor that lets furniture
        // overfill a page — so the 10 mm above the footer is never touched.
        const used = indices.reduce((sum, piece) => sum + pieces[piece].height, 0);
        const notes = notesBlock(budget - used, measure);
        if (notes) body.appendChild(notes);

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

  // ── Whether the paper carries every line ──────────────────────────────

  /**
   * Pieces taller than a page that nothing could cut (stopPieces(),
   * totalPieces()). The sheet's `overflow: hidden` clips them without a
   * word, so whatever they hold counts as not drawn.
   */
  const taller = new WeakSet();

  /** Sub-pixel rounding between boxes, not real overlap. */
  const SLACK = 0.5;

  /**
   * How many of a route's lines its sheets carry on the paper (the owner,
   * 2026-10-01: "can it give a severe warning if the list does not print all
   * the bread?").
   *
   * A line is drawn when its row lies within its sheet and above the
   * footer, and not inside a piece taller than a page. Anything else is
   * hidden by the sheet's `overflow: hidden` without a word. The sheets must
   * be laid out in the document, unzoomed, as they print.
   *
   * Returns the route's lines and units, and those missing with the first
   * missing bread in printing order. Returns null when the sheets have no
   * size, because nothing can be said then. A row with the right count is
   * not enough: each of the file's lines must be the one a drawn row
   * carries.
   */
  function coverage(route, sheets) {
    const drawn = new Set();
    for (const sheet of sheets) {
      const paper = sheet.getBoundingClientRect();
      if (!(paper.height > 0)) return null;
      const footer = sheet.querySelector('.bf-footer');
      const floor = footer ? Math.min(paper.bottom, footer.getBoundingClientRect().top) : paper.bottom;
      for (const row of sheet.querySelectorAll('.bf-row')) {
        const line = drawing.get(row);
        if (!line || insideTaller(row, sheet)) continue;
        const box = row.getBoundingClientRect();
        if (
          box.top >= paper.top - SLACK &&
          box.bottom <= floor + SLACK &&
          box.left >= paper.left - SLACK &&
          box.right <= paper.right + SLACK
        ) {
          drawn.add(line);
        }
      }
    }
    const lines = route.orders.flatMap((order) => order.lines);
    const missing = lines.filter((line) => !drawn.has(line));
    const units = (some) => some.reduce((sum, line) => sum + line.quantity, 0);
    return {
      lines: lines.length,
      units: units(lines),
      missing: {
        lines: missing.length,
        units: units(missing),
        first: missing.length > 0 ? missing[0].product.name : null,
      },
    };
  }

  function insideTaller(row, sheet) {
    for (let node = row.parentElement; node && node !== sheet; node = node.parentElement) {
      if (taller.has(node)) return true;
    }
    return false;
  }

  return {
    PAGE_HEIGHT,
    CONTENT_HEIGHT,
    FOOTER_CLEARANCE,
    paginate,
    day,
    coverage,
    stopBlock,
    routeTotalBlock,
    checkTotalBlock,
    measuringHost,
  };
})();

if (typeof module !== 'undefined') module.exports = Sheet;
