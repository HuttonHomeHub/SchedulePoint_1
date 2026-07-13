---
'@repo/web': minor
---

feat(web): canvas-first plan workspace — M1 scaffold behind `VITE_CANVAS_WORKSPACE` (ADR-0030)

Introduces the layout skeleton for opening a plan directly in the app-shell workspace with
the TSLD canvas as the primary surface (ADR-0030, spec `docs/specs/canvas-first-plan-workspace.md`).
**Off by default** behind the new `VITE_CANVAS_WORKSPACE` flag — flag-off keeps today's stacked
plan-detail page byte-for-byte, so this ships dark.

With the flag on, the plan surface becomes a `PlanWorkspace`: a slim header (plan identity,
Recalculate, the edit-lock pen banner and schedule summary, with baselines + calendar behind a
disclosure), the TSLD canvas filling the workspace height (`TsldPanel` gains a `fill` mode), and
the activity table docked as a bottom panel (static height in M1; a draggable, collapsible
resizer lands in M2). The route-composed orchestration (queries, gating, TSLD edit callbacks) is
extracted into a shared `usePlanWorkspaceModel` hook so both the legacy page and the workspace
render identical behaviour — the flag only chooses the layout.
