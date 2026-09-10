---
'@repo/web': patch
---

The staff console stops interrupting: an alert now says whether it is an event or a standing
condition.

`Alert` gains a required `purpose` with no default. `tone` keeps deciding urgency and `role` is
still not a prop; `purpose` answers a different question the primitive could not previously ask.
Six caveats on the staff console — two of them assertive, and all six produced by a query settling
rather than by anything happening — stop being live regions. Two of those were already announced
correctly by the panel's own polite region, so the alert was saying them twice.

See ADR-0132.
