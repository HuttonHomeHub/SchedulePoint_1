---
'@repo/web': minor
---

Flagged web surface for external / inter-project dates (ADR-0043 / ADR-0035 §30, M1), behind
`VITE_INTER_PROJECT_DATES` (default off). The activity form gains an **External dates** section with
optional **External early start** / **External late finish** calendar-day fields (imported commitments
gating the activity from another project), including a client-side check that the late finish is not
before the early start (the N26 rule, also enforced server-side as a 422). Plan settings gain an **Ignore
external relationships** toggle that drops all external bounds so the plan can be viewed on its own logic.
The schedule summary strip shows an **Externally driven** count when a recalculation reports one. Everything
is default-off and additive; a stored external date still round-trips through the form when the flag is off.
