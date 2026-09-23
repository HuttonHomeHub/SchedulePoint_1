# NetPoint-layout M4: the optimiser

**Status:** Landed 2026-09-23, dark. Spec §4.5; plan "Milestone M4: The optimiser". Nothing in the
product calls it yet. M5 surfaces it through Arrange.

This file records what M4 built, what was measured, and where the build departed from the plan.

## What shipped

- **`render/route-frame.ts` (M4-T1).** Layer 2's per-edge mapping and its three post-passes moved
  verbatim out of `paintScene`, and now return the lines, lag runs and handles as values. No test
  assertion changed: the golden log and every routing suite passed unedited, which is the move's
  before/after oracle (ADR-0078). `route-frame.structural.test.ts` holds the painter to one
  `routeFrame` call and no routing primitive of its own. It was verified red with a `routeOrthogonal`
  call planted in `paintScene`.
- **`render/layout-objective.ts` (M4-T2).** A layout is scored on seven terms in the product owner's
  order: overlaps, hidden links, crossings, **unlinked glyph contacts**, same-row chains, travel and
  rows. The contact term is new, from CQ-1's answer. Lines come from `routeFrame`, so the objective
  judges the picture the painter draws.
- **`render/optimise-layout.ts` (M4-T3).** The four-phase search of spec §4.5: repair by
  `nearestFreeRow`, adjacent-row swaps, single-bar moves, then compaction. A move is accepted only on
  a strict improvement. The row budget is the seed's row count (CQ-1). The caps are counts, never
  time.
- **The worker boundary.** `optimise-layout-protocol.ts` holds a handler the worker binds to, which
  is testable without a worker. `optimise-layout.worker.ts` is the two-line module worker, and
  `run-optimise-layout.ts` creates it per run and terminates it when the run settles or is aborted.
  The scene's working-day predicate is a function and cannot be structured-cloned, so the caller
  sends the non-working day offsets over a span and the worker rebuilds the predicate.

## What was measured

| Reading                                  | Result                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FC-N0**, product vs harness counters   | **PASS, 7 of 7 layouts agree on every term** (`measure-netpoint-agreement.mjs`), across Unit 300 (shipped, source order, scrambled), small-17 and chain-3. The two share no counting code. Verified red twice (see below).  |
| Unit 300 seed, reproduced                | 58 hidden links, 360 crossings, 19 unlinked contacts, 68 same-row links, travel 502, 21 rows: M0's seed exactly.                                                                                                            |
| **FC-N4**, Tidy on Unit 300 at B = seed  | **PASS.** Hidden links 58 → **17** (≤ 34), crossings 360 → **204** (x/link 1.09 against a ceiling of 2.11), contacts 19 → **9**, 21 rows unchanged. Same-row links 68 → 56 and travel 502 → 521 pay for it. 107 bars moved. |
| small-17, Tidy                           | Hidden links 10 → 1, crossings 3 → 0, contacts 1 → 0, 4 rows unchanged.                                                                                                                                                     |
| **FC-N3**, never worse and deterministic | **PASS.** 0 violations over a 200-plan seeded property sweep (verified red with the strict-improvement rule removed); byte-identical lanes for reversed activity and link order on every measured plan.                     |
| **FC-N2 (b)**, a whole Tidy in node      | 100 activities 0.5 s, **Unit 300 (144) 4.2 s**, 200 4.7 s, 300 4.5 s, **400 10.5 s**, 500 12.2 s. At `scale-2000` one evaluation alone costs ~250 ms (M0-T3).                                                               |

**The FC-N2 (b) verdict: the third branch.** The run limb is judged at `scale-2000`, where a whole
Tidy is far past 10,000 ms. So the optimiser is **offered only on plans of at most 300 drawn
activities** (`OPTIMISE_MAX_ACTIVITIES`), the largest measured size inside 10,000 ms, and the dialog
says why above that. Every run it is offered on goes to a **worker with progress**, because the
measured runs are past 2,000 ms. A whole-search cap of **2,000 evaluations** bounds the worst case as
a count (about 9.5 s at 300, where one evaluation costs 4.73 ms). No measured run needed more than
1,726. These are node figures. They bound the algorithm, not the product owner's hardware (#75).

**FC-N2 (c) is not re-run**, because the product search does not use an incremental evaluator: every
candidate is scored by a full evaluation, which the committed rule always permits. M0-T3 measured
the incremental evaluator's saving at 13 % at `scale-2000`, too small to be worth a second counting
path.

## The red checks

- **FC-N0 against a planted occlusion defect.** Dropping the successor from the "own bar" test
  disagreed on all 7 layouts.
- **FC-N0 against a planted contact defect.** Ignoring links in the contact term disagreed on 5 of 7.
  The two that stayed green are the source-order layouts, which have no two bars in one row.
- **FC-N3 against a planted acceptance defect.** Taking a bar's first candidate rather than its first
  strict improvement failed the never-worse sweep.
- **The worker handler against a missing `catch`.** Without it, a malformed request throws inside the
  worker instead of posting `failed`.

## Departures from the plan

- **The optimiser lives in `render/`, not `model/`.** The spec named
  `features/tsld/model/optimise-layout.ts`, and `drawn-span.structural.test.ts` refused it there. That
  gate is scoped by what a file holds: `model/` holds the API's `ActivitySummary`, where `earlyStart`
  is the network's date. The optimiser holds `RenderActivity`, where the same field is the drawn date,
  exactly like the objective beside it. The gate was right, and the file moved rather than the gate.
  M5's caller must build the activities from `barDatesFor(…, 'visual')`, and the module's docblock
  says so.
- **The prototype search is kept, not deleted.** The plan said to switch the harness to the product
  module and delete the prototype. The frontier pictures and every M0-T4 figure were produced by the
  prototype, so deleting it would leave that record unreproducible. It stays as M0's instrument, and
  its docblock already says it is never product code. M4's readings come from the product module
  through `measure-netpoint-optimise.mjs`.
- **Exact scoring only.** M0's prototype had a filtered mode that ranked candidates by a local delta.
  M0-T4 measured it costing quality (161 crossings against exact's 142 at +50 %), and the size limit
  above makes the plans it would have helped with ineligible anyway.
- **The worker is built and not yet run in a browser.** It has no caller until M5, so Vite emits no
  worker file yet and `e2e-csp` cannot see it. M5's journey is where the `script-src 'self'` claim is
  checked.
