---
'@repo/api': minor
---

Teach the CPM engine the six moderate schedule constraints. The forward pass
clamps early dates (`SNET`, `FNET`, `MSO`, `MFO`) and the backward pass clamps
late dates (`SNLT`, `FNLT`, `MSO`, `MFO`), converting each `constraintDate` to a
working-day offset via the calendar port (ADR-0023). `MANDATORY_START` /
`MANDATORY_FINISH` are parked as their moderate equivalents (`MSO` / `MFO`) and
counted in the schedule summary's `parkedConstraintCount`. A constraint that the
logic cannot satisfy surfaces as negative total float (and criticality), never
an error.
