---
'@repo/seed-http': patch
---

Replace the seed client's trailing-slash regex with a linear scan.

`baseUrl.replace(/\/+$/, '')` backtracks quadratically on a long run of slashes before a non-slash
character — 166/642/2,520 ms for 20k/40k/80k, the 4×-per-doubling signature — which CodeQL flagged
as `js/polynomial-redos`. The input is an operator's own `--url` today, but a scan cannot see that
and neither can the next caller. The replacement walks backwards in O(n) and reads more plainly.

The regression test uses the input that is actually hostile: slashes in the _middle_. A trailing run
matches in ~0.1 ms even on the old code, so the obvious test would have passed against the bug.
