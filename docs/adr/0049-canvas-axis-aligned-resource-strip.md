# ADR-0049: Canvas-axis-aligned resource strip — a shared-viewport sibling canvas layer

- **Status:** Proposed (amends ADR-0026; behind `VITE_CANVAS_RESOURCE_VIEW`, gated on `RESOURCE_CURVES_ENABLED`)
- **Date:** 2026-07-20
- **Deciders:** James Ewbank (with Claude Code — ui-architect)

## Context

Stage E ("Resource view on the canvas", `docs/specs/canvas-resource-view/`) surfaces the
already-shipped **resource-loading demand read-model** (`GET …/schedule/resource-histogram`
→ `ResourceHistogramSeries[]`, ADR-0044) on the TSLD plan workspace. At approval
(2026-07-20) the product owner chose — over the "dock the shipped modal `ResourceHistogram`
with its own independent axis" default — a **resource strip whose time axis is pixel-aligned
to the TSLD canvas**: demand bars sit under the same day/week/month columns as the diagram
and **move and scale with the canvas viewport** on every pan and zoom (feature-spec §4, Q1).

This is new render work inside the ADR-0026 canvas coordinate/viewport model, so the
render-layer choice is architecturally significant and needs recording. The forces:

- **Frame-perfect co-alignment is the whole product ask.** The strip's bucket bars must land
  under the right day columns at _every_ pan/zoom frame, with no visible drift or lag against
  the diagram and the date ruler. A one-frame desync during a fast pan would read as broken.
- **ADR-0026 already fixes the machinery.** `TsldCanvas` runs a single `requestAnimationFrame`
  loop over one authoritative `viewRef: Viewport` (`pxPerDay`, `originX`, `originY`) and
  `sizeRef`, with a **dirty-flag** repaint model (`dirtyRef` for the scene,
  `interactionDirtyRef` for the pointer-transparent **second** canvas layer, and an
  imperative **DOM date-ruler band** re-tiled from the same `viewRef` only when the viewport
  moved). world→screen is the shared affine `screenXOfDay(day) = originX + day·pxPerDay`
  (`render-model.ts`), used by the painter, the ruler and hit-testing so they can never
  disagree.
- **Accessibility is a merge gate.** A canvas is invisible to assistive tech; ADR-0026's
  answer is an `aria-hidden` surface plus a parallel accessible representation. The shipped
  `ResourceHistogram` already carries the matching pattern — an `aria-hidden` chart plus a
  real, keyboard-navigable `<table>` equivalent (WCAG 2.2 AA) — which Stage E must reuse.
- **Draw budget.** ADR-0026 holds draw ≤ 4 ms p95 @ 2,000 activities. Any strip layer must
  cull to the viewport and repaint only dirty frames.
- **Parity gate.** Frontend-only; `git diff --stat apps/api packages/types` empty. Flag-off
  ⇒ the `resource-view` toolbar item stays its "Coming soon" placeholder and the canvas paints
  byte-for-byte today's.

## Decision

**We will draw the resource strip's demand bars on a Canvas 2D _sibling layer_ painted by the
existing `TsldCanvas` render loop from the same `viewRef`, not as a viewport-synced DOM/SVG
strip.** The strip is the third canvas layer in the ADR-0026 stack (base scene · interaction
overlay · **resource strip**), and it re-aligns for free on the same frame the scene repaints.

Concretely:

1. **A dedicated sibling `<canvas>`** (`aria-hidden`) is positioned as a fixed-height band at
   the **bottom of the `TsldCanvas` container**, inside the canvas region (not a second
   workspace bottom dock — see §Vertical layout). When the strip is active, `measure()`
   subtracts the strip band's height from the scene canvas's drawable height exactly as
   `RULER_HEIGHT` is already subtracted from the top; when inactive it reserves nothing, so
   the scene is byte-for-byte today's (the parity gate).

2. **The strip shares the viewport, it never owns one.** The loop already holds
   `viewRef.current` each frame; the strip paints its buckets with the same `screenXOfDay`
   mapping the scene and ruler use. A bucket `[start, end)` (ISO, from the read-model's shared
   axis) draws at `x1 = screenXOfDay(daysBetween(dataDate, start))` … `x2 = screenXOfDay(
daysBetween(dataDate, end))`, so a WEEK bucket spans exactly 7 day-columns, a MONTH bucket
   ~30 — the pixel alignment is definitional, not approximated.

