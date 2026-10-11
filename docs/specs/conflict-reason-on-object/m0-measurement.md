# Conflict reason on the object: M0 measurement

- **Spec / plan:** [`feature-spec.md`](./feature-spec.md), [`implementation-plan.md`](./implementation-plan.md) (M0)
- **Date:** 2026-10-10, branch `claude/determined-cerf-pskzjb` at `58be70e` (toolbar-redesign M6 is on it)
- **Harness:** `apps/web/measure-toolbar/conflict-reason-m0.spec.ts` (a harness, not a gate, ADR-0081 §3)
- **Photographs:** `photos/m0-<cell>-<activity>.png`, fine pointer, 1024 x 600 and 1912 x 1080, the bar as it ships today

## 0. Result: **NO-GO as specified. The Q2 stop rule fires.**

The plan's go/no-go (M0-T1 step 3): stop if the reason costs a line at 1912 x 1080 fine for any type, or more than
one line at 1024 x 600. **At 1912 x 1080 on a fine pointer, two of the four conflict types lose a line**, so M1 was not
built (owner instruction, 2026-10-10: Q2 stop rule).

| 1912 x 1080, fine, Float paths on the bar                                                       | Bar today | With the read-out | Foot row    | Canvas                        | Short by                     |
| ----------------------------------------------------------------------------------------------- | --------- | ----------------- | ----------- | ----------------------------- | ---------------------------- |
| `constraintViolated`, no placement ("Constraint not met", 155.2 px)                             | 1 line    | **2 lines**       | 51 to 87 px | 842 to 806 px (13 to 12 rows) | 40.7 px                      |
| `visualEarlierThanLogic`, with placement ("Placed before its logic allows", 219.8 px)           | 1 line    | **2 lines**       | 51 to 87 px | 842 to 806 px (13 to 12 rows) | 62.8 px                      |
| `visualLaterThanBound`, with placement ("Placed after its constraint date", 230.1 px)           | 2 lines   | 2 lines           | 87          | 806                           | fits the free slot on line 2 |
| constraint + later-than-bound (the engine flags both on one activity), two-flag text (354.1 px) | 2 lines   | 2 lines           | 87          | 806                           | fits                         |
| `levelingWindowExceeded`, **projected** (254.4 px) onto a placed activity                       | 1 line    | **2 lines**       | 51 to 87 px | 842 to 806 px                 | 97.4 px                      |

The spec's estimate said the bar plus "Placed before its logic allows" is "about 1,270 px against about 1,258 px of
outlet", marginal. The measured outlet is 1,074.4 px with a placement (1,117 px without) and the read-out needs
219.8 px where 157 px is free. So the estimate was **optimistic by about 60 px**, and "marginal" is wrong for the two
types whose bar is one line today. The two types whose bar already carries the route remedy **and** a placement are
two lines today and absorb the read-out for free.

What costs nothing at 1912 x 1080: every coarse-pointer state (the bar is already two lines there, with 52 px
spare on the second), and the three route-or-two-flag states above.

## 1. The questions M0 was written to answer

