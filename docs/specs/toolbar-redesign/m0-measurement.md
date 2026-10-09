# Toolbar redesign — M0 measurement and premises

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 and [`feature-spec.md`](feature-spec.md). Taken
2026-10-09 in the container's Chromium 1194 (Playwright 1.63), layout only, headless, with the real sign-up -> client ->
project -> plan journey, three seeded activities (one link) and the pen taken. The harness is
`apps/web/measure-toolbar/toolbar-redesign-m0.spec.ts` (non-CI `playwright.measure-toolbar.config.ts`); its raw output
is gitignored (`apps/web/measure-output/`), so the figures below and the two JSON files are the record.

**Go / no-go: NO-GO for M1 as written.** Two premises of the spec are false in measured states, and M1 as sequenced
cannot reach the two-line floor it promises. Section 0 has the numbers. The plan's literal exit rule (a row missing one
line by under 20 px at 1024) was **not** triggered; the stop is on the other half of the stop rule, "any premise of
the spec proves false".

## 0. What contradicts the spec

| #   | Spec claim                                                                                                                                               | Measured                                                                                                                                                                                                                                                                                                                                                                                         | Effect                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | M0-T2.1 / US-1 / SC-1: with zoom gone, three compact items, Summary moved and Comments in Panels, **each row is one line at 1024 in every stress state** | **False.** Fine, 1024, that composition: LOOK needs 1094.9 px in a 1008 px row (**+86.9 over**, 2 lines); DO fits (967.7, 40.3 spare). Moving Float paths as well (D-c) brings LOOK to 980.9 (**27.1 spare**) in the base, selection, dock, minimap, Gantt, peer-pen and empty-plan states. **With a conflict, LOOK needs 1077.1: +69.1 over (2 lines)**, with or without a peer holding the pen | The plan's list omits Float paths; the spec's own LOOK estimate (1120 -> 942) only works with it |
| 2   | SC-3: coarse 1024 is **at most 3 lines**                                                                                                                 | **False: 4 lines.** Coarse, same composition plus Float paths: LOOK +56.9, DO +143.7 over (conflicts: LOOK +161.1). No row fits, so 2 + 2 lines. Band 263 px, canvas 234 px, unchanged from today                                                                                                                                                                                                | SC-3 needs a different composition at 44 px                                                      |
| 3   | M1 alone: "at 1024 x 600 fine the deck is two lines"; its journey asserts `LINES[1024] = 2`                                                              | **False as sequenced.** M1 changes only labels. From today's items: LOOK 1254.1 - 107.2 (Baseline overlay) = **1146.9**; DO 1256.9 - 71.4 (Comments) - 66.3 (Settings) = **1119.2**; both over 1008, so still **4 lines** (coarse 1278.9 / 1331.2). Two lines needs M2 (Summary, Panels, Float paths) **and** M4 (zoom)                                                                          | M1's outcome and journey claim cannot hold at M1                                                 |
| 4   | M0-T2.2: at the first promotion stage (1280, `--container-roomy`) every row is one line with every label visible                                         | Fine, base: **holds** (LOOK 1249.4/1264 without Float paths moved, 1135.4 with). Fine **with a conflict**: LOOK 1345.7 (**+81.7, wraps**) unless Float paths moved (1231.7, fits by 32.3). Coarse 1280: LOOK **+101** without Float paths, **+84 with a conflict even with it**                                                                                                                  | Conditional: holds for fine only if Float paths moves; coarse needs a later first stage          |
| 5   | §4.5: LOOK about 942 px, DO about 1000 "by a hair" with 66 px of margin                                                                                  | LOOK **980.9** (39 px more than 942); DO **967.7**, 40.3 spare. The three savings reproduce exactly: -107.2, -71.4, -66.3                                                                                                                                                                                                                                                                        | Margin at the floor is 27 px (LOOK), not 66                                                      |
| 6   | §4.7 / M0 reads "the stage's horizontal scrollbar"                                                                                                       | **None exists.** The canvas is one painted `<canvas>`; the only bottom furniture is the axis-marker row (`data-testid="tsld-axis-markers"`, 14 px, `bottom-0`) and the optional resource strip. The sticky ruler is `RULER_HEIGHT` 40 px (`TsldCanvas.tsx:195`)                                                                                                                                  | The corner column's geometry rule must name the axis-marker row, not a scrollbar                 |
| 7   | US-2: an arbitrary `@max-[…]` container value "is invalid in Tailwind v4"                                                                                | **Compiles** in the installed 4.3.3 (see 11.4). The named form the spec chose also works                                                                                                                                                                                                                                                                                                         | The reason in the ADR text is wrong; the decision (a named token) stands                         |
| 8   | SC-13 / D-g: View ▾ becomes <= 420 px at 1024 x 600 with two columns and collapsible sections                                                            | Panel today **584 / 600 px (97.3 %)** with an inner scroll of 1265 px of content (both pointers). Two balanced columns are still about **633 px**, which is over 420. Reaching 420 needs three columns or sections collapsed by default                                                                                                                                                          | D-g's remedy is unproven; M2-T3 must pick a layout that meets the number                         |
| 9   | §4.11 widths: P2 130, P3 135, P5 150, C1 250, L2 340, L6 135                                                                                             | Measured (fine): P2 **169.9**, P3 **176.7**, P5 **501.9** (three buttons, each named "Link: ..."), C1 **430**, L2 **370.3**, L6 **144**. Table in 10.2                                                                                                                                                                                                                                           | Stages move; none of the spec's stage columns survive                                            |
| 10  | §4.11 free-width table: LOOK 144/304/776/1424, DO 114/274/746/1394                                                                                       | Projected, base, fine: LOOK **129/289/689/1097**, DO **242/402/874/1522** (search field growth included at 2560)                                                                                                                                                                                                                                                                                 | DO has 128 px more room than estimated; LOOK 1912 has 87 less                                    |
| 11  | `selection-actions.tsx:206`: "the Gantt renders no selection bar today"                                                                                  | **Stale.** The Gantt renders the same `SelectionActionsBar` (`plan-workspace-toolbar.tsx:1814`, inside `CanvasDock`), and `GanttRowMenu.tsx:147-153` derives its items from `selectionActionItems` filtered by `isVisible(canvas: null)`                                                                                                                                                         | D-c is decided yes (4.3). Correct `:183-199` and `:206` at M2-T4                                 |
| 12  | SC-5 "99 % / 100 %" band share at 640 x 360 / 320 x 256                                                                                                  | 98.6 % and **235.5 %** (a 603 px band in a 256 px window, so the share exceeds the viewport). 355 px at 640, 603 px at 320 and headers of 88/136 are confirmed                                                                                                                                                                                                                                   | Wording only                                                                                     |
| 13  | Plan M1/M2: the conflict state is a stress state "M0 defines"                                                                                            | The chip read-out "1 conflict" costs **96.2 px** on LOOK. The longer cycling read-out ("Conflict 2 of 7 · reason", `next-conflict-status` with `currentConflict`) was **not** exercised and is larger                                                                                                                                                                                            | The conflict row budget is a lower bound                                                         |

