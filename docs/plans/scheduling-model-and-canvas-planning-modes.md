# Implementation Plan: Scheduling model & canvas planning modes

- **Feature spec:** `docs/specs/scheduling-model-and-canvas-planning-modes.md`
- **Draft ADR:** `docs/adr/0033-scheduling-modes-and-canvas-planning.md`
- **Status:** Approved — in delivery (M0 ✅ shipped, M2 ✅ shipped; M1 held for explicit sign-off)
- **Owner:** _TBD_

> Sequenced as thin vertical slices behind `VITE_SCHEDULING_MODES` (default-off,
> `flagDefaultOff` norm; layered on `VITE_CANVAS_WORKSPACE`/`_TOOLBAR`/`_AUTHORING`).
> Each milestone keeps `main` releasable and flag-off is today's behaviour
> byte-for-byte. Milestones deliberately isolate the two **breaking/irreversible**
> changes — the mandatory-start migration (M1) and the drag-semantics change (M3)
> — so each can be reviewed and gated on its own.

## Breakdown

```mermaid
flowchart LR
  E[Epic: Faithful GPM scheduling model] --> M0[M0 Foundations] --> M1[M1 Mandatory project start] --> M2[M2 Navigation vs data split] --> M3[M3 Visual mode + conflicts] --> M4[M4 Late overlay] --> M5[M5 Hardening & enablement]
```

### Epic

**Faithful GPM scheduling model** — de-overload `Plan.plannedStart` and give
planners real Early-Start / Visual-Planning modes with logic-aware conflict cues,
delivering the product's Graphical Path Method promise (PROJECT_BRIEF §1, §8, §11).

---

## Milestone 0 — Foundations (schema, engine, flag) — no user-visible change — ✅ shipped

**Outcome:** the data model, engine conflict computation, and flag exist; nothing
changes in the UI yet. Ships dark.

#### Feature: Data model + two-pass engine (pure-network + effective-Visual)

> **Description:** add `Plan.schedulingMode`, `Activity.visualStart` (input), and the
> engine-owned `Activity.visualEffectiveStart/Finish`, `visualConflict`,
> `visualDriftDays`; add the **effective-Visual forward-only pass** (CQ-5,
> owner-ratified) that honours `visualStart` exactly, pushes unplaced successors, and
> flags infeasible placements; extend the batched write. The **pure-network pass is
> unchanged.** Backfill of `plannedStart` + its NOT-NULL constraint are deferred to
> **M1** (isolated, reviewable).
> **Complexity:** XL
> **Dependencies:** none (additive columns).
> **Risks:** the second pass could regress the pure CPM outputs → mitigate by
> asserting golden-suite parity is unchanged and that the pure pass never reads
> `visualStart`; propagation subtlety (SQ-b: feasible vs illegal finish) → dedicated
> unit cases.
> **Testing:** engine unit tests (pure pass parity unchanged; effective pass: placed
> honoured exactly, unplaced successors pushed, conflict/drift correctness,
> conflicted-predecessor pushes from feasible finish); repository test that the write
> still leaves `version`/`updated_at` untouched (ADR-0022) while adding the new
> engine-owned columns.

##### Task 0.1 — Prisma schema + additive migration (design with **database-architect**)

- **Description:** add `SchedulingMode` enum + `plans.scheduling_mode`
  (default `EARLY`, NOT NULL); `activities.visual_start` (date, nullable, input);
  engine-owned `activities.visual_effective_start`, `visual_effective_finish`
  (date, nullable), `visual_conflict` (bool, default false), `visual_drift_days`
  (int, nullable). **No** `planned_start` change yet.
- **Complexity:** M
- **Dependencies:** none
- **Risks:** column defaults on a large table → additive/nullable-or-defaulted, safe.
- **Testing:** migration applies clean; Prisma client typechecks; seed still runs.
- **Development steps:**
  1. Edit `apps/api/prisma/schema.prisma` (enum + columns, snake_case `@map`, `@db.Date`).
  2. `prisma migrate dev`; verify generated SQL is additive.
  3. Update `docs/DATABASE.md`; add a changeset.

##### Task 0.2 — Engine: effective-Visual forward pass + conflict/drift

