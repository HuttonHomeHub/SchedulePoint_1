# Minimap spec input — performance (2026-08-20)

> Verbatim report from the performance-reviewer agent, gathered BEFORE the spec was drafted.
> Every claim is tagged [read] / [measured] / [reasoned] by its author. Headless probe numbers are
> order-of-magnitude only, per the report's own caveat — the M0 list at the foot is what makes them
> citable.

## 1. Redraw policy

**[read]** The rAF loop already runs exactly this pattern for two other "extra layers" — the
resource strip and the WBS band — inside the same `frame()` closure in
`apps/web/src/features/tsld/components/TsldCanvas.tsx:1286-1431`. Each has its own stacked
`<canvas>` (`stripCanvasRef`, `wbsBandCanvasRef`), its own dirty ref, and repaints on
`movedThisFrame || <layer>DirtyRef.current` (`:1390-1403`, `:1408-1430`). `movedThisFrame` is
`dirtyRef.current` snapshotted before the main paint clears it (`:1315`) — already computed, free
to reuse.

Recommended: **option (b)** — a cached bitmap (decimated whole-plan picture) redrawn only when the
SCENE changes, via a new `minimapDirtyRef` set exactly like `wbsBandDirtyRef`; the viewport
rectangle redrawn on `movedThisFrame`. A separate stacked canvas, matching the strip/band
precedent. **[measured]** blit + strokeRect on a 200×120 canvas: p50 0 / p95 0 / max 0.1 ms over
200 reps.

Structural gap: `Ctx2D` (`render/ctx-2d.ts:10-46`) has no `drawImage`. Keep the bitmap-BUILD
function pure/`Ctx2D`-typed (so it gets the counting-stub gate); do the per-frame blit in
`TsldCanvas.tsx` against the real context — that file already does canvas orchestration.

**One rAF loop, not a second.** `visibleRef`/IntersectionObserver pause (`:1288-1292`,
`:1439-1452`, TECH_DEBT #30d) only protects work inside `frame()`. A minimap as its own
component+rAF would keep painting a hidden pane's minimap 60×/s.
`TsldCanvas.hidden-pane.test.tsx` is the gate shape to EXTEND with a minimap spy — it currently
asserts only about `paintScene`.

## 2. Cost at 2,000 activities into ~200×120px

**[measured]** (headless Chromium, `scaleScene(2000)` = 2,160 bars, esbuild-bundle probe modelled
on `link-routing-bench.ts` / `measure-link-routing.mjs`):

| what                                                                                     | p50 | p95  | max     |
| ---------------------------------------------------------------------------------------- | --- | ---- | ------- |
| `dayExtent(activities, dataDate)` alone (200 reps)                                       | 2.2 | 2.7  | 3.9 ms  |
| hand-rolled decimated paint (own date pass + 2,160 fillRect, 2 batched fillStyle passes) | 4.7 | 4.9  | 5.1 ms  |
| reusing `cull()`+`activityRect()` at whole-plan viewport                                 | 4.6 | 14.8 | 16.0 ms |
| real `paintScene` squeezed into 200×120                                                  | 3.4 | 4.6  | 5.2 ms  |
| blit cached bitmap + stroke viewport rect                                                | 0   | 0    | 0.1 ms  |

At 500 activities everything is under 2 ms. Cost driver is the O(n) per-activity date-parsing
pass, not canvas size. A real implementation should fold extent + per-bar geometry into ONE O(n)
pass (~2× saving, landing near the `dayExtent`-alone figure). All of this is a ONE-OFF scene-change
cost, not per-frame — compare TECH_DEBT #75: the main painter already costs 8.9 ms p95 EVERY frame
at Fit zoom on real hardware and still passes the §9 fps gate (~53 fps, 10.2% dropped). Option (a)
(bitmap per frame) is the real risk; option (b) is not.

## 3. Gates

1. **Counting-stub shape test** on the pure painter, modelled on
   `render/paint.wbs-band-budget.test.ts` (`countingCtx()` at `:29-67`): draw-call count
   O(activities), ZERO `fillText`/`measureText`/per-bar `strokeRect` in the bitmap pass, fillStyle
   batched (two passes: normal, critical).
2. **Component-level invocation test**, extending `TsldCanvas.hidden-pane.test.tsx`: bitmap-build
   NOT called on a pan-only frame; called once on scene-change; not called while pane hidden.
   Load-bearing — the counting stub cannot catch a per-frame-rebuild regression.
3. **Hand-run harness growth**: a minimap-on/off comparison in the `measure-link-routing.mjs`
   family. NOT a CI gate (CI wall-clock is noise, per repo practice).
4. **Falsification condition, written before building** (ADR-0099 M0 precedent): a `--headed`
   Route-A run (`measure-draw-in-browser.js`) on the same 2,016-activity plan/machine #75 used,
   with the minimap mounted and live, must NOT show dropped-frame % at Fit zoom measurably worse
   than the recorded 10.2% baseline. The real gate is ADR-0026 §9 (≥45 fps @ 500, ≥30 fps @ 2,000,
   <100 ms interaction feedback) — TECH_DEBT #75 lines 363-547, ADR-0026 lines 336-435.

## 4. DPR / ResizeObserver

**[read]** `measure()` (`TsldCanvas.tsx:1213-1256`) sizes every sibling canvas from ONE `getDpr()`
(`:1230`, capped at 2) inside ONE ResizeObserver watching the container (`:1436-1437`). The
minimap joins that block. **BLOCKING recommendation: no new ResizeObserver** — 7 already exist
(`app-shell.tsx:115`, `plan-workspace-toolbar.tsx:359`, `Toolbar.tsx:438`, `toolbar-band.tsx:61`,
`GanttPanel.tsx:413`, `TsldCanvas.tsx:1436`, `TsldLegendPanel.tsx:84`).

## 5. World extent — the load-bearing correction

**The brief's premise was wrong: `render/geometry.ts` has NO reusable extent helper for a
minimap.** What exists is `dayExtent` (X only) at `paint.ts:2203-2218` — used only by
`export-image.ts:106`, despite its "(for the ruler/minimap)" docblock. **There is no lane-extent
helper anywhere**, `LANE_HEIGHT = 28` is hardcoded (`geometry.ts:35`), and `Viewport` can only PAN
Y (`originY`), never compress lane spacing. So `cull()`/`activityRect()` CANNOT be reused:
**[measured]** at a whole-plan viewport into the 200×120 box, `cull()` returned only **255 of
2,160** bars (the rest fall outside vertically). This is a correctness bug waiting for whoever
reaches for the obvious reuse.

The minimap needs `{minDay, maxDay, maxLane}` — a new small pure function in `render/`
(sibling/superset of `dayExtent`), memoised on the scene, computed in the SAME O(n) pass that
builds the minimap bar geometry. Bitmap cache: follow `nonWorkingHatchTile` (`paint.ts:402-422`) —
a plain detached canvas keyed by identity, NOT the `OffscreenCanvas` API (unused in this codebase).

## What M0 must measure, before building

1. `--headed` Route-A run with minimap mounted vs the 10.2% dropped-frame baseline (the
   falsification condition).
2. `--headed` re-run of the bitmap-build probe on a named machine.
3. Confirm the folded single-pass extent+geometry recovers the reasoned ~2× saving.
4. Extend `hidden-pane.test.tsx` with a minimap spy, verified RED against a naive
   own-rAF implementation first.
5. Decide and write down whether the minimap drag inherits ADR-0026 §9's <100 ms interaction
   clause (it does if interactive) — scoped explicitly, not discovered late.