**Reading the stop rule honestly.** The numeric trigger ("misses one line by less than 20 px at 1024 in any state") did
not fire: at 1024 the misses are 86.9, 69.1, 56.9, 143.7 and 161.1 px and the fits are 27.1 and 40.3 px. The nearest
sub-20 misses are **outside 1024 and only in the variant without Float paths moved**: coarse 1366 x 768 LOOK +15.2 px.
There is no case at 1024 where a fourth compact item "would just close it": the conflict case needs **69.1 px**, which
is the width of no single item's label saving except Resource view's (-94.8 px fine, labelled 130.8 -> icon 36). That is
the fourth compaction the exit rule says to ask about, so it is a product decision, not a builder's.

## 1. Method and what it cannot read

- **Real reads:** header, band, deck, rows, groups, items (`[data-toolbar-item]`), the foot row, the stage, the minimap,
  `Expand activities panel` hit-testing (`elementFromPoint` at its centre).
- **Natural width of a row** = the row cloned with `flex-wrap: nowrap`, `flex-shrink: 0` groups and
  `width: max-content`, in a disposable clone while the real deck is hidden. "Miss" = natural - available row width.
  Lines are counted from item tops (4 px tolerance), as `command-surface.spec.ts` does.
- **Projection (`after` = variant A, `afterB` = A plus Float paths moved):** the deck is **cloned**, the clone is edited
  (zoom-out, zoom-in, fit, Summary hidden; Baseline overlay, Comments, Settings labels `sr-only` below 80 rem; Legend,
  Resource view and Comments moved to a trailing Panels group on LOOK; Apply levelled dates… labelled from 80 rem; a
  `margin-left: auto` on Panels and Plan; the search field +240 px from 160 rem), read, and removed. The real deck is
  hidden meanwhile and restored, so React never sees an edited node. Group paddings and seams of a real Panels group
  and the real identity-row button are not reproduced: **treat every projected figure as +/- about 10 px.**
- **Promoted widths** are the widths of a clone of a real labelled deck button (`marquee-select`) with its label
  replaced, read at 3840 x 1440 inside the real group, because no promoted form exists yet. Item gap 4 px.
- **Pointer:** `hasTouch: true` context, with `(pointer: coarse)` asserted before reading. Fine is the default.
- **Text-only 200 %:** `Page.setFontSizes` (standard 32) through a CDP session; the root font size reads `32px` and
  `remW` 40 / 80 at the two cells, so rem media queries do respond (the plan's premise holds).
- **Viewport notice (ADR-0179):** acknowledged in `localStorage` so the dialog does not cover the cells below 1024.
- **Not read:** the stale state's `Recalculate` button (`recalculateHittable` is `null` everywhere: it renders only
  when stale); the cycling conflict read-out; a window with a classic 15 px scrollbar (the shell is `h-dvh` and never
  scrolls the document: `scrollHeight` equals the viewport in every cell).