- **Description:** in `engine/compute.ts`, add a **second forward-only** topological
  pass (Visual mode) over the already-built graph. Per activity in `order`:
  `effectiveLogicEarliest = clampForwardStart(constraint, max(0, maxₑ
forwardBound(e, pred.propStart, pred.propFinish, D)))`;
  `displayStart = visualStart ?? effectiveLogicEarliest`;
  `propStart = max(displayStart, effectiveLogicEarliest)` (feasible finish for
  successors — SQ-b); `visualConflict = (visualStart set && visualStart <
effectiveLogicEarliest) || breaksConstraint`;
  `visualDriftDays = visualStart − earlyStart` (pure-network). Map offsets to
  inclusive dates via the calendar port; emit `visualEffectiveStart/Finish`,
  `visualConflict`, `visualDriftDays`. The **pure-network forward/backward passes are
  untouched** and still ignore `visualStart`.
- **Complexity:** L
- **Dependencies:** 0.1 (types)
- **Risks:** the effective pass leaking into pure outputs → unit test asserts
  identical `early*/late*/float` with and without `visualStart`; propagation from a
  conflicted predecessor must use the **feasible** finish (SQ-b), covered by a
  dedicated case.
- **Testing:** `compute.spec.ts` cases: placed-later → successors pushed, no
  conflict; placed-earlier-than-feasible → conflict, bar not clamped, successors
  pushed from feasible finish; placed successor stays put; constraint-violating
  placement → conflict; null `visualStart` → renders at effective-earliest, no
  conflict; **golden-suite parity for the pure pass intact**.
- **Development steps:**
  1. Extend `EngineActivity` (`types.ts`) with `visualStart`; extend `EngineResult`
     with the effective/conflict/drift fields.
  2. Implement the effective-Visual pass in `compute.ts` (reuse `graph.order`,
     `graph.incoming`, `forwardLowerBound`, `clampForwardStart`).
  3. Unit tests + pure-pass parity assertions.

##### Task 0.3 — Persist effective/conflict/drift (extend the `unnest` write)

- **Description:** extend `ScheduleRepository.writeResults` to also set
  `visual_effective_start`, `visual_effective_finish`, `visual_conflict`,
  `visual_drift_days` in the same single `unnest` UPDATE, still touching **no**
  `version`/`updated_at`/`updated_by`; project `visualStart` into
  `ScheduleActivityRow` and `toEngineActivity`; add `conflictCount` to the summary
  - `summarise` aggregate.
- **Complexity:** M
- **Dependencies:** 0.2
- **Risks:** row-count invariant (`updated !== results.length`) must still hold with
  the wider column set.
- **Testing:** repository/service e2e — recalc sets effective/conflict/drift columns;
  version untouched; `summarise` returns `conflictCount`.
- **Development steps:**
  1. Extend `schedule.repository.ts` load projection + `writeResults` arrays/SQL
     (four more `unnest` columns).
  2. Extend `schedule.service.ts` mapping + summary; log `conflictCount`.
  3. Extend `PlanScheduleSummary` type + DTO; tests.

##### Task 0.4 — Feature flag `VITE_SCHEDULING_MODES`

- **Description:** add the default-off flag (`flagDefaultOff`) in
  `apps/web/src/config/env.ts` + `.env.example`, gated on the canvas host flags
  like `CANVAS_AUTHORING_ENABLED`.
- **Complexity:** S
- **Dependencies:** none
- **Testing:** unit: flag off ⇒ host behaviour unchanged.

---

## Milestone 1 — Mandatory, editable project start (Sub-feature 2)

**Outcome:** a plan cannot exist without a start; the anchor-to-today hack is gone.
This milestone contains the one **irreversible data migration** — reviewed alone.

#### Feature: Required `plannedStart`

> **Description:** backfill null starts (CQ-6), make `planned_start` NOT NULL,
> require it on create (form + DTO), forbid clearing it on update, remove the
> ADR-0032 M1 "anchor to today / first-draw pins start" special-case.
> **Complexity:** L
> **Dependencies:** M0 (migration baseline).
> **Risks:** backfill picks a wrong date → mitigate with the documented CQ-6 chain,
> per-plan logging, and a dry-run count before the NOT-NULL step; irreversibility →
> the NOT-NULL and backfill run in one migration with the backfill first.
> **Testing:** migration test (nulls backfilled, then NOT NULL holds); API e2e
> (create without start → 422; PATCH null → 422); web form validation; e2e journey.

##### Task 1.1 — Backfill + NOT NULL migration (design with **database-architect**)

