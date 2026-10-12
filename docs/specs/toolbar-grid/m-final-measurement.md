# Toolbar grid: M-final measurement record

Taken 2026-10-12 by `apps/web/measure-toolbar/toolbar-grid-m0.spec.ts` with `M0_TAG=after` (a harness, not a gate;
ADR-0081 §3) and `toolbar-grid-m0-fit.mjs after`, on `b17cb493`. This is M5-T1's record: the
M0 cells and states again, on the tree that M1, M2 and M3 shipped (`main` at `b17cb493`, PR #949, with no product code
changed), beside `m0-measurement.md`. Fine and coarse pointers, the container's Chromium 1194, the same
M5/M6 fixture (a plan with a long name, three activities, one link, a peer who can hold the pen). Readings:
`apps/web/measure-output/toolbar-grid-m0-after.*.json` (not committed; the tables below are the record).
Photographs: `photos/after-*` and `photos/before-after-1912-fine-pen.png` (§8).

**M4 was withdrawn by the owner on 2026-10-12 (no shared columns).** Wherever the plan's M5-T1 text says "the stages
where the column is set", this record says **not applicable: M4 withdrawn 2026-10-12** (§3), and there is no unmeasured
wide state found at M4 to carry to M5-T2.

**How the readings were taken, and why they can be trusted.**

- **One sitting per pointer.** Every cell of a pointer is read in one run of one fixture (CLAUDE.md §17's canvas
  lesson). The fine pointer's run passed first time. The coarse pointer's first run failed at the peer-pen state with
  `{"ok":false,"status":423}` (the page still held the pen when the peer asked for it: a race in the harness, which
  measures nothing about the product) and **was discarded whole**; the coarse readings and photographs below are from
  the second, complete run. The harness has no retry of its own, so this is a re-run, not a patch.
- **It reproduces the M0 harness.** The same file took the "before" set; `m0-measurement.md` §1 puts the 1024 × 600 fine
  LOOK free width at 146 and conflict at 20.7, and this run reads 146 and 20.7 (§4). That cell is not touched by M1 to M3
  on the LOOK row, so it is the control.
- **Photographs are the harness's own option, not a second harness.** `M0_TAG=after` writes `photos/after-<pointer>-<cell>-<state>.png`
  and cannot write to `photos/m0-*` or to `docs/specs/toolbar-redesign/photos` (the file's only photo directory is
  `docs/specs/toolbar-grid/photos`, and `PHOTOS` stays true for `before` only). The forced-colours stills stay a "before"
  thing. `pnpm measure:toolbar` was **not** run (it rewrites the toolbar-redesign photographs).
