# ADR-0199: A layer is a canvas, and the export accounts for every one

- **Status:** Accepted — 2026-10-17. The spec was approved by the product owner on 2026-10-17 (CQ-1: the strip is
  included when it is open on screen, as configured; CQ-2: the full layer roster). Milestone 1 (the gate) and
  milestone 2 (the strip in the PNG, the PDF and the printed diagram) are built.
- **Spec:** [`docs/specs/resource-strip-export/spec.md`](../specs/resource-strip-export/spec.md) §4.8 · **Plan:**
  [`implementation-plan.md`](../specs/resource-strip-export/implementation-plan.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0103](0103-paper-is-a-surface.md) D7 (the parity gate) and
  [ADR-0049](0049-canvas-axis-aligned-resource-strip.md) (the strip's deliverable).
- **Builds on:** ADR-0063 §M5, ADR-0088 D1 (no flag), ADR-0093 (a roster has a floor), ADR-0106 (a label is chrome),
  ADR-0110 (a gate is verified red), ADR-0127 D3 (count what you do not draw).
- **Closes:** `docs/TECH_DEBT.md` #223. **Opens:** #523, #524 (two export-legend findings met on the way).

## Context

The resource strip is painted from its own ref onto its own sibling `<canvas>` (ADR-0049). The export composer never
read it, so PNG, PDF and print silently omitted the panel a planner was looking at. The gate built for that defect
class (ADR-0103 D7) compares the keys of `TsldScene` between the canvas and the composer, and the strip is not a scene
key, so the gate had no vocabulary that could name it as exported or as screen-only. The diagram renders five
`<canvas>` elements; only the scene's contents were gated, and the WBS band reached the export by hand.

## Decision

**D1 — The strip is in the exported and printed diagram if and only if it is open**, exactly as configured on screen
(stack-by, bucket, isolated resource, scale), read from the canvas handle. This is the rule ADR-0103 applied to the
lenses, extended from scene keys to layers. With it closed, the export is unchanged.

**D2 — The parity gate's second roster is every `<canvas>` under the diagram's components**, each named by a literal
`data-layer`. A canvas without one refuses the build. Each layer is either composed (a key of
`EXPORT_LAYER_INPUTS`, typed against the renderer's input, and named as a literal key in the composer's
`renderExportImage` call) or screen-only with a reason (`interaction`, `minimap`). The roster has a floor and is
checked for staleness in both directions. The scene-key half is unchanged.

**D3 — A band's chrome travels with it as a painted row** (mode, bucket, legend, truncation count, load basis). What
does not fit is counted, not dropped (ADR-0127 D3).

**D4 — Paper re-resolves the band's ground, rule and tick; fills come from the published snapshot**, guarded by a
paper contrast sweep.

**D5 — No `VITE_` flag** (ADR-0088 D1). Rollback is the commit boundary.

## Alternatives considered

- **Also read `stripRef` in the existing gate.** Closes #223 and leaves the mechanism blind to the next layer that
  gets its own ref.
- **A hand-written layer list.** The shape ADR-0103 D7 already rejected.
- **Key on `paint*` imports.** The minimap paints through `buildMinimapBitmap`, so a naming convention misses a real
  layer today.
- **Always export the strip, or add an export option.** Changes every export for users who never asked, or adds a
  control, and either needs a histogram fetch in the export path with defaults nobody saw.

## Consequences

- **Not decided, and not claimed covered:** DOM chrome (the ruler, the legend panel, the strip's panel) is not a layer.
  Its export equivalents are painted rows that remain hand mirrors (ADR-0106).
- The gate shipped one commit ahead of the fix, with the strip in a `KNOWN_GAPS` record naming `docs/TECH_DEBT.md`
  #223 rather than in the screen-only record, whose reasons say "by design". Verified red on that tree (removing the
  entry names `resource-strip`); the entry failed the build once the composer named the strip, and the record was
  deleted with it. A future known gap is a decision to be taken again, not a mechanism left standing.
- The strip is read from the canvas handle (`getResourceStrip`, `null` unless the strip is open), so the export and
  the screen cannot disagree about what the band holds. The panel publishes a bar-less, captioned snapshot for
  loading, error and empty, so an open strip is never exported as an unexplained band.
- The live painter is unchanged: `paintResourceStrip` gains an offset that defaults to `0`, and the snapshot's new
  `caption` is read by no painter.
- The export legend's missing over-allocation entry and its silent truncation on a narrow crop are separate findings,
  filed in the register.

## References

- `docs/TECH_DEBT.md` #223 · `apps/web/src/features/tsld/export/scene-parity.structural.test.ts`