- **Description:** data migration: for each plan with null `planned_start`, set it
  to the CQ-6 chain (earliest active `constraint_date` → earliest `actual_start` →
  plan `created_at::date` → today); then `ALTER … SET NOT NULL`.
- **Complexity:** M
- **Dependencies:** M0
- **Risks:** long-running on large data → single UPDATE with correlated subquery;
  wrap in the migration transaction.
- **Testing:** migration integration test across the CQ-6 fallbacks.
- **Steps:** author raw SQL migration; log affected count; update `docs/DATABASE.md`.

##### Task 1.2 — API: require start on create, forbid null on update

- **Description:** `CreatePlanDto.plannedStart` becomes required (`@IsCalendarDate`,
  not optional, 422 `PLAN_START_REQUIRED`); `UpdatePlanDto` rejects explicit `null`.
- **Complexity:** S
- **Dependencies:** 1.1
- **Testing:** Supertest — create-without-start 422; update-to-null 422; happy paths.

##### Task 1.3 — Web: required start in the plan form

- **Description:** `plan-schemas.ts` `plannedStart` required with a friendly
  message; wire the create/edit form; ensure the explicit control PATCHes `version`.
- **Complexity:** S
- **Dependencies:** 1.2
- **Testing:** form unit test; e2e create journey requires a start.

##### Task 1.4 — Remove the anchor-to-today special-case

- **Description:** in `use-plan-workspace-model.ts`, delete the `!plannedStart`
  branch in `onTsldCreate` (the `setPlanStart(todayIso)` pin) and the null-start
  guards now that start is guaranteed; `onTsldReposition`'s `!plannedStart` guard
  becomes unreachable (assert instead). Keep flag-off path byte-for-byte until
  `VITE_SCHEDULING_MODES` gates it.
- **Complexity:** M
- **Dependencies:** 1.1–1.3
- **Risks:** ADR-0032 relied on the display anchor → the amendment is recorded in
  ADR-0033; the render gate (`dataDate !== null`) now always true for saved plans.
- **Testing:** unit tests for the simplified callbacks; e2e unaffected.

---

## Milestone 2 — Navigation vs data-edit split (Sub-feature 1) — ✅ shipped

**Outcome:** the canvas date picker no longer edits the schedule; a "Go to date"
control pans the viewport (ephemeral, CQ-1), and an explicit "Project start"
control owns `plannedStart`.

> **Delivered** flag-off (behind `VITE_SCHEDULING_MODES`): `goToDate(iso)` on the
> canvas handle + the pure `panToDate` helper (2.1); a "Go to date" navigation
> popover and a labelled "Project start" data control replacing the single
> "Timeline start" picker flag-on (2.2). The Project-start control still permits
> clearing (`plannedStart` stays nullable until M1); the non-null guarantee 2.2
> assumes lands with the M1 migration + required DTO.

#### Feature: Go-to-date + explicit Project start

> **Description:** split the conflated inline picker into an ephemeral viewport
> jump and a clearly-labelled data control.
> **Complexity:** M
> **Dependencies:** M1 (start is guaranteed non-null).
> **Risks:** users accustomed to the old picker moving the schedule → the Project
> start control is explicitly labelled as re-anchoring; flag-gated rollout.
> **Testing:** unit (Go-to-date issues no mutation); e2e (jump makes no request,
> schedule unchanged); axe on both controls.

##### Task 2.1 — Canvas `goToDate` viewport command

- **Description:** add a `goToDate(iso)` method to the canvas control handle
  (imperative, like `zoomToPreset`) that pans so the date sits at the left edge;
  no fetch, no state persisted (CQ-1 default).
- **Complexity:** M
- **Dependencies:** M0 flag
- **Testing:** canvas unit test — viewport transform only, no callbacks fired.

##### Task 2.2 — Toolbar: replace the picker; add Project start control

- **Description:** in `use-tsld-toolbar-context.tsx`, repurpose the date control:
  the navigation popover calls `goToDate`; a separate, labelled **Project start**
  control keeps `setPlannedStart` (pen-gated write, non-null only). Read-only users
  see static text for both.
- **Complexity:** M
- **Dependencies:** 2.1
- **Testing:** toolbar unit tests; a11y labels distinct; e2e.

---

## Milestone 3 — Visual Planning mode + conflict cues (Sub-feature 3, core)

