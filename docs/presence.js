'use strict';
/* Who is editing: the shared plan's presence (manifests/2026-10-07-shared-plan.md,
   round 3, pack 4).

   Each browser in a shared plan says, inside the encryption, which tab it is
   on and which row and box it is in; the other screen tints that row in the
   sender's colour, tags it with their name, and outlines the box. Nothing
   here is ever stored by the relay, and nothing here ever blocks an edit:
   clicking into a row someone else is in only shows a quiet note.

   The message (sealed as kind `presence` by the app, see roomSendPresence):
     { schema, who: { id, name, color }, tab, at: { kind, id, field } | null, t, bye? }
   `who.id` is random per browser and kept, so a manager's own tabs are one person
   and never mark each other.
   `color` is a key of PALETTE below, never a colour value: the colours
   themselves are tokens in style.css's presence region, with dark values.

   The app calls, and nothing else of the app is touched from here:
     Presence.attach(api)     once at start; api = { live() -> bool,
                              send(plain) -> Promise<bool>, rerender() }
     Presence.receive(plain)  each presence message the room delivers, opened
     Presence.decorate()      after every render(), to put the marks back
     Presence.settingsHtml()  -> html for the Shared plan card: name and colour
     Presence.pillText()      -> '' or e.g. 'Kari is here · Day plan' */
