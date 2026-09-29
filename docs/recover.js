'use strict';
/* The recovery page. It shares no code with the app on purpose: whatever
   stops the app from starting (a broken file, a half-updated cache, data it
   chokes on) cannot stop this. It only reads: nothing here writes to the
   browser's storage, so opening it can never make anything worse.

   It lists everything this origin holds in localStorage, the app's own keys
   first, and offers each as a file exactly as stored. Archives and backups
   are also offered entry by entry, because each of those is a whole plan
   that Import a copy... on the Data tab reads back. */
(() => {
  const list = document.getElementById('list');
  const day = new Date().toISOString().slice(0, 10);

  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const kb = (s) => `${Math.max(1, Math.round(s.length / 1024))} KB`;
  const isJson = (s) => { try { JSON.parse(s); return true; } catch { return false; } };
  const safe = (s) => String(s).replace(/[^a-z0-9.]+/gi, '-').replace(/^-+|-+$/g, '');

  function save(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: isJson(text) ? 'application/json' : 'text/plain' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function button(label, name, text, key) {
    const b = el('button', label, 'btn');
    b.type = 'button';
    b.dataset.file = name;
    if (key) b.dataset.key = key;
    b.addEventListener('click', () => save(name, text));
    return b;
  }

  let keys = [];
  const held = {};
  try {
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) held[k] = localStorage.getItem(k);
  } catch (e) {
    list.replaceChildren(el('p', `This browser would not let this page read its storage (${e && e.name ? e.name : 'refused'}). Nothing can be recovered from this page in this browser.`, 'warn'));
    return;
  }

  const WHAT = {
    'carcoord:v1': ['The plan and setup', 'Routes, templates, drivers, day groups, cars, positions and labels: everything the app shows. Import this file on the Data tab to bring it all back.', `car-coordinator-plan-${day}.json`],
    'carcoord:archives': ['Archives', 'Untouched copies taken before each update, and of a save that could not be read.', `car-coordinator-archives-${day}.json`],
    'carcoord:backups': ['Backups', 'The rolling copies taken before anything was cleared or deleted, and once a day.', `car-coordinator-backups-${day}.json`],
  };
  const order = (k) => (k in WHAT ? Object.keys(WHAT).indexOf(k) : k.startsWith('carcoord:') ? 10 : 20);
  keys = keys.sort((a, b) => order(a) - order(b) || a.localeCompare(b));

  const out = [];
  if (!keys.length) out.push(el('p', 'This browser holds nothing for Car Coordinator: no plan, no archives, no backups. If you had a save file, it is wherever you chose to keep it; open the app and use Open an existing file\u2026 on the Data tab.', 'empty'));
  else {
    const all = {};
    for (const k of keys) all[k] = held[k];
    const top = el('p');
    top.append(button('Download everything', `car-coordinator-everything-${day}.json`, JSON.stringify(all, null, 2)), ` ${keys.length} ${keys.length === 1 ? 'piece' : 'pieces'}, one file.`);
    out.push(top);
  }

  for (const k of keys) {
    const text = held[k];
    const [title, hint, name] = WHAT[k] || [k, k.startsWith('carcoord:pref:') ? 'A setting for this browser only.' : k.startsWith('carcoord:') ? 'Kept by Car Coordinator.' : 'Kept by another page on this site, such as Breadify.', `${safe(k)}-${day}.${isJson(text) ? 'json' : 'txt'}`];
    const card = el('section', undefined, 'piece');
    const head = el('h2', title);
    card.append(head, el('p', hint, 'hint'));
    const row = el('p');
    row.append(button('Download', name, text, k), ` ${kb(text)}, stored as `, el('code', k));
    card.append(row);

    // Each archive and backup is a whole plan of its own.
    let entries = null;
    try { entries = (k === 'carcoord:archives' || k === 'carcoord:backups') ? JSON.parse(text) : null; } catch { /* listed above as it is */ }
    if (Array.isArray(entries) && entries.length) {
      const ul = el('ul');
      entries.forEach((e, i) => {
        if (!e || typeof e !== 'object') return;
        const body = k === 'carcoord:archives' ? e.text : e.json;
        if (typeof body !== 'string') return;
        const when = String(e.t || '').slice(0, 16).replace('T', ' ');
        const label = k === 'carcoord:archives'
          ? (e.kind === 'rescue' ? `Could not be read, kept ${when}` : `Before ${e.to} (from ${e.from}), kept ${when}`)
          : `${e.label || 'Backup'}, ${when}`;
        const file = k === 'carcoord:archives'
          ? (e.kind === 'rescue' ? `car-coordinator-unreadable-${String(e.t || '').slice(0, 10)}.json` : `car-coordinator-before-${safe(e.to)}.json`)
          : `car-coordinator-backup-${i + 1}-${safe(String(e.t || '').slice(0, 16))}.json`;
        const li = el('li');
        li.append(button('Download', file, body), ` ${label}`);
        ul.append(li);
      });
      card.append(ul);
    }
    out.push(card);
  }
  list.replaceChildren(...out);
})();
