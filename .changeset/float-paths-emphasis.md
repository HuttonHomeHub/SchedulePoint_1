---
'@repo/web': minor
---

Show the selected **float path** on the diagram and in the Gantt (behind `VITE_FLOAT_PATHS`) — audit
F4, M2–M3.

Expanding a path in the Float paths panel recedes everything that is not on it, in whichever view is
showing. One derived id-set feeds both, so the two cannot disagree about which activities are on the
chain — a disagreement that would only ever surface in a screenshot or a printed programme.

- **Canvas:** contributes members to the `dimmedIds` set the painter already reads once per culled
  bar. **No new scene field and no new paint branch** — the painter is already measured at
  16.7–23.1 ms p95 against a ≤ 4 ms budget (`docs/TECH_DEBT.md` #75), and that claim is a test
  asserting what the painter is handed, not a note in a docblock.
- **Gantt:** a new de-emphasis treatment, since the grid had none. Visual only — a receded row keeps
  its tab stop, its `aria-rowindex` and its activation, and carries the reason in words rather than
  by opacity alone.
- Activating a chain row selects the activity and brings it into view **without taking focus**, so
  the planner stays in the panel they are reading. In the Gantt that means expanding a collapsed WBS
  parent first, then scrolling through the virtualizer — `scrollIntoView` on an unrendered row is a
  silent no-op.

The canvas listbox's dim marker is rebuilt as a reasons array rather than nested ternaries. Two
causes were four readable branches; three would be eight, and one of the eight ends up wrong with
nobody noticing.

**The CPM engine is not imported.** The ADR-0034 recalc parity gate is untouched by construction,
and flag-off is byte-for-byte the prior product in both views.
