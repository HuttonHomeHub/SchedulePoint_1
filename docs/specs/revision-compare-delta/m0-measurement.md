# Revision Compare (critical-path delta) — the M0 measurement and verdict

> Judged against [`m0-condition.md`](./m0-condition.md), committed on its own **before** the harness
> existed. Nothing in the predicate was adjusted after a number was seen. Where the harness or the
> condition itself turned out to be wrong, the wrong version is recorded here rather than deleted.

**Verdict: PROCEED**, with one residual recorded and one limb split.

| Limb                     | Verdict                                        | Number                                                                        |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Non-vacuity (runs first) | **PASS**                                       | `entered=5, left=8` against ≥3 in / ≥1 out                                    |
| F1 — fidelity            | **PASS**                                       | persisted `5/8` = engine `5/8`, sets identical; carrier moved 20 working days |
| F2 — carrier agreement   | **PASS**, residual recorded                    | agree on the fixture; **disagree under a tie**                                |
| F3 — cost                | **PASS on the loads**, end-to-end **deferred** | 25.2 ms p95 at 2,000 activities                                               |

## Subject and method

The seeded fixture `plan:fixture-p6-torture-v1` — **147 activities**, seeded **in-spec** through the
same `SeedClient`/`seedPlan` the CLI uses, with a baseline captured through `POST …/baselines`
because the catalogue captures none. The baseline froze **147 rows for 147 activities**, asserted as
an equality rather than `> 0`: a partial capture would hand F1 a truncated old side and still pass a
loose check.

Seeding in-spec is why `fixtureSpec()` moved into `@repo/seed`. It was the only catalogue tier
living in an app, and an app cannot be imported from an API e2e spec. The alternative — a
hand-seeded machine — is how the previous epic's fixture kept vanishing under it.

**Where the harness bypasses the product** (ADR-0081 §3): F1 and F2 call the delta and the engine
directly, not over HTTP. A pass says the **method** is sound and says nothing about a route, a DTO
or a guard. F3's remaining half is the one that will go over the real route, and it has not run.

## Non-vacuity — PASS, after four runs that were one measurement

Final: **`entered=5, left=8`** (in: A10000, A7100, A7120, A7130, A7500; out: A4230, A4310, A4320,
A4330, A4340, A4350, A5100, A5130).

The route there is the finding:

| Lever                      | entered |  left |
| -------------------------- | ------: | ----: |
| extend 4 × +20d            |       5 |     0 |
| shorten 12 × −20d          |       0 |     2 |
| **both, disjoint targets** |   **5** | **8** |

**Four consecutive runs reported `entered=5, left=0` and were read as mounting evidence that nothing
could leave the critical path on this fixture. They were one confounded measurement repeated** —
three levers applied together and recalculated once, with the extensions large enough to mask
everything else. A single-lever run inverted it immediately.

Isolating also exposed a defect that would have shipped: the extend and shrink target sets
**overlapped**, so four activities were patched twice, the second time with a stale version. They are
disjoint now and a test asserts it — a comment saying "keep these disjoint" rots the next time
somebody edits a slice bound.

## F1 — fidelity: PASS

```
persisted  entered=5  left=8
engine     entered=5  left=8      sets identical
carrier moved 20 working days
```

**This is the claim the reshaped design rests on, and nothing had tested it.** `BaselineActivity`
freezes `is_critical` and `total_float` at capture, so the read model can compute the delta with
**zero engine passes** — but those columns are day-denominated projections of minute quantities
(ADR-0036 §7), and a baseline's values were written by a possibly-older engine. The zero-pass
argument was a reading of the schema, not evidence.

It is evidence now, and the ADR-0034 parity claim keeps its strong form: **the engine is not
imported at all.**

The old side is built and computed **before** any perturbation, because the baseline freezes the
_output_ and the only authoritative old-side run needs the _input_ the engine would have been handed
at that moment. Carrier movement goes through the shared ADR-0116 rules — imported, never restated.

## F2 — carrier agreement: PASS, with the residual that matters

```
F2 carrier:     persisted=920917750ebc engine=920917750ebc — AGREE
F2 tie context: 1 non-summary rows share the winning date
F2 residual:    same date, different minutes — engine picks the later minute,
                date-only picks the lower id — DISAGREE
```

**The real-data agreement was never at risk.** The fixture puts exactly one non-summary row on the
winning date, so there was no tie to disagree about. Reporting "F2 AGREE" on that alone would have
claimed the cheap input tracks the shipped rule, when what it showed is that nothing tested the case
where it cannot. The tie-context line exists so this document can say which case was observed
instead of implying coverage it never had.

