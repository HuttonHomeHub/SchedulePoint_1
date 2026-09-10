# F3′ — the measurement, against the condition committed before it

**Status:** Approved — the run of record.
**Date:** 2026-09-10
**Condition:** [`f3-include-condition.md`](f3-include-condition.md), committed in its own commit
before the harness was touched.
**Register row:** `docs/TECH_DEBT.md` #254
**Harness:** `apps/api/scripts/measure-revision-compare.mts`

## The verdict

**C1 non-vacuity — PASS**, and it is checked first. **C2 — PASS**, 147.3 ms p95 against the 250 ms
bar, with the client's own include set. **C3 — reported below and deliberately not gated**, which
turned out to be the right call for a reason the condition could only guess at: see _What the ratio
is worth_.

```
F3' end-to-end, 2000 activities / 1900 dependencies (0.95:1), 15 runs after 3 warm-ups:
  delta only             p50  105.3 ms   p95  120.7 ms   min   83.5 ms   max  120.7 ms
  +changes +ghosts       p50  131.2 ms   p95  147.3 ms   min  108.8 ms   max  147.3 ms
  ratio (p95)            1.22x — reported, NOT gated: no ratio threshold has ever been measured
  C2  bar 250 ms p95 on the client's configuration -> PASS
  C1  non-vacuity: delta entered 828 / left 140; changes 700 rows of 3180 before the cap;
      ghosts 200 of 1020, 100 links
```

`&include=changes&include=ghosts` — the repeated form, which is what the client sends and what the
DTO accepts. Environment: the development container, 2026-09-10, Postgres 17 on localhost, the API
booted in-process under vitest with a real socket per request.

## What the ratio is worth, which is less than two decimal places

**Three runs were taken and the difference between the two configurations is not resolvable by this
harness at fifteen runs.** All three are recorded because the third alone would misrepresent the
precision:

| Run | Delta-only p95 | +changes +ghosts p95 | Difference | Notes                                    |
| --- | -------------- | -------------------- | ---------- | ---------------------------------------- |
| 1   | 135.5 ms       | 146.2 ms             | +10.7 ms   | duration-only delta; teardown then threw |
| 2   | 133.4 ms       | 138.2 ms             | +4.8 ms    | strengthened delta                       |
| 3   | 120.7 ms       | 147.3 ms             | +26.6 ms   | **the run of record** — identical to 2   |

Runs 2 and 3 are **the same measurement repeated** — the only code change between them makes the
harness count its dependencies from the database instead of from the seed array, which cannot touch
the route. They disagree by **21.8 ms on a quantity of about 15 ms**, and the delta-only figure
alone moves 14.8 ms across the three.

So the honest statement is: **the projections cost something, on the order of ten to thirty
milliseconds at this scale, and the machine's own run-to-run spread is of the same order.** The
`1.22x` in the run of record must not be quoted as a measured ratio; `1.04x` from run 2 is equally
entitled to be. This is the ADR-0127 D8 / ADR-0128 finding one route along — a delta smaller than
the instrument's own spread is not a measurement — and it is precisely why C3 declined to set a
threshold on a ratio nobody had ever measured. Had it set one, any of these three runs could have
been the one that decided whether the code passed.

**What IS resolvable, and is the answer #254 wanted:** the client's configuration clears the
published bar with roughly a hundred milliseconds of headroom on the slowest of the three runs. No
threshold sits anywhere near the spread, so the verdict does not depend on which run is quoted.

## What the run found, beyond its own number

**1. The harness had not asserted anything since ADR-0126.** Its teardown ran BEFORE its
assertions and hand-listed `baselineActivity` as the only child of `Baseline`; ADR-0126 added
`baseline_dependencies`, so the teardown hit `baseline_dependencies_baseline_id_fkey` and threw
before the committed bar was ever evaluated. The docblock's claim — _"the only thing it asserts is
the committed bar, so a regression shows up as a failure rather than as a number nobody read"_ —
has been **false since that ADR landed**.

This is the **fourteenth** copy of the sweep `docs/TECH_DEBT.md` #253 removed, and #253's own
thirteen-caller pass could not see it: that pass swept `apps/api/test/` and this file lives in
`apps/api/scripts/`. It now calls the shared `clearBaselineTree(prisma)`, which asks `Prisma.dmmf`
for the children rather than listing them, so a fifteenth table cannot repeat it.

It was survivable only because both failures are red. But a C2 breach and a stale teardown are the
same red, **and the teardown arrives first** — so a genuine regression would have been reported as
a foreign-key error in cleanup code.

**2. The condition specified a request the route refuses.** Its first version said
`?include=changes,ghosts` in three places. That is **422**: the query DTO normalises through the
shared `toArray` helper and validates `@IsIn(REVISION_INCLUDES, { each: true })`, so a comma-joined
value is read as one member named `changes,ghosts`. Had the harness run as written it would have
thrown `compare 422` before taking a sample, and the natural reading of that failure is "the route
is broken", not "the condition is". Caught by reading the DTO before running, and corrected in the
condition document in place with the reason recorded, because a condition committed before a
measurement is worth exactly what its accuracy is worth.

**3. The first run reported `0 links`, so half of what #254 names was still untimed.** The row's
complaint is that _"the change classifier and the two geometry builders have never been timed end
to end over HTTP"_, and a duration-only mutation exercises the ghost **bar** builder while leaving
the ghost **link** builder at zero rows. The first run satisfied the committed C1 — a change row
and a ghost — and still did not time the thing the row asked about.

The mutation now also removes fifty edges and adds fifty, in both directions because ADDED and
REMOVED are different code paths (a removed edge is in no live edge list and must be carried from
the old side). Every added edge runs low index → high index like the seed's, so the graph stays a
DAG by construction and the recalculation cannot refuse it for a cycle. **Strengthening the delta
exceeds the committed floor rather than relaxing it**, which is the only direction a condition may
be moved after it is written.

**4. The header printed a number the harness had not measured.** It reported `edges.length` — what
was _inserted_ — as the dependency count of the plan being measured. Those agree today only because
removing fifty and adding fifty is edge-neutral, and would have diverged silently the first time
somebody changed one of those fifties. It is now a `count()` against the database.

## What this does NOT establish

- **One machine, one night.** The absolute figures are this container's and are roughly double the
  58.7 ms `docs/API.md` publishes for the delta-only route from a different machine
  (`m1-f3-measurement.md`). **The published figure is therefore not replaced by this one** — two
  numbers from two machines do not compare, and swapping in the slower would misrepresent the
  route. What travels between machines is the finding that the projections are a small fraction of
  a request the bar already clears.
- **The ratio**, to any precision, for the reason above.
- Chains of twenty are not a real WBS, and the seed stays thinner than a real programme (0.95:1
  against roughly 1.6:1). Stated rather than mischaracterised; closing it is separate work.
- Nothing here measures the **client**. Rendering the change list and the ghost overlay is
  ADR-0127's question, answered on the product owner's own hardware.
- `?include=progress` is **not** measured, because the client deliberately does not ask for it.
