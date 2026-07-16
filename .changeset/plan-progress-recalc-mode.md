---
'@repo/api': minor
'@repo/types': minor
---

Plan-level progress recalc mode (M2, ADR-0035 §1). Plans now carry a
`progressRecalcMode` — `RETAINED_LOGIC` (default), `PROGRESS_OVERRIDE`, or
`ACTUAL_DATES` — exposed on the plan response and settable via `PATCH` (like
`schedulingMode`), and threaded into the CPM recalculation. It governs how an
in-progress activity's remaining work treats predecessor logic when progress is
out of sequence. Behaviour-preserving by default; an unprogressed plan is
unaffected.
