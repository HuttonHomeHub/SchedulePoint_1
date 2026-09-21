BEGIN;
INSERT INTO organizations (id, name, slug, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001','Acme','acme', now());
INSERT INTO clients (id, organization_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','C', now());
INSERT INTO projects (id, organization_id, client_id, name, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','P', now());
INSERT INTO calendars (id, organization_id, name, hours_per_day_minutes, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','8h',480, now());

-- 40 plans. Half stay EARLY, half are VISUAL, so the mode clause has a population either side.
INSERT INTO plans (id, organization_id, project_id, name, planned_start, calendar_id, scheduling_mode, updated_at)
SELECT
  ('00000000-0000-4000-8001-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'Plan ' || g, '2026-01-01', '00000000-0000-4000-8000-000000000004',
  (CASE WHEN g % 2 = 0 THEN 'VISUAL' ELSE 'EARLY' END)::"SchedulingMode",
  now()
FROM generate_series(1, 40) g;

-- 102,000 activities spread over those plans.
--   every 5th  → a placement (visual_start)
--   every 7th  → an SNET, with early_start arranged to land in each of the four classes
INSERT INTO activities (id, organization_id, plan_id, name, type, early_start, visual_start,
                        constraint_type, constraint_date, updated_at)
SELECT
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-8001-' || lpad(((g % 40) + 1)::text, 12, '0'))::uuid,
  'A' || g,
  'TASK'::"ActivityType",
  -- CORRECTED 2026-09-21 (one-planning-surface M-I, found by the database-architect review of the
  -- strip migration). The NULL branch was `g % 28 = 0` and the binding branch was
  -- `g % 7 = 0 AND g % 4 = 0`, which is ALSO `g % 28 = 0` — so every row this fixture intended to
  -- be BINDING had a null `early_start` and classified UNCLASSIFIED instead. Measured on the old
  -- file: binding 0, inert 3,643, unclassified 10,928. The fourth class (binding AND already
  -- placed) was likewise empty, because it is a subset of binding.
  --
  -- Two changes: the null branch moves to a modulus coprime with neither 7 nor 4 in a way that
  -- overlaps the binding class (33), and the class selector is cut from `(g / 7) % 4` rather than
  -- `g % 4`, so which class a constrained row lands in no longer correlates with `g % 28`. About
  -- 110 intended-binding rows (g ≡ 0 mod 924) still fall into the null branch and classify
  -- unclassified, which is why binding measures 3,532 rather than 3,642 — stated rather than
  -- tuned away, because the fixture's job is to populate all four classes and not to hit a number.
  (CASE WHEN g % 33 = 0 THEN NULL ELSE DATE '2026-02-01' + (g % 30) END),
  (CASE WHEN g % 5 = 0 THEN DATE '2026-03-01' + (g % 20) ELSE NULL END),
  (CASE WHEN g % 7 = 0 THEN 'SNET'::"ConstraintType" ELSE NULL END),
  (CASE WHEN g % 7 <> 0 THEN NULL
        WHEN (g / 7) % 4 = 0 THEN DATE '2026-02-01' + (g % 30)   -- binding: equal
        WHEN (g / 7) % 4 = 1 THEN DATE '2026-01-01'              -- inert: earlier
        ELSE DATE '2026-09-01' END),                             -- unclassified: later
  now()
FROM generate_series(1, 102000) g;

-- 400 baselines, ten per plan, each covering 50 activities at FULL level.
INSERT INTO baselines (id, organization_id, plan_id, name, revision_snapshot_level, updated_at)
SELECT
  ('00000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-8001-' || lpad(((g % 40) + 1)::text, 12, '0'))::uuid,
  'B' || g,
  (CASE WHEN g % 10 = 0 THEN 'NONE' ELSE 'FULL' END)::"RevisionSnapshotLevel",
  now()
FROM generate_series(1, 400) g;

INSERT INTO baseline_activities (id, organization_id, baseline_id, source_activity_id, name, duration_minutes, updated_at)
SELECT
  ('00000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-a000-' || lpad((((g / 50) % 400) + 1)::text, 12, '0'))::uuid,
  ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
  'BA' || g, 480, now()
FROM generate_series(1, 20000) g;
COMMIT;
ANALYZE organizations; ANALYZE clients; ANALYZE projects; ANALYZE calendars;
ANALYZE plans; ANALYZE activities; ANALYZE baselines; ANALYZE baseline_activities;
