-- #384 M0-T4 — the diluted estate the two zero-duration diagnostics are costed on.
--
-- Run against a THROWAWAY database built by `prisma migrate deploy` (never a shared test database:
-- other suites clear it underneath a run). Shape, and why each part is there:
--
--   40 plans, 102,000 activities — the scale ADR-0140's M0 and one-planning-surface M0 used, so the
--     readings are comparable with theirs.
--   every 10th activity (g % 10 = 3) is a FINISH_MILESTONE with duration 0 — a population the type
--     filter must exclude, and the one a query that dropped it would count.
--   every 50th (g % 50 = 0) is a zero-duration TASK — 2,040 of them, about 2 %: rare, as M0-T1
--     measured in the catalogue, but large enough that the numerator is not a lookup of nothing.
--   every activity holds one assignment — the fully-resourced shape, which ADR-0140's M0 found is
--     the expensive case for any query joining `resource_assignments` — cycling over three
--     resources, the third soft-deleted; every 4th assignment is itself soft-deleted; and every
--     100th activity holds a SECOND live assignment, so `count(DISTINCT a.id)` has duplicates to
--     remove. That is 103,020 assignment rows.
--
-- The dead-resource rows are unreachable through the product (`RESOURCE_IN_USE`) and are here only
-- so the join has them to filter; they change the cost, not the verdict.
BEGIN;
INSERT INTO organizations (id, name, slug, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001','Acme','acme', now());
INSERT INTO clients (id, organization_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','C', now());
INSERT INTO projects (id, organization_id, client_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','P', now());

INSERT INTO plans (id, organization_id, project_id, name, planned_start, updated_at)
SELECT
  ('00000000-0000-4000-8001-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'Plan ' || g, '2026-01-01', now()
FROM generate_series(1, 40) g;

INSERT INTO activities (id, organization_id, plan_id, name, type, duration_minutes, updated_at)
SELECT
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-8001-' || lpad(((g % 40) + 1)::text, 12, '0'))::uuid,
  'A' || g,
  (CASE WHEN g % 10 = 3 THEN 'FINISH_MILESTONE' ELSE 'TASK' END)::"ActivityType",
  (CASE WHEN g % 10 = 3 OR g % 50 = 0 THEN 0 ELSE 2400 END),
  now()
FROM generate_series(1, 102000) g;

INSERT INTO resources (id, organization_id, name, kind, deleted_at, updated_at) VALUES
  ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000001','Crew','LABOUR', NULL, now()),
  ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-8000-000000000001','Crane','EQUIPMENT', NULL, now()),
  ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-8000-000000000001','Retired','LABOUR', now(), now());

INSERT INTO resource_assignments (id, organization_id, activity_id, resource_id, is_driving, deleted_at, updated_at)
SELECT
  ('00000000-0000-4000-d000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  ('00000000-0000-4000-c000-' || lpad(((g % 3) + 1)::text, 12, '0'))::uuid,
  false,
  (CASE WHEN g % 4 = 0 THEN now() ELSE NULL END),
  now()
FROM generate_series(1, 102000) g;

INSERT INTO resource_assignments (id, organization_id, activity_id, resource_id, is_driving, updated_at)
SELECT
  ('00000000-0000-4000-e000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  -- Never the resource the first assignment named: `uq_resource_assignments_activity_resource`
  -- refuses a second live row for the same pair.
  (CASE WHEN g % 3 = 1 THEN '00000000-0000-4000-c000-000000000001'
        ELSE '00000000-0000-4000-c000-000000000002' END)::uuid,
  false,
  now()
FROM generate_series(100, 102000, 100) g;
COMMIT;
ANALYZE organizations; ANALYZE clients; ANALYZE projects; ANALYZE plans;
ANALYZE activities; ANALYZE resources; ANALYZE resource_assignments;
