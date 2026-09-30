// The parking map's own check, in node, without a browser. Run: npm run test:map
//
// docs/map.js is loaded into a vm context the way versions.mjs reads
// updates.js, and handed plain copies built the way app.js builds them. Every
// input is deep-frozen, so a write to one throws. Expectations about the gate
// read ParkingMap.GATE_NAMES, never a name written out here.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const source = await read('docs/map.js');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const ParkingMap = vm.runInContext('ParkingMap', ctx);
const GATE = ParkingMap.GATE_NAMES[0];

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const fold = (s) => String(s ?? '').trim().toUpperCase();
// The hand-over, as app.js builds it: plain copies, and one bucket per spot
// and round, marked a clash the way the warnings decide it.
const handOver = (plan) => {
  const buckets = new Map();
  for (const r of plan.routes) {
    if (!r.positionId) continue;
    const key = `${r.positionId}\u0000${fold(r.round)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ name: r.name, round: r.round ?? '', positionId: r.positionId, carId: r.carId ?? '' });
  }
  return freeze({
    positions: plan.positions.map(({ id, name, multi, labelId, note }) => ({ id, name, multi: multi === true, labelId: labelId ?? '', note: note ?? '' })),
    labels: plan.labels.map(({ id, name, color }) => ({ id, name, color })),
    cars: plan.cars.map(({ id, reg }) => ({ id, reg })),
    rounds: [...buckets.values()].map((routes) => {
      const pos = plan.positions.find((p) => p.id === routes[0].positionId);
      return { routes, clash: routes.length > 1 && !!pos && pos.multi !== true };
    }),
  });
};
const dev = JSON.parse(await read('scripts/fixtures/dev-data.json'));
const boxText = (b) => [b.title, b.status?.text, b.multi && 'Many cars', b.twin, ...b.groups.flatMap((g) => [g.heading, g.tag, ...g.lines.map((l) => l.text + (l.clash ? ' *' : ''))])].filter(Boolean);

// --- the fixture ---
{
  const input = handOver(dev);
  const before = JSON.stringify(input);
  const m = ParkingMap.model(input);
  same('six boxes, Spot 1 to Spot 5 then the gate', m.boxes.map((b) => b.key), ['spot1', 'spot2', 'spot3', 'spot4', 'spot5', 'gate']);
  same('Spot 1 to Spot 5 hold their positions', m.boxes.slice(0, 5).map((b) => b.position?.id), ['pos-spot1', 'pos-spot2', 'pos-spot3', 'pos-spot4', 'pos-spot5']);
  const gatePos = dev.positions.find((p) => ParkingMap.GATE_NAMES.map(fold).includes(fold(p.name)));
  check(`the gate box holds the position named ${GATE}, or looks for it`, gatePos ? m.boxes[5].position?.id === gatePos.id : !m.boxes[5].position && m.boxes[5].looksFor === GATE);
  same('every other position is under Not on the map, in Positions-tab order',
    m.others.map((o) => o.title), dev.positions.filter((p) => !/^spot [1-5]$/i.test(p.name.trim()) && fold(p.name) !== 'GARAGE' && !ParkingMap.GATE_NAMES.map(fold).includes(fold(p.name))).map((p) => p.name));
  check('the Garage is nowhere', !JSON.stringify(m).includes('pos-garage'));
  same('Spot 2 reads its routes by round, red, with its tag', boxText(m.boxes[1]),
    ['Spot 2', 'Round 1', 'route 2 · EL 41033', 'Round 2', 'Taken by 2 routes in round 2', 'route 9 · EV 73112 *', 'route 10 · EV 73140 *']);
  check('and Spot 2 is red', m.boxes[1].red && !m.boxes[0].red);
  same('Spot 5 shows its status and note', m.boxes[4].status?.text, 'Unavailable · Resurfacing until Friday');
  check('the inputs are the same after', JSON.stringify(input) === before);
}

// --- status, matching and wording ---
const plan = (positions, routes = [], extra = {}) => ({ positions, routes, labels: [{ id: 'L1', name: 'Workshop', color: '#6a1b9a' }, { id: 'L2', name: '  ', color: '#1565c0' }], cars: [{ id: 'c1', reg: 'AA11111' }], ...extra });
const P = (id, name, more = {}) => ({ id, name, multi: false, labelId: '', note: '', ...more });
const R = (name, positionId, round = '', carId = '') => ({ name, positionId, round, carId });
{
  let m = ParkingMap.model(handOver(plan([P('a', 'Spot 1', { labelId: 'gone' }), P('b', 'Spot 2', { labelId: 'L2' })])));
  check('a status that names no label does not count', !m.boxes[0].status && m.boxes[0].free);
  same('a status with a blank name says so', m.boxes[1].status?.text, 'a status with no name');
  m = ParkingMap.model(handOver(plan([P('a', ' spot 1 ')])));
  check('" spot 1 " matches Spot 1', m.boxes[0].position?.id === 'a');
  m = ParkingMap.model(handOver(plan([P('a', 'Spot 1'), P('b', 'Spot 1')], [R('7', 'b')])));
  same('a second Spot 1 is listed, and says so', m.others.map((o) => o.also), ['Also called Spot 1; the map shows the first one.']);
  check('and the first box never reads Free while its twin has the route', !m.boxes[0].free && m.boxes[0].twin === 'Another position is also called Spot 1; it is listed below.');
  m = ParkingMap.model(handOver(plan([P('a', 'Spot 1'), P('e', 'Car park 5')])));
  check('a Spot 5 renamed leaves the box looking for it, and lists the new name',
    !m.boxes[4].position && m.boxes[4].looksFor === 'Spot 5' && m.others.some((o) => o.title === 'Car park 5'));
  m = ParkingMap.model(handOver(plan([P('g', ` ${GATE.toLowerCase()} `), P('h', GATE)])));
  check(`the gate matches ${GATE} as written, the first on the tab`, m.boxes[5].position?.id === 'g' && m.others.length === 1);
  m = ParkingMap.model(handOver(plan([P('s', '   ')])));
  same('a name of only spaces is listed as a position with no name', m.others.map((o) => o.title), ['A position with no name']);
  m = ParkingMap.model(handOver(plan([P('a', 'Spot 1')], [R('1', 'a', '10'), R('2', 'a', '2'), R('3', 'a', 'A'), R('4', 'a', '')])));
  same('rounds in number order, words after, no round last', m.boxes[0].groups.map((g) => g.heading), ['Round 2', 'Round 10', 'Round A', 'No round']);
  m = ParkingMap.model(handOver(plan([P('a', 'Spot 1')], [R('1', 'a'), R('', 'a'), R('2', 'a', '', 'c1')])));
  same('no headings where no route has a round; no car, and a blank name',
    m.boxes[0].groups.flatMap((g) => [g.heading, ...g.lines.map((l) => l.text)]), ['', 'route 1', 'route -', 'route 2 · AA11111']);
  m = ParkingMap.model(freeze({ positions: [P('a', 'Spot 1')], labels: [], cars: [], rounds: [{ routes: [R('1', 'a', '1'), R('2', 'a', '1')], clash: false }] }));
  check('a bucket the warnings do not call a clash is never red', !m.boxes[0].red && !m.boxes[0].groups[0].tag);
  m = ParkingMap.model(handOver(plan([P('a', 'Spot 1', { multi: true })], [R('1', 'a', '2'), R('2', 'a', '2')])));
  check('a spot ticked Many cars says so, and is not red', m.boxes[0].multi && !m.boxes[0].red);
  m = ParkingMap.model(handOver(plan([P('__proto__', 'Spot 1')], [R('1', '__proto__', '1')], { labels: [{ id: '__proto__', name: 'Odd', color: '#123456' }], cars: [{ id: '__proto__', reg: 'PR0T0' }] })));
  check('ids of __proto__ work', m.boxes[0].position?.id === '__proto__' && m.boxes[0].groups.length === 1);
}

// --- one name at the top level, and none that clash with the app's ---
{
  const declared = [...source.matchAll(/^(?:const|let|var|function|class) ([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
  same('ParkingMap is the only top-level name map.js declares', declared, ['ParkingMap']);
  const names = new Set();
  for (const f of ['store.js', 'share.js', 'updates.js', 'app.js']) {
    for (const x of (await read(`docs/${f}`)).matchAll(/^(?:const|let|var|function|class|async function) ([A-Za-z_$][\w$]*)/gm)) names.add(x[1]);
  }
  let clash = '';
  for (const n of names) {
    try { vm.runInContext(`let ${n} = 0;`, ctx); } catch (e) { clash += ` ${n}`; }
  }
  check("declaring every top-level name of the app's scripts after map.js raises nothing", !clash, clash);
}

console.log(failures.length ? `\n${failures.length} map check(s) failed` : '\nmap checks passed');
process.exit(failures.length ? 1 : 0);
