# ADR-0168: Levelling follows the links

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** James Ewbank (product owner — design approved and CQ-1, CQ-2 and CQ-3 each answered (a) on
  2026-10-01; chose to speed up the hot-resource case first, M2.5), with Claude Code
- **Amends:** ADR-0041 (§1, §3, §7), ADR-0035 (§28), ADR-0167 (D1, D3)
- **Does not amend:** ADR-0148 D9 (levelling stays a lens and never writes a placement), ADR-0041 §3's
  authority of the network float, ADR-0166's anchor
- **Spec:** [`docs/specs/logic-aware-levelling/`](../specs/logic-aware-levelling/feature-spec.md) (§4.9 is
  this ADR's outline; the measurements are in
  [`m0-measurement.md`](../specs/logic-aware-levelling/m0-measurement.md)). Register row:
  `docs/TECH_DEBT.md` #427, closed by this epic.

## Context

Levelling placed each activity from its own anchor start and read no link (`levelSchedule` took no edges).
So when a resource delayed an activity, the work that follows it stayed where it was drawn, which could be
before the activity it depends on had finished. ADR-0167 found this twice while building "Apply levelled
dates" (its "A5" finding) and recorded the follow-ups. Three things were wrong, each measured on the
shipped engine before anything changed (`m0-measurement.md`):

1. **The ghosts lied on chain plans.** On the three-activity fixture a follower's ghost started while its
   predecessor was still running.
2. **One press of Apply did little on a busy plan.** The engine is the oracle for what an apply may write
   (ADR-0167 D3), and it dropped every target a link refused. On the 2,000-activity scale plan (2,160
   activities, 3,200 links) at capacity 2, 218 of 236 targets were dropped and 236 clashes remained after
   the press; at capacity 8, 8 of 10 were dropped.
3. **"Levelled finish" was early (`docs/TECH_DEBT.md` #427).** A non-participant counted at its own anchor
   finish, so the roll-up ignored the knock-on: 2026-01-10 where the plan finishes on 2026-01-12. A second
   defect sat beside it: the figure on screen came from a SQL aggregate that also ignored hand placements
   (spec C7), fixed in M1 by one shared definition.

The seeded `plan:capability-levelling` showed it: `V4` "Handover" follows `V3`, which levels to 12-16 Mar,
yet `V4` had no overlay and the Levelled finish was five working days early.

## Decision

**Place, then follow the links.** Passes A and B (pin, then priority placement from the anchor) are
unchanged. A new **Pass C** walks the activities in topological order and moves a follower no earlier than
its links now allow, wherever a predecessor's levelled position passes on later than its unlevelled one.

- **D1 — one new pass, nothing else touched.** Pass C computes two link floors per activity from
  `forwardLowerBound`, the single home of link arithmetic (`edge-bounds.ts`; `level.ts` imports it and
  never switches on a link type): `floorU` from the predecessors' unlevelled pass-on, `floorL` from their
  levelled pass-on. A move happens only if `floorL > floorU`. Pass 2's pass-on instants are exposed in
  memory on each result (`passOnStartInstant` / `passOnFinishInstant`, not persisted), so the rule is not
  derived a second time inside `level.ts`.
- **D2 — who moves.** Everything except mandatory-constrained, started, Level-of-Effort and WBS-summary
  activities. Milestones and self-over-allocated activities move. An LOE predecessor pushes nothing, as in
  Pass 2. A mandatory follower stays at its anchor and the overlay shows the infeasibility rather than
  hiding it.
- **D3 — an existing earlier-than-logic placement is left alone** unless a predecessor moved; then it goes
  to `max(drawn start, link floor)`.
- **D4 — a participant is re-placed, a non-participant is given an overlay.** A participant is lifted out of
  the resource profile and re-searched from its link floor by the same `earliestFeasibleStart`; an activity
  with no capped resource gets an overlay at its floor, rolled to working time on its own calendar. Both
  use the existing `leveled_start`, `leveled_finish` and `leveling_delay_minutes` columns, which the batch
  write already sends for every activity. **No schema change** (CQ-2 (a)).
- **D5 — no flag (ADR-0088 D1).** The rollback is the commit boundary. The entry points are the existing
  **Levelled placement** toggle, the summary strip and **Apply levelled dates…** (ADR-0081).
- **D6 — no push across plans.** A downstream plan reads the upstream drawn span (ADR-0148 D10).
- **D7 — the network float and the critical path are unchanged** (ADR-0041 §3). Levelling-aware float
  stays a named later rung.
- **D8 — the within-float cap clamps to `max(anchor, link floor)`.** On one calendar the clamp is
  unreachable (M0 found it fired 0 times in 60,000 random plans), and it matters only where the plan's and
  an activity's own calendars differ (108 of 60,000 mixed-calendar plans differ with it removed), so it is
  defensive on most plans and held by one committed fixture.
- **D9 — gaps are not back-filled (CQ-3 (a)).** A participant that Pass C moves later can leave a gap on a
  resource it had booked. Nothing goes back to fill it, so a levelled plan changes only downstream of a bar
  that moved.
- **D10 — one levelled finish.** The summary SQL and the engine's roll-up state one definition
  (`COALESCE(leveled_finish, drawn finish)` over non-LOE, non-summary activities, `placed-finish.ts`), so
  the recalculation response and `GET …/schedule/summary` agree and the figure is never earlier than
  "Finish" (M1).
- **D11 — the apply follows the links (amends ADR-0167 D1 and D3).** An unplaced activity whose only move
  is the knock-on gets **no row**: writing one would detach it from its links. The preview names it in
  `followingLinks`. A hand-placed one gets a row with `reason: 'LINKS'` (CQ-1 (a)): it moves too and is
  listed as "the work before it moved", and Undo puts it back. A follower its own resource delays beyond
  the knock-on gets a row as before (`reason: 'RESOURCE'`). A placed finish milestone gets a `LINKS` row
  dated on the day it closes; an unplaced one gets none. ADR-0167 D3's oracle (the engine solves a copy and
  drops a target it reports `EARLIER_THAN_LOGIC`) is kept unchanged and is now expected to find nothing.
