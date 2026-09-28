# M5 record: the import advisory (#384)

What M5 of [the plan](./implementation-plan.md) built, and the runs that established it. Every
mutation below was applied to one file at a time from a copy, run, and restored from that copy.

## M5-T1: one producer, both orchestrators

`zeroDurationAdvisories(graph)` (`packages/interchange/src/advisories.ts`) runs over the final,
post-repair import graph and is called by `import-xer.ts` and `import-mspdi.ts`. Each advisory is
`{ code: 'ZERO_DURATION_TASK', entity: 'activity', sourceRef: <activity code>, detail }`. It is
never a finding, and the report carries no `advisories` key when there is nothing to advise
(FC-5 (a)).

**The predicate is restated, not imported.** `@repo/interchange` has no dependency on
`@repo/types`, where `isZeroDurationTask` lives, and adding one for a two-clause predicate would
couple the pure interchange package to the application's type package. So `isZeroDurationImportTask`
restates it, and `apps/api/src/modules/interchange/zero-duration-predicate.spec.ts` asserts the two
agree over every `ActivityType` at 0, 1 and 480 minutes (22 cases).

**The API DTO needed the field, not only the OpenAPI annotation.** `InterchangeReportResponseDto.from()`
rebuilds the report field by field, so without a mapping the advisories were dropped on the way out.
`ImportAdvisoryResponseDto` documents the shape, and `interchange.e2e-spec.ts` asserts the advisory
arrives through the API and that a file with none carries no key.

| Mutation                                                       | Cases that went red                             |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `import-mspdi.ts` does not call the producer                   | 2 (the MSPDI case and the census)               |
| The key is always present, empty when there is nothing         | FC-5 (a) and the census                         |
| The predicate drops its type clause (`@repo/interchange` spec) | 4                                               |
| The predicate drops its type clause (API agreement spec)       | 6 (every non-`TASK` type at 0 minutes)          |
| The producer's filter returns nothing                          | the journey (`Advisories (1)` region not found) |

The torture XER yields exactly one advisory, `A7550` (spec E15).

**The layout-interchange M0 baseline moved, and was not regenerated.** `scripts/e2e-local.sh api`
failed one case, `layout-interchange.e2e-spec.ts` FC-2: the torture file's graph digest held and its
report digest moved (`f386b7a6…` to `9d025125…`), because the report now carries the advisory. The
file says a changed figure is a finding to explain, not a snapshot to update. So the case now strips
`advisories` and requires the rest of the report to hash to the **unchanged** M0 baseline, and
requires `advisories` to be exactly `[ZERO_DURATION_TASK, A7550]`. That is FC-5 (a)'s additivity,
judged on the file it was measured on. The failing run is this case's red.

## The journey (`e2e-interchange/interchange.spec.ts`)

A fixture XER adds `A1020 Handover` as a zero-hour `TT_Task` after the two-task network. The import
review shows an **Advisories (1)** region naming `A1020` with the detail, and the code appears
nowhere else in the dialog, so the advisory is not also filed as a finding. After the import is
committed, the plan's health check reads "1 zero-duration task out of 3 activities; none has
resource assignments" under **Beyond the DCMA assessment** and lists Handover.

The ADR-0050 mapping-contract table (`docs/specs/schedule-interchange/feature-spec.md`) gains the
row for a task with no duration and no milestone flag.