- **States and cells** are M0's: `pen`, `add-armed` ("Adding Finish milestone"), `nopen`, `link-armed` ("Linking · FS"),
  `gantt`, `peer-pen`, `conflict`, `conflict+peer-pen`; 640 × 480, 1024 × 600, 1280 × 800, 1440 × 900, 1600 × 900,
  1646 × 1097, 1912 × 1080, 2160 × 1200, 2560 × 1440. Free width is `available - natural` as in M0 (`natural` is the
  row's no-wrap width on a clone), so these are the ladder's currency and M0's, not the live gap.

**Sign-off is not recorded here.** The photographs are material for SC-15; nothing in this file claims it was given.

## 0. What this record finds

1. **Fine pointer: every unarmed state is one line per row at every cell, and Link armed is one DO line from 1024 to 2560.**
   The M0 "before" had Link armed wrapping DO at 1280, 1440 and 1600 on the fine pointer (−25.8, −40.6, −41.4 px) and the
   promotions the ladder re-derivation moved have made room (34.1, 68.4, 88 px now). Add armed still reads two DO lines
   at 1024, 1280, 1440, 2160 and 2560 (it did before, at 1600 and 1646 as well, which are now one line: 7.1 and 53.1 px).
2. **Coarse pointer: Link armed now wraps DO at 1280 and 1440, where it did not before.** Before: +1.4 and +27.7 px, one
   line. After: **−26.6 px (two lines) at 1280** and **−0.3 px (two lines) at 1440**. 1912 coarse was already two lines
   (−39.7 before) and is now −0.8 px, a hair under one. 1600, 1646, 2160 and 2560 coarse are one line, with more room than
   before. Link armed is a transient state that the harness holds on purpose, M0's own variant B excludes it, and the
   plan's M3 notes only the fine 1024 claim for it, so this is **recorded as measured, not as a verdict**. It is the one
   place on either pointer where a state that was one line is now two.
3. **LOOK's conflict state is the tightest one-line state and it is tight.** Free width with a conflict read-out, pen
   state: fine **12.6 px at 1600** and 20.3 at 1912 (M0: 83.8 and 91.4); coarse **2.7 px at 1280**, 5.4 at 1440 and 5.5 at
   2160 (M0: 16.7, 13.1, 19.4). All are still one line and all are above zero, but the harness's own safety margin is
   2 px and the coarse 1280 cell has 0.7 px of it left. The
   fine pointer's 71 px loss is Baseline's visible word (57.3 px, the plan's M3 note) and Colour's caption (+5.9 px, M2),
   with about 8 px not attributed to either; the coarse loss (7.6 to 13.9 px) has no Baseline word and is the caption
   plus about 2 px not attributed.
4. **The ladder's fine moves are the ones M0 projected; the coarse moves are not.** Fine: the same seven entries M0 §8
   projected, to the stage. Coarse: M0 projected L1, L3 and L6; what shipped is the L3 / L4 swap (M1) only, because M3
   took Baseline's word as `'roomy-fine'` (M0 §5's fallback) (§6).
5. **The CSS budget is 19.00 KiB, not the plan's 18.00**, and the build reads 18.05 KiB against it (§7).

## 1. Lead groups and free width, after

Lead groups are **View** (LOOK) and **Author** (DO), as in M0; the trailing groups are Panels (LOOK) and Plan (DO). M3
moved Settings (the gear) to the end of the DO row from 80 rem of window and gave LOOK a "Baseline" word, so the groups'
widths differ from M0's by design. The tables are `lead width / free width` per state, px, lines in brackets when not 1.

### fine: lead width / free width per state (px; lines in brackets when not 1)

| Stage                  | Cell      | Row         | pen            | add-armed          | nopen          | link-armed    | gantt          | peer-pen       | conflict       | conflict+peer-pen |
| ---------------------- | --------- | ----------- | -------------- | ------------------ | -------------- | ------------- | -------------- | -------------- | -------------- | ----------------- |
| PROMOTE_80             | 1280x800  | LOOK (View) | 339.9 / 194.8  | 339.9 / 194.8      | 339.9 / 194.8  | 339.9 / 194.8 | 339.9 / 194.8  | 339.9 / 194.8  | 339.9 / 69.5   | 339.9 / 69.5      |
| PROMOTE_80             | 1280x800  | DO (Author) | 788 / 81.2     | 916 / -46.7 [2]    | 790.1 / 79.1   | 835.1 / 34.1  | 788 / 81.2     | 790.1 / 79.1   | 788 / 81.2     | 790.1 / 79.1      |
| PROMOTE_90             | 1440x900  | LOOK (View) | 495.5 / 199.2  | 495.5 / 199.2      | 495.5 / 199.2  | 495.5 / 199.2 | 495.5 / 199.2  | 495.5 / 199.2  | 495.5 / 73.9   | 495.5 / 73.9      |
| PROMOTE_90             | 1440x900  | DO (Author) | 788 / 115.5    | 916 / -12.5 [2]    | 790.1 / 113.4  | 835.1 / 68.4  | 788 / 115.5    | 790.1 / 113.4  | 788 / 115.5    | 790.1 / 113.4     |
| PROMOTE_100            | 1600x900  | LOOK (View) | 644.8 / 137.9  | 644.8 / 137.9      | 644.8 / 137.9  | 644.8 / 137.9 | 644.8 / 137.9  | 644.8 / 137.9  | 644.8 / 12.6   | 644.8 / 12.6      |
| PROMOTE_100            | 1600x900  | DO (Author) | 928.4 / 135    | 1056.4 / 7.1       | 930.5 / 132.9  | 975.5 / 88    | 928.4 / 135    | 930.5 / 132.9  | 928.4 / 135    | 930.5 / 132.9     |
| PROMOTE_119_5          | 1912x1080 | LOOK (View) | 949.1 / 145.6  | 949.1 / 145.6      | 949.1 / 145.6  | 949.1 / 145.6 | 949.1 / 145.6  | 949.1 / 145.6  | 949.1 / 20.3   | 949.1 / 20.3      |
| PROMOTE_119_5          | 1912x1080 | DO (Author) | 1075.7 / 139   | 1203.7 / 11        | 1077.8 / 136.8 | 1122.8 / 91.9 | 1075.7 / 139   | 1077.8 / 136.8 | 1075.7 / 139   | 1077.8 / 136.8    |
| PROMOTE_135            | 2160x1200 | LOOK (View) | 1116 / 226.7   | 1116 / 226.7       | 1116 / 226.7   | 1116 / 226.7  | 1116 / 226.7   | 1116 / 226.7   | 1116 / 101.4   | 1116 / 101.4      |
| PROMOTE_135            | 2160x1200 | DO (Author) | 1075.7 / 68.7  | 1203.7 / -59.2 [2] | 1077.8 / 66.6  | 1122.8 / 21.6 | 1075.7 / 68.7  | 1077.8 / 66.6  | 1075.7 / 68.7  | 1077.8 / 66.6     |
| PROMOTE_160            | 2560x1440 | LOOK (View) | 1116 / 478.7   | 1116 / 478.7       | 1116 / 478.7   | 1116 / 478.7  | 1116 / 478.7   | 1116 / 478.7   | 1116 / 353.4   | 1116 / 353.4      |
| PROMOTE_160            | 2560x1440 | DO (Author) | 1442.6 / 101.9 | 1570.6 / -26.1 [2] | 1444.7 / 99.8  | 1489.7 / 54.8 | 1442.6 / 101.9 | 1444.7 / 99.8  | 1442.6 / 101.9 | 1444.7 / 99.8     |
| (1646, in PROMOTE_100) | 1646x1097 | LOOK (View) | 644.8 / 183.9  | 644.8 / 183.9      | 644.8 / 183.9  | 644.8 / 183.9 | 644.8 / 183.9  | 644.8 / 183.9  | 644.8 / 58.6   | 644.8 / 58.6      |
| (1646, in PROMOTE_100) | 1646x1097 | DO (Author) | 928.4 / 181    | 1056.4 / 53.1      | 930.5 / 178.9  | 975.5 / 134   | 928.4 / 181    | 930.5 / 178.9  | 928.4 / 181    | 930.5 / 178.9     |

### coarse: lead width / free width per state (px; lines in brackets when not 1)

| Stage                  | Cell      | Row         | pen            | add-armed          | nopen          | link-armed        | gantt          | peer-pen       | conflict       | conflict+peer-pen |
| ---------------------- | --------- | ----------- | -------------- | ------------------ | -------------- | ----------------- | -------------- | -------------- | -------------- | ----------------- |
| PROMOTE_80             | 1280x800  | LOOK (View) | 350.7 / 136    | 350.7 / 136        | 350.7 / 136    | 350.7 / 136       | 350.7 / 136    | 350.7 / 136    | 350.7 / 2.7    | 350.7 / 2.7       |
| PROMOTE_80             | 1280x800  | DO (Author) | 816.7 / 20.5   | 944.6 / -107.4 [2] | 818.8 / 18.4   | 863.8 / -26.6 [2] | 816.7 / 20.5   | 818.8 / 18.4   | 816.7 / 20.5   | 818.8 / 18.4      |
| PROMOTE_90             | 1440x900  | LOOK (View) | 507.9 / 138.7  | 507.9 / 138.7      | 507.9 / 138.7  | 507.9 / 138.7     | 507.9 / 138.7  | 507.9 / 138.7  | 507.9 / 5.4    | 507.9 / 5.4       |
| PROMOTE_90             | 1440x900  | DO (Author) | 816.7 / 46.8   | 944.6 / -81.2 [2]  | 818.8 / 44.7   | 863.8 / -0.3 [2]  | 816.7 / 46.8   | 818.8 / 44.7   | 816.7 / 46.8   | 818.8 / 44.7      |
| PROMOTE_100            | 1600x900  | LOOK (View) | 507.9 / 226.7  | 507.9 / 226.7      | 507.9 / 226.7  | 507.9 / 226.7     | 507.9 / 226.7  | 507.9 / 226.7  | 507.9 / 93.4   | 507.9 / 93.4      |
| PROMOTE_100            | 1600x900  | DO (Author) | 965.1 / 58.4   | 1093.1 / -69.6 [2] | 967.2 / 56.3   | 1012.2 / 11.3     | 965.1 / 58.4   | 967.2 / 56.3   | 965.1 / 58.4   | 967.2 / 56.3      |
| PROMOTE_119_5          | 1912x1080 | LOOK (View) | 836.3 / 210.4  | 836.3 / 210.4      | 836.3 / 210.4  | 836.3 / 210.4     | 836.3 / 210.4  | 836.3 / 210.4  | 836.3 / 77.1   | 836.3 / 77.1      |
| PROMOTE_119_5          | 1912x1080 | DO (Author) | 1120.4 / 46.3  | 1248.4 / -81.7 [2] | 1122.5 / 44.2  | 1167.5 / -0.8 [2] | 1120.4 / 46.3  | 1122.5 / 44.2  | 1120.4 / 46.3  | 1122.5 / 44.2     |
| PROMOTE_135            | 2160x1200 | LOOK (View) | 999.9 / 138.8  | 999.9 / 138.8      | 999.9 / 138.8  | 999.9 / 138.8     | 999.9 / 138.8  | 999.9 / 138.8  | 999.9 / 5.5    | 999.9 / 5.5       |
| PROMOTE_135            | 2160x1200 | DO (Author) | 1120.4 / 149.3 | 1248.4 / 21.3      | 1122.5 / 147.2 | 1167.5 / 102.2    | 1120.4 / 149.3 | 1122.5 / 147.2 | 1120.4 / 149.3 | 1122.5 / 147.2    |
| PROMOTE_160            | 2560x1440 | LOOK (View) | 1174.8 / 363.9 | 1174.8 / 363.9     | 1174.8 / 363.9 | 1174.8 / 363.9    | 1174.8 / 363.9 | 1174.8 / 363.9 | 1174.8 / 230.6 | 1174.8 / 230.6    |
| PROMOTE_160            | 2560x1440 | DO (Author) | 1511.3 / 158.4 | 1639.3 / 30.4      | 1513.4 / 156.3 | 1558.4 / 111.3    | 1511.3 / 158.4 | 1513.4 / 156.3 | 1511.3 / 158.4 | 1513.4 / 156.3    |
| (1646, in PROMOTE_100) | 1646x1097 | LOOK (View) | 507.9 / 272.7  | 507.9 / 272.7      | 507.9 / 272.7  | 507.9 / 272.7     | 507.9 / 272.7  | 507.9 / 272.7  | 507.9 / 139.4  | 507.9 / 139.4     |
| (1646, in PROMOTE_100) | 1646x1097 | DO (Author) | 965.1 / 104.4  | 1093.1 / -23.6 [2] | 967.2 / 102.3  | 1012.2 / 57.3     | 965.1 / 104.4  | 967.2 / 102.3  | 965.1 / 104.4  | 967.2 / 102.3     |

### Before and after, pen held and with a conflict (free px, `available - natural`; before from `m0-measurement.md` §2a, after from this run)

| Pointer | Cell      | LOOK pen       | LOOK conflict  | DO pen         | DO link-armed         | DO add-armed            |
| ------- | --------- | -------------- | -------------- | -------------- | --------------------- | ----------------------- |
| fine    | 1280x800  | 266 -> 194.8   | 140.7 -> 69.5  | 21.3 -> 81.2   | -25.8 [2] -> 34.1     | -106.7 [2] -> -46.7 [2] |
| fine    | 1440x900  | 270.4 -> 199.2 | 145.1 -> 73.9  | 6.5 -> 115.5   | -40.6 [2] -> 68.4     | -121.5 [2] -> -12.5 [2] |
| fine    | 1600x900  | 209.1 -> 137.9 | 83.8 -> 12.6   | 5.7 -> 135     | -41.4 [2] -> 88       | -122.3 [2] -> 7.1       |
| fine    | 1646x1097 | 255.1 -> 183.9 | 129.8 -> 58.6  | 51.7 -> 181    | 4.6 -> 134            | -76.3 [2] -> 53.1       |
| fine    | 1912x1080 | 216.7 -> 145.6 | 91.4 -> 20.3   | 143.8 -> 139   | 96.8 -> 91.9          | 15.9 -> 11              |
| fine    | 2160x1200 | 149.8 -> 226.7 | 24.5 -> 101.4  | 29.9 -> 68.7   | -17.2 [2] -> 21.6     | -98.1 [2] -> -59.2 [2]  |
| fine    | 2560x1440 | 549.8 -> 478.7 | 424.5 -> 353.4 | 61.3 -> 101.9  | 14.3 -> 54.8          | -66.6 [2] -> -26.1 [2]  |
| coarse  | 1280x800  | 150 -> 136     | 16.7 -> 2.7    | 48.5 -> 20.5   | 1.4 -> **-26.6 [2]**  | -79.4 [2] -> -107.4 [2] |
| coarse  | 1440x900  | 146.4 -> 138.7 | 13.1 -> 5.4    | 74.8 -> 46.8   | 27.7 -> **-0.3 [2]**  | -53.2 [2] -> -81.2 [2]  |
| coarse  | 1600x900  | 234.4 -> 226.7 | 101.1 -> 93.4  | 52.9 -> 58.4   | 5.8 -> 11.3           | -75 [2] -> -69.6 [2]    |
| coarse  | 1646x1097 | 280.4 -> 272.7 | 147.1 -> 139.4 | 98.9 -> 104.4  | 51.8 -> 57.3          | -29 [2] -> -23.6 [2]    |
| coarse  | 1912x1080 | 218 -> 210.4   | 84.7 -> 77.1   | 7.4 -> 46.3    | -39.7 [2] -> -0.8 [2] | -120.5 [2] -> -81.7 [2] |
| coarse  | 2160x1200 | 152.7 -> 138.8 | 19.4 -> 5.5    | 110.4 -> 149.3 | 63.3 -> 102.2         | -17.5 [2] -> 21.3       |
| coarse  | 2560x1440 | 377.8 -> 363.9 | 244.5 -> 230.6 | 117.9 -> 158.4 | 70.8 -> 111.3         | -10.1 [2] -> 30.4       |

LOOK's pen-state free width fell by 71.1 to 71.2 px at every fine cell except 2160 (where it rose 76.9 px, because L6
"Has conflict only" moved from 135 to 160 rem) and by 7.6 to 13.9 px on the coarse pointer. DO's rose by 38.8 to 129.3 px
at every fine cell except 1912, where it fell 4.8 px.

