---
'@repo/web': minor
---

Arrange now offers two ways to rearrange the diagram's lanes and shows what each would do before
anything moves. **Tidy** improves the lanes you have, in this order: remove overlaps, then links
hidden behind bars, then crossings, and it never adds lanes. **Re-layout** starts again from lanes
packed by time, then improves them the same way. Each option lists activities moved, lanes,
overlaps, links behind bars and crossings, before and after. Confirm writes exactly those moves as
one undoable step. The work runs in the background while the dialog is open, so the diagram stays
responsive. Tidy is offered on plans that draw up to 300 activities. The prompt at the foot of the
diagram now appears only when activities overlap in their lanes, and says how many.
