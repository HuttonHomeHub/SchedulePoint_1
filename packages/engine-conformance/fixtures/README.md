# Conformance fixtures

The vendored P6-class conformance fixture and its hostile-input companion. **Do not edit these by
hand** — they are a versioned contract consumed by `../src` and (later) the differential harness in
`apps/api`. Changing them is a reviewed change that must keep `../src/schema.ts` in step.

| File | What it is |
| --- | --- |
| `p6_torture_test_v1.json` | The fixture. Calendars, WBS, activities, logic, resources, assignments, steps, expenses, codes, UDFs, scheduling options, 13 scenarios, and a `coverage_index` mapping every feature tag → the objects that exercise it. |
| `negative_cases.json` | **Keep separate.** 18 hostile inputs — loops, self-loops, duplicate edges, bad actuals, a zero-working-hour calendar (the hang test), an impossible mandatory pair, a lead before the data date, a 100,000-hour lag. Load one at a time; assert the engine rejects/repairs/reports, never hangs/crashes. |
| `csv/*.csv` | The same data as flat tables (activities, relationships, calendars, resources, assignments) for quick import or eyeballing. |
| `TEST_MATRIX.md` | The human-readable map: what every object is trying to break, and how the 13 scenarios each flip exactly one scheduling option. |
| `tools/generate_fixture.py` | The upstream generator (reference only — not run in CI). |
| `tools/validate_fixture.py` | The upstream structural validator (reference only). `../src/validate.ts` is the CI-run TypeScript port. |

## Provenance

Authored by the product owner (developed with the help of a Claude chat) as a formal validation
benchmark for SchedulePoint's CPM/PDM engine. `schema_version`: **1.0**. Durations are stored in
**hours** (not days) — with calendars from 8 h/day to 24 h/day, "days" is not a viable storage unit.

## Revisions

`schema_version` pins the **shape**; `fixture.revision` (+ `revision_note`, both required by
`../src/schema.ts`) pins the **content**. The filename never changes for a content revision.

- **Revision 2** (2026-08-28): CAL-05's window widened to 01-Oct → 30-Oct-2026 (was 05 → 16 Oct).
  The original window starved the TT.10 chain in both passes — 144 h against 156 h forward, and
  8,610 working minutes at-or-before A10500's `MANDATORY_FINISH` against the 9,360 the backward
  pass needs — so the fixture could not be scheduled by the engine it exists to test
  (`docs/TECH_DEBT.md` #205a; measurement in `docs/specs/fix-slice-2026-08/m-e0-measurement.md`).
  Every change flows generator → vendored JSON → CSVs, and
  `../src/fixture-csv-consistency.spec.ts` gates the JSON and `csv/calendars.csv` against
  drifting apart. The `.xer` mirror (which the generator does not emit and nothing in this
  repository reads) was hand-amended in step: CAL-05's name and its daily exception serials
  (46296–46325).
- **Revision 1**: the fixture as first vendored.

## No golden dates — by design

The fixture deliberately ships **no expected output dates**. It specifies *inputs and intended
behaviours*; the correct dates are established the no-oracle way (first-principles for deterministic
cases, documented SchedulePoint semantics for the ambiguous ones — ADR-0035), not by importing into
Primavera P6. See ADR-0034 for the methodology and `TEST_MATRIX.md` for the per-object intent.
