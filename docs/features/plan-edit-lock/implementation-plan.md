# Implementation Plan: Single-editor plan edit-lock with clean hand-off

- **Feature spec:** `docs/features/plan-edit-lock/feature-spec.md` (**awaiting approval**)
- **Status:** Draft — do not implement until the spec is approved
- **Owner:** TBD

## Breakdown

```mermaid
flowchart LR
  E[Epic: Collaborative editing safety] --> M1[M1 Lock core + write-gate]
  M1 --> M2[M2 Front-end pen UX]
  M2 --> M3[M3 Hand-off, override & enablement]
```

### Epic

**Collaborative editing safety** — deliver the brief's "single-editor plan lock
with clean hand-off" Must-have, the last precondition for enabling the built TSLD
editing surface (`VITE_TSLD_EDITING`). Roadmap theme: TSLD editing / concurrency.

---

### Milestone 1: Lock core + server-side write-gate (shippable slice)

**Outcome:** the API can acquire/heartbeat/release/request/handoff/take-over a plan
edit-lock and rejects structural writes from non-holders with a distinct **423** —
the single-writer invariant is server-authoritative. No UI yet; shippable and independently
testable (via API e2e). `main` stays releasable; nothing user-visible changes
because the front-end still doesn't call it and editing stays flag-off.

#### Feature: Lock domain + module

> **Description:** ADR-0028, the `PlanLock` table, the `plan-lock` module
> (controller→service→repository) with acquire/heartbeat/release/status, new
> permissions, and the 423 `LockedError` plumbing.
> **Complexity:** L
> **Dependencies:** existing plan advisory-lock helper, RBAC, error filter.
> **Risks:** acquire/steal races → serialise under the existing advisory lock;
> heartbeat write amplification → single-row conditional UPDATE, no advisory lock.
> **Testing:** unit (state machine: free/held/expired/mine/steal), API e2e
> (acquire/contend/heartbeat/release/expiry).

##### Task 1.1 — ADR-0028 + shared types & 423 plumbing (≈ one PR)

- **Description:** author `docs/adr/0028-plan-edit-lock.md` from the spec sketch;
  add `LockedError` (→ 423) to `common/errors/domain-errors.ts` and the
  `all-exceptions.filter.ts` `domainStatus`/`statusCode` map (`423 → 'LOCKED'`);
  add `LockStatus` DTO + error `reason` constants to `@repo/types`.
- **Complexity:** S
- **Dependencies:** none (spec approved).
- **Risks:** filter change touches a shared path → cover with a filter unit test.
- **Testing:** unit for the new mapping; type build for `@repo/types`.
- **Development steps:**
  1. Write ADR-0028; update `CLAUDE.md` §16 ADR list.
  2. Add `LockedError` + filter mapping (+ test).
  3. Add shared `LockStatus`/reason types; `pnpm -F @repo/types build`.

##### Task 1.2 — `PlanLock` model + migration

- **Description:** add the `PlanLock` Prisma model + `Plan.planLock?` back-relation;
  generate the migration (PK `plan_id`, `@@index([organization_id])`, `onDelete`
  per hierarchy conventions). Include the nullable peer-request columns
  `requested_by_user_id` / `requested_at` (Q-A hand-off).
- **Complexity:** S
- **Dependencies:** 1.1.
- **Risks:** wrong `onDelete`/cascade vs soft-delete conventions → **design with
  the database-architect agent** before writing the migration.
- **Testing:** migration applies on a clean DB; Prisma client generates.
- **Development steps:**
  1. database-architect review of the schema delta.
  2. Edit `schema.prisma`; `prisma migrate dev`.
  3. Update `docs/DATABASE.md`.

##### Task 1.3 — Permissions + repository + service (acquire/heartbeat/release/status/request/handoff/takeover)

- **Description:** add `plan:acquire_lock` (Planner+Admin), `plan:request_control`
  (Planner+Admin) and `plan:override_lock` (Admin) to `org-permissions.ts`; build
  `PlanLockRepository` and `PlanEditLockService` copying the reference template's
  controller→service→repository shape. Acquire/steal/request/handoff run under
  `acquirePlanWriteLock`; heartbeat is a conditional single-row UPDATE; expiry
  evaluated against `now()`; holder = user. **Peer hand-off (Q-A):** `request`
  stamps `requested_by`/`requested_at`; `handoff` transfers to the pending
  requester; `takeover` succeeds for `plan:override_lock` (immediate) or for
  `plan:request_control` once grace has elapsed / the holder is inactive. Grace &
  inactive thresholds are server config.
- **Complexity:** M
- **Dependencies:** 1.1, 1.2.
- **Risks:** self-lockout across tabs → holder keyed by user, acquire is
  re-entrant for the same user; steal/request race → advisory lock; premature
  peer take-over → server-side grace/inactive check, never client-trusted.
- **Testing:** unit for every transition incl. expired-reclaim, live-steal reject,
  same-user re-acquire, `PLAN_EDIT_LOCK_LOST` on heartbeat rowcount 0, request →
  premature-takeover reject → post-grace takeover, holder-inactive takeover,
  handoff clears request, request cleared on holder change.
