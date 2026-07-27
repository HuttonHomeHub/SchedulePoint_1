---
'@repo/web': minor
---

TSLD time-axis gridline tiers on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
tsld-toolbar-canvas-refinements M3). The single batched grid stroke splits into three tiers —
day, month, year — each with its own colour token (`--canvas-grid-day`/`-month`/`-year`) and, for
year, a heavier `lineWidth` (2 vs 1), drawn in day → month → year order so a coarser boundary wins
at a coincident x. Two cues (weight and colour), so the hierarchy survives monochrome print and
colour-blind reading. Set `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback
to today's single `gridLine` pass.
