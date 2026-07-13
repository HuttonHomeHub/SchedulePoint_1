# ADR-0032: Canvas-first plan authoring — a live empty canvas, coalesced auto-recalc, on-canvas activity types, and a two-click Link tool-mode

- **Status:** Proposed
- **Date:** 2026-07-13
- **Deciders:** James Ewbank (with Claude Code — feature-analyst / ui-architect)
- **Related:** ADR-0030 (canvas-first workspace — the surface this makes authorable),
  ADR-0031 (toolbar registry & taxonomy — this promotes its reserved Link tool-mode slot
  and extends the Add item), ADR-0026 (TSLD canvas rendering, interaction model & the
  parallel a11y layer — amended), ADR-0022 (CPM synchronous recalculate — amended),
  ADR-0023 (data-date / `plannedStart` timeline origin — amended), ADR-0028 (plan
  edit-lock "pen"), ADR-0021 (DAG invariant), ADR-0004 (frontend state), ADR-0006
  (tokens/shadcn/CVA). Spec: `docs/specs/canvas-first-authoring.md`; plan:
  `docs/plans/canvas-first-authoring.md`. Supersedes nothing.

## Context

ADR-0026 made the TSLD canvas the product's flagship authoring surface and ADR-0030/0031
made the workspace canvas-first with a command-bearing toolbar. Yet **a planner still
cannot start a plan on the canvas.** Five concrete gaps sit between "canvas-first layout"
and "canvas-first authoring" — a planner should be able to build an entire plan (place →
type → link → auto-schedule) without ever touching the activities table:

1. **The blank canvas never mounts.** `TsldPanel` early-returns plain text while
   `activities.length === 0`, and the interactive `TsldCanvas` only renders under
   `showDiagram = isCalculated && dataDate !== null`
   (`isCalculated = activities.some(a => a.earlyStart !== null)`). On a brand-new plan
   there is nothing to draw on — the only way to add the first activity is the table. The
   canvas cannot host the first activity, cannot render before a recalc, and cannot render
   without a planned-start date.
2. **Table edits don't plot.** A table create only invalidates queries — it does not
   recalculate — so the new row has `earlyStart: null` and the canvas won't plot it until
   the planner clicks **Recalculate** by hand. Canvas create/link/reposition already recalc
   inline, so the two surfaces behave inconsistently ("why didn't it move?").
3. **The canvas can only make Tasks.** The Add-activity toolbar item and the route's
   `onTsldCreate` both hardcode `type: 'TASK'`. Making a milestone means creating a Task and
   converting it in the edit dialog — an illogical workaround.
4. **The start date is buried.** The timeline origin is the plan's `plannedStart`, editable
   only in the Edit-plan dialog; there is no inline control near the canvas to set/adjust it
   and re-anchor the timeline.
5. **Linking is clunky.** Logic is drawn by hovering a bar's edge handle and rubber-banding
   to a target, with modifiers picking FS/SS/FF. It is fiddly, poorly discoverable, and has
   no on-canvas Link affordance.

**Why now.** The canvas-first workspace (ADR-0030) and the registry-driven toolbar
(ADR-0031) have both shipped default-on; the scaffolding to host authoring commands exists.
These five gaps are the last thing standing between the canvas-first promise and its
delivery. The change is entirely **frontend** — no new backend module, database table,
migration, or endpoint. It reuses the existing `POST /activities`, `PATCH /activities/:id`,
`PATCH /plans/:id` (targeted `plannedStart`), `POST /dependencies`, and
`POST …/schedule/recalculate` seams and re-shapes how/when the client invokes them, behind
one new `VITE_CANVAS_AUTHORING` flag (default-off during build, per the
`VITE_TSLD_EDITING` / `VITE_CANVAS_WORKSPACE` / `VITE_CANVAS_TOOLBAR` rollout norm). No role
gains or loses a permission; every write stays gated exactly as today (role + pen; the API
is the trust boundary).

## Decision

Thread five capabilities through the existing ADR-0026/0030/0031 seams (gesture machine,
canvas UI-state, toolbar registry, route model), behind `VITE_CANVAS_AUTHORING`. The five
decisions below are settled.

### 1. Render the interactive canvas whenever a timeline anchor exists — amends ADR-0026

