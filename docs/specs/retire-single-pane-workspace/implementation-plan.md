# Implementation Plan: Retire the below-`md` single-pane plan workspace

- **Status:** Approved 2026-10-08 by the product owner ("approve with your recommendations"). Builds after short-screen M-A (ADR-0180) has merged.
  after the accessibility, UX and component reviews ("agree with changes").
- **Spec:** [`feature-spec.md`](feature-spec.md)
- **Date:** 2026-10-08
- **Flag:** none (ADR-0088 D1). **Entry point:** the plan route below 768 px after Continue anyway.
  **Journey:** `e2e-narrow-shell` (ADR-0081).
- **Depends on:** [`short-screen-vertical-budget`](../short-screen-vertical-budget/feature-spec.md)
  M-A (ADR-0180), **which lands first**. It owns #468 and every panel-height rule. This plan adds none.
  **This plan's ADR is ADR-0181.**

## ADR-0105 triggers crossed

These are why this needed a spec and not a register row:

- **A component's public contract changes.** The `hostsPlanSlots` prop is removed from three
  exported components in `activity-bottom-panel.tsx`. `WorkspaceViewToggle` is deleted.
- **A user-facing control is removed.** The **Workspace view** radiogroup goes below 768.
- **Playwright suites change.** Three suites change: `narrow-shell`, `activities-panel-scroll` and
  `dock`. No config or CI step changes.
- **There is no schema change**, so no database-architect run is needed.

## The viewport matrix

Used by M0 and the M1 journey. All readings are taken after Continue anyway.