- **Development steps:**
  1. Extend `org-permissions.ts` + its tests.
  2. Repository (upsert-under-lock, conditional heartbeat, request/handoff/takeover,
     status read, delete).
  3. Service with scope + permission checks, grace/inactive policy, structured
     audit logs.

##### Task 1.4 — `PlanLockController` + OpenAPI + API e2e

- **Description:** GET/POST/heartbeat/DELETE plus `request`/`handoff` `edit-lock`
  endpoints with standard envelopes and Swagger annotations (incl. 423).
- **Complexity:** M
- **Dependencies:** 1.3.
- **Risks:** IDOR → org scope resolved from caller memberships, never input.
- **Testing:** Supertest e2e — acquire, contend (423 held), heartbeat renew/lost,
  release, expiry-reclaim, request → premature-takeover 423 → post-grace takeover
  (Planner), handoff, immediate override (Admin) vs premature-takeover 403/423
  matrix, anti-IDOR 404.
- **Development steps:**
  1. Controller + module wiring.
  2. e2e suite against real Postgres.
  3. Update `docs/API.md`; add changeset.

#### Feature: Write-gate on structural writes

> **Description:** inject `assertHoldsPen` into the activity, dependency, and
> schedule write paths so non-holders get 423, distinct from the 409 optimistic
> conflict. Progress path and reads stay exempt.
> **Complexity:** M
> **Dependencies:** Lock module (1.3).
> **Risks:** check-then-write steal race → hard integrity stays with optimistic
> `version`; for graph writes assert inside the advisory-lock txn. Missing an
> endpoint → enumerate against the spec's gated-write list; test each.
> **Testing:** API e2e per gated endpoint: holder→200/201, non-holder→423,
> holder+stale version→409; progress→200 regardless of pen.

##### Task 1.5 — `assertHoldsPen` + wire into write services

- **Description:** expose `PlanEditLockService.assertHoldsPen(principal, planId,
tx?)`; call it after the existing permission/scope checks in `ActivitiesService`
  (create/update/delete/restore/positions), `DependenciesService`
  (create/update/delete), and `ScheduleService.recalculate` (inside its advisory-
  lock txn). Leave `updateProgress` and plan-metadata `update` ungated. **Ship it
  behind `PLAN_EDIT_LOCK_ENFORCED` (default off)** so the gate is inert and cannot
  423 the already-shipped, flag-on activities-table / dependency / recalculate flows
  (which don't acquire a lock yet); ops enable it once M2/M3 acquire the pen.
- **Complexity:** M
- **Dependencies:** 1.3, 1.4.
- **Risks:** subtle coupling / circular module deps → export the service via the
  lock module; inject read-only.
- **Testing:** e2e matrix above; a regression test asserting progress is never
  gated and 423≠409.
- **Development steps:**
  1. Add `assertHoldsPen`; export from the lock module.
  2. Inject + call in each write service (gated list only).
  3. e2e matrix; update `docs/API.md` gated-endpoint 423 notes; changeset.

---

### Milestone 2: Front-end pen UX (shippable slice)

**Outcome:** on the (still flag-off) plan screen a Planner can Start/Stop editing,
sees who holds the pen, heartbeats while holding, and editing affordances are
gated on holding it. Distinct 423 handling drops to read-only. Ships behind the
existing flag; `main` releasable.

#### Feature: `features/plan-lock` + plan-detail integration

> **Description:** the lock query (poll + focus refetch), acquire/release/heartbeat
> hooks, the banner/controls component, and gating the editing affordances +
> distinct 423 handling in `plan-detail.tsx`.
> **Complexity:** L
> **Dependencies:** M1.
> **Risks:** heartbeat/leak on unmount → interval cleanup + `beforeunload`
> `sendBeacon` release; flaky poll in tests → deterministic query mocks.
> **Testing:** component (each lock state, gating), a11y (axe + keyboard on
> banner/controls/confirm), Playwright hand-off journey.

##### Task 2.1 — Lock query + mutation hooks

- **Description:** `usePlanEditLock` (interval + `refetchOnWindowFocus`),
  `useAcquireLock`/`useReleaseLock`/`useLockHeartbeat` (interval-while-holding;
  release-on-unmount + `beforeunload` `sendBeacon`).
- **Complexity:** M
- **Dependencies:** 1.4.
- **Risks:** double-acquire on focus → guard by current `isMine`.
- **Testing:** hook unit tests (mocked client + timers).
- **Development steps:** client methods → hooks → tests.

##### Task 2.2 — `EditLockBanner`/`EditLockControls` component

- **Description:** design-system component covering free-can-edit / holding /
  held-by-other / expired-reclaimable, with relative "active <time>". Polite
  live-region; keyboard-operable; visible focus.
- **Complexity:** M
- **Dependencies:** 2.1.
- **Testing:** component + axe + keyboard tests; UX + accessibility reviewers.

##### Task 2.3 — Gate affordances + distinct 423 handling in `plan-detail.tsx`

- **Description:** `holdsPen` derives `canEdit` for `TsldPanel` and the other
  editing affordances; `RecalculateButton` gated too; progress affordances
  unchanged. Extend the conflict-banner path so `LOCKED` drops to read-only,
  invalidates the lock query, and shows distinct copy from 409.
- **Complexity:** M
- **Dependencies:** 2.1, 2.2, 1.5.
- **Risks:** conflating 409 and 423 UX → separate branches + tests.
- **Testing:** component tests for gating + both banners; changeset.

---

### Milestone 3: Peer hand-off, override & enablement readiness

**Outcome:** peer Planner request-control **and** Org-Admin immediate take-over
work end-to-end; the full hand-off journey is proven; the flag's _concurrency_
precondition is formally satisfied (flipping it on in prod still awaits the
separate a11y gate).

#### Feature: Request-control + override + hand-off journey + docs

> **Description:** peer "Request control" → holder "Hand over / Keep" → grace →
> "Take over now"; Admin immediate "Take over" (confirm + audited); displaced-holder
> read-only demotion; Playwright multi-actor journeys; and the enablement paperwork.
> **Complexity:** M
> **Dependencies:** M2.
> **Risks:** enabling the flag prematurely → keep it off; only record that the
> concurrency precondition is met, referencing TECH_DEBT #25 for the a11y gate.
> **Testing:** Playwright (multiple contexts): peer request → grace → take-over;
> holder hand-over; Admin immediate steal; each demotes the prior holder and 423s
> their next write; expiry-reclaim journey.

##### Task 3.1 — Request-control + hand-off + take-over UI

- **Description:** on a held plan, a Planner sees **Request control**; the holder
  sees a **Hand over / Keep editing** prompt (from the pending request surfaced in
  heartbeat/poll); once grace elapses the requester sees **Take over now**. Org
  Admins get an immediate **Take over** with a confirm dialog. All wired to
  `request` / `handoff` / acquire `{ takeover: true }`; audited server-side (1.3).
- **Complexity:** M · **Dependencies:** 2.2, 2.3 · **Testing:** component + a11y
  (live-region for the incoming request; keyboard-operable controls + confirm).

##### Task 3.2 — Hand-off e2e/Playwright journeys

- **Description:** multi-actor Playwright journeys (peer request → grace →
  take-over, holder hand-over, admin immediate steal, expiry-reclaim) incl. a11y
  checks.
- **Complexity:** M · **Dependencies:** 3.1 · **Testing:** Playwright + axe.

##### Task 3.3 — Enablement readiness + docs rollup

- **Description:** update `env.ts` comment + `docs/plans/tsld-canvas.md` to record
  the edit-lock precondition as met; cross-link TECH_DEBT #25 (a11y gate still
  gates the flag); finalise `CLAUDE.md`/`ROADMAP.md`/`API.md`/`DATABASE.md`.
