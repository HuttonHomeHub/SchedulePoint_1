# Schema design: `activities.derived_duration_minutes`

M1-T2 of the [implementation plan](./implementation-plan.md). The database-architect's design is recorded
where it will be read next to the thing it describes, not copied here:

- **The migration header** —
  [`apps/api/prisma/migrations/20261017120000_activity_derived_duration_minutes/migration.sql`](../../../apps/api/prisma/migrations/20261017120000_activity_derived_duration_minutes/migration.sql):
  the column, the non-negative CHECK (`NOT VALID` then `VALIDATE`), why there is no type CHECK, no index and no
  backfill, and what was observed on a populated scratch cluster.
- **`docs/DATABASE.md`** — the column's entry and its engine-owned classification.
- **`docs/ORGANISATION_EXPORT_FORMAT.md`** — the export classification (ADR-0194 D1) and the format's move to 1.1.

The decision this milestone's code depends on: the write path writes `NULL` to every row that is not a summary or a
level-of-effort on each recalculation, which is what makes a type CHECK unnecessary.
