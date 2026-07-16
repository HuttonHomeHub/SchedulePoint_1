# Roadmap

> Product direction for **SchedulePoint** (see [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)
> for the full vision and MoSCoW scope). This tracks milestones at a coarse grain;
> per-feature specs/plans live in [`specs/`](specs/) and [`plans/`](plans/), produced
> via the delivery process ([`PROCESS.md`](PROCESS.md)).

## Purpose

Deliver a browser-native construction scheduler built around a **Time-Scaled Logic
Diagram (TSLD)**, to a consistent production-quality bar, in thin vertical slices that
keep `main` releasable.

## Delivered

- **M0 — Engineering foundation.** Turborepo + pnpm monorepo, strict TypeScript,
  lint/format, CI/CD (quality + template-verify + API/web e2e + CodeQL + release +
  GHCR image publishing), Docker, docs, ADRs, delivery process, agents, reference
  template.
- **Identity & tenancy.** Better Auth, `User`/`Organization`/`OrgMember`, org-scoped
  RBAC (Viewer/Contributor/Planner/Org Admin), members + invitations, onboarding +
  org switcher (ADR-0003/0012/0016).
- **Hierarchy.** Client → Project → Plan CRUD with soft-delete + cascade restore
  (recycle bin), web browse/CRUD.
- **Activities.** Activity model + CRUD, progress reporting (Contributor split), web
  table + progress editor.
- **M4 — Dependency logic.** Four dependency types (FS/SS/FF/SF) with lag, the DAG
  invariant + cycle prevention, web logic panel (ADR-0021).
- **M6 — CPM engine.** Forward/backward pass, total float, critical + near-critical,
  moderate constraint clamping, synchronous recalculate + summary, engine-owned
  batched write, web computed columns + Recalculate action (ADR-0022/0023).
- **M5 — Working-day calendars.** Weekday-mask + dated-exception calendars behind the
  engine port, org library + per-plan default, web calendar library + plan picker
  (ADR-0024).
- **Progress & retained logic (conformance M2).** Explicit remaining duration,
  suspend/resume, and a plan **recalc mode** (Retained Logic / Progress Override /
  Actual Dates) with a data-date floor; web progress-ingestion editor **on by default**
  (ADR-0035 §1–§6).
- **Advanced constraints (conformance M4).** Mandatory **produce-and-flag** (a pin that
  breaks logic is scheduled and flagged, never silently fixed), a **secondary** constraint
  on the backward pass, **as-late-as-possible** placement, and **expected-finish**
  resizing; web _Advanced scheduling_ editor + Conflict badge + plan Expected-finish
  toggle, **on by default** (ADR-0035 §7–§14, §22).
- **Hour/shift-granular calendars (conformance M1) & per-activity calendars (M5).**
  Working-**minute** engine axis with intraday shift patterns and time-window exceptions;
  each activity schedules on its own resolved calendar (activity → plan → 24/7) on an
  absolute-instant frame; web per-activity calendar picker **on by default**
  (ADR-0036/0037).
- **Scheduling modes & a de-overloaded plan start (ADR-0033).** A mandatory project
  **data date** split from an ephemeral **Go-to-date** view control; a plan-level
  **Early / Visual** scheduling mode with a read-only **Late-Start** overlay; Visual
  Planning drags record an advisory `visualStart` that pushes successors and flags
  conflicts rather than auto-correcting. On by default.
- **Engine conformance framework (ADR-0034/0035).** A P6-class torture-test fixture as a
  versioned benchmark + living **capability matrix**; a three-tier harness (engine-free
  structural gate, differential "flip-one-option-must-differ", no-oracle golden
  snapshots) and the negative-case reject/repair/report contract, with SchedulePoint's
  CPM semantics documented as the golden contract.
- **M7 — Baselines.** Named plan-of-record snapshots (snapshot-copy model), one active
  baseline per plan, server-side working-day variance, web baselines panel + variance
  columns (ADR-0025).
- **Date constraints (web).** The activity form now offers only the six constraint types
  the engine honours as-labelled (parked `MANDATORY_*` no longer newly selectable; a
  legacy value is shown honestly, never silently coerced); a set constraint is surfaced
  in the activities table and as a pin on the TSLD canvas, and "parked constraints" is
  explained in the schedule summary. No API/engine change (ADR-0023 §6 already governs
  the semantics; near-critical shading shipped in M6).

