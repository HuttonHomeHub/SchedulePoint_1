---
'@repo/api': minor
---

The API image now carries a database backup command (`schedulepoint-backup`) and the PostgreSQL 17 client tools it runs: a copy every night kept 30 days, `check` to load a copy into a scratch database without touching live data, `restore` to swap a copy in while keeping the current database aside, and a copy taken before an update that changes the database. Nothing runs it yet; the compose service and the start-up call arrive with the next release's changes.
