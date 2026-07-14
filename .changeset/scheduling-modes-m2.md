---
'@repo/web': patch
---

feat: scheduling-modes M2 — navigation vs data-edit split (ADR-0033)

Behind the default-off `VITE_SCHEDULING_MODES` flag — **no user-visible change** until it is enabled.
De-overloads the single inline TSLD timeline date picker into two clearly-separated controls so that
"looking at a date" no longer silently re-anchors the schedule (ADR-0033, Sub-feature 1):

- **Go to date** — a labelled navigation popover that pans the canvas so the chosen date sits at the
  left edge. Pure view state: it issues no request, persists nothing (CQ-1), and is offered to every
  role, read-only viewers included. Backed by a new imperative `goToDate(iso)` on the canvas control
  handle and the pure `panToDate` viewport helper.
- **Project start** — the persisted schedule anchor (`plannedStart`), now explicitly labelled and kept
  as the pen-gated data control; read-only viewers see it as a static read-out.

Flag-off, the single "Timeline start" picker renders exactly as before.
