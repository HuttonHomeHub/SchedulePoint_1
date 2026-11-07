# M2-T2: the cost of storing the instants (FC-10)

- **Status:** Taken 2026-11-07, in one sitting with the baseline in [`../m0/cost.md`](../m0/cost.md):
  the pre-M2 and M2 repository files were swapped in turn, each against its own database (without and
  with the migration), the harness unchanged. Order: B1, A1, A2, B2, A3.
- **Harness:** `apps/api/scripts/measure-schedule-write.mts`. Same method as the baseline.

## `writeResults` after the columns

| Run | N activities | p50   | p95    | min   | max    |
| --- | ------------ | ----- | ------ | ----- | ------ |
| A1  | 2,000        | 105.4 | 4785.9 | 76.0  | 5052.4 |
| A1  | 5,000        | 267.6 | 371.7  | 218.3 | 395.3  |
| A2  | 2,000        | 104.9 | 135.8  | 79.2  | 138.3  |
| A2  | 5,000        | 245.1 | 322.7  | 196.1 | 376.1  |
| A3  | 2,000        | 101.3 | 137.7  | 78.6  | 143.7  |
| A3  | 5,000        | 256.3 | 310.9  | 198.5 | 355.4  |

A1's 2,000-activity p95 is one 5.05 s sample in 40, the first plan of a freshly created database; the
same shape appeared once on the baseline database (`m0/cost.md`). The p50 is unaffected.

## Verdict

FC-10's second limb: `writeResults` median at 5,000 activities within +15 % of the same-sitting
baseline. Mean p50 at 5,000: **252.2 ms before (243.6, 260.8), 256.3 ms after (267.6, 245.1, 256.3):
+1.6 %**, inside the spread of either set (the two baseline runs differ by 17 ms, 7 %). At 2,000:
before 99.5–106.6, after 101.3–105.4. The four extra `unnest` arguments and the wider rows are not
measurable here. **Met.**

FC-10's first limb (the same query count at 10 and at 100 links each way): 17 and 17, recorded in
`m0/cost.md`. **Met**, though M2 adds no query, so this limb is really M4's.
