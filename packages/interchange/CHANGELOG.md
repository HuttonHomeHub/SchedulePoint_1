# @repo/interchange

## 0.1.0

### Minor Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Introduce the pure, engine-free `@repo/interchange` package (ADR-0050): the format-agnostic canonical
  schedule-interchange model (project / activity / relationship / calendar, M1 network scope) and the
  `InterchangeReport` shape, with shared Zod schemas. This is the parse → canonical → map →
  validate/repair/report substrate for XER / MS Project import; the XER parser, mapper, API module and
  review UI land in later M1 tasks. No user-facing surface yet (behind `VITE_SCHEDULE_INTERCHANGE`); the
  CPM engine and its recalc parity golden suite are untouched.

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the XER→canonical→import-graph mapper and validate/repair/report pipeline to `@repo/interchange`
  (ADR-0050, Task 1.3). The pure, engine-free pipeline is: an **XER→canonical adapter** (P6 field names,
  `TT_*`/`PR_*` enums, hours→working-minutes coercion, a pragmatic `clndr_data` calendar parser), a
  **canonical→import-graph mapper** (a package-local SchedulePoint-shaped graph — weekday minute shifts,
  dated exception windows, keyed activities/dependencies), and the ADR-0035 **validate/repair/report**
  step (dangling-edge drop, duplicate `(pred,succ,type)` de-dup, deterministic cycle-break to honour the
  ADR-0021 DAG invariant, duplicate-code suffixing, unit coercion, unmapped-kind + dropped-table
  reporting). A single `importXer` orchestrator returns a domain-valid import graph plus a fully-populated
  `InterchangeReport` — nothing is silently dropped. Still no user-facing surface (the API module + review
  UI are later M1 tasks); the CPM engine and its recalc parity golden suite are untouched.

### Patch Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the XER parser against prototype pollution / remote property injection. A `%F` field list is
  attacker-controlled, so a crafted `.xer` could declare a column literally named `__proto__`,
  `constructor` or `prototype` and — when used as a dynamic object key — pollute `Object.prototype`.
  Parsed rows are now a `Map<string, string>` rather than a plain object (`XerTable.rows` is
  `ReadonlyArray<ReadonlyMap<string, string>>`, read via `row.get(name)`), so an arbitrary file-supplied
  column name can never be written as an object property. Real imports are unaffected. Fixes two CodeQL
  `js/remote-property-injection` (high) findings.
