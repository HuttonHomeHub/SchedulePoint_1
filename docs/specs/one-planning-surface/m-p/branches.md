# M-P — the three branches Pass 1 has and Pass 2 did not

**Built 2026-09-20.** M-P-T1 (the parity case, red first) and M-P-T2 (the branches). T3 — the
product-level parity run over the seed catalogue — is separate and is `m-p/progress-parity.md`.

---

## 1. Why this milestone exists

The epic's spec §1.2 asserted that **"Early is Visual's resting state"** and cited
`compute.visual.spec.ts:71-80`. That citation is five plain tasks in a 220-line file containing
**zero** `actualStart`, `remainingMinutes`, `WBS_SUMMARY` or `LEVEL_OF_EFFORT` — so it could only
ever have established the claim for the one shape where it is trivially true.

It is false in general. Pass 1 has branches Pass 2 never had, and every one of them is invisible to
a fixture of plain unprogressed tasks.

## 2. The red run — what Pass 2 actually did

`m-p/red-run.md` is the committed output, produced by reverting ONLY `compute.ts` to `b0e2fdc9` and
running the fixture that ships. Written before any engine change, and asserted as **one
whole map** rather than four separate `expect`s, deliberately: four would stop at the first failure
and hide the rest, and the point of the case is to enumerate the class.

`-` is Pass 1 (`early*`), `+` is Pass 2 (`visualEffective*`):

| Activity        | Pass 1            | Pass 2            | What Pass 2 was missing                         |
| --------------- | ----------------- | ----------------- | ----------------------------------------------- |
| `STARTED`       | `01-02` → `01-02` | `01-01` → `01-04` | the frozen actual start; the **remaining** span |
| `DONE`          | `01-02` → `01-05` | `01-01` → `01-04` | both actuals                                    |
| `DONE_NO_START` | `01-06` → `01-05` | `01-01` → `01-04` | the actual finish, with a **computed** start    |
| `LOE`           | `01-01` → `01-05` | `01-01` → `01-01` | the **derived** span — collapsed to a point     |
| `SUMMARY`       | `01-06` → `01-09` | `01-01` → `01-01` | the **rolled-up** span AND its rolled-up start  |

Plain tasks (`LEAD`, `CHILD`, `SPINE`, `TAIL`) agreed exactly, which is the parity half of the same
case. Two further cases — a placed-and-started activity, and a placed summary and LOE keeping their
derived spans — fail against the old engine too, so the committed red run reports **three**.

`DONE_NO_START`'s Pass 1 start (`01-06`) is after its finish (`01-05`). That is Pass 1's own answer
for an input the public API refuses, and parity means reproducing it.

## 3. The fix, and why it is one rule rather than three

**Where an actual froze an endpoint, Pass 2 defers to Pass 1.** Not "re-derive what Pass 1 derived"
— a placement is _inert against a reported actual_ (ADR-0035 §1), so the honest expression is a
single `frozenByActuals` predicate feeding both endpoints.

**The span is read the way Pass 1 reads it.** `vInclusiveFinishOwn` was
`duration === 0 ? vDisplayOwn : vDisplayOwn + duration - 1` — the **input** duration, right for a
plain unprogressed task and wrong for everything whose span is derived. It now reuses Pass 1's own
`pointLike` and takes the length from the same instants (`efOwn - esOwn`), so substituting `esOwn`
for `vDisplayOwn` reproduces `inclusiveFinishOwn` **exactly**: an unplaced activity is byte-identical
to Pass 1 by construction rather than by coincidence.

Reusing `pointLike` rather than restating it is the point. That rule is type-dependent
(`activityIsLoe || activityIsSummary ? efInst === esInst : duration === 0`) and a re-derived copy
collapses a zero-duration TASK, which is a task and not a milestone (ADR-0035 §22). Mutation **M6**
below is exactly that careless port, and it is caught.

## 4. Three things the plan did not predict, each found by running rather than reading

