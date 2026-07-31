---
'@repo/interchange': minor
'@repo/api': patch
---

Import and export P6 Level-of-Effort activities instead of flattening them to tasks

`CANONICAL_ACTIVITY_TYPES` omitted `LEVEL_OF_EFFORT`, so an XER's `TT_LOE` was coerced to `TASK`
(reported as an approximation) and export had no mapping back. The comment called it "out of scope" —
true when written, and untrue from the day the LOE engine shipped (ADR-0035 §21).

The cost was not a missing feature but a wrong one. An LOE derives its span from its logic (earliest
SS-predecessor start → latest FF-successor finish) and never drives anything; a `TASK` schedules from
a duration and does. So an imported supervision or site-management LOE became an ordinary task and
changed the schedule around it.

XER now round-trips it exactly, duration included — P6 writes one and the engine consumes it as a lag
bound, so dropping it would be lossy for no gain. MSPDI has no equivalent, so an LOE still writes as
an ordinary task there, but is now **reported per activity** rather than silently. `HAMMOCK` stays
out of scope on the honest test: the enum has the label, but no engine code consumes it.
