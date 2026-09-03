# Revision Compare — the M0 measurement and verdict

> Judged against [`m0-condition.md`](./m0-condition.md), which was committed on its own **before**
> this harness existed. Nothing in the predicate was adjusted after a number was seen; where the
> harness itself was wrong, the wrong run is recorded here rather than deleted.

**Verdict: Tier 3 as specified is WITHDRAWN.** C1 and C3-a pass. **C2 fails** and **C3-b fails**.
C4 passes, so the failure is not vacuous — the change set genuinely exercises all six classes.

Under the falsification clause the choice between fallback **(a) contribution without ranking** and
**(b) the critical-path delta only** goes to the product owner (CQ-4). It is not made here.

## What was measured, and where

`apps/api/test/m0-attribution.e2e-spec.ts`, run against the seeded fixture plan
`plan:fixture-p6-torture-v1` in a local Postgres. Raw output: reproduce with

```
DATABASE_URL=… pnpm --filter @repo/api exec vitest run \
  --config vitest.e2e.config.mts test/m0-attribution.e2e-spec.ts
```

**Where it bypasses the product (ADR-0081 §3):** it does not go through the REST API, a DTO, the
plan edit-lock or any write path. It reads the plan and calls `computeSchedule` directly. A PASS
would have said the **method** works; it says nothing about a route.

It builds its input with the service's own private `buildEngineGraph`, pinned by
`apps/api/test/m0-engine-input.e2e-spec.ts` to reproduce the product's schedule exactly
(147 activities, 188 edges, project finish `2027-03-12`, 87 critical). That pinning exists because
an **earlier harness built the graph from `test/pairwise/spec-to-engine.ts` and scheduled a plan four
and a half months different** — every number taken before that correction was withdrawn.

## The subject

- 147 activities, 188 dependencies, plan calendar **2,400 working minutes per week**.
- Completion carrier: `…3015ef364531`, `TASK`, **no constraint**, finish `2027-03-12`.
- Six perturbable targets on the driving chain back from the carrier.

## C4 — non-vacuity: **PASS**

Each class applied alone, from `R_old`, measured as the fixed carrier's movement in working days on
its own calendar:

| Class    |  Carrier | Project finish          | Target's own finish     |
| -------- | -------: | ----------------------- | ----------------------- |
| SCOPE    | **19 d** | 2027-03-12 → 2027-04-08 | (inserted) → 2027-03-25 |
| DURATION | **24 d** | → 2027-04-15            | 2027-01-28 → 2027-03-25 |
| LOGIC    | **24 d** | → 2027-04-15            | (edge lag)              |
| BOUNDS   | **11 d** | → 2027-03-29            | 2027-01-21 → 2027-03-01 |
| CALENDAR | **29 d** | → 2027-04-22            | 2026-12-17 → 2027-03-04 |
| PROGRESS |  **2 d** | → 2027-03-16            | 2026-12-13 → 2027-01-22 |

`total` = **139 working days**. Six classes, ≥ 10 days, a logic change and a calendar change present,
all six non-zero alone (C4-c), and all six act on the driving chain to the carrier, so they compete
for the same float (C4-b) — at the adversarial extreme rather than the minimum the condition asks
for. **All four limbs pass.**

### Three generator defects found on the way, all by measuring rather than reasoning

Recorded because each one produced a plausible wrong answer, and the first of them would have been
reported as a finding about the **product** rather than about the harness.

1. **Four classes attributed exactly zero, and the tempting explanation was wrong.** The first run
   showed `LOGIC`, `BOUNDS`, `CALENDAR` and `PROGRESS` at 0 d. The explanation reached for was that
   the carrier is pinned and ADR-0035 §7 breaks logic in front of a mandatory constraint. **The
   carrier has no constraint at all** — printing it settled that in one run. The real cause is that
   the first target on the chain carries **12,360 minutes (25.75 working days) of total float**, so
   every 8–15 day perturbation upstream of it was absorbed before it reached the carrier. The
   perturbations are now sized at **40 working days**, stated as a constant rather than tuned until
   the numbers looked good.
2. **Deleting a driving-chain activity moved the carrier by exactly zero.** The chain re-routes
   through another predecessor, so a delete is a weak probe of the scope class on a dense network —
   and it would have satisfied C4's aggregate bar while exercising nothing, which is what C4-c
   exists to forbid. `SCOPE` is now an **insertion** in series, which cannot be routed around.
3. **`remainingMinutes` alone is inert on a not-started activity** (ADR-0035 §4), and marking one
   started re-anchors it at the data date — months before its planned start on this fixture — so the
   first unit of the injection is spent getting back to where the activity already was. Measured:
   `+40 d` moved the target's own finish by 13 calendar days and the carrier by zero. `PROGRESS`
   supplies actuals **and** remaining, sized at 3×.

## C1 — completeness: **PASS**

Sequential replay in the canonical order:

| Class    | Attribution |
| -------- | ----------: |
| SCOPE    |        19 d |
| DURATION |        40 d |
| LOGIC    |         5 d |
| BOUNDS   |        27 d |
| CALENDAR |        18 d |
| PROGRESS |        30 d |

`Σ = 139 d`, `total = 139 d`, **residual 0 d** against a ≤ 1 day bar.

This is what the condition file already says it is: **an arithmetic self-check, not evidence.** The
carrier is fixed from the control run, so `Σ` telescopes to `total` by construction. It confirms the
harness drops no class and double-counts none. It says nothing about whether the decomposition means
anything — and the next condition is where that is tested.

## C2 — order-stability: **FAIL**

