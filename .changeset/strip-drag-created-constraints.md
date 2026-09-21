---
'@repo/api': minor
'@repo/types': minor
'@repo/web': minor
---

Convert the drag-created constraints into hand-placements, once, and tell the planner what changed.

Before this epic, dragging a bar in Early mode wrote a binding `START_NO_EARLIER_THAN` at the drop
date. The collapse replaced that with a first-class `visualStart` — `apps/web/src` now contains zero
live `SNET` writes — so the estate carries constraints that are really hand-placements wearing a
constraint's clothes. A one-time SQL migration converts the **binding** ones and leaves the other
three classes alone.

**The bars do not move**, and that is derived from the engine rather than asserted: before, the
forward clamp put the bar at the constraint date and the placed pass applied the same clamp; after,
the placed pass reads the `visualStart` the migration wrote. Identical, and successors do not move
either. What does change is the network pass downstream — a successor's earliest falls, its float
rises and its criticality can change. That is the point: **the float that was never genuinely
constrained comes back.**

**Three classes are deliberately untouched.** An _inert_ constraint (logic already overtook it)
would place the bar earlier than logic allows. An _unclassified_ one is unmeasured against its
constraint, and one of the two ways that arises never clears — a started activity's actual start
bypasses the clamp, so it reads below its constraint in a schedule computed seconds ago. And an
activity **already carrying a placement** is excluded because a row can hold a stale placement _and_
a binding constraint: measured, removing that one clause destroys 706 hand-placements on a
102,000-activity estate.

**It bumps `version`, departing from every other data migration in this repository, and the
departure is the load-bearing part.** The convention exists so an _engine_ write stays invisible to
optimistic locking; this writes a _planner-owned input_ and wants the opposite. The activity editor
resends the constraint on every definition save, seeded from the row the dialog was opened with, and
the batch placement route additionally resends `visualStart` — so a tab left open across the deploy
would otherwise silently re-write the stripped constraint, and through the batch route would clear
the placement the migration had just written. The bump turns both into the existing non-destructive
conflict message.

**The act is irreversible and permanently unauditable** — the activity PATCH route is classified as
plan content and excluded from the audit log by design — so every conversion is recorded in
`placement_migrations` with the constraint and the label it replaced, and a new read route
(`GET …/plans/:planId/placement-migration`, any member) surfaces it. The plan workspace shows a
dismissible notice naming the count and the consequence. It says the float **will** change at the
next recalculation rather than that it already has: the migration cannot touch the computed columns,
and the notice appears the first time the plan is opened, which is before any recalculation.

The notice is the canvas dock's lowest-precedence strip, so it never covers a failed write, an armed
tool or the empty-plan prompt — it waits, and costs the diagram no height.

**Measured, against a real database with every prior migration replayed:** 199–241 ms converting
2,826 rows on a 102,000-activity estate, 5.4 ms on the deployed one, and it does not sequentially
scan. No new index: the predicate is a whole-table question with no selectivity to offer, and an
index for a once-ever statement would cost every activity write for ever.
