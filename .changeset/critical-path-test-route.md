---
'@repo/api': minor
'@repo/types': minor
---

DCMA metric 12, the Critical Path Test, computed for real (health M6): `GET
…/schedule/health-check/critical-path-test` runs a read-only what-if — 600 working days injected
into the front of the critical path on an in-memory copy of the graph — and reports whether the
control run's completion carrier moved in step. Persists nothing (proved by an e2e reading every
engine-owned column back), carries its own measured throttle (14/60 s), and returns the upgraded
metric-12 row in the report's own shape. Adds the `NO_CRITICAL_PATH` not-assessable reason.
