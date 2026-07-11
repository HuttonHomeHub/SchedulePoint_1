# ADR-0025: Baselines — snapshot-copy model, one-active-per-plan invariant & server-side working-day variance

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** James Ewbank (with Claude Code)

## Context

SchedulePoint computes a live CPM schedule (M6, ADR-0022/0023) over real working-day
calendars (M5, ADR-0024), but has **no frozen plan of record** to compare it against.
Construction planners capture a **"Contract Baseline"** before mobilisation and later
need to answer, defensibly: **are we ahead or behind the committed plan, and by how
much?** Baselines are a **Must-have** (PROJECT_BRIEF §8/§11) and the spine of Journey 4
(§10). A baseline must remain a faithful historical record — it is a commercial and
contractual artefact — and **never auto-purges** (§13), even though the activities it
was captured from are soft-deleted for only 90 days and then hard-purged.

M7 must decide three load-bearing, cross-cutting things: (1) **what a baselined activity
is** — a copy or a reference to the live row; (2) **how "exactly one active baseline per
plan" is guaranteed** under concurrency; and (3) **where and in what unit variance is
computed**. Getting the date arithmetic wrong "erodes planner trust" (§17, the same
top-risk that governs the CPM engine), across plans that can hold 2,000 activities (the
performance NFRs: capture < 5s, variance < 300ms p95 at 2,000).

## Decision

1. **Snapshot-copy, not reference.** A `BaselineActivity` is a **self-contained copy** of
   the activity's identity (`code`, `name`, `type`, `duration_days`) and its captured CPM
   dates (`baseline_start`/`baseline_finish` = the captured early start/finish,
   `late_start`/`late_finish`, `total_float`, `is_critical`). `source_activity_id` is a
   **plain correlation UUID with NO foreign key**. The snapshot therefore survives the
   source activity's 90-day hard purge and stays faithful even if the live activity is
   later edited or deleted.

2. **One active baseline per plan, enforced in the database.** A partial unique index
   `uq_baselines_plan_active ON (plan_id) WHERE is_active = true AND deleted_at IS NULL`
   guarantees the invariant structurally, not just in code. `activate` clears the current
   active row then sets the target **in one transaction under the plan advisory lock**
   (the same lock as `ScheduleService.recalculate`, ADR-0022); the partial unique is the
   concurrency backstop. The plan's **first** baseline is captured active; later captures
   are inactive until explicitly activated. Deleting the active baseline leaves the plan
   with none active (variance is then hidden).

3. **Server-side variance in working days.** Variance is a dedicated read endpoint
   (`GET …/baselines/variance`) that joins the plan's live activities to the **active**
   baseline's snapshot on `source_activity_id` and computes start/finish/float variance in
   **working days on the plan's calendar**, reusing the engine's `workingDaysBetween`
   (ADR-0024). The sign convention is **positive = current later than baseline (behind)**.
   The baseline stores raw dates only; the working-day maths is computed on read.

4. **Capture is consistent, not necessarily fresh.** Capture snapshots the plan's
   **currently-persisted** computed activities (no forced recalculation) but **rejects** an
   empty or never-calculated plan (no active activities, or a null project finish) with
   `422 SCHEDULE_NOT_CALCULATED`; the UI surfaces `capturedAt` and a "recalculate first"
   hint so a stale capture is a conscious choice. The read is taken **inside the plan
   write-lock**, so a snapshot is never captured mid-recalculation.

## Alternatives considered

- **Reference model** (`BaselineActivity` foreign-keys the live `Activity`). Rejected: it
  breaks on activity edit (the baseline would silently change) and on the 90-day hard
  purge (the baseline would dangle or block the purge). A plan of record must be immutable
  and self-contained.
- **Client-side calendar-day variance** (subtract dates in the browser). Rejected: the
  client cannot do **working-day** maths (it lacks the plan calendar), and calendar-day
  variance is inconsistent with `total_float`/`lag_days`, which are working days. Raw
  dates are still exposed so a consumer could derive calendar-day diffs if ever needed.
- **Variance folded into the activities / schedule-summary response.** Rejected: it
  couples every activity read to baseline state, complicates caching, and is only
  meaningful when an active baseline exists. A dedicated, baseline-scoped read is cleaner.
- **Application-only one-active rule** (no DB constraint). Rejected: a race between two
  concurrent `activate` calls could leave two active baselines. The partial unique makes
  the invariant impossible to violate.

## Consequences

- **Positive.** Baselines are permanent, faithful, and independent of live-activity
  churn. The one-active invariant is guaranteed by the database. Variance is correct and
  consistent with the rest of the schedule domain (working days), computed once per read
  with the engine's own arithmetic. Reuse is high: auth/scope, the plan advisory lock, and
  the calendar factory are all existing seams.
- **Negative / cost.** Snapshot-copy duplicates activity rows per baseline (up to ~2,000
  per capture) — mitigated by a single batched `createMany` and the modest scale target.
  `source_activity_id` has no referential integrity by design, so an orphan snapshot
  (source purged) is expected and handled as a "removed" variance row, not an error.
- **Follow-ups / deferred.** The TSLD/Gantt variance **overlays** wait for the canvas
  milestone (M7 ships the data + table columns + management panel). Baseline **rename**
  (the `version` column is present to make it additive) and **baseline-vs-baseline**
  compare are out of scope for v1. Cross-plan/program baselines remain out (§20). The
  `HierarchyLifecycleService` gains a `'baseline'` cascade level so a plan/project/client
  delete soft-deletes contained baselines in the same batch.

## References

- Feature spec: [`docs/specs/baselines.md`](../specs/baselines.md) · Implementation plan:
  [`docs/plans/baselines.md`](../plans/baselines.md)
- Builds on: ADR-0012 (RBAC + resource scoping), ADR-0016 (identity & tenancy), ADR-0022
  (CPM execution & persistence — the plan advisory lock), ADR-0023 (CPM date convention),
  ADR-0024 (working-day calendars).
- PROJECT_BRIEF §8 (Must-have), §10 (Journey 4), §11, §13 (retention), §17 (trust risk).
