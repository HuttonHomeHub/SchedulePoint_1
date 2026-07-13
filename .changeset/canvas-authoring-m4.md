---
'@repo/web': minor
---

feat(web): canvas-first authoring — Add split-button + on-canvas milestones (ADR-0032, M4)

Behind `VITE_CANVAS_AUTHORING` (default-off): the plain "Add activity" toggle becomes an APG
menu-button **Add split-button** that arms the draw kind — **Task**, **Start milestone**, or
**Finish milestone** — so planners create milestones directly on the canvas. A milestone draw
collapses to a zero-duration point at the click; the workspace maps the chosen kind to a
zero-duration create. While adding, the button reads "Adding {kind}" and offers "Stop adding".

Flag-off the toolbar keeps the plain Add toggle byte-for-byte. Frontend only; no API/DB change.