**Outcome:** a planner can author in Visual Planning — bars stay where placed, no
implicit constraints, conflicts flagged. Contains the **drag-semantics change**.

#### Feature: Scheduling mode + Visual placement (with successor push)

> **Description:** plan-level `schedulingMode`; Visual-mode bar rendering from the
> engine's `visualEffective*`; Visual drag writes `visualStart` (no SNET) and the
> recalc's effective-Visual pass **pushes unplaced successors**; conflict cue.
> **Complexity:** XL
> **Dependencies:** M0 (schema + two-pass engine), M1 (start), M2 (controls).
> **Risks:** the drag meaning changes per mode → clear mode indicator + the
> amendment recorded in ADR-0033; correctness → pure-pass parity tests from M0;
> successor-push determinism → SQ-b engine cases.
> **Testing:** web unit (render source per mode; Visual drag → `visualStart`, no
> constraint; successor shift; conflict cue + a11y text); API e2e (mode + visualStart
> writes, gating); Playwright build-in-Visual journey with successor push; axe.

##### Task 3.1 — API: `schedulingMode` + `visualStart` writes

- **Description:** add `schedulingMode` to create/update plan DTO+service; add
  `visualStart` to `UpdateActivityDto`+service (Planner-owned input; feeds only the
  effective-Visual pass, never the pure-network pass; not on the progress path);
  extend plan/activity response DTOs + `@repo/types`.
- **Complexity:** M
- **Dependencies:** M0
- **Testing:** Supertest — mode/visualStart set + read; progress path rejects
  visualStart; gating (403/423/409); OpenAPI updated.

##### Task 3.2 — Web: mode-aware bar rendering

- **Description:** in `render-model.ts`/`to-render-model.ts`, source bar x from the
  active mode's **persisted** dates: Early→`earlyStart/earlyFinish`,
  Visual→`visualEffectiveStart/visualEffectiveFinish`. **No client-side seeding**
  (CQ-9 revised): unplaced activities already carry an effective-earliest from the
  engine, so successor push is server-computed and simply rendered.
- **Complexity:** L
- **Dependencies:** 3.1, M0 engine
- **Testing:** render-model unit tests per mode (Visual reads `visualEffective*`);
  empty/never-calculated cases.

##### Task 3.3 — Web: mode selector + Visual-drag semantics (writes `visualStart`)

- **Description:** add the Mode selector toolbar item (pen-gated). Branch
  `onTsldReposition`: in Visual mode a day-drag PATCHes `visualStart`
  (+`laneIndex`), **no** constraint write, then `notify()` — the coalesced recalc
  runs the effective-Visual pass, which pins this bar and **pushes its unplaced
  successors** (server-side; the client just re-renders `visualEffective*`). In Early
  mode keep today's SNET path. `onTsldCreate` in Visual mode sets `visualStart` at
  the drop instead of SNET.
- **Complexity:** L
- **Dependencies:** 3.1, 3.2
- **Risks:** the two drag paths must not leak → unit tests per mode assert exactly
  one write shape; the optimistic ghost should hold the just-placed bar at its drop
  while the debounced recalc lands the successor push.
- **Testing:** unit tests for both callbacks × both modes; e2e that a Visual placement
  shifts an unplaced successor.

##### Task 3.4 — Web: conflict cue (render + a11y)

