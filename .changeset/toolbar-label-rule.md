---
'@repo/web': minor
---

The plan command deck now has one rule for when a control shows its text label. Baseline overlay, Resource view, Comments and Settings… show their label when the deck is at least 79 rem wide (about a 1280 px window) and only their icon below that. Each keeps its accessible name and gains a hover and focus tooltip saying what it does, and Resource view takes a stacked-columns icon in place of the people glyph. Nothing moves, and the number of deck lines at every width is unchanged.
