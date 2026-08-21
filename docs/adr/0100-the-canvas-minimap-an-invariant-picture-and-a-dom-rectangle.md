# ADR-0100: The canvas minimap — an invariant picture and a DOM rectangle

- **Status:** Proposed (filed with M1; moved to Accepted at the M4 gate pass)
- **Date:** 2026-08-21
- **Deciders:** product owner (defaults Q1–Q4), Claude (spec + build), with input reports
  from the ui-architect, performance and accessibility reviewers
  (`docs/specs/tsld-minimap/input-*.md`)

## Context

The TSLD is the product's primary surface and every navigation aid it has is **anchored**
— zoom presets, Go to date, zoom-to-selection, search-jump, Next conflict all require the
planner to already know what they are looking for. There is no way to see the shape of the
whole programme, and no unanchored way to move to a region you can only point at (from the
keyboard there is **no route at all**). M0-T2 measured the need rather than quoting it
(`docs/specs/tsld-minimap/m0-measurement.md`): at 1646 CSS px the working presets frame
**0.3–8.6%** of both measured plans' day spans, and a 2,160-activity programme packs to 274
lanes of which **32 are visible** — the time axis carries the argument, the lane axis
compounds it. The minimap is the last unbuilt Should-have on the primary surface
(`docs/PROJECT_BRIEF.md` §8), and ADR-0026 reserved a `Minimap` component in the folder
layout it specified.