The live gaps at 1912 × 1080, pen held (the quantity `m6-measurement.md` §1 reports): fine LOOK 169.5, DO 163; with a
conflict LOOK 44.2. Coarse LOOK 234.3, DO 70.3; with a conflict LOOK 101.

## 2. Lines per cell

Every state that is not one line on both rows, from this run (fine, then coarse). Every other state at the cell is
1 / 1.

- fine 640x480: none. 1024x600: add-armed 1/2. 1280x800: add-armed 1/2. 1440x900: add-armed 1/2. 1600x900, 1646x1097,
  1912x1080: none. 2160x1200 and 2560x1440: add-armed 1/2.
- coarse 640x480: none. 1024x600: every state 1/2 except `conflict` and `conflict+peer-pen`, which read 2/2.
  1280x800 and 1440x900: add-armed 1/2, link-armed 1/2. 1600x900 and 1646x1097: add-armed 1/2. 1912x1080: add-armed 1/2,
  link-armed 1/2. 2160x1200 and 2560x1440: none.

## 3. Column fit

**Not applicable: M4 withdrawn 2026-10-12.** No shared lead column shipped, so there is no stage at which a column is
set and nothing to fit. `toolbar-grid-m0-fit.mjs after` still prints the literal-rule tables and they are not kept
here: the lead groups have not been padded to a common width, and its "Fits" columns answer a question nobody is asking
now. (Run on this tree it prints: literal variant A fits at fine 2160 only; strictly, every state, only variant B at fine
2160 and 2560; coarse nowhere. That is a statement about lead widths nobody is equalising.)

