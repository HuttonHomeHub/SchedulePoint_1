---
'@repo/api': minor
'@repo/types': minor
---

Selectable total-float measure (M6-F3, ADR-0035 §18). A new plan option `totalFloatMode`
(`FINISH` — the P6 default — `START`, or `SMALLEST`) chooses how `totalFloat` is measured: late−early
finish, late−early start, or the lesser. It is computed on the activity's own working calendar,
threaded through recalculation, echoed on the plan response, and accepted on plan update; the default
`FINISH` is behaviour-preserving (existing float is byte-identical).

Documented semantic: because float is measured on the activity's own calendar for both sides
(ADR-0037 §4), the three modes coincide for unprogressed activities and diverge only for progressed
ones — so the conformance fixture's mixed-calendar S13 divergence is deliberately not reproduced (a
P6 multi-calendar-measurement artefact; see the capability matrix and ADR-0035 §18).
