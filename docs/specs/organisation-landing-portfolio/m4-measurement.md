# M4 — R3 measured, and judged

**Status:** Approved — R3 is **withdrawn**, with its number and its remedy recorded below.

> **Read the order of this document as the order the work happened in.** The measurement was taken
> **before the rung was wired to anything** — the repository carried the org-wide variant, the
> service still called the bounded one, and nothing in the product could reach it. That is
> deliberate: a failure at this point costs a `git checkout`, and a failure after wiring costs a
> revert of a feature a reader has already seen. It is also what makes the withdrawal clause
> cheap enough to actually honour (spec §5, and the five precedents the plan names).

## 1. What was measured, and on what

`apps/web/scripts/measure-overview-endpoint.mjs`, extended in this milestone to grade a **third**
query: the organisation-wide variant of the standing read.

**Both variants come from ONE `extractSql('findPlanStanding')`.** M4 makes R2 and R3 one SQL body
with two substituted `Prisma.sql` fragments (`scopeFilter`, `ordering`), and the harness substitutes
those fragments itself — so "same SQL body, different `WHERE`" is something the harness demonstrates
rather than something a docblock asserts. The `ordering` fragment is **extracted too**, by a second
extractor that throws rather than returning something plausible: writing the `ORDER BY … LIMIT` into
the harness would have been a hand-copy, which is exactly the drift that produced one silently wrong
FC-3 verdict earlier in this epic (`m3-measurement.md` §1).

Shapes: ADR-0098's own four, from the index migration's measurement table. Taken 2026-09-15, one
sitting, one database.

## 2. FC-2 — the endpoint's latency, R2 only (the "before" half)

| Shape                | Plans | Activities |  p50 | **p95** | min–max   | Verdict  |
| -------------------- | ----: | ---------: | ---: | ------: | --------- | -------- |
| typical installation |    16 |      2,880 | 19.1 |    23.2 | 16.5–25.9 | **PASS** |
| scale tier           |    10 |     20,000 | 25.5 |    30.5 | 22.0–30.7 | **PASS** |
| breadth              |   459 |     18,360 | 24.6 |    31.4 | 20.2–33.4 | **PASS** |
| extra-large          | 3,000 |    120,000 | 50.8 |    60.9 | 47.3–78.9 | **PASS** |

Against a 200 ms bar, so **139.1 ms of headroom at the worst shape** — within noise of the 140.7 ms
M3 recorded, on a database that has since grown by four more benchmark organisations. This is the
state the product is in today; no "after" was taken, for the reason §4 gives.

## 3. FC-3 — the gate, and it failed

The bounded rung (R2, shipped) over the same four shapes: **201 / 222 / 245 / 642** — flat, which
is what says the plan-id filter is doing the work.

**A flat ESTIMATE is not evidence that the wall-clock cost is flat, and §7 records that correction.**

The organisation-wide rung:

| Shape                | Rows after cap | Estimated total cost | `JIT:` node? | Verdict  |
| -------------------- | -------------: | -------------------: | ------------ | -------- |
| typical installation |              8 |                3,051 | no           | **PASS** |
| scale tier           |              8 |                2,129 | no           | **PASS** |
| breadth              |              8 |               95,602 | no           | **PASS** |
| extra-large          |              8 |          **578,024** | **yes**      | **FAIL** |

**578,024 against a bar of 100,000 — 5.8× over, with a real `JIT:` node (41 functions).**

Two things in that table matter more than the failing cell.

**The `breadth` row is at 95,602 — 96% of the bar, and it PASSES.** A 459-plan organisation is
inside the gate by four per cent. That is not a comfortable pass; it is the shape of the cliff the
spec's §0.3 describes, one tenant's growth from the other side.

**And the timing is the reason FC-3 is an estimate condition rather than a timing one.** The `Sort`
node reports `actual time=170.350..170.361`; the `Limit` above it reports `838.925..838.939`. The
~670 ms between them is JIT compilation — paid per execution, never cached, on the first request
after every sign-in. A latency harness pointed at a warm small tenant sees none of it.

### The dominant term

```
->  Aggregate  (cost=184.32..184.33 rows=1 width=52) (actual time=0.047..0.047 rows=1 loops=3000)
      Buffers: shared hit=129018
      ->  Bitmap Heap Scan on activities act  (cost=4.79..183.49 rows=47 width=16) (actual rows=40 loops=3000)
            Recheck Cond: ((plan_id = p.id) AND (deleted_at IS NULL))
            Heap Blocks: exact=120000
```

3,000 executions of an aggregate over a bitmap heap scan, 129,018 buffer hits, 120,000 heap blocks —
one per activity, because a plan's activities are not clustered. `3000 × 184.32 ≈ 552,960` of the
578,024 total.

The full plans for all four shapes are in `m4-endpoint-run.md`.

