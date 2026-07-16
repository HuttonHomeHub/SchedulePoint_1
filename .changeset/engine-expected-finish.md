---
'@repo/api': minor
'@repo/types': minor
---

Add **Expected Finish** scheduling (M4-F5, ADR-0035 §9). A new per-activity `expectedFinish` target
date plus a plan-level `useExpectedFinishDates` option: when the option is on, the CPM forward pass
**recomputes** an in-progress activity's remaining work so its early finish lands on its expected
finish (the day's working-end boundary), floored at the rescheduled start — a past target collapses the
remaining to zero. When the option is off, or for a not-started/complete activity, the target is
ignored and the schedule is byte-identical to the pure-progress path.

`expectedFinish` is client-settable on the activity create/update DTOs and exposed on the activity
response + shared `ActivitySummary`; `useExpectedFinishDates` is set via `UpdatePlanDto` and exposed on
the plan response + shared `Plan` type, threaded through the recalculate contract like the progress
recalc mode. The recalc log carries an `expectedFinishAppliedCount`. Two additive columns (a nullable
activity date and a defaulted plan boolean) — no data migration; the golden suite is unchanged. The
conformance golden (A6200) and the S12 on/off differential land with the F6 conformance slice.