Relax `TsldPanel`'s `showDiagram = isCalculated && dataDate !== null` gate and its
zero-activity early-return so the interactive `TsldCanvas` mounts whenever
**`dataDate !== null`**, independent of `isCalculated` and of `activities.length`. The
anchor is **`dataDate = plannedStart ?? todayIso`** (the model already computes `todayIso`),
so an empty, start-less plan still has a timeline origin. `TsldCanvas` already falls back to
`DEFAULT_VIEWPORT` when no activity has dates, so it can paint a bare ruler/grid; it is only
prevented from mounting today. The zero-activity path shows the ruler/grid + the parallel
(empty) listbox + the Add affordance for writers; the "nothing scheduled yet" note replaces
the old text only in the read-only/empty case. With the flag off, the current empty-state
text and `showDiagram` gate are unchanged byte-for-byte. **This amends ADR-0026's
`showDiagram` render gate.**

### 2. First draw on a start-less plan silently pins `plannedStart` to today — amends ADR-0023

When a writer draws the first activity on a plan with no `plannedStart`, the route's
`onTsldCreate` **sets `plannedStart` to the current anchor (today — the origin the bar was
placed against) before the create**, using a targeted `PATCH /plans/:id` with the live
`version`, then creates against the fresh version. This keeps SNET/constraint dates coherent
(the placement is measured from a real origin, not a display-only one) and immediately
reflects the new start in the inline Start-date control. Today is thus a **display anchor**
when `plannedStart` is null; the first structural write pins the real value. **This amends
ADR-0023's timeline-origin convention** (today as a display anchor until the first write).

### 3. Unified, coalesced client-side auto-recalc — amends ADR-0022

Introduce **`usePlanAutoRecalc(orgSlug, planId, { canRecalc })`** — a plan-scoped
coalescer wrapping the existing `useRecalculateCommand`. It exposes:

- **`notify()`** — schedule a **trailing ~500 ms debounced** recalc, coalescing a burst of
  edits into **one** recalculation;
- **`flush()`** — run immediately (the manual **Recalculate** button becomes `flush()`).

Every **structural** mutation from **every** surface calls `notify()`: the canvas callbacks
(`onTsldCreate` / `onTsldLink` / `onTsldReposition`) stop awaiting their **own** inline
recalc and notify instead; the table create/delete and the logic-editor link do the same;
the start-date change notifies. One recalc path for all surfaces. The optimistic
ghost/preview keeps the just-drawn object visible during the debounce so nothing feels
laggy. `useRecalculateCommand` is already **single-flight** (`run()` no-ops while pending),
and its failure taxonomy (`NO_START_HINT` / `RECALC_FAILED_MESSAGE`) is reused verbatim; the
coalescing shape mirrors the existing `use-coalesced-nudge`.

**Guards:** never notify when `!canRecalc` (role/pen, ADR-0028) or `plannedStart === null`;
a 423 (pen) / 422 (no-start) refusal is the existing non-fatal, non-destructive conflict —
the edit is kept and not retried. Structural = create / update-definition / delete / link /
start-date; progress-only edits do not notify. This bounds load on the synchronous recalc
endpoint on large plans (≈2,000 activities) — no recalc-per-edit storm.

The `POST …/schedule/recalculate` endpoint and ADR-0022's engine-owned batched write that
bypasses optimistic locking are **unchanged**; this decision changes only **how and when the
client invokes them**. **This amends ADR-0022's explicit-action recalculate model**
(client-side coalescing/single-flight, endpoint untouched, manual force retained).

### 4. On-canvas activity types — Add split-button — amends ADR-0031

The Add-activity toolbar item becomes a **type split-button**: the primary control activates
the current `createType`, and a dropdown (the shared `Menu`) picks **Task** / **Start
milestone** / **Finish milestone**. Canvas UI state gains `createType: ActivityType` (default
`TASK`, constrained to `TASK | START_MILESTONE | FINISH_MILESTONE`). In the gesture machine's
`add-activity` mode, a **milestone** `createType` commits on a **single click** (zero-span
create at the click's day/lane); a **Task** commits on a **drag** (today's path). `EditIntent.create`
gains a **`type`** field; `onTsldCreate` honours it, sending `durationDays: 0` for milestones.
**Hammock / Level-of-effort remain available only in the edit dialog** (explicit non-goal; the
menu labels them "in the activity dialog"). Pen-gated as a set, unchanged. **This amends
ADR-0031's Add toolbar-registry item** (Task-only → type split-button).

### 5. A two-click Link tool-mode replaces the edge-drag — amends ADR-0026, promotes ADR-0031's reserved slot

`EditMode` gains **`'link'`**. Activating the Link tool enters link mode: a first click
selects the **predecessor** (announced), a second click on a **different** activity emits the
existing `EditIntent.link` (`predecessorId`, `successorId`, `type = linkType`); FS is the
default, with an FS/SS/FF choice on the Link affordance (`linkType` in canvas UI state; **SF**
stays in the logic editor — non-goal). Clicking empty space, the predecessor again, or
pressing **Esc** cancels/exits without emitting, announced.

