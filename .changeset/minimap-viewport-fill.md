---
'@repo/web': patch
---

The minimap's viewport indicator is filled, not only bordered. At whole-plan zoom the
rectangle is congruent with the picture's own edge, so a border alone marks everything and
therefore marks nothing; the fill makes it read as a region at every zoom.