| Viewport   | Why it is in the matrix                                                   |
| ---------- | ------------------------------------------------------------------------- |
| 767 × 1024 | Just under the old breakpoint                                             |
| 700 × 900  | `dock.spec.ts` and the narrow-shell banner                                |
| 640 × 844  | `activities-panel-scroll.spec.ts`                                         |
| 640 × 480  | 1280 × 960 at 200 %                                                       |
| 640 × 360  | 1280 × 720 at 200 %, with a slim browser frame                            |
| 640 × 300  | 1280 × 720 at 200 % in a normal browser frame (the reviewers' worst case) |
| 320 × 720  | The 1.4.10 width                                                          |

## Breakdown

### Epic: one plan-workspace layout at every width

### Milestone M0 — Measure, and get the accessibility answer (no product change)

ADR-0113 and ADR-0142 apply: measure the problem before building the remedy.

**M0-T1 — Confirm the revisions defect in a browser.**

- Steps:
  1. Open a plan at 700 × 900 after Continue.
  2. Choose Analysis → Compare revisions.
  3. Record what renders.
- If a panel does render, strike the claim from the spec before M1.
- Complexity: XS.

**M0-T2 — Readings, with a throwaway harness that is not committed.**

- Take each reading at every row of the matrix, for today's layout and for a local patch with the
  branch removed:
  - canvas-row height and stage width;
  - foot-row height;
  - the foot row's `scrollWidth − clientWidth`;
  - the rectangle of **Expand activities panel**, of **Recalculate**, and whether each is
    `elementFromPoint`-reachable;
  - the expanded panel's visible row count, and the `DataTable` region height with and without the
    `md:` prefix (AC-3.4);
  - each dock's width, and whether its content scrolls sideways. This covers Revisions, which should
    stack below its `@sm` container (`RevisionComparePanel.tsx:361`), and Health and Float paths at
    about 300 px;
  - the document's `scrollWidth − clientWidth`;
  - the height of the time ruler band. This sets the collapsed-state `inert` floor (spec AC-2.4,
    "Height");
  - whether `<main>` scrolls, or the foot row is clipped, with the panel collapsed at 640 × 300
    (spec AC-3.2).
- With ADR-0180's swap in place, at 640 × 300, 640 × 360 and 640 × 480 with the panel expanded:
  - the visible row count;
  - with a dock open as well, confirm the short-screen rule: Expand closes the dock and its toggle is
    `aria-pressed=false`; opening a dock while swapped collapses the panel first;
  - with a dock having taken the row at 640, press Fit: `withDiagram` closes the dock and the stage is
    no longer `inert`.
- Re-read #466 at 320 in the patched layout.
- Write everything to `docs/specs/retire-single-pane-workspace/m0-measurement.md`.
- Complexity: S.

**M0-T3 — Accessibility-reviewer confirmation.**

- Steps:
  - confirm the W3C 1.4.10 quotations in spec §3 against the page;
  - review the M0-T2 readings;
  - record the answer in the spec and the ADR draft.
- **M1 does not merge without it.**
- Complexity: XS.

### Milestone M1 — Retire the layout (one PR, releasable)

**M1-T1 — Delete the branch.**

- Remove:
  - `MD_QUERY` (`plan-workspace-toolbar.tsx:156`);
  - `isWide` and `pane` (`:666-671`);
  - the narrow branch (`:2509-2558`).
- The `:2360-2508` stack becomes unconditional.
- Delete `workspace-view-toggle.tsx` and its import (`:37`).
- Reword the comments at `:247`, `:1084-1085`, `:1715` and `:2364`.
- Complexity: S.

**M1-T2 — Remove `hostsPlanSlots`.**

- Remove it from `ActivityBottomPanel`, `PlanActivitiesFootRow` and `ActivityPanelCollapsedBar`
  (`activity-bottom-panel.tsx:199-229`, `:360`, `:414-427`, `:474-495`, `:511-524`).
- `onCollapse` stays optional for its other callers; the docblock at `:227-228` is reworded.
- Tests:
  - delete `canvas-dock.test.tsx:127-156`. It is vacuous without the prop, and the fallback is
    already covered at `:22-35` and `:95-124`;
  - **rewrite** `activity-bottom-panel.test.tsx:48-58` as "renders BOTH outlets, always", with its
    `:13-21` docblock to match;
  - tighten `plan-workspace-toolbar.test.tsx:395-399` to `[data-activities-bar]`.
- Complexity: S.
- Risk: another caller passes the prop. A grep on 2026-10-08 found only
  `plan-workspace-toolbar.tsx:2556`.

**M1-T3 — The dock cap (spec AC-2.2).**

- Add a pure helper:
  `dockBounds({ stored, min, bodyWidth }) → { width, cap, min, squeezed }`.
  - `bodyWidth === 0` means the body has not been measured yet. The helper applies no cap and sets
    `squeezed` to false.
  - Otherwise `cap = bodyWidth − SPLITTER_WIDTH` (`panel-resizer.tsx:14`).
  - `squeezed = bodyWidth − min − SPLITTER_WIDTH < CANVAS_MIN_WIDTH` (spec AC-2.4).
  - `width = squeezed ? cap : min(stored, max(min, bodyWidth − CANVAS_MIN_WIDTH), cap)`. A squeezed
    dock takes the whole row, so no strip of `inert` stage is left beside it.
  - The returned `min` is `min(min, cap)`.
- Use the helper's results in three places:
  - the rendered width;
  - `PanelResizer`'s `min` and `max` (`:2382`, `:2414`, `:2438`, `:2462`);
  - the four `on*Resize` handlers (`:727`, `:747`, `:766`, `:786`).
- If `min ≥ cap`, the resizer is not rendered: the dock fills the row, so there is nothing to resize.
  Wherever a resizer is rendered, its handle is at least 24 px and it is keyboard-resizable.
- Add `max-w-full` on the four `PanelSurface` docks, as the visual bound for the first paint.
- **Render clamp only.** Persisted widths are never overwritten.
- Unit tests:
  - body widths 0, 320, 640, 768 and 1024;
  - `aria-valuemin ≤ aria-valuemax` in every case;
  - a stored 420 renders at the 319 px cap at a 320 body, and is still 420 in storage;
  - **640 with the revisions dock** (min 380): `640 − 380 − 1 = 259 < 360`, so `squeezed` is true
    and `width` is 639 — no 259 px dead strip;
  - 640 with the notes dock (min 280): `359 < 360`, so it is squeezed too. That reading is recorded
    so it does not surprise anyone.
- Complexity: S.

**M1-T4 — `inert` for squeezed regions (spec AC-2.4).**

- **Width:** when `dockBounds` returns `squeezed`, the dock's width is the cap (it takes the row) and
  the stage column gets `inert`.
- **Height, collapsed panel only:** below the ruler band's measured height (a constant with its M0
  reading in the docblock, per ADR-0151), the canvas row gets `inert`. With the panel expanded on a
  short body, ADR-0180's swap already hides the row.
