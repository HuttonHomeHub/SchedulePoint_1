# ADR-0028: Single-editor plan edit-lock (advisory lease + peer hand-off + write gate)

- **Status:** Accepted
- **Date:** 2026-07-11
- **Deciders:** Engineering
- **Related:** ADR-0012 (RBAC + resource scoping), ADR-0016 (roles/tenancy),
  ADR-0021 (plan advisory lock / DAG invariant), ADR-0022 (CPM execution &
  persistence — engine-owned columns), ADR-0026 (TSLD canvas). Feature spec:
  `docs/features/plan-edit-lock/feature-spec.md`.

## Context

SchedulePoint's on-canvas TSLD editing surface (create-by-drag, dependency-draw,
free-2D reposition, lane auto-pack, keyboard editing) is **built and reviewed**
but sits dormant behind the `VITE_TSLD_EDITING` flag, which is off by default
**specifically because there is no plan edit-lock** (see the block comment on
`TSLD_EDITING_ENABLED` in `apps/web/src/config/env.ts`). The brief makes a
"single-editor plan lock with clean hand-off" a **Must-have** (PROJECT_BRIEF §8),
and it is the single remaining precondition to shipping that finished editing
work.

Two concurrency mechanisms already exist and must be **composed with, not
replaced**:

| Layer         | Mechanism                               | Grain             | Purpose                                               |
| ------------- | --------------------------------------- | ----------------- | ----------------------------------------------------- |
| Integrity     | optimistic `version` → **409**          | per row           | prevents lost updates (the hard guarantee)            |
| Serialization | `pg_advisory_xact_lock` (ADR-0021/0022) | per plan, per txn | serialises graph writes / recalc within a transaction |

Neither answers the human-facing question **"who currently holds the pen?"**. The
interim posture — only the optimistic-lock 409 conflict banner — prevents lost
data but yields a collision-heavy experience with no notion of a current editor.

Two design questions were resolved with the product owner at approval:

- **Take-over policy (Q-A):** _any Planner_ may request and (after a grace window,
  or if the holder is inactive) take over a live lock — a graceful peer hand-off —
  **not** an Org-Admin-only steal. Org Admins additionally get an _immediate_
  override.
- **Recalc (Q-B) is pen-gated; the Contributor progress path (Q-C) is exempt.**

## Decision

Introduce a **third, distinct concurrency layer**: a per-plan **edit-lock lease**
with a server-authoritative **write gate**.

