---
'@repo/web': minor
---

Notes M3 — the web surface (the Notes feature, ADR-0046) — **on by default** (`VITE_NOTES`, set it to
`false` to hide the web surface in an environment). It puts the live note-thread API (M2) in front of a
planner: attributed, time-ordered note threads on plans and activities — the weekly-progress "why", not
just the "what".

- **Thread + composer**: a newest-first `NoteThread` (cursor "Load more", loading/empty/error states)
  with a RHF + Zod `NoteComposer` (trimmed body, 1–5000, live character cue). Each `NoteItem` shows the
  author, timestamp and an "edited" marker; **Edit and Delete are offered only to the note's own author**
  — a non-author sees no affordance. Inline edit sends the optimistic `version` and handles the **409**
  ("updated elsewhere — review and edit again") and **403** ("you can no longer edit this note") paths by
  refetching the thread and announcing via `role="status"`.
- **Surfacing**: an activity **Notes** section in the Logic panel (beside Predecessors/Successors/
  Cross-plan links) plus a route-composed **note-count badge** on the activities-table row (fed by one
  batch counts query, not per-row); a plan **Notes** section on the plan detail route and both canvas
  workspaces (context-aware heading level, no outline skip).
- **Write-gating**: the composer/edit/delete render only for `note`-writers (Contributor → Org Admin);
  a Viewer sees a read-only thread. Notes are **not** plan-edit-lock gated.

Reuses design-system primitives (`TextareaField`, `Button`, `Badge`, `ConfirmDialog`, the announcer);
no one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management on inline-edit/delete,
`role="status"` async notices, distinguishing per-note action labels). Covered by component tests and a
flag-on Playwright journey (`playwright.notes.config.ts`, wired into CI). Setting `VITE_NOTES=false`
restores the prior behaviour (no sections mount, the counts query never fires, the badge is suppressed).
