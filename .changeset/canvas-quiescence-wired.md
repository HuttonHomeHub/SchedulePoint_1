---
'@repo/web': patch
---

The canvas link tool no longer loses its quiescence, and its confirmation offers Undo.

The workspace layout that actually ships was passing three fewer props to the canvas than the
layout beside it. The recalculation hold — built so bars cannot move between the two clicks of a
link pick — was inert, which is the defect that work was commissioned to fix. The link
confirmation's Undo button had never rendered at all.

Also: `/sign-in`'s `?redirect=` is now same-origin by shape, and the guest share view no longer
scrolls sideways on a 320px phone (WCAG 1.4.10).
