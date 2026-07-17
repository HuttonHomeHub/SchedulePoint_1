---
'@repo/web': minor
---

Activity form can create **Level-of-Effort** activities (M5-epic F4, ADR-0035 §21), behind
`VITE_ADVANCED_ACTIVITY_TYPES` (default off). When on, the Type picker offers "Level of effort"; picking
it hides the Duration and Expected-finish inputs (an LOE's duration is derived from its SS-predecessor →
FF-successor span) and explains that the span comes from its links. The picker otherwise offers only the
three fully-supported types (Task, Start/Finish milestone) — Hammock and the not-yet-built WBS-summary
are no longer offered — while a legacy/seeded value stays visible and selected when editing (the
honest-selector pattern). The engine, API and conformance proof for LOE are already live (F1–F3).
