---
'@repo/interchange': minor
---

Add the XER→canonical→import-graph mapper and validate/repair/report pipeline to `@repo/interchange`
(ADR-0050, Task 1.3). The pure, engine-free pipeline is: an **XER→canonical adapter** (P6 field names,
`TT_*`/`PR_*` enums, hours→working-minutes coercion, a pragmatic `clndr_data` calendar parser), a
**canonical→import-graph mapper** (a package-local SchedulePoint-shaped graph — weekday minute shifts,
dated exception windows, keyed activities/dependencies), and the ADR-0035 **validate/repair/report**
step (dangling-edge drop, duplicate `(pred,succ,type)` de-dup, deterministic cycle-break to honour the
ADR-0021 DAG invariant, duplicate-code suffixing, unit coercion, unmapped-kind + dropped-table
reporting). A single `importXer` orchestrator returns a domain-valid import graph plus a fully-populated
`InterchangeReport` — nothing is silently dropped. Still no user-facing surface (the API module + review
UI are later M1 tasks); the CPM engine and its recalc parity golden suite are untouched.
