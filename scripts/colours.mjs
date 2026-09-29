// The colour dump. Run: npm run colours -- <checkout> <out.json>
//                   or: npm run colours -- --diff <a.json> <b.json> [mode]
//
// Proves that a change to the stylesheet moved no colour it did not mean to.
// It serves a checkout's docs/ on a fixed port, imports the dev fixture, and
// walks the app through a set of scenes: every tab, the picker with a picked
// car that is also on another route, the tag menu on a tagged row, the share
// dialog, and a notice of each kind with the update note. In each scene it
// records, for every element drawn, the colours a reader sees: text,
// background, the four borders, the outline and the box shadow. Every colour
// is normalised to 8-bit sRGB, so two ways of writing one colour compare
// equal.
//
// Each scene is recorded in five modes: light on screen, light in print, a
// dark computer on screen and in print, and data-theme="dark" on screen.
// Nothing is committed as a baseline: the proof is a diff of two runs, the
// parent commit (in a scratch git worktree) against the working tree.
//
// Elements are keyed by their place in the page (tag, id, and position among
// their siblings), never by class, so a class added or renamed is not a
// difference; an element added before others shifts their keys, and is.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.COLOURS_PORT) || 5198;
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
// Screen first: print hides the page around the sheet, and a menu whose row
// is hidden closes itself a moment later.
const MODES = {
  'light screen': { media: 'screen', colorScheme: 'light', theme: null },
  'dark screen': { media: 'screen', colorScheme: 'dark', theme: null },
  'forced dark screen': { media: 'screen', colorScheme: 'light', theme: 'dark' },
  'light print': { media: 'print', colorScheme: 'light', theme: null },
  'dark print': { media: 'print', colorScheme: 'dark', theme: null },
};

/* ---------- diff ---------- */
if (process.argv[2] === '--diff') {
  const [a, b] = await Promise.all([3, 4].map(async (i) => JSON.parse(await readFile(process.argv[i], 'utf8'))));
  const only = process.argv[5] || '';
  const groups = new Map();
  let n = 0;
  for (const mode of new Set([...Object.keys(a.modes), ...Object.keys(b.modes)])) {
    if (!mode.startsWith(only)) continue;
    const sa = a.modes[mode] || {}, sb = b.modes[mode] || {};
    for (const scene of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      const ea = sa[scene] || {}, eb = sb[scene] || {};
      for (const path of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
        const pa = ea[path], pb = eb[path];
        if (!pa || !pb) {
          const key = `${pa ? 'only in the first' : 'only in the second'}: an element`;
          groups.set(key, [...(groups.get(key) || []), `${mode} / ${scene} / ${path}`]); n++;
          continue;
        }
        for (const prop of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
          if (pa[prop] === pb[prop]) continue;
          const key = `${prop}: ${pa[prop]} -> ${pb[prop]}`;
          groups.set(key, [...(groups.get(key) || []), `${mode} / ${scene} / ${path}`]); n++;
        }
      }
    }
  }
  if (!n) { console.log(`no differences${only ? ` in ${only}` : ''}`); process.exit(0); }
  console.log(`${n} difference(s)${only ? ` in ${only}` : ''}, in ${groups.size} group(s):`);
  for (const [key, where] of groups) {
    console.log(`  ${key}  (${where.length}×)`);
    for (const w of where.slice(0, 3)) console.log(`      ${w}`);
  }
  process.exit(1);
}

