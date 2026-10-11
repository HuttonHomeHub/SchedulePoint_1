# ADR-0187: A selection bar leads with its subject, and a floor never exceeds its row

- **Status:** Accepted — 2026-10-11. The product owner approved the spec's questions on 2026-10-11: Q1 yes (the bar
  leads with the activity's own actions on every selection), Q2 conditional on measurement (it did not pass),
  Q3 and Q4 close.
- **Spec:** [`docs/specs/selection-bar-fit/spec.md`](../specs/selection-bar-fit/spec.md) · **Plan:**
  [`implementation-plan.md`](../specs/selection-bar-fit/implementation-plan.md) · **Readings:**
  [`m0-measurement.md`](../specs/selection-bar-fit/m0-measurement.md)
- **Date:** 2026-10-11
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0031 (the canonical left-to-right group order is the default, not a rule for every toolbar) and
  ADR-0186's Consequences (the first Tab stop is no longer Zoom to selection or Float paths).
- **Builds on:** ADR-0094 (no per-context order), ADR-0111 (a primitive's keyboard contract is reviewed before
  release), ADR-0105 (why this was a spec), ADR-0113 and ADR-0142 (measure first), ADR-0088 D1 (no flag).

## Context

`conflict-remedy` is registered first (`order: -1`) so the fix sits next to the reason. But `Toolbar` sorts by
group before order and ranks `find` ahead of `object`, so on the Diagram the remedy was the fourth control, behind
Zoom to selection, Isolate and Float paths. Measured (`m0-measurement.md`): the remedy is on the second control
line in every cell except one, at every width up to the owner's monitor, with no code or test saying otherwise.
The same order made the first Tab stop a viewing control for every selection, and left the Gantt bar with Float
paths alone at its leading edge.

Separately, the dock outlet's rem floors (18 rem, and 36 rem for a marked strip on a finger-sized window) double
with text size. Where the media queries do not follow the root size, the 36 rem floor is 1,152 px in a 747 px row
at 1024 x 600, so the foot row scrolls sideways and the tail of the bar is off-screen. A text-only default-font
change, which moves the media queries as well, reads clean on both pointers.

## Decision

1. **D1 — The selection bar renders its Activity-actions group before its Find group, for every selection.**
   `Toolbar` gains an optional `groupOrder`, a permutation of the groups the registry uses, default the canonical
   order (markup byte-identical when absent). The rendered order, the roving sequence and the first Tab stop read
   one resolved order (`resolveItems`), so a surface cannot show one order and walk another. A violation throws in
   development and falls back to canonical in production. `Deck` does not take it. One static order, not a
   per-context one, so ADR-0094 is not engaged.
2. **D2 — A dock floor is `min(<rem>, 100%)`.** Text zoom cannot push a strip wider than its row (WCAG 1.4.4). No
   change at 100 % text: lines and foot height are identical in every measured reading.
3. **D3 — The own-row floor is not extended to fine pointers.** Measured: it saves 40 px at 1024 to 1040 px and
   costs 40 px at 1120 to 1250 px (10 to 13 of 224 sweep readings, at 30 and 36 rem). The plan's stop rule said
   no state may lose canvas, so #489 closes with the table rather than being tuned.

## Alternatives considered

- **R2, the remedy beside the caption as its own Tab stop.** Costs 16 to 28 px of height on every flagged
  selection and puts the stop outside the roving set. Rejected.
- **R3, a "Fix:" cue only.** Moves nothing. Rejected.
- **R4, reorder per context.** Controls move under the cursor. Refused by ADR-0094.
- **A content basis or JS measurement for #489.** Forces the own row where the bar fits beside the facts;
  measurement in JS is refused by ADR-0109 D1.
- **Px floors for #487.** Changes the 100 % layouts the toolbar epic measured.

## Consequences

- The first Tab stop in the bar is the remedy for a route conflict, otherwise Logic, in both views; Zoom to
  selection moves to the end. Journeys that asserted the old stop are updated.
- Line counts are unchanged in every measured cell (`m0-measurement.md`).
- #487 as filed did not reproduce under a text-only 200 % route; the cap closes the one mechanism that overflows.
- ADR-0111 review of D1 (accessibility-reviewer, component-reviewer) is owed before release; findings are
  recorded here when they land.
- No flag (ADR-0088 D1); the rollback is the commit.
