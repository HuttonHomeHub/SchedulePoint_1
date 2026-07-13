# ADR-0030: Canvas-first plan workspace — the TSLD canvas as the primary surface, with a drag-resizable activity panel

- **Status:** Proposed
- **Date:** 2026-07-13
- **Deciders:** James Ewbank (with Claude Code — feature-analyst / ui-architect)
- **Related:** ADR-0029 (persistent app-shell & hierarchy navigator — this refines
  its "single workspace region"), ADR-0026 (TSLD canvas rendering & architecture —
  this amends its resize semantics), ADR-0004 (frontend state — server/URL/local
  split), ADR-0006 (tokens/shadcn/CVA), ADR-0028 (plan edit-lock pen). Spec:
  `docs/specs/canvas-first-plan-workspace.md`; plan:
  `docs/plans/canvas-first-plan-workspace.md`.

## Context

The plan surface (`/orgs/$orgSlug/plans/$planId`) — the destination of the ADR-0029
navigator and the home of the flagship TSLD canvas (ADR-0026) — was a **long,
vertically-stacked, scrolling page**: plan metadata → a Schedule heading + Recalculate
→ the edit-lock pen banner → the calendar picker → the schedule-summary strip → a
Baselines panel → the TSLD canvas **boxed to a fixed `h-[480px]`** → the Activities
table. The planner's primary tool was a mid-page box they had to scroll to, and the
diagram could never use the height the app-shell freed up.

The product owner's requirement: **canvas-first**. Opening a plan should show the TSLD
canvas as the primary surface filling the workspace region beside the Project Explorer,
with the **activity list docked as a bottom panel that can be dragged to resize and
collapsed**, so the canvas can take the full height when the planner is drawing and the
table can be pulled up when they're editing rows.

Hard forces this ADR resolves:

- **The router stays the source of truth (ADR-0004/0029).** Selection remains a
  projection of the URL; this is a _layout_ change, not a routing or state-model change.
  The plan URL is unchanged, so deep-links, refresh, and back/forward are untouched.
- **`main` stays releasable.** The change is significant and lands in slices, so it must
  ship dark and flip on only once its gates are green — matching how `VITE_NAV_TREE` and
  `VITE_TSLD_EDITING` rolled out.
- **No capability may regress.** Every section of the old page (Recalculate, summary,
  pen, calendar, baselines, edit, the activities table with its computed/variance columns
  and progress editor) must remain reachable and accessible in the new layout.
- **The canvas must fill height and re-fit cleanly.** ADR-0026's canvas was fixed-height;
  a resizable container exposed a latent bug — `TsldCanvas.measure()` reset the viewport
  (`fittedRef=false`) on _every_ resize, so dragging the panel made the diagram "jump".
- **Accessibility is a merge gate (WCAG 2.2 AA).** A new draggable splitter, an overflow
  menu, modal dialogs, and a responsive view toggle are all demanding keyboard/focus
  patterns. **The house owns its primitives** — no Radix/headless-UI (CLAUDE.md §2).
- **Don't fork what exists.** The app-shell already has a resizable rail (ADR-0029) and a
  `Menu`/`Dialog`/`ActivitiesTable`; the workspace must reuse them, not re-implement them.

## Decision

Introduce a **canvas-first `PlanWorkspace`** behind `VITE_CANVAS_WORKSPACE` (default-off
during rollout; flag-off keeps the legacy stacked page byte-for-byte). The plan route is a
thin branch on the flag; both layouts render from **one shared orchestration hook**
(`usePlanWorkspaceModel`) that owns the queries, the pen/RBAC gating matrix, and the TSLD
edit callbacks — so the flag chooses _layout only_, never behaviour.

The workspace is a flex column:

1. **A slim header** — plan identity + status, Recalculate, the pen banner, and the
   schedule-summary strip. The lower-frequency chrome — **Edit plan, Baselines, Calendar**
   — is consolidated into a **`⋯` overflow `Menu`** (the shared APG primitive); Baselines
   and Calendar open in the shared modal `Dialog`. (Baselines/Calendar/Edit trade
   always-visible for one click; Recalculate + summary + pen, the per-edit-loop controls,
   stay in the bar.)
2. **The canvas region** — `TsldPanel` gains a `fill` mode: the diagram fills the remaining
   height (`flex-1`, min-height floor) instead of the fixed 480px box.
3. **A bottom activity panel** — the existing `ActivitiesTable` (computed/variance columns,
   progress editor, CRUD, virtualization) docked at the bottom, **drag-resizable and
   collapsible**. Its height and collapsed state persist.

