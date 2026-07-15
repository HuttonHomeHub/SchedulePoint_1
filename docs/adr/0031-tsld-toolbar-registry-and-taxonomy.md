# ADR-0031: TSLD toolbar-item registry & command taxonomy — a declarative registry feeding one APG `<Toolbar>`, a fixed 7-group taxonomy, three prominence tiers, and pen-gated authoring

- **Status:** Proposed
- **Date:** 2026-07-13
- **Deciders:** James Ewbank (with Claude Code — feature-analyst / ui-architect)
- **Related:** ADR-0030 (canvas-first workspace — this refines its header/chrome and
  supplies the command surface it lacked), ADR-0029 (app-shell), ADR-0026 (TSLD canvas
  rendering & the parallel a11y layer), ADR-0028 (plan edit-lock "pen"), ADR-0004
  (frontend state — server/URL/local split), ADR-0006 (tokens/shadcn/CVA). Spec:
  `docs/specs/canvas-toolbar-architecture.md`; plan:
  `docs/plans/canvas-toolbar-architecture.md`. Supersedes nothing.

## Context

ADR-0030 made the TSLD canvas the primary plan surface, but the canvas is still boxed
in by ~7 always-on chrome bands (breadcrumb, title/status, the `EditLockBanner` card,
the `ScheduleSummaryStrip` card, an in-panel hint line, the toolbar row, the legend row)
that leave it roughly a third of the workspace height. More structurally, the canvas has
**no single command surface and no extension seam**: today's controls are an ad-hoc pair
of components — `TsldToolbar` (a two-button `select`/`add-activity` mode switch +
Auto-arrange) and the zoom/fit/toggle view controls — plus a loose "Keyboard shortcuts"
button, a header-level Recalculate, and a `PlanActionsMenu` overflow. Every roadmap
capability (view-mode lenses, filters, undo/redo, object actions, export, milestones)
would bolt on another bespoke control and another wrapped row, re-growing the very chrome
problem ADR-0030 set out to fix and duplicating gating/overflow/a11y logic each time.

The workspace needs a toolbar that **is** the canvas's command surface and can absorb the
CPM/GPM feature set over the product's life without re-growing chrome. The hard forces:

- **The abstraction must be validated by real commands, not speculation.** A generic
  toolbar framework with no consumers is dead weight; the taxonomy is only proven by
  porting **today's** actual controls onto it.
- **Gating must not drift.** Authoring is gated by role (`canEditSchedule`) **and** by
  holding the pen (ADR-0028); the toolbar must reflect the model's capability flags, never
  re-derive a rule of its own.
- **The pen must stay first-class.** ADR-0028's full hand-off (Start/Stop/Request/
  Take-over/Override/Keep/Dismiss, incoming-request, lost-control) and its live-region
  announcements must survive the removal of the big banner card — no capability lost.
- **The house owns its primitives (CLAUDE.md §2).** A toolbar is a demanding APG pattern
  (roving tabindex, overflow, popover focus return); no new headless dependency — it joins
  the hand-rolled `Menu`/`Dialog`/`PanelResizer` family.
- **`main` stays releasable.** The change is significant and lands in slices, so it ships
  dark and flips on only when its gates are green — as `VITE_CANVAS_WORKSPACE` and
  `VITE_TSLD_EDITING` did.
- **The canvas must not pay for toolbar re-renders.** The toolbar re-renders on selection/
  mode/pen/view changes; those must not re-render `TsldCanvas` or re-run `describeActivity`
  (the ADR-0030 memoisation guard).

## Decision

Adopt a **declarative toolbar-item registry** feeding **one generic APG `<Toolbar>`**
primitive, driven by a **`ToolbarContext`** built from `usePlanWorkspaceModel` + local
canvas UI state. Commands are _data_; `<Toolbar>` is generic. Built behind a new
`VITE_CANVAS_TOOLBAR` flag (default-off during rollout), layered on ADR-0030's
`VITE_CANVAS_WORKSPACE`. The seven decisions below are settled.

### 1. Commands are data — a declarative `ToolbarItem` registry

