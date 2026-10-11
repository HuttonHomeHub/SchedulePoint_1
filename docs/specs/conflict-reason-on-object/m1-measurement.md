# Conflict reason on the object: M1 measurement (B′, the reason as a caption line)

- **Spec / plan:** [`feature-spec.md`](./feature-spec.md), [`implementation-plan.md`](./implementation-plan.md)
- **M0 record:** [`m0-measurement.md`](./m0-measurement.md), which found that an inline item costs a line at 1912 x 1080
- **Date:** 2026-10-10. **Decision:** the product owner chose option (b), B′: the reason is a caption line above the bar's controls
- **Harness:** `apps/web/measure-toolbar/conflict-reason-m1.spec.ts` (a harness, not a gate, ADR-0081 §3), reading the **shipped** bar for M0's fixture and cells
- **Photographs:** `photos/m1-<cell>-<activity>.png`, fine pointer, 1024 x 600 and 1912 x 1080

## 0. Result: the stop rule does not fire

| Question                                         | Reading                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do the controls reflow?                          | **No, in all 60 readings** (two pointers, five cells, six selections, 40 of them flagged): the control line count and the toolbar height are identical to M0's baseline in every cell. `e2e-workspace-fit/conflict-reason.spec.ts` asserts it directly (toolbar height with the line shown equals the height with it hidden) and was verified red by making the line inline (276 px shown against 156 px hidden at 1024 x 600). |
| What does the caption cost at 1912 x 1080, fine? | One line, **20 px**. The foot row grows **16 px** where the bar is a single line (the row's 51 px holds 4 px of slack the caption absorbs), and 20 px where the bar already wraps. The canvas goes 842 to 826 px (13 rows both ways) for the two types M0 found losing a line.                                                                                                                                                  |
| At 1912 x 1080, coarse?                          | 20 px: the canvas goes 770 to 750 px. The whole-row figure by the 60 px pitch goes **12 to 11** for every flagged selection there; that is the arithmetic of a 20 px loss crossing a row boundary at 12.17 rows, not a control moving.                                                                                                                                                                                          |
| At the 1024 x 600 floor, fine?                   | 20 px for one flag (canvas 246 to 226 px, 3 rows both ways; the two route-remedy bars are already at the canvas floor of 206 px and read 200 px). The two-flag text (constraint + later-than-bound) is **one line, 20 px**, since the labels were shortened (see section 1c); before that it wrapped to two lines, 40 px, in the 347.5 px column.                                                                               |
| At 1024 x 600, coarse?                           | 20 px; canvas 200 px, 2 rows both ways (the canvas holds its 200 px floor).                                                                                                                                                                                                                                                                                                                                                     |
| Anything clipped or pointer-unreachable?         | No: the `clipped` count is 0 in every reading and the journey's hit-test of every bar control passes on both pointers at both cells, for the single-flag and the two-flag selections.                                                                                                                                                                                                                                           |

M0's estimate for B′ was "about 20 px at every width". Measured: 20 px, 16 px in the one case above, 40 px for the
two-flag text at the floor. The caption is `text-sm` at a 20 px line height, `px-2`, no vertical padding.

## 1. The canvas-height question at the floor

The caption is the one place the floor pays, and only while a flagged activity is selected. At 1024 x 600 on a fine
pointer a placed, flagged selection leaves the diagram **about 166 px of visible stage** (two bars' rows, in
`photos/m1-1024x600-Frame.png`), against 206 px with no caption. This is spec Q1's trade, accepted by the owner, now
at 20 px (40 for the two-flag text) rather than the inline item's 40 px. Structural relief is `#471`.

## 1b. The 120 px stage floor on a finger-sized window, and what gave it back

`e2e-minimap/viewport-cluster.spec.ts` ("with a conflict selected the diagram keeps at least 120 px of stage",
1024 x 600, touch) is a standing guard. Measured on the same cell: **134 px before the caption (the tree
before `a96f571`), 114 px with it** — 6 px under. Two coarse-pointer-only changes recover it, with no change
to the caption's text, semantics or visibility, and none on a fine pointer:

- the caption's line height is `leading-4` (16 px) rather than 20 px under `pointer-coarse:` (the icon loses
  its 2 px nudge there too), because a finger-sized column is wide enough that the line is one line; and
- the foot row's vertical padding is `pointer-coarse:py-0.5` (2 px a side) rather than `py-1`, which gives back
  4 px on a touch screen in every state, flagged or not.

The stage then reads **122 px** (2 px of margin). The deck, the controls and the fine-pointer readings above
are unchanged; the fine-pointer rows in section 2 still stand, and a coarse flagged selection's caption is now
16 px, not 20.

## 1c. The labels after the reviews

