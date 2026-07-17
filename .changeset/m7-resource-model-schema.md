---
'@repo/api': minor
'@repo/types': minor
---

M7.1 resource-model schema foundation (ADR-0039, the resource dimension of the CPM engine). Adds an
org-scoped `resources` library (a sibling of the calendar library: name, optional code, a
`kind` enum LABOUR/EQUIPMENT/MATERIAL, an optional own `calendarId`) and a `resource_assignments`
join (activity ↔ resource with `budgetedUnits` + an `isDriving` flag), plus a new `RESOURCE_DEPENDENT`
`ActivityType` member and an engine-owned `resource_driver_missing` flag on `activities` (its writer is
the M7.2 engine rung). DB invariants: partial-uniques enforce ≤1 driving assignment per activity and no
duplicate active `(activity, resource)`; a CHECK backs the N14 non-negative-units reject. Fully additive
and byte-parity — with no resource present, every existing plan recalculates unchanged. `@repo/types`
mirrors the new `ActivityType` member. Schema + migration only; the resources module, assignment API,
and §23 scheduling follow.