## 4. `database-architect` (M4-T2), and it corrected me

FC-3's failure fired M4-T2's condition, so the agent was engaged with the EXPLAIN, the four shapes,
ADR-0098's three declined candidates, and an instruction to measure rather than reason. Its full
report is `m4-database-architect.md`.

**My reading of the 578,024 was half right and the half that was wrong is the interesting half.**
I wrote above that the dominant term is "the work of aggregating every live activity in the
organisation, which no index removes", and asked the agent to check that rather than accept it. It
does not hold: of the per-plan 184.33, **the aggregation is 0.83 and the other 178.7 is heap
access** — Mackert–Lohman charging ~47 random pages at `random_page_cost = 4`. An index-only scan
pays 9.21 for the same rows. **The aggregation survives; the heap trip does not.**

So the verdict is `INDEX`, and not the one I proposed: **extend** ADR-0098's existing
`idx_activities_plan_updated_at` with an `INCLUDE` payload rather than add a second covering index.
Both produce a byte-identical plan at an identical cost (55,430.34), and extending costs
**+18.2 bytes per live row** where a separate index costs +58.9 — 3.2× the disk and a second index
on the write path. Measured, the extension takes the four shapes to
**251 / 161 / 6,950 / 45,813**, no `JIT:` node anywhere, extra-large 750 ms → 76.5 ms, and it is
faster at **every** shape with no regression to the query the index was built for
(156.72 → 156.71).

Three further findings from that run are worth keeping whatever is decided.

**FC-3 was right to be an estimate condition, and more strongly than the spec argued.** On the
failing run JIT reported **604.7 ms of 770 ms wall clock — 78%** — and 578,024 also crosses
`jit_inline_above_cost` / `jit_optimize_above_cost` (500,000), so the two expensive phases fire as
well.

**`breadth`'s PASS is not reproducible.** Across one session that organisation measured
**85,816 / 88,484 / 88,766 / 95,602 / 102,513** — a 19% swing — with its own 459 plans and 18,360
activities constant throughout. The movement is other tenants' rows and ANALYZE state. **102,513 is
over the bar.** So it is not that breadth is one tenant's growth away from the cliff; whether it
passes at all depends on tenants it has nothing to do with, which is ADR-0098's recorded phenomenon
observed live. The cliff itself is a **step, not a gradient**: 520 plans → 96,961 and no JIT,
560 plans → 104,415 with JIT, i.e. **+7.7% plans buys +273% latency**.

**The cliff's position is partly a configuration artefact.** At `random_page_cost = 4` it sits at
~536 plans; on a clustered heap ~1,000; at an SSD-realistic 1.1 it moves to ~1,800 with no index at
all. That is an operator's setting, not this epic's, and is recorded so nobody reads 536 as a
property of the product.

## 5. The verdict: R3 is WITHDRAWN, and the index is not built

**The approved rule fires as written.** CQ-1's answer was "ship R3 only if FC-2 and FC-3 both pass,
and **withdraw it rather than tune it** if either fails". FC-3 failed. Five precedents in this
repository have a measurement disqualify its own proposal (ADR-0091 D4, ADR-0092 M5, ADR-0097
Landing C, ADR-0110 D3, ADR-0142 D1); this is the sixth.

**The index would make FC-3 pass, and it is not built, for a reason the spec did not have when it
was approved.** ADR-0098's migration comment calls the recalculation's HOT exemption "the single
biggest thing standing between this index and an expensive decision" — and this index **spends
it**. Measured over five date-moving recalculations of a 2,000-activity plan: HOT **28.4% → 0.0%**,
index growth per recalculation **+92% → +447%**, WAL +15%. The zero is deterministic rather than
space-limited: btree `INCLUDE` columns are HOT-blocking, and `writeResults` writes all five payload
columns. There is no way round it — any index that makes this aggregate index-only must contain
`early_finish`, and any index containing `early_finish` blocks HOT on a date move.

**What settles it is that the index serves nothing else.** ADR-0098's own query is unchanged by it
(156.72 → 156.71) and R2 is already flat at 642 across all four shapes. So it is not a general
improvement that R3 happens to benefit from; it exists **only** to serve R3, and its cost is paid by
every recalculation on every installation forever. The spec's risk table said "Database: **None
expected, and that is a claim to test**" — the claim was tested, and the answer is that a remedy
exists and costs something the spec never put on the table.

Against that: R2 already ships and covers the plans a reader is looking at, so withdrawal leaves no
hole; the rung misbehaves only above ~536 plans; and **the deployed installation holds 28
activities**. The agent reached the same conditional independently and stated it in its own words —
"withdraw R3 if the product owner is lukewarm about the rung itself" — which is precisely the
position CQ-1's answer records.

### What would reopen it, and what it would cost

