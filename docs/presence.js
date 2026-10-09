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
   `who.id` is random per tab, so two tabs of one browser are two people here.
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
  const myId = randomId();
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

  // Once a second: joining (or back online) says where this browser is at
  // once, and the heartbeat keeps saying it.
  function tick() {
    const live = isLive();
    if (live && !wasLive) queue(true);
    if (!live && wasLive) lastSent = null;
    wasLive = live;
    if (live && Date.now() - lastSendAt >= HEARTBEAT) queue(true);
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
    document.addEventListener('focusin', () => queue());
    document.addEventListener('focusout', () => queue());
    // Leaving: said at once, as far as the page lets it (the lock may finish
    // after the page has gone; then the other screen lets go after a while).
    window.addEventListener('pagehide', () => { if (isLive()) { try { api.send(message({ at: null, bye: true })); } catch { /* gone */ } } });
    setInterval(tick, 1000);
  }

  // attach(api): keep the app's hooks and start listening. Nothing of the
  // api is called from here: the app is still starting.
  function attach(given) {
    api = given;
    listen();
  }

  // receive(plain): another tab's or PC's presence. Ignores its own id.
  function receive(plain) { void plain; }

  // decorate(): put the row tints, name tags, box outlines and the quiet note
  // back after a redraw. A redraw is also how the app changes tab.
  function decorate() {
    const t = currentTab();
    if (t !== lastTab) { lastTab = t; queue(); }
  }

  // pillText(): who else is here, for the top bar beside the Shared plan pill.
  function pillText() { return ''; }

  return Object.freeze({ attach, receive, decorate, settingsHtml, pillText, get api() { return api; } });
})();
