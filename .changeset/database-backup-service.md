---
'@repo/api': minor
---

Database backups are now part of the release stack. Add the new `backup` service to your compose file for a nightly copy kept 30 days, and the backups folder to the `api` service for a copy before every update that changes the database. If that copy cannot be made, the update waits and your data is not changed; once the cause is fixed (usually disk space) the update carries on by itself. Without the folder on the `api` service nothing changes: it updates exactly as before and logs a warning saying no copy was taken. Create the folder first, owned by the containers' user (`sudo install -d -o 1000 -g 1000 -m 700 backups`), or Docker creates it owned by root and the first update with a database change is held.

The release compose file no longer publishes the database port (5432): a database tool connected from another computer will stop working. `docker compose exec db psql` and the new `backup check` command still work. Two settings join the stack: `BACKUP_DIR` (the host folder, default `./backups`) and `BACKUP_KEEP_DAYS` (default 30). See `docs/guides/back-up-and-restore.md`.