A `ToolbarItem` is a plain object:

```
ToolbarItem = { id, group, tier, order, icon, label, penGated,
                isVisible(ctx), isEnabled(ctx), isActive(ctx),
                onActivate(ctx) | render(ctx) }
```

A single `components/ui/toolbar/` primitive partitions items by group → sorts by `order`
→ splits by tier → measures → gates → renders. Adding a future capability is **registering
one item into a group**, never editing `<Toolbar>` or growing chrome. Dev-time invariants
(unique `id`, non-empty `label` as the a11y name, exactly one of `onActivate`/`render`)
fail loud in dev and fail-safe (omit the item) in prod. The registry types land in **M1**;
the abstraction is validated in **M2** by migrating **today's** real commands (zoom/scale/
fit/toggles/add-activity/auto-arrange/recalculate/legend/summary/plan-actions/shortcuts)
onto it — no empty framework.

### 2. A fixed 7-group command taxonomy (compiler-enforced)

The group set is a TS union so the compiler enforces membership; groups render in a fixed
left→right order: **1 Frame/navigate · 2 Lens/display · 3 Find/focus · 4 Tools/author
(pen-gated) · 5 Object/plan actions · 6 History/status · 7 Help.** Encoding the taxonomy
as a type (not a string) makes the set a design decision the compiler defends.

Several slots are **reserved** in v1 — registered as inert/placeholder stubs so they are
promotable later without a taxonomy change, and explicitly _not_ lock-in:

- **Find/focus (group 3)** — `Filter▾`, Critical-only, Isolate-chain: reserved stubs.
- **History/status (group 6) undo/redo** — render nothing until an undo stack exists.
- **Milestone / Auto-arrange (group 4)** — reserved to Tier-2/3 stubs.
- **View-mode switch (group 2)** — see decision 5(c).

### 3. Three prominence tiers + a responsive overflow rule

Every item declares a tier: **T1** always-visible inline (scale, zoom, Fit, the view-mode
slot, `+ Add Activity`, Recalculate, the pinned Project-finish chip, pen status); **T2**
labelled popovers (`View▾`, `Summary▾`, `Legend▾`, `Filter▾`); **T3**
overflow `⋯` (Baselines, Calendar, Plan details, Export, shortcuts). When Tier-1 items
no longer fit, the lowest-priority ones **demote into the overflow by tier-then-`order`**,
measured by a single `ResizeObserver` (memoised partitions + hysteresis to avoid thrash).
The `⋯` overflow is **always reachable** — even if nothing else fits, everything collapses
into it; no horizontal scrollbar ever appears.

### 4. Pen-gating is a first-class group state (ADR-0028)

`penGated` items — the whole **Tools/author** group and the selection author-actions —
enable/disable **as a set** from `ctx.editing`, flipping on and off with the pen. The
compact **pen status** lives in the toolbar/header and **replaces the ADR-0030
`EditLockBanner` card**; it reuses `resolveLockView` (`plan-lock/lib/lock-view.ts`) and
the `EditLockControls` internals so the full ADR-0028 hand-off stays reachable and the
`role="status"` live-region announcements are preserved. A capability race (pen lost at
activate) is a no-op that announces state, falling through to the existing 423/409 path
if it slips.

### 5. The product-owner-approved fork decisions (settled)

- **(a) Reserve the Select/Link tool-mode group.** We do **not** build Select + Link as
  first-class canvas modes in v1. `+ Add Activity` maps to the existing `setMode`
  (`select`/`add-activity`) seam; **Link stays a plain button**. The registry can promote
  Link to a mode later without a taxonomy change (today's gesture-based link-draw already
  exists on the canvas).
- **(b) Selection-contextual actions render in a floating toolbar** anchored next to the
  selection (Edit · Delete · Set constraint · Open logic), driven by the same registry
  item definitions, pen-gated, keyboard-reachable, focus-returning on dismiss. The **main
  bar stays stable** — selection changes never reflow it.
