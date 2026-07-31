# @repo/seed-http

## 0.0.1

### Patch Changes

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Replace the seed client's trailing-slash regex with a linear scan.

  `baseUrl.replace(/\/+$/, '')` backtracks quadratically on a long run of slashes before a non-slash
  character — 166/642/2,520 ms for 20k/40k/80k, the 4×-per-doubling signature — which CodeQL flagged
  as `js/polynomial-redos`. The input is an operator's own `--url` today, but a scan cannot see that
  and neither can the next caller. The replacement walks backwards in O(n) and reads more plainly.

  The regression test uses the input that is actually hostile: slashes in the _middle_. A trailing run
  matches in ~0.1 ms even on the old code, so the obvious test would have passed against the bug.
