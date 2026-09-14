# M0 measurements — the staff diagnostics panel

- **Status:** Approved
- **Date opened:** 2026-09-13

## The falsification condition, committed BEFORE the run

This section is written and committed in its own commit, before any query is executed, for the
reason the plan gives: a bar chosen after seeing the number is not a bar. If either limb fails, the
spec's §4.5 anchoring is reopened or M0-T3 arms — **the bar does not move.**

**D-A (the day-factor divergence count) must, against a 2,000-activity plan:**

1. complete in **≤ 500 ms** wall clock, and
2. show **no sequential scan of `activities`** in the chosen plan.

**Non-vacuity control, checked first.** The fixture must actually contain diverging activities and
the query must return a non-zero count. A benchmark over a population with no divergence measures
the fastest path the query has and says nothing about the case it exists for — the ADR-0129 P3
lesson, and the reason ADR-0128 makes INDETERMINATE a first-class verdict.

**Recorded honestly either way**, including a failure, and including which database each run was
taken against. A number from the wrong database is worse than no number: `#86`'s M0-T3 is still
owed precisely because a test database answers it with a structural zero.

## What this document will NOT contain

The **deployed** population count. It cannot be taken from a container, it is the whole reason the
panel exists, and substituting a test-database zero for it would be the failure this epic is
written to remove. It is owed and stays owed until the panel is built or somebody runs it by hand.

## Results

**Taken:** 2026-09-13.
**Database:** `app_test` on the session container's local PostgreSQL — **16.13**, not the 17 the
stack targets (`docs/DATABASE.md`). Named because a number from the wrong database is worse than no
number, and because a plan shape is a property of a planner version: nothing below should be quoted
as "what Postgres does" without that caveat.
**Fixture:** built by raw SQL (`fixture.sql`, reproduced in §Fixture below). That is deliberate and
narrow — ADR-0066's build-it-through-the-public-API rule governs fixtures that prove **product
behaviour**, and this proves none. It measures a query's cost and checks that two SQL forms return
the same count. Correctness of the day factor is proved by
`apps/api/test/resource-dependent-day-factor.e2e-spec.ts`, which does go through the API.
**Hygiene:** every reading below was taken on an unbloated relation. The first pass was not — a
`DELETE` leaves the pages behind, so a rebuilt 2,000-row table inherited the physical size of the
102,000-row one and the planner costed a sequential scan at 1613 against its true 66. Both scales
were re-taken after `VACUUM FULL`, and the spread narrowed. Recorded because the wrong numbers
looked entirely plausible.

### The query that produced these numbers

Quoted verbatim rather than retyped — the register entry must carry the query that produced the
number.

```sql
SELECT count(*) AS affected_activities, count(DISTINCT a.plan_id) AS affected_plans
FROM resource_assignments ra
JOIN resources r  ON r.id = ra.resource_id AND r.deleted_at IS NULL
JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
                 AND a.type = 'RESOURCE_DEPENDENT'
JOIN plans p      ON p.id = a.plan_id AND p.deleted_at IS NULL
LEFT JOIN calendars oc ON oc.id = COALESCE(a.calendar_id, p.calendar_id)
LEFT JOIN calendars sc ON sc.id = COALESCE(r.calendar_id, a.calendar_id, p.calendar_id)
WHERE ra.is_driving = true AND ra.deleted_at IS NULL
  AND COALESCE(oc.hours_per_day_minutes, 1440) <> COALESCE(sc.hours_per_day_minutes, 1440);
```

### Non-vacuity control, checked first

`200 | 1` — 200 diverging activities across 1 plan, out of 2,000. Not zero, and not everything: a
realistic ratio. A benchmark over a population with no divergence reports the fastest number the
query can produce and says nothing about the case it exists for.

The control was re-run and held at `200 | 1` at **every** scale below, including variant C, which
adds 100,000 driven activities that must **not** diverge. A scale change that silently changed the
answer would be a rewrite defect wearing a measurement's clothes.

### Verdict: limb 1 PASSES, limb 2 FAILS

| Limb | Bar                                | Measured                                                   | Verdict                                        |
| ---- | ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| 1    | ≤ 500 ms at 2,000 activities       | **1.46–2.45 ms**                                           | **PASS**, by more than two orders of magnitude |
| 2    | no sequential scan of `activities` | `Seq Scan on activities a`, `Rows Removed by Filter: 1800` | **FAIL**                                       |

