# @repo/interchange

## 0.3.0

### Minor Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add Microsoft Project **MSPDI (`.xml`) import** (ADR-0050, Stage C2 M3 — pure package). A second parser

  - adapter (`mspdi-parser`, `mspdi-calendar`, `mspdi-adapter`, `importMspdi`) feed the **same**
    format-agnostic canonical model the XER path produces, so the mapper, validate/repair/report, graph-size
    ceilings and report shape are reused unchanged — MSPDI is a parser, not a second pipeline. Maps the MS
    Project vocabulary: `<Task>` (incl. `<Summary>`→`WBS_SUMMARY` + outline-level parentage, `<Milestone>`,
    `PT#H#M#S` durations, `<ConstraintType>` 0–7, `<PercentComplete>`/actuals/remaining), nested
    `<PredecessorLink>` (link types 0–3, tenths-of-a-minute lag), `<Calendar>` week-days + exceptions,
    `<Resource>` (types 0–2) and `<Assignment>`. Parsing uses `fast-xml-parser` configured for untrusted
    input — `processEntities: false` (no entity expansion → no billion-laughs / XXE), external entities
    inert, plus byte + node-count caps — with typed, user-safe rejections. `.mpp` (proprietary binary) is
    rejected with a guiding message to export MSPDI XML instead. The CPM engine + recalc parity golden suite
    are untouched. API routing + web `.xml` acceptance land separately.

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire Microsoft Project MSPDI import through the stack (ADR-0050, Stage C2 M3). A new format-agnostic
  `importSchedule` entry point in `@repo/interchange` detects the interchange format (Primavera P6 XER vs
  MS Project MSPDI XML) from the bytes and routes to the matching orchestrator — both produce the same
  import graph + report, so callers stay format-blind. The interchange commit/dry-run endpoints now call
  `importSchedule` instead of the XER-specific path, so an uploaded `.xml` MSPDI file imports through the
  exact same review→commit pipeline as `.xer` (an unrecognised file gets a single user-safe rejection). The
  web **Import from file…** dialog accepts `.xer` **or** `.xml`, with updated copy and the unparseable-file
  message naming both formats. On by default under the existing `VITE_SCHEDULE_INTERCHANGE` flag.

### Patch Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Bound the total number of dated exceptions a single MSPDI `<Calendar>` may
  accumulate (`MAX_CALENDAR_EXCEPTIONS`, enforced during accumulation and failing
  closed with a reported drop). The existing per-range day bound stopped one
  hostile `<TimePeriod>`, but a file could pack many maximal ranges to amplify a
  small upload into millions of exception objects — an unbounded memory
  amplification reachable from the read-only dry-run. The importer now stays
  memory-bounded regardless of input.

## 0.2.0

### Minor Changes

- [#123](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/123) [`522b838`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/522b838be2b3fc3ff94c36b6b4fc9d7e77d310a6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extend the XER import pipeline to a materially-complete P6 network (ADR-0050, Stage C2 M2 — pure
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
