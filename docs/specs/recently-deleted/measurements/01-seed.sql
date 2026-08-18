-- Seed for the Recently-Deleted index measurement (M0-T2).
--
-- WHERE THIS BYPASSES THE PRODUCT (ADR-0081 §3): rows are INSERTed directly.
-- No controller, no service, no HierarchyLifecycleService cascade runs. That is
-- legitimate for THIS question and only this one: an index decision depends on
-- row counts, column selectivity and the physical predicate, none of which the
-- write path influences. It proves nothing about cascade correctness, and is not
-- evidence for any other claim in the epic.

BEGIN;

-- ---------------------------------------------------------------------------
-- Organisations. One installation, mixed sizes — the list predicate is
-- org-scoped, so "how big is the table" and "how big is MY org" are different
-- questions and both matter.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE org_shape(slug text, clients int, proj_per_client int, plans_per_proj int);
INSERT INTO org_shape VALUES
  ('org-xl', 400, 10, 10),   -- stress: 400 / 4,000 / 40,000
  ('org-l',  100, 10, 10),   -- realistic upper end today: 100 / 1,000 / 10,000
  ('org-m',   20, 10, 10),   -- 20 / 200 / 2,000
  ('org-s',    5,  5, 6);    -- 5 / 25 / 150

INSERT INTO org_shape
SELECT 'org-f' || g, 5, 4, 5 FROM generate_series(1, 20) g;  -- 20 filler orgs

INSERT INTO organizations (id, name, slug, version, created_at, updated_at)
SELECT gen_random_uuid(), slug, slug, 1, now() - interval '3 years', now() FROM org_shape;

-- ---------------------------------------------------------------------------
-- Clients / projects / plans. created_at spread over 3 years.
-- ---------------------------------------------------------------------------
INSERT INTO clients (id, organization_id, name, version, created_at, updated_at)
SELECT gen_random_uuid(), o.id, s.slug || '-client-' || g, 1,
       now() - (interval '3 years') + (g * interval '1 hour'), now()
FROM org_shape s
JOIN organizations o ON o.slug = s.slug,
LATERAL generate_series(1, s.clients) g;

INSERT INTO projects (id, organization_id, client_id, name, version, created_at, updated_at)
SELECT gen_random_uuid(), c.organization_id, c.id, c.name || '-p' || g, 1,
       c.created_at + (g * interval '1 day'), now()
FROM clients c
JOIN organizations o ON o.id = c.organization_id
JOIN org_shape s ON s.slug = o.slug,
LATERAL generate_series(1, s.proj_per_client) g;

INSERT INTO plans (id, organization_id, project_id, name, planned_start, version, created_at, updated_at)
SELECT gen_random_uuid(), p.organization_id, p.id, p.name || '-pl' || g, current_date, 1,
       p.created_at + (g * interval '1 hour'), now()
FROM projects p
JOIN organizations o ON o.id = p.organization_id
JOIN org_shape s ON s.slug = o.slug,
LATERAL generate_series(1, s.plans_per_proj) g;

COMMIT;

-- ---------------------------------------------------------------------------
-- Soft deletes, in the three shapes the product actually produces.
-- deleted_at is spread over the last 400 days so a 90-day cutoff selects a
-- meaningful minority (the expiry predicate) rather than everything or nothing.
-- ---------------------------------------------------------------------------
BEGIN;

-- (1) client-rooted cascade: 5% of clients, stamping every descendant with ONE
--     batch id and ONE deleted_at (hierarchy-lifecycle.service.ts:98-99).
CREATE TEMP TABLE cascade_clients AS
SELECT c.id, gen_random_uuid() AS batch,
       now() - ((random() * 400)::int * interval '1 day') AS del
FROM clients c
WHERE (hashtext(c.id::text) % 20) = 0;

UPDATE plans pl SET deleted_at = cc.del, delete_batch_id = cc.batch
FROM projects p JOIN cascade_clients cc ON cc.id = p.client_id
WHERE pl.project_id = p.id;
UPDATE projects p SET deleted_at = cc.del, delete_batch_id = cc.batch
FROM cascade_clients cc WHERE p.client_id = cc.id;
UPDATE clients c SET deleted_at = cc.del, delete_batch_id = cc.batch
FROM cascade_clients cc WHERE c.id = cc.id;

-- (2) project-rooted cascade: 8% of the surviving projects.
CREATE TEMP TABLE cascade_projects AS
SELECT p.id, gen_random_uuid() AS batch,
       now() - ((random() * 400)::int * interval '1 day') AS del
FROM projects p
WHERE p.deleted_at IS NULL AND (hashtext(p.id::text) % 12) = 0;

UPDATE plans pl SET deleted_at = cp.del, delete_batch_id = cp.batch
FROM cascade_projects cp WHERE pl.project_id = cp.id;
UPDATE projects p SET deleted_at = cp.del, delete_batch_id = cp.batch
FROM cascade_projects cp WHERE p.id = cp.id;

-- (3) lone plan deletes: 10% of the survivors, each its own batch.
UPDATE plans pl
   SET deleted_at = now() - ((random() * 400)::int * interval '1 day'),
       delete_batch_id = gen_random_uuid()
 WHERE pl.deleted_at IS NULL AND (hashtext(pl.id::text) % 10) = 0;

COMMIT;

VACUUM ANALYZE clients;
VACUUM ANALYZE projects;
VACUUM ANALYZE plans;