- Screenshots (`photos/`): 1024 x 600 and 1440 x 900, fine and coarse, base state. Taken after the menu probes, so a
  focus ring may remain on one control.

## 2. Today's heights and lines (fine, base state; the spec's §1 table)

| Cell        | Header | Band | Deck (lines)   | Stage | Canvas  | Foot | Search | Expand reachable |
| ----------- | ------ | ---- | -------------- | ----- | ------- | ---- | ------ | ---------------- |
| 1024 x 600  | 40     | 227  | **168 (4)**    | 314   | **274** | 51   | 168    | yes              |
| 1280 x 800  | 40     | 139  | 80 (2)         | 602   | 562     | 51   | 168    | yes              |
| 1440 x 900  | 40     | 139  | 80 (2)         | 702   | 662     | 51   | 168    | yes              |
| 1912 x 1080 | 40     | 139  | 80 (2)         | 882   | 842     | 51   | 240    | yes              |
| 1912 x 948  | 40     | 139  | 80 (2)         | 750   | 710     | 51   | 240    | yes              |
| 1912 x 1114 | 40     | 139  | 80 (2)         | 916   | 876     | 51   | 240    | yes              |
| 1280 x 600  | 40     | 139  | 80 (2)         | 402   | 362     | 51   | 168    | yes              |
| 1366 x 768  | 40     | 139  | 80 (2)         | 570   | 530     | 51   | 168    | yes              |
| 2560 x 1440 | 40     | 139  | 80 (2)         | 1242  | 1202    | 51   | 240    | yes              |
| 640 x 480   | 88     | 355  | 6 lines (3+3)  | 240   | 200     | 51   | 168    | yes              |
| 640 x 360   | 88     | 355  | 6 lines        | 240   | 200     | 51   | 168    | **no**           |
| 640 x 300   | 88     | 355  | 6 lines        | 240   | 200     | 51   | 168    | **no**           |
| 320 x 720   | 136    | 603  | 11 lines (5+6) | 240   | 200     | 103  | 144    | yes              |
| 320 x 256   | 136    | 603  | 11 lines       | 240   | 200     | 103  | 144    | **no**           |

Coarse (44 px controls), base state:

| Cell                      | Header  | Band    | Deck lines (L/D) | Canvas     | Foot   | Expand reachable    |
| ------------------------- | ------- | ------- | ---------------- | ---------- | ------ | ------------------- |
| 1024 x 600                | 44      | 263     | 4 (2/2)          | 234        | 55     | yes                 |
| 1280 x 800                | 44      | 263     | 4 (2/2)          | 434        | 55     | yes                 |
| 1440 x 900                | 44      | 211     | 3 (1/2)          | 586        | 55     | yes                 |
| 1912 x 1080 / 2560 x 1440 | 44      | 159     | 2 (1/1)          | 818 / 1178 | 55     | yes                 |
| 1280 x 600 / 1366         | 44      | 263     | 4 (2/2)          | 234/402    | 55     | yes                 |
| 640 x 480 .. 320 x 256    | 100-156 | 463-759 | 7-12 lines       | 200        | 55-107 | **no at every one** |

All of the spec's §1 figures (header 40/44, deck 168/80, canvas 274/562/234/586, 4/3/2 coarse lines) reproduce.
The 1024 band is 227 px (183 once the deck is two lines of 36; **139 with both rows on one line**, the bar the plan's
`BAND_MAX_PX` 145 already allows).

**Deck lines per state, today** (L/D in brackets; the same in every state unless stated):

| Pointer | 1024    | 1280                           | 1440                                 | 1912 | 2560 |
| ------- | ------- | ------------------------------ | ------------------------------------ | ---- | ---- |
| fine    | 4 (2/2) | 2; **3 (2/1) with a conflict** | 2                                    | 2    | 2    |
| coarse  | 4 (2/2) | 4 (2/2)                        | 3 (1/2); **4 (2/2) with a conflict** | 2    | 2    |

With a selection the foot row grows (fine 1024: 51 -> 167 px, canvas 200; 1280: 127; 1440: 87). No other state moves
the deck: the dock, minimap, Gantt, peer-held pen and an empty plan leave line counts unchanged (an empty plan costs
the canvas 6 px). **Fine today already wraps LOOK at 1280 whenever a conflict exists** (a defect independent of this
epic).

## 3. The floor, projected (the premise test)

Miss in px against the row width (negative = fits with that much to spare). Columns are the states; "A" is the plan's
M0-T2.1 composition, "B" adds Float paths moved (D-c).