- **D12 — one count (CQ-2 (a)).** The summary's "Levelled activities" counts every bar levelling moved,
  including those that moved only because earlier work did. The strip's sentence says so.

## Alternatives considered

- **Level the whole plan in link order** (the textbook serial schedule generation; CQ-3 (b)). It packs
  tighter, since nothing is left behind. **Rejected.** It changes results on plans where nothing is pushed:
  a high-priority activity whose lower-priority predecessor is not yet placed now waits, and an unrelated
  activity can take the resource first. So no structural gate holds, every levelled plan's ghosts may
  shift on release, and the corpus and S10 would need re-baselining. M0 counted what the chosen design
  gives up: Pass C left a gap behind a re-placed participant 2 times of 315 pushed at the seeded capacity
  and 143 of 571 under heavy contention (capacity 2), where 62 participants (10.5 %) could have started
  earlier (`m0-measurement.md` T1.5). The loss is concentrated where the plan is already badly
  over-allocated. This is the number to revisit it with.
- **Priority inheritance** (an activity takes the best priority of its descendants). Keeps more of today's
  order, but lets an unimportant activity jump the queue because something important follows it. Harder to
  explain to a planner.
- **Iterate the whole pass, raising anchors, until no link is violated.** No natural bound, and the
  objection ADR-0167 gave a loop.
- **Push followers in the apply only** (a loop of solves). Leaves the ghosts and the levelled finish wrong
  and costs two engine passes per round. Rejected by ADR-0167 for the same reason.
- **Fix #427 by re-running `computeSchedule` with levelled starts as placements.** Right figure, but a
  whole extra network solve on every levelled recalculation, and the summary would depend on a placement
  nobody made.
- **Write a placement for a follower that only follows** (CQ-1 (b) read the other way). Detaches it from its
  links, which is what an unplaced bar is for.
- **Two counts in the summary** (CQ-2 (b)). Needs one new engine-owned column and a database review for a
  distinction the planner can read from the dialog.
- **A `VITE_` flag.** D5.

## Consequences

