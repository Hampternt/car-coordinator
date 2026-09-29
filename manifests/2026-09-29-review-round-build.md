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
  - its own item gates and one commit per item;
  - its schema migration plan (part 2);
  - its **Announce and cut** item, with its own version and update-note entry (pack 1's Design G and H);
  - its upgrade check from the previous build.

  Users jump from the build live on `main` straight to `dev`'s tip, so every entry they missed shows, and the `must` ones show in full.
- **Owner's answers.** Each part's **Owner questions** section holds them, and they override that part's recommendations.
- **Re-check line numbers at the start of each part,** because earlier parts move code. Record anything that differs from the part's plan in that part's Ledger.
- **Parts 8 and 9 were planned before pack 1's rework.** They are re-read against what exists by then, especially the tour's use of pack 1's `firstRun` and `Store.pref('tour')`, and the menus' use of the final Drivers tab row. Deviations go in their Ledgers.
- **Pack 1's review fixes.** When they land on `update-note`, `update-note` is merged into `review-round` before the next part starts. The manager says when.

## Reviews

The manager runs these alongside the build and sends back what they confirm:
- every **⚠️ risky** item, reviewed individually as its part finishes;
- one review per part;
- one combined review and a browser walkthrough before the PR into `dev`.

## Gates

- **Item gate:**
  - `bash scripts/check.sh`, which includes `versions.mjs`;
  - the targeted smoke case when logic is touched (`CHROMIUM_PATH=/usr/bin/google-chrome npm run test:car`);
  - `npm run test:breadify` only if a part touches shared files.
- **End of each part:**
  - `CHROMIUM_PATH=/usr/bin/google-chrome npm test`;
  - `npm run upgrade -- ⟨previous build⟩`;
  - the part's Ledger updated.
- **End of the combined pack:**
  - `npm test`;
  - `npm run screens`;
  - `npm run upgrade` from `v0.2.4` (the build live on `main`) to the final build.
  - Then the combined review, the walkthrough, and one PR into `dev`.

## Ledger

- **Setup.** `review-round` cut from `update-note` at 1af5ab5, merged with `origin/dev` (0f9b59a) at 771f560. Conflicts only in the two pack 1 manifests: pack 1's ticked items and ledger kept, and the container's status line combined. `npm ci` in the worktree. Baseline: `check.sh` OK; car smoke on system Chrome exit 0, 477 ok, 0 FAIL.
- **Part 2 start.** Base 771f560 (0.3.0). `update-note` had no new commits.
- **Part 2 done** (sheet cleanup, 0.4.0): items 1-7 at 6c44bb3, 503900b, 9788635 (⚠️ item 3), 5698b98, b0ec4e8, a994635, 2b02a68. Gate: `npm test` exit 0 (car 507 ok, 0 FAIL; Breadify all passed); `npm run screens` exit 0; `npm run upgrade` from 771f560 "passed: 0.3.0 to 0.4.0" and from v0.2.4 "passed: 0.2.4 to 0.4.0". `scripts/upgrade.mjs` now copes with old builds that have release notes and Archives (see part 2's item 6).
- **Part 3 start.** Base 344415a (0.4.0).
- **Merged `update-note` before part 3** (pack 1's review fixes 3-12, up to 8a855fa): clean merge. Pack 1's new `makeOdd` saves the old plan with an `extra` field, so `asOpened` in `upgrade.mjs` drops it (9dc74ee). Gate after the merge: `check.sh` OK; car suite exit 0, 519 ok, 0 FAIL; `npm run upgrade` from v0.2.4 exit 0, 64 ok, "passed: 0.2.4 to 0.4.0".
