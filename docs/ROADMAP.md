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

## Next (candidate order — not yet committed)

Governed by the brief's MoSCoW (§8). Each becomes a spec/plan before build:

- **Notes.** Attach notes to any entity (client/project/plan/activity) — the weekly
  progress journey.
- **The TSLD graphical canvas** — the flagship primary editing surface (ADR-0026).
  **M1–M4 delivered** (read render; on-canvas create/move/link/relane; live critical
  path + driving-vs-non-driving arrows with a non-colour encoding; lane persistence +
  auto-pack). **On-canvas editing is now ON by default** (2026-07-12): `VITE_TSLD_EDITING`
  defaults on (with `=false` as opt-out), all pre-enablement gates green. The canvas also
  now reads as a time-scaled document — an **adaptive date ruler** (year→month→day), **zoom
  presets** (Day…Year) + zoom −/+, a **TODAY** marker, **non-working-day shading** (weekends
  - calendar holidays), and five **layer toggles** (2026-07-12). Remaining: the deferred
    per-activity driving summary in the parallel listbox.
- **Gantt view** — the secondary tabular projection of the same model.
- **Plan edit-lock** (single-editor hand-off) — **delivered & enabled** (ADR-0028): the
  server lease + 423 write-gate and the web "pen". The web pen (`VITE_PLAN_EDIT_LOCK`)
  now defaults **on**; server enforcement (`PLAN_EDIT_LOCK_ENFORCED`) stays the one
  deliberate ops switch, enabled after the pen bundle is live (ADR-0028 §9).
- **Editing enablement hardening** — **delivered**: a flag-on E2E harness
  (`test:e2e:edit`, in CI) proving the editing surface + pen end-to-end, a flags-off
  baseline suite, route-level gating coverage, and an operator runbook
  ([`docs/runbooks/tsld-editing-enablement.md`](runbooks/tsld-editing-enablement.md)).
  The web flags are now on by default (the manual cross-browser `Alt+←/→` check,
  TECH_DEBT #25a, passed); enabling API enforcement is the remaining ops action.
- **Undo/redo**, **export** (PDF/CSV), and **resources** (library + assignments) —
  all Must/Should-have per the brief.

## Guiding constraints

- Keep `main` releasable; ship thin vertical slices.
- Maintain the quality bar (tests, a11y, security, docs) on every change.
- Follow the delivery process ([`PROCESS.md`](PROCESS.md)) for new features; record
  architecturally significant decisions as ADRs.
