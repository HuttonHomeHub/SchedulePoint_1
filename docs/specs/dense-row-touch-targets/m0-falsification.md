# M0 — Predictions and the readings that would refute them

Written **before** any reading was taken (ADR-0113, ADR-0142). Companion to
[`implementation-plan.md`](implementation-plan.md) M0. Readings land in `m0-measurement.md`.

| ID  | Prediction                                                        | Refuted by                                                                       |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P1  | Rows in the six `RowActionsMenu` tables are >= 44 px on coarse.   | Any list row under 44 px on coarse.                                              |
| P2  | Activities rows that carry a `⋯` are 45 px under both pointers.   | A row not equal to 45 under either pointer (at 1912 wide; narrower widths wrap). |
| P3  | Tree rows visible at 1912 x 1104 coarse (at 28 px) are 19 +- 3.   | A count outside 16..22.                                                          |
| P4  | The fine spine's destinations overflow its content box (36 > 25). | `scrollWidth <= clientWidth` and every link inside the spine box with a mouse.   |

Corollaries tested alongside: the tree's 36 % and the activities table's 26 % loss
(1 - 28/44, 1 - 45/61) restate as row counts; the Gantt body height is read so CQ-1's cost
is quoted as a count.
