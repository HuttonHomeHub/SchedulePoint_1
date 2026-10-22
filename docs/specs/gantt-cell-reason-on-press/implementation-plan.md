# Implementation Plan: A read-only Gantt cell shows its reason when it is pressed

- **Status:** Approved — by the product owner, 2026-10-22, with all defaults
- **Spec:** [`feature-spec.md`](feature-spec.md) · **Tracking:** `docs/TECH_DEBT.md` #538
- **Date:** 2026-10-21 · **Size:** S (one PR) · **Flag:** none (ADR-0088 D1)
- **Changeset:** `@repo/web` **minor**: user-visible behaviour on shut Gantt cells, and a new
  `useTooltip` option and return value (a component's public contract).

One milestone, one PR, `main` releasable throughout. No `apps/api` change, so
`scripts/e2e-local.sh api` is not owed; `web:gantt-editing` and `web:gantt` are.

## Epic: Shut Gantt cells say why on press

### M1 — Request-only tips, wired to the shut cell and to F2 (S)

**Feature: `useTooltip` opens on request** (`components/ui/tooltip.tsx`)

- **T1.1 Red first** in `tooltip.test.tsx` (beside the `reason-echo` block, `:156-215`), under
  `opensOn: 'request'`: focus does not open; a click does not open; a touch long-press does not open
  and does not swallow the click; hover opens after 400 ms; `show()` opens at once and closes any
  other open tip; the next `keydown` closes it; Escape closes it with `preventDefault` only (still
  reaches an outer handler); the panel is `aria-hidden` and the trigger gets no `aria-describedby`.
  Default (`'focus'`) suites stay green unchanged, which is the proof every other caller is untouched.
- **T1.2 Implement:** the option, `show` on `TooltipApi`, the capture `keydown` close while open under
  `'request'`, guards in `onFocus` (`:439`), `onClickCapture` (`:448`) and `onPointerDown` (`:389`).
  Update the docblock (`:11-50`, `:51-98`).

**Feature: `GanttCell` uses it** (`features/gantt/components/GanttCell.tsx`)

- **T1.3 Red first** in `GanttCell.test.tsx`: replace `:73-78` (asserts `title`) with "a shut cell has
  no `title`"; add: double-click on a shut cell shows `[data-tooltip]` with the reason and does not
  call `onBegin` (extends `:85-90`); a single click and a focus show no tip; `aria-describedby` still
  points at one node with the reason (`:62-71` unchanged); a writable cell's double-click still calls
  `onBegin` and shows no tip (`:94-99`); a shut cell with `reason: null` shows nothing.
- **T1.4 Implement:** the hook call, the merged ref, `tooltip` rendered, `title` removed (`:213`),
  `onDoubleClick` shows the tip when shut (`:226`), a `show` handle registered with the panel.
  Rewrite the docblock comment at `:207-212`, which argues for the `title`.

**Feature: F2 refusal** (`features/gantt/components/GanttPanel.tsx:999-1023`)

- **T1.5 Red first** in `GanttPanel.editing.test.tsx` (beside `:239-269`): F2 on a row whose editable
  cells are all shut shows the first shut cell's tip and announces its reason exactly once; F2 with a
  writable cell begins editing and shows no tip; ArrowDown after a refused F2 closes the tip and moves
  the row; Enter on the row selects it and shows no tip.
- **T1.6 Implement:** the fallback branch after the column loop, through the handle map (the
  `menuHandles` pattern, `:931`, `:940`) and the panel's existing live region (confirm the owner of
  `announce` first; `resizeBar` uses `drag.announce`, `:904`).

**Journey (ADR-0081, the capability's gate)** — `e2e-gantt-editing/grid-edit.spec.ts`, the test at `:605-659`

- **T1.7** Replace `:649` (`toHaveAttribute('title', refusal)`) with `not.toHaveAttribute('title')`, and
  after the double-click at `:653` add: `[data-tooltip]` is visible and contains `refusal`, beside the
  existing "no textbox" assertion (`:654`) and the API read (`:658`). Run it against the pre-change
  build first: the visible-tip assertion must fail.
- **Affected journeys, checked:** `grid-edit.spec.ts:649` (changes as above);
  `e2e-gantt/disclosure.spec.ts:184-186` (compares two writable cells' `title`, both absent before and
  after, so it still passes); `e2e-gantt-editing/touch.spec.ts:262-267` (a bar's `span[title]`, not a
  cell, unaffected). No journey reads a Gantt cell reason by `getByText`, so the tip's duplicate text
  causes no strict-mode ambiguity.
- **e2e to run:** `scripts/e2e-local.sh web:gantt-editing`, `web:gantt`, and `web:toolbar` plus
  `web:workspace-chrome` (the other `reason-echo` callers, default mode, as a regression check).

**Docs (same PR)**

- ADR-0204: dated Amendment per spec §4; correct the arrow-key premise in "Not in scope" (`:72-73`).
- `CLAUDE.md` §16: ADR-0204 line parenthetical only (no new ADR, so `check:adr-coverage` is unaffected).
- `docs/COMPONENT_LIBRARY.md`: the tooltip section gains `opensOn: 'request'` and `show()`.
- `docs/TECH_DEBT.md` #538: closed, citing the PR.
- `docs/specs/gantt-coarse-pointer/device-checklist.md`: **checked, unchanged** (spec §3); the PR body and
  the hand-off say so. No owner test step is created.

**Reviewers before ship:** **accessibility-reviewer** (§19.13 / ADR-0111: a shared primitive's open and
close rules change, and F2 gains a refusal; it must execute in a real browser), **component-reviewer**
(the option's name and shape), **performance-reviewer** (one inert hook per editable cell in view),
ux-reviewer (copy and placement of a tip on a 28 px row).

**Risks**

- (a) Focus churn: a click focuses the cell and the row's selection may move focus; if the cell blurs
  between the two clicks of a double-click, the tip could close as it opens. The journey step is the check.
- (b) The tip sits over the next row and hides its value while open; it closes on the next key or press. Accepted.
- (c) The capture `keydown` close must not swallow the key: it closes only, no `preventDefault`. T1.1 pins it.
- (d) CQ-1 overturned to "single click too": add a click branch in `GanttCell` and a unit case; no other change.

**Definition of Done:** `pnpm prepush` green; the two e2e suites above run locally; reviewers' blocking
findings folded; changeset added. Nothing in this plan asks the owner to test, measure or check
anything on a host or device.
