---
'@repo/api': patch
---

Reject an empty calendar at the baseline-variance seam too, not just at recalculation

The `CALENDAR_HAS_NO_WORKING_TIME` mapping shipped a moment ago at
`ScheduleService.resolveCalendar`. `BaselinesService.resolveCalendar` builds a calendar port the same
way, from the same rows, and still threw — so a variance read on a calendar with no working time
answered the same opaque 500 the recalculation had just stopped answering.

Both now go through one `buildPlanCalendarOrReject` in `plan-calendar.ts` rather than a catch at each
seam. Two copies of the rule would be free to drift, and the half that drifted would be the one
nobody exercises — which is precisely what the first version of this fix did, silently, until the
second seam got a test of its own.

Worth recording how that test behaved: its first version passed with a 200, because variance
short-circuits to an empty result before resolving a calendar when the plan has no active baseline.
A green test that never reaches the code it names is worse than no test, and the fix was to the test,
not the product.
