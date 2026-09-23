# ADR-0153 — An edit moves only the bar that caused an overlap

- **Status:** Accepted
- **Date:** 2026-09-23
- **Milestones:** NetPoint-layout M3 (T1–T3) landed 2026-09-23
- **Supersedes:** nothing
- **Amends:** ADR-0048 (a resolution is its own undo step, recorded by the workspace rather than by a
  planner command); ADR-0092 (a new dock rung, `layout-resolved`, directly below `mode`)
- **Spec:** [`docs/specs/netpoint-layout/`](../specs/netpoint-layout/) —
  [spec §4.2–§4.4](../specs/netpoint-layout/feature-spec.md),
  [conditions](../specs/netpoint-layout/conditions.md),
  [M3 record](../specs/netpoint-layout/m3-auto-resolve.md)

## Context

The product owner reported two activities drawn on top of each other after an edit. PR #663 fixed the
half of that report that was a defect: `Arrange` packed on early dates while the canvas draws the
placed ones. The other half is a rule the product never had. Nothing stops an ordinary edit from
putting two bars in one lane at once. A planner stretches a bar into its neighbour, or a
recalculation pushes an untouched successor into a third bar. The diagram then asserts something
false — two pieces of work in one place — until somebody notices and presses `Arrange`, which
re-packs the whole plan.

The product owner set the rule in one of the approving answers: **move only the offending bar, to
the nearest free row.** Nothing else shifts.

## Decision

1. **The rule compares two snapshots.** `S0` is every drawn activity's lane and inclusive drawn span
   (`barDatesFor(a, 'visual')`), taken when the planner's command is issued. `S1` is the same after
   the command's writes **and** the recalculation they trigger have settled. Only **new** pairs,
   `overlaps(S1) \ overlaps(S0)`, are resolved. An overlap that existed before the command is not
   this command's to fix. The overlap predicate is `lane-overlap.ts`'s own sweep, extended to return
   pairs, never a second predicate.
2. **"The bar that caused it" has three clauses** (spec §4.4):
   1. If exactly one bar of the pair changed, it moves.
   2. If both changed and exactly one is the command's subject, the other moves.
   3. Otherwise the one with the later drawn start moves, then the larger id.

   None of the three can choose a bar whose lane and span are both unchanged.

3. **Where it moves:** the nearest free row, ties to the lower index (`packLanes`' tie rule, shared as
   `nearestFreeRow`/`rowOccupancy` in `@repo/layout`). Movers are placed in drawn-start order, each
   seeing the rows the earlier ones chose.
4. **When:** after the recalculation settles (`usePlanAutoRecalc.settled`), in an idle callback. It
   is off the render path because FC-N5b failed: 8.8 ms p95 for a 50-bar cascade at `scale-2000`,
   against 2 ms. It waits while any write is in flight, bounded at ten seconds, because the edit-lock
   heartbeat is a write that never settles.
5. **A lane drop resolves before it writes**, in one write and one undo step. It moves to the next
   free lane **in the direction of travel**, not the nearest one. A bar the planner moved has a
   direction, and the lane it left is always free to it, so the nearest-lane rule would put an
   `Alt+↓` straight back where it started. A drag that changes date and lane together is resolved
   the same way, against the span it is being dropped at.
6. **Its own undo step** (CQ-2): the first `Ctrl+Z` puts the bar back in the overlapping lane, and the
   second undoes the edit. It is recorded in the `autoArrangeCommand` shape through the positions
   batch, not as `relaneCommand`. That command coalesces on `relane:{id}`, so a planner nudging the
   moved bar within 500 ms would have folded their edit into this one.
7. **Never during a replay, never without the pen.** Undo and redo drop any pending snapshot. A
   snapshot is taken only while the reader can write. Losing the pen between the edit and the settle
   drops the snapshot and writes nothing.
8. **Said once, in both channels.** One sentence is announced and shown in the dock's new
   `layout-resolved` strip, with `Undo` and `Dismiss`. The strip is withdrawn as soon as its step is
   no longer on top of the undo stack, so its `Undo` can never reverse a different edit. Both buttons
   move focus to the plan surface before the strip unmounts (ADR-0149 D8).

## Alternatives considered

- **Move the other bar.** That moves work the planner did not touch. The product owner ruled it out
  by name.
- **Refuse the edit.** That blocks legitimate scheduling for a presentation problem.
- **Re-pack the plan.** That destroys a hand-built layout to fix one pair.
- **Resolve server-side.** The engine would have to learn about lanes. `laneIndex` is presentation
  and `computeSchedule` has never seen it (ADR-0069).
- **Merge the move into the edit's undo step.** That needs an "amend the last command" API the
  ADR-0048 stack does not have. The move also arrives after an asynchronous recalculation, well
  outside the 500 ms coalescing window.
- **The nearest free lane for a drop.** Rejected above: it is right for a pushed bar, which has no
  direction, and wrong for a moved one.

## Consequences

- **Every structural command must snapshot before its write**, and nothing would fail if one forgot.
  `use-auto-resolve.census.structural.test.ts` holds every `editHistory.record` in the workspace model
  to it. It requires a `beginLayoutEdit(` in the recording function, or a `layout-exempt:` comment
  with a reason, and every command constructor must be recorded from the model. What it cannot see
  is a snapshot placed after the write it guards.
- **Dialog-driven edits snapshot after their write, and that is still a true "before".** The write
  changed an input, and a bar is drawn from what the engine computes, so no drawn span moves until
  the recalculation. This holds only while the dialog records within the 500 ms debounce, which it
  does, because it records on the write's own resolution.
- **A planner who edits within about a second of an undo** can have a pending snapshot taken while
  the replay's recalculation is still running. A bar the replay pushed could then be moved. This is
  accepted and stated here rather than guarded, because guarding it would discard the next genuine
  edit's resolution instead.
- **The Late overlay needs no gate.** The snapshot always reads the `visual` basis, so a layout is
  never reasoned about on an overlay's dates. The spec's suppression holds by construction.
- **The CPM engine is not imported and no migration runs.** The resolution writes `lane_index`
  through the existing positions batch, with its RBAC, organisation scope, optimistic `version` and
  ADR-0028 pen unchanged.
