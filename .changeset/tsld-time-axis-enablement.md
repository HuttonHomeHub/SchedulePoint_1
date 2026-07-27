---
'@repo/web': minor
---

Flip `VITE_CANVAS_TIME_AXIS` default-on (tsld-toolbar-canvas-refinements M7, ADR-0056 Accepted):
range-anchored zoom presets, tiered gridlines, the interpolated Today marker + pill, and
ground-vs-non-working shading are now on by default. Folds two fixes found by the pre-flip
specialist review pass: the day/month gridline colours widen their contrast (WCAG 1.4.1 — the
original values measured ~1.1:1, imperceptible) across all three themes, and the raised zoom
ceiling (`MAX_PX_PER_DAY` 60 → 200) now threads through every zoom-scale clamp as a required
parameter so it can never leak into the flag-off zoom range. Set `VITE_CANVAS_TIME_AXIS=false` for
a byte-for-byte rollback to the pre-epic time axis.
