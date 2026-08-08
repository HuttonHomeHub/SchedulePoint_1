---
'@repo/web': minor
---

A shaded menu item keeps its place in the keyboard order, and says why it is shut.

Row actions a planner cannot currently take — Edit, Duplicate, Dissolve, Delete without the plan
edit-lock — are now shown shaded with a reason instead of vanishing, matching what the canvas
selection bar has always done. Arrow keys reach them, and screen readers announce the reason as a
description.

Two keyboard bugs go with it: arrowing up from a disabled item landed on the second-to-last item
rather than the last, and a menu whose items were all unavailable trapped focus so only Escape
worked.