Top three by canonical-order contribution: `DURATION`, `PROGRESS`, `BOUNDS`. Tail held fixed at
`SCOPE, CALENDAR, LOGIC`. All six permutations:

| Order                        |     Σ | DURATION | PROGRESS | BOUNDS |
| ---------------------------- | ----: | -------: | -------: | -----: |
| DURATION > PROGRESS > BOUNDS | 139 d |     24 d |     18 d |    9 d |
| DURATION > BOUNDS > PROGRESS | 139 d |     24 d |  **0 d** |   27 d |
| PROGRESS > DURATION > BOUNDS | 139 d |     40 d |      2 d |    9 d |
| PROGRESS > BOUNDS > DURATION | 139 d |     40 d |      2 d |    9 d |
| BOUNDS > DURATION > PROGRESS | 139 d |     40 d |  **0 d** |   11 d |
| BOUNDS > PROGRESS > DURATION | 139 d |     40 d |  **0 d** |   11 d |

- **Max share spread 12.9 percentage points** against a ≤ 10 pp bar.
- **The top-three rank order is not stable.** Three distinct orders appear across the six runs:
  `CALENDAR>SCOPE>DURATION`, `CALENDAR>SCOPE>BOUNDS`, `CALENDAR>DURATION>SCOPE`.
- `PROGRESS` is attributed **30 d, 18 d, 2 d or 0 d** for the _same change_, depending only on where
  it sits in the replay. `DURATION` swings 24 → 40. `BOUNDS` swings 9 → 27.

**The sum is order-free; the decomposition is not.** `Σ` is 139 d in every permutation. That is the
precise shape of the failure, and it is worth stating in those terms: the epic can tell a planner
_how much_ the completion moved with confidence, and cannot tell them _which change did it_ without
choosing an order — and the order is an implementation detail no planner supplied.

### Why this is not an artefact of an unusually hostile change set

The obvious objection is that all six classes were deliberately placed on one driving chain, which
is the adversarial extreme rather than the minimum C4-b demands, and that a more benign change set
would be stable. **The first run is the answer to that**: when the classes were _not_ all competing
for the carrier's float, four of the six attributed **exactly zero**. On this network a class either
competes for the carrier's float or contributes nothing at all — there is no benign middle ground
where several classes contribute independently. A ranking that is stable only when it has nothing to
rank is not a ranking.

This is one network, and that limit is stated rather than glossed: the finding is that
order-dependence is severe on a real P6-class programme, not that it is severe on every programme.
The condition was written to be judged on this subject, and it is.

## C3 — cost

Minimal production design: **one control pass plus one pass per class present = 7 passes**, not the
12 the cap allows. The harness itself calls `computeSchedule` far more often (every movement
measurement re-derives the control), so the pass count is counted against the minimal design rather
than against this file's call count.

The bar is **end-to-end**. What is measured here is the engine alone, so the test applied is whether
the engine leaves room for HTTP, two snapshot hydrations, two graph builds and the diff — the engine
is budgeted at **60% of the 3.0 s**, i.e. 1.8 s. A budget consumed entirely by one component is not
a pass.

**C3-a — the 147-activity fixture: PASS.** One pass 30.3 ms p95; seven passes **212 ms**. An order of
magnitude of headroom.

**C3-b — 2,058 activities, 2,645 edges: FAIL (no headroom).** One pass 399.0 ms p95; seven passes
**2,793 ms** — **93% of the whole end-to-end budget, before a single byte crosses the wire.**

The scale graph is the fixture replicated 14× with the copies **chained in series**, not as disjoint
components: disjoint replication shortens every critical path and flatters the measurement, which
`m0-condition.md` already records as the flaw in one of the two figures it quotes.

The 399 ms measured here sits **above** both independent figures the condition file carries
(≈240 ms and ≈343 ms), which is consistent with the chaining — and consistent with that file's own
conclusion that "the true figure is at or above 240 ms". C3-b was added precisely because C3 as
originally written could not fail at the size that matters. It failed at exactly that size.

## What this contradicts, corrected in place

- **`feature-spec.md` and `implementation-plan.md` describe a ranked, summing attribution as the
  Tier 3 deliverable.** That is withdrawn by C2. Both documents are annotated rather than rewritten,
  pending the product owner's choice between fallbacks (a) and (b).
- **`m0-condition.md`'s C3 cost basis is confirmed, not corrected.** Its own annotation withdrew the
  ≈150 ms figure derived by subtracting two routes with different fixed costs. The direct
  measurement here (399 ms at 2,058 activities) supports the corrected basis and not the original.
- **The condition's C1 downgrade is vindicated.** C1 returned a residual of **exactly zero**. Had
  the downgrade not been written before the run, a `PASS` on three of four conditions would have
  read far stronger than it is: C1 could not have failed except on rounding.

## The decision that is not mine

Per the falsification clause and CQ-4, the choice is the product owner's, with these numbers:

- **(a) Contribution without ranking** — each class's _isolated_ effect from `R_old`, order-free by
  construction, labelled "if this were the only change". Those are the six numbers in the C4 table
  above; they sum to 109 d against an actual 139 d, and the honest presentation says so rather than
  scaling them to fit. Costs the same 7 passes, so C3-b's cost finding applies to it unchanged.
- **(b) The critical-path delta only** — which activities entered and left the critical path and by
  how much, with no causal claim. **Two passes, not seven**, so it is the only one of the three that
  clears C3-b at scale without further work.

Both remain subject to the honesty requirement: a residual is displayed as an **Interaction** row and
is never distributed across classes.
