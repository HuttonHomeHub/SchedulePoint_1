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
 * M1 ships the canonical model + report types and the XER parser/detector (Task 1.2); the mapper +
 * validate/repair/report implementation (Task 1.3) is exported from here as it lands.
 */
export * from './canonical.js';
export * from './report.js';
export * from './xer-parser.js';