So the residual was answered directly. Both rules are pure, so the adversarial input was built in
memory rather than left to a fixture that happens not to contain it: two activities, **same date,
different minutes, later minute on the higher id**, forcing the id tie-break and the minute ordering
apart. They part.

`selectCompletionCarrier` sorts by `earlyFinishOffset` in **minutes** and breaks ties by id
(`completion-carrier.ts:53-63`). A baseline freezes `baseline_finish` as a **date**. Two activities
finishing the same day at different hours are indistinguishable to the frozen data.

**This is recorded, not fixed.** It is a known cost of the zero-pass input, and the condition already
prescribes the remedy: **state the tie-break in the response and have the panel name the carrier**, so
a reader can see which activity the number is about. Making a date carry minutes it does not have
would be the fabrication this epic exists to avoid.

## F3 — cost: the condition was wrong, and the limb is split

**F3 as written cannot run in M0, and that is a defect in the condition I wrote.** It asks for
"≤ 250 ms p95 end-to-end **over the real HTTP route**". Verified: there is no such route — no
`revision`/`delta` module under `apps/api/src/modules`, nothing in `schedule.controller.ts`. The read
model is M1's work. The condition was committed before the harness existed, which is right, and was
never checked against what M0 could reach, which is not.

Timing something else and calling it F3 is exactly the substitution the condition exists to prevent.
So the limb is split and both halves are named:

- **Measured — the loads, not the route.** The two bulk reads the read model will make, at **2,000
  activities**: **p95 25.2 ms, median 19.3 ms** over 15 samples after 3 warm-ups. That is what F3
  exists to catch — an accidental N+1 or a per-row query would be orders of magnitude above this,
  which is what the deliberately loose bar is for.
- **Deferred — the end-to-end figure**, to M1's first measurement, when the route exists.

**The write path is bypassed, and that is stated rather than hidden**: the 2,000 rows are inserted
directly. For a read benchmark that is legitimate; the numbers describe queries, not writes. Seeding
2,000 activities over HTTP costs about an hour at this fixture's observed rate (147 activities took
about five minutes), which would have measured the seeder.

## What the runs contradicted, corrected in place

**Two explanations of mine were disproved by the instrument.** Neither reached a commit, and only
because the numbers were printed first.

1. **Predicted total floats near −60,240 minutes.** Measured: `min=-108 p25=-42 median=0 p75=0
max=176`, with 118 of 147 at ≤ 0. The figures had been carried from a different plan in a
   different epic and reasoned from rather than measured.
2. **Predicted that cutting a predecessor frees its successor's float.** Measured, float went **more
   negative** in all three cases (−29→−66, 0→0, −36→−79) and every successor stayed critical.
   Recorded as an **observation, not a theory** — the mechanism is still unexplained, and guessing at
   one is what produced the first error.

**Three API-surface assumptions were wrong**, each costing a run: there is no plan-nested GET-by-id
for an activity; the routes are **asymmetric** (the list is `plans/:planId/activities`, a single
activity is `organizations/:orgSlug/activities/:id`, `activities.controller.ts:52`); and the client's
delete method is `del`, not `delete`. In each case the evidence was in the codebase — the seeder has
always used the org-level form (`runner.ts:414`) — and the tell was the _shape_ of the 404: a bare
Express `Cannot GET/PATCH` means the route does not exist, an API error envelope means it exists and
refused.

## Instrument findings — four green signals covering work that never happened

Recorded because each looked like a result:

- A `grep | head` truncated a captured log to 160 bytes, so a search for failures found none because
  the lines had been discarded.
- A re-verification run **exited 0 having found no test files** — wrong working directory, the
  config's `include` matched nothing, and vitest calls that success. The empty report file caught it,
  not the exit code.
- `lint --fix` **removed a load-bearing cast**. `buildEngineGraph` is private, and the harness uses
  the product's own builder deliberately, because a second builder is how the previous epic's harness
  scheduled a plan four and a half months adrift. Typecheck caught it; the widening now lives in one
  helper where a fixer has nothing to remove.
- **A limb can pass and still be uninformative** — F2 above. Print the context that says whether the
  case was exercised, not just the verdict.

Separately, **eleven completion notifications in this session reported "exit code 0" for runs whose
logs said `FAILED`.** Reading logs rather than notifications prevented a bad push three times.

## What PROCEED means, and what it does not

The design is sound on the evidence: the delta can be computed from already-persisted columns, those
columns agree with the engine, and the loads are cheap. Build M1.

It does **not** mean the route is proven — F3's end-to-end half is owed at M1 — and it does not mean
the carrier is exact: under a date tie the cheap input picks a different activity from the shipped
rule, and the panel must say so.
