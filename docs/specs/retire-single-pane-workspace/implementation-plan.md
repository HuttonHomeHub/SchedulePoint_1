# Implementation Plan: Retire the below-`md` single-pane plan workspace

- **Status:** Draft — awaiting product-owner approval (ADR-0131). Not approved.
- **Spec:** [`feature-spec.md`](feature-spec.md)
- **Date:** 2026-10-08
- **Flag:** none (ADR-0088 D1). **Entry point:** the plan route below 768 px after Continue anyway.
  **Journey:** `e2e-narrow-shell` (ADR-0081).

## ADR-0105 triggers crossed

These are why this needed a spec and not a register row:

- **A component's public contract changes.** The `hostsPlanSlots` prop is removed from three
  exported components in `activity-bottom-panel.tsx`. `WorkspaceViewToggle` is deleted.
- **A user-facing control is removed.** The **Workspace view** radiogroup goes below 768.
- **Playwright suites change.** Three suites change: `narrow-shell`, `activities-panel-scroll` and
  `dock`. No config or CI step changes.
- **There is no schema change**, so no database-architect run is needed.

## Breakdown

### Epic: one plan-workspace layout at every width

### Milestone M0 — Measure, and get the accessibility answer (no product change)

ADR-0113 and ADR-0142 apply: measure the problem before building the remedy.

**Task M0-T1 — Confirm the revisions defect in a browser.**

- Steps:
  1. Open a plan at 700 × 900 after Continue.
  2. Choose Analysis → Compare revisions.
  3. Record what renders.
- Expected: no panel (spec §0, item 2).
- If a panel does render, strike that claim from the spec before M1.
- Complexity XS · Risk: the claim is wrong. That is cheap to learn here.

**Task M0-T2 — Readings, throwaway harness, not committed.**

- At 700 × 900, 640 × 844, 640 × 480, 320 × 720 and 767 × 1024, record for today's layout and for a
  local patch with the branch removed:
  - canvas height;
  - foot-row height;
  - the expanded panel's visible row count;
  - each dock's width and whether its content scrolls sideways;
  - the document's `scrollWidth − clientWidth`.
- Re-read #466 at 320 in the patched layout.
- Write the results to `docs/specs/retire-single-pane-workspace/m0-measurement.md`.
- Complexity S · Dependencies: none.
- Risk: the revisions dock's pickers do not reflow below 380 (`REVISION_PANEL_MIN_WIDTH`). If so, M1
  adds a stack rule for them.

**Task M0-T3 — Accessibility-reviewer agreement.**

- Put spec §3 "WCAG 1.4.10" and the M0-T2 readings to accessibility-reviewer. Ask Q2's restated
  question.
- Record the answer in the spec and the ADR draft.
- **M1 does not merge without it.**
- Complexity XS.

### Milestone M1 — Retire the layout (one PR, releasable)

**Task M1-T1 — Delete the branch.**

- Steps:
  1. Remove `MD_QUERY` (`plan-workspace-toolbar.tsx:155-156`), `isWide` and `pane` (`:666-671`), and
     `:2509-2558`. The `:2360-2508` stack becomes unconditional.
  2. Delete `workspace-view-toggle.tsx` and its import (`:37`).
  3. Update the comments at `:247`, `:1084-1085`, `:1715` and `:2364`.
- Complexity S.

**Task M1-T2 — Remove `hostsPlanSlots`.**

- Steps: remove the prop from `ActivityBottomPanel`, `PlanActivitiesFootRow` and
  `ActivityPanelCollapsedBar` (`activity-bottom-panel.tsx:199-229`, `:414-427`, `:494-495`,
  `:511-524`).
- Tests:
  - delete `canvas-dock.test.tsx:128-142` and `activity-bottom-panel.test.tsx:48-53`;
  - keep a `CanvasDock` in-place-fallback case if one exists elsewhere, and add one if not, because
    the fallback is still the registry's contract (UX_STANDARDS "Two hosts, one mechanism").
- Complexity S · Risk: component-reviewer must confirm no other caller passes the prop. Grep on
  2026-10-08 found only `plan-workspace-toolbar.tsx:2556`.

**Task M1-T3 — Bound each dock by the body (AC-2.2).**

- Steps: one pure helper,
  `dockWidth(stored, min, bodyWidth) = min(stored, max(min, bodyWidth − CANVAS_MIN_WIDTH), bodyWidth − SPLITTER)`,
  used by the four clamps (`:715-719`, `:736-740`, `:755-759`, `:775-779`).
- If M0 shows the revisions pickers do not reflow, add a container-query stack inside the revisions
  panel.
- Complexity S · Tests: unit tests for the helper at 320, 640, 768 and 1024 body widths.

