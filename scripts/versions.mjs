// The version guard. Run: node scripts/versions.mjs [repo root]
//
// A release is cut by moving one version number through several files, and
// a place left behind costs something different each time: the Windows build
// re-uploads the last release in place, the update note never shows, or a
// browser pairs a new app.js with a cached stylesheet. None of that fails a
// test that drives the page, so it is checked here, in the item gate and
// first in `npm test`:
//
//   * package.json, package-lock.json (twice), src-tauri/Cargo.toml and
//     src-tauri/tauri.conf.json agree;
//   * the Windows app keeps the identifier and the page origin its saved
//     data lives under: no.m.carcoordinator, and no scheme option;
//   * docs/app.js declares APP_VERSION exactly once, at that version;
//   * every local script and stylesheet tag in docs/index.html and
//     docs/recover.html asks for ?v=<APP_VERSION>;
//   * docs/updates.js lists unique versions, newest first and newest equal to
//     APP_VERSION, and sets `must` wherever the wording rules require it.
//
// docs/recover.html is checked once it exists. Exit 0 = all agree.

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IDENTIFIER = 'no.m.carcoordinator';
const NOTHING = 'Nothing in your saved plan changes.';

// Number by number, so 0.10.0 is newer than 0.9.0. Negative when a is older.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const exists = (p) => access(p).then(() => true, () => false);
// The lines of one [section] of a TOML file, up to the next line opening one.
const section = (toml, name) => {
  const lines = toml.split(/\r?\n/);
  const from = lines.findIndex((l) => l.trim() === `[${name}]`);
  if (from < 0) return '';
  const to = lines.findIndex((l, i) => i > from && /^\s*\[/.test(l));
  return lines.slice(from + 1, to < 0 ? undefined : to).join('\n');
};

export async function checkVersions(root) {
  const problems = [];
  const passed = [];
  const at = (rel) => join(root, rel);
  const json = async (rel) => JSON.parse(await readFile(at(rel), 'utf8'));

  // --- the five places a release moves ---
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  const cargo = await readFile(at('src-tauri/Cargo.toml'), 'utf8');
  const tauri = await json('src-tauri/tauri.conf.json');
  const places = [
    ['package.json', pkg.version],
    ['package-lock.json (top)', lock.version],
    ['package-lock.json (packages[""])', lock.packages && lock.packages[''] && lock.packages[''].version],
    ['src-tauri/Cargo.toml', (/^version\s*=\s*"([^"]+)"/m.exec(section(cargo, 'package')) || [])[1]],
    ['src-tauri/tauri.conf.json', tauri.version],
  ];
  const version = pkg.version;
  const off = places.filter(([, v]) => v !== version);
  if (off.length) for (const [file, v] of off) problems.push(`${file} says ${v === undefined ? 'nothing' : v}, package.json says ${version}`);
  else passed.push(`the five version places agree at ${version}`);

  // --- where the Windows app's saved data lives ---
  if (tauri.identifier !== IDENTIFIER) problems.push(`src-tauri/tauri.conf.json: identifier is ${tauri.identifier}, not ${IDENTIFIER}`);
  const schemes = [];
  (function walk(v, path) {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (/scheme/i.test(k)) schemes.push(`${path}${k}`);
      walk(x, `${path}${k}.`);
    }
  })(tauri, '');
  if (schemes.length) problems.push(`src-tauri/tauri.conf.json sets ${schemes.join(', ')}: a scheme change moves the page to another origin, away from its saved data`);
  if (tauri.identifier === IDENTIFIER && !schemes.length) passed.push(`the identifier is ${IDENTIFIER}, with no scheme option`);

  // --- the running version, in the app ---
  const app = await readFile(at('docs/app.js'), 'utf8');
  const declared = app.match(/\b(?:const|let|var)\s+APP_VERSION\b/g) || [];
  const value = (/\bconst\s+APP_VERSION\s*=\s*'([^']*)'/.exec(app) || [])[1];
  let appVersion = null;
  if (declared.length !== 1) problems.push(`docs/app.js declares APP_VERSION ${declared.length} times, not once`);
  else {
    if (value !== version) problems.push(`docs/app.js: APP_VERSION is ${value === undefined ? 'not a plain string' : value}, package.json says ${version}`);
    else { appVersion = value; passed.push(`docs/app.js declares APP_VERSION once, at ${value}`); }
  }

  // --- every local tag asks for this version, and the notes load first ---
  const index = await readFile(at('docs/index.html'), 'utf8');
  const order = ['updates.js', 'app.js'].map((f) => index.search(new RegExp(`<script\\b[^>]*\\bsrc="${f.replace('.', '\\.')}[?"]`)));
  if (order[0] < 0) problems.push('docs/index.html does not load updates.js');
  else if (order[1] >= 0 && order[0] > order[1]) problems.push('docs/index.html loads updates.js after app.js');
  if (appVersion) {
    for (const page of ['docs/index.html', 'docs/recover.html']) {
      if (!(await exists(at(page)))) continue;
      const html = await readFile(at(page), 'utf8');
      const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)]
        .map((m) => m[1]).filter((u) => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u));
      const wrong = tags.filter((u) => !u.endsWith(`?v=${appVersion}`));
      if (wrong.length) problems.push(`${page}: ${wrong.join(', ')} ${wrong.length === 1 ? 'does' : 'do'} not ask for ?v=${appVersion}`);
      else if (tags.length) passed.push(`${page}: all ${tags.length} local tags ask for ?v=${appVersion}`);
    }
  }

  // --- the release notes ---
  if (!(await exists(at('docs/updates.js')))) problems.push('docs/updates.js is missing');
  else {
    const ctx = vm.createContext({});
    let releases;
    try {
      vm.runInContext(await readFile(at('docs/updates.js'), 'utf8'), ctx, { filename: 'docs/updates.js' });
      releases = vm.runInContext('typeof UPDATES === "undefined" ? undefined : UPDATES', ctx);
      if (!Array.isArray(releases)) problems.push('docs/updates.js does not define UPDATES as a list');
    } catch (e) { problems.push(`docs/updates.js does not run: ${e.message}`); }
    if (Array.isArray(releases)) {
      const before = problems.length;
      releases.forEach((r, i) => {
        const name = r && r.version ? r.version : `entry ${i + 1}`;
        if (!r || !/^\d+\.\d+\.\d+$/.test(String(r.version))) problems.push(`docs/updates.js: ${name} has no x.y.z version`);
        for (const f of ['title', 'changed', 'affects', 'data']) {
          if (!r || typeof r[f] !== 'string' || !r[f].trim()) problems.push(`docs/updates.js: ${name} has no ${f}`);
        }
        if (!r || typeof r.affects !== 'string' || typeof r.data !== 'string') return;
        // Rule G: `must` whenever the saved plan changes, or the printed sheet
        // or share codes do. `affects` always says which, sentence by sentence.
        const sentences = r.affects.split(/(?<=\.)\s+/);
        const says = (what) => sentences.filter((s) => s.toLowerCase().includes(what));
        const why = [];
        if (!r.data.startsWith(NOTHING)) why.push('the saved plan changes');
        for (const what of ['printed sheet', 'share codes']) {
          const about = says(what);
          if (!about.length) problems.push(`docs/updates.js: ${name}'s affects does not say whether the ${what} changes`);
          else if (!about.every((s) => /unchanged/i.test(s))) why.push(`the ${what} changes`);
        }
        if (why.length && r.must !== true) problems.push(`docs/updates.js: ${name} needs must: true, because ${why.join(' and ')}`);
      });
      const versions = releases.map((r) => r && r.version);
      if (new Set(versions).size !== versions.length) problems.push('docs/updates.js lists a version twice');
      for (let i = 1; i < versions.length; i++) {
        if (compareVersions(versions[i - 1], versions[i]) <= 0) problems.push(`docs/updates.js: ${versions[i - 1]} is listed above ${versions[i]}, which is not older`);
      }
      const want = appVersion || version;
      if (versions[0] !== want) problems.push(`docs/updates.js: the newest entry is ${versions[0] === undefined ? 'missing' : versions[0]}, the app runs ${want}`);
      if (problems.length === before) passed.push(`docs/updates.js: ${versions.length} entries, newest first, newest ${want}, must set where required`);
    }
  }

  return { version, problems, passed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
  const { problems, passed } = await checkVersions(root);
  for (const p of passed) console.log(`ok   ${p}`);
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(problems.length ? `VERSIONS FAILED: ${problems.length} problem(s).` : 'VERSIONS OK');
  process.exit(problems.length ? 1 : 0);
}