- **(c) TSLD is lens #1; reserve the view-mode switch slot.** Group 2 carries a view-mode
  segmented control rendered today as a **single option** (TSLD). Adding Gantt/Network
  later is registering options, not re-architecting the toolbar.

### 6. Scope

Frontend-only: no database, API, or auth change; the toolbar **reflects** the existing
deny-by-default gating surfaced by `usePlanWorkspaceModel`, never adds authZ. Route
behaviour stays sourced from `usePlanWorkspaceModel`; the flag chooses layout/chrome only.
With `VITE_CANVAS_TOOLBAR` off, the ADR-0030 workspace renders unchanged; with
`VITE_CANVAS_WORKSPACE` off, the legacy stacked page is untouched.

## Alternatives considered

- **Keep bespoke per-feature controls (today).** Rejected: every new capability re-grows
  the chrome and duplicates gating/overflow/a11y logic; there is no extension seam — the
  problem this ADR exists to solve.
- **A config-file / JSON-schema toolbar (serialised DSL).** Rejected: commands need typed
  React callbacks and predicates (`isEnabled`/`onActivate`/`render`); a typed
  `ToolbarItem[]` is safer and simpler than a serialised schema plus an interpreter.
- **A headless toolbar library.** Rejected per CLAUDE.md §2 (no new dependency); the house
  owns its APG primitives (`Menu`/`Dialog`/`PanelResizer` are all hand-rolled).
- **Chrome-reclaim first, toolbar later.** Rejected: it would build throwaway bespoke
  controls and re-do the a11y work — the reclaim (deliverable A) must build on the toolbar
  (deliverable B), not the reverse.
- **Selection actions as a contextual segment inside the main bar** (Fork-2 alternative).
  Rejected in favour of the floating surface, which keeps the main bar's item order stable.
- **Build the Select/Link tool-mode group now** (Fork-1 alternative). Rejected as premature
  scope; reserved instead.

## Consequences

- **Positive:** adding a command becomes registering one declarative item — no toolbar
  surgery; the 7-group taxonomy is compiler-enforced and reserved slots absorb the roadmap
  (lenses, filters, history, export) without re-architecture; one APG `<Toolbar>` carries a
  single roving-tabindex/overflow/popover a11y implementation for all commands; the pen
  hand-off shrinks from a banner card to a compact status without losing an ADR-0028
  capability; the `PlanActionsMenu` overflow is absorbed into the toolbar.
- **Negative / trade-offs:** one indirection layer (registry + context) plus a measurement
  pass sit between a command and its render — justified only because it is validated by
  porting real commands (M2), not by speculative generality; Baselines/Calendar/Plan
  details/Export become one disclosure away (Tier-3), continuing the ADR-0030 discoverability
  trade-off.
- **Constraints (merge gates):** **Performance** — toolbar re-renders (selection/mode/pen/
  view) must not re-render `TsldCanvas` or re-run `describeActivity`; item lists and the
  context are memoised (the ADR-0030 memoisation guard). **Accessibility (WCAG 2.2 AA)** —
  the toolbar is a conformant APG `toolbar` (roving tabindex, Arrow/Home/End, `role="group"`
  per group with `aria-label`); popovers and the overflow `Menu` are keyboard-operable with
  correct focus return; the pen state is announced via a live region; the ADR-0026 parallel
  focusable canvas layer is untouched.
- **Rollout:** built in flag-gated slices (M0 flag + this ADR → M1 primitive + registry →
  M2 TSLD command registry → M3 pen-gated state + selection actions → M4 chrome-reclaim
  layout → M5 a11y/perf/e2e gate + the default-on flip). `VITE_CANVAS_TOOLBAR=false` remains
  an emergency rollback to the ADR-0030 workspace throughout.
- **Follow-ups:** the "add a command" recipe and the `<Toolbar>` primitive are documented in
  `docs/COMPONENT_LIBRARY.md` / `docs/DESIGN_SYSTEM.md`; a flag-on Playwright journey asserts
  the height reclaim, command reachability, keyboard nav, and axe-clean state that jsdom's
  no-op `ResizeObserver` cannot measure.

## References

