// The app window: Open → Check → Configure → Print.
//
// Four steps, in the order the work happens. The file is read in this browser
// and never leaves the PC; the only thing that outlives a session is the crate
// rules, which are facts about the warehouse rather than decisions about
// today's print (D22).

'use strict';

(() => {
  const $ = (id) => document.getElementById(id);

  const STEPS = ['open', 'check', 'configure', 'print'];

  /** How much room each bread takes is remembered, and which breads need the
   *  pickers' attention (the owner, 2026-10-01); nothing else is. */
  const CRATE_KEY = 'breadify:crates:v1';
  const ATTENTION_KEY = 'breadify:attention:v1';

  const state = {
    filename: '',
    rows: null,
    /** What the filename said, before any override. */
    detected: null,
    findings: [],
    routes: [],
    selected: new Set(),
    step: 'open',
    reached: new Set(['open']),
    settings: {
      kind: Model.BREAD,
      showOrderId: true,
      crates: Model.defaultCrateRules(),
      /** Product ids to print with a warning triangle, wherever they appear. */
      attention: new Set(),
    },
  };

  /** Each marked bread's name as last seen, kept for a person reading the
   *  stored list back; the app goes by the id. */
  let attentionLabels = {};

  // ── Remembering the crate rules (D22) ──────────────────────────────────

  /**
   * The rules are read back defensively: anything unparseable is skipped
   * rather than refused, because a settings file is never worth failing a
   * print over.
   */
  function loadCrateRules() {
    const rules = Model.defaultCrateRules();
    try {
      const stored = JSON.parse(localStorage.getItem(CRATE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return rules;
      if (Number.isFinite(stored.largeCapacity) && stored.largeCapacity >= 1) {
        rules.largeCapacity = Math.trunc(stored.largeCapacity);
      }
      if (Number.isFinite(stored.smallCapacity) && stored.smallCapacity >= 1) {
        rules.smallCapacity = Math.trunc(stored.smallCapacity);
      }
      for (const [id, size] of Object.entries(stored.sizePercent || {})) {
        if (Number.isFinite(size) && size > 0 && size !== Model.STANDARD_SIZE) {
          rules.sizePercent[id] = Math.trunc(size);
        }
      }
    } catch {
      // A browser with storage switched off still prints; it just forgets.
    }
    return rules;
  }

  // ── Remembering the breads that need attention ─────────────────────────

  /**
   * A bread the pickers often get wrong — a name close to another's, say — is
   * marked once on Configure and printed with a warning triangle from then
   * on, like the crate sizes: a fact about the warehouse, kept on this PC.
   * Read back defensively, like them: anything unreadable is skipped.
   */
  function loadAttention() {
    const ids = new Set();
    try {
      const stored = JSON.parse(localStorage.getItem(ATTENTION_KEY) || 'null');
      if (stored && Array.isArray(stored.ids)) {
        for (const id of stored.ids) if (Number.isFinite(id)) ids.add(id);
      }
      if (stored && stored.labels && typeof stored.labels === 'object') attentionLabels = { ...stored.labels };
    } catch {
      // A browser with storage switched off still prints; it just forgets.
    }
    return ids;
  }

  function saveAttention() {
    try {
      const labels = {};
      for (const id of state.settings.attention) {
        const product = productsById().get(id);
        labels[id] = product ? product.name : attentionLabels[id] || '';
      }
      attentionLabels = labels;
      localStorage.setItem(ATTENTION_KEY, JSON.stringify({ ids: [...state.settings.attention], labels }));
    } catch {
      // Nothing to do: the print itself does not depend on this.
    }
  }

  function saveCrateRules() {
    try {
      // Each size carries its bread's name as a label the app ignores, so the
      // person who set the numbers can read them back.
      const labels = {};
      for (const id of Object.keys(state.settings.crates.sizePercent)) {
        const product = productsById().get(Number(id));
        if (product) labels[id] = product.name;
      }
      localStorage.setItem(
        CRATE_KEY,
        JSON.stringify({ ...state.settings.crates, labels }),
      );
    } catch {
      // Nothing to do: the print itself does not depend on this.
    }
  }

  // ── Reading a file ─────────────────────────────────────────────────────

  async function load(file) {
    $('openError').hidden = true;
    try {
      const book = await Xlsx.open(await file.arrayBuffer());
      const sheet = await book.sheet(Model.SHEET_NAME);
      const rows = Model.readRows(sheet);

      state.filename = file.name;
      state.rows = rows;
      state.detected = Model.fromFilename(file.name);
      state.settings.kind = state.detected.kind;
      revalidate();
      state.reached = new Set(STEPS);
      go('check');
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      $('openError').textContent = `That file could not be read: ${message}`;
      $('openError').hidden = false;
    }
  }

  /**
   * Re-runs the checks and re-folds the data.
   *
   * What counts as *familiar* depends on which list this is, so flipping the
   * kind re-validates on the spot as well as re-paginating (F10).
   */
  function revalidate() {
    state.findings = Validate.run(state.rows, state.settings.kind);
    state.routes = Model.group(Model.fold(state.rows));
    state.selected = new Set(state.routes.map((route) => route.nickname));
  }

  function productsById() {
    const products = new Map();
    for (const route of state.routes) {
      for (const order of route.orders) {
        for (const line of order.lines) products.set(line.product.id, line.product);
      }
    }
    return products;
  }

  function dates() {
    return state.detected ? state.detected.dates : null;
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  function go(step) {
    // A tick's update still waiting lands while its preview can be laid out.
    if (state.step === 'print') flush();
    state.step = step;
    state.reached.add(step);
    for (const name of STEPS) {
      $(`step-${name}`).hidden = name !== step;
    }
    // The Open step's joke only lands while nothing has been opened, which is
    // the one moment in the day when there is, in fact, no bread.
    $('step-open').classList.toggle('empty-handed', !state.rows);
    for (const button of $('steps').querySelectorAll('button')) {
      const name = button.dataset.step;
      button.disabled = !state.reached.has(name);
      if (name === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }

    if (step === 'check') renderCheck();
    if (step === 'configure') renderConfigure();
    if (step === 'print') renderPrint();
    renderActions();
    window.scrollTo(0, 0);
  }

  function blockingCount() {
    return state.findings.filter((finding) => finding.severity === Validate.BLOCKING).length;
  }

  function renderActions() {
    const back = $('back');
    const advance = $('advance');
    const blocked = $('blocked');
    const index = STEPS.indexOf(state.step);

    back.hidden = index < 1;
    back.onclick = () => go(STEPS[index - 1]);

    if (state.step === 'print') {
      advance.hidden = true;
      blocked.hidden = true;
      return;
    }

    advance.hidden = state.step === 'open' && !state.rows;
    advance.textContent =
      state.step === 'check'
        ? blockingCount() === 0
          ? 'Continue'
          : 'Continue anyway'
        : state.step === 'configure'
          ? 'Preview sheets'
          : 'Continue';
    advance.onclick = () => go(STEPS[index + 1]);

    const count = blockingCount();
    blocked.hidden = !(state.step === 'check' && count > 0);
    blocked.textContent =
      count === 1
        ? '1 finding would make the printed pages wrong.'
        : `${count} findings would make the printed pages wrong.`;
  }

  // ── 02 Check ───────────────────────────────────────────────────────────

  function renderCheck() {
    const kind = state.settings.kind;
    const mode = $('mode');
    mode.dataset.kind = kind;
    for (const button of mode.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
    }
    $('modeWhy').textContent = state.detected.named
      ? `Read from the filename — ${state.filename}`
      : `The filename says nothing, so it is read as bread — ${state.filename}`;

    // Stops are blocks: a customer's orders at one stop count once.
    const stops = state.routes.reduce((sum, route) => sum + route.stops.length, 0);
    const lines = state.routes.reduce((sum, route) => sum + Model.lineCount(route), 0);
    const stats = [
      [state.routes.length, 'routes'],
      [stops, 'stops'],
      [lines, 'lines'],
      [Model.formatDates(dates()), 'delivery'],
    ];
    $('stats').replaceChildren(
      ...stats.map(([value, label]) => {
        const card = document.createElement('div');
        card.className = 'stat';
        const strong = document.createElement('b');
        strong.textContent = value;
        const span = document.createElement('span');
        span.textContent = label;
        card.append(strong, span);
        return card;
      }),
    );

    const findings = $('findings');
    if (state.findings.length === 0) {
      const clean = document.createElement('p');
      clean.className = 'clean';
      clean.textContent =
        'Nothing to report — the file matches every rule the printed page relies on.';
      findings.replaceChildren(clean);
      return;
    }

    findings.replaceChildren(
      ...state.findings.map((finding) => {
        const box = document.createElement('details');
        box.className = 'finding';
        box.dataset.severity = finding.severity;

        const summary = document.createElement('summary');
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = finding.severity;
        summary.append(tag, document.createTextNode(finding.headline));

        const detail = document.createElement('p');
        detail.textContent = finding.detail;
        box.append(summary, detail);

        if (finding.rows.length > 0) {
          const rows = document.createElement('p');
          rows.className = 'rows';
          const shown = finding.rows.slice(0, 24).join(', ');
          rows.textContent =
            `Worksheet row${finding.rows.length === 1 ? '' : 's'}: ${shown}` +
            (finding.rows.length > 24 ? ` … and ${finding.rows.length - 24} more` : '');
          box.append(rows);
        }
        return box;
      }),
    );
  }

  // ── 03 Configure ───────────────────────────────────────────────────────

  /**
   * Every bread in today's file, A to Z, each with a Pay attention tick; a
   * find box narrows a long list, and the marked ones this file does not
   * carry are named underneath so none is forgotten. Bread and freezer
   * alike: a freezer line can be picked wrong too.
   */
  function renderAttention() {
    const products = Array.from(productsById().values()).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    const find = $('attentionFind').value.trim().toLowerCase();
    $('attentionList').replaceChildren(
      ...products
        .filter((product) => !find || product.name.toLowerCase().includes(find))
        .map((product) => {
          const row = document.createElement('label');
          row.className = 'attention';
          const tick = document.createElement('input');
          tick.type = 'checkbox';
          tick.checked = state.settings.attention.has(product.id);
          row.dataset.on = String(tick.checked);
          tick.onchange = () => {
            if (tick.checked) state.settings.attention.add(product.id);
            else state.settings.attention.delete(product.id);
            row.dataset.on = String(tick.checked);
            saveAttention();
            renderAttentionCount();
          };
          const name = document.createElement('span');
          name.className = 'attention-name';
          name.textContent = product.name;
          name.title = product.name;
          row.append(tick, name);
          return row;
        }),
    );
    renderAttentionCount();
  }

  function renderAttentionCount() {
    const here = productsById();
    const marked = [...state.settings.attention];
    const elsewhere = marked.filter((id) => !here.has(id)).map((id) => attentionLabels[id] || `product ${id}`);
    $('attentionCount').textContent = marked.length
      ? `${marked.length} marked on this PC.${elsewhere.length ? ` Not in this file: ${elsewhere.join(', ')}.` : ''}`
      : 'None marked yet.';
  }

  function renderConfigure() {
    const bread = state.settings.kind === Model.BREAD;
    $('showOrderId').checked = state.settings.showOrderId;
    renderAttention();

    // Nothing on a freezer sheet reads the crate sizes (F4), so the step does
    // not offer them there.
    $('cratePane').hidden = !bread;
    if (!bread) return;

    $('largeCapacity').value = state.settings.crates.largeCapacity;
    $('smallCapacity').value = state.settings.crates.smallCapacity;

    const products = Array.from(productsById().values()).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

    $('sizes').replaceChildren(
      ...products.map((product) => {
        const percent = Model.sizeOf(state.settings.crates, product.id);
        const row = document.createElement('div');
        row.className = 'size';
        row.dataset.custom = String(percent !== Model.STANDARD_SIZE);

        const name = document.createElement('span');
        name.className = 'size-name';
        name.textContent = product.name;
        name.title = product.name;

        const value = document.createElement('span');
        value.className = 'size-value';
        value.textContent = Model.spokenSize(percent);

        const select = document.createElement('select');
        for (const [label, size] of Model.SIZE_PRESETS) {
          const option = document.createElement('option');
          option.value = String(size);
          option.textContent = label;
          if (size === percent) option.selected = true;
          select.append(option);
        }
        select.onchange = () => {
          Model.setSize(state.settings.crates, product.id, Number(select.value));
          saveCrateRules();
          renderConfigure();
        };

        row.append(name, value, select);
        return row;
      }),
    );
  }

  // ── 04 Print ───────────────────────────────────────────────────────────

  let built = [];

  /**
   * Each route's sheets once laid out, by nickname, so a tick lays out only
   * the route it adds and an untick lays out nothing (the owner, 2026-10-01:
   * "it takes a long time to load after unselected a route"). Every tick used
   * to lay the whole day out again, about 130 ms on the bread sample.
   *
   * Emptied whenever the Print step is entered: the file, the kind, the crate
   * sizes and the Pay attention marks can only change on the other steps, and
   * every one of them changes what a sheet says.
   */
  const laid = new Map();

  /**
   * Quick clicks gather into one update: the tick shows at once, and the
   * preview follows after this pause, so ten unticks lay out nothing ten
   * times. Printing never waits it out — it brings the update forward.
   */
  const PREVIEW_PAUSE = 150;
  let pending = null;

  /** How much the preview draws the sheets down to fit the window. */
  let scale = 1;

  function renderPrint() {
    laid.clear();
    clearTimeout(pending);
    pending = null;
    const routes = $('routes');
    routes.replaceChildren(
      ...state.routes.map((route) => {
        const row = document.createElement('label');
        row.className = 'route';

        const tick = document.createElement('input');
        tick.type = 'checkbox';
        tick.checked = state.selected.has(route.nickname);
        tick.onchange = () => {
          if (tick.checked) state.selected.add(route.nickname);
          else state.selected.delete(route.nickname);
          later();
        };

        const name = document.createElement('span');
        name.className = 'route-name';
        name.textContent = `Route ${route.nickname}`;

        const meta = document.createElement('span');
        meta.className = 'route-meta';
        const unplaced = Model.unsequencedStops(route).length;
        meta.textContent =
          `${route.stops.length} stops · ${Model.lineCount(route)} lines` +
          (unplaced > 0 ? ` · ${unplaced} unplaced` : '');

        row.append(tick, name, meta);
        return row;
      }),
    );
    rebuild();
    scalePreview();
  }

  /** A tick changed: the preview follows after the pause, once for a run of clicks. */
  function later() {
    clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      rebuild();
    }, PREVIEW_PAUSE);
    $('printSummary').textContent = 'Updating preview…';
  }

  /** Brings a waiting update forward, so what prints is what is ticked. */
  function flush() {
    if (pending === null) return;
    clearTimeout(pending);
    pending = null;
    rebuild();
  }

  /**
   * Lays out the ticked routes it does not already have — all of them in one
   * go — and shows the ticked ones.
   *
   * A route's sheets do not depend on any other route's (D1: each starts a
   * fresh page), so the ones already laid out are exactly what a full
   * rebuild would make.
   */
  function rebuild() {
    clearTimeout(pending);
    pending = null;
    const chosen = state.routes.filter((route) => state.selected.has(route.nickname));
    const missing = chosen.filter((route) => !laid.has(route.nickname));
    const context = {
      dates: dates(),
      source: Model.sourceLabel(state.filename, dates()),
    };

    try {
      if (missing.length > 0) {
        const sheets = Sheet.day(missing, state.settings, context, {});
        const byRoute = new Map(missing.map((route) => [route.nickname, []]));
        for (const sheet of sheets) byRoute.get(sheet.dataset.route).push(sheet);
        for (const [nickname, own] of byRoute) laid.set(nickname, own);
      }
    } catch (error) {
      // The layout throws on a value it cannot print correctly. Nothing
      // printing is the safe outcome; a sheet with something wrong on it is
      // not.
      built = [];
      $('preview').replaceChildren();
      const message = error && error.message ? error.message : String(error);
      $('printSummary').textContent =
        `The sheets could not be laid out, so nothing will print: ${message}`;
      $('print').disabled = true;
      return;
    }
    built = chosen.flatMap((route) => laid.get(route.nickname));
    showSheets();

    const routeWord = chosen.length === 1 ? 'route' : 'routes';
    const sheetWord = built.length === 1 ? 'sheet' : 'sheets';
    $('printSummary').textContent =
      `${chosen.length} ${routeWord} · ${built.length} ${sheetWord} of A4.`;
    $('print').disabled = built.length === 0;
  }

  /**
   * Puts `built` in the preview, touching only what changed: an unticked
   * route's sheets are taken out and a ticked one's put in at its place, and
   * every other sheet stays where it is, never laid out again.
   */
  function showSheets() {
    const preview = $('preview');
    const wanted = new Set(built);
    for (const node of Array.from(preview.children)) {
      if (!wanted.has(node)) node.remove();
    }
    let at = preview.firstElementChild;
    for (const sheet of built) {
      if (sheet === at) {
        at = at.nextElementSibling;
        continue;
      }
      sheet.style.zoom = scale === 1 ? '' : String(scale);
      preview.insertBefore(sheet, at);
    }
  }

  /**
   * Fits the sheets to the window without re-typesetting them: the drawing is
   * scaled, the type is not. A preview that re-flowed would stop being one.
   *
   * Measured when the step opens and when the window changes size; a sheet
   * put in by a tick takes the scale already found.
   */
  function scalePreview() {
    const preview = $('preview');
    const probe = document.createElement('div');
    probe.style.width = '210mm';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.append(probe);
    const sheetWidth = probe.getBoundingClientRect().width;
    probe.remove();

    const room = preview.clientWidth;
    scale = room > 0 && sheetWidth > room ? room / sheetWidth : 1;
    for (const sheet of built) sheet.style.zoom = scale === 1 ? '' : String(scale);
  }

  /** The Print button and Ctrl+P alike: a waiting update first, then the dialog. */
  function printNow() {
    flush();
    window.print();
  }

  // Printing takes the sheets out of the preview so the page can be hidden
  // wholesale, and puts them back afterwards. One set of nodes, never two.
  // A print from the browser's own menu bypasses printNow(), so the waiting
  // update is brought forward here too.
  window.addEventListener('beforeprint', () => {
    flush();
    for (const sheet of built) sheet.style.zoom = '';
    $('sheets').replaceChildren(...built);
  });
  window.addEventListener('afterprint', () => {
    $('preview').replaceChildren(...built);
    scalePreview();
  });

  // ── Wiring ─────────────────────────────────────────────────────────────

  function wire() {
    state.settings.crates = loadCrateRules();
    state.settings.attention = loadAttention();
    $('attentionFind').oninput = renderAttention;

    const drop = $('drop');
    $('choose').onclick = () => $('file').click();
    $('file').onchange = () => {
      if ($('file').files[0]) load($('file').files[0]);
    };

    for (const name of ['dragenter', 'dragover']) {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.add('over');
      });
    }
    for (const name of ['dragleave', 'drop']) {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.remove('over');
      });
    }
    drop.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (file) load(file);
    });

    for (const button of $('steps').querySelectorAll('button')) {
      button.onclick = () => {
        if (state.reached.has(button.dataset.step)) go(button.dataset.step);
      };
    }

    // F10: the override is per file — the next file opened is read from its
    // own name again.
    for (const button of $('mode').querySelectorAll('button')) {
      button.onclick = () => {
        if (state.settings.kind === button.dataset.kind) return;
        state.settings.kind = button.dataset.kind;
        revalidate();
        renderCheck();
        renderActions();
      };
    }

    $('showOrderId').onchange = () => {
      state.settings.showOrderId = $('showOrderId').checked;
    };

    for (const id of ['largeCapacity', 'smallCapacity']) {
      $(id).onchange = () => {
        const value = Math.trunc(Number($(id).value));
        if (!Number.isFinite(value) || value < 1) {
          $(id).value = state.settings.crates[id];
          return;
        }
        state.settings.crates[id] = value;
        saveCrateRules();
        renderConfigure();
      };
    }

    $('print').onclick = printNow;
    // Ctrl+P is taken over so it waits exactly as the button does.
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        printNow();
      }
    });
    window.addEventListener('resize', () => {
      if (state.step === 'print') scalePreview();
    });

    go('open');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