- **Complexity:** S · **Dependencies:** 3.2 · **Testing:** docs/lint; changeset.

## Sequencing & slices

M1 (backend authority) → M2 (front-end pen UX) → M3 (hand-off + enablement).
Each milestone keeps `main` releasable: M1 is inert until the front-end calls it;
all editing UI stays behind `VITE_TSLD_EDITING` throughout. Within M1, 1.1→1.2→1.3
→1.4 then the write-gate 1.5. Undo/redo is **out of scope** (separate feature).

## Definition of Done (per task)

Each task's PR meets the Feature Completion Criteria in `docs/PROCESS.md` (code,
tests ≥ 80% changed-line, docs/ADR, security review, performance, accessibility,
Docker build, CI green, changeset, version impact). **Recommended reviewers:**
database-architect (1.2), security-reviewer (1.3–1.5: authz/scope/IDOR + audited
override), api-reviewer (1.4–1.5: envelopes/status/423), backend-performance-
reviewer (heartbeat/poll cost), component- + accessibility- + ux-reviewer (2.2–2.3,
3.1), test-engineer (e2e/Playwright matrices).

## Risks & assumptions (rollup)

| Risk / assumption                                           | Likelihood | Impact | Mitigation                                                                                                       |
| ----------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Steal/acquire race corrupts lock state                      | Low        | High   | Serialise acquire/steal under the existing plan advisory lock; unit + e2e                                        |
| Heartbeat write amplification at scale                      | Low        | Med    | Single-row conditional UPDATE, no advisory lock; bounded cadence (30 s)                                          |
| 423 handling conflated with 409 in the UI                   | Med        | Med    | Distinct `LockedError`/reason + separate banner branches + tests                                                 |
| Displaced holder loses unsaved work on steal                | Low        | Med    | Edits are per-action server round-trips; 423 non-destructive, no replay                                          |
| Flag enabled before the separate a11y gate                  | Med        | Med    | Keep flag off; 3.3 records only the concurrency precondition; TECH_DEBT #25                                      |
| Peer take-over grace/inactive logic mis-times a steal (Q-A) | Low        | Med    | Server-authoritative `now()−requested_at` under the advisory lock; never client-trusted; unit + e2e grace matrix |
| Premature/racing peer take-over corrupts hand-off state     | Low        | High   | Request/handoff/takeover share the acquire advisory-lock section; request cleared on every holder change         |
