---
'@repo/web': minor
---

feat(web): canvas-first authoring — inline timeline start-date control (ADR-0032, M2)

Behind `VITE_CANVAS_AUTHORING`: an inline start-date control in the toolbar's Frame group reads and
(pen-gated) writes the plan's `plannedStart` — the canvas day-zero origin — so a planner sets/adjusts
the timeline start next to the canvas instead of opening the Edit-plan dialog. A writer edits it via a
native date input; a read-only viewer sees the date as a focusable static read-out. Changing it
re-anchors the timeline. Uses the `useSetPlanStart` targeted PATCH.
