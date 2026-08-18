\timing on
BEGIN;
CREATE TEMP TABLE sp ON COMMIT DROP AS SELECT 'acaaaaaa-0000-0000-0000-000000000001'::uuid id;
CREATE TEMP TABLE sa ON COMMIT DROP AS SELECT id FROM activities WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM cross_plan_dependencies WHERE predecessor_plan_id IN (SELECT id FROM sp) OR successor_plan_id IN (SELECT id FROM sp) OR predecessor_id IN (SELECT id FROM sa) OR successor_id IN (SELECT id FROM sa);
DELETE FROM dependencies WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM resource_assignments WHERE activity_id IN (SELECT id FROM sa);
DELETE FROM activity_steps WHERE activity_id IN (SELECT id FROM sa);
DELETE FROM notes WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM baseline_assignments WHERE baseline_id IN (SELECT id FROM baselines WHERE plan_id IN (SELECT id FROM sp));
DELETE FROM baseline_activities  WHERE baseline_id IN (SELECT id FROM baselines WHERE plan_id IN (SELECT id FROM sp));
DELETE FROM baselines WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM plan_shares WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM activities WHERE plan_id IN (SELECT id FROM sp);
DELETE FROM plans WHERE id IN (SELECT id FROM sp);
ROLLBACK;
