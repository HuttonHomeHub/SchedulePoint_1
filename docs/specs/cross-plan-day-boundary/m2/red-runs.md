# M2-T2: every migration-test case, verified red against the defect it names

- **Status:** Run 2026-09-26 against the migration and runbook as committed with this file.
- **Subject:** `apps/api/test/cross-plan-lag-migration.e2e-spec.ts` (nine cases and one `todo`, the
  M2-T3 differential hook).
- **Method.** Each mutant is **one exact-match edit** to the file the test reads (the migration or
  `docs/DEPLOYMENT.md`), refused unless its search string matches exactly once. The suite runs with
  Vitest's JSON reporter, and the file is restored afterwards. **A run is refused unless all ten
  tests are reported**, because a run that dies loading counts as green (ADR-0136 recorded nine
  false greens of that kind). The harness is a throwaway in the session scratchpad and is not
  committed; this table is its output.
- **Control:** the unmutated suite: **0 failed, 9 passed, 1 todo**, after every batch.

Every mutant of the migration's `resolved` CTE also fails _carries the CTE verbatim_, because the
runbook no longer matches. That is expected and is not listed as the discriminating failure below.

## The migration statement

| Id  | Defect (the mutation)                                                              | Failed | Discriminating failure                                                                                                    |
| --- | ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| M1  | `PREDECESSOR` resolved on the successor's plan calendar                            | 3/9    | values: `PRED_INHERITS_OWN_PLAN`; record: `PRED_INHERITS_OWN_PLAN`                                                        |
| M2  | `PROJECT_DEFAULT` resolved on the predecessor's plan                               | 6/9    | values: `PD` 1200 ≠ 960; overflow: `OVERFLOW_480_POS` 2,190,000 ≠ 1,752,000; B3: `NO_CALENDAR_ANYWHERE` bumped            |
| M3  | the link's `successor_plan_id` instead of the successor activity's `plan_id`       | 3/9    | values and record: `PD_DRIFTED_PLAN_ID`                                                                                   |
| M3b | the record's `plan_id` from the link's `successor_plan_id`                         | 2/9    | record: `PD_DRIFTED_PLAN_ID`                                                                                              |
| M4  | an unconditional `UPDATE` (the changed-value filter removed)                       | 1/9    | B3: `TWENTY_FOUR_HOUR` version 2 ≠ 1                                                                                      |
| M5  | the `UPDATE` also sets `updated_at`                                                | 1/9    | B3: `PD` `updatedAt` moved                                                                                                |
| M6  | `int4` arithmetic (the `::numeric` cast removed)                                   | 9/9    | `Code: 22003 … integer out of range`; every case that runs the conversion errors                                          |
| M7  | the predecessor driving join without `is_driving`                                  | 9/9    | `Code: 23505 … Key (cross_plan_dependency_id)=(…) already exists`: the live non-driving assignment fans out               |
| M7b | the predecessor driving join without the assignment's `deleted_at IS NULL`         | 9/9    | `Code: 23505`, the same: the soft-deleted driver fans out                                                                 |
| M8  | the `INSERT` fed only changed rows                                                 | 3/9    | record: 14 rows ≠ 20; reverse: `TWENTY_FOUR_HOUR` version 2 ≠ 1 (step 3 treated it as post-release); check 4 did not fire |
| M9  | the calendar join filtered on `deleted_at`                                         | 5/9    | values and record: `SUCC_DELETED_CALENDAR`; B3 and reverse: it stayed unchanged                                           |
| M10 | the driving join without the activity's `deleted_at IS NULL`                       | 3/9    | values and record: `PRED_DELETED_ENDPOINT`                                                                                |
| M11 | the successor resource join without the resource's `deleted_at IS NULL`            | 3/9    | values and record: `SUCC_DELETED_RESOURCE`                                                                                |
| M12 | round the day count before multiplying (a non-multiple of 1440 loses its fraction) | 3/9    | values and record: `NON_MULTIPLE`                                                                                         |
| M13 | soft-deleted links excluded                                                        | 5/9    | values, record (19 ≠ 20), B3 and reverse: `SOFT_DELETED_LINK`                                                             |