const Presence = (() => {
  let api = null;

  /* ---------- who this is ---------- */
  // Readable on light and on dark (style.css gives each a dark value), and
  // none of them the pink of a marked row, the amber of a warning or the
  // hi-vis of the shared plan's own marks.
  const PALETTE = [['teal', 'Teal'], ['violet', 'Violet'], ['blue', 'Blue'], ['green', 'Green'], ['indigo', 'Indigo'], ['brown', 'Brown']];
  const KEYS = PALETTE.map(([k]) => k);
  const NAME_MAX = 24;
  const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  // One id per browser, not per tab (the owner's call, 2026-10-09): the
  // manager's own second tab is not someone else, so it neither marks rows
  // nor names itself in the bar. Kept with the browser's other preferences;
  // a browser that refuses storage keeps one for as long as the page is open.
  const myId = (() => {
    const kept = typeof Store !== 'undefined' ? Store.pref('presenceId') : null;
    if (typeof kept === 'string' && /^[0-9a-f]{16}$/.test(kept)) return kept;
    const id = randomId();
    if (typeof Store !== 'undefined') Store.setPref('presenceId', id);
    return id;
  })();
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  // The colour of someone whose key this build does not know (a newer
  // palette): the same for one tab every time.
  const colourOf = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return KEYS[h % KEYS.length];
  };
  const pref = (name) => (typeof Store !== 'undefined' ? Store.pref(name) : null);
  // Kept as typed (a box redrawn mid-word must not lose its trailing space);
  // tidied only when it is shown or sent.
  const typedName = () => String(pref('presenceName') || '').slice(0, NAME_MAX);
  const myName = () => cleanName(typedName());
  // Not picked yet: one is picked at random and kept, so this browser keeps
  // its colour from one visit to the next, as the card shows it.
  // A browser that refuses storage keeps it for as long as the page is open.
  const pick = KEYS[crypto.getRandomValues(new Uint8Array(1))[0] % KEYS.length];
  const myColour = () => {
    const c = pref('presenceColor');
    if (KEYS.includes(c)) return c;
    if (typeof Store !== 'undefined') Store.setPref('presenceColor', pick);
    return pick;
  };

  /* ---------- the Shared plan card: name and colour ---------- */
  // Its own data-presence-set attributes, never data-kind or data-field: those
  // are the plan's, and the app would take a keystroke here for an edit.
  // Every control has an id, which is how the card's redraw finds the focus.
  function settingsHtml() {
    const mine = myColour();
    const swatches = PALETTE.map(([k, label]) => `<label class="presence-colour pr-c-${k}" title="${label}">`
      + `<input type="radio" name="presenceColour" id="presenceColour-${k}" value="${k}" data-presence-set="color"${k === mine ? ' checked' : ''}>`
      + `<span class="presence-swatch" aria-hidden="true"></span>${label}</label>`).join('');
    return `<div class="presence-settings" id="presenceSettings">
      <h4>Your name on the other screen</h4>
      <p class="hint">The other manager sees it, in your colour, on the line you are working on, and you see theirs. Kept on this PC; sent only locked, like the plan.</p>
      <div class="presence-me">
        <label class="presence-name" for="presenceName">Name <input id="presenceName" type="text" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="e.g. Kari" data-presence-set="name" value="${escHtml(typedName())}"></label>
        <span class="presence-colours" role="radiogroup" aria-label="Your colour">${swatches}</span>
      </div>
    </div>`;
  }

  /* ---------- sending: where this browser is ---------- */
  const SEND_GAP = 250;        // at most four a second, however fast the focus moves
  const HEARTBEAT = 20000;     // said again while nothing moves, so the other keeps it
  let lastSent = null;         // what the last message said, to send only a change
  let lastSendAt = 0;
  let sendTimer = null;
  let forced = false;
  let lastTab = null;
  let lastAt = null;
  let wasLive = false;

  const isLive = () => { try { return !!api && !!api.live(); } catch { return false; } };
  const currentTab = () => document.querySelector('.tabs [data-act="tab"].active')?.dataset.tab || null;
  // Where the focus is, as the plan names it: the box (kind, id and field),
  // or the row or card it is in. A row's own grid, tag menu or right-click
  // menu is still that row. Anything else (the Data tab's cards, a dialog,
  // the bar) is nowhere in particular.
  function whereAt() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    if (el.closest('#picker, #tagMenu, #ctxMenu, #ctxSub')) return lastAt;
    if (!el.closest('section.tab')) return null;
    const box = el.closest('[data-kind]');
    const d = box ? box.dataset : {};
    if (d.kind && d.kind !== 'meta' && d.id) return { kind: d.kind, id: d.id, field: d.field || null };
    if (d.kind === 'meta' && d.field) return { kind: 'meta', id: null, field: d.field };
    const row = el.closest('tr[data-route]');
    if (row) return { kind: 'route', id: row.dataset.route, field: null };
    const rail = el.closest('.rail-row[data-drag][data-id]');
    if (rail) return { kind: rail.dataset.drag, id: rail.dataset.id, field: null };
    const tpl = el.closest('.tpl-head[data-tpl]');
    if (tpl) return { kind: 'template', id: tpl.dataset.tpl, field: null };
    return null;
  }
  const message = (extra = {}) => ({
    schema: typeof Store !== 'undefined' ? Store.SCHEMA : 0,
    who: { id: myId, name: myName(), color: myColour() },
    tab: currentTab(),
    at: whereAt(),
    t: Date.now(),
    ...extra,
  });
  const saying = (m) => JSON.stringify([m.who.name, m.who.color, m.tab, m.at]);

  // A move, a tab, a name: sent once the focus has settled (a redraw takes it
  // away and puts it back within the same task), never more often than
  // SEND_GAP, and always the last one. Only what changed is sent, unless
  // `force` (joining, the heartbeat, someone new to answer).
  function queue(force = false) {
    if (!isLive()) return;
    if (force) forced = true;
    if (sendTimer) return;
    sendTimer = setTimeout(flush, Math.max(0, lastSendAt + SEND_GAP - Date.now()));
  }
  function flush() {
    sendTimer = null;
    if (!isLive()) { forced = false; return; }
    const m = message();
    const says = saying(m);
    lastAt = m.at;
    if (!forced && says === lastSent) return;
    forced = false;
    lastSent = says;
    lastSendAt = Date.now();
    // Not sent (the connection went meanwhile): the next move says it again.
    Promise.resolve(api.send(m)).then((ok) => { if (!ok && lastSent === says) lastSent = null; }, () => { if (lastSent === says) lastSent = null; });
  }

  /* ---------- receiving: who else is here ---------- */
  const FORGET = 45000;        // gone quiet this long (by this PC's clock): gone
  const others = new Map();    // who.id -> { name, color, tab, at, heard }
  const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
  const tabLabel = (t) => (t ? document.querySelector(`.tabs [data-act="tab"][data-tab="${CSS.escape(t)}"]`)?.textContent.trim() || '' : '');
  function placeOf(at) {
    if (!at || typeof at !== 'object') return null;
    const kind = str(at.kind, 40);
    if (!kind) return null;
    return { kind, id: kind === 'meta' ? null : str(at.id, 200), field: str(at.field, 60) };
  }

  // After who is here changed: the marks again, and the bar's words. The
  // words are put into the pill as the app left it (its text, then ' · ' and
  // what pillText() last gave it), never by redrawing the screen: someone
  // coming, going or changing tab must not redraw the page of the one
  // working. A pill not as left (it cannot be, short of a change to the app)
  // is the app's to draw again.
  let given = '';
  function patchPill() {
    const now = words();
    if (now === given) return;
    const pill = document.getElementById('syncStatus');
    const tail = given ? ` \u00b7 ${given}` : '';
    if (!pill) { given = now; return; }
    if (tail && !pill.textContent.endsWith(tail)) { api.rerender(); return; }
    const base = tail ? pill.textContent.slice(0, -tail.length) : pill.textContent;
    pill.textContent = now ? `${base} \u00b7 ${now}` : base;
    given = now;
  }
  function redraw() {
    if (!api) return;
    decorate();
    patchPill();
  }

  function receive(plain) {
    try {
      const who = plain && typeof plain === 'object' ? plain.who : null;
      const id = who && str(who.id, 64);
      if (!id || id === myId || !isLive()) return;
      if (plain.bye === true) { if (others.delete(id)) redraw(); return; }
      const fresh = !others.has(id);
      const tab = str(plain.tab, 40);
      others.set(id, {
        name: cleanName(who.name) || 'Someone',
        color: KEYS.includes(who.color) ? who.color : colourOf(id),
        tab: tab && tabLabel(tab) ? tab : null,
        at: placeOf(plain.at),
        heard: Date.now(),
      });
      // Someone new hears where this browser is now, not in 20 s.
      if (fresh) queue(true);
      redraw();
    } catch { /* a message this build cannot read is nobody */ }
  }

  // Once a second: joining (or back online) says where this browser is at
  // once, and the heartbeat keeps saying it. Offline, or no longer live,
  // nobody else is here; one gone quiet too long has gone.
  function tick() {
    const live = isLive();
    if (live && !wasLive) queue(true);
    if (!live && wasLive) lastSent = null;
    wasLive = live;
    if (live && Date.now() - lastSendAt >= HEARTBEAT) queue(true);
    if (!others.size) return;
    const now = Date.now();
    let gone = false;
    for (const [id, p] of others) if (!live || now - p.heard > FORGET) { others.delete(id); gone = true; }
    if (gone) redraw();
  }

  function listen() {
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || !el.dataset || el.dataset.presenceSet !== 'name') return;
      Store.setPref('presenceName', el.value.slice(0, NAME_MAX) || null);
      queue();
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (!el || !el.dataset || el.dataset.presenceSet !== 'color' || !KEYS.includes(el.value)) return;
      Store.setPref('presenceColor', el.value);
      queue();
    });
    document.addEventListener('focusin', () => { queue(); renote(); });
    document.addEventListener('focusout', () => { queue(); renote(); });
    // Leaving: said at once, as far as the page lets it (the lock may finish
    // after the page has gone; then the other screen lets go after a while).
    window.addEventListener('pagehide', () => { if (isLive()) { try { api.send(message({ at: null, bye: true })); } catch { /* gone */ } } });
    setInterval(tick, 1000);
  }

  // attach(api): keep the app's hooks and start listening. Nothing of the
  // api is called from here: the app is still starting.
  function attach(hooks) {
    api = hooks;
    listen();
  }

  /* ---------- the marks ----------
   A row someone else is in: tinted in their colour, with their name in a tag
   at its start; the box they are in: a ring in their colour. Classes and two
   data-presence-* attributes only, on the row and its first and last cells,
   never on a box (the app finds the focused box again by its data-* attributes after a
   redraw), and the tag is drawn by CSS (::before), absolutely placed and
   deaf to the pointer: nothing moves, nothing takes a click or the focus. */
  // The rows a place can be in: a route on the Day plan, a driver or car on
  // its rail, a row of the Drivers, Cars and Positions tabs, a template card.
  const ROWS = '#tab-plan tbody tr[data-route], .rail-row, #tab-drivers tbody tr, #tab-cars tbody tr, #tab-positions tbody tr, .tpl-head[data-tpl]';
  const MARKED = '.presence-row, .presence-box, [data-presence-who], [data-presence-note]';
  const COLOURS = KEYS.map((k) => `pr-c-${k}`);
  function unmark() {
    for (const el of document.querySelectorAll(MARKED)) {
      el.classList.remove('presence-row', 'presence-box', ...COLOURS);
      el.removeAttribute('data-presence-who');
      el.removeAttribute('data-presence-note');
    }
  }
  // Every control of the place's item on screen, whatever its box.
  function controlsOf(at) {
    if (at.kind === 'meta') return at.field ? [...document.querySelectorAll(`section.tab [data-kind="meta"][data-field="${CSS.escape(at.field)}"]`)] : [];
    if (!at.id) return [];
    return [...document.querySelectorAll(`section.tab [data-kind="${CSS.escape(at.kind)}"][data-id="${CSS.escape(at.id)}"]`)];
  }
  function rowsOf(at, controls) {
    const rows = new Set();
    const id = at.id && CSS.escape(at.id);
    if (id && at.kind === 'route') for (const r of document.querySelectorAll(`#tab-plan tbody tr[data-route="${id}"]`)) rows.add(r);
    if (id && at.kind === 'template') for (const r of document.querySelectorAll(`.tpl-head[data-tpl="${id}"]`)) rows.add(r);
    if (id) for (const r of document.querySelectorAll(`.rail-row[data-drag="${CSS.escape(at.kind)}"][data-id="${id}"]`)) rows.add(r);
    for (const el of controls) { const r = el.closest(ROWS); if (r) rows.add(r); }
    return rows;
  }
  // The start of a row, where its name tag goes, and its end, where the
  // quiet note goes. A rail row or a template card is too narrow for both:
  // there the note takes the tag's place.
  const startOf = (r) => (r.tagName === 'TR' ? r.cells[0] : r);
  const endOf = (r) => (r.tagName === 'TR' ? r.cells[r.cells.length - 1] : r);
  const andNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
  // The rows this browser's focus is in: the one holding it, or for a row's
  // own grid or menu, the row it belongs to.
  function myRows() {
    const el = document.activeElement;
    const row = el && el !== document.body && el.closest ? el.closest(ROWS) : null;
    if (row) return new Set([row]);
    if (!el || !el.closest || !el.closest('#picker, #tagMenu, #ctxMenu, #ctxSub')) return new Set();
    const at = whereAt();
    return at ? rowsOf(at, controlsOf(at)) : new Set();
  }

  // decorate(): put the row tints, name tags, box outlines and the quiet note
  // back after a redraw. A redraw is also how the app changes tab.
  function decorate() {
    const t = currentTab();
    if (t !== lastTab) { lastTab = t; queue(); }
    unmark();
    if (!others.size || !isLive()) return;
    // Who is in each row, the one heard from last first: their colour.
    const inRow = new Map();
    const people = [...others.values()].sort((x, y) => y.heard - x.heard);
    for (const p of people) {
      if (!p.at) continue;
      const controls = controlsOf(p.at);
      for (const r of rowsOf(p.at, controls)) {
        if (!inRow.has(r)) inRow.set(r, []);
        if (!inRow.get(r).some((q) => q.name === p.name)) inRow.get(r).push(p);
      }
      if (!p.at.field) continue;
      for (const el of controls) {
        if (el.dataset.field !== p.at.field || el.classList.contains('presence-box')) continue;
        el.classList.add('presence-box', `pr-c-${p.color}`);
      }
    }
    for (const [r, ps] of inRow) {
      r.classList.add('presence-row', `pr-c-${ps[0].color}`);
      const start = startOf(r);
      if (start) start.setAttribute('data-presence-who', ps.map((p) => p.name).join(', '));
    }
    // The quiet note: in a row someone else is in, say so beside it. Never a
    // dialog, never in the way of the typing (Quiet by default).
    for (const r of myRows()) {
      const ps = inRow.get(r);
      const end = ps && endOf(r);
      if (!end) continue;
      const names = ps.map((p) => p.name);
      const what = r.classList.contains('tpl-head') ? 'this template' : 'this line';
      end.setAttribute('data-presence-note', `${andNames(names)} ${names.length > 1 ? 'are' : 'is'} editing ${what}`);
    }
  }

  // Focus moved here: the note follows at once, once the focus has settled.
  let noteTimer = null;
  function renote() {
    if (noteTimer || !others.size) return;
    noteTimer = setTimeout(() => { noteTimer = null; decorate(); }, 0);
  }

  // pillText(): who else is here, for the top bar beside the Shared plan
  // pill: 'Kari is here · Day plan'. One name once, however many tabs it has
  // open (or a tab reloaded before its goodbye got out); the tab is the one
  // heard from last. '' when nobody, or when not live.
  function pillText() {
    given = words();
    return given;
  }
  function words() {
    if (!others.size || !isLive()) return '';
    const byName = new Map();
    for (const p of others.values()) {
      const had = byName.get(p.name);
      if (!had || p.heard >= had.heard) byName.set(p.name, p);
    }
    const people = [...byName.values()];
    if (people.length === 1) {
      const where = tabLabel(people[0].tab);
      return `${people[0].name} is here${where ? ` \u00b7 ${where}` : ''}`;
    }
    const names = people.map((p) => p.name);
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are here`;
  }

  return Object.freeze({ attach, receive, decorate, settingsHtml, pillText, get api() { return api; } });
})();