**Task M1-T4 — #468, subject to Q1.**

- Steps: in the clamp at `:801-808`, when the panel is expanded and
  `bodyHeight < CANVAS_MIN_HEIGHT + PANEL_MIN_OPEN`, let the canvas row's minimum yield. The panel's
  maximum becomes `bodyHeight − a small floor`, with the floor stated and justified in the constant's
  docblock (ADR-0151).
- Collapsing restores the diagram.
- Complexity S–M · Risk: the canvas's own `min-h-[240px]` (`TsldPanel.tsx:3279`) also has to yield.
  Two minimums in two files is the class ADR-0110 records, so both change together.
- Tests: a unit test on the clamp; the journey reading at 640 × 480.

**Task M1-T5 — Journeys (the gate).**

- `narrow-shell.spec.ts`:
  - `:406` becomes **Expand activities panel**;
  - FR-4's comment (`:196-215`) states that the facts are in the foot row;
  - add one block at 700 × 900, 640 × 844 and 320 × 720 that:
    - opens each of the four docks and asserts it is visible;
    - asserts the Expand control is `pointerReachable`;
    - asserts no sideways document scroll;
    - runs axe with `target-size`.
  - The revisions assertion is **verified red** against today's code first (ADR-0110).
- `activities-panel-scroll.spec.ts:271-306`: use Expand and re-title.
- `dock.spec.ts:223-245`: rewrite the docblock. The assertion stays.
- Comment-only updates:
  - `m0-bands.spec.ts:46-52`;
  - `playwright.float-paths.config.ts:42`;
  - `e2e-toolbar/toolbar.spec.ts:23`;
  - `data-table.tsx:604`.
- Run `scripts/e2e-local.sh web:narrow-shell` and `web:workspace-chrome` before pushing (§19.8).
- Complexity S–M.

**Task M1-T6 — Docs in lock-step.**

- A new ADR: "The plan workspace has one layout at every width". It:
  - records the 1.4.10 reading and the reviewer's answer;
  - supersedes the responsive rule in ADR-0030 (`:87`) and ADR-0031 (`:244`);
  - adds one line to CLAUDE.md §16.
- Notes on:
  - ADR-0030;
  - ADR-0179's Consequences (`:221-223`).
- Text updates:
  - `UX_STANDARDS.md:340-343` (delete the single-pane sentence);
  - `UX_STANDARDS.md:374-379` (the activities row is now always mounted);
  - `m0-measurement.md` payoff #10, marked done;
  - `TECH_DEBT.md` #466 and #468, closed or re-scoped from the M0 readings.
- **`docs/specs/gantt-coarse-pointer/device-checklist.md` does not change** (spec §5).
- Changeset: `@repo/web` minor.
- Complexity S.

## Sequencing & slices

M0 → M1. M0 changes nothing shipped. M1 is one PR and is releasable: it removes a layout and adds no
new one.

## Testing summary

- **Unit:** the dock-width helper; the panel clamp (Q1); the `CanvasDock` fallback.
- **Journeys:** narrow-shell (extended), workspace-chrome (`activities-panel-scroll` and `dock`).
- **Unchanged at 1024 and up:** the `e2e-workspace-fit` command-surface sweep must stay green. It
  never enters the branch.
- **Not run by this analysis:** no Playwright or DB-backed test was run to write this plan.

## Reviews during build

- **accessibility-reviewer:** M0-T3, and the built surface before merge.
- **component-reviewer:** the `hostsPlanSlots` removal.
- **ux-reviewer:** the 640 / 320 readings.
- **performance-reviewer:** optional. Narrow opening no longer mounts the hidden table, but no claim
  is made without a reading.
- **No ADR-0111 review is needed.** No shared primitive's keyboard contract changes, and
  `SegmentedControl` keeps its other callers. Whether it has any is checked in M1-T1; if it has none,
  it is still a primitive and stays.

## Definition of Done (per task)

The Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).

## Risks & assumptions (rollup)

| Risk                                                                                       | L / I   | Mitigation                                                 |
| ------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------- |
| The accessibility reviewer does not agree                                                  | low / high | Fallback: keep the branch and add the revisions case (spec §4.6) |
| The revisions panel does not reflow below 380                                              | med / med | M0-T2 reads it; M1-T3 adds a stack rule                    |
| The table regresses at short narrow heights if Q1 is "no"                                  | high / med | Q1's recommendation; or state the regression in the changeset |
| The revisions defect is not real (read, not run)                                           | low / low | M0-T1                                                      |
| #466 moves rather than closes                                                              | med / low | M0-T2 re-reads it at 320                                   |
| Short-height crowding by the wrapped band (pre-existing, both layouts)                     | — / med | Out of scope; recorded in the ADR so it is not read as fixed |
