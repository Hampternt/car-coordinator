'use strict';
/* The parking map under the week: a plain drawing of the yard, with Spot 1 to
   Spot 5 and the gate where they really are, each listing its routes by
   round. Positions are found by name, so nothing saved changes; any other
   position goes in a short list under the drawing, and the Garage is left
   off. The public repo carries no site names or sizes: plain boxes in their
   relative places.

   Pure: app.js hands over plain copies of what the map reads, and nothing
   here writes to them, to the page's storage or to anything else. Only
   ParkingMap is declared at the top level: this loads as a classic script
   beside app.js, and a top-level esc or fold of its own would clash with
   app.js's and stop the app from starting. */
const ParkingMap = (() => {
  // The gate's name on the Positions tab, in order of preference (owner,
  // 2026-09-29: it is called Gate). Matched exactly as it is written, so
  // nothing needs renaming: a rename would change the printed sheet.
  const GATE_NAMES = ['Gate'];
  const SPOTS = ['Spot 1', 'Spot 2', 'Spot 3', 'Spot 4', 'Spot 5'];
  const fold = (s) => String(s ?? '').trim().toUpperCase();
  const numeric = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const statusName = (l) => (String(l.name ?? '').trim() ? String(l.name) : 'a status with no name');

  /* Which box each position is, and what each box shows. Positions are
     told apart by their place on the Positions tab, not their id: an
     imported file can repeat an id. */
  function model({ positions = [], labels = [], cars = [], rounds = [] } = {}) {
    const firstById = (list) => {
      const m = new Map();
      for (const x of list) if (x && !m.has(x.id)) m.set(x.id, x);
      return m;
    };
    const labelById = firstById(labels);
    const carById = firstById(cars);
    const posIndexById = new Map();
    positions.forEach((p, i) => { if (!posIndexById.has(p.id)) posIndexById.set(p.id, i); });

    // Each position's round buckets, in plan order within each round.
    const bucketsAt = new Map();
    for (const b of rounds) {
      const first = b && b.routes && b.routes[0];
      if (!first || !posIndexById.has(first.positionId)) continue;   // a position that is gone
      const i = posIndexById.get(first.positionId);
      if (!bucketsAt.has(i)) bucketsAt.set(i, []);
      bucketsAt.get(i).push(b);
    }

    const status = (p) => {
      const l = p.labelId ? labelById.get(p.labelId) : null;
      if (!l) return null;
      const note = String(p.note ?? '').trim();
      return { color: l.color, text: `${statusName(l)}${note ? ` · ${note}` : ''}` };
    };
    const groups = (i) => {
      const buckets = bucketsAt.get(i) || [];
      const anyRound = buckets.some((b) => String(b.routes[0].round ?? '').trim());
      return buckets
        .map((b) => {
          const round = String(b.routes[0].round ?? '').trim();
          const n = b.routes.length;
          return {
            round,
            heading: anyRound ? (round ? `Round ${round}` : 'No round') : '',
            clash: b.clash === true,
            tag: b.clash === true ? `Taken by ${n} routes${round ? ` in round ${round}` : ''}` : '',
            lines: b.routes.map((r) => {
              const reg = r.carId ? carById.get(r.carId)?.reg : '';
              return { text: `route ${String(r.name ?? '').trim() || '-'}${reg ? ` · ${reg}` : ''}`, clash: b.clash === true };
            }),
          };
        })
        // Numbers in number order (2 before 10), words after them; the
        // routes with no round come last.
        .sort((a, b) => (!a.round - !b.round) || numeric.compare(a.round, b.round));
    };

    const skip = new Set();
    positions.forEach((p, i) => { if (fold(p.name) === 'GARAGE') skip.add(i); });
    const claimed = new Map();   // position index -> box
    const firstNamed = (name) => positions.findIndex((p, i) => !skip.has(i) && !claimed.has(i) && fold(p.name) === fold(name));

    const box = (key, looksFor, i, gate = false) => {
      const b = { key, gate, looksFor, title: looksFor, position: null, status: null, multi: false, twin: '', groups: [], red: false, free: false };
      if (i < 0) return b;
      const p = positions[i];
      claimed.set(i, b);
      Object.assign(b, {
        title: String(p.name).trim(), position: { id: p.id, name: p.name }, status: status(p), multi: p.multi === true, groups: groups(i),
      });
      b.red = b.groups.some((g) => g.clash);
      return b;
    };
    const boxes = SPOTS.map((name, n) => box(`spot${n + 1}`, name, firstNamed(name)));
    const gateName = GATE_NAMES.find((name) => firstNamed(name) >= 0);
    boxes.push(box('gate', gateName || GATE_NAMES[0], gateName ? firstNamed(gateName) : -1, true));

    // Everything else, in Positions-tab order. A later position with a box's
    // name is a twin: listed, and named on the box, so the box never reads
    // Free while the twin's routes are only down here.
    const others = [];
    positions.forEach((p, i) => {
      if (skip.has(i) || claimed.has(i)) return;
      const twinOf = boxes.find((b) => b.position && fold(b.title) === fold(p.name));
      if (twinOf) twinOf.twin = `Another position is also called ${twinOf.title}; it is listed below.`;
      const gs = groups(i);
      others.push({
        title: String(p.name ?? '').trim() || 'A position with no name',
        position: { id: p.id, name: p.name },
        status: status(p), multi: p.multi === true, groups: gs, red: gs.some((g) => g.clash),
        also: twinOf ? `Also called ${twinOf.title}; the map shows the first one.` : '',
      });
    });
    for (const b of boxes) b.free = !!b.position && !b.groups.length && !b.status && !b.twin;
    return { boxes, others };
  }

  return { GATE_NAMES, model };
})();
