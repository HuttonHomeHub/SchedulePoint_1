---
'@repo/web': patch
---

The performance probe refuses a verdict when the metric has no room left to give one.

`droppedPct` is a share of frames and is bounded at 100, so a baseline sitting near the ceiling
leaves less headroom than the 2.00 pp bar the difference is judged against — and the difference
gate then cannot fail whatever the feature costs. The judge now computes that headroom on every
result and returns INDETERMINATE when a gated run is saturated; every surface that prints a delta,
including the command-line driver, says so beside the figure rather than leaving a number that
reads as "this cost nothing".
