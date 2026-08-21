---
'@repo/web': patch
---

The activity editor opens as a dialog again (ADR-0101). It had been docked in the trailing
context drawer, which caps at 420px — a form that was deliberately widened to 896px with a
section rail _because 448px had already proved too narrow_. In the drawer it ran its
narrow-viewport layout permanently: tabs overflowing sideways inside a panel that was itself
scrolling, over a table scrolling sideways of its own. It now opens at the width and in the
layout it was designed for, and the drawer keeps the Project Explorer — which no longer
disappears when you edit something.

Two colour values are softened while a light theme is prepared: the page foreground, which
measured 14.62:1 against the canvas ground (more than double the AAA requirement, and the
reason long sessions felt tiring), and the non-working-day hatch that was striping the diagram.