The constraint that shapes everything: the pan path already drops frames (10.2% at Fit at
2,016 activities on the reference hardware, `docs/TECH_DEBT.md` #75), so the minimap must
add **nothing measurable** to the per-frame cost. M0-T1 wrote a falsification condition
before any code and measured a paired prototype against it — PASS on both fixtures (+0.60pp
and +1.52pp against a +2.0pp band, baseline spreads 1.56/1.13pp inside the band), with a
software-raster compositing asymmetry recorded for M4's re-derivation.

This is architecturally significant on three counts: it adds a **new kind of render
layer** (a cached bitmap with a scene-change dirty rule, where every existing layer is
per-frame or LOD-gated), a **second viewport concept** inside a canvas whose viewport model
ADR-0026 defined as singular, and a **DOM-over-canvas interactive control** where ADR-0026
D7 built a parallel a11y layer instead.

## Decision

1. **The picture is invariant under pan and zoom, so it is a cached bitmap rebuilt on
   scene change only** (activity data, box resize, theme — never selection, never the
   clock). Everything that moves between scene changes is **DOM beside the bitmap**: the
   viewport rectangle (a `style.transform` write per moved frame, no React render), the
   selection marker, and the Today vertical (via the existing `useNow(60_000)`). The
   agreement round caught the first draft putting selection and Today in the bitmap —
   both would have gone stale against a dirty rule that never fires for them, the exact
   defect ADR-0056 F6a fixed on the main canvas, re-introduced one layer down. The
   **data-date** vertical stays in the bitmap: it is plan data and changes only with the
   scene.
2. **The rectangle is DOM, not canvas.** The minimap's interactive content is exactly one
   rectangle, so the platform provides focus ring, role, name, pointer capture and
   keyboard operation natively — the expensive half of ADR-0026 D7, free. No parallel
   a11y layer, no second per-activity DOM list (the ADR-0063 set-equality invariant is
   asserted, not implied).
3. **The world extent is extracted to the geometry leaf and derived exactly once.**
   `worldExtent(activities, dataDate)` lands in `render/geometry.ts`; the three existing
   inline derivations (`dayExtent`, `fitToContent`, `buildExportViewport`) now read it,
   and `one-world-extent.structural.test.ts` (verified red against the pre-change tree)
   refuses a fourth. `fitToContent`'s ignored-`maxLane` behaviour is preserved exactly —
   repairing it is `docs/TECH_DEBT.md` #152, filed at M0-T5 with a live probe, not a
   refactor side effect.
4. **The x axis is shared with the scene; the y axis deliberately is not.** x goes through
   `screenXOfDay` — the one day→px transform, the ADR-0059 "shared, not reimplemented"
   rule — while y is `laneIndex × boxHeight / (maxLane + 1)`, because `screenYOfLane`
   hardcodes the 28 px lane row and the minimap's whole point on that axis is compression.
   Both halves are pinned by `minimap-axes.structural.test.ts`, which also refuses
   `cull()`/`activityRect()`: measured, a whole-plan viewport culls to **255 of 2,160**
   bars (`Viewport` can pan Y but never compress lane spacing), so the obvious reuse is a
   correctness bug.
5. **Ten of the painter's ~fifteen layers are omitted, and paint order IS the decimation
   policy.** Ground → non-critical bars → critical bars → data-date vertical; later
   strokes overwrite earlier ones, so the critical path survives the merge at 1 px
   (asserted). Links above all: 3,200 links in a 200 px box is a smear that hides the
   bars. The draw budget is a counting-stub gate (`minimap-budget.test.ts`): zero
   text work, zero per-bar strokes, `fillStyle` batched into exactly two bar passes.
6. **The culled-id set is not the minimap's subject**, and `paintScene`'s docblock
   claiming the minimap as its consumer is corrected — the culled set is what is ON
   screen; the minimap's subject is the whole plan.
7. **Hover does nothing in v1.** The date-readout counter-argument is recorded in the
   spec (§4.8) — x is continuous so a readout would be accurate and near-free — and
   deliberately not built: the date is on the ruler, and `docs/TECH_DEBT.md` #148 records
   what canvas overlays cost. Revisit after M4 with real use.
8. **One Escape rung, innermost**: Escape during a minimap drag cancels that drag
   (viewport restored to the press value) and nothing else; every other press defers to
   the existing ladder (ADR-0080, ADR-0099 M4's `defaultPrevented` convention).
9. **One deliberate token deviation, named so it reads as a decision:** the rectangle's
   frame token `--canvas-minimap-frame` is contrast-gated against
   `MINIMAP_GROUNDS = [--canvas, --primary, --destructive]` — not the existing
   `PLOT_GROUNDS` — because the minimap has no month band and DOES have dense bar ink
   under the rectangle at scale. The gate lands in `token-contrast.test.ts` **before**
   the CSS value.
10. **No feature flag** (ADR-0088: a `VITE_` constant is inlined at build time and is not
    an operator rollback). The rollback is a commit boundary; the entry point is
    `View ▾ ▸ Panels ▸ Minimap`, default off per plan (product owner Q1), panel size
    fixed 200×120 (Q3), no command-strip promotion (Q2).

## Alternatives considered

- **A second `paintScene` at minimap scale** — rejected: whole-plan `paintScene` is the
  dearest measured case in the product; its `pxPerDay` here sits below `MIN_PX_PER_DAY`;
  and `TsldScene`'s ~30 optional fields mean every future layer lands in the minimap
  silently. The minimap needs six inputs.
- **Reusing `cull()` + `activityRect()`** — rejected on measurement (255/2,160; decision 4).
- **Reusing `paintScene`'s returned culled-id set** — rejected (decision 6).
- **A canvas-drawn rectangle + parallel a11y layer** — rejected: rebuilds ADR-0026 D7's
  expensive half to avoid one DOM node.
- **Selection/Today in the bitmap** — rejected in the agreement round (decision 1).
- **Folding the extent into the bar pass** (the performance input's ~2× reasoning) —
  withdrawn: it is a fourth inline extent derivation, exactly what decision 3's structural
  test forbids, to save ~2 ms on a scene-change-only path measured at single-digit
  milliseconds (M0-T4: build p50 3.4 ms / p95 5.1 ms / max 9.2 ms at 2,160 activities).

## Consequences

- A **fifth pinned layer concept** lands in `TsldCanvas.tsx`, a file ADR-0078 §3 wants
  decomposed — the wiring is deliberately thin (a dirty ref, a blit, a transform write) and
  extract-when-touched applies.
- One new design-system size (`icon-lg`, 44 px) on the Button CVA — accessibility hard
  requirement for new close/toggle affordances; the Legend's 28 px close is recorded as a
  pre-existing shortfall at M4 rather than propagated.
- A `canvas`-scope token with its own contrast grounds (decision 9).
- The M0 measurement document is the **standing baseline** for the next canvas epic, and
  M4-T2 re-derives its numbers against the shipped implementation before this ADR moves to
  Accepted.
- The register's stage-banner counts move (new files); `pnpm check:counts` re-derives them.

## References

- `docs/specs/tsld-minimap/` — feature spec, implementation plan, three input reports,
  `m0-measurement.md` (the falsification condition and all six M0 task records).
- ADR-0026 (canvas + D7 a11y layer), ADR-0056 (F6a staleness), ADR-0059 (shared time
  axis), ADR-0063 (set-equality), ADR-0069 (`packLanes`), ADR-0078 (layer decomposition),
  ADR-0080/0099 (Escape ladder), ADR-0088 (flags), ADR-0084/0081 (journey rules).
- `docs/TECH_DEBT.md` #75 (pan-path budget), #148 (overlay cost), #152 (filed at M0-T5).
