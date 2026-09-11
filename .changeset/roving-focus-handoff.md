---
'@repo/web': patch
---

When somebody else's edit removes a command you were standing on, the plan workspace's toolbars now
hand focus back to themselves and say what left and why, instead of dropping it on the page body.
That drop was a WCAG 2.4.3 failure and it also silently disabled every keyboard accelerator on the
workspace, so the reader was stranded with no visible sign anything had happened. It is reachable
whenever a second Planner changes a plan-level setting — for example switching the plan out of
Visual mode, which takes `Clear visual start` away — and needs no pen, so it can happen to the
person currently editing.

The arrow keys now also start from the first command when focus is on a toolbar itself, rather than
skipping it.
