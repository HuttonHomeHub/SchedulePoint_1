# @repo/engine-conformance

A **P6-class CPM/PDM engine conformance fixture**, typed loaders, and an **engine-free structural
validator** for SchedulePoint's scheduling engine. This is the vendored, engine-independent half of
the Engine Conformance & Validation Framework (see
[`docs/specs/engine-conformance-framework/`](../../docs/specs/engine-conformance-framework/) and
ADR-0034). The differential harness that drives the real engine lives in `apps/api` — this package
holds only what needs **no engine**: the fixture, its schema, and the structural checks.

## What's here

```text
fixtures/
  p6_torture_test_v1.json   # the fixture: 129 activities, 188 relationships, 8 calendars,
                            #   22 resources, 45 assignments, 13 scenarios, coverage_index
  negative_cases.json       # 18 hostile inputs (load one at a time; must reject/repair/report)
  TEST_MATRIX.md            # human-readable map: what every object is trying to break
  csv/                      # the same data as flat tables (import-friendly)
  tools/                    # the upstream Python generator + validator (reference only; not run in CI)
src/
  schema.ts                 # Zod schema pinned to schema_version — makes drift a reviewed change
  load.ts                   # loadFixture() / loadNegativeCases() — validated, typed
  validate.ts               # structural validator (TS port of tools/validate_fixture.py)
  coverage.ts               # feature-coverage completeness (the REQUIRED tag checklist)
```

## Usage

```ts
import { loadFixture, validateStructure, checkCoverage } from '@repo/engine-conformance';

const fixture = loadFixture(); // throws if the fixture shape has drifted from the schema
const { ok, errors, warnings } = validateStructure(fixture); // no dates computed — structure only
const coverage = checkCoverage(fixture);
```

## How CI uses it

`pnpm test` (via Turbo) runs this package's Vitest suite in the standard **quality** job — no
database, no browser, no engine. It **blocks merge** on a malformed or under-covering fixture. There
is deliberately **no golden-date assertion here**: the fixture asserts _inputs and intended
behaviours_, and the engine — judged in `apps/api` — is the thing measured on dates (ADR-0034).

## Fixture provenance & regeneration

The fixture was authored by the product owner (see `fixtures/README.md`) and is pinned to
`schema_version` `1.0`. The Python tools under `fixtures/tools/` are the **upstream reference** — the
canonical generator/validator — but CI runs the **TypeScript** port so no Python is added to the
pipeline. Re-running the generator is a **reviewed change**: update `src/schema.ts` in the same PR so
the loader tests catch any shape drift.

## Scope

The fixture is **P6-class** — most of it is intentionally _beyond_ SchedulePoint's current
working-day engine. It is a **north star and gap map**, not a commitment to full P6 parity. Which
behaviours are supported / partial / missing / out-of-scope is tracked in the capability matrix
(added in M0-B); the roadmap sequences the gaps behind the hour/shift-granular calendar rework.
