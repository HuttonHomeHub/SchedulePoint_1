---
'@repo/api': minor
'@repo/types': minor
---

**Baseline variance now measures where bars are placed, on any baseline captured since
`api-v0.70.0`** (`docs/TECH_DEBT.md` #359). `GET …/plans/:planId/baselines/variance` reads
`meta.basis` to say which dates it compared: `PLACED` reads the frozen placed span against the
live placed span (the bars as drawn, ADR-0148) — a bar dragged after capture now reads as moved,
and removing a binding constraint and placing the bar exactly where the constraint held it no
longer reads as "ahead". `NETWORK` is the network-vs-network comparison every baseline gave
before this release, kept for any baseline captured before placement capture existed
(`placementSnapshotLevel: 'NONE'`) — the only honest comparison such a baseline can make.
`basis` is `null` only when there is no active baseline. Float variance stays total float on both
bases, unchanged.

`GET …/baselines` and `GET …/baselines/:baselineId` gain `placementSnapshotLevel` on the
baseline and `placedStart`/`placedFinish`/`visualStart` on each activity snapshot, so a consumer
can tell which basis a variance read against a given baseline will use before making it.

Additive in shape and behaviourally breaking on a `FULL` baseline: a consumer that assumed
`baselineStart`/`baselineFinish`/`currentStart`/`currentFinish` were always network dates should
read `meta.basis` and the two new fields.