The **edge-handle rubber-band link gesture is removed**: the `linking` gesture state, the
`startHandle`/`finishHandle` link branches, and the modifier→type chording are deleted, and
`TsldCanvas` stops hit-testing edge handles for linking. The **keyboard path is preserved**:
the parallel-listbox **Enter → `DependencyEditor`** logic-editor path remains the accessible
link-creation equivalent (WCAG 2.1.1), untouched. The client legality pre-check + server
409/422 non-destructive conflict handling (ADR-0021) are reused verbatim. **This amends
ADR-0026's interaction model** and **promotes ADR-0031's reserved Link tool-mode slot** to a
first-class canvas mode.

### Scope

Frontend-only: no database, API, DTO, or auth change; the affordances **reflect** the
existing deny-by-default gating surfaced by `usePlanWorkspaceModel`, never add authZ. Route
behaviour stays sourced from `usePlanWorkspaceModel`. With `VITE_CANVAS_AUTHORING` off, the
ADR-0031 workspace behaves exactly as today (empty-state text, table-create-without-recalc,
Task-only Add, edit-dialog start date, edge-drag link).

## Alternatives considered

- **Keep the canvas gated on `isCalculated` and teach the empty state a separate "add first
  activity" button that opens the table dialog.** Rejected: it does not deliver "draw on the
  canvas from the start" and keeps the table detour.
- **Auto-recalc as a backend "recalc-on-write" behaviour** (server recalculates after each
  mutation). Rejected for this feature: it changes ADR-0022's synchronous, explicit,
  engine-owned model server-side, has a far broader blast radius (every write path,
  transactions, batching, optimistic-lock interplay), and is not needed to satisfy the UX.
  Client-side coalescing over the existing endpoint is the smaller, reversible change; a
  future ADR may revisit server-side if it proves better at scale.
- **Recalc after every edit (no coalescing).** Rejected: a recalc-per-edit storm on the
  synchronous endpoint, poor on large plans.
- **Milestones via a separate "convert" action.** Rejected: that is today's illogical
  workaround the product owner explicitly wants gone.
- **Keep the edge-drag gesture and add Link as an alternative.** Rejected: the decision is to
  **replace** the gesture — two link surfaces would confuse users and double the
  interaction/a11y cost.
- **Require the user to set a start date before the first draw is allowed** (rather than
  auto-pinning today). Rejected: higher friction; auto-pinning today keeps SNET dates
  coherent and the user can change the start afterwards via the inline control.
- **Start-date as a full plan-form field only.** Rejected: the ask is an inline control by
  the canvas; reuse the targeted-PATCH pattern (`useSetPlanCalendar`).

## Consequences

- **Positive:** the canvas is live from a plan's first moment (anchored to today by default);
  table and canvas edits behave identically w.r.t. recalculation via one client recalc path;
  milestones are first-class canvas objects and the create-then-convert workaround is gone;
  the timeline start is an inline control, not a dialog detour; linking becomes a predictable,
  discoverable two-click tool; and every capability threads through existing seams — adding
  each is registering/extending, not re-architecting. `main` stays releasable behind
  `VITE_CANVAS_AUTHORING`; flag-off is today's behaviour byte-for-byte.
- **Highest-impact amendments (call-outs):**
  - **Auto-recalc amends ADR-0022's explicit-action model.** This is the load-bearing
    behavioural change: recalculation moves from an explicit user action to an automatic,
    coalesced consequence of editing. It is client-side only — the endpoint and the
    engine-owned batched write are unchanged — but it changes the product's mental model and
    must be documented so the explicit-action expectation is not silently re-litigated.
  - **The today-anchor coherence amends ADR-0023.** Rendering (and first-drawing) against
    `plannedStart ?? today` introduces a display-only origin that the first structural write
    then pins. The coherence risk (a bar placed against a display anchor that never becomes
    the real `plannedStart`) is mitigated by pinning `plannedStart = anchor` **before** the
    first create; the null-start path is unit- and e2e-covered.
- **Negative / trade-offs:** one client coalescing layer (registry + scheduler) plus the
  today-anchor concept are new indirection; a ~500 ms trailing debounce means the just-drawn
  bar plots a beat later (covered by the optimistic ghost); and **a shipped gesture (the
  edge-drag link) is removed** — surprising to anyone who learned it. That removal is
  **flag-mitigated** (it only lands with `VITE_CANVAS_AUTHORING` on), fully replaced by the
  two-click tool and the retained keyboard path, and the new Link tool is announced and
  discoverable.
