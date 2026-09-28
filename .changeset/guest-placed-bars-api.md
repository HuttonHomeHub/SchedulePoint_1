---
'@repo/api': minor
---

Share links now include where each bar is placed. `GET /api/v1/share/activities` gains
`visualEffectiveStart`/`visualEffectiveFinish` — the same placed span the member view has drawn
since ADR-0148 — so a guest's copy of the plan agrees with the planner's (ADR-0163). Four
neighbouring fields (`visualStart`, `visualConflict`/`Reason`, `visualDriftDays`,
`remainingFloat`) stay excluded from the guest scope.