## 4. The floor check

1024 × 600 and 640 × 480, the cells no promotion applies to, after M1 to M3. `m0-measurement.md` §4's table with the
"after" column only; M0's "before" numbers are in that file (fine pen DO 52.3, LOOK 146; coarse pen DO −143.7, LOOK 38).

### fine: after, 1024x600 (free px = available - natural; lines; band px; header lines)

| Cell     | State             | LOOK free | DO free | Lines LOOK / DO | Deck lines | Band px | Header lines |
| -------- | ----------------- | --------- | ------- | --------------- | ---------- | ------- | ------------ |
| 1024x600 | pen               | 146       | 58.3    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | add-armed         | 146       | -69.7   | 1 / 2           | 3          | 183     | 2            |
| 1024x600 | nopen             | 146       | 56.2    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | link-armed        | 146       | 11.2    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | gantt             | 146       | 58.3    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | peer-pen          | 146       | 56.2    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | conflict          | 20.7      | 58.3    | 1 / 1           | 2          | 139     | 2            |
| 1024x600 | conflict+peer-pen | 20.7      | 56.2    | 1 / 1           | 2          | 139     | 2            |
| 640x480  | pen               | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | add-armed         | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | nopen             | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | link-armed        | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | gantt             | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | peer-pen          | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | conflict          | 0         | 0       | 1 / 1           | 2          | 143     | 3            |
| 640x480  | conflict+peer-pen | 0         | 0       | 1 / 1           | 2          | 143     | 3            |

