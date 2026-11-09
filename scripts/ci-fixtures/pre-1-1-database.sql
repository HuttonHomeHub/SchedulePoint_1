-- CI ONLY — the smallest database the 1.1 boot refusal must recognise as made before the 1.1 baseline
-- (ADR-0215; the `image` job's "Refuse a pre-1.1 database" step). It is not built from 1.0's migrations:
-- the refusal reads only `_prisma_migrations` (a row whose name sorts before the baseline, and no
-- baseline row), so the real Prisma table shape, one 1.0 migration name and one table are enough, and the
-- 84 folders are not copied here. It lives beside the other fixtures and never under
-- apps/api/prisma/migrations/, where `prisma migrate deploy` would read it.
--
-- The `users` table is what makes "the 1.1 baseline was applied anyway" visible: the baseline's
-- `CREATE TABLE "users"` collides with it, and Prisma records the failure as a row in this table.
CREATE TABLE _prisma_migrations (
  id                  varchar(36)  PRIMARY KEY,
  checksum            varchar(64)  NOT NULL,
  finished_at         timestamptz,
  migration_name      varchar(255) NOT NULL,
  logs                text,
  rolled_back_at      timestamptz,
  started_at          timestamptz  NOT NULL DEFAULT now(),
  applied_steps_count integer      NOT NULL DEFAULT 0
);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES ('00000000-0000-0000-0000-0000000000a1',
        '0000000000000000000000000000000000000000000000000000000000000000',
        now(), '20260709142606_add_identity_tables', 1);

CREATE TABLE users (id text PRIMARY KEY);
INSERT INTO users (id) VALUES ('a-1.0-user');