- **Ghosts appear on existing levelled plans at their first recalculation after release.** Every follower
  of a delayed activity now carries an overlay, and the levelled finish moves later where it was
  understated. Measured on the scale plan (`m0-measurement.md`, "M2 measurement record"): delayed
  activities go from 10 to 883 at capacity 8 and from 236 to 1,716 at capacity 2, and
  `leveledProjectFinish` from 2037-05-05 to 2037-06-10 and to 2045-11-02. That is what the knock-on costs
  on a chain-heavy plan, and the changeset says so. The release reaches the product owner's host
  automatically (CLAUDE.md §17).
- **Part-day pushes are more common.** A knock-on can land part-way through a day, which is #426's shape.
  #426 was closed on 2026-10-01 by saying so in the summary ("1 moved by less than a day, so it has no
  ghost on the diagram"), so no ghost is drawn for it and the count is reported.
- **Metric 12 can change its verdict on a levelled plan**, because the carrier's levelled finish now
  responds to links (it reads the levelled schedule on both sides). A unit case pins one plan where it
  does.
- **#427 is closed** (the engine pushes followers, the summary and the recalculation response share one
  definition) and **SC-4** reads 2026-01-12 on its fixture.
- **What it measured, with the cost.** SC-1: broken links on the scale plan 10 and 187 to **0**
  (capacity 8 and 2). SC-2: `leftToLogic` 8 and 218 to **0** and `remainingAfterApply` 0 and 236 to **0**.
  The preview takes **2 solves**, not 3. Recalculation engine cost before the speed-up (p50, n = 50, one
  sitting): 1.21x of Pass C off at capacity 8 and 1.33x at capacity 2, under the epic's 1.5x stop. The
  **hot-resource worst case** (1,910 of 2,000 activities on one resource) was **1.97x at p50 and 1.91x at
  p95 at capacity 8**, over the stop, so the product owner chose to speed it up before shipping (M2.5).
  After: **1.32x and 1.27x**, with the pass 4.7x faster with Pass C on (873 to 184 ms) and 3.3x faster off,
  and no output changed (all existing snapshots, goldens and conformance tests unedited, plus three
  differentials against the frozen old code). Caveats the record states and this ADR repeats: the ratio
  moved less than the absolute time, because the cost both runs share fell with it (the scale plan at
  capacity 2 reads 1.37x at p50 and 1.52x at p95 after), and the hot resource at capacity 2 and 1
  improved by only about 22 % and 12 % (ratios already 1.05x).
- **Parity (ADR-0034).** Gate A, the eight `level.parity.spec.ts` snapshots, S10's existing assertions and
  the existing levelling golden are byte-identical and unedited. A **Gate D** is added to ADR-0041 §7: an
  activity's overlay differs from before only if it is downstream, by links, of an activity whose levelled
  pass-on differs from its unlevelled one. `level.links.parity.spec.ts` is a new corpus whose snapshots
  moved once, in M2. Each of four wrong implementations (floors from the early dates, no `floorL > floorU`
  guard, cap clamped to the anchor, an LOE that pushes) was caught by a case added for it, and none by the
  five propagation shapes alone.
- **Six existing apply cases moved on purpose** (P3, P4, P9, P11, P12, P14), each with a comment saying
  what it asserted before and why that no longer holds.
- **API.** Additive: `followingLinks` and each row's `reason` on `GET …/schedule/levelling-application`.
  The **meaning** of `leveledStart`, `leveledFinish` and `levelingDelayDays` changes (non-null for a
  follower with no capped resource) and `leveledProjectFinish` is corrected; `docs/API.md` says so. `api`,
  `web` and `types` each take a minor. No schema change.
- **Still open.** Levelling-aware float (ADR-0041 §3), a closed-form `addWorkingTime` (the next speed lever
  M2.5 named and did not attempt), and CQ-3's gap count if a real plan shows it matters.

## References

- Spec, plan and measurements: [`docs/specs/logic-aware-levelling/`](../specs/logic-aware-levelling/feature-spec.md).
- ADR-0041, ADR-0035 §28, ADR-0166, ADR-0167, ADR-0148 (D9, D10), ADR-0034, ADR-0088, ADR-0081, ADR-0110.
- `docs/TECH_DEBT.md` #427 (closed), #426 (closed 2026-10-01).
