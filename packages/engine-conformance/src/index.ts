/**
 * `@repo/engine-conformance` — the P6-class CPM/PDM engine conformance fixture, typed loaders, and an
 * engine-free structural validator (ADR-0034). Consumed as a **test asset**: the differential harness
 * that drives the real engine lives in `apps/api`; this package holds the fixture, its schema, and the
 * checks that need no engine.
 */
export * from './schema.js';
export { loadFixture, loadNegativeCases, fixturePath } from './load.js';
export { validateStructure, type StructuralResult } from './validate.js';
export { checkCoverage, REQUIRED_COVERAGE_TAGS, type CoverageResult } from './coverage.js';
