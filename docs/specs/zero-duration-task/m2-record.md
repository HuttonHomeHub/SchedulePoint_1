# M2 record: a type change keeps position (#384)

What M2 of [the plan](./implementation-plan.md) built, and the runs that established it. Every
figure was produced by the command named beside it.

## M2-T1: the server rule

`apps/api/src/modules/activities/zero-duration-reexpression.ts` (`reexpressZeroDurationDates`),
called in `ActivitiesService.update` directly after the key-presence pair checks; its results are
merged into the patch, and the N26 pair is resolved from the sent value, else the re-expressed
value, else the stored value.

### Unit suite

`pnpm --filter @repo/api exec vitest run src/modules/activities/zero-duration-reexpression`:
**52 passed** (50 in the unit suite, 2 in the structural gate). Each row the plan lists is its own
case: 5 fields × 2 directions × sent/unsent (20), the five null no-ops, the five explicit-`null`
cases, the five no-op conditions, the calendar-day pair, the stored-duration case, and the type
coverage (`HAMMOCK`, `RESOURCE_DEPENDENT`, `LEVEL_OF_EFFORT`, `WBS_SUMMARY`, each both ways, plus
`START_MILESTONE → FINISH_MILESTONE`).

| Mutation (one at a time, restored after)                                   | Cases that went red                                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Working-day shift (skip Saturday and Sunday in the shift direction)        | Monday − 1 is Sunday; the Sunday round trip; the same-request duration case (its stored Friday + 1 lands on a Saturday) — 3 of 50 |
| The rule reads the request's `durationDays` in place of the stored value   | the same-request duration change — 1 of 50                                                                                        |
| `secondaryConstraintDate` removed from `REEXPRESSED_DATE_FIELDS`           | the all-fields case, and the structural gate's coverage assertion                                                                 |
| A fifth `finishMilestoneDateInstant(calendar, e)` call added to the engine | both structural cases (`constraints.ts: unclassified argument "e"`); the engine file was restored with `cp`, never committed      |

The working-day mutation passes every other case, which is spec E34's point: it keeps every instant
and round-trips every working day, so only the stored value and a round trip from a non-working day
tell it apart.

### API e2e

`apps/api/test/zero-duration-type-change.e2e-spec.ts`, against a throwaway database
(`app_test_zdm2`, `prisma migrate deploy`): **11 passed**.

- **M0-T3's case flipped.** `SUCCESSOR_AFTER_TYPE_CHANGE` is now `'2026-01-12'`. After
  `PATCH {type: 'FINISH_MILESTONE'}` the SNET reads `2026-01-11` (Sunday), `Z` reports Friday 9 Jan
  (the day that closes at Monday 00:00), and `SUCC` still starts Monday 12. Both `TASK` and
  `START_MILESTONE`.
- **FC-2 on four calendars** (Monday–Friday full days, 09:00–17:00, 24-hour, and Monday–Friday
  with Monday 12 Jan non-working): all five dates set on `Z`, round trip
  `TASK → FINISH_MILESTONE → TASK`. Every other activity's full schedule (four dates, total and free
  float, critical flag, remaining float, drift, conflict), `Z`'s float and flags, and every edge's
  `isDriving` are equal before, between and after; after the round trip `Z`'s five stored dates are
  byte-identical.
- **FC-3 (b):** a placement stored on Sunday 11 Jan goes to Saturday 10 and comes back as Sunday 11.
- **N26, both directions:** (a) `PATCH {type: FINISH_MILESTONE, externalEarlyStart: '2026-01-10'}`
  on a pair stored 10/10 → **422** `EXTERNAL_FINISH_BEFORE_START`, row unchanged; (b)
  `PATCH {type: FINISH_MILESTONE, externalLateFinish: '2026-01-09'}` on a pair stored 10/12 →
  **200**, both 9 Jan.
- **RESOURCE_DEPENDENT characterisation** (a zero-duration activity driven by a 24-hour crane, SNET
  Monday 12): re-expressed to Sunday 11; reported, not asserted: successor `2026-01-12 → 2026-01-12`,
  `Z` `2026-01-12 → 2026-01-09`. On this fixture the instant happened to be kept; the spec claims
  nothing for this type.

| Mutation                                                                     | Result                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rule disabled (returns `{}` always)                                      | 10 of 11 red (all but the E29 characterisation)                                                                                                                                                                                                                 |
| The rule disabled **and** the test's own date assertions removed (FC-2 only) | 4 of 4 FC-2 cases red on the **schedule** assertions: `SUCC` total float 8 → 7 (Mon–Fri full), 6 → 5 (8-hour, exception day), and `Z`'s own float 6 → 7 on 24-hour. So the schedule comparison discriminates by itself, not only the date assertions beside it. |
| N26 resolved from the stored pair (today's ordering), rule still running     | (a) **500** where 422 is expected — the database CHECK, exactly as spec E26 read it; (b) **422** where 200 is expected — the over-rejection                                                                                                                     |

Spec E26 had predicted (a)'s 500 by reading; this is the first run of it.

### What the plan said that did not hold exactly

- **The plan's N26 case (a) says "today: the DB CHECK, a 500".** That is the reading only when the
  rewrite runs and the check does not see it. With no rewrite at all (the rule disabled), (a)
  returns 200, because nothing inverts the pair. Both are recorded above.
- **The structural test the plan's R3 describes lists four engine branches.** The census counts
  `finishMilestoneDateInstant` **calls**, which are four, and maps `constraints.ts`'s one
  `resolvePair` call to both constraint dates, so the five fields are covered by four calls.
  `compute.ts:861`'s `reportIndex` branch is an output conversion and moves no input, so it is not
  in the census; the docblock says so.

## M2-T2: the editor

- `typeChangeReexpressesDates` (`features/activities/model/type-change-dates.ts`) mirrors the
  server's condition from the host's stored type and duration. `ActivityWorkFields` shows the hint
  under Type, linked by `aria-describedby`; `ActivityEditorDialog` passes `savedDurationMinutes`.
- **The re-seed did not exist.** The plan said "re-seed test; fix if it fails", and the first case
  failed against the unchanged editor: `useScopeForm` seeds each scope only on open and on a subject
  change, so the Scheduling tab went on showing Monday 12 after the server stored Sunday 11. The
  General save now re-seeds a clean Scheduling form from the saved row when the type changed.

| Mutation                                   | Case that went red                                           |
| ------------------------------------------ | ------------------------------------------------------------ |
| No re-seed                                 | a clean Scheduling tab shows the re-expressed date           |
| Re-seed ignores `isDirty`                  | a dirty Scheduling tab keeps what the reader typed           |
| Re-seed ignores whether the type changed   | a General save that did not change the type does not re-seed |
| Hint removed                               | the two presence cases                                       |
| Hint condition ignores the stored duration | the non-zero-duration absence case                           |

### Journey

`apps/web/e2e-workspace-chrome/zero-duration.spec.ts`, first step: seed `PRE`, a placed and
constrained zero-duration `Handover`, and `SUCC`; open the editor from the selection bar's **Edit**;
change Type to Finish milestone (the hint is asserted as the Type field's accessible description);
**Save general**; recalculate; read back through the API. `Handover` stores 11 Jan for both its
constraint and its placement and reports 9 Jan; `SUCC` starts 12 Jan. **1 passed.** Verified red
with the server rule disabled (`durationMinutes >= 0` early return): `Expected "2026-01-11"`,
`Received "2026-01-12"`.

## Owed

- **api-reviewer** reviews the `PATCH` contract change before M2 merges (plan R1). Not run from this
  session.
