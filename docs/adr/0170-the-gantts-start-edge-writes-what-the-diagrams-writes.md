# ADR-0170: The Gantt's start edge writes what the diagram's writes, counted in working days

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** James Ewbank (product owner — CQ-1 answered **yes, in the same release as the
  handle** on 2026-10-02; CQ-2 and CQ-3 stand at their recommended defaults), with Claude Code
- **Amends:** ADR-0095 (lifts the deferral of the Gantt's start-edge resize recorded in its closing
  section), ADR-0134 (the arithmetic its implementation uses for a typed `Start` and `Finish`)
- **Builds on:** ADR-0052 §3 (the diagram's start-edge semantic), ADR-0148 (one planning surface; the
  modes are gone), ADR-0048 (undo), ADR-0028 (the pen), ADR-0088 D1 (no flag)
- **Spec:** [`docs/specs/gantt-start-edge-resize/`](../specs/gantt-start-edge-resize/feature-spec.md)
  (§4.8 is this ADR's outline; the milestone plan is beside it)

## Context

ADR-0095 shipped the Gantt as a working surface and deliberately left the **start-edge** resize out
(`docs/adr/0095-the-gantt-becomes-a-working-surface.md:234`): the gesture carried a mode-dependent
meaning, and the Gantt shows no mode. ADR-0148 deleted the two scheduling modes. The diagram's start
edge now has exactly one write — hand-place the start, keep the finish, no constraint
(`use-plan-workspace-model.ts:1375-1414`, `onTsldResize`'s `startDay` branch). The Gantt resize is
unbuilt, not blocked.

Reading the code to build it found a second problem that the new gesture would inherit. `durationDays`
is a **working-day** quantity, but three shipped Gantt writes that hold one end of a bar compute it as
**calendar** days: the finish-edge drag (`features/gantt/layout/drag-day.ts:62-75`,
`durationDaysForFinishAtX`) and both typed date cells (`features/gantt/model/cell-commit.ts:191`,
`:196`, via `calendarDaysBetween`). The diagram had the same defect, it was reported from the field and
fixed by converting the drawn span with `drawnSpanPlacement` on the plan's working-day predicate
(`features/tsld/render/snap.ts:93-108`; call site `TsldPanel.tsx:2671`). The Gantt was not fixed. A
start-edge drag built on the Gantt's helpers would announce "finish unchanged" and move the finish
whenever the bar crosses a weekend. `cell-commit.ts`'s docblock (`:132-140`) asserts that "the client
holds no calendar" and that this is "exactly as true of dragging a bar's edge" — false since the
diagram's fix.

Separately, the Gantt throws away every bar write's outcome: the host calls
`void model.onTsldReposition(…)` / `void model.onTsldResize(…)`
(`plan-workspace-toolbar.tsx:1026-1027`), so a stale-version refusal
(`use-plan-workspace-model.ts:1456-1459`) is never shown.

## Decision

- **D1 — The Gantt offers the start edge.** A left handle on an eligible bar calls the workspace's
  **existing** `onTsldResize({ activityId, startDay, durationDays })`, unchanged. One minimal `PATCH`
  carrying `visualStart` and `durationDays`; **no constraint is written** (ADR-0148 D6's reason).
  ADR-0095's deferral is lifted.
- **D2 — Every Gantt write that holds one end of a bar counts working days.** The finish-edge drag, the
  typed `Start` and the typed `Finish` convert a drawn span with the diagram's `drawnSpanPlacement` on
  the plan's working-day predicate (built once in the host from the plan calendar and `plannedStart`),
  so one question has one answer in both views. The start is rolled forward to a working day, as the
  diagram does. This amends ADR-0134's arithmetic: the ADR text never states calendar days, its
  implementation's docblock does, and the docblock is corrected. With no calendar loaded the helper
  returns the calendar span (`snap.ts:101`) — the pre-fix behaviour, only for that window. An activity
  on its own calendar is counted on the plan's, as on the diagram; the engine re-derives. That
  residual is shared, not new.
- **D3 — Eligibility is the diagram's, plus one rule for the start edge.** A bar offers a resize when
  `isResizeEligibleType` admits it (not a milestone, level-of-effort or WBS summary —
  `features/tsld/render/hit-test.ts:91-93`); the **start** edge additionally refuses an activity frozen
  by actuals (any actual start or finish; the engine's `isFrozenByActuals`,
  `apps/api/src/modules/schedule/engine/compute.ts:110-112`, which draws such an activity from its
  actual and ignores a hand-placed start), because a start-edge write there would save an inert
  placement, change the duration and move the **finish** — the opposite of the gesture's promise (CQ-2:
  product owner, default stands). The typed `Start` cell is **shut up front** — read-only with the same reason shown as its `title` (ADR-0083: shaded, not
  disabled), so the planner learns it before typing — and its commit still refuses with that reason as a backstop. **Level-of-effort
  loses its Gantt resize**, which today refuses only milestones (`GanttPanel.tsx:797`) and so writes a
  duration the engine does not use. The diagram allowed the same inert write on a started activity;
  that was filed as a `docs/TECH_DEBT.md` row (#431) rather than changed here. **Amended
  2026-10-03 (product owner, #431): the diagram now refuses the start edge too** — no start grab zone
  on a started bar, a spoken refusal if a start write is attempted anyway — through the same
  `isStartEdgeFrozen` rule and reason sentence, which now live in `features/tsld/render/hit-test.ts`
  and are imported by the Gantt. A **move** of a started activity is still allowed in both views.
- **D4 — The keyboard route is the typed `Start` cell; no new chord** (CQ-3: not answered, default
  stands). `F2` → `Start` → type → `Enter` already makes the start-edge write
  (`cell-commit.ts:196-210`), so ADR-0095 D4's rule — the keyboard route lands before the pointer
  gesture — was met by ADR-0134. The diagram binds no start-nudge chord, so a Gantt-only chord would
  make the views disagree. If one is wanted it lands in both together, under a CLAUDE.md §19.13
  review.
- **D5 — Narrow bars get no left handle.** Below 16 px (two 8 px handles) the left handle is not
  rendered, so narrow bars are unchanged and the typed cell is the route. The handle is an `aria-hidden`
  pointer affordance and relies on WCAG 2.5.8's Equivalent exception, as the diagram's bar-end zones do.
- **D6 — Outcomes are awaited, and the preview shows both edges.** The host awaits the workspace's
  outcome and announces after it (applied, conflict, failure), matching the diagram; the right edge gains
  the live preview the left edge ships with.
- **D7 — No flag; one release.** ADR-0088 D1. The working-day fix (M1) and the left handle (M2) are
  separate milestones and commits that ship in **one release** (CQ-1: product owner, 2026-10-02,
  overruling the plan's proposal of a release of their own for the fix).

## Alternatives considered

- **Build the gesture on the Gantt's existing calendar-day helper.** Smallest diff, and wrong: "finish
  unchanged" would be false for any bar crossing a weekend, reproducing a defect the diagram already
  fixed.
- **A new `Alt+Shift+←/→` chord.** The typed cell already satisfies WCAG 2.1.1 and the diagram has none.
- **A server-side "resize start" endpoint.** ADR-0052 rejected it for the diagram; the minimal `PATCH`
  already carries both fields.
- **Allow the start edge on started activities, as the diagram does.** Saves an inert placement and
  moves the finish.
- **Refuse on `MANDATORY_*` constraints in the drag, as the typed cell does.** Not done: the drag
  writes no constraint and the diagram does not refuse. The asymmetry with the cell
  (`cell-commit.ts:160-167`, which refuses because ADR-0134 D4 forbids overwriting a `MANDATORY_*`
  constraint from a cell) is recorded here rather than fixed in one view.
- **Fix the arithmetic as a release of its own.** Recommended in the spec and declined by the product
  owner: one release, two commits.

## Consequences

- Frontend only: no schema, endpoint, DTO or engine change. `computeSchedule` is byte-identical for every
  plan; `engine-import.structural.test.ts` and `check:frontend-only` stay green.
- Three shipped controls change what they write (finish-edge drag, typed `Start`, typed `Finish`): to
  what the diagram already writes. The changeset names it first, because it arrives in the same release
  as the handle.
- `GanttBarDrag.moveTo` / `resizeTo` become outcome-returning; a `resizeStart` is added.
- The existing `bar-drag.spec.ts` locator for the finish handle (`.cursor-ew-resize`, count 1) is
  re-pointed at `[data-bar-edge="finish"]`, because a second handle makes it 2.
- The diagram's start-edge and move writes on a started activity remained inert and were filed as
  debt (M1-T3). The start-edge half is closed (amended 2026-10-03, #431: one shared rule, the diagram
  refuses too); the move half stays open in `docs/TECH_DEBT.md` #431.
- M1 and M2 shipped together in web 0.157.0 (#757, 2026-10-02). CLAUDE.md §1's "substantially … the
  start-edge resize is deliberately absent (ADR-0095 D4)" was revisited in M3 from the code and now
  says the Gantt delivers the brief's §8 Must-have. The deferral sentence lives in ADR-0095's closing
  section, not in D4 (which is the `Alt+←/→` decision).

## References

- `docs/specs/gantt-start-edge-resize/`; predecessor `docs/specs/gantt-editing-gaps/`.
- `apps/web/src/features/tsld/components/TsldPanel.tsx:2665-2703` (the diagram's conversion and its
  announcement); `apps/web/src/features/tsld/render/snap.ts:93-108`.
- ADR-0023, ADR-0028, ADR-0033, ADR-0048, ADR-0052, ADR-0060 §6, ADR-0081, ADR-0088, ADR-0095, ADR-0134,
  ADR-0148, ADR-0162.
