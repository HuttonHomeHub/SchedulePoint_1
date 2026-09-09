---
'@repo/web': minor
---

Compare the open plan against another plan in the same project.

Two revisions of one programme that arrived as two imports are two sibling plans
sharing no activity ids, so the existing comparison had nothing to say about them.
A **Compare with** picker in the Compare revisions dock now matches them on
activity code and shows the match coverage first — every number below it is worth
exactly what the coverage says it is. The difference is drawn on the diagram too,
and the printed handover names both plans.

Two limits are stated rather than implied: an activity whose code changed between
the two looks the same as one removed and another added, and work that exists in
only one plan is counted rather than drawn, because two independent imports do not
share a lane order.
