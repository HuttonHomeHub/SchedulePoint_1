---
'@repo/web': patch
---

The minimap's border no longer merges with the bar beside it. The panel border shares its colour
with a non-critical bar, and the picture is flush to three of the panel's edges by construction —
the plan's earliest, latest and lowest activities are mapped to exactly those edges — so on any
plan whose extreme activity is non-critical the two touched and became one shape. One pixel of the
panel's own ground now sits between them, which costs two pixels of panel size and no picture.
