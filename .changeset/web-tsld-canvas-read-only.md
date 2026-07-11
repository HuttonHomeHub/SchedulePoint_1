---
'@repo/web': minor
---

Add the Time-Scaled Logic Diagram (TSLD) canvas — read-only (M8, ADR-0026). The plan
detail's "Logic diagram" section now plots a plan's computed activities on a **Canvas 2D**
surface: task bars and milestone diamonds positioned by their early dates on a
time-scaled grid, dependency logic drawn as routed connectors, and the critical /
near-critical path highlighted. The view is **drag-to-pan, scroll-to-zoom** (cursor-anchored)
with a **Fit to plan** control, and repaints only dirty frames off a `requestAnimationFrame`
loop so an idle diagram costs nothing.

Because a `<canvas>` is opaque to assistive technology, the diagram is `aria-hidden` and
paired with a **parallel focusable listbox** of the same activities: a keyboard or
screen-reader user tabs into the diagram, arrows through activities (each announced with its
dates, lane and criticality) and selects one, which rings it on the canvas — no capability is
pointer-only (WCAG 2.2). The activities table remains the fuller conforming alternative.
On-canvas **editing** (create/move/draw logic) arrives in a later release.