Fine, 1024 x 600 (row 1008):

| Variant | base, selection, dock, minimap, Gantt, empty plan | peer holds pen | conflicts | conflicts + peer |
| ------- | ------------------------------------------------- | -------------- | --------- | ---------------- |
| A LOOK  | **+86.9** (2 lines)                               | +86.9          | +183.1    | +183.1           |
| A DO    | -40.3                                             | -38.2          | -40.3     | -38.2            |
| B LOOK  | **-27.1**                                         | -27.1          | **+69.1** | +69.1            |
| B DO    | -40.3                                             | -38.2          | -40.3     | -38.2            |

Projected canvas at 1024 (today's canvas + band difference): B base **362 px** (band 139), meeting SC-1's >= 350; B with
a conflict **318** (band 183). Peer-held pen costs DO only 2.1 px (the pen reads "Start editing", shaded).

Coarse, 1024 x 600 (row 1008), B: LOOK **+56.9**, DO **+143.7** in every state except conflicts (LOOK +161.1). 4 lines,
canvas stays 234.

Fine B, every other cell: every row fits in every state; the smallest margin is LOOK with a conflict at 1280
(32.3 px). Coarse B: 1280 LOOK fits by 20.6 in the base and misses by 83.7 with a conflict; 1440 and above fit.
Leading group seam (SC-12): today fine 1024 has one in each row (the 4-line wrap); B removes it only where the row is
one line (fine base). Every wrapped state still has one, so SC-12 is carried by V2's pills, not by the layout.

**Variant A at the other widths** (for completeness): fine 1280 LOOK 1249.4 (fits by 14.6) but +81.7 with a conflict;
coarse 1280 +101 and coarse 1366 +15.2 (the only sub-20 miss anywhere; outside the floor and outside B).

## 4. M0-T2 premises

1. **Compact set at the floor** — see 0.1 and section 3. False for conflicts (fine) and for coarse. Not the literal
   exit rule; stop and ask.
2. **`--container-roomy`** — the deck at 1280 is **1264 px (79 rem)** wide on both pointers, so
   `--container-roomy: 79rem` is the derived value; a classic scrollbar would make it 1249 and compact the labels at
   the first stage, but the shell never scrolls the document. Every label visible and one line per row at that width:
   fine base yes (B: LOOK 1135.4); fine with a conflict only under B; coarse no (0.4).
3. **The Gantt route for Float paths** — **confirmed.** `GanttRowMenu.tsx:147-153` derives its items from
   `selectionActionItems` filtered by `isVisible(canvas: null)` (a derived roster, so it mirrors the bar by
   construction); the Gantt renders the same `SelectionActionsBar` (`plan-workspace-toolbar.tsx:1814`). **D-c: move
   Float paths.** Two things the plan did not say: it is **required** for the two-line floor (section 3), and
   `SelectionActionContext` has no Float-paths facts (`toggleFloatPaths` is built in `plan-workspace-toolbar.tsx:436`
   for `TsldToolbarContext`), so the move adds `floatPathsOpen` and a toggle to that context (ADR-0133 D6: a fact).
   `float-paths-view-agnostic.structural.test.ts` is `src/features/float-paths/`, not `tsld/toolbar/`.
4. **Tailwind v4 syntax** — verified by compiling with `@tailwindcss/node` 4.3.3 (candidates `@container/deck`,
   `@max-roomy/deck:sr-only`, `@roomy/deck:inline`, `@max-[60rem]/deck:sr-only`, `max-lg:flex-nowrap`, theme
   `--container-roomy: 60rem`). Output: `.\@container\/deck { container-type: inline-size; container-name: deck }`,
   `@container deck (width < 60rem) { .\@max-roomy\/deck\:sr-only {...} }`, `@container deck (width >= 60rem)` for
   `@roomy`, and the arbitrary form compiled identically. The named-variant design is right; the spec's "arbitrary is
   invalid" is wrong (0.7). No docblock asserts this yet; M1 must register a `scripts/dependency-claims.json` entry
   if its docblock does.
5. **Provisional promotion widths** — section 10 and `promotion-widths.{fine,coarse}.json`. Deviation: no build with
   every entry `at: 'always'` was run (the promoted forms do not exist), so widths come from clones of a real button.
6. **Suite impact** — section 12.
7. **Estimates replaced** — section 13 lists each spec figure and its reading.

## 5. Per-item widths (today, base, 1024; `*` = icon only)

| Item (id)           | Fine                | Coarse    | Item (id)             | Fine  | Coarse |
| ------------------- | ------------------- | --------- | --------------------- | ----- | ------ |
| Go to today (today) | 111.3               | 119.3     | Editing control (pen) | 115.1 | 123.1  |
| Zoom out/in, Fit \* | 36 ea               | 44 ea     | Add activity          | 63.8  | 71.8   |
| View (view)         | 89.4                | 97.4      | Link activities       | 64.7  | 72.7   |
| Resource view       | 130.8               | 138.8     | Select                | 78.2  | 86.2   |
| Legend              | 84.5                | 92.5      | Arrange               | 88.9  | 96.9   |
| Baseline overlay    | 143.2               | 151.2     | Apply levelled \*     | 36    | 44     |
| Search (field) \*   | 168 (240 from 1600) | 168 / 240 | Undo, Recent, Redo \* | 32 ea | 44 ea  |
| Filter              | 91.8                | 99.8      | Summary               | 119.6 | 127.6  |
| Next conflict       | 119.1               | 127.1     | Analysis              | 111.6 | 119.6  |
| Float paths         | 110                 | 118       | Settings…             | 102.3 | 110.3  |
| Comments            | 107.4               | 115.4     | Share & export        | 153.4 | 161.4  |

Groups (fine): View 733.1, Find 512.9, Author 626.7, Plan 622.2 (the m4 figures). Icon-only widths of the three compact
items are the control height (36/44), so the savings are 107.2 / 71.4 / 66.3 on both pointers.
`labelShown`, `hasTitle` and `hasDescribedBy` per item are in the harness output. The tooltip reading (hover and focus,
fine and coarse alike): **Comments, Resource view: no tooltip and no title; Baseline overlay: a native `title`
("No active baseline") and `aria-describedby`, no tooltip panel; Settings…: native `title` only ("Settings… —
Schedule settings"); Apply levelled dates…: a `description` tooltip, dismissed by Escape; Zoom in and Undo: a
`name-echo` tooltip (`aria-hidden`)**. That confirms US-2's reason for always mounting a `description` tooltip on
`'roomy'` items.

## 6. Menus (opened at 1024 x 600 and 1440 x 900)

| Menu (role)            | Items | Height at 1024 x 600 fine | Coarse           | Inner scroll                   |
| ---------------------- | ----- | ------------------------- | ---------------- | ------------------------------ |
| View (dialog)          | 27    | **584 (97.3 %)**          | **584 (97.3 %)** | yes: 1265 px of content in 582 |
| Filter (dialog)        | 3     | 150 (25 %)                | 150              | no                             |
| Analysis (menu)        | 5     | 170 (28.3 %)              | 230 (38.3 %)     | no                             |
| Share & export (menu)  | 9     | 429 (71.5 %)              | **537 (89.5 %)** | no                             |
| Add activity (menu)    | 4     | 199 (33.2 %)              | 247 (41.2 %)     | no                             |
| Link activities (menu) | 4     | 138 (23 %)                | 186 (31 %)       | no                             |
| Go to today (dialog)   | —     | 110                       | 118              | no                             |

At 1440 x 900 the View panel is 884 px (98.2 %): it is **always viewport-clamped**, not only at the floor; the
content is 1265 px in a 320 px column. View's items, by fieldset (legends): Zoom (5 presets), Structure, Markers,
Insight overlays, **Panels (Minimap only)**; the Panels fieldset's sole occupant is Minimap, as the spec says.
Analysis lists Baselines…, Earned value…, Resource histogram…, Health check…, Compare revisions… (both flagged items
present in this build). Export lists Schedule (CSV), four diagram PNG/PDF, XER, MSPDI, Print…, Share….

## 7. Minimap, cluster and stage geometry

- **Minimap box (today):** 204 x 164 (fine) / 204 x 168 (coarse) outer, `right: 12`, `bottom: 12` (inline style
  `12 + bottomOffsetPx`, `TsldMinimap.tsx:399-400`), measured 12 px from the stage's bottom and right edges in every
  cell. `TsldMinimap.tsx:400` and `TsldCanvas.tsx:889`, `:2685` are exact.
- **`minimapRoom` turns false when the stage is under 600 px wide** (`3 * MINIMAP_BOX.width`, `TsldCanvas.tsx:1602`).
  Measured stage widths: 1024 base 747, **1024 with the dock open 386 (no room)**, 1280 1003 (642 with dock), 1440 1163
  (802), 1912 1635 (1274). At 1024 with a docked panel the minimap withdraws; the cluster would still be present and
  occupies about 41 % of a 386 px stage.
- **Cluster arithmetic (not built; from measured buttons):** four icon buttons are 4 x 36 + 3 x 8 = **168 px** wide
  (fine) and 4 x 44 + 3 x 8 = **200 px** (coarse), before card padding; 36 / 44 px tall. Stacked under the minimap:
  fine 164 + 8 + 36 = **208 px**, coarse 168 + 8 + 44 = **220 px**, plus padding and the 12 px edge inset. The stage is
  **314 px (fine) and 274 px (coarse) tall at 1024 x 600** and the ruler takes 40. Fine leaves 54 px between the
  ruler and the column's top (314 - 12 - 208 - 40); **coarse leaves 2 px** (274 - 12 - 220 - 40) and the column covers
  almost the whole right-hand 204 px of the canvas. `minimapRoom` therefore
  needs a **height** clause as well as a width one.
- **C1 presets (flat pressed set Day..Year):** **430 px** fine and **470 px** coarse including the caption and the 4 px
  gaps; the spec's 250 is wrong. Its promotion needs the stage width, not the viewport (not computed: M4 owns the
  geometry).
- **Axis-marker row** 14 px at the stage bottom (present from the `TsldCanvas` DOM in every cell), ruler 40 px at the
  top: the two bounds the column must stay between.

## 8. Text-only 200 % (root font size 32 px; `remW` = viewport / 32)

| Pointer | Cell        | rem | Header | Band         | Deck lines (L/D) | Expand | Stage |
| ------- | ----------- | --- | ------ | ------------ | ---------------- | ------ | ----- |
| fine    | 1280 x 800  | 40  | 176    | 707 (88 %)   | 6 (3/3)          | yes    | 240   |
| fine    | 2560 x 1440 | 80  | 80     | 363 (25 %)   | 3 (2/1)          | yes    | 962   |
| coarse  | 1280 x 800  | 40  | 200    | 1019 (127 %) | 8 (4/4)          | **no** | 240   |
| coarse  | 2560 x 1440 | 80  | 88     | 523 (36 %)   | 4 (2/2)          | yes    | 794   |

The 1280 cell is below 64 rem, so it is M3's scroll line, not the two-row wrap: today the band eats 88 % of an 800 px
window on a mouse and the foot row is unreachable on touch. At 2560 (80 rem) the projected LOOK needs 2691.3 against a
2528 row (A) or 2463.4 against 2528 (B, fits): so under B the 200 % 2560 cell is one line per row on fine (and 2 lines
LOOK on coarse: 2695.4 against 2528).

## 9. #471 cells (base state, both pointers)

Band share and `Expand` reachability are the table in section 2. Fine: 640 x 480 74 % (reachable), 640 x 360 98.6 %,
640 x 300 118 %, 320 x 720 83.8 % (reachable), 320 x 256 235 % (the last three: not reachable). **Coarse: unreachable at
every one of the five** (96.5 %, 128.6 %, 154.3 %, 105.4 %, 296.5 %); the header is 100 / 156 px and the band 463 / 759.
SC-5's "Recalculate hit-testable" half was **not** read (the button renders only when stale).

## 10. Free space

### 10.1 SC-17 "before" (today, base state, natural width against the row)

| Pointer | Row  | 1280                | 1440               | 1912   | 2560   |
| ------- | ---- | ------------------- | ------------------ | ------ | ------ |
| fine    | LOOK | 0.8 % (1 line)      | 11.9 %             | 30.1 % | 47.9 % |
| fine    | DO   | 0.6 %               | 11.7 %             | 33.7 % | 50.6 % |
| coarse  | LOOK | **wraps (-9.7 %)**  | 2.7 %              | 23.1 % | 42.7 % |
| coarse  | DO   | **wraps (-16.2 %)** | **wraps (-3.2 %)** | 22.5 % | 42.3 % |

Rows already within 15 % empty today: fine 1280 and 1440, coarse 1440 LOOK. Everything from 1912 up is 22-51 % empty:
that is the free-space requirement.

### 10.2 Promoted widths (provisional; per pointer in the JSON files)

Fine / coarse, px, labelled form with its 4 px gap not included. Names are the spec's bar names; the three-button sets
include their caption and gaps.

| Rank | Entry                                               | Fine  | Coarse | Spec's estimate |
| ---- | --------------------------------------------------- | ----- | ------ | --------------- |
| L1   | Critical only                                       | 113.9 | 121.9  | 110             |
| L2   | Colour: Criticality / Total float / WBS group (set) | 370.3 | 394.3  | 340             |
| L3   | Late-start overlay                                  | 151.6 | 159.6  | 150             |
| L4   | Feasible window                                     | 145.3 | 153.3  | 150             |
| L5   | Levelled placement                                  | 162.9 | 170.9  | 170             |
| L6   | Has conflict only                                   | 144   | 152    | 135             |
| P1   | Health check                                        | 121.7 | 129.7  | 120             |
| P2   | Add: Start milestone                                | 169.9 | 177.9  | 130             |
| P3   | Add: Finish milestone                               | 176.7 | 184.7  | 135             |
| P4   | Share…                                              | 86.8  | 94.8   | 80              |
| P5   | Link: FS / SS / FF (three presets)                  | 501.9 | 525.9  | 150             |
| P6   | Compare revisions                                   | 156.8 | 164.8  | 170             |
| P7   | Earned value…                                       | 133   | 141    | 130             |
| P8   | Resource histogram…                                 | 177.2 | 185.2  | 170             |
| C1   | Zoom: Day..Year (set, corner)                       | 430   | 470    | 250             |

P2, P3, P5 and C1 are the wrong ones; P5 would be a half-row wide if its three buttons keep the "Link:" prefix, which
is a naming decision for M5 (a value-only label is about 110 px narrower each).

### 10.3 Row free width at each stage, and the stages that follow

Free width = row width - projected natural width (layout B), and the proposal reserves the **worst stress state** per
row (conflicts for LOOK, a held pen for DO), so a conflict chip that arrives later cannot wrap a row the ladder filled.

| Pointer / row | 1280 free (worst) | 1440          | 1912          | 2560            |
| ------------- | ----------------- | ------------- | ------------- | --------------- |
| fine LOOK     | 128.6 (32.3)      | 288.6 (192.3) | 688.6 (592.3) | 1096.6 (1000.3) |
| fine DO       | 242 (239.9)       | 402 (399.9)   | 874 (871.9)   | 1522 (1519.9)   |
| coarse LOOK   | 20.6 (**-83.7**)  | 180.6 (76.3)  | 580.6 (476.3) | 988.6 (884.3)   |
| coarse DO     | 46 (43.9)         | 206 (203.9)   | 678 (675.9)   | 1326 (1323.9)   |

The stage constants follow (skip-fill, worst-state reserve; `PROMOTE_80/_90/_119_5/_160`):

| Entry                    | Fine  | Coarse          |
| ------------------------ | ----- | --------------- |
| L1 Critical only         | 90    | 119.5           |
| L2 Colour set            | 119.5 | 160             |
| L3 Late-start            | 160   | 119.5           |
| L4 Feasible              | 160   | 119.5           |
| L5 Levelled              | 160   | never (no room) |
| L6 Has conflict          | never | never           |
| P1 Health check          | 80    | 90              |
| P4 Share…                | 80    | 119.5           |
| P2 Add: Start milestone  | 90    | 119.5           |
| P3 Add: Finish milestone | 119.5 | 119.5           |
| P6 Compare               | 119.5 | 160             |
| P7 Earned value          | 119.5 | never           |
| P5 Link set              | 160   | 160             |
| P8 Histogram             | never | never           |

(Coarse L5, L6, P7 and P8 never promote: the ladder is exhausted at 2560 for the room that is left.) With these, the resulting unused width on the base
state is: fine LOOK 10.2 / 12.0 / 10.4 / 5.2 %, DO 2.0 / 0.8 / 0.3 / 5.8 %; coarse LOOK 1.6 / 12.7 / 7.1 / 5.6 %, DO
3.6 / 5.1 / 4.0 / 1.0 % (1280 / 1440 / 1912 / 2560): all within SC-17's 15 %. Without the worst-state reserve the
ladder would promote L1 at fine 1280 and coarse 1440, which a conflict then wraps: **the reserve is a design
decision for `computePromotionStages`, not a free choice.** **The first stage is not 1280 for coarse LOOK** (a conflict
leaves -83.7 px), so the "deck at the first stage is at least roomy, per pointer" assertion fails there.

These JSON files are **provisional**: they assume layout B, and M4 changes the stage (the cluster) and M2 the header.
They are re-taken after M4 and before M5.

## 11. Suite impact (M0-T2.6): tests that locate a moved or promotable control

**Journeys (`apps/web/e2e*`), by name or id:**

- **Zoom out / Fit to plan** (CQ-1): `e2e-workspace-chrome/support.ts:372` (`zoomOut` helper, used by many journeys),
  `activities-panel-scroll.spec.ts:595`, `e2e-narrow-shell/narrow-shell.spec.ts:1009`, `e2e-share/share.spec.ts:343`,
  `:383`, `e2e/tsld.spec.ts:138` (`fit`), `e2e-toolbar/toolbar.spec.ts:247` (`zoom-out`).
- **Minimap** (View ▾ row, M4): `e2e-minimap/minimap.spec.ts:44`, `:65`, `:257`.
- **Summary** (identity row, M2): `e2e-toolbar/toolbar.spec.ts:42-43`, `e2e-workspace-chrome/placement-overlays.spec.ts:306-307`,
  `:509-510` (the regexp `/Summary/` survives "Plan summary").
- **Edit plan** (renamed "Edit plan details"; string names match as substrings): `e2e-edit/support.ts:50`,
  `e2e/tsld.spec.ts:73`, `e2e/schedule.spec.ts:73`, `:134`, `e2e/baselines.spec.ts:186`.
- **Float paths** (D-c): `e2e-float-paths/float-paths.spec.ts:66` (`data-toolbar-item="float-paths"` in the LOOK row),
  `e2e-health-check/health-check.spec.ts:139`.
- **Legend / Resource view / Comments** (Panels): `e2e-resource-view/resource-view.spec.ts:93`, `:195`,
  `stacked-histogram.spec.ts:52`, `e2e-netpoint-grammar/milestones.spec.ts:89`, `e2e-arrange/link-language.spec.ts:86`,
  `e2e-workspace-chrome/activities-panel-scroll.spec.ts:634` (`/^Comments/`).
- **Apply levelled / Settings:** `placement-overlays.spec.ts:378`, `:530` (id `apply-levelling`), `e2e/schedule.spec.ts:154`
  (a comment naming `calendar`).
- **Promotable (M5), at Playwright's default 1280 x 720 viewport (80 rem, so stage 1 applies)** — Health check… and
  Share… promote at 80 rem on fine, so these menu flows will find the item **on the bar, not in the menu**:
  `e2e-health-check/health-check.spec.ts:38`, `:146`, `e2e-workspace-chrome/dock.spec.ts:295`,
  `activities-panel-scroll.spec.ts:648`, `e2e-interchange/interchange.spec.ts:117`, `e2e-share/share.spec.ts:55`,
  `:351`. Compare revisions…, Earned value… and the `Has conflict` / `Late-start overlay` rows promote only from 90-160
  rem (`e2e-revision-compare/*:49,59,196`, `e2e/baselines.spec.ts:290`, `e2e-workspace-chrome/conflict-review.spec.ts:178,191`,
  `e2e-undo/undo.spec.ts:419`), which no default-viewport journey reaches.
- **The surface suite itself:** `e2e-workspace-fit/command-surface.spec.ts` (LINES at `:540-552` with `1024: { max: 4 }`,
  `BAND_MAX_PX` `:535`, group membership by id `:693-709`, `add-activity` `:719`, the control census at `:964`, `:1180`).

**Unit / structural tier** (re-derived by typecheck at M1-T2; the files that name the deleted or moved symbols):
`src/components/ui/toolbar/toolbar-registry.test.ts`, `Toolbar.test.tsx`, `Deck.test.tsx`;
`src/features/gantt/toolbar-in-gantt.test.tsx`; `src/features/tsld/toolbar/tsld-toolbar-apply-levelling.test.tsx`,
`use-tsld-toolbar-context.apply-levelling.test.tsx`, `settings-icon.test.tsx`, `ellipsis-convention.structural.test.ts`;
`src/features/float-paths/float-paths-view-agnostic.structural.test.ts`; `src/features/tsld/toolbar/tsld-toolbar-float-paths.test.tsx`;
`measure-toolbar/m1-icon-only.spec.ts` (reads `ICON_ONLY`).

## 12. Decision-bearing numbers re-verified (CLAUDE.md §19.11)

Right (reproduced): header 40/44; deck 168 / 80 / 200 px; canvas 274 / 562 / 234 / 586; coarse lines 4 / 4 / 3 / 2;
group widths 733 / 513 / 627 / 622; compact savings 107 / 71 / 66; View panel 584 of 600; #471 band 355 / 603 and
header 88 / 136; search 168 below 1600 and 240 above; `TsldMinimap.tsx:400`, `TsldCanvas.tsx:889`, `:2685`, `:1602`
(600 px rule); `Deck.tsx:137-148`, `:433`; `Toolbar.tsx:295`; `ToolbarButton.tsx:105`, `:131`; `tsld-toolbar-items.tsx:1114-1125`;
`selection-actions.tsx:934`; `command-surface.spec.ts:535`; `globals.css:31,36`; `breakpoints.ts:14`; `menu.tsx:26-27`;
`app-shell.tsx:195-200` (`col-span-2`).

Wrong, with the corrected figure: section 0 items 1-13 (LOOK 942 -> 981; DO margin 66 -> 40; promoted widths; the
free-width table; C1 250 -> 430; View 2-column 420 unreachable; "no scrollbar"; arbitrary container values; the stale
`selection-actions.tsx:206`; SC-5's 99 / 100 %). The spec's note that `float-paths-view-agnostic.structural.test.ts` is
under `tsld/toolbar` is wrong: it is `src/features/float-paths/`.

## 13. What M1 can and cannot do next

Readings that stand on their own and do not depend on the open premises: M1-T1 (stale lines), M1-T2 (delete the dead
ladder) and M1-T3 (the label API) are all behaviour-neutral or label-only, and nothing here argues against them.
**What cannot go as written is M1's outcome and journey** ("two lines at 1024", `LINES[1024] = 2`): they need M2 and M4
first (and Float paths, section 3), and the conflicts and coarse cases need a product decision (a fourth compaction,
Resource view -94.8 px fine, or a smaller chip) before any journey can assert them. Recommended: ask the product owner
the two questions in the report, amend the plan's sequencing, then start M1-T1/T2.

Reproduce: `PLAYWRIGHT_CHROMIUM_PATH=... DATABASE_URL=... pnpm --filter @repo/web measure:toolbar toolbar-redesign-m0`
(about 3.5 minutes per pointer; both write `apps/web/measure-output/toolbar-redesign-m0.<pointer>.json`).
