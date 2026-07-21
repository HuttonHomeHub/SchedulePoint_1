---
'@repo/interchange': minor
'@repo/api': patch
---

feat(interchange): rich-scope export parity (WBS, constraints, progress, resources) for XER + MSPDI (ADR-0050 M4c)

Both exporters now serialise the **full plan**, not just its core network. `emitXerFromCanonical` and
`emitMspdiFromCanonical` reverse the import adapters field-for-field so a rich plan round-trips (export →
re-import → structural equivalence):

- **WBS** — `PROJWBS` rows + `wbs_id` parentage (XER, reversing the `wbs:<id>` key convention) and
  `<Summary>` + `<OutlineLevel>` pre-order tasks (MSPDI).
- **Constraints** — `cstr_type/date` (+ `cstr_type2/date2`), ALAP and expected-finish (XER — all 8 types
  exact); MSPDI's single `<ConstraintType>` slot + `<Deadline>` (mandatory types + a secondary constraint
  reported as approximations).
- **Progress** — status/percent/physical/actuals/suspend/resume/expected-finish/remaining (XER — exact);
  MSPDI progress fields (no suspend/resume/expected-finish, one percent-complete measure — reported).
- **Resources + assignments** — `RSRC`/`TASKRSRC` with the driving flag + production rate (XER — exact);
  MSPDI `<Resources>`/`<Assignments>` (no driving flag / rate — reported).

The obsolete M4a/M4b **drop** findings for these categories are removed; a category reports a finding only
when it is genuinely lossy. The API export path was already reading the rich fields into the export graph,
so no service change was needed. The CPM engine and recalc parity golden suite are untouched (export is a
pure read).
