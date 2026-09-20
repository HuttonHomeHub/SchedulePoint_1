# M0-T1 — costing the eight placement diagnostics

- **Status:** Approved
- **Taken:** 2026-09-20, local PostgreSQL 16.13, a throwaway `app_costing` database built by
  replaying all 63 migrations with `prisma migrate deploy`.
- **Bar:** ADR-0140's, unchanged — **≤ 500 ms per query** on a diluted estate, and no query whose
  cost is unknown ships.

## What was measured, and how

The SQL was **extracted from the shipped registry, never retyped** — `dump-sql.mts` imports
`DIAGNOSTICS` and prints each entry's `denominator.sql` and `numerator.sql`. That is the ADR-0140
M4 lesson: that epic's own D-B shipped uncosted because a planning document described the query as
joining tables the shipped version did not, and the difference was invisible to anybody costing
from the document.

Each of the 20 statements was warmed once, then run five times under
`EXPLAIN (ANALYZE, BUFFERS)`; the table gives the **median** and the max of the five.

### The estate

40 plans (half `EARLY`, half `VISUAL` — so the mode clause has a population either side),
**102,000 activities**, 400 baselines (360 `FULL`, 40 `NONE`), 20,000 `baseline_activities`.
Every 5th activity carries a `visual_start`; every 7th carries an `SNET` whose `early_start` is
arranged to land in each of the four classes. The 102,000 figure matches the scale ADR-0140's own
M0 used, so the two sets of numbers are comparable.

## Results

| entry                                       |  median ms |     max ms |
| ------------------------------------------- | ---------: | ---------: |
| `day-factor-divergence` denominator         |      14.46 |      15.65 |
| `day-factor-divergence` numerator           |       0.11 |       0.12 |
| `inherited-day-factor` denominator          |      36.87 |      42.81 |
| `inherited-day-factor` numerator            |     104.67 |     109.57 |
| `visual-placement-plans` denominator        |       0.08 |       0.09 |
| `visual-placement-plans` numerator          |      25.01 |      28.66 |
| `visual-placement-activities` denominator   |      34.10 |      35.77 |
| `visual-placement-activities` numerator     |      24.93 |      25.80 |
| `placement-on-early-plan` denominator       |      33.37 |      37.30 |
| `placement-on-early-plan` numerator         |      19.79 |      20.46 |
| `baselines-over-placed-plans` denominator   |       0.20 |       0.24 |
| **`baselines-over-placed-plans` numerator** | **128.09** | **155.89** |
| `snet-binding` denominator                  |      14.66 |      14.95 |
| `snet-binding` numerator                    |      13.20 |      19.24 |
| `snet-inert` denominator                    |      24.99 |      26.68 |
| `snet-inert` numerator                      |      14.39 |      14.78 |
| `snet-unclassified` denominator             |      15.36 |      17.00 |
| `snet-unclassified` numerator               |      15.99 |      17.16 |
| `snet-full-baseline-coverage` denominator   |      11.14 |      11.46 |
| `snet-full-baseline-coverage` numerator     |      13.91 |      14.40 |

**Verdict: PASS.** The worst single query is 128 ms against a 500 ms bar. One press runs all
twenty and sums to **545 ms**; the two pre-existing entries contribute 156 ms of that, so the eight
new ones add roughly 389 ms to a press that already took 156. No index is added — every predicate
here is a whole-table question (`how much of the estate carries a placement?`), which has no
selectivity to offer an index, and `docs/DATABASE.md` §"Indexing" says index real query patterns
rather than columns.

## The finding: gate S-4 made the expensive query FASTER, and I predicted the opposite

`baselines-over-placed-plans` and `snet-full-baseline-coverage` are both naturally semi-joins.
Both were written that way first and **gate S-4 refused them** — its rule is that a `SELECT`
projection contains aliased `count(...)` expressions and nothing else, and `EXISTS (SELECT 1 …)`
projects a bare `1`. The gate is arguably over-strict here, since an `EXISTS` projection is
discarded and cannot reach the row shape the gate protects; it was left alone anyway, because
widening a boundary gate to fit one file's preferred SQL is the wrong way round and would fire
ADR-0105's shared-gate trigger.

Both were rewritten as joins with `count(DISTINCT …)`, and the cost of that was then reasoned
about rather than measured. The reasoning: the join materialises the product of baselines and
placed activities where a semi-join short-circuits at the first match. That is **true** —
`EXPLAIN` shows a nested loop producing **204,000 rows** and spilling to temp
(`temp read=1002 written=1006`) against 400 baselines.

It is also the wrong conclusion. Measured, the refused `EXISTS` form runs at **220.8 / 225.4 /
246.1 ms** — consistently **1.7–1.9× SLOWER** than the join's 128 ms. The correlated subquery is
re-planned per outer row; the join gets one memoised nested loop. So the security gate cost this
registry nothing, and the sentence that nearly went into the code comment — that the join shape is
a price paid for the boundary rule — would have been a false claim used to justify a decision,
which is ADR-0076 Class 3.

The row arithmetic was right and the inference from it was wrong. Recorded here rather than
quietly dropped, because the tempting future "optimisation" is to widen S-4 and restore the
`EXISTS` — and that trade is now known to be negative in both directions at once.

**Escalation trigger for `baselines-over-placed-plans`:** its cost is
O(baselines × placed activities per plan), so it grows with the product rather than with either
factor. Re-run this file's harness if an installation reaches roughly 10× this estate on **both**
at once — 4,000 baselines over plans averaging 5,000 placed activities. At that point the
pre-aggregate the gate currently forbids becomes worth an ADR rather than a rewrite.

## What this does NOT establish

- **Nothing about the deployed host.** ADR-0140's first press measured 164 activities in one plan
  across the whole estate. These figures are a synthetic 102,000, chosen to be comparable with the
  earlier epic's, and the readings that decide this epic's conditions must be taken on the product
  owner's installation through the staff console.
- **Nothing about concurrency.** Every run was a lone query on an idle database.
- **Nothing about the four-class split being right.** That is a correctness question and is
  answered by the e2e fixture, whose exhaustiveness assertion was verified red against the
  implementation plan's own three-class version.
