---
'@repo/api': minor
---

Wire the CPM engine to persistence (ADR-0022). Add the `schedule` module with a
`ScheduleService.recalculate` that — under the plan-scoped advisory lock shared
with the dependency cycle check (ADR-0021) — loads a plan's active activities and
edges, runs the pure engine, and writes the seven engine-owned columns via a
single batched raw `UPDATE … FROM unnest(...)` that never touches `version` or
`updated_at`. Introduce the `schedule:read` (every member) and `schedule:calculate`
(Planner + Org Admin) permissions. The recalculation is not yet exposed over HTTP —
the endpoint lands next.