Three points worth keeping:

- **M7/M7b fail on the record's `UNIQUE`, not on a wrong value.** A fan-out does not double-convert
  silently. It refuses the whole statement, which on the deployed host is ADR-0107's restart loop.
  So the exact partial-index predicate is load-bearing: it is what keeps the `UNIQUE` from firing.
- **M6 is proved at the thresholds too.** Run in `psql` on the same Postgres: `(1035·1440)·1440`
  = 2,146,176,000 and `(1036·1440)·1440` overflows; `(3106·1440)·480` = 2,146,867,200 and
  `(3107·1440)·480` overflows; `5,256,000·408` = 2,144,448,000 and `5,256,000·409` overflows. That
  is spec E28's 1,036 / 3,107 days and "any factor of 409 or more", to the day. The factor-1440
  overflow rows error although the statement then leaves them unchanged, because the `INSERT`
  consumes every resolved row, so the expression is evaluated for all of them.
- **M4 is caught by the B3 case alone.** The reverse case compares each link's version with the
  migrated one, so an extra bump on an unchanged row is invisible to it. That is deliberate: B3 owns
  that property.

## The runbook (`docs/DEPLOYMENT.md`)

| Id  | Defect (the mutation)                                                          | Failed | Discriminating failure                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | reverse step 3 with `round()` instead of `floor(x + 0.5)`                      | 1/9    | `POST_NEGATIVE_HALF` −4320 ≠ −2880                                                                                                                                                                |
| R2  | reverse step 2 without a `version` bump                                        | 1/9    | `PD` version 2 ≠ 3                                                                                                                                                                                |
| R3  | reverse step 3 without a `version` bump                                        | 1/9    | `POST_TWO_DAYS` version 1 ≠ 2                                                                                                                                                                     |
| R4  | reverse step 3 without the no-record selector (recorded links converted again) | 2/9    | `Code: 23514` on `ck_cross_plan_dependencies_lag_minutes_range` (the restored ±3,650-day rows converted again leave the range); the check-4 case errors on the same CHECK before reaching check 4 |
| R5  | reverse without the `LOCK`                                                     | 1/9    | its first statement is no longer the `LOCK` (a second run would apply)                                                                                                                            |
| R6  | reverse without deleting the `_prisma_migrations` row                          | 1/9    | the migration's row is still present                                                                                                                                                              |
| R7  | reverse check 4 disabled (`RAISE` → `NULL`)                                    | 1/9    | _check 4 aborts…_: the reverse resolved instead of rejecting                                                                                                                                      |
| R8  | reverse check 5 disabled                                                       | 1/9    | _check 5 aborts…_: the reverse resolved instead of rejecting                                                                                                                                      |
| F1  | **the spec's two-limb finder** (the resolution-path limb removed)              | 1/9    | lists `HOURS_CHANGED`, `NOT_A_MULTIPLE`; **misses `PATH_CHANGED`**                                                                                                                                |
| F2  | the finder without the calendar-edited limb                                    | 1/9    | misses `HOURS_CHANGED`                                                                                                                                                                            |
| F3  | the finder without the not-a-multiple limb                                     | 1/9    | misses `NOT_A_MULTIPLE`                                                                                                                                                                           |
| F4  | the finder without the no-record filter                                        | 1/9    | lists a pre-release link as well                                                                                                                                                                  |

**F1 is a finding against the spec, not only a test.** Spec §4.4 "Reversal" says the finder must
not under-report, and specifies two limbs. Those two cannot see a change of resolution path: a
successor moved to a different, unedited calendar whose factor divides the stored minutes. The
runbook therefore carries a third limb (an endpoint activity, its plan, or its driving assignment
or resource edited after the migration finished), marked in `docs/DEPLOYMENT.md` as added in M2-T2.

## Also run for real, outside the suite

`m2/migration-cost.md` records the migration and the reverse run on a populated database with 10,000
links: per-row identity after the round trip, and a second reverse refused at its `LOCK`.
