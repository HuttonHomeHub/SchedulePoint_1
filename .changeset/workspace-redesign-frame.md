---
'@repo/web': minor
---

The plan workspace redesign, part two — the frame, the diagram and the standards.

**Recalculate leaves the command surface for the status bar**, where it appears only when the
schedule is actually behind the plan. Auto-recalculation has fired on every structural edit since
ADR-0032 M3, so on a healthy plan that command re-ran a calculation that had already run. It now
names how much is owed, distinguishes a failure from work not yet computed, and shades with its
reason rather than vanishing when the pen or a data date is missing.

**The 48 px tool rail is deleted and the Project Explorer is docked on the leading edge** —
resizable 200–420, folding to a 34 px spine that keeps the organisation's destinations, because
folding the column is how a planner buys canvas width and it must not take the product's secondary
navigation with it. The brand, the organisation switcher and the account menu return to a header row
that renders at every width again.

**The diagram is ruled both ways and its ground is quiet**: the diagonal weekend hatch is gone, the
alternating month band defaults off (its `View ▸ Structure` switch stays), and lane hairlines give a
bar something to sit on. They are derived from the viewport, so the layer costs the same on a
2,000-activity programme as on a five-activity plan.

No feature flag: a `VITE_` constant is inlined at build time and has never been an operator
rollback, so the rollback here is reverting the commit.