**The bar did not move.** Per the condition committed before the run, a failing limb reopens §4.5's
anchoring or arms M0-T3. Both are dealt with below, and §4.5's anchoring is the one that is wrong.

### The three variants, and what each does and does not discriminate

| Variant                                    | `activities` | of which `RESOURCE_DEPENDENT` | driving assignment rows | diverging | measured                                 |
| ------------------------------------------ | -----------: | ----------------------------: | ----------------------: | --------: | ---------------------------------------- |
| **A** — the committed condition            |        2,000 |                           200 |                     200 |       200 | **1.46 / 1.49 / 1.56 / 2.45 ms**         |
| **B** — a large estate, sparsely resourced |      102,000 |                           200 |                     200 |       200 | **30.97 / 31.41 / 33.51 / 34.76 ms**     |
| **C** — a large estate, fully resourced    |      102,000 |                       100,200 |                 100,200 |       200 | **160.76 / 164.88 / 166.39 / 203.93 ms** |

Variant C exists because A and B both leave `resource_assignments` at 200 rows, and a sequential
scan of 200 rows is _correctly_ cheaper than any index on them. Without C, "the partial unique was
not used" would have been a statement about the fixture and not about the query.

**Limb 1 passes at all three.** Even C — an all-resourced 100,000-activity estate, far beyond
anything this installation is near — sits inside the bar with ~2.2× headroom.

**Limb 2 fails at all three, and the shape of the failure changes:**

- **A:** a literal `Seq Scan on activities`, 1,800 rows discarded.
- **B:** `Index Scan using activities_pkey` — but `Rows Removed by Filter: 101800`. A **full** index
  scan, which is a sequential scan wearing an index's name. It is the same quantity of work and it
  must not be reported as a pass.
- **C:** `Seq Scan on activities` again, 100,000 discarded, **and** a `Seq Scan on
resource_assignments` over all 100,200 rows.

### §4.5's anchoring argument is falsified, and this is the finding

§4.5 says, of anchoring the query on `resource_assignments WHERE is_driving AND deleted_at IS NULL`:

> starts from a small set and joins outward.

It does not, and the reason is worth carrying because it is not the reason the section anticipated.
§4.5 labelled its index-usage expectation **reasoned, not measured**, and cited ADR-0086 M6's
finding that Postgres matches a partial index by expression equality rather than containment. That
is a real hazard and it is **not** what happened here. What happened is one level up:

**Anchoring the query TEXT on a table does not decide which table the planner drives from.** The
`type = 'RESOURCE_DEPENDENT'` filter lives on `activities`, the planner estimated it selective, and
so it led with `activities` at every scale — whatever the `FROM` clause said first.

And the partial unique `uq_resource_assignments_activity_driving` **structurally cannot serve this
query**, at any scale, however the text is written. That index exists for _"find THE driving
assignment of this activity"_ — a per-activity lookup, which is a **selective** question. This query
wants **every** driving assignment: in variant C its `WHERE` matches 100,200 of 100,200 rows, so
there is no selectivity for an index to offer and a sequential scan is the correct plan. That is
ADR-0086 M6's lesson in a second costume — there, an index could not be matched; here, a covering
index cannot be _selective_ for a query that wants the whole covered set.

§4.5's other two arguments are untouched and still stand: `$queryRaw` on boundary grounds (only
integers cross), and the semantic point that an activity with no active driver can never diverge.
Only the cost paragraph is wrong.

### M0-T3 — does NOT arm, on measurement

The plan arms M0-T3 for "a sequential scan of `activities` **that matters**". It does not matter,
and the reason is measured rather than asserted — **the index helps only the case that is already
cheap, and cannot help the expensive one.**

A candidate index was built inside a rolled-back transaction and the query re-planned against it:

```sql
CREATE INDEX idx_probe_activities_type ON activities (type) WHERE deleted_at IS NULL;
```

