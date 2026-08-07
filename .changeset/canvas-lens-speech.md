---
'@repo/web': patch
---

The WBS colour lens and the baseline ghost now have spoken equivalents. "Colour by WBS group" told
you which activities belong together using fill colour and nothing else, and the baseline overlay
drew a ghost bar with no text anywhere naming it — so on both, a keyboard or screen-reader user was
given a diagram with a fact removed from it. Each row of the diagram's activity list now ends with
its group ("group: A200", or "ungrouped"), and a ghosted row names the captured baseline span and
how far its finish has moved, in the same behind/ahead words the variance table uses. The group name
spoken on the row is the one printed in the on-canvas legend — one producer, so they cannot drift.

Selecting an activity also now says exactly what its row says. It used to announce the activity's
dates and float alone, while the row on screen carried that sentence plus its "filtered out" and
"over-allocated" marks — so selecting a bar the filter had dimmed spoke a sentence the visible list
did not contain. The row text and the announcement are now one composition.
