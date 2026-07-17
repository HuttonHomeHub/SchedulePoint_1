---
'@repo/api': minor
'@repo/types': minor
---

CPM **duration types** now drive the resource-units triad (M7 rung 4, ADR-0040). An activity carries a
`durationType` (FIXED_DURATION_AND_UNITS_TIME (default) / FIXED_DURATION_AND_UNITS / FIXED_UNITS /
FIXED_UNITS_TIME) and a driving resource assignment carries a `unitsPerHour` rate; editing any one of
{duration, units, units/time} recomputes the correct **other** field via the pure `resolveTriad`
function so `Units = Duration × Units/Time` stays true — and for FIXED_UNITS / FIXED_UNITS_TIME the
**duration is derived** from the driving resource's units ÷ rate and fed to the CPM engine unchanged
(the engine is untouched; the no-rate path is byte-identical). The recompute runs at the write boundary,
in one optimistic-locked transaction spanning the activity + its driving assignment: an activity duration
edit recomputes the assignment's units/rate; an assignment units/rate edit (with an `editedField`) can
recompute the owning activity's duration — each bumping the sibling's `version`, documented per-endpoint.
Boundary rejects: negative `unitsPerHour` (N19, `@Min(0)` + DB CHECK) and a zero rate on a units-driven
recompute (N20, 422 `UNITS_PER_HOUR_ZERO`, before any division). Additive DTO fields (`durationType`,
`unitsPerHour`, `editedField`) + response exposure; new shared types `DurationType` / `EditedField`.