| Variant                    | without the index | with it       | planner's choice                     |
| -------------------------- | ----------------- | ------------- | ------------------------------------ |
| **B** (sparsely resourced) | 30.97–34.76 ms    | **1.20 ms**   | index **chosen**                     |
| **C** (fully resourced)    | 160.76–203.93 ms  | **162.09 ms** | index **not chosen** — seq scan kept |

So it buys ~33 ms on the variant that is already thirty milliseconds, and **nothing at all** on the
variant that approaches the bar. Adding an index to the product's busiest table — paid on every
activity insert, update and soft-delete, for ever — to take a human-pressed staff diagnostic from
34 ms to 1 ms is the trade ADR-0053 M4 declined in almost these words ("the candidate partial saved
0.14 ms for 1,296 kB").

**The space cost is NOT the argument, and saying so is the honest version.** Measured, the index is
**704 kB against a 48 MB table** at 102,000 activities — negligible, and a `type` index might well
earn its keep for some other query one day. The argument is the shape of the benefit, not its price.

**The trigger that re-arms this**, so that "it does not matter" is a checkable claim and not a
shrug: M0-T3 opens if the diagnostic's measured cost against the **deployed** database exceeds
**100 ms**, or if this query ever moves off the on-demand staff route onto a path something else
waits for. Re-running it is `EXPLAIN (ANALYZE)` on the constant M2 ships.

`database-architect` is therefore **not engaged, because there is no schema change to design** — not
because one was judged too small. §19.3's rule binds a change; declining to make one is the decision
it exists to protect.

### The M2 throttle number, derived (spec Q-e) — **superseded, see the M4 addendum below**

> **Both halves of this section turned out to be wrong**, and it is left standing rather than edited
> because the way it was wrong is the finding: it derives a press cost from **one** query when the
> press is four, and it asserts a rate limit that was never wired into the handler at all. The
> corrected derivation is at the end of this file.

The spec carries **6 / 60 s** as a placeholder "revisited against M0-T2's measured cost". It is
revisited here, and it survives — but it survives because a number was taken, not because nobody
looked, and the arithmetic is what makes the difference.

Worst measured cost per press is **204 ms** (variant C, the estate shape this installation is
furthest from). At 6/60 s a single caller can impose at most **1.2 s of database time per minute**.
At the deployed size — one organisation, a handful of plans, a driven population in the dozens — the
press costs on the order of **1 ms**, so the throttle is not a cost control at all there; it is an
abuse control, and it is tighter than the controller default of 30/min that a new handler would
otherwise inherit (`docs/TECH_DEBT.md` #315).

**The number that would change it:** if the worst-case press ever reached ~800 ms — one
recalculate-equivalent, taking ADR-0116 M6's measured 846 ms at 2,000 activities as the yardstick —
6/60 s would put ~4.8 s of database time per minute behind one button, and the rate would have to
come down. It is 204 ms.

### The two query forms agree

Both the re-anchored form (M0-T1's corrected constant, above) and the `DISTINCT ON` form the brief
started from return **`200 | 1`** at 102,000 activities, and cost the same order (22.9–42.0 ms). The
re-anchored form is the one that ships, and `DISTINCT ON` is dropped rather than given an
`ORDER BY`: `uq_resource_assignments_activity_driving` is
`UNIQUE (activity_id) WHERE (is_driving AND deleted_at IS NULL)` — read from `pg_indexes` on the
running database, not from the migration file — so at most one driving assignment per activity can
exist and there is nothing to de-duplicate. A rewrite that changes the answer is a defect; a rewrite
that changes it silently is the failure class this repository keeps recording, which is why the two
forms were run against the same fixture rather than reasoned about.

### The plans, verbatim

Recorded in full rather than summarised, per the plan's own step 2.

#### Variant A — 2,000 activities

```text
                                                                             QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=1044.71..1044.72 rows=1 width=16) (actual time=2.186..2.189 rows=1 loops=1)
   Buffers: shared hit=848
   ->  Sort  (cost=1044.64..1044.66 rows=10 width=16) (actual time=2.129..2.140 rows=200 loops=1)
         Sort Key: a.plan_id
         Sort Method: quicksort  Memory: 29kB
         Buffers: shared hit=848
         ->  Nested Loop  (cost=7.77..1044.47 rows=10 width=16) (actual time=0.202..2.024 rows=200 loops=1)
               Join Filter: (r.id = ra.resource_id)
               Buffers: shared hit=845
               ->  Hash Left Join  (cost=2.09..73.69 rows=100 width=48) (actual time=0.148..1.069 rows=200 loops=1)
                     Hash Cond: (COALESCE(r.calendar_id, a.calendar_id, p.calendar_id) = sc.id)
                     Filter: (COALESCE(oc.hours_per_day_minutes, 1440) <> COALESCE(sc.hours_per_day_minutes, 1440))
                     Buffers: shared hit=45
                     ->  Hash Left Join  (cost=1.04..72.11 rows=200 width=100) (actual time=0.111..0.957 rows=200 loops=1)
                           Hash Cond: (COALESCE(a.calendar_id, p.calendar_id) = oc.id)
                           Buffers: shared hit=44
                           ->  Nested Loop  (cost=0.00..70.53 rows=200 width=96) (actual time=0.064..0.836 rows=200 loops=1)
                                 Join Filter: (p.id = a.plan_id)
                                 Buffers: shared hit=43
                                 ->  Nested Loop  (cost=0.00..2.03 rows=1 width=64) (actual time=0.049..0.051 rows=1 loops=1)
                                       Buffers: shared hit=2
                                       ->  Seq Scan on resources r  (cost=0.00..1.01 rows=1 width=32) (actual time=0.029..0.030 rows=1 loops=1)
                                             Filter: (deleted_at IS NULL)
                                             Buffers: shared hit=1
                                       ->  Seq Scan on plans p  (cost=0.00..1.01 rows=1 width=32) (actual time=0.017..0.017 rows=1 loops=1)
                                             Filter: (deleted_at IS NULL)
                                             Buffers: shared hit=1
                                 ->  Seq Scan on activities a  (cost=0.00..66.00 rows=200 width=48) (actual time=0.013..0.748 rows=200 loops=1)
                                       Filter: ((deleted_at IS NULL) AND (type = 'RESOURCE_DEPENDENT'::"ActivityType"))
                                       Rows Removed by Filter: 1800
                                       Buffers: shared hit=41
                           ->  Hash  (cost=1.02..1.02 rows=2 width=20) (actual time=0.018..0.018 rows=2 loops=1)
                                 Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                 Buffers: shared hit=1
                                 ->  Seq Scan on calendars oc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.010..0.011 rows=2 loops=1)
                                       Buffers: shared hit=1
                     ->  Hash  (cost=1.02..1.02 rows=2 width=20) (actual time=0.009..0.010 rows=2 loops=1)
                           Buckets: 1024  Batches: 1  Memory Usage: 9kB
                           Buffers: shared hit=1
                           ->  Seq Scan on calendars sc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.002..0.002 rows=2 loops=1)
                                 Buffers: shared hit=1
               ->  Bitmap Heap Scan on resource_assignments ra  (cost=5.68..9.70 rows=1 width=32) (actual time=0.003..0.003 rows=1 loops=200)
                     Recheck Cond: ((a.id = activity_id) AND is_driving AND (deleted_at IS NULL))
                     Heap Blocks: exact=200
                     Buffers: shared hit=800
                     ->  Bitmap Index Scan on uq_resource_assignments_activity_driving  (cost=0.00..5.68 rows=1 width=0) (actual time=0.002..0.002 rows=1 loops=200)
                           Index Cond: (activity_id = a.id)
                           Buffers: shared hit=600
 Planning:
   Buffers: shared hit=863
 Planning Time: 3.154 ms
 Execution Time: 2.451 ms
(52 rows)
```

#### Variant B — 102,000 activities, sparsely resourced

```text
                                                                                QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=162.05..162.06 rows=1 width=16) (actual time=33.288..33.295 rows=1 loops=1)
   Buffers: shared hit=2682
   ->  Sort  (cost=162.04..162.05 rows=1 width=16) (actual time=33.248..33.263 rows=200 loops=1)
         Sort Key: a.plan_id
         Sort Method: quicksort  Memory: 29kB
         Buffers: shared hit=2682
         ->  Nested Loop Left Join  (cost=50.54..162.03 rows=1 width=16) (actual time=0.172..33.197 rows=200 loops=1)
               Join Filter: (sc.id = COALESCE(r.calendar_id, a.calendar_id, p.calendar_id))
               Rows Removed by Join Filter: 200
               Filter: (COALESCE(oc.hours_per_day_minutes, 1440) <> COALESCE(sc.hours_per_day_minutes, 1440))
               Buffers: shared hit=2682
               ->  Merge Join  (cost=50.54..160.98 rows=1 width=68) (actual time=0.168..32.896 rows=200 loops=1)
                     Merge Cond: (a.id = ra.activity_id)
                     Join Filter: (r.id = ra.resource_id)
                     Buffers: shared hit=2482
                     ->  Nested Loop Left Join  (cost=0.42..8572.04 rows=235 width=100) (actual time=0.077..32.711 rows=200 loops=1)
                           Join Filter: (oc.id = COALESCE(a.calendar_id, p.calendar_id))
                           Buffers: shared hit=2478
                           ->  Nested Loop  (cost=0.42..8563.97 rows=235 width=96) (actual time=0.066..32.615 rows=200 loops=1)
                                 Join Filter: (p.id = a.plan_id)
                                 Buffers: shared hit=2477
                                 ->  Index Scan using activities_pkey on activities a  (cost=0.42..8558.42 rows=235 width=48) (actual time=0.025..32.489 rows=200 loops=1)
                                       Filter: ((deleted_at IS NULL) AND (type = 'RESOURCE_DEPENDENT'::"ActivityType"))
                                       Rows Removed by Filter: 101800
                                       Buffers: shared hit=2475
                                 ->  Materialize  (cost=0.00..2.03 rows=1 width=64) (actual time=0.000..0.000 rows=1 loops=200)
                                       Buffers: shared hit=2
                                       ->  Nested Loop  (cost=0.00..2.03 rows=1 width=64) (actual time=0.032..0.034 rows=1 loops=1)
                                             Buffers: shared hit=2
                                             ->  Seq Scan on resources r  (cost=0.00..1.01 rows=1 width=32) (actual time=0.019..0.019 rows=1 loops=1)
                                                   Filter: (deleted_at IS NULL)
                                                   Buffers: shared hit=1
                                             ->  Seq Scan on plans p  (cost=0.00..1.01 rows=1 width=32) (actual time=0.012..0.013 rows=1 loops=1)
                                                   Filter: (deleted_at IS NULL)
                                                   Buffers: shared hit=1
                           ->  Materialize  (cost=0.00..1.03 rows=2 width=20) (actual time=0.000..0.000 rows=1 loops=200)
                                 Buffers: shared hit=1
                                 ->  Seq Scan on calendars oc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.007..0.007 rows=1 loops=1)
                                       Buffers: shared hit=1
                     ->  Sort  (cost=13.64..14.14 rows=200 width=32) (actual time=0.088..0.102 rows=200 loops=1)
                           Sort Key: ra.activity_id
                           Sort Method: quicksort  Memory: 35kB
                           Buffers: shared hit=4
                           ->  Seq Scan on resource_assignments ra  (cost=0.00..6.00 rows=200 width=32) (actual time=0.004..0.041 rows=200 loops=1)
                                 Filter: (is_driving AND (deleted_at IS NULL))
                                 Buffers: shared hit=4
               ->  Seq Scan on calendars sc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.000..0.001 rows=2 loops=200)
                     Buffers: shared hit=200
 Planning:
   Buffers: shared hit=848 read=8
 Planning Time: 3.139 ms
 Execution Time: 33.513 ms
(52 rows)
```

#### Variant C — 102,000 activities, fully resourced

```text
                                                                                QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=17298.95..17298.96 rows=1 width=16) (actual time=203.584..203.591 rows=1 loops=1)
   Buffers: shared hit=5952
   ->  Sort  (cost=16929.65..17052.75 rows=49240 width=16) (actual time=203.544..203.558 rows=200 loops=1)
         Sort Key: a.plan_id
         Sort Method: quicksort  Memory: 29kB
         Buffers: shared hit=5952
         ->  Hash Left Join  (cost=4080.67..13092.00 rows=49240 width=16) (actual time=71.324..203.460 rows=200 loops=1)
               Hash Cond: (COALESCE(r.calendar_id, a.calendar_id, p.calendar_id) = sc.id)
               Filter: (COALESCE(oc.hours_per_day_minutes, 1440) <> COALESCE(sc.hours_per_day_minutes, 1440))
               Rows Removed by Filter: 100000
               Buffers: shared hit=5949
               ->  Hash Left Join  (cost=4079.63..12825.74 rows=98480 width=68) (actual time=71.283..186.973 rows=100200 loops=1)
                     Hash Cond: (COALESCE(a.calendar_id, p.calendar_id) = oc.id)
                     Buffers: shared hit=5948
                     ->  Hash Join  (cost=4078.58..12560.71 rows=98480 width=64) (actual time=71.222..165.548 rows=100200 loops=1)
                           Hash Cond: ((ra.resource_id = r.id) AND (a.plan_id = p.id))
                           Buffers: shared hit=5947
                           ->  Hash Join  (cost=4076.50..10835.23 rows=98480 width=48) (actual time=71.157..143.000 rows=100200 loops=1)
                                 Hash Cond: (a.id = ra.activity_id)
                                 Buffers: shared hit=5945
                                 ->  Seq Scan on activities a  (cost=0.00..5398.00 rows=100249 width=48) (actual time=0.014..37.646 rows=100200 loops=1)
                                       Filter: ((deleted_at IS NULL) AND (type = 'RESOURCE_DEPENDENT'::"ActivityType"))
                                       Rows Removed by Filter: 1800
                                       Buffers: shared hit=4123
                                 ->  Hash  (cost=2824.00..2824.00 rows=100200 width=32) (actual time=70.242..70.243 rows=100200 loops=1)
                                       Buckets: 131072  Batches: 1  Memory Usage: 7287kB
                                       Buffers: shared hit=1822
                                       ->  Seq Scan on resource_assignments ra  (cost=0.00..2824.00 rows=100200 width=32) (actual time=0.011..37.797 rows=100200 loops=1)
                                             Filter: (is_driving AND (deleted_at IS NULL))
                                             Buffers: shared hit=1822
                           ->  Hash  (cost=2.05..2.05 rows=2 width=64) (actual time=0.042..0.044 rows=2 loops=1)
                                 Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                 Buffers: shared hit=2
                                 ->  Nested Loop  (cost=0.00..2.05 rows=2 width=64) (actual time=0.030..0.033 rows=2 loops=1)
                                       Buffers: shared hit=2
                                       ->  Seq Scan on plans p  (cost=0.00..1.01 rows=1 width=32) (actual time=0.023..0.023 rows=1 loops=1)
                                             Filter: (deleted_at IS NULL)
                                             Buffers: shared hit=1
                                       ->  Seq Scan on resources r  (cost=0.00..1.02 rows=2 width=32) (actual time=0.005..0.006 rows=2 loops=1)
                                             Filter: (deleted_at IS NULL)
                                             Buffers: shared hit=1
                     ->  Hash  (cost=1.02..1.02 rows=2 width=20) (actual time=0.024..0.024 rows=2 loops=1)
                           Buckets: 1024  Batches: 1  Memory Usage: 9kB
                           Buffers: shared hit=1
                           ->  Seq Scan on calendars oc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.017..0.018 rows=2 loops=1)
                                 Buffers: shared hit=1
               ->  Hash  (cost=1.02..1.02 rows=2 width=20) (actual time=0.014..0.014 rows=2 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=1
                     ->  Seq Scan on calendars sc  (cost=0.00..1.02 rows=2 width=20) (actual time=0.003..0.004 rows=2 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=868
 Planning Time: 4.550 ms
 Execution Time: 203.929 ms
(55 rows)
```

### Fixture

The fixture and its three scaling steps were removed from `app_test` after the run, and the
candidate index existed only inside a rolled-back transaction — confirmed afterwards by querying
`pg_indexes` for it and finding nothing. `app_test` is back to zero activities, zero assignments and
zero organisations.

```sql
-- Variant A
-- Measurement fixture ONLY. Built with raw SQL deliberately: ADR-0066's build-through-the-public-API
-- rule governs fixtures that prove PRODUCT BEHAVIOUR, and this proves neither — it exists to measure
-- a query's cost and to check two SQL forms agree. Correctness of the day factor is proved by
-- `resource-dependent-day-factor.e2e-spec.ts`, which does go through the API.
BEGIN;
INSERT INTO organizations (id, name, slug, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001','M0 Org','m0-org', now());
INSERT INTO clients (id, organization_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','C', now());
INSERT INTO projects (id, organization_id, client_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','P', now());
-- An 8 h plan calendar (480) and a 24 h crane calendar (1440): the pairing that diverges.
INSERT INTO calendars (id, organization_id, name, hours_per_day_minutes, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Crew 8h',480, now()),
  ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Crane 24h',1440, now());
INSERT INTO plans (id, organization_id, project_id, name, planned_start, calendar_id, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','Pl','2026-01-01','00000000-0000-4000-8000-000000000004', now());
INSERT INTO resources (id, organization_id, name, kind, calendar_id, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','Crane','EQUIPMENT','00000000-0000-4000-8000-000000000005', now());

-- 2,000 activities. Every 10th is RESOURCE_DEPENDENT with a driving crane assignment, so 200
-- diverge — a non-vacuous population, and a realistic ratio rather than an all-or-nothing one.
INSERT INTO activities (id, organization_id, plan_id, name, type, updated_at)
SELECT
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000006',
  'A' || g,
  (CASE WHEN g % 10 = 0 THEN 'RESOURCE_DEPENDENT' ELSE 'TASK' END)::"ActivityType",
  now()
FROM generate_series(1, 2000) g;

INSERT INTO resource_assignments (id, organization_id, activity_id, resource_id, is_driving, updated_at)
SELECT
  ('00000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000007',
  true, now()
FROM generate_series(10, 2000, 10) g;
COMMIT;
ANALYZE activities; ANALYZE resource_assignments; ANALYZE plans; ANALYZE calendars; ANALYZE resources;
```

```sql
-- Variant B adds 100,000 TASK activities to the same plan.
INSERT INTO activities (id, organization_id, plan_id, name, type, updated_at)
SELECT
  ('00000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000006',
  'B' || g,
  'TASK'::"ActivityType",
  now()
FROM generate_series(1, 100000) g;
ANALYZE activities;
```

```sql
-- Variant C then converts those 100,000 to RESOURCE_DEPENDENT, each driven by a resource ON THE
-- PLAN CALENDAR, so the population shape changes and the diverging count does not.
-- Variant C: scale `resource_assignments` too, so the partial unique has something to be worth using.
-- The 100,000 filler activities become RESOURCE_DEPENDENT, each driven by a crew resource ON THE PLAN
-- CALENDAR, so the divergent count stays 200 and only the population shape changes.
BEGIN;
INSERT INTO resources (id, organization_id, name, kind, calendar_id, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','Crew','LABOUR','00000000-0000-4000-8000-000000000004', now());
UPDATE activities SET type = 'RESOURCE_DEPENDENT'
 WHERE organization_id = '00000000-0000-4000-8000-000000000001'
   AND id::text LIKE '00000000-0000-4000-b000-%';
INSERT INTO resource_assignments (id, organization_id, activity_id, resource_id, is_driving, updated_at)
SELECT
  ('00000000-0000-4000-c000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000008',
  true, now()
FROM generate_series(1, 100000) g;
COMMIT;
ANALYZE activities; ANALYZE resource_assignments; ANALYZE resources;
```

---

## M4 addendum (2026-09-13) — D-B was never costed, and it is the expensive half

**Everything above measures D-A.** That is not a framing choice made here; it is what M0-T2's
committed condition said, and it was correct on the day, because D-B was not yet a decided entry.
By the time the route shipped it was, and nothing went back to measure it. The M4
backend-performance review found that, measured it, and the numbers below were then **re-derived
independently** with the four SQL constants extracted verbatim from the shipped
`staff-diagnostics.registry.ts` rather than retyped.

**Why it went unmeasured is worth more than the number.** `feature-spec.md` §0's decision table
describes D-B's tables as _"activities, plans, calendars (+ the driving CTE only for the RD
branch)"_ — i.e. cheaper than D-A, no resource join. The **shipped** query joins
`resource_assignments` and `resources` unconditionally, because that is how it excludes D-A's
population (the three exclusions in the entry's own docblock). A planning artefact said the entry
was cheap, the entry stopped being that, and the cost task was scoped to its sibling. That row is
corrected in the spec rather than left.

### Measured

Same database as above (`app_test`, PostgreSQL 16.13), M0's variant-A fixture plus 100,000 plain
`TASK` activities with no calendar of their own — **D-B's worst shape**, and the ordinary one: an
activity that names no calendar is the common case, not an edge case, and every XER import produces
a plan whose calendar is not 24 hours.

Non-vacuity control first, and it is not a formality — it is what says the expensive query was
doing work: `da-denominator 200`, `da-numerator 200|1|1`, `db-denominator 102000`,
`db-numerator 101800|1|1`.

| Query                                                        | 102,000 activities, D-B's worst shape |
| ------------------------------------------------------------ | ------------------------------------- |
| D-A denominator                                              | 26.3 / 26.8 / 30.6 ms                 |
| D-A numerator                                                | 30.2 / 31.3 / 31.8 ms                 |
| D-B denominator                                              | 24.9 / 25.5 / 25.7 ms                 |
| **D-B numerator**                                            | **240.4 / 244.2 / 244.7 ms**          |
| **The press — all four, in the order the service runs them** | **327 / 328 / 328 ms**                |

**D-B's numerator is three quarters of the press.** Its plan estimates `rows=1` against an actual
**101,800** and then joins that whole matched set row by row. That is M0's own finding — the
planner drives from where the selective filter is, not from where the `FROM` clause starts — landing
on a different join in a different query that nobody re-derived it for.

**One rewrite was tried and rejected on measurement.** The plan's `Sort` node reads
`actual time=249.330..258.530` beside an aggregate at 287 ms, which looks exactly like two
`count(DISTINCT …)` dominating the cost. Removing both measures **228–256 ms against 288–304 ms** —
19 %, because that `Sort` timing is inclusive of its 223 ms child. The expensive thing is the
matched-set join, there is no cheap rewrite, and the hypothesis was disproved in two minutes by
running it rather than by reasoning about it.

### The throttle, re-derived — and it was never wired in at all

The section above derived **6 / 60 s** from D-A alone and said it "survives". Two things were wrong
with that, found independently by three reviewers:

1. **The route shipped at 30 / 60 s.** It carried no decorator of its own and inherited the
   controller's, while ADR-0140 D7, the implementation plan and this file all asserted 6 — and
   `staff-throttle.structural.spec.ts` structurally **forbade** the override, asserting `@Throttle`
   appeared exactly once in the file. A decision recorded in three documents, contradicted by a gate,
   and absent from the code.
2. **204 ms was one query, not a press.** The press is four.

Re-derived against the measurement above: **327 ms a press**, so 6 / 60 s caps one caller at
**~2.0 s of database time a minute** and the inherited 30 would cap them at **~9.8 s**. The
reopening trigger is unchanged — a press reaching one recalculate-equivalent, ADR-0116 M6's measured
846 ms at 2,000 activities — and at 327 ms it does not fire. The decorator now exists, on the
handler, and the gate was amended to admit a **strictly tighter** override and to refuse a widening
one, verified red three ways including against the exact absence this pass found.

### D-B's re-arm trigger, which it did not have

M0-T3's trigger is written for D-A's candidate index and says nothing about D-B. D-B gets its own,
in the same form so neither is the special case:

> **M0-T3 opens for D-B if a press against the deployed database exceeds 500 ms**, or if D-B's
> numerator alone exceeds 300 ms. Re-running it is `EXPLAIN (ANALYZE)` on the constant the registry
> ships.

500 rather than 100 because the answer for D-B is already known to be "not an index": the candidate
with the right polarity (`activities(id) WHERE deleted_at IS NULL AND calendar_id IS NULL`) was
built inside a rolled-back transaction and **the planner does not choose it** — the predicate matches
too large a fraction of the table to offer selectivity, which is M0-T3's own conclusion arriving at
a different query by the same route. So the trigger is set where the remedy would have to be
something else: a narrower question, a cached answer, or a different shape entirely.

**Still not the deployed number.** Everything here is a synthetic fixture on a test database. The
figure `docs/TECH_DEBT.md` #86's M0-T3 is owed remains owed until somebody presses the button on
the host — which is the whole reason the panel exists.