### coarse: after, 1024x600 (free px = available - natural; lines; band px; header lines)

| Cell     | State             | LOOK free | DO free | Lines LOOK / DO | Deck lines | Band px | Header lines |
| -------- | ----------------- | --------- | ------- | --------------- | ---------- | ------- | ------------ |
| 1024x600 | pen               | 38        | -137.7  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | add-armed         | 38        | -265.7  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | nopen             | 38        | -139.8  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | link-armed        | 38        | -184.8  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | gantt             | 38        | -137.7  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | peer-pen          | 38        | -139.8  | 1 / 2           | 3          | 211     | 2            |
| 1024x600 | conflict          | -95.3     | -137.7  | 2 / 2           | 4          | 263     | 2            |
| 1024x600 | conflict+peer-pen | -95.3     | -139.8  | 2 / 2           | 4          | 263     | 2            |
| 640x480  | pen               | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | add-armed         | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | nopen             | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | link-armed        | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | gantt             | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | peer-pen          | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | conflict          | 0         | 0       | 1 / 1           | 2          | 163     | 3            |
| 640x480  | conflict+peer-pen | 0         | 0       | 1 / 1           | 2          | 163     | 3            |

- **Every unarmed state keeps one line per row at 1024 fine**; the smallest free widths are DO 56.2 px (nopen) and LOOK
  20.7 px (with a conflict), the same LOOK figure as M0 and 36 px more on DO than M0's own all-prototypes projection
  (20.2).
