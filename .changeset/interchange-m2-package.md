---
'@repo/interchange': minor
---

Extend the XER import pipeline to a materially-complete P6 network (ADR-0050, Stage C2 M2 — pure
package). Beyond M1's core network, the canonical model + import graph now carry: the **WBS tree**
(`PROJWBS`→`WBS_SUMMARY` + `parentId`, prefixed `wbs:` key space), **activity constraints** incl.
secondary and `As-Late-As-Possible` (the full P6 `CS_*`→SchedulePoint `ConstraintType` map, with
`CS_EXPFIN` routed to Expected Finish and unrecognised kinds dropped-and-reported), **progress + status**
(`status_code`, actual dates, remaining duration, physical %, suspend/resume, expected finish), and
**resources + assignments** (`RSRC`→resources, `TASKRSRC`→assignments, `TT_Rsrc`→`RESOURCE_DEPENDENT`).
Because the importer persists via `createMany` (bypassing the domain services), the validate/repair step
now enforces the invariants the services would: WBS parent resolution + acyclicity + summary-carries-no-logic,
constraint type/date pairing, progress consistency (status derivation, N08/N18, resume≥suspend, percent
clamps), and assignment rules (dangling drop, `(activity,resource)` de-dup, MATERIAL-never-drives,
at-most-one-driver-per-activity) — every fix reported, nothing dropped silently. Additive; the CPM engine
and recalc parity golden suite are untouched. API persistence of the new fields lands separately.