- **Constraints (merge gates):** **Performance** — auto-recalc must coalesce and single-flight
  so it never storms the synchronous recalc endpoint; p95 draw stays within the ADR-0026
  budget at ≈2,000 activities; the empty-grid render is trivial. **Accessibility (WCAG 2.2
  AA)** — the empty grid keeps the parallel focusable listbox mounted; the Add split-button
  menu, the inline Start-date control (labelled native date input), and Link mode are all
  keyboard-operable and announced; Link mode announces each step, Esc exits, and the
  listbox Enter → logic-editor path is the 2.1.1 alternative; axe passes with no new
  violations. **Security** — no new authZ surface; affordances reflect existing role + pen
  gating; the API stays the trust boundary (IDOR unchanged, org-scoped endpoints).
- **Rollout:** built in flag-gated slices — M1 blank canvas + first-draw → M2 inline
  start-date → M3 auto-recalc (unifies surfaces) → M4 Add types + milestones → M5 Link
  tool-mode. Each milestone is independently shippable behind `VITE_CANVAS_AUTHORING`; the
  default flips on per milestone only once that slice's a11y/perf/e2e gates are green. M1
  relies on the existing canvas inline recalc until M3 unifies recalculation, so no milestone
  leaves the canvas unable to plot. `VITE_CANVAS_AUTHORING=false` is an emergency rollback to
  the ADR-0031 behaviour throughout.
- **Follow-ups (docs):** record the auto-recalc pattern in `docs/FRONTEND_ARCHITECTURE.md`;
  the Add split-button, inline date control, and Link tool-mode in `docs/UX_STANDARDS.md`;
  the new toolbar controls in `docs/DESIGN_SYSTEM.md` / `docs/COMPONENT_LIBRARY.md`; and add
  amendment notes to ADR-0022 (auto-recalc), ADR-0023 (today-anchor), ADR-0026 (render gate +
  link-gesture removal), and ADR-0031 (Link tool-mode + Add split-button).

## Amends

- **ADR-0022** (CPM synchronous recalculate) — recalculation becomes an automatic, coalesced,
  single-flight client consequence of structural edits; the endpoint and engine-owned batched
  write are unchanged.
- **ADR-0023** (data-date / `plannedStart` origin) — today is a display anchor when
  `plannedStart` is null; the first structural write pins the real `plannedStart`.
- **ADR-0026** (TSLD canvas rendering & interaction) — the `showDiagram` render gate is
  relaxed to `dataDate !== null`; the edge-handle rubber-band link gesture is removed in
  favour of a two-click `link` EditMode; milestone single-click create is added.
- **ADR-0031** (toolbar registry & taxonomy) — the Add item becomes a type split-button and
  the reserved Link tool-mode slot is promoted to a first-class mode.

## References

- Spec: `docs/specs/canvas-first-authoring.md`; plan: `docs/plans/canvas-first-authoring.md`.
- ADR-0030 (canvas-first workspace), ADR-0031 (toolbar registry & taxonomy), ADR-0026 (TSLD
  canvas + parallel a11y layer), ADR-0022 (CPM recalculate), ADR-0023 (scheduling date
  convention), ADR-0028 (plan edit-lock pen), ADR-0021 (DAG invariant), ADR-0004 (frontend
  state), ADR-0006 (tokens/CVA).
- Seams reused/extended: `TsldPanel` render gate + `showDiagram`, `TsldCanvas`
  `DEFAULT_VIEWPORT` fallback + `fitSignal`/`dataDate` effect
  (`apps/web/src/features/tsld/components/`); `EditMode` / `EditIntent` / gesture machine
  (`apps/web/src/features/tsld/interaction/gesture-machine.ts`); `useTsldCanvasUiState` +
  toolbar registry (`apps/web/src/features/tsld/toolbar/`); `onTsld*` + gating
  (`apps/web/src/components/layout/workspace/use-plan-workspace-model.ts`);
  `useRecalculateCommand` / the `useRecalculate` invalidation fan-out; `useSetPlanCalendar`
  as the pattern for a new `useSetPlanStart` (`apps/web/src/features/plans/api/use-plans.ts`);
  `use-coalesced-nudge` as the pattern for `usePlanAutoRecalc`; `CreateActivityPopover`,
  `DependencyEditor`, the `Menu`/`Toolbar` primitives.
- New: `usePlanAutoRecalc` (`apps/web/src/components/layout/workspace/`), `useSetPlanStart`
  (`apps/web/src/features/plans/api/use-plans.ts`), the Add split-button / Start-date / Link
  toolbar items (`apps/web/src/features/tsld/toolbar/`); flag: `apps/web/src/config/env.ts`
  - `.env.example` (`VITE_CANVAS_AUTHORING`).
