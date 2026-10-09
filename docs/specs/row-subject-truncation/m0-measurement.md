# M0 — row subject truncation, measured with an instrument that can see it

- **Spec / plan:** [`feature-spec.md`](./feature-spec.md), [`implementation-plan.md`](./implementation-plan.md) (Draft, M0 approved only)
- **Taken:** 2026-10-09, Chromium (`/opt/pw-browsers/chromium-1194`), headless, device pixel ratio 1
- **Build:** `web 0.183.1 · api 0.88.1`, read off the shell footer (the spec's figures were `web 0.182.0`)
- **Tree:** today's `RowSubject` — `git diff 2feb7eb HEAD -- apps/web/src/components/ui/page/list-row.tsx` is empty, so
  nothing has touched the component since `landing-two-columns/m1-after-run.md` measured it. The only product
  edit in this milestone is the inert `data-row-subject` attribute (M0-T1 step 2).
- **Harness:** `apps/web/scripts/measure-overview.mjs` with `SP_ROW_SUBJECT=1`, the probe in
  `apps/web/scripts/row-subject-probe.mjs`, fixture additions in `landing-fixture.mjs` (`seedLongNames`).
  Raw runs: [`m0-raw-run.md`](./m0-raw-run.md) (no 200-character plan) and
  [`m0-raw-run-maxima.md`](./m0-raw-run-maxima.md) (with it). Explorer at its default 276 px throughout.
- **Units.** "characters" are **non-space** characters (the probe tests each glyph's own rect), so
  `NetPoint reference: power-plant programme` is 42 characters and **38** here. The 4 spaces are not counted.

## 1. The verdict on the instrument (SC-2, the before-control)

**The old instrument could not see a clipped name, and the new one sees them.** On today's tree, at every cell:

| Cell        | Names clipped (new probe) | Contexts clipped (new probe) | Truncated runs the OLD instrument reports |
| ----------- | ------------------------: | ---------------------------: | ----------------------------------------: |
| 1024 × 600  |                  16 of 17 |                           16 |                                        16 |
| 1280 × 800  |                         6 |                            6 |                                         6 |
| 1465 × 900  |                         3 |                            3 |                                         3 |
| 1477 × 900  |                        17 |                           17 |                                        17 |
| 1646 × 1000 |                        16 |                           16 |                                        16 |
| 1912 × 948  |                        11 |                           11 |                                        11 |
| 1912 × 1114 |                        11 |                           11 |                                        11 |

The old count equals the **context** count in every cell and contains **no name**, as the spec predicted
(`measure-overview.mjs:449-453`). Every name the old instrument missed is in the middle column.

The reading is not a flattering one for the probe, so it was checked three ways:

1. **It reproduces the previous instrument on the half that instrument could see.** Ordinary-pair context shown at
   1912 × 948 is 258 px of 284 (`m1-after-run.md`: 237–258), at 1477 × 900 124 px (106–124), at 1024 × 600 232 px
   (212–232). Same machine of numbers, so the probe is not inventing clipping.
2. **A rect-sum bug was found and fixed before any figure below was taken.** Chrome returns two rects for a truncated run
   (the painted box and the natural extent, from one left edge), so summing widths doubled them; widths are now the
   union of intervals per line. The first run's 399 px "median name shown" was that bug.
3. **Positive control (SC-2, today's tree).** A token of 32 × `W` (~400 px, wider than the 300 px the spec names, because the
   probe reads glyph rects and a bare 300 px empty box overflows nothing it can see) injected into one **unclipped**
   context at 1280 × 800: before = not clipped, after = **clipped, 66 of 71 characters shown. PASS.** The spec places this
   control at 320 × 800; on today's tree every row at 320 is already clipped, so no count could rise there. The control
   therefore runs at 1280 and compares **the one subject** before and after. (It also passes at 320 × 800 on the M0-T3
   prototype, where nothing is clipped beforehand: 60 of 71 shown after. See `m0-prototype.md`.)

The spec's own SC-2 before-control ("at least one name clipped at 1912 × 948") **passes: 11 names clipped**, and the
ordinary one the M0 author photographed is in them — `Dockside — Ancillary works 6` loses its `6` (23 of 24 characters,
207 of 213 px) in "Recently changed" at 1912 × 948. That is a plan whose project and client are the **short** fixture pair,
so the clipping is not an artefact of the long-name additions.

**Decision rule (a) (names never clipped → withdraw the name half): not triggered.** Names are clipped in every one of the 13 cells
(3 of 17 at the best, 1465 × 900).

## 2. Names and contexts shown — the four widths asked for (Explorer open)

Row is a plan in the box; the plans are the long-name additions (`NetPoint reference: power-plant programme`,
`EDF - Hynamics Proposal`, a 57-character Draft) and the ordinary `Dockside — Ancillary works 6`. **Caveat for reading the long
names:** all three share a **76-character project and client** (`Estuary Crossing Programme — Western Approaches ·
Northern Ports and Harbours Authority`), and because the context shrinks ×3 before the name does, a long context is what
clips their names. The product owner's own `EDF - Hynamics Proposal` is clipped here only because of that
fixture context; `Dockside — Ancillary works 6` is the clean case. Both effects are what the spec's arithmetic predicts.

| Cell     | Box                   | Row                                      | Name shown (non-space ch / px) | Context shown (non-space ch / px) |
| -------- | --------------------- | ---------------------------------------- | ------------------------------ | --------------------------------- |
| 1024x600 | Recently changed      | NetPoint (42 ch name)                    | 30/38 **clipped** (251/326 px) | 24/76 **clipped** (181/584 px)    |
| 1024x600 | Recently changed      | EDF - Hynamics Proposal (23)             | 15/20 **clipped** (152/184 px) | 35/76 **clipped** (280/584 px)    |
| 1024x600 | Recently changed      | Dockside — Ancillary works 6 (28)        | 23/24 **clipped** (200/213 px) | 31/39 **clipped** (232/284 px)    |
| 1024x600 | Recently changed      | Berth 4 … Stage 2B (58)                  | 35/49 **clipped** (333/461 px) | 14/76 **clipped** (99/584 px)     |
| 1024x600 | Where the work stands | NetPoint (42 ch name)                    | 31/38 **clipped** (257/326 px) | 26/76 **clipped** (213/584 px)    |
| 1024x600 | Where the work stands | EDF - Hynamics Proposal (23)             | 16/20 **clipped** (156/184 px) | 39/76 **clipped** (314/584 px)    |
| 1024x600 | Where the work stands | Dockside — Ancillary works 6 (28)        | 23/24 **clipped** (208/213 px) | 35/39 **clipped** (262/284 px)    |
| 1024x600 | Where the work stands | Berth 4 … Stage 2B (58)                  | 36/49 **clipped** (341/461 px) | 17/76 **clipped** (128/584 px)    |
| 1024x600 | Jump back in          | Dockside — Quay Wall Reconstruction (35) | 31/31 (276/276 px)             | 39/39 (284/284 px)                |
| 1280x800 | Recently changed      | NetPoint (42 ch name)                    | 35/38 **clipped** (291/326 px) | 50/76 **clipped** (397/584 px)    |
| 1280x800 | Recently changed      | EDF - Hynamics Proposal (23)             | 18/20 **clipped** (176/184 px) | 65/76 **clipped** (512/584 px)    |
| 1280x800 | Recently changed      | Dockside — Ancillary works 6 (28)        | 24/24 (213/213 px)             | 39/39 (284/284 px)                |
| 1280x800 | Recently changed      | Berth 4 … Stage 2B (58)                  | 41/49 **clipped** (387/461 px) | 38/76 **clipped** (301/584 px)    |
| 1280x800 | Where the work stands | NetPoint (42 ch name)                    | 35/38 **clipped** (297/326 px) | 55/76 **clipped** (428/584 px)    |
| 1280x800 | Where the work stands | EDF - Hynamics Proposal (23)             | 19/20 **clipped** (180/184 px) | 69/76 **clipped** (545/584 px)    |
| 1280x800 | Where the work stands | Dockside — Ancillary works 6 (28)        | 24/24 (213/213 px)             | 39/39 (284/284 px)                |
| 1280x800 | Where the work stands | Berth 4 … Stage 2B (58)                  | 42/49 **clipped** (395/461 px) | 42/76 **clipped** (331/584 px)    |
| 1280x800 | Jump back in          | Dockside — Quay Wall Reconstruction (35) | 31/31 (276/276 px)             | 39/39 (284/284 px)                |
| 1465x900 | Recently changed      | NetPoint (42 ch name)                    | 37/38 **clipped** (320/326 px) | 70/76 **clipped** (553/584 px)    |
| 1465x900 | Recently changed      | EDF - Hynamics Proposal (23)             | 20/20 (184/184 px)             | 76/76 (584/584 px)                |
| 1465x900 | Recently changed      | Dockside — Ancillary works 6 (28)        | 24/24 (213/213 px)             | 39/39 (284/284 px)                |
| 1465x900 | Recently changed      | Berth 4 … Stage 2B (58)                  | 45/49 **clipped** (425/461 px) | 57/76 **clipped** (448/584 px)    |
| 1465x900 | Where the work stands | NetPoint (42 ch name)                    | 38/38 (326/326 px)             | 76/76 (584/584 px)                |
| 1465x900 | Where the work stands | EDF - Hynamics Proposal (23)             | 20/20 (184/184 px)             | 76/76 (584/584 px)                |
| 1465x900 | Where the work stands | Dockside — Ancillary works 6 (28)        | 24/24 (213/213 px)             | 39/39 (284/284 px)                |
| 1465x900 | Where the work stands | Berth 4 … Stage 2B (58)                  | 46/49 **clipped** (433/461 px) | 60/76 **clipped** (477/584 px)    |
| 1465x900 | Jump back in          | Dockside — Quay Wall Reconstruction (35) | 31/31 (276/276 px)             | 39/39 (284/284 px)                |
| 1912x948 | Recently changed      | NetPoint (42 ch name)                    | 31/38 **clipped** (256/326 px) | 25/76 **clipped** (209/584 px)    |
| 1912x948 | Recently changed      | EDF - Hynamics Proposal (23)             | 16/20 **clipped** (155/184 px) | 39/76 **clipped** (310/584 px)    |
| 1912x948 | Recently changed      | Dockside — Ancillary works 6 (28)        | 23/24 **clipped** (207/213 px) | 35/39 **clipped** (258/284 px)    |
| 1912x948 | Recently changed      | Berth 4 … Stage 2B (58)                  | 36/49 **clipped** (340/461 px) | 17/76 **clipped** (125/584 px)    |
| 1912x948 | Where the work stands | NetPoint (42 ch name)                    | 31/38 **clipped** (262/326 px) | 30/76 **clipped** (240/584 px)    |
| 1912x948 | Where the work stands | EDF - Hynamics Proposal (23)             | 16/20 **clipped** (159/184 px) | 43/76 **clipped** (344/584 px)    |
| 1912x948 | Where the work stands | Dockside — Ancillary works 6 (28)        | 24/24 (213/213 px)             | 39/39 (284/284 px)                |
| 1912x948 | Where the work stands | Berth 4 … Stage 2B (58)                  | 36/49 **clipped** (348/461 px) | 21/76 **clipped** (154/584 px)    |
| 1912x948 | Jump back in          | Dockside — Quay Wall Reconstruction (35) | 31/31 (276/276 px)             | 39/39 (284/284 px)                |

Every plan whose name was whole beside a short context at 1280 and 1465 is clipped at 1912 × 948 — which is the layout
the product owner reported from. At 1465 × 900 (one column, grid 1140 px, the widest window that stays single-column
with the Explorer open — the figure the spec derived but never measured) only the long contexts clip, and the spec's
derived reading "like 1440's" holds: `Dockside — Ancillary works 6` whole (24/24, 39/39).

### Medians and counts per cell (all rows in the three boxes; 17 rows)

| Cell        | Name shown, median (px / ch) | Context shown, median (px / ch) | Median row height | Rows on >1 line (name+context) |
| ----------- | ---------------------------- | ------------------------------- | ----------------: | -----------------------------: |
| 1024 × 600  | 208 / 23                     | 232 / 31                        |                61 |                              0 |
| 1280 × 800  | 213 / 24                     | 284 / 39                        |                61 |                              0 |
| 1465 × 900  | 213 / 24                     | 284 / 39                        |                61 |                              0 |
| 1477 × 900  | 181 / 20                     | 124 / 16                        |                61 |                              0 |
| 1646 × 1000 | 198 / 22                     | 191 / 25                        |                61 |                              0 |
| 1912 × 948  | 213 / 24                     | 258 / 35                        |                61 |                              0 |
| 1912 × 1114 | 213 / 24                     | 258 / 35                        |                61 |                              0 |

Row height 61 is not one line of subject: in this fixture a "Where the work stands" or "Recently changed" row carries a second
line of its own (`No activities yet` / `Not yet calculated`). The subject itself is one line in every row, as the 0 says.

## 3. Whole rows per box, region heights (today)

| Cell            | Jump back in | Where the work stands | Recently changed | `<main>` scroll |
| --------------- | ------------ | --------------------- | ---------------- | --------------- |
| 1024 × 600      | 1/1, box 138 | 0/8, box 609          | 0/8, box 609     | 1995/549        |
| 1280 × 800      | 1/1, box 138 | 0/8, box 609          | 0/8, box 609     | 1995/749        |
| 1465 × 900      | 1/1, box 138 | 0/8, box 609          | 0/8, box 609     | 1995/849        |
| 1477 × 900      | 1/1, box 463 | 1/8, box 234          | 2/8, box 234     | 849/849         |
| **1646 × 1000** | 1/1, box 463 | **3/8, box 334**      | **3/8, box 334** | **949/949**     |
| **1912 × 948**  | 1/1, box 463 | **3/8, box 282**      | **3/8, box 282** | 897/897         |
| 1912 × 1114     | 1/1, box 463 | 5/8, box 448          | 5/8, box 448     | 1063/1063       |

(one column: boxes are sized to content, so "whole rows" there is against the page scroll, not a capped box.)

**With the 200 + 200 + 200 plan** (`m0-raw-run-maxima.md`): whole rows today are unchanged (the row is still one subject line and
61 px tall — its name shows 49 of 178 characters at 1912 × 948 and its project and client **0 of 357**, shown on no
line at all). The cost of that row appears only after the change (`m0-prototype.md`).

### Two premises of the spec that today's tree contradicts (reported, not worked around)

1. **SC-5 is already unmet before anything changes.** SC-5 grades "≥ 4 whole rows in a bottom-row box at 1646 × 1000
   (M9.4 measured 6)" and §3.3 says it "is expected to pass". Today it reads **3 whole rows in a 334 px box**, not 6 in 517 px.
   M9.4's 517 px / 6-row figures predate ADR-0182's two-column split (`web 0.134.0`); the box is 334 px now, in a fixture
   whose top row holds a 463 px "Jump back in"/"Needs your attention" pair. Whether this fixture's top row is what the
   product owner's data produces is not known; the number is the fixture's and is stated as such.
2. **"At 1912 × 948 the two bottom boxes are already at their `min-h-55` floor (220 px)" is not what is measured here:
   the boxes are 282 px.** They are at 220 px under the SC-8 spacing injection. Either the floor binds only for a different
   amount of top-row content, or the floor changed (`c865918` "drop the 220px box floor in one column" touched
   `OverviewScreen.tsx` after the spec's reading). The "before/after count there is reported, not graded" rule in SC-5 still
   works; the premise behind it ("~2 before") does not: it is **3** today.

## 4. 320 px and 200 %: the name column's width today (SC-6's ~12-character clause)

Measured as the row's primary block width ÷ the advance of `0` in the name's font, minimum over every row in each box:

| Cell                                   | Jump back in | Where the work stands | Recently changed | Verdict on "≥ ~12 characters"         |
| -------------------------------------- | -----------: | --------------------: | ---------------: | ------------------------------------- |
| **320 × 800**                          |           23 |                **10** |            **6** | **FAILS today** (6 and 10 characters) |
| 1280 × 800, `html { font-size: 200% }` |           42 |                    29 |               25 | passes                                |
| 1912 × 948, `html { font-size: 200% }` |           59 |                    57 |               57 | passes                                |

**Decision rule (b) is triggered.** At 320 px the name's available width today is **6 characters** in "Recently changed" and 10 in
"Where the work stands": the `shrink-0` trailing block (`Ada Lovelace · just now`, `No finish date yet`) takes what the name
needs, and `ListRow`'s trailing block is **in scope**. The plan's own rule is "the spec is amended before M1". M1 is therefore **not**
ready to build from the spec as written: `ListRow`'s trailing block has to move under the primary at narrow widths (a spec
amendment, and a public-contract change to a shared component, which is itself an ADR-0105 trigger). I stopped at M0 as told.
No such failure at 200 % text size: the 12-character clause passes at 1280 and 1912.

At 320 px the document does not overflow horizontally (`overflow-x` 0 in every cell, today) — the damage is clipping, not scroll.
The 320 reading was taken with the shell's "SchedulePoint is designed for larger screens" notice also on the page (ADR-0179);
the landing renders beneath it, and it is what the probe read.

## 5. The other injections today

| Cell                     | Names clipped | Contexts clipped | Median row h | `<main>` scroll |
| ------------------------ | ------------: | ---------------: | -----------: | --------------- |
| 320 × 800                |            17 |               17 |           81 | 2631/701        |
| 1280 × 800, 200 %        |            17 |               17 |          121 | 4003/701        |
| 1912 × 948, 200 %        |             6 |                6 |          121 | 3963/849        |
| 1280 × 800, text spacing |            11 |               11 |          122 | 3289/749        |
| 1477 × 900, text spacing |            17 |               17 |          122 | 1018/849        |
| 1912 × 948, text spacing |            17 |               17 |          122 | 1018/897        |

"Today's row truncates **more** at 200 % than at 100 %" is confirmed at 1280: **17 of 17** names clipped at 200 %, against 6 of 17 at 100 %.
That is F69's shape; the accessibility-reviewer's verdict is still M2's.

## 6. Things found that the plan did not say

- **Fixture:** every plan the API creates is `DRAFT`, so every row in the fixture wears the badge; the badge-less case is not produced.
  A `PATCH` to `ACTIVE` would produce it; not done in M0 (the badge-absent case is the easier one for the design).
- **`Jump back in` has one row** in this fixture (one plan opened), so its "name clipped" evidence is a single row: `Dockside — Quay Wall
Reconstruction`, whole at 1024–1912 except 1477 × 900, where it is clipped (29 of 31), and at 320 and 200 %.
- **Photographs** of today's tree: [`photos/`](./photos/) (`before-*`). Organisation names differ between photographs
  (each harness run creates its own organisation).
