# @repo/seed-http

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
