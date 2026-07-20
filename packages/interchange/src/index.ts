/**
 * `@repo/interchange` — the pure, engine-free schedule-interchange substrate (ADR-0050).
 *
 * This package owns the **format-agnostic canonical model**, the per-format parsers (XER, then MSPDI),
 * the SchedulePoint mapper, and the ADR-0035 **validate / repair / report** contract — all as pure,
 * side-effect-free, fixture-tested functions. Persistence, authorisation and orchestration live in the
 * thin NestJS `interchange` module (a later M1 task) that consumes this package's compiled build
 * (ADR-0019) and reuses existing domain services. Nothing here touches the CPM engine or its recalc
 * parity golden suite.
 *
 * M1 ships the canonical model + report types, the XER parser/detector (Task 1.2), and the
 * mapper + validate/repair/report pipeline (Task 1.3): the XER→canonical adapter, the
 * canonical→import-graph mapper, the reject/repair/report validators, and the `importXer`
 * orchestrator that runs the whole pure pipeline end to end.
 */
export * from './canonical.js';
export * from './report.js';
export * from './xer-parser.js';
export * from './xer-calendar.js';
export * from './xer-adapter.js';
export * from './import-graph.js';
export * from './mapper.js';
export * from './validate.js';
export * from './import-xer.js';
