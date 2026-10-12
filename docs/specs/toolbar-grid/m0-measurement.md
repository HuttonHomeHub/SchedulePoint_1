# Toolbar grid: M0 measurement record

Taken 2026-10-12 by `apps/web/measure-toolbar/toolbar-grid-m0.spec.ts` (a harness, not a gate; ADR-0081 §3), with
`toolbar-grid-m0-fit.mjs` turning its readings into the column-fit tables. Fine and coarse pointers, the container's
Chromium 1194, the M5/M6 fixture (a plan with a long name, three activities, one link, a peer who can hold the pen),
on `c7067690` (the approved spec) with no product code changed. Readings: `apps/web/measure-output/toolbar-grid-m0-*.json`
(not committed; the tables below are the record). Photographs: `photos/m0-*` (§9).

**How the readings were taken, and why they can be trusted.**

- **One sitting per pointer.** Every cell of a pointer is read in one run of one fixture (CLAUDE.md §17's canvas
  lesson). The harness was run **four times** on the untouched tree: runs one, two and three agree to **0 px across
  648 readings per pointer, with no line-count difference** (`natural`, `free` and every group width, every cell and
  state). The fourth is the committed photograph set, taken after a probe fix.
- **It reproduces the previous epic's record.** The live free gaps match `m6-measurement.md` §1 to within 0.1 px
  (LOOK pen, fine: 153.9 / 273.9 / 278.3 / 224.6 against 154 / 274 / 278.4 / 224.7 at 1024 / 1280 / 1440 / 1912; DO
  14.5 at 1440 fine and 15.4 at 1912 coarse, as recorded).
- **The ladder re-take is calibrated.** The ADR-0185 M5 procedure (`toolbar-redesign-m5.spec.ts`, promoted and
  unpromoted, then `promotion-widths.mjs`) was run on the **unmodified** tree as a control: it reproduces
  `promotion-ladder.ts` with **0 moves**. So the 10 moves in §8 come from the changes, not from noise.
- **Two free-width quantities, and which is which.** The _live gap_ is the space between the last non-trailing group
  and the trailing one on the real row (what `m6-measurement.md` reports). The _free width_ is `available - natural`,
  where natural is the row's no-wrap width on a clone: it is the ladder's currency (`freeWorst`) and the column's. The
  free width is the smaller (DO at 1440 fine: gap 14.5, free 6.5), because natural counts the row's own gaps.
