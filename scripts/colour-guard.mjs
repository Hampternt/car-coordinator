// Keeps every colour in one place. Run by the smoke test; also on its own:
//   node scripts/colour-guard.mjs
//
// docs/style.css: every colour written out (hex, rgb(), hsl() and the like,
// or a named colour) must sit in a custom property's own declaration, so a
// theme can change it. `transparent`, `currentColor` and `inherit` are not
// colours of their own. dialog::backdrop is the one exemption: it dims the
// page the same way in any theme.
//
// docs/*.js: the app writes a colour inline only where it is data, a label's
// colour, and the few defaults a new label starts from. Anything else is
// listed here or fails.
//
// The printed sheet: no dark block may name a paper token or the sheet's
// shadow, so a dark theme can never reach the paper.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));

// (file, literal) pairs the shipped scripts may hold.
export const JS_ALLOWED = {
  'app.js': ['#c62828', '#ef6c00', '#6a1b9a', '#1565c0'],
  'store.js': ['#c62828'],
  'share.js': ['#c62828'],
};

const NAMED = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen canvas canvastext field fieldtext buttonface buttontext highlight highlighttext graytext linktext visitedtext activetext mark marktext accentcolor accentcolortext'.split(' ');
const LITERAL = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|\\b(?:${NAMED.join('|')})\\b`, 'gi');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The body of every block opened by `head` (an at-rule or selector matched by
// a regexp), balanced.
function blocks(css, head) {
  const out = [];
  for (const m of css.matchAll(head)) {
    let i = css.indexOf('{', m.index);
    let depth = 0, start = i;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    out.push(css.slice(start + 1, i));
  }
  return out;
}

export async function colourGuard(docs = DOCS) {
  const problems = [];
  const css = stripComments(await readFile(join(docs, 'style.css'), 'utf8'))
    // The condition of an @supports is a test, not a colour anyone sees.
    .replace(/@supports\s*\(([^{}]*)\)\s*\{/g, '@supports {');
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/^@[^{]*$/, '');
    if (selector === 'dialog::backdrop') continue;
    for (const decl of m[2].split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const prop = decl.slice(0, at).trim();
      if (prop.startsWith('--')) continue;
      const value = decl.slice(at + 1).replace(/var\(--[\w-]+/g, 'var(');
      const hits = value.match(LITERAL);
      if (hits) problems.push(`docs/style.css: ${selector} { ${prop}: ${decl.slice(at + 1).trim()} } writes ${hits.join(', ')}; use a token`);
    }
  }
  const dark = [
    ...blocks(css, /@media[^{]*prefers-color-scheme:\s*dark[^{]*/g),
    ...blocks(css, /[^{}]*\[data-theme="dark"\][^{]*/g),
  ];
  for (const body of dark) {
    const named = body.match(/--paper[\w-]*|--shadow\b/g);
    if (named) problems.push(`docs/style.css: a dark block names ${[...new Set(named)].join(', ')}, which only the paper may define`);
  }

  for (const file of (await readdir(docs)).filter((f) => f.endsWith('.js'))) {
    const js = await readFile(join(docs, file), 'utf8');
    const allowed = JS_ALLOWED[file] || [];
    for (const hit of js.match(/(?<!&)#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)|var\(--[\w-]+\)/gi) || []) {
      if (!allowed.includes(hit)) problems.push(`docs/${file}: writes ${hit}, which is not on the list in scripts/colour-guard.mjs`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await colourGuard();
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(problems.length ? `${problems.length} colour(s) outside the tokens` : 'colours: every one is a token');
  process.exit(problems.length ? 1 : 0);
}
