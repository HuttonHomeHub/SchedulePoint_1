# TSLD prototype-at-scale spike (M0)

> **Throwaway benchmark harness** for the TSLD canvas rendering decision
> ([ADR-0026](../../docs/adr/0026-tsld-canvas-rendering-and-architecture.md), Task 0.1).
> This is **not** app/feature code and is not part of the `@repo/web` bundle — it
> exists only to make the Canvas-2D-vs-WebGL choice **evidence-led** before M1.

## What it does

A minimal Canvas 2D renderer exercising the exact hot path the production renderer
will have — a viewport transform, **viewport culling**, layered draw (grid → arrows →
bars), a `requestAnimationFrame` loop with a dirty flag, and text drawn only when
zoomed in (the ADR's dominant cost). It renders a synthetic plan (activities spread
across lanes/time with ~4 dependencies each) and a scripted continuous pan/zoom sweep,
capturing per-frame draw time and frame intervals.

- `scene.js` — deterministic synthetic-plan generator (activities + ~4 deps each).
- `renderer.js` — the culled Canvas 2D renderer + the scripted `bench()` measurement.
- `index.html` — mounts it; drag to pan, wheel to zoom; live fps meter. `?count=N`.
- `bench.mjs` — Playwright driver: serves the harness over HTTP, runs the sweep at
  500 and 2,000 activities headless, and reports the numbers.

## Run it

```bash
node prototypes/tsld-spike/bench.mjs   # headless benchmark (from the repo root)
# or open prototypes/tsld-spike/index.html?count=2000 in a browser to eyeball it
```

The driver launches the pre-installed Chromium via `executablePath` (the pinned
`@playwright/test` build differs from the installed browser) and serves the files over
HTTP (Chromium blocks ES-module imports over `file://`).

## Result (headless Chromium, this environment)

| Activities | Deps  | Draw median | Draw p95 | Budget | Verdict  | Headless fps floor |
| ---------- | ----- | ----------- | -------- | ------ | -------- | ------------------ |
| 500        | 1,653 | 1.0 ms      | 1.6 ms   | ≤16 ms | **PASS** | 30 (median)        |
| 2,000      | 6,846 | 3.3 ms      | 4.0 ms   | ≤16 ms | **PASS** | 12 (median)        |

**Verdict metric = per-frame CPU draw time for the culled viewport** — the portable
signal. At the 2,000-activity ceiling a continuously-redrawn frame costs **4 ms p95**,
~4× under the 16 ms / 60 fps budget (and far under the 22 ms / 45 fps budget). The
headless **fps** numbers (12–30) are **rAF-throttled with no GPU compositor** — a floor,
not the signal: draw is <5% of each frame interval, so the remaining ~95% is headless
throttle, and a real device with GPU compositing sustains far higher fps at this draw
cost.

**Conclusion:** Canvas 2D + viewport culling + layering clears the performance budget
with large headroom at the v1 data ceiling. **No WebGL escalation is warranted** —
consistent with ADR-0026's decision. Final device-fps confirmation (mid-tier laptop +
iPad-class tablet) is folded into M1 on real hardware; the WebGL escalation gate in
ADR-0026 remains the documented fallback if a real-device regression is ever measured.
