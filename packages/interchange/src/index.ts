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
 * M1 ships the canonical model + report types only; the XER parser (Task 1.2) and the mapper +
 * validate/repair/report implementation (Task 1.3) are exported from here as they land.
 */
export * from './canonical.js';
export * from './report.js';
