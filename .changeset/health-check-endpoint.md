---
'@repo/api': minor
'@repo/types': minor
---

The DCMA 14-point schedule health check: `GET …/schedule/health-check` computes all fourteen
metrics from the persisted rows — no engine run, no lock, nothing written. The response is always
exactly fourteen rows in ordinal order; a metric that cannot be computed says so with a typed
reason instead of disappearing or failing the request. Thresholds and the offender cap travel in
the payload, and the report carries no cost field at any depth, so one URL produces one document
whoever reads it.
