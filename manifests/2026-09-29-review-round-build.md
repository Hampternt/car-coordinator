# Combined pack: the rest of the review round, built in one go

**Status:** 🚧 go given 2026-09-29 by the owner ("combine all the UI changes and minor features … begin on its own worktree"). Building.
**Date:** 2026-09-29
**Branch:** `review-round`, in its own worktree. It is cut from `update-note` (pack 1, whose review fixes are still landing), then merged with `origin/dev` for the plans. It comes back into `dev` through **one PR** at the end. Nothing goes to `main` until the owner has tested the full update on `dev`.

## Goal

Everything left in the review round for Car Coordinator is built in one continuous run, in the container's order, with no stop for approval between packs. The owner approved every item list and answered every question up front.

| Part | Manifest | Items | Version |
|---|---|---|---|
| 2. Printed sheet cleanup | `manifests/2026-09-29-sheet-cleanup.md` | 7 | 0.4.0 |
| 3. Dark mode | `manifests/2026-09-29-dark-mode.md` | 10 | 0.5.0 |
| 4. Plan for tomorrow | `manifests/2026-09-29-plan-for-tomorrow.md` | 10 | 0.6.0 |
| 5. Day plan layout | `manifests/2026-09-29-day-plan-layout.md` | 12 | 0.7.0 |
| 6. Parking map | `manifests/2026-09-29-parking-map.md` | 9 | 0.8.0 |
| 7. Drivers tab | `manifests/2026-09-29-drivers-tab.md` | 10 (item 2 dropped) | 0.9.0 |
| 8. Right-click menus | `manifests/2026-09-28-context-menus.md` | 14 | 0.10.0 |
| 9. First-use tour | `manifests/2026-09-28-tour.md` | 8 | 0.11.0 |

## How it runs

- **One builder, in order, one worktree.** Every part edits `docs/app.js`, so they can't be built in parallel.
- **Each part keeps what makes it safe:**
  - one commit per item, each passing `scripts/check.sh`;
  - its schema migration plan (part 2);
  - its **Announce and cut** item, with its own version and update-note entry (pack 1's Design G and H).

  The full suite, the upgrade check and the review run once, at the end (see below).

  Users jump from the build live on `main` straight to `dev`'s tip, so every entry they missed shows, and the `must` ones show in full.
- **Owner's answers.** Each part's **Owner questions** section holds them, and they override that part's recommendations.
- **Re-check line numbers at the start of each part,** because earlier parts move code. Record anything that differs from the part's plan in that part's Ledger.
- **Parts 8 and 9 were planned before pack 1's rework.** They are re-read against what exists by then, especially the tour's use of pack 1's `firstRun` and `Store.pref('tour')`, and the menus' use of the final Drivers tab row. Deviations go in their Ledgers.
- **Pack 1's review fixes.** When they land on `update-note`, `update-note` is merged into `review-round` before the next part starts. The manager says when.

## Reviews and gates: batched at the end (owner, 2026-09-29)

The owner's rule: the full suite and the multi-agent reviews wait until the run is done. They do not run per change or per part.

- **Per item:** `bash scripts/check.sh` only (syntax and the version guard, seconds), then commit. No per-item smoke run and no per-part upgrade check. Every item is still its own commit, so a failure found at the end can be bisected to the exact change.
- **Per part:** its **Announce and cut** item (version and note entry), and its Ledger. Nothing else.
- **At the end of the whole run, once:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`;
  - `npm run screens`;
  - `npm run upgrade` from `v0.2.4`, the build live on `main`. This is the only upgrade check (owner, 2026-09-29): users go straight from what `main` serves to `dev`'s tip, so versions in between on `dev` are never compared. It overrides each part's own "Upgrade check in the pack gate". The same check runs again before `dev` → `main`;
  - one combined review, whose findings are fixed;
  - a browser walkthrough;
  - one PR into `dev`.
- **Parts 2 and 3 so far** already had per-item suites, and part 2 its own review, before this rule. Nothing is re-run for them now.

## Ledger
