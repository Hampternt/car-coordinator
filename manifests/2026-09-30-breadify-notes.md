# Pack: Breadify — room to write

**Status:** 🚧 building on `breadify-notes`, cut from `dev` at 86efb1a (2026-09-30). Merged into `dev` by the coordinator; no push, merge or PR from here.
**Date:** 2026-09-30

## The owner's words

- *"on the breadify part make the pdf have a dotted line like on the freezer line so it is a neat place to write if something should be written also next to check box on freezer version have another box for delivered"*
- *"use dead space on breadify list as a impromptu comment field having dotted formatted line to help users of the paper have somewhere to write notes"*

Web version only, like the Breadify-blocks pack. Each of these departs from the Rust app's print spec at the owner's request; the Decisions row in `manifests/2026-09-29-breadify-blocks.md` records it, and the code says so where F8 and the legend are cited.

## Items

- [x] **1. A dotted write-in field on every bread line.** The freezer check line's `.bf-note-field` leader, in the slack between the bread name and whatever sits at the line's right (the order id and marker in a shared block, the M and F boxes). It takes only room that is already empty: it never shortens the name, never wraps and never pushes anything, and where the name fills the line it is simply not there. One-order and shared blocks alike. *Done when:* every bread line on both sample days and the edge fixtures has its field inside its own row, after the name, or no room for one; sheet counts and the sweeps unchanged.
- [x] **2. A Delivered box on every freezer line.** `D`, right after `C` (Checked) on the left of the check line, with `M` still at the right. The legend reads "C Checked · D Delivered · M Missing". The bread list is unchanged. *Done when:* every freezer line reads C, D, quantity, code, name … M, and the legend says so; sweeps clean.
- [x] **3. Notes lines in each page's dead space.** Below the last thing on a page, in the space left before the footer: a quiet "Notes" heading and dotted write-on lines at a handwriting pitch (7.5 mm), only where at least two lines fit. Bread and freezer lists alike. Laid out first, then filled: the page's contents, breaks and sheet count never change, and the ≥ 10 mm clearance above the footer holds with the notes lines counted as ink. *Done when:* pages with room get the lines inside their dead space, pages without get none, the sheet counts are unchanged, and the sweeps find nothing.

## Process (the owner's rules)

- `bash scripts/check.sh` per commit.
- `CHROMIUM_PATH=/usr/bin/google-chrome npm run test:breadify` once at the end.
- No multi-agent reviews.
- `progress-now.json` in the worktree's git dir before each item.

## Ledger

- 2026-09-30 · **Start.** Branch `breadify-notes` cut from `origin/dev` at 86efb1a in the worktree `agent-aa6b329eb601bbda5` (the coordinator's option b; the other `breadify-notes` worktree was removed unused). dev carries the Breadify-blocks work (F4 included).
- 2026-09-30 · **Item 1 done** (commit "Give every bread line a dotted place to write"). The bread line's name now sits in a `.bf-product-cell` that takes the name's old place (flex 1), holding the `.bf-product` name (0 1 auto: its natural width, wrapping at the cell's edge exactly as before) and a `.bf-note-field` sized from nothing (flex 1 1 0) that grows into whatever the name leaves. The field has no margin or padding, which would have taken room from the name; its gap is a 3.4 mm text-indent inside it, clipped with the dots. So a name never wraps where it didn't, no height changes, and a name that fills its room leaves no field. Shared rows keep their 30 mm minimum on the cell. Freezer lines unchanged. Tests: `inspectSheets` checks every bread line's field lies after its name, inside its cell, before the next item and within its row, or is under 0.5 mm wide (no room); `.bf-product-cell` joins the overlap sweep; the bread day must show 352 fields with more than 300 visible. Gate: check.sh OK (test:breadify at the end, per the owner's process).
- 2026-09-30 · **Item 2 done** (commit "Add a Delivered box to every freezer line"). `breadLine` puts a `D` tick box right after `C` on a check line; the legend's boxes read C Checked, D Delivered, M Missing. Both name the departure from F7/F8. The bread line and its legend are unchanged. The box takes 8.2 mm (4.6 mm box, 3.6 mm gap) from the check line's slack, which the dotted field absorbs; a shared block's line still wraps its name if its marker and id would not fit (the F8 departure recorded before). Tests: the legend's boxes must read exactly [C, Checked, D, Delivered, M, Missing]; every freezer line must read C, D, quantity, code, name first and M last, left to right on the page. Gate: check.sh OK.
- 2026-09-30 · **Item 3 done** (commit "Put Notes lines in each page's empty space"). `paginate` keeps the raw page budget (`budget`) beside the floored `limit`. After `shareOut` has settled every page, each page's room is `budget` less its pieces' heights, and a new `notesBlock(room, measure)` fills it: a quiet "Notes" heading and as many 7.5 mm dotted lines as measure into the room, or nothing if fewer than two do. It is appended last to the page body, so breaks, sheet counts and page contents cannot change. Using the budget rather than the floor means it never reaches into the footer's 10 mm, even on an overfull page. CSS `.bf-notes`, `.bf-notes-title`, `.bf-notes-line` (deliberately not `.bf-note-field`, which the freezer count pins to its lines). Probe before the suite: bread 19 pages with Notes and 9 without (free room 0.5–22 mm, all under the 22.7 mm the smallest Notes needs); freezer 19 and 2. Tests: a new `readNotes` checks each page's Notes are last on the page, two lines or more, below the block above and clear of the footer's 10 mm, and that every page without them has less room than the smallest Notes block; both days must have pages of each kind at a 7.5 mm pitch; `inspectSheets` counts Notes as ink for the clearance; the bread day is pinned at 28 sheets (the freezer's 20 already was). Gate: check.sh OK.
- 2026-09-30 · **The end-of-task test:breadify run found two things** (fixed in commit "Re-pin the freezer day at 21 sheets, and a page body that ends in Notes"):
  - **Freezer sheets 20 → 21, caused by item 2.** Measured with the D box laid out and without it (a CSS override, in a scratch probe): with D, 9 shared freezer lines wrap their names, not 4. Route 13's Customer 012 block grows from 172.9 to 187.1 mm, no longer fits beside route 13's other stops, and moves whole to a second sheet. Route 13 goes from 1 sheet to 2, and the day from 20 to 21. That is `freezer-list.md`'s own figure again, for a different reason. Re-pinned at 21 with route 13 on 2, and the reason written beside the check. The Notes lines are not the cause: they are laid in after the pages are settled.
  - **The R14 hand-made route's page body** now ends in `bf-notes`, the page's dead space below the total. Expected behaviour; the pin gained it.
  - **Not changed:** README.md says the freezer sample prints on 20 sheets, which is now wrong. It is outside the files this job may touch; flagged for the coordinator.
  - Gate: check.sh OK.