- **Project Explorer (web).** A persistent app-shell with a collapsible/resizable
  Client → Project → Plan navigator rail — an accessible, virtualized ARIA tree with
  deep-link reveal — replacing click-through navigation (ADR-0029). **In-tree CRUD is
  now ON by default** (2026-07-12): writers create/rename/soft-delete directly from a
  row context menu (⋯ button, right-click, ContextMenu/Shift+F10 key, touch long-press)
  plus a rail-header "New client", reusing the existing form/confirm dialogs and the
  soft-delete/Recently-Deleted flow via a hand-rolled APG `Menu` primitive and a
  shell-layer CRUD coordinator (no backend change).

## Delivered — TSLD canvas & editing surface

- **The TSLD graphical canvas** — the flagship primary editing surface (ADR-0026).
  **M1–M4 delivered** (read render; on-canvas create/move/link/relane; live critical
  path + driving-vs-non-driving arrows with a non-colour encoding; lane persistence +
  auto-pack), **on-canvas editing ON by default** (`VITE_TSLD_EDITING`). Time-scaled
  document chrome: an **adaptive date ruler** (year→month→day), **zoom presets** + zoom
  −/+, a **TODAY** marker, **non-working-day shading**, **layer toggles**, and
  **on-canvas activity labels** (`{code} {name} · {n}d`, adaptive placement, culled +
  LOD-gated; perf re-verified at p95 9.4ms draw @ 2,000 activities, inside the ≤16ms
  budget — ADR-0026 D1).
- **Canvas-first workspace, toolbar & authoring (ADR-0030/0031/0032).** The canvas is the
  primary workspace surface (resizable rail + activity panel, responsive single-pane
  toggle); a declarative **toolbar-item registry** feeding one APG `<Toolbar>` with a
  7-group taxonomy and pen-gated authoring; and canvas-first **authoring** (live empty
  canvas, on-canvas activity types, a two-click Link tool, coalesced auto-recalc). All
  on by default.
- **Plan edit-lock** (single-editor hand-off, ADR-0028) — **delivered & enabled**: the
  server lease + 423 write-gate and the web "pen" (`VITE_PLAN_EDIT_LOCK`, on by default).
  Server enforcement (`PLAN_EDIT_LOCK_ENFORCED`) stays the one deliberate ops switch,
  enabled after the pen bundle is live (ADR-0028 §9).
- **Editing enablement hardening** — a flag-on E2E harness (`test:e2e:edit`, in CI), a
  flags-off baseline suite, route-level gating coverage, and an operator runbook
  ([`docs/runbooks/tsld-editing-enablement.md`](runbooks/tsld-editing-enablement.md)).
- **Project Explorer** — see above. **Remaining canvas polish:** the deferred per-activity
  driving summary in the parallel listbox, plus the debt items in `TECH_DEBT.md`.

## Next

### Committed engine milestones (conformance framework)

The remaining clauses of the CPM semantics contract (ADR-0035), each with clear fixture
discriminators. Each becomes a spec/plan before build:

- **M6 — Float & critical (ADR-0035 §17–§20).** A selectable **Longest-Path** critical
  definition (vs today's Total-Float ≤ 0), **Total Float as start / finish / smallest**,
  **multiple float paths** (contiguous driving chains), a **make-open-ends-critical**
  option, and the **zero-free-float** refinement that completes the as-late-as-possible
  flag. Engine + a few plan options + web toggles.
- **M5-epic — Advanced activity types (ADR-0035 §21, §23–§24).** **Level-of-Effort**
  (duration-from-span, never drives, never critical), **resource-dependent** scheduling
  (needs a resource model first), and **WBS-summary** rollup.

### Product features (candidate order — governed by the brief's MoSCoW §8)

- **Notes.** Attach notes to any entity (client/project/plan/activity) — the weekly
  progress journey.
- **Gantt view** — the secondary tabular projection of the same model.
- **Undo/redo**, **export** (PDF/CSV), and **resources** (library + assignments) —
  all Must/Should-have per the brief.

## Guiding constraints

- Keep `main` releasable; ship thin vertical slices.
- Maintain the quality bar (tests, a11y, security, docs) on every change.
- Follow the delivery process ([`PROCESS.md`](PROCESS.md)) for new features; record
  architecturally significant decisions as ADRs.