Named rather than left as a feeling (the ADR-0085 pattern), because an unconditioned deferral sits
one priority below whatever is being done:

1. **An organisation approaching ~500 plans**, on any installation. That is the measured step, and
   it is a step.
2. **A product-owner decision that Q8 is wanted**, knowing the price. The design work is done: the
   index is specified to the byte above, the write cost is measured, and `database-architect`
   offered to author the migration to the standard of `20260818220000_overview_recently_changed_indexes`.
   Reopening is therefore cheap in a way most deferrals are not.

If it reopens, one more thing is owed that this run did not take: **a spot-check on PostgreSQL 17**.
The measurements are on 16.13 — the same limit ADR-0098 recorded, and it matters more here, because
this is a cost-estimate threshold effect and estimates move between majors.

### Two options deliberately NOT taken

**A persisted plan-level rollup** (`plans.project_finish`) stays the spec's rejected alternative and
the agent agreed, with a sharper reason: it is the ADR-0126 `lane_index` case exactly. A `DEFAULT`
would state a finish date as fact, and a nullable column with no discriminator cannot tell "this
plan has no activities" from "nobody has written this yet" — so it would need a capture-level
discriminator of its own. A separate epic, correctly.

**Ranking by `last_touched_at` and aggregating only the eight** is the cheapest option measured
(4,008, no index, no JIT) and is **rejected on product grounds, not cost**: it withdraws the slip
rank, which is R3's stated reason to exist, and makes the section a restatement of the
Recently-changed feed directly above it.

## 6. One caveat if this is re-run

The agent clustered the benchmark heap and then re-clustered on `activities_pkey` to restore the
interleaving; `plan_id` correlation is now **−0.0038** where it was −0.028. Extra-large re-measures
within 0.4% of §3's figure, but **`breadth` now reads 88,766 against the 95,602 recorded above — 7%
lower**. If a re-run disagrees with this document at that shape, that is the re-clustering plus the
ANALYZE drift of §4, and **not** a product change.

## 7. A correction to §3's own reading, from the M6 backend review

§3 says the bounded rung is "flat across shapes", and treats that as evidence the read is cheap
everywhere. **The estimate is flat; the wall clock is not, and the estimate structurally cannot see
the difference.**

`activities.plan_id` is a high-cardinality UUID, so Postgres's default statistics give it **one
blended per-value row estimate** — measured at `rows=47` in every shape, whether the plan holds 40
activities or 2,000. Run against the scale tier (10 plans × 2,000 activities, which is ADR-0066's
own scale tier and the density ADR-0026 treats as a realistic worst-case plan), the real aggregate
reports:

```
Aggregate (actual time=5.317..5.317 rows=1 loops=8)
  -> Bitmap Heap Scan on activities act  (cost=4.79..183.49 rows=47 width=16)
                                          (actual time=0.567..5.108 rows=2000 loops=8)
       Heap Blocks: exact=14397
Execution Time: 43.479 ms
```

47 estimated against 2,000 actual, and **43 ms for that component alone** under an estimate
identical to the 40-activity shapes'.

**Nothing here breaches FC-2** — 43 ms sits well inside a 200 ms bar, and the end-to-end p95 for
that shape measured 30.5 ms. What is corrected is the **claim**: R2 is bounded in **plan count**
(≤ 8, the property that actually matters, and it holds) and **not** in per-plan activity count. The
same mechanism M4's own database-architect diagnosis names for R3 — "of the per-plan 184.33, the
aggregation is 0.83 and the other 178.7 is heap access" — applies to R2; it simply never got the
scrutiny, because R2's estimate never crosses `jit_above_cost`.

**The signal that would have shown this was being computed and thrown away.** The harness ran
`EXPLAIN (ANALYZE, BUFFERS)` on the standing query and used the result only to derive a boolean;
its text reached no report. It is printed now.

### Two things the harness still does not measure, and the claims that rest on them

`seedShape` bulk-inserts **plans and activities only** — zero dependencies, zero baselines, at all
four shapes. So FC-2 and FC-3's numbers never exercise the two `LEFT JOIN LATERAL`s at realistic
volume, and `findPlanStanding`'s docstring claim that the baseline lookup is "a one-row-per-plan
indexed lookup on `uq_baselines_plan_active`" was **asserted rather than measured by anything in the
tree**. The review checked it by hand inside rolled-back transactions and it holds at scale — the
planner switches to `Index Scan using uq_baselines_plan_active` (0.022 ms) once 6,000 baseline rows
exist, and to `Index Only Scan using idx_dependencies_plan_updated_at` (0.039 ms) once 117,000
dependencies do — but at the fixture's actual volume it seq-scans near-empty tables, so a regression
in either index's applicability would not show up in FC-3's numbers. `docs/TECH_DEBT.md` #330.
