---
'@repo/web': minor
---

TSLD Today marker refinement on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
tsld-toolbar-canvas-refinements M4). The dashed vertical interpolates to the viewer-local
time-of-day (`todayDayFraction`) instead of snapping to the midnight boundary, and carries a
"Today" pill (mirroring the cursor date chip's geometry, offset 4px below it so the two never
collide during a drag). A new `useNow` hook re-derives the marker every 60s while the tab is
visible — pausing while hidden and re-syncing immediately on `visibilitychange` — which also
repairs a pre-existing defect where a plan left open across midnight kept showing yesterday's
line. Set `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's
plain integer-offset dashed line.