**(a) The predicate is `started || isComplete`, not `started`.** `resolveProgress` derives the two
**independently** (`progress.ts:84-86`): an activity with an `actualFinish` and no `actualStart` is
`COMPLETE` with `actualStartInst === null`, and Pass 1 then takes its start from the computed mapping
and its finish from the actual. That shape is refused at the public boundary (N06
`FINISH_WITHOUT_START`, `activities.service.ts:1125-1129`) and is perfectly reachable in the engine,
which is the level this condition is judged at. Its Pass 1 start can land _after_ its finish; parity
means reproducing that, not quietly improving on it.

**It was found by a mutation, not by reading.** With only `DONE` in the fixture, deleting the
`isComplete` branch left the case **green** — `started` covers a complete activity in every other
shape — so the branch read as dead code when it was not. The fixture gained `DONE_NO_START` and the
mutation now discriminates.

**(b) An unplaced `WBS_SUMMARY` rendered at the data date whatever its children did.** A summary
carries no logic — it is never a dependency endpoint (ADR-0038) — so Pass 2's forward walk has no
incoming edge that could reach it and its `logicEarliest` is the bare data date for every summary in
every plan. Pass 1 rolls the span up from the children.

**FC-11's first draft passed against this defect**, because its `CHILD` began at the data date and
the two answers coincided. The case was written, it went green, and only a separate probe with a
late-starting child showed the summary sitting five days left of its own subtree. That is ADR-0093's
shape — a green result that cannot tell "correct" from "nothing to test" — inside the condition
written to close a different instance of it. The fixture now starts `CHILD` after a five-day `LEAD`,
and mutation **M7** is the defect itself.

**(c) The correction lives in the results loop, not at Pass 2's `display` decision.** That was the
first attempt and it did not work: the **WBS-summary rollup pass runs below Pass 2**, so
`earlyStart.get(id)` is not yet rolled up where `display` is chosen. By the results loop `esInst`
is. Recorded because the natural place to put it is the wrong one.

**Two shapes were probed and did NOT diverge**: an LOE hammocking a late spine (SS + FF), and an LOE
with only an FF successor. Both agree with Pass 1 without any change, because Pass 2's
`forwardLowerBound` over the SS edge reaches the same answer the derivation does. Stated because
"LOE and summary both needed fixing" would have been the plausible generalisation and is wrong.

## 5. The mutation sweep — FC-2 clause 3

Every clause was made to fail by the defect it guards (ADR-0110 D5). Restored between each.

| #   | Mutation                                                   | Result       |
| --- | ---------------------------------------------------------- | ------------ |
| M1  | no actuals freeze on `visualEffectiveStart`                | **2 failed** |
| M2  | no actuals freeze on `visualEffectiveFinish`               | **2 failed** |
| M3  | predicate narrowed to `started`                            | **1 failed** |
| M4  | predicate narrowed to `isComplete`                         | **2 failed** |
| M5  | span from the input `duration`                             | **2 failed** |
| M6  | `pointLike` re-derived as `duration === 0` (careless port) | **1 failed** |
| M7  | no summary rollup read (the ADR-0093 hole)                 | **1 failed** |
| M8  | summary rollup read even when the summary IS placed        | **1 failed** |
|     | restored                                                   | 11 passed    |

## 6. What is untouched, and what is not

**Pass 1 is not modified.** Every pre-existing case in `compute.visual.spec.ts`, `compute.spec.ts`,
`compute.loe.spec.ts` and the other 25 engine suites passed **unchanged** through this milestone —
264 tests — which is the before/after oracle FC-2 asks for. The forward and backward passes, float,
criticality and the project finish are byte-identical.

**Pass 2's propagation is not modified either.** `visualPropStart`/`visualPropFinish` still push
successors from the same instants they always did, and the summary correction is a **display**
read in the results loop, not a change to what Pass 2 hands downstream. A summary is never a
predecessor, so there is nothing downstream of it to change.

**What does change, for a real plan:** a progressed activity, an LOE and a WBS summary now render on
the placed basis where Pass 1 renders them. A planner looking at a Visual-mode plan with progress
reported was seeing two different pictures of the same activity depending on which view they opened.
That is the defect, and it is corrected rather than newly introduced.
