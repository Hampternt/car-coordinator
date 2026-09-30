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
  // Each step: the tab it shows, one selector for what it points at, the
  // words, and `align: 'right'` to line the card up with the target's right
  // edge.
  const STEPS = [
    { tab: 'cars', target: '#newCar', title: 'Start with your cars',
      text: 'Paste the whole fleet into this box at once, with spaces between registrations, and press Add car.' },
    { tab: 'plan', target: '#tab-plan .plan-table', title: 'Filling a route',
      text: 'Each row is one line of the sheet on the pillar.' },
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

  function place() {
    if (!hooks || at < 0) return;
    const c = card(), r = ring();
    const el = find(STEPS[at]);
    const a = el && el.getBoundingClientRect();
    c.hidden = false;
    c.style.maxHeight = '';
    if (!a || !a.width || !a.height) {
      r.hidden = true;
      c.style.left = `${window.scrollX + document.documentElement.clientWidth - c.offsetWidth - 8}px`;
      c.style.top = `${window.scrollY + barBottom() + 8}px`;
      return;
    }
    const { left, top, tall } = hooks.besideAnchor(a, c.offsetWidth, c.offsetHeight);
    c.style.maxHeight = `${tall}px`;
    c.style.left = `${left + window.scrollX}px`;
    c.style.top = `${top + window.scrollY}px`;
    r.hidden = false;
    r.style.left = `${a.left - 4 + window.scrollX}px`;
    r.style.top = `${a.top - 4 + window.scrollY}px`;
    r.style.width = `${a.width + 8}px`;
    r.style.height = `${a.height + 8}px`;
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
