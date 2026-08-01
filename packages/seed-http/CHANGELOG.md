# @repo/seed-http

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
