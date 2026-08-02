# @repo/seed

## 0.2.0

### Minor Changes

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The critical float threshold is stored in working minutes, not days

  `criticalFloatThreshold` was documented and validated as whole working **days**, and the service
  converted it for the engine at a flat `× 1440`. The engine then compared that against a total float
  measured in working minutes on the **activity's own** calendar. On a 24-hour calendar those agree;
  on an eight-hour one a planner asking for a 1-day threshold got three working days of float treated
  as critical. ADR-0068's defect one field along (surface audit F8).

  The field becomes `criticalFloatThresholdMinutes` — working minutes, stored as compared, no lossy
  conversion in between. A plan-level _day_ threshold is unfixable by choosing a better factor: a
  mixed-calendar plan compares one threshold against floats measured on several different day lengths,
  so there is no correct scalar. Minutes is the only representation that is unambiguous for every
  activity.

  **Breaking:** the field is renamed on the update DTO, the plan response and `PlanSummary`. Pre-1.0,
  so a minor bump. `forbidNonWhitelisted` is on, so a client still sending `criticalFloatThreshold`
  gets a 422 naming the property rather than a quietly wrong schedule — which is the point of renaming
  rather than redefining in place.

  Existing data is backfilled at `× 1440`, the same factor the service applied on every recalculation
  since the column shipped, so the engine receives an identical number and no plan's persisted
  criticality changes. The backfill multiplies in `bigint` and clamps at the ten-year ceiling, because
  the DTO carried no upper bound and an overflow would abort the migration — which on a self-migrating
  image means the API does not boot.

  It also fixes a latent disagreement in the ADR-0066 pairwise harness, which fed the seed spec's day
  number straight into the engine's minutes option with no conversion while the service multiplied.
  The differential has been comparing two different thresholds, and stayed green only because the
  default is 0.

## 0.1.0

### Minor Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Seed calendars with their real shift windows, and add the `capability-shift-calendars` plan.

  The seeder sent a weekday mask and an `isWorking` flag, so a `SeedSpec` two-shift calendar was
  created as a 24-hour one: the intraday half of ADR-0036 was demonstrated by nothing, and the
  coverage report excepted six capability keys for a cause (`no write path accepts shift windows`)
  that stopped being true in api-v0.34.0. It now sends `shifts` and exception `windows` verbatim,
  plus the calendar's `hoursPerDay` (ADR-0068).

  `capability-shift-calendars` is the plan that could not previously exist: nine calendars whose
  working **days** are identical and whose **hours** are not — eight-hour, two-shift, twelve-hour,
  round-the-clock, split-day, short-Friday, nights across midnight, window-only, and one whose stated
  standard day deliberately disagrees with its week. Two of them agreeing means the hours are not
  being read. Its `docs/TEST_PLAYBOOK.md` row says so, and the six excepted keys are now reached.
