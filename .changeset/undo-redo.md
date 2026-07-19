---
'@repo/web': minor
---

Undo / redo for plan authoring (ADR-0048) — a client-side, per-plan, per-pen-session command stack,
shipped behind a **new default-off flag `VITE_UNDO_REDO`** (byte-identical until an operator opts in).
Undo replays plan **inputs** through the existing mutation hooks and the normal auto-recalc redraws, so
the CPM engine and the recalc parity gate are structurally untouched; every inverse rides the unchanged
pen (423) + RBAC + org-scope + optimistic (409) gates.

- **Coverage**: reposition, relane, activity update, create, leaf delete (re-create), dependency
  add/remove, `visualStart`, and auto-arrange (one reversible step). A pointer drag / nudge burst
  coalesces to a single undo step; a WBS-summary cascade delete truncates history rather than offering a
  broken partial undo (id-stable cascade restore is a deferred follow-on).
- **Surface**: pen-gated Undo/Redo in the TSLD toolbar (disabled with a reason when there's nothing to
  undo/redo, entity-named labels), keyboard `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` · `Ctrl+Y` (scoped to the
  workspace, inert in fields and while a modal is open, suppressing browser Back/Forward), the shortcuts
  sheet, and live-region announcements.
- **Conflict-safe**: a 409/404 aborts non-destructively, refetches server truth and clears redo; a 423
  clears the stack and hands off to the shared edit-lock banner. Linear history, depth 50, cleared on
  plan switch / pen release / reload.

WCAG 2.2 AA; covered by unit tests and a flag-on Playwright journey (`playwright.undo.config.ts`, wired
into CI). Set `VITE_UNDO_REDO=true` to enable the surface in an environment.
