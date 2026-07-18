---
'@repo/api': minor
'@repo/types': minor
---

Cross-plan schedule staleness tracking (inter-project M2, ADR-0045 §5 / ADR-0035 §30.7, F6). Every CPM
recalculation now stamps the plan's `schedule_computed_at` freshness cursor, and the schedule summary
read tells a planner whether their plan is **stale** relative to its cross-plan upstreams — so they know
to run a programme recalculate. Pull-only (no background push job); the pure engine is untouched.

- **API (`@repo/api`)** — `recalculatePlan` stamps `schedule_computed_at = now()` inside the same
  engine-owned write path as the per-activity results (a raw `UPDATE plans …`, so it does **not** bump
  the plan's optimistic `version`/`updated_at`, ADR-0022). Both the single-plan recalc and the programme
  solve (which loops that unit, upstream-first) stamp every plan they write. `GET …/schedule/summary`
  computes staleness **on read**: guarded on the plan having ≥1 cross-plan edge, it resolves the plan's
  upstream closure (reusing `resolveProgrammeOrder`) and compares each upstream's cursor against the
  plan's in one batched query — flagging the plan stale iff any upstream is newer (or the plan was never
  computed while an upstream has).
- **Types (`@repo/types`)** — two new **optional** fields on `PlanScheduleSummary`: `scheduleStale`
  and `staleUpstreamPlanIds`. They are **absent** for a plan with no cross-plan edges, so an ordinary
  single-plan summary response is byte-identical to before M2 (the parity gate holds). A programme
  recalculate — which recomputes the closure upstream-first — clears the staleness.
