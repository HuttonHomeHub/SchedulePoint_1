---
'@repo/api': patch
---

Multiple float-path analysis (M6-F6, ADR-0035 §19). A new pure, read-only engine function
`computeFloatPaths(activities, edges, options, target, maxPaths)` returns the ranked **contiguous
driving chains** into a target activity — path 0 the driving chain (relative float 0), later paths
entered at increasing total float — bounded by `maxPaths` and a per-chain depth guard. Every activity
belongs to exactly one path (a partition, not a total-float sort). Conformance scenario **S11** now
runs as a path-shape assertion into the fixture target A12500. Engine-only; the read endpoint is
deferred (see the plan and `docs/DECISIONS.md`).