- **Description:** carry `visualConflict`/`visualDriftDays` into the render model;
  paint a token-based warning badge/icon (not colour-only) on conflicting bars;
  append accessible text in `render/a11y.ts` ("placed N working days before its
  earliest feasible start"). Show float (pure-network) and drift as **separate**
  read-outs (SQ-c).
- **Complexity:** M
- **Dependencies:** 3.2, M0 engine
- **Testing:** paint/a11y unit tests; axe; contrast check.

---

## Milestone 4 — Late-Start analysis overlay (Sub-feature 3, CQ-2)

**Outcome:** a read-only toggle shifts bars to late dates for float analysis.

#### Feature: Late overlay

> **Description:** a client-only `View` toggle; when on, bars render from
> `lateStart`/`lateFinish` and all edit gestures are suppressed.
> **Complexity:** M
> **Dependencies:** M3 (render sourcing already parameterised by mode).
> **Risks:** overlay + Visual interplay → overlay wins for display, editing off.
> **Testing:** unit (bar source = late dates; gestures disabled); e2e; axe.

##### Task 4.1 — Overlay view-state + toggle

- **Description:** add a `viewToggles` entry; overlay is per-user client state
  (not persisted). While on, `canvasUi.mode`-driven editing is suppressed.
- **Complexity:** M
- **Dependencies:** M3
- **Testing:** unit + e2e.

---

## Milestone 5 — Hardening & enablement

**Outcome:** quality gates green; flag flipped default-on per the rollout norm.

#### Feature: Reviews, docs, enablement

> **Description:** run the specialist reviewers; write docs/ADR amendment notes;
> add the flag-on Playwright suite to CI; flip `VITE_SCHEDULING_MODES` default-on.
> **Complexity:** M
> **Dependencies:** M1–M4
> **Testing:** full flag-on e2e journey (Go-to-date no-op; required start; build in
> Visual; Late overlay; conflict clears on nudge); perf check at 2,000 activities
> (mode switch < 100 ms, draw within ADR-0026 budget); axe across new controls.
> **Steps:** address review findings; update `docs/API.md`, `docs/DATABASE.md`,
> `docs/FRONTEND_ARCHITECTURE.md`, `docs/UX_STANDARDS.md`, `docs/DESIGN_SYSTEM.md`;
> add amendment notes to ADR-0022/0023/0032; move ADR-0033 to Accepted; update the
> `CLAUDE.md` ADR list and `PROJECT_BRIEF` glossary; changeset (minor, pre-1.0).

## Sequencing & slices

M0 (dark foundations) → **M1 (mandatory start — isolated migration)** → M2 (nav
split) → **M3 (Visual mode — drag-semantics change, the core value)** → M4 (Late
overlay) → M5 (enablement). Each milestone is independently shippable behind
`VITE_SCHEDULING_MODES`; flag-off is today's behaviour byte-for-byte. The two
high-blast-radius changes (M1 migration, M3 drag semantics) are deliberately in
their own milestones for focused review. Recommended reviewers by milestone:
**database-architect** (M0/M1 schema+migration), **security-reviewer** +
**api-reviewer** + **backend-performance-reviewer** (M0/M1/M3 endpoints & engine
write), **component-reviewer** + **ux-reviewer** + **accessibility-reviewer** +
**performance-reviewer** (M2/M3/M4 canvas UI), **test-engineer** throughout.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in `docs/PROCESS.md`
(code, tests ≥80% changed lines, docs, security, performance, accessibility,
Docker build, CI green, changelog/changeset, version impact).

## Risks & assumptions (rollup)

| Risk / assumption                                                     | Likelihood | Impact | Mitigation                                                                                                                                                |
| --------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backfill assigns an unexpected start to an existing plan              | med        | med    | Documented CQ-6 chain; dry-run count + per-plan log before NOT NULL; single reviewed migration                                                            |
| `visualStart` leaks into the **pure-network** pass (early/late/float) | low        | high   | Two-pass split keeps the pure pass untouched; parity unit tests assert identical `early*/late*/float` with/without `visualStart`                          |
| Effective-Visual successor push implies an impossible sequence        | med        | med    | SQ-b: propagate from the **feasible** finish (`max(visualStart, effectiveEarliest)+D`), not the illegal one; dedicated engine cases; stay-and-flag (SQ-a) |
| Second (effective-Visual) pass blows the recalc budget                | low        | med    | One extra O(V+E) forward traversal reusing the built graph (SQ-f); perf check at 2,000 activities in M5                                                   |
| Drag-semantics change confuses users who learned drag=SNET            | med        | med    | Clear per-plan mode indicator; flag-gated; Early mode preserves old behaviour; ADR-0033 records the amendment                                             |
| Mode switch / Late overlay regress canvas perf at 2,000 activities    | low        | high   | Client re-render over loaded columns (no fetch); ADR-0026 draw-budget check in M5                                                                         |
| CQ answers change the model                                           | low        | high   | CQ-1..6 **ratified** (2026-07-14); residual **SQ-b flagged for owner** — confirm before M0 lands; other SQ defaults are conservative                      |
| Making `plannedStart` NOT NULL breaks a hidden null-tolerant path     | low        | med    | Grep for `plannedStart` null-branches (known: `onTsldCreate`, `onTsldReposition`, toolbar `hasDiagram`); remove in M1                                     |

```

```
