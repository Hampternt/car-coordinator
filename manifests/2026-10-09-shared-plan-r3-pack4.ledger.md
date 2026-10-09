# Ledger: shared plan, round 3, pack 4 (Who is editing)

Unit ledger for `manifests/2026-10-07-shared-plan.md`, round 3, pack 4. Built in
`.wt/pack4` on `shared-plan-r3-pack4`, from the scaffold f28c7ec. Owns only
`docs/presence.js`, the `/* presence */` region of `docs/style.css`,
`scripts/presence-ui.mjs` and this file.

Item gate: `bash scripts/check.sh` + `node scripts/presence-ui.mjs`.

## Items

- [x] **1. Name and colour** on the Shared plan card, per browser (`presenceName`, `presenceColor`).
  Gate: check.sh OK; presence-ui 16 ok, 0 FAIL; colour-guard clean.
- [x] **2. Sending** on focus and tab change, heartbeat ~20 s, `bye` on pagehide, at most ~4/s.
  Gate: check.sh OK; presence-ui 38 ok, 0 FAIL (40 Tabs in a row stay within 4/s; no ping-pong after a remote redraw).
- [x] **3. Receiving**: by `who.id`, own id ignored, dropped after ~45 s or on `bye`, cleared when not live.
  Gate: check.sh OK; presence-ui 55 ok, 0 FAIL (bye clears within 1 s; a silenced browser is let go 44-49 s after; offline clears, reconnect restores). `pillText()` built here, as receiving's visible half.
- [ ] **4. Day plan marks**: row tint, name tag, box outline; survive redraws; nothing moves.
- [ ] **5. Elsewhere**: rail rows, Cars/Drivers/Positions rows, template cards; `pillText()`.
- [ ] **6. Quiet note**: "Kari is editing this line" beside a row the other is in; never blocks.

## Decisions

- `who.color` is a palette key (`teal`, `violet`, …), not a hex: colour-guard rejects any hex or
  `var(--…)` literal in `docs/presence.js`, so the colours live as tokens in the presence CSS
  region (light plus both dark blocks), reached through a class per key. Still a string `color`,
  so the contract's message shape holds. An unknown key from another build falls back to a colour
  picked from the sender's id.

- A colour not picked yet is picked at random once and kept in `presenceColor`, so the card shows
  the colour the other screen sees, and it stays the same across reloads.
- The name is kept as typed (a card redraw mid-word must not drop a trailing space) and tidied
  (spaces folded, trimmed, 24 characters) only when shown or sent.

- Tab changes are seen in `decorate()` (every tab switch is a render), not by a click listener:
  `attach` runs before the app's own click handler is registered, and tabs also change through
  `show-data` and the right-click menu's Go to.
- Focus in a row's grid, tag menu or right-click menu keeps the row's place; anywhere outside the
  tab sections (the bar, dialogs) is `at: null`.
- `bye` on pagehide is best effort only: sealing is async and usually finishes after the page has
  gone (round 2's ledger). The receive side is tested with a `bye` sent from a live page.

- Receiving redraws only the marks (`decorate()`), and calls `api.rerender()` only when the bar's
  words change (someone comes, goes or changes tab): a heartbeat or a move within a tab redraws
  nothing. Someone new is answered at once, so a newcomer sees the other without waiting 20 s.
- The 45 s is counted on the receiving PC's own clock, from when it heard the message (`t` is the
  sender's clock, so it is not used for the timeout).
- The pill names each name once (two tabs of one person, or a reload before its bye got out, read
  as one); no name set reads as "Someone".

## Deviations and notes for the merge

