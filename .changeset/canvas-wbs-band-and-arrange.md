---
'@repo/web': patch
---

Keep an over-cap WBS summary on the canvas, and give auto-arrange the plan's logic

The WBS band stacks three nesting levels and skips anything deeper, but the scene filter lifted
**every** summary out regardless — so a summary nested four deep was skipped by the band, removed
from the diagram, and rendered nowhere at all. The cap is now one exported predicate that both
halves call.

Auto-arrange now takes the plan's dependencies as a hint and, **among the lanes that are already
free**, puts an activity nearest its predecessors. It never opens a lane it would not otherwise
have opened, so the lane count is unchanged; what changes is how far a logic line has to travel.
Measured on a 126-activity / 188-link imported programme: mean vertical hop per link 2.34 → 1.83
lanes and links spanning more than five lanes 15 → 8, both at 13 lanes either way.
