# ADR-0199: A link is never louder than the work it joins

- **Status:** Accepted — 2026-10-17. Route A of the spec (two values change; bars and links equal) was approved by the
  product owner on 2026-10-17, with this short ADR amending ADR-0157.
- **Spec:** [`docs/specs/diagram-mark-contrast/spec.md`](../specs/diagram-mark-contrast/spec.md) §4.8 · **Plan:**
  [`implementation-plan.md`](../specs/diagram-mark-contrast/implementation-plan.md) · **Solved values:**
  [`m0-solved.md`](../specs/diagram-mark-contrast/m0-solved.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0157](0157-a-marks-class-is-its-hue-and-its-shape.md) D2 and D4 (the bar's and the driving link's
  lightness).
- **Builds on:** ADR-0154 D1 (the driving link's ink), ADR-0088 D1 (no flag), ADR-0124 (the instrument is the gate's own
  resolver), ADR-0191 D3 (the diagram keeps its own palette; not re-opened).

## Context

`docs/TECH_DEBT.md` #368 recorded that the commonest bar in any programme was fainter than the lines joining the bars.
Its measured pairs were already stale when the spec was written (ADR-0157 replaced both marks two days after the row was
filed), but re-measured against today's tokens the inversion survived: the ordinary bar was 3.27:1 on the ground, an
ordinary driving link 4.22:1 and a non-driving link 3.37:1.

It arose from two solves. `--canvas-bar` was "the lightest green that clears 3:1", and `--canvas-link` was given a 4.0:1
target that no written constraint stood behind. The one constraint near it works the other way: the direction mark must
clear 3:1 on the driving line, so a lighter driving link relaxes it. The design system also says drivingness is weight
(2 px against 1 px), so the extra lightness contrast did a job nothing records.

## Decision

**D1 — No link ink is stronger in contrast than the bar ink of its rung, on any plot ground or on paper.** For the
critical and near-critical rungs this holds by construction, because the link is drawn in the bar's own ink. For the
ordinary rung it is a gate: `token-contrast.test.ts` asserts `contrast(--canvas-bar) ≥ contrast(link)` for
`--canvas-link` and `--canvas-link-minor` on `--canvas`, `--canvas-band` and `--print`, and a Chromium case asserts it on
the painted pixels (`e2e-netpoint-grammar/mark-contrast.spec.ts`).

**D2 — `--canvas-bar` is solved as the darkest value that keeps the ladder**, not the lightest that clears 3:1. It moves
from `oklch(0.629 0.13 150)` to `oklch(0.616 0.13 150)` (3.27:1 to 3.45:1 on the ground). The ladder through the
minimap viewport tint is the binding constraint: 1.54:1 against a 1.5 floor.

**D3 — `--canvas-link` is solved to sit just under the bar.** It moves from `oklch(0.592 0.13 295)` to
`oklch(0.645 0.13 295)` (4.22:1 to 3.40:1). Hue and chroma are kept, so the hue classes of ADR-0157 and the ΔE
separation do not move. Drivingness stays weight.

## Consequences

- Ordinary driving links are quieter. Critical and near-critical links are unchanged (8.43:1 and 5.44:1).
- The mark ink's contrast on the driving line improves from 3.01:1 to 3.73:1.
- The result is **parity, not dominance**: the bar ends 1.014 times the driving link. Dominance would mean moving the
  criticality ladder (about five tokens and every warning-hued cue), which was costed in the spec as Route A+ and not
  taken.
- The bar's label (4.95:1 against 4.5), the inset ring (3.62:1 against 3) and the ladder (1.58:1 and 2.44:1 against 1.5)
  keep their floors. The next lightness step for the bar is bounded by those, so a future re-tune has a stated ceiling.
- `docs/DESIGN_SYSTEM.md` ("The link on the diagram") states the rule. The Gantt bar, the Colour-by lens, the WBS band
  summary, the legend, the minimap and paper read the same two tokens and follow.
- Found on the way and filed, not fixed: `--plot-warning` is outside the sRGB gamut (`docs/TECH_DEBT.md` #523). Fixed
  2026-10-19 by the owner's decision: chroma 0.13 to 0.12 at the same lightness and hue, so the ladder keeps its floors.