**Shared resizable-panel primitive.** Rather than fork the rail's resizer, extract an
**orientation-aware `PanelResizer`** (a WAI-ARIA window splitter: `role="separator"`,
`aria-orientation`, `aria-valuenow/min/max`, pointer drag + arrow/Home/End keys, ≥24px hit
area) and a `useResizablePanelPrefs` hook (clamp + `localStorage` persist + reset-on-corrupt).
The Project Explorer rail (ADR-0029) is **refactored onto this same primitive** (vertical
splitter → width); the activity panel is the horizontal case (→ height). The panel's height
is clamped at render against the live workspace height (a `ResizeObserver`) so the canvas
always keeps a minimum.

**Canvas resize amendment to ADR-0026.** `TsldCanvas.measure()` now re-provisions the DPR
backing store and repaints on a container resize **without** forcing a re-fit — the viewport
(pan + `pxPerDay`) is preserved, so dragging the panel doesn't re-frame the diagram. Explicit
**Fit** and a `dataDate` change still re-frame (via `fitSignal`); mount fits once. Culling
keeps the per-frame draw within the ADR-0026 60fps budget.

**Responsive.** At/above `md` the vertical split; **below `md`, a Diagram / Activities
segmented view toggle** shows one pane at a time (a phone can't usefully split canvas + table).
Both panes stay mounted (toggled with `hidden`) so the canvas viewport and table scroll survive
a switch. A small reusable `useMediaQuery` hook drives the structural branch.

## Alternatives considered

- **Right-side utility panel for baselines/calendar** instead of a header overflow menu —
  costs horizontal room the time-scaled canvas wants; the overflow menu keeps the canvas full-bleed.
- **A right-docked activity aside** instead of a bottom panel — a horizontal split narrows the
  time axis, which is the canvas's most valuable dimension; a bottom dock preserves full width.
- **Keep the fixed-height canvas / the stacked page** — rejected; it's the very problem, and it
  wastes the height the app-shell frees.
- **CSS-only responsive (no `useMediaQuery`)** — the desktop split uses an inline pixel panel
  height that can't be expressed responsively; the structural difference (splitter vs single
  pane) is cleaner as a JS branch. Pure styling still uses Tailwind `md:`/`lg:`.
- **A `radiogroup`/`tablist` for the mobile toggle** — considered; shipped as grouped
  `aria-pressed` buttons (revisit if the a11y review prefers radios).
- **Adopt a headless resizable-panels library** — rejected per CLAUDE.md §2 (no new dep); the
  hand-rolled `PanelResizer` is ~60 lines and shared with the rail.

## Consequences

- **Positive:** the flagship canvas is the primary surface at full height; the activity table
  is a first-class, resizable companion; one splitter primitive now serves both the rail and the
  panel (less code, consistent a11y); the shared model hook removes layout/behaviour duplication;
  the ADR-0026 viewport-preserve fix benefits any future resizable canvas host.
- **Negative / trade-offs:** baselines/calendar/edit are one click less discoverable (overflow
  menu); crossing the `md` breakpoint remounts the canvas (rare; a full re-fit, acceptable); the
  rail's persisted-width storage schema changed (`width`→`size`), a one-time reset of a saved
  rail width (a documented convenience, not correctness).
- **Rollout:** shipped in five flag-gated slices (M1 scaffold → M2 resize + viewport-preserve →
  M3 overflow menu → M4 responsive → M5 a11y/e2e gate + this ADR + the default-on flip). The flip
  to default-on is the deliberate, documented milestone; `VITE_CANVAS_WORKSPACE=false` remains an
  emergency rollback to the legacy page.
- **Follow-ups:** a Playwright journey asserts the no-jump-on-drag behaviour that jsdom cannot
  (its `ResizeObserver` stub is a no-op). If the legacy page is retired after rollout, delete
  `LegacyPlanLayout`.

## References

- Spec: `docs/specs/canvas-first-plan-workspace.md`; plan: `docs/plans/canvas-first-plan-workspace.md`.
- ADR-0029 (app-shell / navigator), ADR-0026 (TSLD canvas), ADR-0004 (frontend state), ADR-0028 (pen).
- Primitives: `apps/web/src/components/ui/{panel-resizer,use-resizable-panel-prefs,use-media-query}.ts(x)`;
  workspace: `apps/web/src/components/layout/workspace/*`; flag: `apps/web/src/config/env.ts`.