- **Link armed at 1024 fine is one DO line** (11.2 px free, band 139 px), which is the proof of the owner's decision 1
  that M3's journey holds. Add armed keeps its two DO lines (−69.7 px, band 183), as it has since before M0.
- **Touch at 1024 stays at four deck lines at most**: pen reads 3, conflict reads 4, unchanged from M0.
- The 640 × 480 rows read 0 free because the deck scrolls sideways there (`deckScrolls`), as in M0.

## 5. Contrast, as computed from the built tokens

OKLCH to linear sRGB to WCAG luminance, resolved in the **chrome** scope by the same `resolve` and `fillOf` that
`apps/web/src/styles/token-contrast.test.ts` uses, over the tokens in `apps/web/src/styles/globals.css` as built at
`b17cb493`. The pairs were taken by a scratch test calling those helpers (written, run once, deleted; the
numbers are not committed), and the asserted ones are **now assertions in `token-contrast.test.ts`** (M1's P1 and P2,
M2's P3 to P7) so the table below is also what `pnpm --filter @repo/web test` checks. Band luminance **0.0157**; pure
black on the band **1.31:1**.

| Pair | What                                                                   | M0 projected      | Computed now | Gate                                              |
| ---- | ---------------------------------------------------------------------- | ----------------- | ------------ | ------------------------------------------------- |
| P1   | Group divider (`--muted-foreground` at 40 %) on the band               | 2.43:1            | **2.43:1**   | asserted at 2:1                                   |
| P2   | Section rule (`--border`) on the band                                  | 1.54:1            | **1.54:1**   | divider outranks it (asserted)                    |
| P3   | Raised member (`--secondary`) on the track (`--field`)                 | 3.59:1            | **3.59:1**   | asserted at 3:1                                   |
| P4   | `--foreground` on `--field`                                            | 17.40:1           | **17.40:1**  | asserted at 4.5:1                                 |
| P5   | Focus ring (`--ring`) on `--field`                                     | 8.99:1            | **8.99:1**   | asserted at 3:1                                   |
| P5b  | Focus ring on a raised member (`--secondary`)                          | 2.51:1            | **2.51:1**   | reported                                          |
| P6   | Track (`--field`) on the band                                          | 1.14:1            | **1.14:1**   | reported; no darker fill can pass 1.31:1          |
| P7   | Search outline `--chrome-input-quiet` (`oklch(0.53 0.02 264)`) on band | 3.03:1            | **3.03:1**   | asserted at 3:1, and under `--input`'s 4.39:1     |
| P7   | The same outline on `--field`                                          | 3.44:1            | **3.44:1**   | asserted at 3:1                                   |
| -    | Locked-state underline (`--muted-foreground`) on the track             | not in M0         | **9.07:1**   | asserted at 3:1                                   |
| -    | Quiet glyph ink (`--muted-foreground`) on the band                     | 7.98:1 (M0 today) | **7.98:1**   | not a gate; the label's `--foreground` is 15.31:1 |
| -    | Quiet glyph ink on the track                                           | -                 | **9.07:1**   | -                                                 |

Every projected number was reproduced to the hundredth, so M0 §6's projection was a faithful forecast of what shipped.
The quiet glyph is the step down the plan names (R4): it is `--muted-foreground` beside a visible label and `inherit`
otherwise (`toolbarIconClass`, `toolbar-styles.ts`). **Forced colours** are not re-photographed here: M2's
`deck-tracks-forced-colors.spec.ts` (with its `forcedColors: 'none'` control) holds that the chosen and unchosen member
differ, and the owner's review of this record is the first look at it in a photograph.

## 6. Ladder moves across M1 to M3

From the git history of `apps/web/src/features/tsld/toolbar/promotion-ladder.ts` and
`docs/specs/toolbar-redesign/promotion-widths.{fine,coarse}.json` (`git log` over those paths; the diffs read), and the
plan's M1, M2 and M3 status notes. The widths were re-taken in each width-changing milestone with the ADR-0185 M5
procedure (`toolbar-redesign-m5.spec.ts`, then `promotion-widths.mjs`); this record did not re-take them.

| Milestone | Commit     | Ladder change                                                                                                                                                                                    |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1        | `108a9322` | **Coarse L3 90 to 135 rem and L4 135 to 90 rem** (a swap); fine unchanged. The widths JSON moved.                                                                                                |
| M2        | `44e960b1` | **No ladder move.** Colour's caption +5.9 px, Link "Type" +4.4 px, DO 6 px narrower; the harness's join charge was corrected (`5231020d`: a track joins its members with 1 px, not `itemGapPx`). |
| M3        | `b17cb493` | **Seven fine moves, no coarse move**: L6 135 to 160 rem; P1 80 to 90; P2 119.5 to 100; P3 135 to 119.5; P4 90 to 80; P6 100 to 119.5; P7 90 to 135.                                              |

Nine entries moved in total, none to or from `never`. Against M0 §8's projection (ten): **the seven fine moves are
exactly the projection** (same entries, same stages). Of the three coarse moves M0 projected (L1 80 to 90, L3 90 to 100,
L6 135 to 160), none occurred: M3 took Baseline's word as `'roomy-fine'` (the word on a mouse only), which M0 §5 named as
the fallback that removes them, and the only coarse change is M1's L3 / L4 swap, which M0 did not project (M1's own status note records it
from the re-taken widths). Each milestone re-took the JSON in its own PR; PR #949's last CI run
(`38290423490`) was green.

