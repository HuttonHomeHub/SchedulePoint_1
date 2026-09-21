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
arranged to land in each of the four classes.

> **Correction, 2026-09-21 — that sentence was false when it was written, and the readings below
> were taken against the fixture it describes wrongly.** The `dilute.sql` binding branch was
> `g % 7 = 0 AND g % 4 = 0`, which is identically the file's own `early_start IS NULL` branch
> (`g % 28 = 0`), so **every intended binding row classified UNCLASSIFIED and the binding population
> was zero** — as was the fourth class, which is a subset of it. Measured on the shipped file:
> binding 0, inert 3,643, unclassified 10,928. Found by the `database-architect` review of M-I's
> strip migration, which needed a non-empty binding population and could not get one.
>
> **What this does and does not invalidate.** `snet-binding`'s 13.20 ms below is the cost of
> **proving an absence**, which for a scan is the conservative case — so the diagnostic verdict
> stands and the entry is not slower than reported. What it is not is the number this table's own
> description implies. More importantly, **nothing in this epic had ever been measured against a
> non-empty binding population** until M-I; reusing this fixture to cost the strip would have
> measured the cost of converting nothing, which is ADR-0066's "the benchmark measured the cull
> rather than the painter" one epic along.
>
> `dilute.sql` is corrected in place (the null branch moves to `g % 33`, the class selector cuts
> from `(g / 7) % 4`), and now yields binding 3,532 / inert 3,532 / unclassified 7,507 with 706 of
> the binding rows already carrying a placement. The readings below are **not** re-taken: they are a
> record of what was measured on the day, and re-running them under a different fixture would
> produce a different table wearing the same date. The 102,000 figure matches the scale ADR-0140's own
> M0 used, so the two sets of numbers are comparable.

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

## The finding, CORRECTED: the two shapes have opposite cost models and they cross over

> **This section replaced an earlier one headed "gate S-4 made the expensive query FASTER, and I
> predicted the opposite". That finding was wrong to generalise and its stated mechanism was wrong
> outright.** It was caught by a `database-architect` re-review that rebuilt the estate
> independently and measured the refused shape at **1.5 ms** where this file had reported
> 221-246 ms — a 150x disagreement. Neither number was a mistake. We had measured different data.

`baselines-over-placed-plans` and `snet-full-baseline-coverage` are naturally semi-joins. Gate S-4
refuses `EXISTS (SELECT 1 …)`, because its rule is that a `SELECT` projection contains aliased
`count(...)` expressions and nothing else. Both are therefore written as joins with
`count(DISTINCT …)`. The gate is arguably over-strict — an `EXISTS` projection is discarded and
cannot reach the row shape it protects — and it was left alone anyway, because widening a boundary
gate to fit one file's preferred SQL is the wrong way round and would fire ADR-0105's shared-gate
trigger.

**What the two shapes cost was then asserted, twice, in opposite directions, before anyone varied
the one input that decides it.** Measured on one estate at three placement densities, same
machine, same session, three runs each:

| placements                                    |      refused `EXISTS` |           shipped join |
| --------------------------------------------- | --------------------: | ---------------------: |
| 8 of 40 plans carry any (this file's fixture) |    340 / 377 / 340 ms |     141 / 141 / 153 ms |
| all 40 plans, one placed activity each        |    301 / 318 / 333 ms |     143 / 143 / 143 ms |
| **every activity placed**                     | **22 / 2.7 / 2.7 ms** | **516 / 519 / 511 ms** |

**The cost models are opposite, which is why one number could never have settled it.**

- The **semi-join** stops at a plan's first placed activity. Its cost is how deep that row sits in
  index order — trivial when placements are dense, and worst when a plan has none, because absence
  can only be established by exhausting the plan. The plan text shows `Rows Removed by Filter:
2039` per probe at the sparse end (`join-vs-exists.sql`).
- The **join** materialises every (baseline x placed activity) pair before `count(DISTINCT …)`
  reduces them, so its cost is that product, and it is **flat in the number of plans that have no
  placement at all**. 400 baselines x 510 placed = 204,000 rows and a spill to temp
  (`temp read=1002 written=1006`).

So at the sparse end the join wins by ~2.4x, and at the dense end it **loses by ~190x**.

### Two claims are withdrawn rather than edited

1. **"The gate cost this registry nothing."** Not established, and false in the regime this epic
   is driving the product towards. What is true is narrower: on the estate as it stands the gate's
   shape is the faster one.
2. **"The correlated subquery is re-planned per outer row; the join gets one memoised nested
   loop."** Wrong in both halves, and the plan text this file already contained showed it.
   PostgreSQL pulls a simple `WHERE EXISTS` sublink up into a **`Nested Loop Semi Join`** at
   planning time, so there is no per-row subplan to re-plan; and the `Memoize` node is on the
   **join** plan, i.e. on the shape the sentence said lacked memoisation. A narration was written
   where a plan node should have been read.

### The escalation trigger, restated on the quantity that decides it

The earlier trigger was a **conjunction** ("10x on both at once") over a cost that is a
**product** — so 40,000 baselines at today's density would not have fired it while costing the
same 20.4M joined rows. It is replaced by the crossover, which is the thing a reader can act on:

> **Re-open the shape when a substantial majority of plans carry at least one placement.** At that
> point the join is the wrong shape by two orders of magnitude, and the argument for widening gate
> S-4 (or for a pre-aggregate it permits) becomes a measured one rather than a preference.

**And the epic itself is what moves the estate across that line.** FC-1 predicts **zero**
placements today — the sparsest possible case, where the shipped shape is right. One planning
surface makes placement universal. So this is not a trigger that may never fire: it is one this
programme is actively driving towards, and M-J should re-run this harness rather than inherit its
verdict.

### What the correction is really about

The first version of this section was not careless about method — it ran the query, five times,
and read the plan. It was careless about **scope**: it measured one distribution and wrote a
conclusion about the shapes. The re-review made the same error in the opposite direction, and the
two disagreeing is the only reason either was caught. A single-distribution benchmark of two
strategies with opposite cost models is not a weak measurement; it is a measurement of something
else.

## What this does NOT establish

- **Nothing about the deployed host.** ADR-0140's first press measured 164 activities in one plan
  across the whole estate. These figures are a synthetic 102,000, chosen to be comparable with the
  earlier epic's, and the readings that decide this epic's conditions must be taken on the product
  owner's installation through the staff console.
- **Nothing about concurrency.** Every run was a lone query on an idle database.
- **Nothing about a real `activities` row width.** This estate's rows are narrow, so any plan that
  scans the heap costs less here than on the 60-column production table. That widens the sparse
  end's gap and does not touch the dense end, where the semi-join never reaches the heap.
- **Nothing about the four-class split being right.** That is a correctness question and is
  answered by the e2e fixture, whose exhaustiveness assertion was verified red against the
  implementation plan's own three-class version.
