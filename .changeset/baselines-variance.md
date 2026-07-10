---
'@repo/api': minor
---

Add the baseline variance read model (M7 Task C1, ADR-0025).
`GET …/baselines/variance` joins the plan's live activities against the active baseline's
snapshot on `source_activity_id` and returns per-activity **start/finish/float variance in
working days** on the plan's calendar (reusing the engine's `workingDaysBetween` /
`buildWorkingDayCalendar`, ADR-0024), signed so **positive = current later than baseline
(behind)**, plus a `meta` roll-up (`PlanVarianceSummary`: active baseline id/name,
`capturedAt`, worst finish slip, and counts behind / added / removed). An activity added
after capture is `inBaseline: false`; a baselined activity no longer live is a `removed`
row; a plan with no active baseline returns an empty list with `meta.baselineId = null`.
The diff is a pure, exhaustively-unit-tested `computeVariance` helper. The read is bounded
and plan-scoped (no cursor pagination — one build of the calendar, an O(n) join), so it
stays within the M6/M7 performance budget; a CI smoke exercises it at 500 activities. The
shared `Paginated` envelope now carries a typed `meta` so a bounded list can return the
variance roll-up.