- Spec: `docs/specs/canvas-toolbar-architecture.md`; plan: `docs/plans/canvas-toolbar-architecture.md`.
- ADR-0030 (canvas-first workspace), ADR-0029 (app-shell), ADR-0026 (TSLD canvas + parallel
  a11y layer), ADR-0028 (plan edit-lock pen), ADR-0004 (frontend state), ADR-0006 (tokens/CVA).
- Seams reused: `TsldCanvasHandle` (`zoomToPreset`/`stepZoom`/`fitSignal`), `setMode`,
  `setViewToggles` (`features/tsld/components/TsldPanel.tsx`); `onTsld*` +
  gating (`components/layout/workspace/use-plan-workspace-model.ts`); `PlanActionsMenu`
  (`components/layout/workspace/plan-actions-menu.tsx`); `ScheduleSummaryStrip`
  (`features/schedule/components/ScheduleSummaryStrip.tsx`); `EditLockBanner` /
  `EditLockControls` / `resolveLockView` (`features/plan-lock/`); the `LEGEND` in
  `features/tsld/components/TsldPanel.tsx`.
- New primitives: `apps/web/src/components/ui/toolbar/*` (M1) and
  `apps/web/src/features/tsld/toolbar/*` (M2); flag: `apps/web/src/config/env.ts`.

## Amendment (2026-07-14): stable shape, zoom consolidation & future-feature placeholders

Field feedback after the scheduling-modes release (ADR-0033) surfaced three issues with the
shipped toolbar. This amendment refines — does not supersede — the registry contract above.

**Problem.** The Frame group carried **five separate zoom-preset buttons**
(Day/Week/Month/Quarter/Year) plus Zoom −/+/Fit. Combined with the scheduling-modes controls
(Project start, Go-to-date, the Early|Visual selector) the bar was wide enough that the
width-based overflow demoted tail Frame items (Fit, then Year/Quarter) into the `⋯` at common
widths. Because that demotion is width-driven, controls appeared to "come and go" — and it read
as if the toolbar changed with the **planning mode**, even though no command is gated on
`schedulingMode` (mode only changes drag semantics + how bars are drawn).

**Decisions.**