- **Composition with ADR-0180's A1:** the short-screen spec owns the dock/panel rule on a short body:
  they are mutually exclusive and the later request wins. A dock is never hidden behind the swap.
  Unit cases at a narrow, short body:
  - with a squeezed dock open, Expand closes the dock (`aria-pressed=false`) and the panel takes the
    body;
  - with the swap active, opening a dock collapses the panel; the dock then takes the row and the stage
    is `inert`.
- **`withDiagram` covers the width case.** Extend the short-screen wrapper's condition to
  `swapActive || squeezed`. In the width case its first step closes the open dock through its
  existing close path, then runs `fn` on the next frame.
  - The canvas window `keydown` early return also applies while the stage is `inert`.
  - Tests:
    - unit: Fit with a squeezed dock closes the dock, then fits;
    - the short-screen structural test is reused, with the extended condition;
    - journey: at 640, open Health and press Fit; the dock is closed and the stage is not `inert`.
- Unit tests:
  - a ResizeObserver stub reporting 0 × 0 then real sizes. At 0 the helper treats the body as
    unmeasured, so nothing is inert by mistake on the first render. Once measured and squeezed, the
    region is inert;
  - removing `inert` restores tabbability.
- Complexity: S–M.
- Risk: `inert` on the stage while a canvas tool is armed. The armed-tool statement docks into the
  foot row, which is not inert. The component reviewer checks the Escape path (`TsldCanvas.tsx`
  window listener).

**M1-T5 — Short heights: ADR-0180 at every width (spec AC-3.2). No new panel-height rule.**

