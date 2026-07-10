# ADR-0022: CPM execution & persistence model (synchronous endpoint + engine-owned write)

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** James Ewbank (with Claude Code)

## Context

The CPM engine (ADR-0023) is a pure function: given a plan's activities, its
dependency edges, and a data date, it returns each activity's early/late dates,
total float, and critical flags. M6 has to decide **when** that computation runs
and **how** its results are stored, on a multi-tenant plan that can hold thousands
of activities.

Three forces shape the decision:

1. **The results share a table with user-edited data.** The engine-owned columns
   (`early_start`, `early_finish`, `late_start`, `late_finish`, `total_float`,
   `is_critical`, `is_near_critical`) live on `activities` alongside
   Planner-owned definition columns and Contributor-owned progress columns, each
   guarded by an optimistic-lock `version`. A schedule write must **not** bump
   `version` or `updated_at`, or it would spuriously conflict with a concurrent
   user edit and read as a user having changed the activity.
2. **Consistency under concurrency.** A recalculation reads a snapshot of the
   graph and writes derived values. It must not interleave with a dependency
   create (which changes the edge set, ADR-0021) or another recalculation on the
   same plan.
3. **Scale + the product steer.** The brief calls for a **live, synchronous**
   critical path in v1 (PROJECT_BRIEF §14) and sets performance targets
   (< 500ms at 500 activities, < 2s at 2,000).

## Decision

We will run the CPM engine **synchronously behind an explicit endpoint**, and
persist its output with an **engine-owned batched write that bypasses optimistic
locking**, all under the plan-scoped lock.

1. **Trigger — a synchronous explicit endpoint.** `POST
/organizations/:orgSlug/plans/:planId/schedule/recalculate` (permission
   `schedule:calculate`, Planner + Org Admin) computes and persists in-request and
   returns the plan summary. No auto-trigger on every edit, no background queue —
   both are additive later without changing this contract.
2. **One transaction under the plan-scoped lock.** The service resolves the org
   (404 anti-IDOR), checks `schedule:calculate` (403), loads the plan (404) and
   requires a `plannedStart` (422 `PLAN_START_REQUIRED`), then opens a transaction
   that: takes the **same** plan-scoped advisory lock the dependency cycle check
   uses (ADR-0021, via the shared `acquirePlanWriteLock` helper) → loads the
   plan's active activities and edges → runs the pure engine → writes the results
   → returns the summary. Sharing the lock key serialises a recalculation against
   dependency creates and other recalculations on the same plan; different plans
   never contend.
3. **Engine-owned batched write, bypassing optimistic locking.** The results are
   written in a **single raw `UPDATE … FROM unnest($1::uuid[], …)`** that sets
   **only the seven engine-owned columns**, keyed by activity id and re-asserting
   `plan_id`, `organization_id`, and `deleted_at IS NULL`. Because it is raw SQL,
   Prisma's `@updatedAt` does not fire and `version` is never referenced — a
   recalculation is invisible to optimistic locking and cannot masquerade as a
   user edit. One statement writes the whole plan (no N+1, no per-row round trip),
   which is what meets the performance NFR at 2,000 activities.
4. **Defensive DAG guard → loud 500.** ADR-0021 guarantees the graph is acyclic,
   so the engine's residual-cycle guard should be unreachable. If it ever throws
   `ScheduleGraphNotADagError`, the endpoint maps it to a distinct, alarm-worthy
   500 (a broken invariant), never a silent 2xx.

## Alternatives considered

- **Recompute on every write (dependency/activity change auto-triggers).**
  Keeps the schedule always-fresh, but couples every edit to a full-plan compute,
  multiplies write latency, and makes bulk edits pathological. Deferred — it can
  be layered on top of this endpoint later (call the same service) without a
  contract change.
- **Background queue (BullMQ, ADR-0009).** Right answer at large scale or for
  progress-aware re-forecasting, but adds a job, a worker, and eventual-consistency
  UX for a computation that is sub-second at the target sizes. Documented as the
  escape hatch when a plan outgrows the synchronous budget; not built now.
- **Persist via Prisma `updateMany` per distinct value / per row.** `updateMany`
  cannot set different values per row, so this degrades to N statements (N up to
  2,000) — fails the perf NFR and still risks touching `version`/`updated_at`.
  Rejected in favour of the single `unnest` write.
- **A separate `schedule_results` table (1:1 with activity).** Avoids the
  shared-table concern, but the columns already exist on `activities` (M3,
  reserved for exactly this), the TSLD canvas (M7) reads them per activity, and a
  join buys nothing here. Rejected as premature normalisation.

## Consequences

- A recalculation is a clean, explicit, permissioned action with a predictable
  cost; the reserved M3 columns populate and readers (activity responses, the
  summary endpoint, the M7 canvas) see the computed schedule.
- The engine-owned write provably leaves `version`/`updated_at`/`updated_by`
  untouched (verified by test), so it never collides with or impersonates a user
  edit — the core safety property of putting derived and edited data in one table.
- The plan-scoped lock gives a consistent snapshot and serialises per-plan writes
  with no cross-plan contention.
- **Scale ceiling / debt:** the synchronous path is bounded by the perf NFR; when
  a plan outgrows it (or progress-aware re-forecasting lands, needing heavier
  compute), the queued path above is the documented next step. Auto-trigger on
  write is a separate, additive follow-up. Both reuse this same service and lock.

## References

- ADR-0021 — the DAG invariant and the plan-scoped advisory lock this reuses.
- ADR-0023 — the CPM date convention the engine implements.
- ADR-0009 — background processing (the deferred queued path).
- [`docs/specs/cpm-engine.md`](../specs/cpm-engine.md) /
  [`docs/plans/cpm-engine.md`](../plans/cpm-engine.md) — the M6 spec & plan.
- PROJECT_BRIEF §14 (synchronous compute steer), §7/§14 (performance targets).
