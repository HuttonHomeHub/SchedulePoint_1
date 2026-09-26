# M0 measurement: zero-duration tasks (#384)

What M0 of [the plan](./implementation-plan.md) ran, and what it found. Every figure here was
produced by a command named beside it; nothing in this file is a reading of the code.

## M0-T1: population

`apps/api/scripts/measure-zero-duration.mts`, run with
`pnpm --filter @repo/api exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-zero-duration.mts`.
Pure: every count is from a `SeedSpec` or from `importSchedule`'s output, never from a database. The
plan named `scripts/measure-zero-duration.mts`; it sits in `apps/api/scripts/` beside the #381
harness because a root `.mjs` cannot import the seed CLI's TypeScript builders.

It read **87 SeedSpecs** (fixture, 20 capability plans, the NetPoint reference, 63 pairwise cases,
scale at 500 and 2,000) and **2 import fixture files** (`p6_torture_test_v1.xer`,
`fc7-rich-export.pre-epic.xer`). **There is no MSPDI fixture file**: the MSPDI suites build their XML
per test (`packages/interchange/src/mspdi.fixtures.ts`), so there is no catalogue of MSPDI plans to
count. The control (spec E15) found both `A7550` and `N6`, so it would have thrown otherwise.

| Type (`durationMinutes = 0`) | Count | Where                                                                                                            |
| ---------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------- |
| `TASK`                       |     3 | fixture `A7550`; `capability-network-shape` `N6`; the torture XER import's `A7550` (the same activity, imported) |
| `RESOURCE_DEPENDENT`         |     0 | none                                                                                                             |
| `LEVEL_OF_EFFORT`            |    37 | fixture 5, types-and-wbs 2, pairwise 7 cases × 1, scale 4 + 14, torture import 5                                 |
| `WBS_SUMMARY`                |   242 | every summary (the spec stores 0 for a summary by definition)                                                    |
| `HAMMOCK`                    |     0 | none                                                                                                             |

The `LEVEL_OF_EFFORT` and `WBS_SUMMARY` counts are the stored field, not a finding: both types take
their span from other activities (ADR-0035 §21, ADR-0038), so `0` is how they are stored.

| Zero-duration `TASK`       | Assigned | Placed | Constraint / external | Predecessor | Carries project finish                 | Monday date |
| -------------------------- | -------- | ------ | --------------------- | ----------- | -------------------------------------- | ----------- |
| fixture `A7550`            | no       | no     | no                    | yes         | no                                     | none        |
| network-shape `N6`         | no       | no     | no                    | yes         | no                                     | none        |
| torture XER import `A7550` | no       | no     | no                    | yes         | not scheduled; not an open end (proxy) | none        |

**Verdict on the spec's defaults.**

- **Single activity only: holds.** No source has more than one zero-duration `TASK`, against the
  default's reopen threshold of 20. The deployed count is M0-T4's to measure.
- **The action offers `TASK` only: holds, and nothing needs filing.** Zero-duration
  `RESOURCE_DEPENDENT` rows: **0**, so no `docs/TECH_DEBT.md` row is filed.
- **The catalogue has no resourced zero-duration task** (E15 confirmed by run); M0-T6 adds `Z`.
- **No stored date on any zero-duration task is a Monday**, because none has a stored date at all.
  FC-3's Monday shape is therefore not present in the catalogue today; it lands with M0-T6's `Z`
  only if that row is given a date, and otherwise has to be built by FC-3's own cases.

