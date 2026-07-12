# @repo/web

## 0.13.0

### Minor Changes

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the "date constraints" loop in the UI. The activity form's constraint
  selector now offers only the **six** kinds the CPM engine honours exactly as
  labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
  which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
  no longer newly selectable, so a planner can't set a constraint that behaves
  differently than it reads. An activity that already carries a parked value keeps it
  as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
  is **never silently changed** on open.

  A set constraint is now visible without opening each row: a text **Constraint**
  column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
  accessible name), a small **pin** on the constrained edge of a bar on the TSLD
  canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
  diagram's accessible listbox), and an explanation of the "Parked constraints" figure
  in the schedule summary.

  `@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
  `isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
  API, database, or engine change — the constraint write path, optimistic locking, and
  pen gating are untouched.

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the TSLD canvas read like a time-scaled document. The diagram now has a sticky,
  **adaptive date ruler** across the top (year → month → day bands that re-scale as you
  zoom), **zoom presets** (Day / Week / Month / Quarter / Year) with zoom −/+ alongside
  Fit, a **TODAY** marker, **non-working-day shading** (weekends _and_ the plan
  calendar's holiday exceptions), and five **layer toggles** (day / month / year grid,
  today, non-working) to declutter. All view controls are available whether or not
  you're editing, and every control is a real, labelled, keyboard-operable button or
  checkbox.

  Entirely client-side and within the existing canvas architecture (ADR-0026): the
  ruler is a DOM overlay updated imperatively from the render loop so the viewport
  stays ref-authoritative (no per-frame React state), the new paint layers are culled
  and batched to hold the draw budget, and the accessible parallel listbox is
  unchanged. No API, database, or schedule-engine change.

### Patch Changes

- Updated dependencies [[`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b)]:
  - @repo/types@0.8.0

## 0.12.0

### Minor Changes

- [#39](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/39) [`8b3e08d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8b3e08de1d9ea6e60c77d893762672cafe098a24) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the TSLD on-canvas editing surface and the plan edit-lock "pen" by
  default. The two web flags — `VITE_TSLD_EDITING` (create/move/link/relane on the
  logic diagram) and `VITE_PLAN_EDIT_LOCK` (the single-editor "pen": a Planner takes
  an exclusive lock via **Start editing** before the schedule-editing affordances go
  live, peers see who holds it and can request/take over control) — now **default
  ON**, with `=false` as the rollback/opt-out. This lands now that every
  pre-enablement gate is green: the flag-on Playwright harness, the accessibility
  sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
  (Firefox/Safari/Edge).

  The API write-gate `PLAN_EDIT_LOCK_ENFORCED` is unchanged (still **default-off**)
  and remains the single deliberate rollout switch: enable it only once a bundle with
  the pen on is deployed (ADR-0028 §9 ordering) — enabling it ahead of the web bundle
  would 423 the activities-table / dependency / recalculate flows. Until then the pen
  coordinates editors in the UI while the server still accepts writes.

  Read-only consumers are unaffected: the Contributor progress path is never
  pen-gated, and setting `VITE_TSLD_EDITING=false` restores the read-only diagram
  byte-for-byte.

## 0.11.0

### Minor Changes

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plan edit-lock **web "pen" layer** (edit-lock M2, ADR-0028), behind a new
  `VITE_PLAN_EDIT_LOCK` flag (default **off** — ships inert). When enabled, the plan
  screen shows a single **"who holds the pen"** banner: a Planner clicks **Start
  editing** to take an exclusive edit-lock (a background heartbeat keeps it alive,
  released on Stop / navigation / tab-close), and the on-canvas schedule editing
  affordances — the TSLD canvas, activity create/edit/delete, the positions batch,
  the dependency editor, and Recalculate — become live only while holding it.
  Everyone else sees who's editing (and, per their role, can **request control**,
  **take over** once the holder goes idle / a grace window elapses, or — as an Org
  Admin — take over immediately via a confirm); the Contributor progress path and
  plan-metadata edits are never pen-gated. A **423 `LOCKED`** response drops the
  surface to read-only with distinct copy, separate from the 409 "changed elsewhere"
  conflict. With the flag off, nothing polls or changes — current behaviour
  byte-for-byte. Enable `VITE_PLAN_EDIT_LOCK` **before** the backend's
  `PLAN_EDIT_LOCK_ENFORCED` (ADR-0028 §9 rollout ordering).

