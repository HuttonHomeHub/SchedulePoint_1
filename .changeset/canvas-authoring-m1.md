---
'@repo/web': minor
---

feat(web): canvas-first authoring — blank draw-ready canvas (ADR-0032, M0–M1)

Behind the new `VITE_CANVAS_AUTHORING` flag (default-off; layered on `VITE_CANVAS_TOOLBAR`):

- **M0:** the flag + ADR-0032 + the flag-on Playwright scaffold (`test:e2e:authoring`).
- **M1:** a brand-new plan opens on an interactive, **blank draw-ready canvas** — the `TsldPanel`
  render gate is relaxed so the canvas mounts whenever there's a timeline anchor
  (`dataDate = plannedStart ?? today`), not only after a recalculation; uncalculated bars simply
  don't paint. Drawing the first activity on a start-less plan silently pins `plannedStart` to
  today (the canvas anchor) before the create, so the schedule dates stay coherent.

Flag-off keeps today's table-first behaviour byte-for-byte. Frontend only; no API/DB change.