- **Withdrawn from the first revision:** the yielding minimum, `CANVAS_YIELD_MIN`, this plan's own
  copy of a dock/panel exclusion rule (the short-screen spec's rule is used instead, M1-T4) and any
  `TsldPanel.tsx` change. The short-screen spec owns the panel heights and
  measured the 160 px yield at 0 rows.
- What is left here:
  - check that ADR-0180's `shortBody` swap and its comment survive the branch deletion. The mechanism
    is the wide branch's; the old `:666-669` comment is moved into it;
  - **only if M0 shows the foot row clipped at 640 × 300 with the panel collapsed:** add a minimum
    height on the workspace body equal to the foot row, so `<main>` scrolls vertically. Agree it with
    the short-screen spec's owner first, because it touches the same body.
- Unit test: none, unless the body minimum is added, in which case one case.
- Complexity: XS–S.

**M1-T6 — Foot row at 320 (spec AC-3.3).**

- The plan facts wrap to a second line below a container width. They currently do not shrink:
  `plan-facts.tsx:107`, `:140` (`shrink-0`) and `:253` (`whitespace-nowrap`).
- The foot row must be allowed to grow:
  - it takes `flex-wrap`;
  - it keeps `min-h-9` as a floor only (`activity-bottom-panel.tsx:472`), never a fixed height;
  - it stays `shrink-0`, so the body gives up the height for the second line rather than clipping it.
- Expand and Recalculate stay `shrink-0`, in ADR-0110's give-way order.
- Expand keeps its tooltip and the name "Expand activities panel" verbatim (ADR-0117).
- Tests:
  - a unit test of the wrap class;
  - a journey assertion that the foot row's `scrollWidth − clientWidth ≤ 0` at 320 and 640.
- Complexity: S.

**M1-T7 — `DataTable`'s contained floor (spec AC-3.4).**

- `data-table.tsx:608`: `md:min-h-32` becomes `min-h-32`, and the comment at `:604-605` is rewritten.
- The journey asserts the region is at least 128 px with the panel open at 640 × 844.
- Complexity: XS.

**M1-T8 — Journeys (the gate).**

- `narrow-shell.spec.ts`:
  - `:406` becomes **Expand activities panel**;
  - FR-4's comment (`:196-215`) is reworded: the facts are in the foot row.
- A new block covering every matrix row from 700 × 900 down to 320 × 720 asserts:
  - each of the four docks opens and is visible;
  - Expand and Recalculate are `pointerReachable`;
  - neither the document nor the foot row scrolls sideways;
  - axe with `target-size`, including **a dock open at 320**;
  - at 640 × 300, 640 × 360 and 640 × 480 with the panel expanded, the table keeps at least one row
    under ADR-0180's swap. The row count is ADR-0180's to set.
- Keyboard checks for each dock at 320:
  - Tab order runs through the dock;
  - **Tab from the dock never lands on a zero-size element**;
  - Escape and Close behave as at 1024;
  - focus returns on Close;
  - focus stays on Expand / Collapse.
- **Verified red first** (ADR-0110):
  - against today's code, the revisions assertion fails;
  - with the cap in place but the `inert` rule removed, the zero-size Tab assertion fails.
- Other suites:
  - `activities-panel-scroll.spec.ts:271-306` uses Expand and is re-titled;
  - `dock.spec.ts:223-245` keeps its assertion, with the docblock rewritten.
- Comment-only updates:
  - `m0-bands.spec.ts:46-52`;
  - `playwright.float-paths.config.ts:42`;
  - `e2e-toolbar/toolbar.spec.ts:23`;
  - `e2e-workspace-fit/command-surface.spec.ts:836`;
  - `plan-facts-host.test.tsx:14`;
  - `plan-notes-reveal.test.tsx:10`;
  - `TsldCanvas.hidden-pane.test.tsx:9`.
- Run `scripts/e2e-local.sh web:narrow-shell` and `web:workspace-chrome` before pushing (§19.8).
- Complexity: M.

**M1-T9 — Comment and docblock sweep.**

- Reword these, as the reviewers reported them:
  - `plan-status-bar.tsx:11`, `:34-38`;
  - `plan-facts.tsx:19`;
  - `TsldLegendPanel.tsx:32`;
  - `TsldCanvas.tsx:1777`, `:2019` (the code stays; a hidden canvas is still possible);
  - `segmented-control.tsx:28` (the docblock example);
  - `scripts/measure-activities-panel.mjs:693` (limb N1, retired or re-described).
- Then run the grep from success criterion 1 (spec §1) and list each remaining hit in the PR.
- Complexity: S.

**M1-T10 — Docs in lock-step.**

- **ADR-0181**, "The plan workspace has one layout at every width". It:
  - records the 1.4.10 reading and the reviewer's answer;
  - states that short heights are ADR-0180's: its swap now applies at every width;
  - records short-height crowding by the command band as pre-existing;
  - states that `CanvasDock`'s fallback in place remains the contract for hosts without an outlet
    (`TsldPanel.tsx:2990`), though no production workspace path exercises it;
  - supersedes the responsive rule in ADR-0030 (`:87`) and ADR-0031 (`:244`);
  - adds one line to CLAUDE.md §16.
- Notes on ADR-0030, and on ADR-0179's Consequences (`:221-223`).
- `UX_STANDARDS.md`:
  - delete the single-pane sentence at `:340-343`;
  - **rewrite** the "fact relocates" bullet at `:374-379`;
  - add a closing note to "Two hosts, one mechanism".
- `TECH_DEBT.md`:
  - closing notes at `:5590` and `:5657-5662`;
  - #466 closed, or re-scoped from the M0 readings. #468 is ADR-0180's, so it is not touched here.
- `m0-measurement.md`: payoff #10 marked done, and #14 corrected (not a reflow rule that stays).
- **`docs/specs/gantt-coarse-pointer/device-checklist.md` does not change** (spec §5).
- Changeset: `@repo/web` minor.
- Complexity: S.

## Sequencing & slices

- **short-screen M-A (ADR-0180) → M0 → M1.** M0's short-height readings assume the swap exists. M0
  changes nothing shipped.
- **When M1 lands, the short-screen journey's case 7** (`short-screen-vertical-budget/
implementation-plan.md:79-80`) is re-run and rewritten in the same PR. It asserts that the
  single-pane layout is unchanged at 640 × 480 and 320 × 256 and that A1 is inert below `md`; both go
  false by design. Its cases 3 and 4 (commands while hidden, dock exclusivity) are added at 640.
- **Line references drift once short-screen lands.** That spec cites the narrow branch at
  `plan-workspace-toolbar.tsx:2533-2534`, and this one cites `:2347` and `:2509-2558`. Re-read every
  `plan-workspace-toolbar.tsx` line reference in this plan against the tree after M-A merges, before
  M1 starts.
- **M1 is one PR and is releasable:** it removes a layout and adds no new one. Inside it,
  M1-T3 to M1-T7 land before T1 deletes the branch, so no commit has the narrow width without the
  cap, `inert` or the foot-row fit.

## Testing summary

- **Unit tests:**
  - `dockBounds`, covering ARIA bounds and the stored value;
  - `inert` with a ResizeObserver reporting 0 px;
  - the width `inert` rule composed with ADR-0180's swap;
  - the foot-row wrap;
  - "renders BOTH outlets, always".
- **Journeys:**
  - narrow-shell, extended over the matrix, with keyboard checks and axe with a dock open at 320;
  - workspace-chrome (`activities-panel-scroll` and `dock`).
- **Unchanged at 1024 and up:** the `e2e-workspace-fit` sweep, and ADR-0180's own journeys at
  1024 × 600.
- **Nothing was run** to write this plan.

## Reviews during build

- **accessibility-reviewer:** M0-T3, and the built surface before merge (`inert`, focus, axe at 320).
- **component-reviewer:** the prop removal, `dockBounds`, and the `inert` and Escape interaction.
- **ux-reviewer:** the 640 / 320 readings, and a dock taking the row at narrow widths.
- **performance-reviewer:** optional.
- **No ADR-0111 review is needed:** no shared primitive's keyboard contract changes.

## Definition of Done (per task)

The Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).

## Risks & assumptions (rollup)

| Risk                                                                        | L / I      | Mitigation                                                                                                   |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| ADR-0180 slips, or changes its swap                                         | med / high | This plan does not start M1 until it lands; M0's short-height readings are re-taken against whatever shipped |
| ADR-0180's swap was never tested below 768 (its edge case said "unchanged") | med / med  | This plan's journeys at 640 × 300/360/480 are its first check there                                          |
| `inert` interacts badly with an armed canvas tool                           | low / med  | The statement lives in the foot row; Escape is checked by the component reviewer                             |
| A dock's content does not reflow at about 300 px                            | med / med  | M0-T2; a container-query stack in M1-T3                                                                      |
| The revisions defect is not real (read, not run)                            | low / low  | M0-T1                                                                                                        |
| #466 moves rather than closes                                               | med / low  | Re-read at 320 in M0-T2                                                                                      |
| Short-height crowding by the wrapped band (pre-existing, both layouts)      | — / med    | Recorded in the ADR so it is not read as fixed                                                               |