### Patch Changes

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix stale driving-arrow styling on the TSLD canvas after a recalculate. The CPM
  recalculate rewrites each dependency's engine-owned `isDriving` flag, but
  `useRecalculate` only invalidated the schedule summary, activities and baseline
  variance — not the dependency query where `isDriving` lives. So after a
  reposition-in-time or create-activity edit (which recalc but don't otherwise touch
  the dependency cache), the driving-vs-non-driving arrows could render stale until a
  manual refresh. `useRecalculate` now also invalidates the plan's dependency query,
  closing the last gap in TSLD M3 (live critical path + driving arrows).

- [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/37) [`ce59178`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ce591786a5e3db36db2b5e061eb2fb4941e05a6c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
  user-visible change, both editing flags remain off by default.

  - **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
    in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
  - **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
    from the session instead of a `users` query — the common beat issues zero extra
    DB reads.
  - **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
    the app with the editing flags on and the API enforcing the lock, with pen-gating,
    single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
    `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
    gating/reposition-seam test. Operators: see
    `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a client-side link-legality pre-check to the TSLD dependency-draw (flag-gated
  editing, `VITE_TSLD_EDITING`). While drawing a dependency, the hovered target now
  rings by legality — a legal drop rings solid; a self-link, duplicate, or cycle rings
  dashed in the critical colour (colour and dash, not colour alone) — and an illegal
  drop the loaded graph already proves invalid is refused locally with an explanation
  (no round-trip to the server, which stays authoritative). Closes the ADR-0026 D5
  "live legality feedback" follow-up.
- Updated dependencies [[`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263)]:
  - @repo/types@0.7.0

## 0.10.0

### Minor Changes

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Complete the Time-Scaled Logic Diagram's keyboard **edit** model (M8 M5, slice 5.2; behind
  `VITE_TSLD_EDITING`). Keyboard users can now reposition an activity **in time** — `Alt+← / Alt+→`
  nudges its start one day earlier / later (an SNET constraint that recalculates) — alongside the
  existing `Alt+↑ / ↓` lane move, and press **`n`** to create an activity pre-filled at the focused
  lane and start. A **held** Alt+arrow is now coalesced into a single net write per burst (with an
  optimistic preview) and writes are serialized, so holding a key smoothly moves several lanes/days
  and issues one PATCH at the current version instead of racing several — which also removes the
  self-inflicted "changed elsewhere" conflicts a fast key-repeat used to cause. An `Alt+↑` at the top
  lane now says "Already in the top lane." rather than silently doing nothing. The in-app keyboard
  shortcuts help lists the new edit keys.

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the Time-Scaled Logic Diagram's keyboard accessibility (M8 M5, slice 5.1 — read; ships with
  editing off). The activity list now supports **driving-first chain navigation** (`[` / `]` jump to
  the predecessor / successor that drives the schedule, so a keyboard user can trace the driving path)
  and an on-demand **logic summary** (`Space` announces how many ties an activity has and which are
  driving) — delivering the driving/critical context without bloating the per-keystroke announcement,
  which additionally now states **total float**. **Focus-follows-viewport** pans the diagram the
  minimum distance to keep the selected bar's focus ring on-screen (WCAG 2.4.7 / 2.4.11), and if the
  selected activity is deleted elsewhere, selection reconciles to the nearest survivor. A **`?`
  keyboard-shortcuts help** sheet (also reachable by button) documents the full keymap in-app.

## 0.9.0

### Minor Changes

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **Auto-arrange lanes** to the Time-Scaled Logic Diagram (M8 M4 4.3, ADR-0026, behind
  `VITE_TSLD_EDITING`). A toolbar action repacks the diagram's activities into the **fewest lanes
  with no time-overlap** using a pure, deterministic greedy first-fit packer, and persists the
  result in one all-or-nothing batch write (no schedule recalculation — it changes only vertical
  layout). Because a bulk reorder can move many bars and isn't undoable yet, it's guarded by a
  confirm dialog; only the activities whose lane actually changes are written (the minimal diff),
  an already-tidy diagram reports "nothing to move", and a concurrent edit is surfaced
  non-destructively (the whole pack is refused, nothing moves).

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make on-canvas bar dragging **two-dimensional** in the Time-Scaled Logic Diagram (M8 M4,
  ADR-0026, behind `VITE_TSLD_EDITING`). A body drag now moves an activity **freely in both axes
  at once**: horizontally to a new start day (an SNET constraint that recalculates the schedule —
  the existing M2 move) **and** vertically to a new lane (`laneIndex`, layout only — no recalc).
  Per-axis snapping gives a half-cell dead-zone, so a mostly-horizontal drag won't accidentally
  change lanes (and vice-versa). A drop commits only the axes that actually changed as one
  optimistically-locked write: a lane-only move is the cheap `{ laneIndex, version }` PATCH (no
  recalc); a time move (with or without a lane change) is one PATCH carrying the SNET constraint
  (and the lane) followed by a recalc. Keyboard users get the same reach: **`Alt+↑ / Alt+↓`** on
  the focused activity in the parallel listbox nudges it one lane (WCAG 2.1.1). A stale-version
  conflict is surfaced non-destructively and never re-sent.

## 0.8.0

### Minor Changes

- [#29](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/29) [`5c3fbf4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5c3fbf47d3e900c3e73f9724713e8e677bcbc7c9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

  The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
  binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
  engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
  so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
  the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
  unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
  by a constraint above every incoming bound, is non-driving.

  On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
  dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
  a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
  criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.

## 0.7.0

### Minor Changes

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add on-canvas **create-by-drag** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind
  the OFF-by-default `VITE_TSLD_EDITING` flag. When enabled for a writer (Planner/Org Admin),
  the diagram gains an **Add activity** tool: drag on the timeline to draw a task (a click or
  sub-day drag makes a 1-day task), then name it in an inline popover — `Enter` creates it,
  `Esc` cancels with nothing persisted. The new activity is placed at the dropped day via an
  SNET constraint and the schedule recalculates authoritatively (no client-side CPM); the drag
  shows an instant ghost on a dedicated interaction layer so feedback never waits on the network.

  Every gesture keeps a keyboard-operable equivalent (the create dialog/table), so nothing is
  pointer-only. With the flag off — the default build — the diagram is byte-for-byte the M1
  read-only surface.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **dependency-draw** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags from an activity bar's
  start/finish **edge handle** to another bar to create a logic link: a rubber-band follows the
  pointer, the valid drop target is highlighted, and modifiers pick the type — plain drag is
  **FS**, **Shift** is **SS**, **Alt** is **FF** (the rarer **SF** stays in the dependency
  dialog). On drop the link is created via the existing `POST /dependencies` and the schedule
  recalculates authoritatively. A cycle or duplicate (ADR-0021) is surfaced as a non-destructive
  conflict banner with the engine's reason — nothing is created and the draw is never retried. The
  capability is keyboard-reachable too: pressing **Enter** on a focused activity in the diagram's
  listbox opens its logic editor, so link-draw adds no pointer-only capability (WCAG 2.1.1).
  Editing remains off in the default build.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **reposition-in-time** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags an activity bar's body
  sideways to move it in time: the drag shows an instant ghost of the moved bar, and on drop the
  new start is imposed as an **SNET constraint** via the existing activity update (carrying the
  live `version` for optimistic locking) and the schedule recalculates authoritatively — the
  engine still owns the working-day placement (a bar may settle a day or two off the ghost on a
  non-working day). A press without moving simply selects the bar. If someone else changed the
  plan first, the stale-`version` 409 surfaces as a non-destructive conflict banner and the move
  is not re-sent. Editing remains off in the default build.

## 0.6.0

### Minor Changes

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show per-activity baseline variance in the activities table (M7 Task D2, ADR-0025).
  When a plan has an active baseline, the plan route fetches the variance read and passes a
  per-activity map into the existing `ActivitiesTable` as an optional prop, which renders
  **Start / Finish / Float variance** columns: "3 d behind" / "2 d ahead" / "On baseline"
  (working days on the plan calendar; float flips the sign so lost float also reads as
  behind), "Added" for an activity created since capture, "Removed" for a baselined activity
  now gone, and "—" when not comparable. A plan-level **roll-up** ("vs. Contract Baseline:
  worst slip 6 d · 3 activities behind · 1 added") sits above the table. Meaning is carried
  by the text, not colour alone (WCAG 2.2); the tone colour only reinforces it. All variance
  UI is absent when there is no active baseline. `features/activities` stays dependency-free — it takes a
  shared `@repo/types` shape and the route composes it from the baselines feature (no
  feature→feature import). A Playwright journey covers capture → active → variance visible
  with an axe check. The stale `ROADMAP.md` is refreshed to reflect the delivered M0–M7
  milestones and the candidate next steps.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baselines panel to the plan view (M7 Task D1, ADR-0025). A new
  `features/baselines` surfaces a plan's baselines under the Schedule section: name, an
  **Active** badge, when captured, the captured project finish, and the frozen activity
  count. Planners/Org Admins get **Capture baseline** (a dialog that freezes the plan's
  current computed schedule; a duplicate name or a never-calculated plan surface as
  friendly inline messages with a "recalculate first" hint), plus per-row **Activate**
  (exactly one active — activating one deactivates the rest server-side) and **Delete**
  (with a warning when removing the active baseline). Everyone else reads. The shared API
  client gains `apiFetchEnvelope` so the variance read can access the `{ data, meta }`
  roll-up; the `baselineKeys` query keys and hooks (list/detail/variance/capture/activate/
  delete) land here too. Empty/loading/error states and delete confirmation reuse the
  shared DataTable/ConfirmDialog primitives.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Time-Scaled Logic Diagram (TSLD) canvas — read-only (M8, ADR-0026). The plan
  detail's "Logic diagram" section now plots a plan's computed activities on a **Canvas 2D**
  surface: task bars and milestone diamonds positioned by their early dates on a
  time-scaled grid, dependency logic drawn as routed connectors, and the critical /
  near-critical path highlighted — by a fill colour **paired with a solid / dashed outline**
  (and a visible legend) so criticality is never conveyed by colour alone. The view is
  **drag-to-pan, scroll-to-zoom** (cursor-anchored) with a **Fit to plan** control, and
  repaints only dirty frames off a `requestAnimationFrame` loop so an idle diagram costs
  nothing.

  Because a `<canvas>` is opaque to assistive technology, the diagram is `aria-hidden` and
  paired with a **parallel focusable listbox** of the same activities: a keyboard or
  screen-reader user tabs into the diagram, arrows through activities (each announced with its
  dates, lane and criticality) and selects one, which rings it on the canvas — no capability is
  pointer-only (WCAG 2.2). The activities table remains the fuller conforming alternative.
  On-canvas **editing** (create/move/draw logic) arrives in a later release.

### Patch Changes

- Updated dependencies [[`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883)]:
  - @repo/types@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14), [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14)]:
  - @repo/types@0.5.0

## 0.5.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Recalculate action to the plan view (Planner/Org Admin). A `Recalculate`
  button triggers the CPM engine and refetches the schedule summary and activities
  so the computed dates, float and critical-path badges update in place; a plan
  with no start date surfaces a friendly inline prompt (from the API's 422) instead
  of a raw error, and other failures are announced politely. Readers don't see the
  action. Also darkens the `--primary` design token slightly so white-on-primary
  buttons clear the WCAG 2.2 AA 4.5:1 contrast bar (verified by axe) — an app-wide
  accessibility fix the new page surfaced.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface the computed CPM schedule in the plan view (read-only). The activities
  table gains early/late start & finish and total-float columns plus a
  critical / near-critical badge (late dates hide first on narrow screens; an
  uncomputed plan shows em dashes). A new schedule summary strip shows the data
  date, project finish, and the activity / critical / near-critical counts, with a
  "not yet calculated" empty state and its own loading/error states. Adds a shared
  `Badge` primitive and `scheduleKeys` / `useScheduleSummary`. The Recalculate
  action is a separate control (next).

### Patch Changes

- Updated dependencies [[`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c)]:
  - @repo/types@0.4.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activities table and definition CRUD to the plan-detail screen. A plan now
  lists its activities (code, name, type, duration, progress); Planners and Org
  Admins can add, edit, and soft-delete them from a form dialog that mirrors the API
  rules — the duration field is hidden for milestone types (which have no duration),
  and the constraint date only appears once a constraint type is chosen (the two are
  sent, or cleared, together). The graphical Time-Scaled Logic Diagram will edit
  these on a timeline in a later release.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress editor with role gating. A "Progress" action on each
  activity row opens a dialog to set percent complete and the actual start/finish
  dates; the resulting status is shown as a live, read-only preview (the API derives
  it). The action is gated on `canReportProgress` (Contributor upward), so a
  Contributor — who cannot edit an activity's definition — can still report progress,
  while Planners and Org Admins see it alongside Edit/Delete. Client-side validation
  mirrors the API (a finish needs a start and cannot precede it).

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add/edit/remove dependencies from the Logic panel. Planners and Org Admins
  (`canManageLogic`) get "Add predecessor"/"Add successor" buttons and per-row
  Edit/Remove: adding picks the other activity from the plan (self excluded),
  chooses a type (FS/SS/FF/SF) and a signed lag; editing changes type/lag with
  optimistic locking; removing confirms first. The API stays the source of truth
  for the acyclic guarantee — a cycle, duplicate, or stale-version rejection is
  surfaced inline. Viewers and Contributors keep the read-only panel.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-only Logic panel for activities. Each activity row on the plan-detail
  screen gets a "Logic" action (available to any member) that opens a panel showing
  its **predecessors** (what must finish before it) and **successors** (what it
  drives) — each a table of the other-end activity, dependency type (FS/SS/FF/SF),
  and signed lag. The activities table stays dependency-free: it emits an
  `onOpenLogic` callback and the plan-detail route owns the panel. Add/edit/remove
  affordances land next.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.1

### Patch Changes

- [#15](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/15) [`509a94e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/509a94e40935a3ccc171306a68bf64819e7de135) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the post-login redirect bouncing back to the sign-in screen. After a
  successful sign-in/sign-up the session query was only _invalidated_, which does
  not refetch an inactive query, so the `_authed` route guard — which reads the
  session via `ensureQueryData` (cached, no revalidation) — saw the stale
  unauthenticated `null` and redirected straight back to sign-in. The user
  appeared "stuck" and only got in by manually refreshing. The mutations now
  `fetchQuery` the session (awaited) so the cache holds the logged-in user before
  navigation, landing the user in the app (or onboarding) on the first attempt.

## 0.3.0

### Minor Changes

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web screens to browse and manage clients and projects (E1). New routes
  `/orgs/:orgSlug/clients` (list), `/orgs/:orgSlug/clients/:clientId` (a client's
  projects), and `/orgs/:orgSlug/projects/:projectId` (the plans shell, filled in
  by E2), reachable from a new "Clients" nav item. Each screen has create/edit
  dialogs and a confirm-first soft delete, breadcrumbs, and loading/empty/error/
  not-found states; write affordances are hidden for non-writers (Viewer/
  Contributor) while the API still enforces authorisation. Covered by component
  tests and a Playwright journey (create client → open → create project) with an
  accessibility check.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web plans slice (E2): a project's plans table (name → plan detail,
  status, planned start) with create/edit/delete for writers, a plan form with a
  status select and an optional planned-start date (`<input type="date">`, wire
  format `YYYY-MM-DD`), and a plan-detail route (`/orgs/:orgSlug/plans/:planId`)
  showing the plan's metadata plus a region reserved for the future Time-Scaled
  Logic Diagram canvas. The project screen now lists real plans instead of a
  placeholder.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the recycle-bin web slice (E3): a "Recently deleted" screen
  (`/orgs/:orgSlug/recently-deleted`, linked from the org nav for writers) listing
  soft-deleted clients, projects and plans newest-first, each with a Restore
  action. An item whose ancestor is still deleted can't be restored on its own, so
  its row guides the user to restore the parent first (the top-down invariant);
  restoring a client or project brings back everything deleted with it. Restore
  outcomes (and name-collision errors) are announced via the shared live region.

### Patch Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.
- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Land the web application entry point and the authentication walking skeleton:
  Vite + React app shell, design tokens, TanStack Router (code-based) with an
  `_authed` guard, TanStack Query, theme (light/dark/system) with no flash of the
  wrong theme, and accessible sign-in / sign-up forms (React Hook Form + Zod) via
  the Better Auth client. A signed-in user reaches an app shell (header, current
  user, sign-out); unauthenticated visits are redirected to sign-in. Covered by a
  component test and a Playwright journey with an axe accessibility check; CI now
  builds and end-to-end tests the web app.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the members management UI and the invitation-accept flow. Each organisation
  gets a Members screen (`/orgs/$orgSlug/members`) with an accessible roster: inline
  role changes (optimistic-lock conflicts surfaced), remove-with-confirm, and an
  Invite dialog that emails a link and shows the copyable accept URL. A public
  `/accept-invite` route previews the invitation and lets the invited user join
  (prompting sign-in as the right account when needed). Adds a header org nav and
  Dialog/Select primitives. Covered by a component test and a two-account
  Playwright journey (invite → accept → join).

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation onboarding, an org switcher, and organisation-scoped routing.
  A user with no organisations is routed to a create-your-first-organisation
  screen; the header gains an accessible organisation switcher; and the app routes
  under `/orgs/$orgSlug` with the URL as the authoritative active organisation (a
  remembered "last active org" drives the home redirect). Covered by a component
  test and an extended Playwright journey (sign up → onboard → land in the org).

### Patch Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
