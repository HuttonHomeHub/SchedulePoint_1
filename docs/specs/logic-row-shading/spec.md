# Feature Spec + Plan: The Logic tab shades a pen-less Planner's Edit and Remove (#535)

- **Status:** Draft — awaiting the product owner's approval
- **Author(s):** Claude, for the product owner
- **Date:** 2026-10-20
- **Tracking:** `docs/TECH_DEBT.md` #535
- **Roadmap link:** none — a defect in an existing surface
- **Related ADR(s):** [ADR-0062](../../adr/0062-activity-editor-convergence-logic-resources-notes-as-tabs.md), [ADR-0083](../../adr/0083-shaded-form-fields.md), [ADR-0105](../../adr/0105-a-register-row-is-not-a-spec.md), [ADR-0111](../../adr/0111-a-primitives-keyboard-contract-is-reviewed-before-release.md)

## 0. Why a spec

`ActivityLogicPanel` and `DependencyTable` each gain a prop, which changes two components' public
contracts (an ADR-0105 trigger). The change also decides where focus goes when the pen is taken
(CLAUDE.md §19.13: accessibility, component and UX reviewers before merge).

No API, schema, flag, Playwright config or CI change. `@repo/web` patch, one changeset.

## 1. The problem, re-verified 2026-10-20

Read, not run:

- `apps/web/src/features/dependencies/components/ActivityLogicPanel.tsx` builds `editHandlers`
  (`onEdit`, `onRemove`, `onNudgeLag`) only when `canManageLogic` is true, and mounts the edit and
  remove dialogs only then.
- `apps/web/src/features/dependencies/components/DependencyTable.tsx` adds its Actions column only
  when both `onEdit` and `onRemove` are passed.
- `ActivityEditorSession.tsx` passes `canManageLogic={gating.logic.writable}`, so a Planner without
  the pen gets a table with no Actions column, while the Add a link form beside it is shown shaded
  with the reason. If the pen is taken while focus is on a row's Edit or Remove, the button
  unmounts and focus falls to `<body>` (WCAG 2.4.3).

This is the same shape #64 fixed for assignment rows (#1077).

## 2. What changes (acceptance criteria)

- **AC1 — Viewer: unchanged.** A member whose role can never write links sees today's table with
  no Actions column and no Add a link section.
- **AC2 — Planner without the pen: buttons stay, shaded.** Each row keeps its Edit and Remove
  buttons, `aria-disabled="true"` and described by the same reason sentence the Add a link form
  shows (the existing `gating.logic.reason`, "Start editing to change this activity" or the holder's
  name). The
  buttons stay in the tab order. Pressing one does nothing (a click guard, as `AssignmentRow` does).
- **AC3 — Focus stays when the pen goes.** If the pen is taken while focus is on a row's Edit or
  Remove, the same button keeps focus and becomes shaded.
- **AC4 — An open Edit or Remove dialog closes when the pen goes**, and focus returns to the row's
  (now shaded) button that opened it. Today the dialog is unmounted outright, which also drops focus.
- **AC5 — The lag nudge does nothing while shaded.** Shift + ← / → on a shaded button writes
  nothing, and the "Tip: … nudges that link's lag" line stays hidden, as today.
- **AC6 — The older Logic dialog (flag-off `DependencyEditor`) is unchanged.** It passes no reason,
  so it keeps today's behaviour.

## 3. Design

Copy #64's split exactly:

- `ActivityLogicPanel` gains `roleCanManageLogic?: boolean`. Rows shade when
  `!canManageLogic && manageLogicReason !== undefined && roleCanManageLogic === true`. Absent, the
  panel behaves exactly as today (the safe answer when a host cannot tell role from pen).
- `ActivityEditorSession` passes `roleCanManageLogic={!gating.logic.roleDenied}` — the field #64
  added for this purpose.
- The panel wraps the two tables in the existing `FieldGateProvider`, exactly as #64 wrapped the
  assignment list, so the reason sentence prints once above both tables.
- `DependencyTable` reads that gate (as `AssignmentRow` does through `resolveFieldGate`). When it is
  shut, the Actions column's buttons render `aria-disabled` and `aria-describedby` the sentence, and
  their handlers and the nudge are inert. Its only prop change is that `onEdit`/`onRemove` may now be
  passed to a reader who cannot use them; their types do not change.
- The edit and remove dialogs stay mounted while the rows are shaded, with `open` also requiring
  `canManageLogic`, so the native `<dialog>` closes and hands focus back rather than unmounting.

**Rejected:** hiding the Actions column for everyone but a writer (today's behaviour, the defect);
shading for Viewers too (the owner chose the summary-for-Viewers split on #64).

## 4. Plan and tests

One small PR:

1. The two components and the host, as above.
2. Unit tests (`ActivityLogicPanel.test.tsx`): Viewer has no Actions column; pen-less Planner has
   shaded buttons described by the reason; a click and Shift + → write nothing; flipping
   `canManageLogic` true → false keeps the focused button focused (AC3); an open Edit dialog closes
   and focus returns to its button (AC4).
3. A journey step in `apps/web/e2e-edit/pen-handoff.spec.ts` or the activity-editor suite (whichever
   already drives the Logic tab with the pen), releasing the pen server-side while a row's Edit is
   focused and asserting it stays focused and `aria-disabled` — the same move #64's journey makes.
4. Docs: close #535; drop the "does not yet" sentence from `docs/DESIGN_SYSTEM.md` "Editing a row
   in a list"; a dated line in `docs/DECISIONS.md`.
5. Reviewers: accessibility, component, UX (CLAUDE.md §19.13), findings folded before merge.

**Size:** about half a day.