1. **Stable shape — shade, don't hide.** A capability that is only _temporarily_ unavailable is
   rendered **disabled with a reason**, never removed. `isVisible` is reserved for genuinely-absent
   features (flag-off, or a control a role can't have). Concretely, the zoom/fit controls and the
   `View`/`Legend`/`Legend`-adjacent items are now always present from the empty-canvas state
   onward — the zoom cluster is disabled (reason: "Add an activity to enable zoom") until a diagram
   is computed. The toolbar's silhouette no longer shifts as plan state changes.

2. **One consolidated zoom control.** The five scale buttons collapse into a single
   `Zoom: <level> ▾` dropdown (all five levels inside, current level on the trigger). This removes
   the Frame overload that caused the width-overflow churn; Quarter/Year are still one click away
   but no longer eat the bar.

3. **Fixed core + `⋯` for secondary.** Core Frame/Lens/Tools controls stay inline; only genuinely
   secondary, low-frequency actions (Baselines, Calendar, Plan details, Shortcuts — already tier-3)
   live in the `⋯` overflow. With the leaner Frame group, core controls no longer demote at normal
   widths (below `md` the workspace still switches to a single pane per ADR-0031's responsive rule).

4. **Future-feature placeholders.** Reserved slots are no longer hidden stubs; they render as
   **disabled "Coming soon" placeholders** so the toolbar reads as fully designed and the roadmap is
   visible in-product. A capability-unavailable disable and a placeholder are distinguished by their
   tooltip copy ("Add an activity to…" vs "Coming soon"). Inline placeholders: Undo/Redo (history). The
   `⋯` overflow carries the rest — navigation/find (Recenter-today, Search, Filter, Isolate-logic,
   Next-conflict), display (Colour-by, Baseline-overlay, Snap-to-grid, Resource-view), authoring
   (Add-note, Clear-visual-placement) and object/deliverable (Export, Print, Share, Comments,
   Update-progress). Keeping them overflow-only holds the inline bar lean and stable. The full catalogue
   and intended behaviour live in
   `docs/TOOLBAR_ROADMAP.md`; each is switched on later by swapping the `placeholderItem(...)` stub for
   a real command — no taxonomy change.

**Scope.** Frontend-only, within the existing `VITE_CANVAS_TOOLBAR` surface (no flag change). The
flag-off `TsldViewControls` fallback is unchanged. No API/DB/type change.

## Amendment (2026-07-15): two rows — split by "look vs change"

Product-owner review of the shipped single-row toolbar (post-scheduling-modes) asked for a
different trade-off than the first amendment's "lean inline core + `⋯` for the rest." On a normal
desktop monitor the owner wants **every control visible with its label** and **nothing working
hidden in a `⋯`** — the overflow menu is acceptable only as a mobile fallback (the app is unlikely
to be deployed on mobile). A single row can't hold the full labelled command set at that width, so
this amendment splits the toolbar into **two rows** and re-homes several controls. It refines — does
not supersede — the registry contract and the first amendment.

**Decisions.**

1. **Two rows, split by look vs change.** Each `ToolbarItem` carries a `row: 'look' | 'do'` (absent
   ⇒ `look`). The workspace renders **one `<Toolbar>` per row** via `splitByRow(items)`; grouping,
   tiering, gating and overflow are unchanged _within_ each row.
   - **Row 1 · Look** (always live): Go-to-date, the zoom cluster, `View▾`, the Early | Visual
     scheduling-mode selector, the search field + find/analyse lenses, and the right-aligned Finish
     read-out + Summary + Legend. Nothing here needs the pen.
   - **Row 2 · Do**: a pen-gated **authoring cluster** (Add, Link, Auto-arrange, note/snap/clear,
     Recalculate, Undo/Redo) that shades as one set when the pen isn't held, then plan & deliverable
     actions (Baselines, Calendar, Plan details, Edit plan, Update progress, Export/Print/Share/
     Comments, Shortcuts) that stay live because they don't author. To keep the pen-gated set
     contiguous, Recalculate and Undo/Redo move from the Object/History groups into `tools`.

2. **Inline, not overflow, on desktop.** The first amendment's "`⋯` carries the rest" is reversed
   for the placeholders too: analyse/find/authoring/deliverable placeholders are promoted from tier 3
   to **tier 2 (inline icon buttons)** so a normal-width desktop shows the full command set with no
   `⋯`. The width-based overflow still exists — below `md` (or any width that can't fit a row) tier-2
   items demote into the `⋯` exactly as before — but on a desktop it stays empty. "Shade, don't hide"
   from the first amendment now also covers **authoring vs viewing**: the whole Row-2 authoring
   cluster is shown shaded (disabled) while viewing rather than removed, so the toolbar's silhouette
   is identical in view and edit modes.

3. **The data date leaves the toolbar.** The persisted `plannedStart` had an inline date control
   (ADR-0032 M2 / ADR-0033 M2 "Project start"). It is removed from the bar: the data date is set at
   plan creation (mandatory, ADR-0033 M1) and changed via **Edit plan**, and will become the status
   date under **Update progress**. Navigation (**Go to date**) stays on Row 1. This de-clutters the
   bar and removes the two-adjacent-date-fields confusion the split was meant to solve. The
   `setPlannedStart`/`canLink` context seams are dropped as dead.

4. **Right-aligned status read-outs.** `Toolbar` gains an optional `alignEndGroup` prop; Row 1 passes
   `object` so the Finish read-out + Summary (and the Help/Legend after them) push to the trailing
   edge, separating "status you read" from "controls you drive."

5. **Removed / reserved controls.** The **Gantt/Resource view-mode switch** is not surfaced until a
   second view exists (product call): the `view-mode` slot stays a genuinely-reserved hidden stub
   (`isVisible: () => false`). **Hammock** and **Level of effort** are previewed as disabled
   ("Soon") items under a new **"Span between activities"** section of the Add menu (they're derived
   from two endpoints, not point-and-draw); this required a `disabled` affordance on the `Menu`
   primitive. **Search** leads the Find cluster as a real (disabled) field rather than an icon.

6. **One-line header, no read-only banner.** The header collapses to a single line — breadcrumb
   ending at the plan name + a status pill + the compact pen status. The separate "Read-only — use
   Start editing" note between the toolbar and canvas is removed as redundant (the pen status in the
   header already offers Start editing, and the shaded Row-2 cluster shows what's gated).

**Scope.** Frontend-only, within the existing `VITE_CANVAS_TOOLBAR` surface (no flag change). The
`Toolbar` primitive gains `alignEndGroup`; the `Menu` primitive gains disabled items; the registry
gains `row` + `splitByRow`. No API/DB/type change. **Deferred:** the zoom cluster stays a horizontal
group rather than a literal 2×2 pad — a composite 2×2 widget would need its own internal roving-focus
model (one toolbar stop containing four buttons), which the flat one-control-per-stop registry can't
express cleanly; revisit if the compact geometry is worth a bespoke primitive (`docs/TOOLBAR_ROADMAP.md`).

## Amendment (2026-07-15): consolidation & legend-on-canvas

A second product-owner review (of the shipped two-row toolbar, web 0.22.0) asked for a last
consolidation pass. It refines — does not supersede — the two-row amendment above.

**Decisions.**

1. **Link becomes a split-button, mirroring Add.** The old pair — a plain Link toggle plus a
   separate, only-while-linking FS/SS/FF selector — is replaced by one APG menu-button
   (`LinkControl`) that picks the dependency kind **and** arms link-mode in a single gesture, exactly
   like the Add split-button. Idle it reads "Link"; armed it reads "Linking · <code>" and offers
   "Stop linking." The `link-type` registry item is removed.

2. **Plan details + Edit plan fold into the Summary popover.** The two standalone Row-2 buttons are
   removed. A new `PlanSummaryPanel` renders the former Plan-details facts (status, data date, and the
   scheduling mode when relevant) above the computed `ScheduleSummaryStrip`, plus an **Edit plan…**
   shortcut for writers. A header **edit-pencil** beside the status pill gives quick access too. So
   "how does this plan stand?" and "edit the plan" live in one hub instead of three toolbar buttons.
   The `openPlanDetails` context seam is dropped as dead.

3. **Keyboard shortcuts move to Row 1 and bind `?`.** Shortcuts sits beside Legend in the help group
   (Row 1 · Look) rather than trailing Row 2, and the workspace binds the global `?` key (ignored
   while typing in a field) — the standard "press ? for shortcuts" affordance.

4. **The legend lives on the canvas.** The Row-1 Legend control changes from a popover that rendered
   the key to a **show/hide toggle** (pressed-state) for a new floating `TsldLegendPanel` overlaid on
   the canvas. The planner drags it anywhere within the canvas region and pins it; open state +
   position persist via `useLegendPanelPrefs` (localStorage), re-clamped to the live region so a
   shrunk viewport can't strand it off-screen. Dragging is a pointer enhancement — the panel is fully
   readable and closable by keyboard without it. Rendering the key over the canvas keeps it visible
   while reading the diagram and is a natural seam for the future print area. `TsldLegend` gains a
   vertical orientation for the narrow panel; the inline `TsldPanel` key keeps its horizontal wrap.
   The `legendContent` context node is replaced by `legendOpen` + `toggleLegend`.

5. **Polish.** The finish chip no longer wraps vertically (`whitespace-nowrap` on the toolbar control
   base); icon-only "Coming soon" tooltips name the button first ("Undo — Coming soon"); the zoom
   −/+/Fit controls drop to tier 2 (icon-only) so the Frame group is more compact; and the search
   field gains a little breathing room from its divider.

**Scope.** Frontend-only, within the existing `VITE_CANVAS_TOOLBAR` surface (no flag change). No
API/DB/type change. New: `PlanSummaryPanel`, `TsldLegendPanel`, `useLegendPanelPrefs`, a `?`-key
binding, and a `row: 'look'` move for Shortcuts.
