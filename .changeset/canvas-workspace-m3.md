---
'@repo/web': minor
---

feat(web): canvas-first plan workspace — M3 header overflow menu (ADR-0030)

Consolidate the plan workspace header's lower-frequency chrome — **Edit plan, Baselines,
Calendar** — into a single "⋯" **overflow menu** (the shared WAI-ARIA APG `Menu` primitive),
replacing M1's interim `<details>` disclosure. Baselines and Calendar now open in the shared
modal `Dialog`; Edit plan is shown to writers only. The header stays slim and canvas-first:
plan identity + Recalculate + the pen banner + the schedule summary. Still off by default
behind `VITE_CANVAS_WORKSPACE`; frontend only.
