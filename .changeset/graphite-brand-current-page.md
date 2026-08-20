---
'@repo/web': patch
---

Fix two links claiming to be the current page. The SchedulePoint wordmark links to the organisation
overview, and the router marked it active on every organisation route rather than only on the
overview itself — so alongside the navigation item that genuinely was current, a screen reader gave
two answers to "where am I". The wordmark now marks itself current only on the overview.

Also clamps the context drawer's width against the space available, so a stored width can no longer
squeeze the diagram on a narrow screen.
