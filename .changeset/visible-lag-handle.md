---
'@repo/web': patch
---

fix(web): visible draggable lag/lead handle on the TSLD canvas (the ADR-0052 M3 anchor was grabbable but painted nothing, so the drag was undiscoverable) — a two-tone disc at every draggable anchor, emphasised on hover/drag, plus a 24px pointer target (WCAG 2.5.8)