/* ---------- dump ---------- */
const root = process.argv[2] && resolve(process.argv[2]);
const out = process.argv[3];
if (!root || !out || !existsSync(join(root, 'docs', 'index.html'))) {
  console.log('Usage: npm run colours -- <checkout> <out.json>\n       npm run colours -- --diff <a.json> <b.json> [mode]');
  process.exit(2);
}
const devPlan = await readFile(join(HERE, 'scripts', 'fixtures', 'dev-data.json'), 'utf8');
const server = await startServer(PORT, join(root, 'docs'));
if (server.base !== `http://localhost:${PORT}/`) throw new Error(`could not take port ${PORT}`);
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const context = await browser.newContext({ viewport: { width: 1360, height: 940 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const record = () => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const alpha = (s) => (s === undefined ? 1 : s.endsWith('%') ? parseFloat(s) / 100 : Number(s));
  const memo = new Map();
  const one = (c) => {
    if (memo.has(c)) return memo.get(c);
    let rgba, m;
    if ((m = /^rgba?\(\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(c))) {
      rgba = [+m[1], +m[2], +m[3], alpha(m[4])];
    } else if ((m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(c))) {
      rgba = [m[1] * 255, m[2] * 255, m[3] * 255, alpha(m[4])];
    } else {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      rgba = [d[0], d[1], d[2], d[3] / 255];
    }
    const s = '#' + rgba.slice(0, 3).map(hex).join('') + (rgba[3] < 1 ? hex(rgba[3] * 255) : '');
    memo.set(c, s);
    return s;
  };
  const COLOUR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
  const PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow'];
  const got = {};
  const walk = (el, path) => {
    if (el !== document.documentElement && el !== document.body && !el.getClientRects().length) return;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of PROPS) o[p] = cs.getPropertyValue(p).replace(COLOUR, one);
    got[path] = o;
    [...el.children].forEach((c, i) => {
      if (/^(SCRIPT|STYLE|HEAD|META|LINK|TITLE)$/.test(c.tagName)) return;
      walk(c, `${path}>${c.tagName.toLowerCase()}${c.id ? '#' + c.id : ''}:${i}`);
    });
  };
  walk(document.documentElement, 'html');
  return got;
});

const modes = Object.fromEntries(Object.keys(MODES).map((m) => [m, {}]));
async function scene(name) {
  await page.mouse.move(0, 0);
  for (const [mode, { media, colorScheme, theme }] of Object.entries(MODES)) {
    await page.emulateMedia({ media, colorScheme });
    await page.evaluate((t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }, theme);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    modes[mode][name] = await record();
  }
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  // A stored theme, once there is one, is put back as the page had it.
  await page.evaluate(() => { try { const t = localStorage.getItem('carcoord:pref:theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* none */ } });
}
const tab = (name) => page.click(`[data-act="tab"][data-tab="${name}"]`);

await page.goto(server.base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await tab('data');
await page.setInputFiles('#importFile', { name: 'dev-data.json', mimeType: 'application/json', buffer: Buffer.from(devPlan) });
await page.waitForFunction(() => state.cars.length > 0, null, { timeout: 5000 });
// The import's own notice would sit above every scene; start each clean.
await page.evaluate(() => { notices = []; render(); });

for (const name of ['plan', 'drivers', 'cars', 'positions', 'labels', 'data', 'preview']) {
  await tab(name);
  await scene(`tab ${name}`);
}

// The picker, on a route whose car is also on another route: a picked choice
// with a clash note, beside ordinary and taken choices.
await tab('plan');
await page.evaluate(() => { state.routes[1].carId = state.routes[0].carId; render(); });
await page.locator('#tab-plan tbody tr').nth(1).locator('[data-field="carId"]').click();
await page.waitForSelector('#picker:not([hidden]) .pick.on');
await scene('picker on a clashing car');
await page.keyboard.press('Escape');

// The tag menu on a row that carries a tag.
const tagged = await page.evaluate(() => state.cars.find((c) => c.labelId)?.id);
await page.click(`#tab-plan [data-act="tag"][data-kind="car"][data-id="${tagged}"]`);
await page.waitForSelector('#tagMenu:not([hidden])');
await scene('tag menu on a tagged row');
await page.keyboard.press('Escape');
await page.mouse.click(5, 900);

// The share dialog another PC would see.
await tab('data');
await page.click('[data-act="share-make"][data-mode="day"]');
await page.waitForFunction(() => document.querySelector('#shareOut')?.value.startsWith('CC1'));
await page.fill('#shareIn', await page.locator('#shareOut').inputValue());
await page.click('[data-act="share-read"]');
await page.waitForSelector('#shareDlg[open]');
await scene('share dialog');
await page.click('[data-act="share-cancel"]');

// One notice of each kind, and the update note above the plan.
await page.evaluate(() => localStorage.removeItem('carcoord:pref:seenUpdate'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.evaluate(() => { note('info', 'An information line.'); note('warn', 'A warning line.'); render(); });
await tab('plan');
await scene('notices');

await browser.close();
await server.close();
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
await writeFile(out, JSON.stringify({ version, modes }));
const count = Object.values(modes['light screen']).reduce((n, s) => n + Object.keys(s).length, 0);
console.log(`colours of ${version} written to ${out}: ${Object.keys(modes).length} modes, ${Object.keys(modes['light screen']).length} scenes, ${count} elements in light on screen`);
if (errors.length) { console.log(`page errors: ${errors.join(' | ')}`); process.exit(1); }
