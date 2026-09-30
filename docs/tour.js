'use strict';
/* The first-use tour: a card that walks through the app one thing at a time,
   with a ring round the thing it is about.

   It only points. It never writes the plan, the backups or the save file:
   tabs are switched through the app's own hook (set the tab, redraw), never
   by a click, because a click reaches save(); its buttons carry data-tour,
   never data-act, so the app's click handler never sees them. Its one write
   is this browser's pref carcoord:pref:tour, when it ends.

   Only go() scrolls or moves the focus. place() measures and positions, and
   runs on every redraw of the page, the unprompted ones included, so it does
   nothing at all while the tour is closed.

   Only Tour is declared at the top level: this loads as a classic script
   beside app.js, and a top-level name of its own could clash with app.js's
   and stop the app from starting. */
const Tour = (() => {
  /* Each step: the tab it shows, one selector for what it points at, the
     words, and `align: 'right'` to line the card up with the target's right
     edge. The words name what is on screen exactly as it reads there.

     ANY CHANGE THAT MOVES OR RENAMES A TARGET UPDATES THESE STEPS IN THE SAME
     COMMIT. The ids they use (#addCarBar, #addDriverBar, #planBar, #planTemplates,
     #planMap, #fileCard, #backupsCard) are there for the tour; scripts/tour.mjs fails as soon as a
     selector stops matching exactly one thing that can be seen. */
  const STEPS = [
    { tab: 'cars', target: '#addCarBar', title: 'Cars',
      text: 'Your fleet. Every registration here becomes a choice for a route on the day plan. A status label such as Workshop or Out of service marks a car that should stay home: it can still be picked, but the plan warns about it, and the printed sheet can list it under Cars not available.' },
    { tab: 'positions', target: '#tab-positions tbody tr:first-child', title: 'Positions',
      text: 'The packing spots where cars are loaded: Spot 1 to 5, the Gate and the Garage to begin with. Many cars marks a spot several routes can share. A spot can carry a status too, such as closed for resurfacing.' },
    { tab: 'drivers', target: '#addDriverBar', title: 'Drivers',
      text: 'The people who drive. In or Away says who is working today. Usual days (Mon to Fri) make up each weekday\'s crew. A driver tag, such as Sick, Holiday or Course, with a note, says why someone is off; driver tags are their own list, apart from the car labels.' },
    { tab: 'plan', target: '#tab-plan .plan-table tbody tr:first-child', title: 'The day plan',
      text: 'Each row is one line of the sheet on the pillar: the route, its driver, car, packing position and round. Mark prints the row pink and Gap leaves a blank line above it. Right-click a row, a driver or a car for everything else it can do, such as moving a route to a free spot.' },
    { tab: 'plan', target: '#planBar', title: 'The date and the warnings',
      text: 'The date prints at the top of the sheet and is normally the next working day; the line under it says when it is not. A car on two routes, a spot taken twice in one round, or a car marked Workshop is listed in amber above the plan. Nothing is ever blocked: sometimes it is meant.' },
    { tab: 'plan', target: '#planTemplates', title: 'Templates and the week',
      text: 'A day template is a saved copy of a whole plan, such as how Monday usually runs, ready to load again. Under the templates, the week shows each weekday\'s crew; Load makes that crew the ones in today.' },
    { tab: 'plan', target: '#planMap .parking', title: 'The parking map',
      text: 'The yard as it is laid out, with the routes packed at each spot, round by round. A spot taken twice in one round turns red. Positions the map does not know are listed under it.' },
    { tab: 'preview', target: '.topbar [data-act="print"]', title: 'Printing',
      text: 'Print preview shows exactly what goes on paper: the routes, the date with its weekday, and the free cars. Print / save PDF opens the print dialog; Microsoft Print to PDF makes a file.' },
    { tab: 'data', target: '#shareCard > h3:first-child', align: 'right', title: 'Sending the list to another PC',
      text: 'Copy the day plan turns the list into a code to paste into a chat or an email; nothing is uploaded, the code is the list. The other PC pastes it under Load a list someone sent you and sees what it holds before anything changes.' },
    { tab: 'data', target: '#fileCard > h3', align: 'right', title: 'Where your data lives',
      text: 'Everything is kept in this browser, on this PC. A save file (OneDrive, a network drive, a stick) keeps a second copy of every change outside the browser. After a restart the card asks to Reconnect; on a new PC, Open an existing file brings the plan back.' },
    { tab: 'data', target: '#backupsCard > h3', align: 'right', title: 'Backups and Archives',
      text: 'A backup is taken the first time the app opens each day and before anything is cleared or deleted; the last 12 are kept, and Restore puts one back. Archives, above, keep an untouched copy from before every update. Export a copy is the way to keep one for good.' },
  ];

  let hooks = null;     // from app.js: showTab, tab, closeLayers, besideAnchor, setPref
  let at = -1;          // the step showing; -1 while the tour is closed
  let from = null;      // { tab, opener }: where it was started, to go back to

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const card = () => document.getElementById('tour');
  const ring = () => document.getElementById('tourRing');
  const barBottom = () => document.querySelector('.topbar').getBoundingClientRect().bottom;
  const find = (step) => { try { return document.querySelector(step.target); } catch { return null; } };

  function draw() {
    const step = STEPS[at];
    const last = at === STEPS.length - 1;
    card().innerHTML = `<p class="tour-count">${at + 1} of ${STEPS.length}</p>
      <h3 id="tourTitle">${esc(step.title)}</h3>
      <p>${esc(step.text)}</p>
      ${at === 0 ? '<p class="tour-extra">The tour only points at things. Anything you type while it is open is saved as usual.</p>' : ''}
      ${last ? '<p class="tour-extra">Open this tour again any time from the Tour button, right of Print in the top bar.</p>' : ''}
      <div class="tour-acts">
        <button type="button" class="btn" data-tour="back"${at === 0 ? ' disabled' : ''}>Back</button>
        <button type="button" class="btn primary-ish" data-tour="next">${last ? 'Done' : 'Next'}</button>
        <button type="button" class="btn" data-tour="end">Skip tour</button>
      </div>`;
  }

  // Scrolls the page just far enough to bring the target out from under the
  // top bar, or up from below the bottom of the screen.
  function bringIntoView(el) {
    if (el.closest('.topbar')) return;
    const a = el.getBoundingClientRect();
    const top = barBottom() + 8;
    if (a.top < top) window.scrollBy(0, a.top - top);
    else if (a.bottom > window.innerHeight - 8) window.scrollBy(0, Math.min(a.bottom - window.innerHeight + 8, a.top - top));
  }

  function go(i) {
    if (!hooks || i < 0 || i >= STEPS.length) return;
    at = i;
    draw();
    hooks.showTab(STEPS[i].tab);
    const el = find(STEPS[i]);
    if (el) bringIntoView(el);
    place();
    card().querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  /* The card beside its target, lined up with the target's right edge for a
     step that says so or a target on the right half of the window; the ring
     round the target, cut to the window and to below the top bar (unless the
     target is in the bar). No target, or one with no size (its tab is not
     showing), gives no ring and a card under the bar at the right. */
  function place() {
    if (!hooks || at < 0) return;
    const c = card(), r = ring();
    const step = STEPS[at];
    const el = find(step);
    const a = el && el.getBoundingClientRect();
    const seen = !!a && a.width > 0 && a.height > 0;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const bar = barBottom();
    // Moved to the top of the screen before it is shown and measured, and
    // the ring moved before it is shown: either one left where the last step
    // put it, further down a longer tab, stretched the page for a moment,
    // and the browser moved the page with it.
    c.style.top = `${window.scrollY}px`;
    c.style.maxHeight = '';
    c.hidden = false;
    const w = c.offsetWidth, h = c.offsetHeight;
    let left, top, tall;
    if (seen) {
      const right = step.align === 'right' || a.left + a.width / 2 > vw / 2;
      ({ left, top, tall } = hooks.besideAnchor(a, w, h, right));
      // besideAnchor keeps a card opened upwards clear of the bar, but not
      // one opened downwards: a target scrolled up under the bar, or in it,
      // would carry the card over the tabs.
      if (top < bar + 8) { top = bar + 8; tall = Math.min(h, vh - 8 - top); }
      // No room beside it at all (a target taller than the space left, or
      // scrolled to fill the window): the card goes to the top or the bottom
      // of the window, whichever is further from the target's middle, and
      // covers the least of it.
      if (tall < Math.min(h, 120) || top + tall > vh - 8) {
        tall = Math.min(h, vh - 16 - bar);
        top = a.top + a.height / 2 > (bar + vh) / 2 ? bar + 8 : vh - 8 - tall;
      }
    } else {
      left = Math.max(8, vw - w - 8);
      top = bar + 8;
      tall = Math.min(h, vh - 8 - top);
    }
    c.style.maxHeight = `${Math.max(0, tall)}px`;
    c.style.left = `${left + window.scrollX}px`;
    c.style.top = `${top + window.scrollY}px`;
    if (!seen) { r.hidden = true; return; }
    const ceiling = el.closest('.topbar') ? 0 : bar;
    const x1 = Math.max(0, a.left - 4), y1 = Math.max(ceiling, a.top - 4);
    const x2 = Math.min(vw, a.right + 4), y2 = Math.min(vh, a.bottom + 4);
    if (x2 - x1 < 1 || y2 - y1 < 1) { r.hidden = true; return; }
    r.style.left = `${x1 + window.scrollX}px`;
    r.style.top = `${y1 + window.scrollY}px`;
    r.style.width = `${x2 - x1}px`;
    r.style.height = `${y2 - y1}px`;
    r.hidden = false;
  }

  function start(opener) {
    if (!hooks) return;
    hooks.closeLayers();
    from = { tab: hooks.tab(), opener: opener || null };
    go(0);
  }

  /* Done, Skip tour and Escape all end here: the tab it started on again,
     the pref written (a write that fails only means the offer comes back),
     and the focus back where it was, or on the Tour button, or on the tab. */
  function end() {
    if (at < 0) return;
    at = -1;
    const c = card();
    c.hidden = true;
    c.innerHTML = '';
    ring().hidden = true;
    try { hooks.setPref('tour', 'done'); } catch { /* the offer returns next time */ }
    const back = from || { tab: hooks.tab(), opener: null };
    from = null;
    hooks.showTab(back.tab);
    const to = (back.opener && back.opener.isConnected && back.opener)
      || document.querySelector('.topbar [data-act="tour"]')
      || document.querySelector('.tabs button.active');
    to?.focus({ preventScroll: true });
  }

  const shown = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden; };

  function init(h) {
    // A page without the card (an index.html from before the tour) has no
    // tour: every call stays a no-op, and start() carries on.
    if (!card() || !ring()) return;
    hooks = h;
    card().addEventListener('click', (e) => {
      const b = e.target.closest('[data-tour]');
      if (!b || b.disabled) return;
      const act = b.dataset.tour;
      if (act === 'back') go(at - 1);
      else if (act === 'next') { if (at === STEPS.length - 1) end(); else go(at + 1); }
      else end();
    });
    /* Escape ends it, unless something above it takes Escape first: the car
       grid, the tag menu, a right-click menu (each calls preventDefault) or
       the share dialog, which closes itself. The arrows step only while the
       focus is in the card, so every box and list keeps its own. No trap:
       Tab leaves the card as it leaves anything else. */
    document.addEventListener('keydown', (e) => {
      if (at < 0) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented || shown('#picker') || shown('#tagMenu') || shown('#ctxMenu') || document.getElementById('shareDlg')?.open) return;
        e.preventDefault();
        end();
        return;
      }
      if (!card().contains(e.target)) return;
      if (e.key === 'ArrowRight' && at < STEPS.length - 1) { e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowLeft' && at > 0) { e.preventDefault(); go(at - 1); }
    });
    // The page scrolling or the window changing size carries the target
    // away from the card; follow it, without scrolling anything.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  }

  return { STEPS, start, go, end, place, init, get open() { return at >= 0; } };
})();
