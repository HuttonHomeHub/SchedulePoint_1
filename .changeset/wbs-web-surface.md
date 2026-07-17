---
'@repo/web': minor
---

Flagged web surface for **WBS summaries** (M5-epic F8, ADR-0038 / ADR-0035 §24). Behind
`VITE_ADVANCED_ACTIVITY_TYPES` (off by default), the activity form's Type picker now offers **WBS
summary** alongside Level of Effort: choosing it hides the Duration/Expected-finish inputs (a summary's
dates roll up from its branch) and explains the roll-up. A new flag-gated **WBS parent** picker nests any
activity under one of the plan's existing summaries — round-tripping `parentId` through create and update,
excluding the activity itself, and keeping a seeded parent visible under an honest label if it isn't in
the list (the honest-selector pattern). The picker distinguishes loading, an honest load error, and a
resolved-empty plan (which guides the planner to create a summary first) as separate states, and the
WBS-summary explainer describes the real nesting flow (open each activity in the branch and set its WBS
summary to this one). The engine/API/conformance for WBS rollup are already live (F5–F7); this only lets a
planner pick the type and set the parent. Canvas summary-bar rendering and navigator-tree visual nesting
remain deferred (TECH_DEBT #37).