3. **Two dirty flags keep the layers decoupled (respecting ADR-0026's model).** A new
   `stripDirtyRef` is set by _data_ changes (selected resource, granularity, series refetch,
   theme re-resolve); the existing `dirtyRef` is set by _viewport_ changes (pan/zoom/resize).
   The strip repaints when **either** is set. Because a viewport move already sets `dirtyRef`
   (the scene was repainting that frame anyway), the strip re-aligns at **no extra scene cost**;
   because a granularity/resource switch sets only `stripDirtyRef`, it repaints the strip
   **without** repainting the main scene — the same separation the interaction overlay uses.

4. **The strip reads its data through a ref, like the pending-ghost/selection-anchor seams.**
   The DOM host component (`ResourceStripPanel`) owns the `useResourceHistogram` /
   `useResources` queries, the resource picker and the bucket-size `Select`, and publishes an
   immutable `stripRef` snapshot (selected series values, the bucket axis pre-projected to day
   offsets, the resolved strip palette, and — M2/M3 later — any per-bucket flags) into
   `TsldCanvas`. Writing the ref sets `stripDirtyRef`. No per-frame React, no per-frame
   allocation (ADR-0026 D3).

5. **Accessibility reuses the shipped parallel table verbatim.** The strip canvas is
   `aria-hidden`; the `ResourceStripPanel` renders the shipped `ResourceHistogram`'s real
   `<table>` (scope-ed headers, caption) as the accessible equivalent, plus its bucket-size
   `Select`, inside a distinctly-labelled `<section aria-label="Resource loading">` (a landmark
   name distinct from "Activities panel"). The strip palette re-resolves from design tokens on
   the shared `useThemeVersion` bump (Canvas 2D `fillStyle` cannot take a `var()`), exactly as
   the main painter does. Over-allocation cues (M2, on the diagram; M3, on the strip once
   capacity exists) are never colour-only.

6. **Vertical scale is data-derived, not viewport-derived.** Bar height fits the selected
   resource's **whole-series** peak (`max` over all buckets, not just visible ones), with a
   single labelled max tick, so bars do not rescale while panning. A capacity reference line is
   **deferred to M3** (the read-model is demand-only; capacity needs an API touch — ADR-0044 /
   spec Q4).

## Alternatives considered

- **Viewport-synced DOM/SVG strip (positioned from `pxPerDay` + `originX`).** Natively in the
  DOM, so superficially more accessible. Rejected: (a) to stay frame-perfect during pan it
  would need its **own** rAF reading a shared viewport ref, duplicating the loop and risking a
  one-frame desync against the canvas the product explicitly wants co-moving; (b) scaling bar
  widths with zoom via a container `scaleX` distorts borders and (M2/M3) over-allocation
  badges, while re-laying-out N bucket nodes per frame reintroduces the DOM-node pressure
  ADR-0026 exists to avoid; (c) the "native a11y" upside is largely illusory — a shelf of
  positioned `<div>` bars conveys nothing useful to a screen reader, so we would render the
  parallel `<table>` anyway (the modal already made exactly this call, marking its chart
  `aria-hidden`). The DOM approach pays the alignment cost without banking the a11y benefit.

- **A brand-new independent mini-renderer / second rAF loop for the strip.** Rejected: forks
  the coordinate/viewport source of truth ADR-0026 deliberately centralised, and is the
  desync risk in a more expensive form. Sharing the one loop is strictly safer and cheaper.

- **Dock the shipped modal `ResourceHistogram` with its own axis (the spec's original M1
  default).** Rejected by product at approval — it cannot pixel-align to the diagram, which is
  the point of the stage.

## Consequences

- **Positive:** frame-perfect alignment is guaranteed by construction (same `viewRef`
  snapshot, same `screenXOfDay`, same frame), with zero desync surface. Reuses the existing
  cull + dirty-flag + theme-re-resolve machinery and the shipped a11y table and bucket control.
  The strip repaint is O(visible buckets) — orders of magnitude below the activity budget — so
  the ADR-0026 envelope is unthreatened. Flag-off and no-active-strip are byte-for-byte today's
  canvas.

- **Negative / cost:** `TsldCanvas` gains a third layer, a `stripRef`/`stripDirtyRef` pair, and
  a strip-height term in `measure()` — a modest, well-contained widening of the loop's
  responsibilities (mitigated by keeping all strip _data_, picker, `Select` and table in the
  DOM `ResourceStripPanel`, so the canvas only learns "paint these projected bars"). The strip
  canvas needs its own parallel a11y representation (the reused table) — carried, not free.

- **Neutral / deferred:** true in-strip over-allocation (a demand-vs-capacity band / per-bucket
  flag on the strip) still needs the deferred capacity read-model (spec M3, Q4); until then the
  over-allocation signal stays on the diagram activities (M2, the ADR-0041 levelling flags via
  the Stage-A/B lens seam). If the strip later proves a hotspot at extreme bucket counts, the
  same WebGL escalation gate ADR-0026 defines applies unchanged (the painter swaps, not the
  seam).

- This ADR **amends ADR-0026** (adds the resource-strip layer to the documented layer stack and
  the loop's dirty-flag set); it supersedes nothing.

## References

- Spec: `docs/specs/canvas-resource-view/feature-spec.md` (Q1 resolved) and
  `docs/specs/canvas-resource-view/implementation-plan.md`.
- ADR-0026 (canvas rendering, coordinate/viewport model, layer stack, draw budget, a11y layer).
- ADR-0044 (resource loading curves — the demand read-model), ADR-0041 (levelling flags, M2),
  ADR-0030/0031 (workspace panel primitive & toolbar registry).
- Reused code: `apps/web/src/features/tsld/components/TsldCanvas.tsx` (loop, `viewRef`,
  `measure()`, `RULER_HEIGHT`, `getViewport`), `render/render-model.ts` (`screenXOfDay`,
  `daysBetween`, `cull`), `render/time-scale.ts` (ruler tiling precedent),
  `features/resources/components/ResourceHistogram.tsx` (the reused `<table>` + bucket
  `Select`), `features/resources/api/use-resources.ts` (`useResourceHistogram`).