The UX review found the two-flag sentence orphaning its last word at 1024 on a fine pointer ("…its constraint
date"), and asked for parallel wording. Three label changes, one source for the caption, the announcer, the
listbox option and the Gantt row's description:

- `Placed after its constraint date` became `Placed after its constraint`, so the joined two-flag text
  ("Constraint not met, placed after its constraint", 47 characters) fits the 347.5 px column on one line;
- `Can't be levelled within its window` became `Levelling window exceeded` (the pre-change wording, parallel
  with "Constraint not met");
- the placement pair stays parallel ("Placed before its logic allows" / "Placed after its constraint").

Re-measured: the caption is **20 px, one line, for all four selections at 1024 x 600 and 1912 x 1080 on a fine
pointer** and 16 px on a coarse one. The fine-pointer 40 px reading in the section 2 tables of the first
version of this record no longer occurs. The widest remaining text is the placed-before plus levelling pair
("Placed before its logic allows, levelling window exceeded"), which wraps at the 1024 fine column and was not
produced by any reachable fixture here.

## 2. Full readings

"Before" is M0's baseline for the same selection: the bar with no reason shown. The rows column is
`floor((canvas - 40 px ruler) / 60 px)`, an upper bound on whole rows.

**fine pointer**

| Cell      | Selection                                     | Control lines before to after | Toolbar height before to after (px) | Caption (px)         | Foot row before to after (px) | Canvas before to after (px) | Whole rows by the 60 px pitch |
| --------- | --------------------------------------------- | ----------------------------- | ----------------------------------- | -------------------- | ----------------------------- | --------------------------- | ----------------------------- |
| 1024x600  | unflagged, no placement                       | 4 to 4                        | 156 to 156                          | none                 | 167 to 167                    | 246 to 246                  | 3 to 3                        |
| 1024x600  | unflagged, with placement                     | 4 to 4                        | 156 to 156                          | none                 | 167 to 167                    | 246 to 246                  | 3 to 3                        |
| 1024x600  | constraintViolated, no placement              | 4 to 4                        | 156 to 156                          | 20 tall, 347.5 wide  | 167 to 187                    | 246 to 226                  | 3 to 3                        |
| 1024x600  | visualEarlierThanLogic, with placement        | 4 to 4                        | 156 to 156                          | 20 tall, 347.5 wide  | 167 to 187                    | 246 to 226                  | 3 to 3                        |
| 1024x600  | visualLaterThanBound (SNLT), with placement   | 5 to 5                        | 196 to 196                          | 20 tall, 347.5 wide  | 207 to 227                    | 206 to 200                  | 2 to 2                        |
| 1024x600  | constraint + later-than-bound, with placement | 5 to 5                        | 196 to 196                          | 20 tall, 347.5 wide  | 207 to 227                    | 206 to 200                  | 2 to 2                        |
| 1280x800  | unflagged, no placement                       | 3 to 3                        | 116 to 116                          | none                 | 127 to 127                    | 486 to 486                  | 7 to 7                        |
| 1280x800  | unflagged, with placement                     | 3 to 3                        | 116 to 116                          | none                 | 127 to 127                    | 486 to 486                  | 7 to 7                        |
| 1280x800  | constraintViolated, no placement              | 3 to 3                        | 116 to 116                          | 20 tall, 603.5 wide  | 127 to 147                    | 486 to 466                  | 7 to 7                        |
| 1280x800  | visualEarlierThanLogic, with placement        | 3 to 3                        | 116 to 116                          | 20 tall, 603.5 wide  | 127 to 147                    | 486 to 466                  | 7 to 7                        |
| 1280x800  | visualLaterThanBound (SNLT), with placement   | 3 to 3                        | 116 to 116                          | 20 tall, 603.5 wide  | 127 to 147                    | 486 to 466                  | 7 to 7                        |
| 1280x800  | constraint + later-than-bound, with placement | 3 to 3                        | 116 to 116                          | 20 tall, 603.5 wide  | 127 to 147                    | 486 to 466                  | 7 to 7                        |
| 1440x900  | unflagged, no placement                       | 2 to 2                        | 76 to 76                            | none                 | 87 to 87                      | 626 to 626                  | 9 to 9                        |
| 1440x900  | unflagged, with placement                     | 3 to 3                        | 116 to 116                          | none                 | 127 to 127                    | 586 to 586                  | 9 to 9                        |
| 1440x900  | constraintViolated, no placement              | 3 to 3                        | 116 to 116                          | 20 tall, 763.5 wide  | 127 to 147                    | 586 to 566                  | 9 to 8                        |
| 1440x900  | visualEarlierThanLogic, with placement        | 3 to 3                        | 116 to 116                          | 20 tall, 763.5 wide  | 127 to 147                    | 586 to 566                  | 9 to 8                        |
| 1440x900  | visualLaterThanBound (SNLT), with placement   | 3 to 3                        | 116 to 116                          | 20 tall, 763.5 wide  | 127 to 147                    | 586 to 566                  | 9 to 8                        |
| 1440x900  | constraint + later-than-bound, with placement | 3 to 3                        | 116 to 116                          | 20 tall, 763.5 wide  | 127 to 147                    | 586 to 566                  | 9 to 8                        |
| 1646x1097 | unflagged, no placement                       | 1 to 1                        | 36 to 36                            | none                 | 51 to 51                      | 859 to 859                  | 13 to 13                      |
| 1646x1097 | unflagged, with placement                     | 2 to 2                        | 76 to 76                            | none                 | 87 to 87                      | 823 to 823                  | 13 to 13                      |
| 1646x1097 | constraintViolated, no placement              | 2 to 2                        | 76 to 76                            | 20 tall, 969.5 wide  | 87 to 107                     | 823 to 803                  | 13 to 12                      |
| 1646x1097 | visualEarlierThanLogic, with placement        | 2 to 2                        | 76 to 76                            | 20 tall, 969.5 wide  | 87 to 107                     | 823 to 803                  | 13 to 12                      |
| 1646x1097 | visualLaterThanBound (SNLT), with placement   | 2 to 2                        | 76 to 76                            | 20 tall, 969.5 wide  | 87 to 107                     | 823 to 803                  | 13 to 12                      |
| 1646x1097 | constraint + later-than-bound, with placement | 2 to 2                        | 76 to 76                            | 20 tall, 969.5 wide  | 87 to 107                     | 823 to 803                  | 13 to 12                      |
| 1912x1080 | unflagged, no placement                       | 1 to 1                        | 36 to 36                            | none                 | 51 to 51                      | 842 to 842                  | 13 to 13                      |
| 1912x1080 | unflagged, with placement                     | 1 to 1                        | 36 to 36                            | none                 | 51 to 51                      | 842 to 842                  | 13 to 13                      |
| 1912x1080 | constraintViolated, no placement              | 1 to 1                        | 36 to 36                            | 20 tall, 1117 wide   | 51 to 67                      | 842 to 826                  | 13 to 13                      |
| 1912x1080 | visualEarlierThanLogic, with placement        | 1 to 1                        | 36 to 36                            | 20 tall, 1074.4 wide | 51 to 67                      | 842 to 826                  | 13 to 13                      |
| 1912x1080 | visualLaterThanBound (SNLT), with placement   | 2 to 2                        | 76 to 76                            | 20 tall, 1235.5 wide | 87 to 107                     | 806 to 786                  | 12 to 12                      |
| 1912x1080 | constraint + later-than-bound, with placement | 2 to 2                        | 76 to 76                            | 20 tall, 1235.5 wide | 87 to 107                     | 806 to 786                  | 12 to 12                      |

**coarse pointer**

| Cell      | Selection                                     | Control lines before to after | Toolbar height before to after (px) | Caption (px)         | Foot row before to after (px) | Canvas before to after (px) | Whole rows by the 60 px pitch |
| --------- | --------------------------------------------- | ----------------------------- | ----------------------------------- | -------------------- | ----------------------------- | --------------------------- | ----------------------------- |
| 1024x600  | unflagged, no placement                       | 3 to 3                        | 140 to 140                          | none                 | 195 to 191                    | 200 to 200                  | 2 to 2                        |
| 1024x600  | unflagged, with placement                     | 3 to 3                        | 140 to 140                          | none                 | 195 to 191                    | 200 to 200                  | 2 to 2                        |
| 1024x600  | constraintViolated, no placement              | 3 to 3                        | 140 to 140                          | 16 tall, 731 wide    | 195 to 207                    | 200 to 200                  | 2 to 2                        |
| 1024x600  | visualEarlierThanLogic, with placement        | 3 to 3                        | 140 to 140                          | 16 tall, 731 wide    | 195 to 207                    | 200 to 200                  | 2 to 2                        |
| 1024x600  | visualLaterThanBound (SNLT), with placement   | 3 to 3                        | 140 to 140                          | 16 tall, 731 wide    | 195 to 207                    | 200 to 200                  | 2 to 2                        |
| 1024x600  | constraint + later-than-bound, with placement | 3 to 3                        | 140 to 140                          | 16 tall, 731 wide    | 195 to 207                    | 200 to 200                  | 2 to 2                        |
| 1280x800  | unflagged, no placement                       | 3 to 3                        | 140 to 140                          | none                 | 151 to 147                    | 442 to 446                  | 6 to 6                        |
| 1280x800  | unflagged, with placement                     | 3 to 3                        | 140 to 140                          | none                 | 151 to 147                    | 442 to 446                  | 6 to 6                        |
| 1280x800  | constraintViolated, no placement              | 3 to 3                        | 140 to 140                          | 16 tall, 599.5 wide  | 151 to 163                    | 442 to 430                  | 6 to 6                        |
| 1280x800  | visualEarlierThanLogic, with placement        | 3 to 3                        | 140 to 140                          | 16 tall, 599.5 wide  | 151 to 163                    | 442 to 430                  | 6 to 6                        |
| 1280x800  | visualLaterThanBound (SNLT), with placement   | 4 to 4                        | 188 to 188                          | 16 tall, 599.5 wide  | 199 to 211                    | 394 to 382                  | 5 to 5                        |
| 1280x800  | constraint + later-than-bound, with placement | 4 to 4                        | 188 to 188                          | 16 tall, 599.5 wide  | 199 to 211                    | 394 to 382                  | 5 to 5                        |
| 1440x900  | unflagged, no placement                       | 2 to 2                        | 92 to 92                            | none                 | 103 to 99                     | 590 to 594                  | 9 to 9                        |
| 1440x900  | unflagged, with placement                     | 3 to 3                        | 140 to 140                          | none                 | 151 to 147                    | 542 to 546                  | 8 to 8                        |
| 1440x900  | constraintViolated, no placement              | 3 to 3                        | 140 to 140                          | 16 tall, 759.5 wide  | 151 to 163                    | 542 to 530                  | 8 to 8                        |
| 1440x900  | visualEarlierThanLogic, with placement        | 3 to 3                        | 140 to 140                          | 16 tall, 759.5 wide  | 151 to 163                    | 542 to 530                  | 8 to 8                        |
| 1440x900  | visualLaterThanBound (SNLT), with placement   | 3 to 3                        | 140 to 140                          | 16 tall, 759.5 wide  | 151 to 163                    | 542 to 530                  | 8 to 8                        |
| 1440x900  | constraint + later-than-bound, with placement | 3 to 3                        | 140 to 140                          | 16 tall, 759.5 wide  | 151 to 163                    | 542 to 530                  | 8 to 8                        |
| 1646x1097 | unflagged, no placement                       | 2 to 2                        | 92 to 92                            | none                 | 103 to 99                     | 787 to 791                  | 12 to 12                      |
| 1646x1097 | unflagged, with placement                     | 2 to 2                        | 92 to 92                            | none                 | 103 to 99                     | 787 to 791                  | 12 to 12                      |
| 1646x1097 | constraintViolated, no placement              | 2 to 2                        | 92 to 92                            | 16 tall, 965.5 wide  | 103 to 115                    | 787 to 775                  | 12 to 12                      |
| 1646x1097 | visualEarlierThanLogic, with placement        | 2 to 2                        | 92 to 92                            | 16 tall, 965.5 wide  | 103 to 115                    | 787 to 775                  | 12 to 12                      |
| 1646x1097 | visualLaterThanBound (SNLT), with placement   | 3 to 3                        | 140 to 140                          | 16 tall, 965.5 wide  | 151 to 163                    | 739 to 727                  | 11 to 11                      |
| 1646x1097 | constraint + later-than-bound, with placement | 3 to 3                        | 140 to 140                          | 16 tall, 965.5 wide  | 151 to 163                    | 739 to 727                  | 11 to 11                      |
| 1912x1080 | unflagged, no placement                       | 1 to 1                        | 44 to 44                            | none                 | 55 to 51                      | 818 to 822                  | 12 to 13                      |
| 1912x1080 | unflagged, with placement                     | 2 to 2                        | 92 to 92                            | none                 | 103 to 99                     | 770 to 774                  | 12 to 12                      |
| 1912x1080 | constraintViolated, no placement              | 2 to 2                        | 92 to 92                            | 16 tall, 1231.5 wide | 103 to 115                    | 770 to 758                  | 12 to 11                      |
| 1912x1080 | visualEarlierThanLogic, with placement        | 2 to 2                        | 92 to 92                            | 16 tall, 1231.5 wide | 103 to 115                    | 770 to 758                  | 12 to 11                      |
| 1912x1080 | visualLaterThanBound (SNLT), with placement   | 2 to 2                        | 92 to 92                            | 16 tall, 1231.5 wide | 103 to 115                    | 770 to 758                  | 12 to 11                      |
| 1912x1080 | constraint + later-than-bound, with placement | 2 to 2                        | 92 to 92                            | 16 tall, 1231.5 wide | 103 to 115                    | 770 to 758                  | 12 to 11                      |