- **States.** Pen held (`pen`); pen not held (`nopen`); Add armed with its longest label (`add-armed`, reads "Adding
  Finish milestone"); Link armed (`link-armed`, "Linking · FS"); the Gantt view (`gantt`); a peer holds the pen
  (`peer-pen`); a cycling conflict read-out (`conflict`); both of those (`conflict+peer-pen`). **Cells:** 640 × 480,
  1024 × 600, 1280 × 800, 1440 × 900, 1600 × 900, 1646 × 1097, 1912 × 1080, 2160 × 1200, 2560 × 1440.
- **Prototype costs** (§3) were taken on a local throwaway branch, never committed: each change alone, then all of
  them. The branch is deleted.

**Sign-off is not recorded here.** The photographs are material for SC-15; nothing in this file claims it was given.

## 0. What contradicts the spec

Two of the plan's M0-T2 stop rules fire (§10). The findings, most important first.

1. **The shared column does not fit, and the spec's reason for expecting it to is wrong.** §4.5 says "If Author is the
   wider lead (it looks wider in `before-1912.png`), the pad lands on LOOK, which has room (153 px fine at 1440 with a
   conflict)". Author **is** the wider lead at every stage on both pointers, but **by far more than LOOK has room for**:
   Author is 770 px at 1280 fine against View's 283, so the pad is 489 px against 139 px of room. On today's tree the
   literal rule (§4.5 steps 1 to 4) fits at **no stage on either pointer**. The strict reading (SC-10: no row gains a
   line in any state) with the armed states left out fits at **one** cell, fine 1912. The 153 px figure is the
   _gap_ at 1440 fine; the room the rule uses is 143 px (free width less 2), and the pad is 334 px. See §2.
2. **A projection after M1 to M3 changes the answer a little, not the conclusion.** With every prototype on and the
   ladder re-derived (§8), the literal rule fits at one cell (fine 2160) and the strict reading at three (fine 2160 and
   2560, coarse 2160), out of twelve pointer-stage cells. It fits at none below 2160. The column would exist only at
   the widest stages. §2 has both tables.
3. **The DO row already wraps with Add armed, and has no reserve with Link armed.** "Adding Finish milestone" (the label
   has **no colon**; the plan and spec write "Adding: Finish milestone") puts DO on **two lines today** at five of six
   fine stage cells (1280, 1440, 1600, 2160, 2560) and **every** coarse stage cell. The ladder never held that state
   (its worst state is a peer's pen). Link armed leaves DO **5.2 px** free at 1024 fine. So the spec's "the column uses
   the widest measured state, so the divider does not move" has no basis: the widest state is a state where the row is
   not one line, and a column set from it would be 898 to 1,621 px wide.
4. **Floor reserve: the gear move alone breaks it.** Moving Settings… to the row end behind an inset rule costs 12 px
   on DO, which wraps DO to two lines at 1024 fine **with Link armed** (free 5.2 px, so -6.8 px; band 139 to 183 px).
   Every unarmed state keeps one line (§4). This is stop rule 1.
5. **Forced colours: the chosen member is not distinguishable today.** The spec says forced colours "may" drop the
   fill. Measured: the chosen Diagram | Gantt segment and the chosen Colour value are **byte-identical in a screenshot**
   to their unchosen state (`cmp` on the two PNGs, §7). SC-5's forced-colours case therefore has to **add** the mark,
   not keep one.
6. **The plan's prototype list misses the largest width effect of M1.** Deleting the row marks gives **back 18 px per
   row** from 79 rem (measured), which the plan's cost list does not name. The "group gap" prototype alone costs
   +48 px (LOOK) and +32 px (DO) because the hidden mark is a flex child with a gap of its own; net of the mark's
   deletion the gap costs +30 and +14. The record reports both (§3). Likewise "Add:" dropped **saves** 33.5 px per
   milestone entry (the plan treats it as a cost), and the undo track **saves** 6 px.
7. **Baseline's word costs 57.2 px**, not "about 60", and it does wrap touch LOOK at 1280 with a conflict (§5).
8. **CQ-1 (b)'s "about 40 px" is 32 px:** "Find" measures 28.1 px in the deck's label font (14 px, weight 500) plus the
   4 px control gap. LOOK at 1024 with a conflict has 20.7 px free (28.6 px of live gap), so it still does not fit
   there. It does not change CQ-1.
9. **The Gantt view reads exactly as the pen state** (same group widths at every cell), so the plan's "Gantt view"
   state adds no new case.
10. **Contrast: every estimate in the spec was right to the first decimal** (§6). The hairline reads **1.54:1**, where
    `m6-measurement.md` recorded 1.53:1 from the same tokens (rounding).

## 1. Lead groups and free width, before

Lead groups are **View** (LOOK) and **Author** (DO); the other groups are Find and Panels (LOOK, Panels trailing) and
Plan (DO, trailing). The tables are `lead width / free width` per state, px (free is `available - natural`; a row's
line count is in brackets when not 1). Fine pointer first, then coarse.

At **1024 × 600**, fine: LOOK groups View 282.7, Find 398.9, Panels 164.5 (live gap 153.9, free 146; with a conflict
28.6 and 20.7); DO groups Author 626.7, Plan 321 (live gap 60.3, free 52.3). Coarse: LOOK free 38 (conflict -95.3, two
lines), DO -143.7 (two lines; the touch floor is up to four deck lines, ADR-0185 OD-2, and conflict reads four).

The full per-state tables follow the fit tables in §2.

## 2. Column fit, stage by stage

The rule is spec §4.5 steps 1 to 4: `column = max(LOOK lead, DO lead)`, in the widest state; the narrower row's pad is
`column - its lead`; its room is its worst-state free width after promotion less `safetyPx` (2 px); the column fits
when `pad <= room`. A stage cell is the narrowest window of its stage, so it is where the room is least. **Variant A**
takes every state, the armed ones included (the spec's "widest measured state"). **Variant B** leaves the two armed
states out. **Strict** applies the column to every state of both rows and asks that no row loses its line (SC-10); the
binding column names the row, state and slack that decides it.

### 2a. Today's tree (the approved spec's premise)

### fine pointer, before: variant A, every state including the armed ones (spec 4.5 literally)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 282.7  | Author 898    | 898    | LOOK         | 615.3 | 138.7                 | NO             | NO                        | look / conflict / -476.6      |
| PROMOTE_90             | 1440x900  | View 438.3  | Author 898    | 898    | LOOK         | 459.7 | 143.1                 | NO             | NO                        | look / conflict / -316.6      |
| PROMOTE_100            | 1600x900  | View 587.6  | Author 898    | 898    | LOOK         | 310.4 | 81.8                  | NO             | NO                        | look / conflict / -228.6      |
| PROMOTE_119_5          | 1912x1080 | View 892    | Author 1071.8 | 1071.8 | LOOK         | 179.8 | 89.4                  | NO             | NO                        | look / conflict / -90.4       |
| PROMOTE_135            | 2160x1200 | View 1058.9 | Author 1252.5 | 1252.5 | LOOK         | 193.6 | 22.5                  | NO             | NO                        | look / conflict / -171.1      |
| PROMOTE_160            | 2560x1440 | View 1058.9 | Author 1621.1 | 1621.1 | LOOK         | 562.2 | 422.5                 | NO             | NO                        | look / conflict / -139.7      |
| (1646, in PROMOTE_100) | 1646x1097 | View 587.6  | Author 898    | 898    | LOOK         | 310.4 | 127.8                 | NO             | NO                        | look / conflict / -182.6      |

### fine pointer, before: variant B, the armed states left out (an armed tool grows its own row; nothing sets the column from it)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 282.7  | Author 772.1  | 772.1  | LOOK         | 489.4 | 138.7                 | NO             | NO                        | look / conflict / -350.7      |
| PROMOTE_90             | 1440x900  | View 438.3  | Author 772.1  | 772.1  | LOOK         | 333.8 | 143.1                 | NO             | NO                        | look / conflict / -190.7      |
| PROMOTE_100            | 1600x900  | View 587.6  | Author 772.1  | 772.1  | LOOK         | 184.5 | 81.8                  | NO             | NO                        | look / conflict / -102.7      |
| PROMOTE_119_5          | 1912x1080 | View 892    | Author 946    | 946    | LOOK         | 54    | 89.4                  | yes            | yes                       | look / conflict / 35.4        |
| PROMOTE_135            | 2160x1200 | View 1058.9 | Author 1126.7 | 1126.7 | LOOK         | 67.8  | 22.5                  | NO             | NO                        | look / conflict / -45.3       |
| PROMOTE_160            | 2560x1440 | View 1058.9 | Author 1495.2 | 1495.2 | LOOK         | 436.3 | 422.5                 | NO             | NO                        | look / conflict / -13.8       |
| (1646, in PROMOTE_100) | 1646x1097 | View 587.6  | Author 772.1  | 772.1  | LOOK         | 184.5 | 127.8                 | NO             | NO                        | look / conflict / -56.7       |

#### fine: lead width / free width per state (px; lines in brackets when not 1)

| Stage                  | Cell      | Row         | pen            | add-armed          | nopen          | link-armed         | gantt          | peer-pen       | conflict       | conflict+peer-pen |
| ---------------------- | --------- | ----------- | -------------- | ------------------ | -------------- | ------------------ | -------------- | -------------- | -------------- | ----------------- |
| PROMOTE_80             | 1280x800  | LOOK (View) | 282.7 / 266    | 282.7 / 266        | 282.7 / 266    | 282.7 / 266        | 282.7 / 266    | 282.7 / 266    | 282.7 / 140.7  | 282.7 / 140.7     |
| PROMOTE_80             | 1280x800  | DO (Author) | 770 / 21.3     | 898 / -106.7 [2]   | 772.1 / 19.2   | 817.1 / -25.8 [2]  | 770 / 21.3     | 772.1 / 19.2   | 770 / 21.3     | 772.1 / 19.2      |
| PROMOTE_90             | 1440x900  | LOOK (View) | 438.3 / 270.4  | 438.3 / 270.4      | 438.3 / 270.4  | 438.3 / 270.4      | 438.3 / 270.4  | 438.3 / 270.4  | 438.3 / 145.1  | 438.3 / 145.1     |
| PROMOTE_90             | 1440x900  | DO (Author) | 770 / 6.5      | 898 / -121.5 [2]   | 772.1 / 4.4    | 817.1 / -40.6 [2]  | 770 / 6.5      | 772.1 / 4.4    | 770 / 6.5      | 772.1 / 4.4       |
| PROMOTE_100            | 1600x900  | LOOK (View) | 587.6 / 209.1  | 587.6 / 209.1      | 587.6 / 209.1  | 587.6 / 209.1      | 587.6 / 209.1  | 587.6 / 209.1  | 587.6 / 83.8   | 587.6 / 83.8      |
| PROMOTE_100            | 1600x900  | DO (Author) | 770 / 5.7      | 898 / -122.3 [2]   | 772.1 / 3.6    | 817.1 / -41.4 [2]  | 770 / 5.7      | 772.1 / 3.6    | 770 / 5.7      | 772.1 / 3.6       |
| PROMOTE_119_5          | 1912x1080 | LOOK (View) | 892 / 216.7    | 892 / 216.7        | 892 / 216.7    | 892 / 216.7        | 892 / 216.7    | 892 / 216.7    | 892 / 91.4     | 892 / 91.4        |
| PROMOTE_119_5          | 1912x1080 | DO (Author) | 943.8 / 143.8  | 1071.8 / 15.9      | 946 / 141.7    | 990.9 / 96.8       | 943.8 / 143.8  | 946 / 141.7    | 943.8 / 143.8  | 946 / 141.7       |
| PROMOTE_135            | 2160x1200 | LOOK (View) | 1058.9 / 149.8 | 1058.9 / 149.8     | 1058.9 / 149.8 | 1058.9 / 149.8     | 1058.9 / 149.8 | 1058.9 / 149.8 | 1058.9 / 24.5  | 1058.9 / 24.5     |
| PROMOTE_135            | 2160x1200 | DO (Author) | 1124.6 / 29.9  | 1252.5 / -98.1 [2] | 1126.7 / 27.8  | 1171.7 / -17.2 [2] | 1124.6 / 29.9  | 1126.7 / 27.8  | 1124.6 / 29.9  | 1126.7 / 27.8     |
| PROMOTE_160            | 2560x1440 | LOOK (View) | 1058.9 / 549.8 | 1058.9 / 549.8     | 1058.9 / 549.8 | 1058.9 / 549.8     | 1058.9 / 549.8 | 1058.9 / 549.8 | 1058.9 / 424.5 | 1058.9 / 424.5    |
| PROMOTE_160            | 2560x1440 | DO (Author) | 1493.1 / 61.3  | 1621.1 / -66.6 [2] | 1495.2 / 59.2  | 1540.2 / 14.3      | 1493.1 / 61.3  | 1495.2 / 59.2  | 1493.1 / 61.3  | 1495.2 / 59.2     |
| (1646, in PROMOTE_100) | 1646x1097 | LOOK (View) | 587.6 / 255.1  | 587.6 / 255.1      | 587.6 / 255.1  | 587.6 / 255.1      | 587.6 / 255.1  | 587.6 / 255.1  | 587.6 / 129.8  | 587.6 / 129.8     |
| (1646, in PROMOTE_100) | 1646x1097 | DO (Author) | 770 / 51.7     | 898 / -76.3 [2]    | 772.1 / 49.6   | 817.1 / 4.6        | 770 / 51.7     | 772.1 / 49.6   | 770 / 51.7     | 772.1 / 49.6      |

### coarse pointer, before: variant A, every state including the armed ones (spec 4.5 literally)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 350.7  | Author 926.6  | 926.6  | LOOK         | 575.9 | 14.7                  | NO             | NO                        | look / conflict / -561.2      |
| PROMOTE_90             | 1440x900  | View 514.3  | Author 926.6  | 926.6  | LOOK         | 412.3 | 11.1                  | NO             | NO                        | look / conflict / -401.2      |
| PROMOTE_100            | 1600x900  | View 514.3  | Author 1108.5 | 1108.5 | LOOK         | 594.2 | 99.1                  | NO             | NO                        | look / conflict / -495.1      |
| PROMOTE_119_5          | 1912x1080 | View 842.7  | Author 1297.2 | 1297.2 | LOOK         | 454.5 | 82.7                  | NO             | NO                        | look / conflict / -371.8      |
| PROMOTE_135            | 2160x1200 | View 1000   | Author 1297.2 | 1297.2 | LOOK         | 297.2 | 17.4                  | NO             | NO                        | look / conflict / -279.8      |
| PROMOTE_160            | 2560x1440 | View 1174.9 | Author 1689.8 | 1689.8 | LOOK         | 514.9 | 242.5                 | NO             | NO                        | look / conflict / -272.4      |
| (1646, in PROMOTE_100) | 1646x1097 | View 514.3  | Author 1108.5 | 1108.5 | LOOK         | 594.2 | 145.1                 | NO             | NO                        | look / conflict / -449.1      |

### coarse pointer, before: variant B, the armed states left out (an armed tool grows its own row; nothing sets the column from it)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 350.7  | Author 800.8  | 800.8  | LOOK         | 450.1 | 14.7                  | NO             | NO                        | look / conflict / -435.4      |
| PROMOTE_90             | 1440x900  | View 514.3  | Author 800.8  | 800.8  | LOOK         | 286.5 | 11.1                  | NO             | NO                        | look / conflict / -275.4      |
| PROMOTE_100            | 1600x900  | View 514.3  | Author 982.6  | 982.6  | LOOK         | 468.3 | 99.1                  | NO             | NO                        | look / conflict / -369.2      |
| PROMOTE_119_5          | 1912x1080 | View 842.7  | Author 1171.4 | 1171.4 | LOOK         | 328.7 | 82.7                  | NO             | NO                        | look / conflict / -246        |
| PROMOTE_135            | 2160x1200 | View 1000   | Author 1171.4 | 1171.4 | LOOK         | 171.4 | 17.4                  | NO             | NO                        | look / conflict / -154        |
| PROMOTE_160            | 2560x1440 | View 1174.9 | Author 1563.9 | 1563.9 | LOOK         | 389   | 242.5                 | NO             | NO                        | look / conflict / -146.5      |
| (1646, in PROMOTE_100) | 1646x1097 | View 514.3  | Author 982.6  | 982.6  | LOOK         | 468.3 | 145.1                 | NO             | NO                        | look / conflict / -323.2      |

#### coarse: lead width / free width per state (px; lines in brackets when not 1)

| Stage                  | Cell      | Row         | pen            | add-armed           | nopen          | link-armed         | gantt          | peer-pen       | conflict       | conflict+peer-pen |
| ---------------------- | --------- | ----------- | -------------- | ------------------- | -------------- | ------------------ | -------------- | -------------- | -------------- | ----------------- |
| PROMOTE_80             | 1280x800  | LOOK (View) | 350.7 / 150    | 350.7 / 150         | 350.7 / 150    | 350.7 / 150        | 350.7 / 150    | 350.7 / 150    | 350.7 / 16.7   | 350.7 / 16.7      |
| PROMOTE_80             | 1280x800  | DO (Author) | 798.7 / 48.5   | 926.6 / -79.4 [2]   | 800.8 / 46.4   | 845.8 / 1.4        | 798.7 / 48.5   | 800.8 / 46.4   | 798.7 / 48.5   | 800.8 / 46.4      |
| PROMOTE_90             | 1440x900  | LOOK (View) | 514.3 / 146.4  | 514.3 / 146.4       | 514.3 / 146.4  | 514.3 / 146.4      | 514.3 / 146.4  | 514.3 / 146.4  | 514.3 / 13.1   | 514.3 / 13.1      |
| PROMOTE_90             | 1440x900  | DO (Author) | 798.7 / 74.8   | 926.6 / -53.2 [2]   | 800.8 / 72.7   | 845.8 / 27.7       | 798.7 / 74.8   | 800.8 / 72.7   | 798.7 / 74.8   | 800.8 / 72.7      |
| PROMOTE_100            | 1600x900  | LOOK (View) | 514.3 / 234.4  | 514.3 / 234.4       | 514.3 / 234.4  | 514.3 / 234.4      | 514.3 / 234.4  | 514.3 / 234.4  | 514.3 / 101.1  | 514.3 / 101.1     |
| PROMOTE_100            | 1600x900  | DO (Author) | 980.5 / 52.9   | 1108.5 / -75 [2]    | 982.6 / 50.8   | 1027.6 / 5.8       | 980.5 / 52.9   | 982.6 / 50.8   | 980.5 / 52.9   | 982.6 / 50.8      |
| PROMOTE_119_5          | 1912x1080 | LOOK (View) | 842.7 / 218    | 842.7 / 218         | 842.7 / 218    | 842.7 / 218        | 842.7 / 218    | 842.7 / 218    | 842.7 / 84.7   | 842.7 / 84.7      |
| PROMOTE_119_5          | 1912x1080 | DO (Author) | 1169.3 / 7.4   | 1297.2 / -120.5 [2] | 1171.4 / 5.3   | 1216.4 / -39.7 [2] | 1169.3 / 7.4   | 1171.4 / 5.3   | 1169.3 / 7.4   | 1171.4 / 5.3      |
| PROMOTE_135            | 2160x1200 | LOOK (View) | 1000 / 152.7   | 1000 / 152.7        | 1000 / 152.7   | 1000 / 152.7       | 1000 / 152.7   | 1000 / 152.7   | 1000 / 19.4    | 1000 / 19.4       |
| PROMOTE_135            | 2160x1200 | DO (Author) | 1169.3 / 110.4 | 1297.2 / -17.5 [2]  | 1171.4 / 108.3 | 1216.4 / 63.3      | 1169.3 / 110.4 | 1171.4 / 108.3 | 1169.3 / 110.4 | 1171.4 / 108.3    |
| PROMOTE_160            | 2560x1440 | LOOK (View) | 1174.9 / 377.8 | 1174.9 / 377.8      | 1174.9 / 377.8 | 1174.9 / 377.8     | 1174.9 / 377.8 | 1174.9 / 377.8 | 1174.9 / 244.5 | 1174.9 / 244.5    |
| PROMOTE_160            | 2560x1440 | DO (Author) | 1561.8 / 117.9 | 1689.8 / -10.1 [2]  | 1563.9 / 115.8 | 1608.9 / 70.8      | 1561.8 / 117.9 | 1563.9 / 115.8 | 1561.8 / 117.9 | 1563.9 / 115.8    |
| (1646, in PROMOTE_100) | 1646x1097 | LOOK (View) | 514.3 / 280.4  | 514.3 / 280.4       | 514.3 / 280.4  | 514.3 / 280.4      | 514.3 / 280.4  | 514.3 / 280.4  | 514.3 / 147.1  | 514.3 / 147.1     |
| (1646, in PROMOTE_100) | 1646x1097 | DO (Author) | 980.5 / 98.9   | 1108.5 / -29 [2]    | 982.6 / 96.8   | 1027.6 / 51.8      | 980.5 / 98.9   | 982.6 / 96.8   | 980.5 / 98.9   | 982.6 / 96.8      |

Fits strictly (every state): fine B 1912x1080

**Stages where the column fits on today's tree.** Literal rule, variant A: **none**, on either pointer. Literal, variant
B: fine 1912 only. Strict (every state): variant A none; variant B fine 1912 only (slack 35.4 px, binding row LOOK with a
conflict). Coarse: **none**.

### 2b. Projected, after M1 to M3 (every prototype on, the ladder re-derived)

The tree of §3's "all of the above" with `promotion-ladder.ts` set to the stages §8 derives, then read by the same
harness. The armed-state rows are in the per-state data; the summary is:

### fine pointer, allonfinal: variant A, every state including the armed ones (spec 4.5 literally)

| Stage                  | Cell      | LOOK lead  | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ---------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 339.9 | Author 916    | 916    | LOOK         | 576.1 | 67.5                  | NO             | NO                        | look / conflict / -508.6      |
| PROMOTE_90             | 1440x900  | View 495.5 | Author 916    | 916    | LOOK         | 420.5 | 71.9                  | NO             | NO                        | look / conflict / -348.6      |
| PROMOTE_100            | 1600x900  | View 644.8 | Author 1056.4 | 1056.4 | LOOK         | 411.6 | 10.6                  | NO             | NO                        | look / conflict / -401        |
| PROMOTE_119_5          | 1912x1080 | View 955.1 | Author 1203.7 | 1203.7 | LOOK         | 248.6 | 12.3                  | NO             | NO                        | look / conflict / -236.3      |
| PROMOTE_135            | 2160x1200 | View 1122  | Author 1203.7 | 1203.7 | LOOK         | 81.7  | 93.4                  | yes            | NO                        | do / nopen / -61.3            |
| PROMOTE_160            | 2560x1440 | View 1122  | Author 1576.6 | 1576.6 | LOOK         | 454.6 | 345.4                 | NO             | NO                        | look / conflict / -109.2      |
| (1646, in PROMOTE_100) | 1646x1097 | View 644.8 | Author 1056.4 | 1056.4 | LOOK         | 411.6 | 56.6                  | NO             | NO                        | look / conflict / -355        |

### fine pointer, allonfinal: variant B, the armed states left out (an armed tool grows its own row; nothing sets the column from it)

| Stage                  | Cell      | LOOK lead  | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ---------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 339.9 | Author 790.1  | 790.1  | LOOK         | 450.2 | 67.5                  | NO             | NO                        | look / conflict / -382.7      |
| PROMOTE_90             | 1440x900  | View 495.5 | Author 790.1  | 790.1  | LOOK         | 294.6 | 71.9                  | NO             | NO                        | look / conflict / -222.7      |
| PROMOTE_100            | 1600x900  | View 644.8 | Author 930.5  | 930.5  | LOOK         | 285.7 | 10.6                  | NO             | NO                        | look / conflict / -275.1      |
| PROMOTE_119_5          | 1912x1080 | View 955.1 | Author 1077.8 | 1077.8 | LOOK         | 122.7 | 12.3                  | NO             | NO                        | look / conflict / -110.4      |
| PROMOTE_135            | 2160x1200 | View 1122  | Author 1077.8 | 1122   | DO           | 44.2  | 64.6                  | yes            | yes                       | do / nopen / 20.4             |
| PROMOTE_160            | 2560x1440 | View 1122  | Author 1450.7 | 1450.7 | LOOK         | 328.7 | 345.4                 | yes            | yes                       | look / conflict / 16.7        |
| (1646, in PROMOTE_100) | 1646x1097 | View 644.8 | Author 930.5  | 930.5  | LOOK         | 285.7 | 56.6                  | NO             | NO                        | look / conflict / -229.1      |

### coarse pointer, allonfinal: variant A, every state including the armed ones (spec 4.5 literally)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 407.9  | Author 944.6  | 944.6  | LOOK         | 536.7 | 69.5                  | NO             | NO                        | look / conflict / -467.2      |
| PROMOTE_90             | 1440x900  | View 407.9  | Author 944.6  | 944.6  | LOOK         | 536.7 | 103.5                 | NO             | NO                        | look / conflict / -433.2      |
| PROMOTE_100            | 1600x900  | View 571.5  | Author 1093.1 | 1093.1 | LOOK         | 521.6 | 27.9                  | NO             | NO                        | look / conflict / -493.7      |
| PROMOTE_119_5          | 1912x1080 | View 905.8  | Author 1248.4 | 1248.4 | LOOK         | 342.6 | 5.6                   | NO             | NO                        | look / conflict / -337        |
| PROMOTE_135            | 2160x1200 | View 1063.1 | Author 1248.4 | 1248.4 | LOOK         | 185.3 | 96.3                  | NO             | NO                        | look / conflict / -89         |
| PROMOTE_160            | 2560x1440 | View 1238   | Author 1645.3 | 1645.3 | LOOK         | 407.3 | 165.4                 | NO             | NO                        | look / conflict / -241.9      |
| (1646, in PROMOTE_100) | 1646x1097 | View 571.5  | Author 1093.1 | 1093.1 | LOOK         | 521.6 | 73.9                  | NO             | NO                        | look / conflict / -447.7      |

### coarse pointer, allonfinal: variant B, the armed states left out (an armed tool grows its own row; nothing sets the column from it)

| Stage                  | Cell      | LOOK lead   | DO lead       | Column | Narrower row | Pad   | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |
| ---------------------- | --------- | ----------- | ------------- | ------ | ------------ | ----- | --------------------- | -------------- | ------------------------- | ----------------------------- |
| PROMOTE_80             | 1280x800  | View 407.9  | Author 818.8  | 818.8  | LOOK         | 410.9 | 69.5                  | NO             | NO                        | look / conflict / -341.4      |
| PROMOTE_90             | 1440x900  | View 407.9  | Author 818.8  | 818.8  | LOOK         | 410.9 | 103.5                 | NO             | NO                        | look / conflict / -307.4      |
| PROMOTE_100            | 1600x900  | View 571.5  | Author 967.2  | 967.2  | LOOK         | 395.7 | 27.9                  | NO             | NO                        | look / conflict / -367.8      |
| PROMOTE_119_5          | 1912x1080 | View 905.8  | Author 1122.5 | 1122.5 | LOOK         | 216.7 | 5.6                   | NO             | NO                        | look / conflict / -211.1      |
| PROMOTE_135            | 2160x1200 | View 1063.1 | Author 1122.5 | 1122.5 | LOOK         | 59.4  | 96.3                  | yes            | yes                       | look / conflict / 36.9        |
| PROMOTE_160            | 2560x1440 | View 1238   | Author 1519.4 | 1519.4 | LOOK         | 281.4 | 165.4                 | NO             | NO                        | look / conflict / -116        |
| (1646, in PROMOTE_100) | 1646x1097 | View 571.5  | Author 967.2  | 967.2  | LOOK         | 395.7 | 73.9                  | NO             | NO                        | look / conflict / -321.8      |

**Stages where the column fits on the projected tree.** Literal, variant A: fine 2160 only. Strict, variant B: **fine 2160
and 2560, coarse 2160**. The other nine pointer-stage cells do not fit.

## 3. Prototype costs

Each change alone on a throwaway branch (never committed), the Chromium and fixture of the record, the pen state, the
**ladder not re-derived** (so a row can wrap here where the re-derived ladder would instead promote less; §8 gives
the moves). The change in a row's natural width, in px. The Baseline word is the `'roomy'` rule of D-1; the gear is
placed in the `output` section behind a 12 px rule (`ml-1` + `pl-2`); the D-4 rules are 12 px each; the undo track is a
1 px gap between the three members and no padding.

**fine pointer. Change in a row's natural width (px; + is wider), pen held. `[a->b]` is a line-count change, with the ladder not yet re-derived.**

| Change                                                                  | Row  | 1024x600 | 1280x800     | 1440x900     | 1600x900     | 1646x1097 | 1912x1080 | 2160x1200    | 2560x1440 |
| ----------------------------------------------------------------------- | ---- | -------- | ------------ | ------------ | ------------ | --------- | --------- | ------------ | --------- |
| group gap 8 to 24 px from 79 rem (alone: includes the mark's gap)       | LOOK | 0        | +48.0        | +48.0        | +48.0        | +48.0     | +48.0     | +48.0        | +48.0     |
|                                                                         | DO   | 0        | +32.0 [1->2] | +32.0 [1->2] | +32.0 [1->2] | +32.0     | +32.0     | +32.0 [1->2] | +32.0     |
| row marks deleted (M1; not on the plan's list, needed to read the rest) | LOOK | 0        | -18.0        | -18.0        | -18.0        | -18.0     | -18.0     | -18.0        | -18.0     |
|                                                                         | DO   | 0        | -18.0        | -18.0        | -18.0        | -18.0     | -18.0     | -18.0        | -18.0     |
| Baseline word from 79 rem                                               | LOOK | 0        | +57.2        | +57.2        | +57.2        | +57.2     | +57.2     | +57.2        | +57.2     |
|                                                                         | DO   | 0        | 0            | 0            | 0            | 0         | 0         | 0            | 0         |
| Colour caption `text-xs` to `text-sm`                                   | LOOK | 0        | 0            | 0            | 0            | 0         | +5.9      | +5.9         | +5.9      |
|                                                                         | DO   | 0        | 0            | 0            | 0            | 0         | 0         | 0            | +4.3      |
| undo track and History glyph (order swap)                               | LOOK | 0        | 0            | 0            | 0            | 0         | 0         | 0            | 0         |
|                                                                         | DO   | -6.0     | -6.0         | -6.0         | -6.0         | -6.0      | -6.0      | -6.0         | -6.0      |
| "Add:" dropped from the milestone labels                                | LOOK | 0        | 0            | 0            | 0            | 0         | 0         | 0            | 0         |
|                                                                         | DO   | 0        | 0            | 0            | 0            | 0         | -33.5     | -66.8        | -66.9     |
| gear moved to the row end behind a rule                                 | LOOK | 0        | 0            | 0            | 0            | 0         | 0         | 0            | 0         |
|                                                                         | DO   | +12.0    | +12.0        | +12.0 [1->2] | +12.0 [1->2] | +12.0     | +12.0     | +12.0        | +12.0     |
| D-4 inset rules: after the pen, before the undo track                   | LOOK | 0        | 0            | 0            | 0            | 0         | 0         | 0            | 0         |
|                                                                         | DO   | +24.0    | +24.0 [1->2] | +24.0 [1->2] | +24.0 [1->2] | +24.0     | +24.0     | +24.0        | +24.0     |
| ALL of the above, old ladder                                            | LOOK | 0        | +71.2        | +71.2        | +71.2        | +71.2     | +77.1     | +77.1        | +77.1     |
|                                                                         | DO   | +30.0    | +28.0 [1->2] | +28.0 [1->2] | +28.0 [1->2] | +28.0     | -5.5      | -38.8        | -34.6     |

**coarse pointer. Change in a row's natural width (px; + is wider), pen held. `[a->b]` is a line-count change, with the ladder not yet re-derived.**

| Change                                                                  | Row  | 1024x600 | 1280x800 | 1440x900 | 1600x900 | 1646x1097 | 1912x1080    | 2160x1200 | 2560x1440 |
| ----------------------------------------------------------------------- | ---- | -------- | -------- | -------- | -------- | --------- | ------------ | --------- | --------- |
| group gap 8 to 24 px from 79 rem (alone: includes the mark's gap)       | LOOK | 0        | +48.0    | +48.0    | +48.0    | +48.0     | +48.0        | +48.0     | +48.0     |
|                                                                         | DO   | 0        | +32.0    | +32.0    | +32.0    | +32.0     | +32.0 [1->2] | +32.0     | +32.0     |
| row marks deleted (M1; not on the plan's list, needed to read the rest) | LOOK | 0        | -18.0    | -18.0    | -18.0    | -18.0     | -18.0        | -18.0     | -18.0     |
|                                                                         | DO   | 0        | -18.0    | -18.0    | -18.0    | -18.0     | -18.0        | -18.0     | -18.0     |
| Baseline word from 79 rem                                               | LOOK | 0        | +57.2    | +57.2    | +57.2    | +57.2     | +57.3        | +57.2     | +57.2     |
|                                                                         | DO   | 0        | 0        | 0        | 0        | 0         | 0            | 0         | 0         |
| Colour caption `text-xs` to `text-sm`                                   | LOOK | 0        | 0        | 0        | 0        | 0         | +5.9         | +5.9      | +5.9      |
|                                                                         | DO   | 0        | 0        | 0        | 0        | 0         | 0            | 0         | +4.3      |
| undo track and History glyph (order swap)                               | LOOK | 0        | 0        | 0        | 0        | 0         | 0            | 0         | 0         |
|                                                                         | DO   | -6.0     | -6.0     | -6.0     | -6.0     | -6.0      | -6.0         | -6.0      | -6.0      |
| "Add:" dropped from the milestone labels                                | LOOK | 0        | 0        | 0        | 0        | 0         | 0            | 0         | 0         |
|                                                                         | DO   | 0        | 0        | 0        | -33.5    | -33.5     | -66.9        | -66.9     | -66.8     |
| gear moved to the row end behind a rule                                 | LOOK | 0        | 0        | 0        | 0        | 0         | 0            | 0         | 0         |
|                                                                         | DO   | +12.0    | +12.0    | +12.0    | +12.0    | +12.0     | +12.0 [1->2] | +12.0     | +12.0     |
| D-4 inset rules: after the pen, before the undo track                   | LOOK | 0        | 0        | 0        | 0        | 0         | 0            | 0         | 0         |
|                                                                         | DO   | +24.0    | +24.0    | +24.0    | +24.0    | +24.0     | +24.0 [1->2] | +24.0     | +24.0     |
| ALL of the above, old ladder                                            | LOOK | 0        | +71.2    | +71.2    | +71.2    | +71.2     | +77.1        | +77.1     | +77.1     |
|                                                                         | DO   | +30.0    | +28.0    | +28.0    | -5.5     | -5.5      | -38.9        | -38.9     | -34.5     |

Reading the table:

| Change                             | Cost on a row                                                                                                                                   | Where it applies                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Group gap 8 to 24 px               | LOOK +48, DO +32 alone (+30 and +14 net of the mark's gap, §0.6)                                                                                | From 1264 px (79 rem)                     |
| Row marks deleted                  | LOOK -18, DO -18                                                                                                                                | From 1264 px                              |
| Baseline word                      | LOOK +57.2                                                                                                                                      | From 1264 px; both pointers               |
| Colour caption `text-sm`           | LOOK +5.9                                                                                                                                       | Only where Colour is promoted (from 1912) |
| Undo track and History glyph       | DO -6                                                                                                                                           | Every width                               |
| "Add:" dropped                     | DO -33.5 per milestone entry on the bar (-66.8 with both)                                                                                       | Where the entries are promoted            |
| Gear to the row end                | DO +12                                                                                                                                          | Every width                               |
| D-4 rules (after pen, before undo) | DO +24                                                                                                                                          | Every width                               |
| Everything                         | LOOK +71.2 (+77.1 with Colour); DO +30 at 1024, +28 until the milestone entries are on the bar, then -5.5 to -38.9 (the table has each pointer) |                                           |

The Colour set's own track (a 1 px gap instead of 4 between three members) was not prototyped: the plan's list did not
include it, and it can only save width.

## 4. The floor check

All prototypes on, **old ladder**, 1024 × 600 (the stage-0 window; no promotion applies, so the ladder moves do not
touch this cell). `free` is `available - natural`, before then after.

#### fine: before -> allon2, 1024x600 and 640x480 (free px = available - natural; lines LOOK+DO; band px; header lines)

| Cell     | State             | LOOK free    | DO free         | Lines LOOK / DO | Deck lines | Band px  | Header lines |
| -------- | ----------------- | ------------ | --------------- | --------------- | ---------- | -------- | ------------ |
| 1024x600 | pen               | 146 -> 146   | 52.3 -> 22.3    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |
| 1024x600 | add-armed         | 146 -> 146   | -75.7 -> -105.7 | 1->1 / 2->2     | 3->3       | 183->183 | 2->2         |
| 1024x600 | nopen             | 146 -> 146   | 50.2 -> 20.2    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |
| 1024x600 | link-armed        | 146 -> 146   | 5.2 -> -24.8    | 1->1 / 1->2     | 2->3       | 139->183 | 2->2         |
| 1024x600 | gantt             | 146 -> 146   | 52.3 -> 22.3    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |
| 1024x600 | peer-pen          | 146 -> 146   | 50.2 -> 20.2    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |
| 1024x600 | conflict          | 20.7 -> 20.7 | 52.3 -> 22.3    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |
| 1024x600 | conflict+peer-pen | 20.7 -> 20.7 | 50.2 -> 20.2    | 1->1 / 1->1     | 2->2       | 139->139 | 2->2         |

#### coarse: before -> allon2, 1024x600 and 640x480 (free px = available - natural; lines LOOK+DO; band px; header lines)

| Cell     | State             | LOOK free      | DO free          | Lines LOOK / DO | Deck lines | Band px  | Header lines |
| -------- | ----------------- | -------------- | ---------------- | --------------- | ---------- | -------- | ------------ |
| 1024x600 | pen               | 38 -> 38       | -143.7 -> -173.7 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | add-armed         | 38 -> 38       | -271.7 -> -301.7 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | nopen             | 38 -> 38       | -145.8 -> -175.8 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | link-armed        | 38 -> 38       | -190.8 -> -220.8 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | gantt             | 38 -> 38       | -143.7 -> -173.7 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | peer-pen          | 38 -> 38       | -145.8 -> -175.8 | 1->1 / 2->2     | 3->3       | 211->211 | 2->2         |
| 1024x600 | conflict          | -95.3 -> -95.3 | -143.7 -> -173.7 | 2->2 / 2->2     | 4->4       | 263->263 | 2->2         |
| 1024x600 | conflict+peer-pen | -95.3 -> -95.3 | -145.8 -> -175.8 | 2->2 / 2->2     | 4->4       | 263->263 | 2->2         |

- **Every unarmed state keeps one line per row at 1024 fine** (pen, nopen, gantt, peer-pen, conflict,
  conflict+peer-pen): the smallest free widths are DO 20.2 px and LOOK 20.7 px (with a conflict).
- **Touch at 1024 stays at four deck lines at most** (conflict reads 4, unchanged; pen reads 3, unchanged).
- **Armed states.** Add armed already wraps DO today (-75.7 px fine, two lines). **Link armed wraps DO at 1024 fine with
  the prototypes on** (5.2 to -24.8 px, band 139 to 183 px). Run with each of its causes alone: the gear alone
  (-6.8 px), the D-4 rules alone (-18.8 px); the 12 px gear is the smallest that breaks it, and it breaks it on its own.
- (The harness's "header lines" column is a coarse metric and not `header-fit.spec.ts`'s; it reads 2 before and after.
  The header is not touched by the prototypes.)

## 5. Baseline's word on touch (M0-T2 item 2)

With the word showing (`'roomy'`) and the ladder unchanged, **touch LOOK wraps at coarse 1280 with a conflict**
(free 16.7 px against a 57.2 px word: one line to two), and again at 1440 and 2160. So **D-1 falls back to `'roomy-fine'`**
(the word on a mouse only, the rule Apply levelled dates… uses). The alternative the re-derived ladder shows is that
touch keeps the word and loses Critical only from 1280 to 1440 and Late-start overlay from 1440 to 1600 (§8). Fine
pointer: LOOK with the word and a conflict wraps only at 2160 (ladder not re-derived), and keeps one line at every
other cell.

## 6. Contrast, computed from the tokens

OKLCH to linear sRGB to WCAG luminance, resolved in the **chrome** scope by the same `resolve` and `fillOf` that
`token-contrast.test.ts` uses (the test run for this record was a scratch file, deleted; the pairs are not yet
assertions). Band luminance **0.0157**; `--field` luminance 0.0078; pure black on the band **1.31:1**.

**Today:**

| Pair                                                          | Ratio               |
| ------------------------------------------------------------- | ------------------- |
| `--foreground` on the band                                    | 15.31:1             |
| `--muted-foreground` on the band / on a pill                  | 7.98:1 / 7.17:1     |
| Pill (`--muted` at 50 %) against the band                     | **1.11:1**          |
| Hairline (`--border`) against the band / against the pill     | **1.54:1** / 1.55:1 |
| Closing ring (`--muted-foreground` at 60 %) on a pill         | **3.56:1**          |
| Locked Author dash (`--muted-foreground` at 50 %) on the band | 3.04:1              |
| Search outline (`--input`) on the band / on `--field`         | **4.39:1** / 4.99:1 |
| `--field` against the band                                    | 1.14:1              |

**As proposed (P1 to P7):**

| Pair  | What                                                                        | Reading                                                                  | Gate                                                                    |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| P1    | Group divider (`--muted-foreground` at 40 %) on the band                    | **2.43:1**                                                               | asserted at 2:1 (the 50 % alternative is 3.04:1)                        |
| P2    | Section rule (`--border`) on the band                                       | 1.54:1                                                                   | divider 2.43 outranks it                                                |
| P3    | Raised member (`--secondary`) on the track (`--field`)                      | **3.59:1**                                                               | asserted at 3:1 (on the band it is 3.15:1)                              |
| P4    | `--foreground` on `--field`                                                 | **17.40:1**                                                              | asserted at 4.5:1 (`--secondary-foreground` on `--secondary` is 4.85:1) |
| P5    | Focus ring (`--ring`) on `--field`                                          | **8.99:1**                                                               | asserted at 3:1                                                         |
| P5b   | Focus ring on a raised member (`--secondary`)                               | **2.51:1**                                                               | reported (same number as today's amber on the selected fill)            |
| P6    | Track (`--field`) on the band                                               | **1.14:1**                                                               | reported; no darker fill can pass 1.31:1                                |
| P7    | Search outline, lightest token at chroma 0.02, hue 264 clearing 3:1 on both | `oklch(0.530 0.02 264)`: **3.03:1** on the band, **3.44:1** on `--field` | asserted at 3:1 on both                                                 |
| (D-8) | The mock-up's raised `oklch(0.47 0.07 264)` on `--field`                    | **2.65:1**                                                               | under 3:1, as D-8 says                                                  |

## 7. Forced colours today (M0-T1 item 6)

`forcedColors: 'active'` is Chromium's emulation of Windows High Contrast, not the mode on hardware (the
`e2e-forced-colors` suites say the same), so this is the input to SC-5's forced-colours case and not a verdict on a
machine. At 1912 × 1080, the Diagram | Gantt segment and the Colour set read in both of their states:

- **The chosen member is not distinguishable.** Chosen: computed `background-color` is `rgb(255, 255, 255)` (the system
  `Canvas`), unchosen: transparent, over a `Canvas` page, so the same colour. No border (0 px), no outline, `box-shadow`
  `none`, same weight (500), no underline, no pseudo-element. The two screenshots of the segment, taken with Diagram then
  Gantt chosen, are **byte-identical** (`cmp`); the Colour set's likewise show no mark on the chosen value (the only
  strokes are the group's own border arcs).
- **So SC-5's forced-colours case adds the mark** rather than keeping one: a `forced-colors:` border or outline in a
  system colour on the raised member, as §4.4 R2 already proposes, is required, not optional.
- Photographs: `photos/m0-forced-colors-segment-{tsld,gantt}.png`, `photos/m0-forced-colors-colour-{criticality,wbs}.png`.

## 8. Ladder moves (M0-T2 item 4)

The M5 procedure re-run on the all-on tree (widths re-taken, `computePromotionStages` run over them): **ten entries
move, none to or from `never`.** Re-taken widths: Colour set +5.9 px (L2); Start milestone -33.5 and Finish milestone
-33.4 (P2, P3); Link "Type" set +4.4 (P5).

| Pointer | Rank | Entry              | Now              | Re-derived       |
| ------- | ---- | ------------------ | ---------------- | ---------------- |
| fine    | L6   | Has conflict only  | 135 rem (2160)   | 160 rem (2560)   |
| fine    | P1   | Health check       | 80 rem (1280)    | 90 rem (1440)    |
| fine    | P2   | Start milestone    | 119.5 rem (1912) | 100 rem (1600)   |
| fine    | P3   | Finish milestone   | 135 rem (2160)   | 119.5 rem (1912) |
| fine    | P4   | Share…             | 90 rem (1440)    | 80 rem (1280)    |
| fine    | P6   | Compare revisions  | 100 rem (1600)   | 119.5 rem (1912) |
| fine    | P7   | Earned value…      | 90 rem (1440)    | 135 rem (2160)   |
| coarse  | L1   | Critical only      | 80 rem (1280)    | 90 rem (1440)    |
| coarse  | L3   | Late-start overlay | 90 rem (1440)    | 100 rem (1600)   |
| coarse  | L6   | Has conflict only  | 135 rem (2160)   | 160 rem (2560)   |

This is the "Baseline word on both pointers" case (§5): with `'roomy-fine'` the three coarse moves would not occur.
`promotion-widths.{fine,coarse}.json` and `promotion-ladder.ts` must be re-taken in each width-changing milestone, as
the plan says.

## 9. Photographs

`photos/m0-<pointer>-<cell>-<state>.png`, pointer `fine` or `coarse`; cells 1024x600, 1280x800, 1646x1097, 1912x1080;
states `pen`, `nopen` (pen not held), `conflict` (a cycling read-out, pen held), `peer-pen` (a peer holds the pen). Each
is cropped to the header and the toolbar band plus about 120 px of canvas. `photos/m0-forced-colors-*` are §7's.
`before-1912.png` is the owner's own screenshot and is unchanged.

## 10. M0-T2: the stop rules, and the go / no-go

1. **Floor: FIRES.** With the prototypes on, no unarmed state misses its line at 1024 fine and touch stays at four
   deck lines, but **Link armed misses at 1024 fine** (5.2 px of free width today), and the gear move alone causes it.
   The plan says "any state". **Stopped; no compaction of another item was designed.** (Add armed is a pre-existing
   miss, §0.3.)
2. **Baseline on touch: FIRES for the fallback.** Touch LOOK wraps at coarse 1280 with a conflict with the word showing;
   D-1 falls back to `'roomy-fine'` (§5).
3. **Column: FIRES on the rule as written.** On today's tree it fits at no stage on either pointer (literal) and at one
   cell strictly; after M1 to M3 at one to three of the twelve pointer-stage cells, all at 2160 or above (§2). **Stopped.**
   Not designed around: whether a column that exists only at the widest stages meets the owner's third requirement is
   the owner's call.
4. **Ladder moves:** ten (§8).
5. **Suite impact:** below.

**Go / no-go: NO-GO for M1 to M4 as specified until the owner answers two questions** (below). M0 itself is complete.
M5-T3 (#493) does not depend on any of this.

- **The floor.** Link armed at 1024 fine has 5.2 px. Either the reserve is the spec's to spend (the gear's 12 px, the
  D-4 rules' 24 px push it under, and "any state" would exclude armed states by decision), or one of the gear move and
  the D-4 rules is dropped, or the 1024 cell accepts a second DO line while Link is armed.
- **The column.** It needs a decision on whether alignment at 2160 and above only is what the owner meant.

### Suite impact (M0-T2 item 5), `file:line`

| Change                                             | Tests that read it                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pill (`DECK_GROUP_PILL`, `DECK_GROUP_PILL_LOCKED`) | `src/components/ui/toolbar/deck-seams.structural.test.tsx:6` (imports), `:56` (every group has the pill), `:65-72` (pill geometry), `:104` (the locked pill only on Author); `src/components/ui/toolbar/toolbar-styles.test.ts:4`, `:81` (locked pill in forced colours)                                                                               |
| Ring (`DECK_CLOSING_SECTION`)                      | `deck-seams.structural.test.tsx:6`, `:80-86`                                                                                                                                                                                                                                                                                                           |
| Row mark (`DECK_ROW_MARK`, `data-deck-row-mark`)   | no test reads it (`Deck.test.tsx`, journeys and structural tests: none); source `Deck.tsx:17-20`, `:395`; docs `docs/DESIGN_SYSTEM.md:248`, `docs/COMPONENT_LIBRARY.md:404`                                                                                                                                                                            |
| Row seam below 1024 (moves to `border-l`)          | `src/components/ui/toolbar/Deck.test.tsx:620-627`                                                                                                                                                                                                                                                                                                      |
| Undo order (Redo before Recent edits)              | `src/features/tsld/toolbar/tsld-toolbar-undo-redo.test.tsx:149-156` (Recent edits is Undo's next neighbour); `:270` lists the names without an order. Journeys in `e2e-undo/undo.spec.ts` find them by name; `command-surface.spec.ts:907`'s roving walk compares the set of stops, not an order                                                       |
| Caption size                                       | `src/components/ui/toolbar/toolbar-promotion.test.tsx:227-241` (the caption item's shape); `command-surface.spec.ts:552` reads only descendant label spans, so the caption is outside it                                                                                                                                                               |
| Baseline word / icon-only                          | `e2e-workspace-fit/command-surface.spec.ts:1323` (names Baseline overlay among "the icon-only four"); `src/features/tsld/toolbar/roomy-items.structural.test.ts:27` and `:51` (the `'roomy'` set, today `apply-levelling` only), `:65`                                                                                                                 |
| "Add:" dropped                                     | `command-surface.spec.ts:1675` (label in accessible name); `e2e-workspace-fit/promotion.spec.ts:554` lists the milestone names in menus, unchanged (names keep "Add:")                                                                                                                                                                                 |
| Gear / Plan order                                  | `command-surface.spec.ts:1510` (Plan trails DO; DOM order is the reading order), `:907`                                                                                                                                                                                                                                                                |
| Widths and the ladder                              | `promotion-ladder.test.ts:36-` (re-derives from the JSON), `e2e-workspace-fit/promotion.spec.ts:344` (SC-17), `:379` (swept 1192 to 2600), `:413` (SC-18 a, 2 px / 4 % tolerance), `:757` (SC-18 b); `NARROW` (1272 px, `:118`) sits inside the 79 rem roomy floor, so it gains the wider gap; `command-surface.spec.ts:617` (the lines and band gate) |
| Docs                                               | `docs/COMPONENT_LIBRARY.md:398`, `:404`; `docs/DESIGN_SYSTEM.md:239`, `:248`, `:261`, `:267`                                                                                                                                                                                                                                                           |
