---
'@repo/web': minor
---

Make resource-dependent activities reachable, and show when one has no driver.

**Resource-dependent** joins the activity Type picker. The scheduling behaviour has been live since
M7.2 — such an activity is scheduled on its driving resource's calendar rather than its own — but the
type was missing from the picker, so the only way to create one was through the API or an import.

The engine's "no driving resource assignment" flag is now visible too: a **Needs a driver** badge on
the row and a **Missing a driver** count in the schedule summary, each explaining that the activity
was scheduled on the ordinary calendar rather than skipped. Until now that flag was computed, stored
and returned by the API without anything rendering it, so a plan could schedule work on the wrong
working time and look completely normal.

The per-activity calendar picker is disabled — with the reason shown — while the type is
resource-dependent, since the driving resource's calendar wins and any value saved there is ignored.
