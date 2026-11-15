# Implementation Plan: The plan workspace scales to fit below 1280 × 800

- **Status:** Approved — 2026-11-15 by the product owner.
- **Spec:** [`feature-spec.md`](feature-spec.md) · **ADR:** [ADR-0222](../../adr/0222-the-plan-workspace-scales-to-fit-below-a-1280-by-800-window.md)

## Breakdown

### Epic

Design the app at 1280 × 800 and scale the plan workspace to fit below it, never undoing the reader's zoom or text
size.

### Milestone M0: Measure (no product code)

A throwaway Playwright script in Chromium, results in `m0-measurement.md`.

- **Task 1 — The designed box.** Measure the workspace's box at 1280 × 800 with the Explorer at its default width
  (the `Wd` and `Hd` of ADR-0222 D2). _Complexity S._
- **Task 2 — The mechanism.** Inject a scale of 0.75 and 0.8 into the workspace both as a transform and as CSS
  `zoom`, at 1024 × 600 and 1366 × 636, and record: whether a click on a known bar selects it; drag distance
  against pointer distance; ResizeObserver and `getBoundingClientRect` values; menu, tooltip and dialog positions;
  Gantt sticky columns and scroll; canvas sharpness (pixel comparison of a label at 0.8 against 1).
  _Complexity M. Risk: Chromium's `zoom` changed its coordinate model in 2024; the reading settles it._
- **Task 3 — Zoom and text signals.** Under CDP `Page.setFontSizes` (200 %), a user style sheet (`font-size:
200%`), and every way of simulating browser zoom that headless or headed Chromium offers here, record root font
  size, `innerWidth`, `outerWidth`, `devicePixelRatio` and `visualViewport.scale`. _Complexity S._
- **Stop rules.** (a) If neither mechanism keeps clicks and menus correct with one pointer helper, stop and ask the
  owner. (b) If no browser zoom can be simulated, D4 item 2 is built only if its signal is still sound on paper,
  and the switch (D4 item 3) carries the guarantee; the owner is told.

### Milestone M1: The scale (one pull request, web minor)

- **Task 1 — Context and wrapper.** `useWorkspaceScale`, the scaled wrapper in `plan-workspace.tsx`, the floor,
  the pointer-down hold, the text-size and zoom guards. Unit tests for the calculation and each guard.
  _Complexity M._
- **Task 2 — Layout answers to the workspace.** Container variants for the workspace in `globals.css`;
  `useWorkspaceMedia`; convert the workspace's window variants and `matchMedia` callers; a structural test that
  lists the files allowed to use window media queries inside the workspace (ADR-0213 D4's pattern).
  _Complexity L. Risk: the toolbar's promotion ladder and the deck's tail rule are pinned by measurement suites
  that stub `matchMedia` by exact string (`breakpoints.ts`, `DECK_TAIL_ROOM_QUERY`); those harnesses move with them._
- **Task 3 — Canvases.** One pointer helper used by every pointer handler in `TsldCanvas.tsx`, the minimap, the
  resource strip and the swimlane gutter; backing stores sized by the scale. _Complexity M._
- **Task 4 — Targets.** `icon-sm` and `icon-row` take 32 px inside a scaled workspace. _Complexity S._
- **Tests.** Journeys at 1024 × 600, 1152 × 720 and 1366 × 636: the workspace fills its box, the toolbar's rows
  match 1280 × 800, a click selects the bar under it, a drag moves it the right distance, axe `target-size`
  passes (SC-1, -2, -3, -7). A guard journey for 200 % text and a user style sheet (SC-4). Every existing web
  suite, including `web:minimap` and `web:workspace-fit`, run locally before push.

### Milestone M2: The switch, the notice and the gates (one pull request, web minor)

- **Task 1 — The switch.** `workspace-scale-switch.tsx` and `workspace-scale-pref.ts`, at the end of the foot
  row; keyboard, name, pressed state, tooltip; stored per device and shared across tabs (SC-6). _Complexity S._
- **Task 2 — The notice's copy** (ADR-0222 D8). _Complexity S._
- **Task 3 — Gates.** The designed sweep moves to 1280 × 800 (`e2e-workspace-fit`), the floor-state journeys
  assert the designed layout there; the 1024 journeys stay as the scaled band. _Complexity M._
- **Task 4 — Docs.** CLAUDE.md §12 ("designed from 1280 × 800 up"), `docs/DESIGN_SYSTEM.md`,
  `docs/UX_STANDARDS.md`, `docs/FRONTEND_ARCHITECTURE.md`, ADR-0179 and ADR-0118 amendment notes, the TEST_PLAYBOOK
  if a plan is named. _Complexity S._

### Milestone M3: Make 1280 × 800 fit (one pull request)

ADR-0179 D10's milestone, at the new size: measure the workspace at 1280 × 800 with and without a selection,
fine and coarse, and fix anything under its floor (the diagram's 350 px, the toolbar's rows). Each fix found is
built and released here; none is parked. _Complexity M; scope set by the measurement._

## Sequencing & slices

M0 → M1 → M2 → M3, each released before the next starts. M1 is shippable alone (scaling with the guards); M2 adds
the switch that covers browsers M0 could not verify, so **M1 and M2 ship together** (Q3 was answered "shrink, with a
switch"), because without the switch a zoomed reader in such a browser would lose their zoom for one release.

## Definition of Done (per task)

The pre-push gate run (`scripts/prepush.sh`), the relevant `scripts/e2e-local.sh web:<suite>` runs, every check on
the pull request's head green after dedupe, a changeset, docs updated, and the accessibility basics checked
(ADR-0223 D1), with the full accessibility sweep at the end of the epic (ADR-0223 D3).

## Risks & assumptions (rollup)

- **Zoom detection may not be measurable here.** Headless Chromium has no page zoom. Mitigated by the switch.
- **Firefox and WebKit are not testable in this container.** The mechanism and guards are standard CSS and DOM;
  the switch is the fallback.
- **The toolbar's measurement harnesses** stub `matchMedia` by exact strings; converting them is the largest task.
- **Small text at 0.75 (9 px)** is a legibility cost the owner accepts with Q2.
- **The short-window rules stay** (ADR-0222 D9), so this epic deletes little code; retiring them is later work.