**Q1, the floor (1024 x 600).** Fine: the bar is 4 lines, 156 px, in a 347.5 px outlet; the canvas is 246 px (3 rows
by `(canvas - 40 px ruler) / 60 px`). The read-out adds **one line, 40 px**, to every type: canvas 246 to 206 px,
**3 to 2 rows**. The two types that already carry a route remedy are 5 lines today (207 px foot, canvas 206 px) and
go to 166 px (2 rows: 126 / 60). The two-flag text (354.1 px) is wider than the 347.5 px outlet, so it wraps inside
its item and costs 46 px, not 40. Coarse: the bar is 3 lines, canvas 200 px (2 rows); constraint, placement-early and
placement-late fit in the wraps they already have (0 px). **The constraint + placement two-flag case costs one line,
48 px: canvas 152 px, 1 row.** The spec's "about 156 px" coarse estimate was within 4 px. The plan's rule ("more than
one line at 1024 x 600") is **not** tripped: no cell loses more than one line.

**Q2, 1912 x 1080.** Tripped, as in section 0.

**Item 4, do the remedy labels truncate at 1024 coarse?** No. `Review the constraint…` and `Review resources…` did not
clip in any cell (an `scrollWidth > clientWidth` scan of every leaf in the bar; the only hits were the two `sr-only`
descriptions on Notes and Progress, which are one pixel wide by design). No register row is needed for it (plan M2,
row 4).

**Item 5, the Gantt dock's bar sits on the same fill.** **Not measured.** The harness drives the Diagram only. The
bar is one component hosted in the same foot row in both views, but that is a read, not a reading; M1's contrast
assertion has to take it.

**Item 6, the guest sees no bar.** Read, not driven: `GuestPlanView.tsx:256-268` passes `TsldPanel` none of
`onOpenLogic`, `onEditActivity` and `onDeleteActivity`, and `TsldPanel.tsx:1805-1806` mounts the bar only when all three
are wired.

## 2. What a sighted planner sees today after Next conflict (the "before")

The chip reads `Conflict n of 4`. The bar's text, in order (Float paths is icon-only, so it contributes no text):

| After Next conflict                         | Chip            | Bar text                                                                                                           |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Steel beam (constraint)                     | Conflict 1 of 4 | Zoom to selection, Isolate, **Review the constraint…**, Logic, Notes, Progress, Resources, Edit, Duplicate, Delete |
| Frame (constraint + placed after its bound) | Conflict 2 of 4 | as above, then **Clear visual start**                                                                              |
| Roof (placed after its bound)               | Conflict 3 of 4 | as above, then **Clear visual start**                                                                              |
| Pour slab (placed before its logic)         | Conflict 4 of 4 | Zoom to selection, Isolate, Logic, Notes, Progress, Resources, Edit, Duplicate, Delete, **Clear visual start**     |

No sentence naming the reason is present in any of them. The Pour slab bar has no conflict-flavoured control at all,
which is the "one of them renders nothing" ADR-0094 D5 recorded. This confirms spec §1 items 4 and 5 as measured.

## 3. Fixture and what the engine flagged

One plan, seven activities, seeded through the public API (`conflict-review.spec.ts`'s methods). The engine's own
flags, read back from the activity list:

| Activity   | Seeded as                                                  | `constraintViolated` | `visualConflictReason` | Placement |
| ---------- | ---------------------------------------------------------- | -------------------- | ---------------------- | --------- |
| Excavate   | plain, linked to Pour slab                                 | no                   | none                   | no        |
| Pour slab  | `visualStart` on the data date, before its logic           | no                   | `EARLIER_THAN_LOGIC`   | yes       |
| Steel beam | `MANDATORY_START` 2025-12-22                               | **yes**              | none                   | no        |
| Frame      | `MANDATORY_START` 2025-12-22 plus `visualStart` 2026-01-20 | **yes**              | `LATER_THAN_BOUND`     | yes       |
| Roof       | `SNLT` 2026-01-06 plus `visualStart` 2026-01-19            | no                   | `LATER_THAN_BOUND`     | yes       |
| Sitework   | `visualStart` 2026-02-02, nothing else                     | no                   | none                   | yes       |
| Plain      | nothing                                                    | no                   | none                   | no        |

Two things this found that the spec did not know. A **mandatory start with a placement raises both flags at once**, so
the two-flag text is reachable by a plain hand edit, not only by the exotic levelling pair. And `levelingWindowExceeded`
**could not be seeded** (no catalogue plan or journey in the tree produces it; `resource-view.spec.ts:32` says the same),
so that type's rows are **projected**: the real bar of an unflagged activity with a probe carrying its text. A real
levelling activity also carries the **Review resources…** route, which makes the bar wider than the placed unflagged
activity used here, so the projected rows are a floor on the cost, not a ceiling.

## 4. Method, and where it bypasses the product

- The harness reads the **real** bar: sign-up, organisation, plan, pen held (`PLAN_EDIT_LOCK_ENFORCED=true`), selection by
  the listbox arrow keys, `VITE_FLOAT_PATHS` at its default (on), `VITE_TOOLBAR_QUICK_WINS` at its default (on). Cells
  1024 x 600, 1280 x 800, 1440 x 900, 1646 x 1097 and 1912 x 1080, each on a fine and a coarse (`hasTouch`) pointer.
- **The only projection is the probe.** The label copy is not in the product, so the harness inserts a node as the bar's
  first item with the metrics spec §4.6 gives the read-out (the control's `min-h-(--control-h)`, `px-2` fine and `px-3`
  coarse, `gap-1.5`, the first control's font size, a 16 px icon box, wrapping text) and reads the lines, the foot row and
  the canvas, then removes it. The probe sits in the same flex parent as the first control, so the bar's own gap applies.
- "Room for the read-out" is a **bisection**: a fixed-width copy of the probe is narrowed until the bar's control line
  count returns to the baseline. `1599.9` in the data means the probe never added a line (the bar already wraps and the
  probe lands in free space), which is why those rows read "fits". The bar's own right edge cannot give slack, because the
  bar stretches to its outlet.
- **Canvas** after the probe is **derived** as `canvas - (foot after - foot before)`: the canvas element's height is set
  by the workspace's layout effect, not by CSS, so a synchronous read after inserting the probe sees the old value. The
  derivation matches the measured step between an unflagged and a placed selection at 1440 x 900 (foot 87 to 127,
  canvas 626 to 586). **Rows visible** is `floor((canvas - ruler 40 px) / 60 px lane pitch)`, an upper bound on whole rows.
- A first version of the harness also tried a "natural width of the bar" read (every wrap switched off); it returned the
  same figure with and without the probe in most cells, so it was **discarded** rather than reported.
- The page-level `Escape` after each cell and the five Next-conflict presses at 1646 x 1097 are the "before" evidence.

## 5. Full readings

Foot row and canvas are in CSS px. "to" is the probe applied. The unflagged rows are the bar as it is.

**fine pointer, 1912x1080**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 1                        | 51                            | 842                         | 13           | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 1                        | 51                            | 842                         | 13           | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (155.2)                                    | 1                        | 51 to 87                      | 842 to 806                  | 13 to 12     | 114.5 (40.7 px short)           | **+36 px**  |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (219.8)                        | 1                        | 51 to 87                      | 842 to 806                  | 13 to 12     | 157 (62.8 px short)             | **+36 px**  |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (230.1)                      | 2                        | 87 to 87                      | 806 to 806                  | 12 to 12     | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (354.1)  | 2                        | 87 to 87                      | 806 to 806                  | 12 to 12     | already wraps; fits a free slot | no new line |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (254.4)                   | 1                        | 51 to 51                      | 842 to 842                  | 13 to 13     | 307 (52.6 px spare)             | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (254.4)                   | 1                        | 51 to 87                      | 842 to 806                  | 13 to 12     | 157 (97.4 px short)             | **+36 px**  |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (377) | 2                        | 87 to 87                      | 806 to 806                  | 12 to 12     | already wraps; fits a free slot | no new line |

**fine pointer, 1646x1097**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out  | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ---------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 1                        | 51                            | 859                         | 13           | n/a                    | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 2                        | 87                            | 823                         | 13           | n/a                    | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (155.2)                                    | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (515.0 px spare) | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (219.8)                        | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (450.4 px spare) | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (230.1)                      | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (440.1 px spare) | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (354.1)  | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (316.1 px spare) | no new line |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (254.4)                   | 1                        | 51 to 87                      | 859 to 823                  | 13 to 13     | 41 (213.4 px short)    | **+36 px**  |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (254.4)                   | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (415.8 px spare) | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (377) | 2                        | 87 to 87                      | 823 to 823                  | 13 to 13     | 670.2 (293.2 px spare) | no new line |

**fine pointer, 1440x900**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 2                        | 87                            | 626                         | 9            | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 3                        | 127                           | 586                         | 9            | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (155.2)                                    | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (219.8)                        | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (230.1)                      | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (354.1)  | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (254.4)                   | 2                        | 87 to 87                      | 626 to 626                  | 9 to 9       | already wraps; fits a free slot | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (254.4)                   | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (377) | 3                        | 127 to 127                    | 586 to 586                  | 9 to 9       | already wraps; fits a free slot | no new line |

**fine pointer, 1280x800**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 3                        | 127                           | 486                         | 7            | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 3                        | 127                           | 486                         | 7            | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (155.2)                                    | 3                        | 127 to 127                    | 486 to 486                  | 7 to 7       | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (219.8)                        | 3                        | 127 to 127                    | 486 to 486                  | 7 to 7       | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (230.1)                      | 3                        | 127 to 127                    | 486 to 486                  | 7 to 7       | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (354.1)  | 3                        | 127 to 167                    | 486 to 446                  | 7 to 6       | already wraps; fits a free slot | **+40 px**  |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (254.4)                   | 3                        | 127 to 127                    | 486 to 486                  | 7 to 7       | already wraps; fits a free slot | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (254.4)                   | 3                        | 127 to 127                    | 486 to 486                  | 7 to 7       | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (377) | 3                        | 127 to 167                    | 486 to 446                  | 7 to 6       | already wraps; fits a free slot | **+40 px**  |

**fine pointer, 1024x600**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ---------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 4                        | 167                           | 246                         | 3            | n/a                             | n/a        |
| unflagged, with placement                                                                    | none (baseline)                                               | 4                        | 167                           | 246                         | 3            | n/a                             | n/a        |
| constraintViolated, no placement                                                             | Constraint not met (155.2)                                    | 4                        | 167 to 207                    | 246 to 206                  | 3 to 2       | already wraps; fits a free slot | **+40 px** |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (219.8)                        | 4                        | 167 to 207                    | 246 to 206                  | 3 to 2       | already wraps; fits a free slot | **+40 px** |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (230.1)                      | 5                        | 207 to 247                    | 206 to 166                  | 2 to 2       | already wraps; fits a free slot | **+40 px** |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (354.1)  | 5                        | 207 to 253                    | 206 to 160                  | 2 to 2       | already wraps; fits a free slot | **+46 px** |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (254.4)                   | 4                        | 167 to 207                    | 246 to 206                  | 3 to 2       | already wraps; fits a free slot | **+40 px** |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (254.4)                   | 4                        | 167 to 207                    | 246 to 206                  | 3 to 2       | already wraps; fits a free slot | **+40 px** |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (377) | 5                        | 207 to 253                    | 206 to 160                  | 2 to 2       | already wraps; fits a free slot | **+46 px** |

**coarse pointer, 1912x1080**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 1                        | 55                            | 818                         | 12           | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 2                        | 103                           | 770                         | 12           | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (163.2)                                    | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (227.8)                        | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (238.1)                      | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (362.1)  | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (262.4)                   | 1                        | 55 to 103                     | 818 to 770                  | 12 to 12     | 143.1 (119.3 px short)          | **+48 px**  |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (262.4)                   | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (385) | 2                        | 103 to 103                    | 770 to 770                  | 12 to 12     | already wraps; fits a free slot | no new line |

**coarse pointer, 1646x1097**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 2                        | 103                           | 787                         | 12           | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 2                        | 103                           | 787                         | 12           | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (163.2)                                    | 2                        | 103 to 103                    | 787 to 787                  | 12 to 12     | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (227.8)                        | 2                        | 103 to 103                    | 787 to 787                  | 12 to 12     | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (238.1)                      | 3                        | 151 to 151                    | 739 to 739                  | 11 to 11     | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (362.1)  | 3                        | 151 to 151                    | 739 to 739                  | 11 to 11     | already wraps; fits a free slot | no new line |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (262.4)                   | 2                        | 103 to 103                    | 787 to 787                  | 12 to 12     | already wraps; fits a free slot | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (262.4)                   | 2                        | 103 to 103                    | 787 to 787                  | 12 to 12     | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (385) | 3                        | 151 to 151                    | 739 to 739                  | 11 to 11     | already wraps; fits a free slot | no new line |

**coarse pointer, 1440x900**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 2                        | 103                           | 590                         | 9            | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 3                        | 151                           | 542                         | 8            | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (163.2)                                    | 3                        | 151 to 151                    | 542 to 542                  | 8 to 8       | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (227.8)                        | 3                        | 151 to 151                    | 542 to 542                  | 8 to 8       | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (238.1)                      | 3                        | 151 to 151                    | 542 to 542                  | 8 to 8       | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (362.1)  | 3                        | 151 to 199                    | 542 to 494                  | 8 to 7       | already wraps; fits a free slot | **+48 px**  |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (262.4)                   | 2                        | 103 to 103                    | 590 to 590                  | 9 to 9       | already wraps; fits a free slot | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (262.4)                   | 3                        | 151 to 151                    | 542 to 542                  | 8 to 8       | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (385) | 3                        | 151 to 199                    | 542 to 494                  | 8 to 7       | already wraps; fits a free slot | **+48 px**  |

**coarse pointer, 1280x800**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 3                        | 151                           | 442                         | 6            | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 3                        | 151                           | 442                         | 6            | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (163.2)                                    | 3                        | 151 to 151                    | 442 to 442                  | 6 to 6       | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (227.8)                        | 3                        | 151 to 199                    | 442 to 394                  | 6 to 5       | already wraps; fits a free slot | **+48 px**  |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (238.1)                      | 4                        | 199 to 247                    | 394 to 346                  | 5 to 5       | already wraps; fits a free slot | **+48 px**  |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (362.1)  | 4                        | 199 to 247                    | 394 to 346                  | 5 to 5       | already wraps; fits a free slot | **+48 px**  |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (262.4)                   | 3                        | 151 to 199                    | 442 to 394                  | 6 to 5       | already wraps; fits a free slot | **+48 px**  |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (262.4)                   | 3                        | 151 to 199                    | 442 to 394                  | 6 to 5       | already wraps; fits a free slot | **+48 px**  |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (385) | 4                        | 199 to 247                    | 394 to 346                  | 5 to 5       | already wraps; fits a free slot | **+48 px**  |

**coarse pointer, 1024x600**

| Selection                                                                                    | Probe text (width)                                            | Bar lines (items) before | Foot row before to after (px) | Canvas before to after (px) | Rows visible | Room for the read-out           | Verdict     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ | ----------------------------- | --------------------------- | ------------ | ------------------------------- | ----------- |
| unflagged, no placement                                                                      | none (baseline)                                               | 3                        | 195                           | 200                         | 2            | n/a                             | n/a         |
| unflagged, with placement                                                                    | none (baseline)                                               | 3                        | 195                           | 200                         | 2            | n/a                             | n/a         |
| constraintViolated, no placement                                                             | Constraint not met (163.2)                                    | 3                        | 195 to 195                    | 200 to 200                  | 2 to 2       | already wraps; fits a free slot | no new line |
| visualEarlierThanLogic, with placement                                                       | Placed before its logic allows (227.8)                        | 3                        | 195 to 195                    | 200 to 200                  | 2 to 2       | already wraps; fits a free slot | no new line |
| visualLaterThanBound (SNLT), with placement                                                  | Placed after its constraint date (238.1)                      | 3                        | 195 to 195                    | 200 to 200                  | 2 to 2       | already wraps; fits a free slot | no new line |
| constraint + placement                                                                       | Constraint not met, placed after its constraint date (362.1)  | 3                        | 195 to 243                    | 200 to 152                  | 2 to 1       | already wraps; fits a free slot | **+48 px**  |
| levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here) (projected) | Can't be levelled within its window (262.4)                   | 3                        | 195 to 195                    | 200 to 200                  | 2 to 2       | already wraps; fits a free slot | no new line |
| levelling text, projected, with placement (worst case for the bar) (projected)               | Can't be levelled within its window (262.4)                   | 3                        | 195 to 195                    | 200 to 200                  | 2 to 2       | already wraps; fits a free slot | no new line |
| longest two-flag string, projected onto the placed constraint activity (projected)           | Constraint not met, can't be levelled within its window (385) | 3                        | 195 to 243                    | 200 to 152                  | 2 to 1       | already wraps; fits a free slot | **+48 px**  |
