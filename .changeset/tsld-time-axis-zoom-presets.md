---
'@repo/web': minor
---

Range-anchored zoom presets on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
tsld-toolbar-canvas-refinements M2). Each `View▾` zoom preset now targets a fixed **visible
range** (Day → 2 weeks, Week → 1 month, Month → 3 months, Quarter → 1 year, Year → 3 years)
independent of canvas width, and the zoom menu states each preset's range so the names stop
being ambiguous about what they frame; the trigger keeps its short name. `MAX_PX_PER_DAY` rises
60 → 200 so the Day preset can actually reach 2 weeks visible at ordinary desktop widths. Set
`VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's fixed
`ZOOM_STOPS` scale.
