---
'@repo/api': minor
'@repo/types': minor
---

Synchronous programme-recalc orchestration (inter-project M2, ADR-0045 §4 / ADR-0035 §30.8, F5). A new
endpoint recalculates a target plan's **upstream cross-plan closure** in dependency order so the target's
derived inter-project bounds (F4) read fresh upstream dates. The **pure CPM engine is untouched** and each
plan is recalculated with the **existing** single-plan recalc transaction — no recalc body is duplicated.

- **API (`@repo/api`)** — `POST …/plans/:planId/schedule/recalculate-programme` (`schedule:calculate`,
  Planner + Org Admin). A pure `resolveProgrammeOrder(targetPlanId, edges)` resolves the target's upstream
  closure in **topological order, upstream-first** (the target last), tie-broken by plan id so the order —
  and thus the per-plan advisory-lock acquisition order — is **stable and deadlock-free**. The
  orchestrator (`ScheduleService.recalculateProgramme`) loops the closure, invoking the shared single-plan
  recalc unit per plan (each its own ADR-0022 transaction + advisory lock + pen), so every downstream plan
  reads its upstreams' freshly-written dates. A residual plan-level cycle (unreachable given the F3 DAG
  invariant) fails loud (`ProgrammeCycleError` → alarm 500, nothing written).
- **Fail-fast pen pre-check (default, ADR-0045 CQ-3)** — before any write, the pen is asserted on **every**
  closure plan, **collecting all** blocked plan ids in one pass; if any is held by another editor the whole
  solve is refused with a single **423 `PROGRAMME_PLANS_LOCKED`** carrying the `blockedPlanIds` list —
  nothing is written. Inert unless `PLAN_EDIT_LOCK_ENFORCED` is on.
- **Result + roll-up** — the `200` response returns per-plan summaries (in recalculation order) plus a
  programme roll-up (`planCount`, and the summed **N32** `crossPlanUpstreamMissingCount`).
- **Types (`@repo/types`)** — `ProgrammeScheduleResult` / `ProgrammeSchedulePlanResult` and the
  `ProgrammeScheduleLockedDetails` (`PROGRAMME_PLANS_LOCKED`) 423 payload.

A programme with no cross-plan edges has a closure of just the target, so this is byte-identical to a
single-plan recalc; `main` stays releasable.
