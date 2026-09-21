---
'@repo/api': minor
---

Drop `plans.scheduling_mode` and the `SchedulingMode` enum, one release after the collapse.

ADR-0148 made every bar draw from the placed basis and removed `schedulingMode` from the DTOs,
`@repo/types` and `apps/api/src`; the column has been write-only dead weight since `api-v0.70.0`.
This removes it, and retires the `placement-on-early-plan` staff diagnostic in the same commit
because it was the column's last reader — dropping the column without it would have broken the
diagnostics route outright rather than degrading a reading. That coupling is stated in the
migration's own header so a reader reverting the file knows what else must come back.

**It ships one release after the collapse deliberately.** Had both landed together, the
single-step rollback target would be an image that still selects the column.

**Rolling back this release is a compensating migration plus the previous image — never the
previous image alone, and the failure is silent rather than loud.** An `api-v0.70.0` image still
selects `scheduling_mode`. Its `prisma migrate deploy` exits 0, because Prisma does not fail on an
applied-but-unknown migration, so the container starts; `/health/ready` is a bare connectivity
ping that never touches `plans`, so it reports healthy to Watchtower; and then every plan read
500s. Nothing announces it. The compensating SQL is written out in the migration's header.

Three claims in the approved plan were disproved while designing this and are corrected in place
rather than carried forward. A two-file split would NOT have failed on the dependency — Prisma
commits each migration file before the next, so one file is right for **atomicity** instead. The
plan's literal `BEGIN; … COMMIT;` is a hazard if written into a file, because it ends Prisma's own
transaction early and can leave the schema changed while the migration is recorded failed. And
"a restore, not a redeploy" overstates the remedy that `docs/DATABASE.md` already prescribes.

The migration is metadata-only: measured at 200,000 rows, `ALTER TABLE` 0.318 ms and `DROP TYPE`
0.135 ms, with the relfilenode and table size unchanged. The honest risk is lock queuing behind an
open reader, not lock duration.
