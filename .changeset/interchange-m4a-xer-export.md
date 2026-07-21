---
'@repo/interchange': minor
---

Add the pure XER **export** substrate (ADR-0050 M4a) — the engine-free reverse of the import pipeline. A
SchedulePoint export graph maps to the shared canonical model, emits the P6 `PROJECT`/`CALENDAR`/`TASK`/
`TASKPRED` tables (reversing the `TT_*`/`PR_*` enums, working-minutes→hours, and the `clndr_data`
work-pattern blob), and serialises to a re-parseable UTF-8 `.xer` via `exportXer`, alongside a fidelity
`InterchangeReport` that names every best-effort drop (WBS/constraints/progress/resources land in M4c). A
round-trip harness proves export → re-import structural equivalence for the core network. The CPM engine
and the recalc parity golden suite are untouched (export never invokes the engine).
