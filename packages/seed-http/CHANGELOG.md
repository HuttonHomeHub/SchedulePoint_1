# @repo/seed-http

## 0.3.0

### Minor Changes

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show a resource's join lag in the loading histogram

  The histogram read-model built its input with a hard-coded `lagMinutes: 0` under a comment stating
  that SchedulePoint does not model a per-assignment lag column. That column landed in the previous
  change, so the comment was already false — it would have outlived the column by a milestone had the
  findings register not named it. The repository now selects the stored lag and the caller passes it
  through, measured on the same activity calendar the span is.

  The seed catalogue closes the matching gap. `res_assignment_lag` was one of the two capabilities
  `seed --coverage` reported as **excepted** with the reason "an assignment has no lag field: work
  starts with its activity" — true of the data model at the time and badly underselling the position,
  since the engine half was already built and tested. That exception is deleted and the key is now
  **reached** by `A_LAG` in `plan:capability-resources`: a twin of `A_BELL` differing in exactly one
  thing, so the two histograms are a controlled contrast rather than two unrelated pictures.
  `docs/TEST_PLAYBOOK.md` says what right and wrong look like for the pair, and the fixture's
  `assignment_lag_h` now maps into the seeded plan instead of being dropped.

  Two tasks the plan asked for were **not** built, because measuring their premises showed both to be
  false, and both are recorded in the plan rather than quietly skipped. A typed "lag unreachable" error
  mapped to a 422 was written and reverted: the working-time port does not throw for any legal lag — a
  calendar working one minute per week walks the full ten-year ceiling and returns a date in the year
  102,759 — so the `catch` would have been permanently dead code carrying a docblock asserting a defect
  that does not exist. And the N34 hostile cases do not belong in the seed negative tier, which is
  pinned to the conformance fixture's own case list; they live at the DTO boundary and in the API e2e,
  where they run.

  **The CPM engine is not modified and the ADR-0034 recalculation parity gate is untouched** — the
  histogram is a read-model and `computeSchedule` has never seen an assignment.

### Patch Changes

- Updated dependencies [[`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985)]:
  - @repo/seed@0.3.0

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

### Patch Changes

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report a four-hour remainder, instead of rounding it to "no work left"

  ADR-0070 made an activity's **duration** sub-day authorable and left its **remaining work** a
  whole-number days box. So a planner could type `4h` for the duration, report progress, and then
  state the remainder only as `0` or `1` day — and on an incomplete activity `0` is not a rounding
  artefact, it is also the value that means _no work left_. The asymmetry sharpened it: the derived
  remaining (percent × duration) is minute-exact, so stating the remainder explicitly was **less**
  precise than saying nothing (surface audit F3).

  `remainingDurationMinutes` joins the progress DTO as the mutually-exclusive sibling of
  `remainingDurationDays` — the same pair `api-v0.34.0` gave duration and lag — and the activity
  response and `ActivitySummary` now carry it, so a sub-day remainder can be read back exactly rather
  than as the `0` its day field rounds to.

  The progress editor's field takes the same `d`/`h`/`m` grammar as a duration, reusing that field's
  predicate, degrade rule and flag rather than a second reading of `2d 4h`. Blank still means "derive
  it from percent complete" — which is the one thing this field has that a duration does not, and the
  only part the shared module does not own. Where the calendar's working hours cannot be resolved it
  degrades to whole days, which is the same code path as flag-off, so the rollback contract and the
  not-yet-loaded state cannot rot apart.

  The seeder now sends the minutes its spec already held, instead of rounding them and recording the
  loss as an approximation — a sub-day remainder in a seeded plan was never what the spec asked for.

  With this, `pnpm check:surface-contract` reports **zero gaps**: every writable field on a scheduling
  DTO and every CPM engine input has a surface a planner can reach, or a written reason why not.

- Updated dependencies [[`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a)]:
  - @repo/seed@0.2.0

## 0.1.0

### Minor Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The seeder sends minutes, and stops refusing what the API now accepts

  Two pieces of drift, both of the shape ADR-0058 is about — a comment described a limitation, the
  limitation was fixed, and the comment kept being believed.

  **Durations and lags are seeded in minutes.** The seeder rounded each to whole days and reported the
  loss as an approximation, citing TECH_DEBT [#78](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/78) — which closed when `durationMinutes` and `lagMinutes`
  reached the public DTOs. Sending minutes removes the rounding entirely, so a seeded plan is a
  faithful copy rather than a near one; it also sidesteps ADR-0068, since a "day" now means the
  calendar's working day and a day-denominated seed would mean different things on different
  calendars.

  **A window-only calendar is created rather than refused.** The seeder skipped it and reported
  `WINDOW_ONLY_CALENDAR_UNSUPPORTED`, quoting a `@Min(1)` on the weekday mask that no longer exists
  (TECH_DEBT [#79](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/79) closed; the minimum is 0). It now seeds like any other calendar.

  The capability-coverage exceptions are corrected with it. Four `cal_*` shift keys were excused as
  "no write path accepts shift windows" — the API accepts them now, and what remains is that a
  `SeedSpec` calendar carries working _days_, so the seeder has nothing to send. The two window-only
  keys keep an exception but with the true reason: expressible now, but no catalogue plan has one, so
  nothing demonstrates it end to end. That is a seed plan to write, not an API change.

### Patch Changes

- Updated dependencies [[`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581)]:
  - @repo/seed@0.1.0

## 0.0.2

### Patch Changes

- [#205](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/205) [`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Bound the server-supplied text the seeder puts in its report.

  The raw-text fallback already clamped to 200 characters; the parsed-envelope branch passed `code`,
  `message` and `details` through verbatim. `--out` writes those to disk, so a seeder pointed at a
  broken or hostile endpoint could spend the operator's disk one finding at a time.

  Found while re-reading the flow for CodeQL's `js/http-to-file-access` alert (TECH_DEBT [#81](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/81)). It does
  not clear that alert and was not done to: the taint flow is unchanged, and the alert is still
  assessed as a false positive for that call site. This is the one genuine defect in its
  neighbourhood — the size, not the path or the quoting.

## 0.0.1

### Patch Changes

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Replace the seed client's trailing-slash regex with a linear scan.

  `baseUrl.replace(/\/+$/, '')` backtracks quadratically on a long run of slashes before a non-slash
  character — 166/642/2,520 ms for 20k/40k/80k, the 4×-per-doubling signature — which CodeQL flagged
  as `js/polynomial-redos`. The input is an operator's own `--url` today, but a scan cannot see that
  and neither can the next caller. The replacement walks backwards in O(n) and reads more plainly.

  The regression test uses the input that is actually hostile: slashes in the _middle_. A trailing run
  matches in ~0.1 ms even on the old code, so the obvious test would have passed against the bug.
