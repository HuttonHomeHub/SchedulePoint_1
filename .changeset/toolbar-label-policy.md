---
'@repo/web': minor
---

Toolbar buttons now show their text labels when the row has room for them.

A toolbar item's `tier` used to decide two unrelated things: what gets demoted into the `⋯`
overflow first, and whether the button shows a text label. Those only coincided by convention, and
the consequence was measurable — at 1920px the plan toolbar's second row carried roughly 1000px of
unused width while showing exactly as many icon-only controls as it does at 1280px, because nothing
ever asked whether a label was affordable at the width actually available.

`ToolbarItem` gains a `showLabel` policy (`'always' | 'auto' | 'never'`, default `'auto'`) that is
separate from `tier`, and `'auto'` resolves from the measured container width on every resize. The
primary actions (Early/Visual mode, Add, Recalculate, and every button in the floating
selection-actions bar) pin `'always'`, since their names are the affordance; everything else gains
a label on wide viewports and keeps today's icon-only chrome on narrow ones. Labels are never
promoted at the cost of pushing a command into the overflow.
