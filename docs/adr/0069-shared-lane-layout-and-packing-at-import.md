# ADR-0069 — A shared lane-layout package, and packing an imported programme

- **Status:** Accepted (landed 2026-08-01)
- **Deciders:** Product owner, engineering
- **Supersedes:** nothing. **Amends:** ADR-0050 (the interchange commit gains a third phase).

## Context

An import assigned each activity a `laneIndex` equal to **its position in the source file**. It was
deterministic, which is what the original decision was reaching for, and it was unreadable: a
500-activity programme opened as **500 lanes holding one bar each**, and the 2,000-activity case as
2,000. Nothing was wrong with the data. The picture was simply not a picture.

That matters more than its size suggests, because of _where_ it happens. Importing an XER is the
on-ramp from P6 — it is how a planner meets SchedulePoint holding a schedule they already know well.
The first thing they see is a diagram of their own programme, and it looked like noise.

Meanwhile the product already had a lane packer. `packLanes` was written for the canvas's
**Auto-arrange** (TSLD M4 4.3, refined by ADR-0064's predecessor hint): pure, deterministic, greedy
first-fit, and exhaustively unit-tested. A planner could fix an imported plan's layout with one
press of a toolbar button. They simply had to know to.

## Decision

**1. `packLanes` moves to a shared workspace package, `@repo/layout`** (ADR-0019 build contract),
consumed by both `apps/web` and `apps/api`.

Writing a second, server-side packer was never seriously on the table. Two implementations would
agree on the day they were written and drift afterwards, and **the drift would be invisible**: each
diagram looks plausible on its own, and only someone who compared an imported plan against the same
plan after pressing Auto-arrange would ever see them disagree. That is exactly the argument ADR-0065
makes for `routeOrthogonal` having one obstacle-aware parameter rather than a sibling function, and
ADR-0062 makes for the activity editor's panels being extracted rather than reimplemented. It is the
same rule one layer up.

Sharing it also means the ADR-0064 predecessor hint — which keeps a logic line from running twelve
lanes up the screen and back down — applies to imports **for free**, and a programme is the shape
that needs it most.

**2. The interchange commit gains a third phase: lay the plan out.**

Ordering is forced. The packer packs by **time**, and before the phase-2 recalculation an imported
activity has no computed dates — so phase 3 must follow phase 2. It runs **inside the same pen
window**, because writing `lane_index` is an ordinary plan mutation and takes the gate every other
one takes (ADR-0028).

**3. A layout failure does not roll the import back.** This is deliberately asymmetric with phase 2,
and the asymmetry is the point:

- A **recalc** failure means the plan's dates are wrong. The import is rolled back — nothing partly
  correct is left behind.
- A **layout** failure means the plan is correct and arranged badly, which a planner fixes with one
  press of Auto-arrange. Discarding a valid import over cosmetics would be the worse trade.

So phase 3 is best-effort, logs a warning naming what was kept, and leaves the source-order lanes.
Within phase 3 the write is still **all-or-nothing** (the existing `updateLanePositions` shortfall
check), because a half-laid-out diagram is harder to read than the source order it replaced.

**4. Activities with no computed dates are skipped, not packed into lane 0.** An uncalculated
activity is not drawn, so it has no span to pack; collapsing them all into one lane would invent an
overlap the moment they gained dates.

## Consequences

- **Positive.** An imported programme opens as a diagram. Measured on the 2,000-activity import e2e:
  the distinct lane count drops from **2,000** to a small fraction of it, contiguous from zero, and
  the assertion is now a test rather than a claim. One packer serves the canvas and the importer, so
  they cannot disagree. The seam is cheap to extend — a future "pack on demand" server action, or
  packing at any other bulk-create path, has somewhere to call.
- **Negative / new debt.** A third workspace package is a standing build-contract obligation
  (ADR-0019). Phase 3 adds two reads and one batched write to every commit; at 2,000 activities the
  whole request still lands well inside the e2e's 60 s bound, but it is not free, and it is the
  first thing to look at if import latency ever becomes a complaint.
- **Neutral.** **The CPM engine is not imported and the ADR-0034 recalc parity gate is untouched** —
  `lane_index` is presentation, and `computeSchedule` has never seen it. The web behaviour is
  unchanged: Auto-arrange calls the same function it always did, from a new module path.

## Alternatives considered

- **Pack in the client after an import.** Rejected: the importer creates the rows, so it should
  create them correctly. It would also leave every non-browser caller (the seeder, any future
  integration) producing unreadable plans.
- **Copy the packer into the API.** Rejected for the invisible-drift reason above.
- **Keep source order and rely on Auto-arrange.** Rejected: it requires the planner to know that the
  bad first impression is fixable, at the exact moment they know least about the product.

## References

- ADR-0019 — shared workspace packages ship compiled output.
- ADR-0026 — TSLD canvas; lanes as a presentation concern.
- ADR-0050 — schedule interchange; the commit's phases 1 and 2.
- ADR-0064/0065 — the predecessor hint, and the one-function-not-two rule this follows.