1. **`PlanLock` table** — one row per plan, PK `plan_id` (enforces one lock per
   plan). **Presence = held, absence = free.** Holder grain is the **user**
   (re-entrant across a user's own tabs — no self-lockout), keyed by
   `holder_user_id` (Better Auth id = TEXT). No lock columns on `Plan`: frequent
   heartbeat writes must not touch `Plan.version`/`updated_at` or contend with
   plan-metadata optimistic locking — the same derived-vs-edited separation
   ADR-0022 applies to engine-owned columns.

2. **Lease = heartbeat + TTL, plus explicit release.** A holder heartbeats on a
   fixed cadence (default 30 s) to extend `expires_at` (default TTL 120 s). Clean
   hand-off comes from the explicit release (button / `beforeunload`
   `sendBeacon`); crash recovery comes from the TTL backstop. An expired row
   (`expires_at < now()`) is treated as free and overwritten on the next acquire —
   **no sweeper**.

3. **423 `LockedError` write gate.** A new `LockedError` domain error maps to
   **HTTP 423 Locked** (`code: 'LOCKED'`), introduced so lock-precondition failures
   are **distinct on the wire and in the UI** from 409 optimistic conflicts.
   `PlanEditLockService.assertHoldsPen(principal, planId, tx?)` runs _after_ the
   existing scope/permission checks in every structural write path: activity
   create/update/delete/restore, positions batch, dependency create/update/delete,
   and `schedule.recalculate` (inside its advisory-lock txn). Reason codes:
   `PLAN_EDIT_LOCK_REQUIRED` (write without the pen), `PLAN_EDIT_LOCK_HELD`
   (contended acquire / premature take-over), `PLAN_EDIT_LOCK_LOST` (heartbeat or
   write after the lease was stolen or expired).

4. **Graceful peer hand-off (Q-A), modelled on the same row.** Two nullable
   columns — `requested_by_user_id`, `requested_at` — hold at most one pending
   request (newest wins), cleared on every holder change. A Planner with
   `plan:request_control` calls `request`; the holder sees it via heartbeat/poll
   and may `handoff`. If the holder neither hands off nor releases, a **take-over**
   (`acquire { takeover: true }`) is permitted once `now() − requested_at ≥
HANDOFF_GRACE_MS` (default 45 s) **or** the holder is inactive (last heartbeat
   older than the cadence + tolerance). An Org Admin with `plan:override_lock` may
   take over **immediately**, skipping the grace/handshake. "Grace elapsed" is a
   pure `now()` comparison evaluated on the take-over attempt — **no timers, jobs,
   or second table**.

5. **Acquire / request / handoff / take-over are serialised by the existing plan
   advisory lock** (ADR-0021 helper), so the read-decide-write on the lock row
   cannot interleave inconsistently. Heartbeat is a bare conditional single-row
   `UPDATE ... WHERE plan_id AND holder_user_id AND expires_at > now()` (rowcount 0
   ⇒ 423 `PLAN_EDIT_LOCK_LOST`) — **no advisory lock**, to keep the hot path cheap.

6. **Permissions (ADR-0012, deny-by-default).** `plan:acquire_lock` (Planner +
   Org Admin — acquire/heartbeat/release own lock, hand off to a requester);
   `plan:request_control` (Planner + Org Admin — request + post-grace take-over);
   `plan:override_lock` (Org Admin — immediate override + force-release). All
   evaluated in the plan's organisation (anti-IDOR). Every take-over is audited via
   structured logs (brief §13).

7. **Not gated:** the Contributor progress path (`activity:update_progress`), all
   reads, and plan-metadata `PATCH plans/:id` (guarded by optimistic `version`
   only). The pen guards the _on-canvas schedule model_, not progress reporting or
   plan metadata.

8. **Propagation is by polling** (TanStack Query interval + refetch-on-focus) —
   no websockets/Redis in v1.

9. **Staged rollout — the gate ships inert.** The `assertHoldsPen` write-gate is
   guarded by a server flag `PLAN_EDIT_LOCK_ENFORCED` (default **off**). Enforcing
   it unconditionally would 423 the _already-shipped, flag-on_ activities-table
   CRUD, dependency editor, and recalculate flows, which do not acquire a lock yet
   (only the TSLD canvas is behind `VITE_TSLD_EDITING`). So M1 lands the whole
   mechanism (endpoints, lease, write-gate, tests) dormant; ops flip enforcement on
   only once the front end acquires the pen across every editing entry point
   (edit-lock M2/M3). This keeps `main` releasable with no user-visible change.

   > **Update (2026-07-12) — web flags flipped ON by default.** All pre-enablement
   > gates are green (flag-on Playwright harness; a11y sign-off; the manual
   > cross-browser `Alt+←/→` history-suppression sweep passed on Firefox/Safari/Edge,
   > TECH_DEBT #25a). The two **web** flags — `VITE_PLAN_EDIT_LOCK` (pen) and
   > `VITE_TSLD_EDITING` (on-canvas editing) — now **default ON** in the shipped
   > bundle (`apps/web/src/config/env.ts`), with `=false` as the opt-out/rollback.
   > The server-side `PLAN_EDIT_LOCK_ENFORCED` **stays default-off** and remains the
   > single deliberate ops switch: enable it only once a bundle with the pen on is
   > live (so users are already acquiring the pen), never ahead of the web bundle.
   > The ordering below is unchanged — only its first step is now the default.
   > A CI baseline suite (`playwright.config.ts`) pins both web flags off to keep the
   > read-only / role-only paths covered; the flags-on surface is covered by
   > `playwright.edit.config.ts`.

## Alternatives considered

- **Lock columns on `Plan` (raw-SQL heartbeat bypassing `version`).** Every plan
  read carries lock columns and heartbeats keep writing the `Plan` row (row-lock
  contention with metadata edits). A separate table is cleaner and mirrors
  ADR-0022's derived-vs-edited split. _Rejected._
- **Lease-only (no explicit release) or release-only (no lease).** Lease-only
  leaves a just-departed editor's plan locked for a full TTL (poor hand-off);
  release-only never recovers from a crash. Both together give clean hand-off
  _and_ crash recovery. _Chosen._
- **Org-Admin-only live steal (the spec's original default).** Simpler, but forces
  a wait for an admin whenever a Planner steps away mid-edit without releasing.
  The product owner chose the peer request/grace/take-over model (Q-A). _Rejected
  in favour of the peer hand-off._
- **A guard/decorator (`@RequiresPlanEditLock`) instead of a service call.** A
  guard can't cheaply resolve the plan id for the _flat_ activity/dependency routes
  (id derives from the resource), and service-layer authority matches the codebase.
  _Rejected in favour of `assertHoldsPen` in the services._
- **Websockets / Redis pub-sub for realtime.** The right answer once multi-editor
  real-time collab lands (a brief Could-have), but disproportionate for a
  single-writer lock at v1 scale. Polling meets the ≤ 20 s propagation target with
  zero new infrastructure. _Deferred (documented escape hatch)._
- **A dedicated audit-log table for lock events.** v1 audits via structured logs;
  a queryable audit table remains future scope.

## Consequences

- **Three explicit concurrency layers** (integrity 409 / serialization advisory
  lock / coordination 423 lease), cleanly separated. Reviewers and future authors
  must keep them distinct — a 423 is _not_ a 409.
- **`VITE_TSLD_EDITING`'s concurrency precondition is removed**, unblocking the
  built editing surface. The ADR did not by itself flip the flag; the a11y
  pre-enablement gate (Alt+←/→ cross-browser check, TECH_DEBT #25a) has since
  passed, and as of 2026-07-12 the web flag (with `VITE_PLAN_EDIT_LOCK`) defaults ON
  — see the Update note under decision 9.
- **423 enters the API vocabulary.** Clients must branch on 423 vs 409 distinctly;
  the shared error `reason` union carries the specific lock condition.
- **Enforcement is a one-way switch tied to front-end readiness.** Because the gate
  ships behind `PLAN_EDIT_LOCK_ENFORCED` (off), turning it on is an ops action that
  must not precede the front end acquiring the pen on every editing entry point —
  otherwise the shipped activities-table/dependency/recalculate flows would 423.
- **Undo/redo** (a separate Must-have) is unblocked but explicitly out of scope —
  the edit-lock is its precondition (a coherent per-user undo stack assumes a
  single writer), shipped independently.
- A dedicated audit-log table and websocket propagation remain future work.

## References

- CLAUDE.md §12 (backend architecture), §14 (security), §16 (ADR list).
- `docs/features/plan-edit-lock/feature-spec.md`, `.../implementation-plan.md`.
- ADR-0021 (plan advisory lock), ADR-0022 (engine-owned columns / recalc),
  ADR-0012/0016 (RBAC + roles). `apps/web/src/config/env.ts`; `docs/TECH_DEBT.md` #25.
