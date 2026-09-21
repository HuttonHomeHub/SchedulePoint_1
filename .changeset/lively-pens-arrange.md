---
'@repo/web': patch
---

Auto-arrange now packs the lanes the diagram actually paints. The summaries the WBS band draws are
packed after the scene and appended above it, so the rows they used to occupy inside the diagram are
gone: measured on a 144-bar imported programme, the drawn extent falls from 27 lanes to 12 — 420 px
of blank rows scattered through the picture. Turning the band off still leaves a valid layout,
because the summaries keep real lanes rather than stale ones.