**After M0-T6** (the same harness, re-run once `Z` was added): **4** zero-duration `TASK`s. The new
one, `capability-types-and-wbs` `Z`, is assigned (`TW_CREW`), has a predecessor (`T2`), is not placed
or constrained, has no stored Monday date, and **does carry the project finish** (its finish equals the engine's `projectFinishOffset`, at
`T2`'s finish). It is the catalogue's only resourced zero-duration task.

## M0-T2: engine characterisation

`apps/api/src/modules/schedule/engine/compute.zero-task-date.spec.ts`, a new file (no existing engine
spec was edited, so `pnpm check:engine-parity` reports `0 changed`). Run with
`pnpm --filter @repo/api exec vitest run src/modules/schedule/engine/compute.zero-task-date.spec.ts`:
**68 passed**.

| Case    | What it pins                                                                                                                                                                                                                                                             | Result |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| (a)     | A zero-duration task reached `FS` from a task ending Fri 9 Jan and one reached `SS` from a task starting Mon 12 Jan: identical offsets, floats and dates; both read Mon 12 Jan.                                                                                          | holds  |
| (b)     | `finishMilestoneDisplayIndex` applied to the SS-reached task's offset gives A's finish offset − 1, i.e. Fri 9 Jan, a day before the work it is tied to starts. A `FINISH_MILESTONE` SS-after B reads 9 Jan. At the data date the rule's floor keeps it on the data date. | holds  |
| (c)     | 4 calendars × 5 fields × 3 dates = 60 cases. `TASK` at D and `FINISH_MILESTONE` at D−1 (calendar day): same offsets and floats for Z, same results for every other activity and edge. `START_MILESTONE` at D: identical to the `TASK`, dates included.                   | holds  |
| (d)     | Mon–Fri, D = Mon 19 Jan: a `FINISH_MILESTONE` at Sun 18 (calendar day) and at Fri 16 (working day) both equal the `TASK` at D. No instant comparison separates the two shifts (spec E34).                                                                                | holds  |
| control | Every (c) case asserts the field reached the engine: the `TASK` with the field differs from the `TASK` without it, and, where D−1 is working, the `TASK` at D differs from the `TASK` at D−1.                                                                            | holds  |

### Red runs

| Mutation                                                                                         | Result                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test side: the (c) `FINISH_MILESTONE` at D instead of D−1 (the plan's named red check)           | **55 of 60 red.** The 5 that stay green are the exception calendar at D = Mon 12 Jan, where D is itself non-working: the start of D and the end of D both roll forward to the same Tuesday minute, so the two readings coincide. Recorded in the file's docblock.                |
| Test side: the (c) `START_MILESTONE` at D−1 instead of D                                         | 30 red (the `START_MILESTONE` limb of each case whose D−1 is a working day).                                                                                                                                                                                                     |
| Engine side: rule 1a wired in (`compute.ts` `reportIndex` applied to a zero-duration `TASK` too) | 62 failed, 6 passed. (a) goes red, but only on its date assertion (`earlyStart` `2026-01-09` against `2026-01-12`); its FS-against-SS equality still holds, because rule 1a moves both tasks' reported day together. `compute.ts` restored with `git checkout`, confirmed clean. |

### What the plan said that did not hold exactly

- M0-T2's red check predicts the whole of (c) goes red. It does not: 5 of 60 stay green, and they are
  green for a reason (a non-working D), not a defect in the suite. The plan's wording is left; this
  file and the spec's docblock carry the correction.
- (a) is not a discriminator for decision 1a by equality alone. Its date assertion is. The case
  asserts both, so it did go red against rule 1a.

## M0-T7: `check:engine-parity`

### The oracle for the row-lookup extraction

`NOT_ITEMS`, `rowNumber` and the two-level `sections` merge moved from `check-debt-status.mjs` into
`scripts/lib/doc-register.mjs` (`registerSections`, `detailedRows`, `openDetailedRow`, and
`statusToken`, which A2 and the new gate share). There is no `check-debt-status.test.mjs`, so the
oracle is two things, both run:

1. `node scripts/lib/doc-register.test.mjs` passes with its existing 28 cases **unedited** (the diff
   removes no line of that file; three new cases were added below them, 31 in all).
2. `node scripts/check-debt-status.mjs --report` prints byte-identical output before and after
   (`cmp` of the two captures), on two registers:
   - the real `docs/TECH_DEBT.md`: exit 0, identical;

     ```text
     check:debt-status — REPORT ONLY (not yet armed; see M4)
     158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.

     check:debt-status: OK. 158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.
     ```

   - a copy carrying five faults, one per assertion family (#384's status line removed, #385 at
     `##`, #388 renumbered to 387, #389's status `closed`, #390's heading annotated `RESOLVED`),
     run from a scratch tree holding the pre-change script and module and a scratch tree holding the
     post-change ones: exit 1 from both, identical. A clean register is a weak oracle for a parser
     that has to find faults, which is why the second run exists.

     ```text
     ✗ A9: the parser sees 158 numbered rows but the raw document declares 157 column-0 **Status:** lines. Some row has no declaration of its own — A1 names it.
     ✗ A10: "## 385. A cross-plan successor may start on the day its upstream finis" is not in the canonical row form. …
     ✗ A1: docs/TECH_DEBT.md:11712 "384. A zero-duration task and a finish milestone at the same" has no **Status:** line.
     ✗ A2: docs/TECH_DEBT.md:11758 status "closed" is not one of open / deferred / standing / unverified. …
     ✗ A3: docs/TECH_DEBT.md:11768 heading is annotated "RESOLVED". …
     ✗ A4: row number 387 is used twice — docs/TECH_DEBT.md:11736 and :11747. …
     check:debt-status: FAIL — 6 finding(s). 158 detailed rows (157 with a status, 1 without), …
     ```

### The gate's mutation sweep

`scripts/check-engine-parity.test.mjs` (14 cases) runs the real `runGate` against throwaway git
repositories. Each mutation below was applied to the gate or the shared module, the suite run, and
the file restored; the suite was green again afterwards.

| Mutation                                                  | Cases that went red                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| M1 limb 2 compares nothing (`normaliseSpec` returns `''`) | (1) `expect` changed beside a docblock edit                             |
| M2 limb 2 compares raw text (no `stripComments`)          | (2) docblock-only edit; both blind-spot pins                            |
| M2b limb 2 strips but keeps blank lines                   | (2) (its docblock grows by a line and a `//` line is added)             |
| M3 limb 1 removed                                         | (3) one character in `compute.ts`; the added-snapshot case              |
| M4 limb 3 removed                                         | (4) row absent; (6b) row `deferred`                                     |
| M5 new-spec exemption removed                             | (5) a new engine spec file                                              |
| M6 `registerSections` reads `sections(md, 2)` only        | (6) #384 in its real `###` form, and every case that needs limb 3 green |
| M6b `openDetailedRow` ignores the status                  | (6b)                                                                    |
| M7 "skipped" when the engine diff is empty                | the pinned positive case; (4); (6b)                                     |

M6 is the devops-reviewer O1 finding made concrete: under a level-2-only lookup the gate calls its
own declaration stale on a fixture holding #384 exactly as `docs/TECH_DEBT.md:11712` writes it.
The three new `doc-register` cases were also run against M6 and M6b and went red.

### Wiring

- `pnpm check:ci-roster` with the `package.json` script and no CI step:
  `✗ check:engine-parity is a root check:* script and runs in no CI step.` (exit 1). With the step
  after "Check the frontend-only boundary": `OK. 21 check:* gates, 20 in CI` (exit 0).
- `scripts/prepush.sh` derives its roster from `package.json`'s `check:*` keys, so the gate runs
  there with no edit to that file.
- On this branch: `check:engine-parity: OK. checked 44 engine files for "zero-duration-task"
(#384): 0 changed since origin/main, 0 existing spec(s) compared.`