## 7. Bundle size

`pnpm --filter @repo/web build` then `pnpm --filter @repo/web check:bundle-size`, on this tree:

```text
check:bundle-size: OK. entry graph 176.99 KiB of 185.00 KiB gzip (+1.09 KiB since the floor was measured),
37 lazy chunk(s), largest 125.57 KiB, CSS 18.05 KiB of 19.00 KiB.
```

| Quantity                  | M0 (`m6-measurement.md` §7, before) | After (this run)                       |
| ------------------------- | ----------------------------------- | -------------------------------------- |
| Render-blocking CSS, gzip | 17.48 KiB of 18.00 KiB              | **18.05 KiB of 19.00 KiB** (+0.57 KiB) |
| Entry graph JS, gzip      | 177.00 KiB of 185.00 KiB            | **176.99 KiB of 185.00 KiB**           |

The plan's M5-T1 text names an 18.00 KiB ceiling. **That figure is stale**: M3's review fold (PR #949) raised the
render-blocking CSS budget from 18,432 to 19,456 bytes, in PR #949 (its commit message: "+0.08 KiB measured against main after dropping a redundant utility"). The build now
reads 18.05 KiB, over the old 18.00 KiB ceiling, and passes against the new one with 0.95 KiB of headroom.

## 8. Photographs

`photos/after-<pointer>-<cell>-<state>.png`, pointer `fine` or `coarse`; cells 1024x600, 1280x800, 1646x1097, 1912x1080;
states `pen`, `nopen`, `conflict` (a cycling read-out, pen held), `peer-pen` (a peer holds the pen): the same four M0
photographed, 32 files, 2.06 MiB (2,157,271 bytes), each cropped to the header and the toolbar band plus about 120 px of canvas, exactly
as `photos/m0-*`. File names pair one to one with M0's (`m0-` becomes `after-`). The side-by-side
`photos/before-after-1912-fine-pen.png` stacks `photos/m0-fine-1912x1080-pen.png` over
`photos/after-fine-1912x1080-pen.png` with a caption on each (1912 × 578 px, 176 KB); it was composed from those two
files with Pillow and nothing was retouched. `before-1912.png` is the owner's own screenshot and is unchanged.

(`cmp` over the pairs: `nopen` and `peer-pen` are byte-identical on the coarse pointer at 1024, 1280, 1646 and 1912
in this set, and on the fine pointer at none of the four; in M0 they were identical on the fine pointer at all four and
on the coarse at three. In the 1912 fine pair read by eye the only difference is the fill behind "Start editing",
present in `nopen` and absent in `peer-pen`. Their numbers (§1) are identical either way, so nothing here is a layout
difference.)

## 9. What ran

- `pnpm exec playwright test --config playwright.measure-toolbar.config.ts toolbar-grid-m0` with `M0_TAG=after`,
  `PLAYWRIGHT_SKIP_WEBSERVER=1`, `E2E_BASE_URL` at this checkout's own dev server and API (own ports, own database), the
  container's Chromium 1194. Fine and forced-colours passed in the first run; coarse failed at peer-pen (§ header) and
  passed on the re-run.
- `node apps/web/measure-toolbar/toolbar-grid-m0-fit.mjs after`: the per-state lead / free tables in §1.
- A scratch vitest over `@/test/scope-tokens` for §5 (deleted).
- `pnpm --filter @repo/web build` and `check:bundle-size` for §7.
- Nothing in this record was run by CI. CI's own end-to-end timings are `docs/TECH_DEBT.md` #491's business.
