---
'@repo/api': patch
'@repo/web': patch
---

feat: scheduling-modes M0 dark foundations (ADR-0033)

Additive, behind-the-flag foundations for the scheduling-modes feature — **no user-visible change**
(nothing sets `visual_start` yet and no UI reads the flag; existing plans recalc identically):

- **Schema (additive, reversible):** a `SchedulingMode` enum + `Plan.schedulingMode` (default `EARLY`),
  the Planner-owned `Activity.visualStart` placement input, and four engine-owned outputs
  (`visualEffectiveStart/Finish`, `visualConflict`, `visualDriftDays`) modelled like the CPM columns.
- **Engine:** a second, forward-only _effective-Visual_ CPM pass — honours each `visualStart` exactly,
  pushes successors from the feasible finish, and emits the conflict/drift outputs. The pure
  forward/backward pass is untouched, so `early*`/`late*`/float stay a pure function of the network
  (proven by a golden-parity test).
- **Recalc wiring:** `visual_start` feeds the engine and the four outputs are persisted by the same
  batched `unnest` UPDATE — still out of the optimistic-lock `version`/`updated_at` path.
- **Flag:** `SCHEDULING_MODES_ENABLED` (`VITE_SCHEDULING_MODES`, default-off), gated on the canvas host.

The mandatory-`plannedStart` migration and the UI (mode selector, Visual drag, Late overlay, Go-to-date)
land in later milestones.
