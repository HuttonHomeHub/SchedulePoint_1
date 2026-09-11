# ADR-0134: A typed date writes the constraint a drag writes

- **Status:** **Accepted** — 2026-09-11
- **Date:** 2026-09-11
- **Deciders:** the product owner, answering `docs/specs/gantt-editing-gaps/` CQ-1 **BUILD** on
  2026-09-11 and asking for the ADR before the milestone rather than after it
- **Extends:** ADR-0095 (the Gantt becomes a working surface), ADR-0052 §3 (the canvas start-edge
  resize, which made this same decision for the drag and needed an ADR then), ADR-0033 (Early and
  Visual modes, and `visualStart` as an advisory placement), ADR-0048 (the undo stack)
- **Supersedes:** nothing.
- **Spec:** [`docs/specs/gantt-editing-gaps/`](../specs/gantt-editing-gaps/) — Milestone 3

## Context

The Gantt's `Start` and `Finish` columns print `earlyStart` and `earlyFinish`, which the CPM engine
**computes**. A client that `PATCH`ed either would be asserting an answer rather than supplying an
input, so `cell-commit.ts` refuses both keys by name and says why in place. That refusal is right
and it is not the whole story: the two columns were simultaneously listed in
`GANTT_EDITABLE_COLUMNS`, so the cell opened, accepted a date and refused every value —
`docs/TECH_DEBT.md` #290, closed by making the columns honestly read-only (`61d3dda2`).

That closes the dead end and leaves the question it was standing in front of: **the two most
obvious cells in a Gantt grid are inert**, in a product whose brief calls the view "read-primary;
edit supported". P6 and MS Project both let a planner type into them. The product owner chose to
build it.

**It needs a decision rather than a repair, which is why this exists.** "Typing a date into a
computed column silently pins the activity" is a statement about the schedule, not about a grid.
The canvas already makes that statement for a drag, and ADR-0052 §3 is where it was made.

## Decision

**A typed date writes exactly what the equivalent canvas gesture writes.** Not something similar,
and not a new semantic invented for the grid — the point of the decision is that a planner who
learns the diagram has already learnt the grid, and that there is one answer to "what does moving
this date mean" rather than two that drift.

The canvas's three branches, read from `use-plan-workspace-model.ts` rather than recalled:

### D1 — `Start`, in **Visual** mode: `visualStart` and no constraint

`:1179-1188` sends `visualStart` plus `durationDays` in one minimal `PATCH`; the ADR-0033
effective-Visual pass then pins the bar, "exactly like a reposition drop". A typed `Start` in
Visual mode does the same thing with the same mutation. **No constraint is written**, because a
hand-placement is advisory and a constraint is not.

### D2 — `Start`, in **Early** mode: `SNET` at the typed date

`:1200-1216` writes `constraintType: 'SNET'` with `constraintDate` at the new start, and adjusts
`durationDays` so the finish stays put. A typed `Start` in Early mode does the same. The comment
there gives the reason this ADR adopts wholesale: the start is computed, so the only honest way to
move it is to pin it.

### D3 — `Finish` writes a **duration**, in both modes, and no constraint at all

This is the branch a reader expects to be `FNLT` and is not, which is the single most important
thing in this document.

`:1204-1207` records that a finish-edge resize "spreads neither field, leaving the stored
constraint round-tripped verbatim" — it sets `durationDays` and nothing else. So a typed `Finish`
sets the duration that puts the finish on the typed date, keeps the start where it is, and leaves
any existing constraint untouched.

**Its honest consequence, stated rather than discovered later:** in Early mode with no constraint,
the start is computed, so a later recalculation can move the start and carry the typed finish with
it. The typed finish is **not a pin**. That is exactly as true of dragging the bar's finish edge
today, and making the grid behave differently would be inventing the second answer this decision
exists to prevent. A planner who wants the finish held types a `Start` (D2) or sets a constraint in
the activity editor, where constraints are the subject rather than a side effect.

### D4 — A `MANDATORY_*` constraint is never overwritten from a cell

If the activity already carries `MANDATORY_START` or `MANDATORY_FINISH`, a typed `Start` is
**refused with a reason** rather than replacing it. Mandatory constraints break logic by design
(ADR-0035 §7, produce-and-flag) and swapping one for an `SNET` changes what the whole downstream
chain means. A grid cell is not where that trade is made; the activity editor is, where the
constraint is named and its consequence is on screen.

### D5 — One parser, and it is the formatter's inverse

The date the cell prints and the date the cell accepts are one implementation, not two. Two answers
to "what does this string mean" is the ADR-0065 `routeOrthogonal` argument: each looks right alone
and the drift is invisible until somebody round-trips a value.

### D6 — It says what it did, once per session, and it is undoable

A pin a planner did not intend and does not notice is the risk this decision creates, and the
mitigation is not a confirmation on every edit — that would make the ordinary case expensive to
buy protection against the rare one. Instead: **one explanation the first time it happens in a
session**, one undo entry per commit (ADR-0048), and the constraint badge the bar already carries
(`bar-annotations.ts:54-65`) as the standing signal afterwards.

## Alternatives considered

- **Leave the cells read-only.** Genuinely available — M1 already closed the dead end, so this
  costs nothing to choose and the capability simply waits. Declined by the product owner, who
  weighed a week of work against two permanently inert cells in the one view that reports upward.
- **Write `FNLT` for a typed `Finish`.** Symmetrical, and wrong: it is not what the finish-edge drag
  does, so it would give the grid a semantic the diagram does not have. If a `FNLT`-from-the-grid
  capability is ever wanted it is its own decision with its own ADR, not a detail of this one.
- **Confirm every typed date.** Rejected under D6: it taxes the common case to guard the rare one,
  and this repository has recorded that shape making a surface worse more than once.

## Consequences

- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched — in its honest form: there is nothing here to hold parity _for_. This decision
  changes which of two already-supported write fields the client sends, exactly as ADR-0070 did.
- **`cell-commit.ts`'s refusal branch stays.** It is still the right answer for a key routed there
  with no mode resolved, and `cell-commit.test.ts` pins the combination rather than trusting the
  comment. What changes is that the two date keys now have a destination.
- **The Visual-mode case needs a journey, and the repository barely has one.**
  `e2e-gantt-editing/bar-drag.spec.ts:157` is among a handful of journeys that run in Visual mode at
  all, and ADR-0092 records that gap being exactly where a defect was hiding. The typed-date journey
  covers both modes for that reason, not for symmetry.
- **A planner can now pin an activity from a grid they may think of as a report.** That is the
  capability, and D6 is the whole of its mitigation.
