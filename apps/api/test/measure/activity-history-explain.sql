-- usage: psql -v act=<uuid> -v org=<uuid> -f explain.sql   (ADR-0174 M1-T7; SQL copied from
-- activity-history.recorder.ts probe() and activity-history.service.ts list())
\set ON_ERROR_STOP on
\timing off
select 'ACT', :'act' as act;
\echo === (a) merge lookup: recorder probe(), one activity
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id AS "activityId", a.organization_id AS "organizationId",
       date_trunc('milliseconds', clock_timestamp()) AS "now",
       e.id AS "entryId", e.actor_user_id AS "actorUserId", e.scope::text AS scope,
       e.first_recorded_at AS "firstRecordedAt", e.last_recorded_at AS "lastRecordedAt",
       e.edit_count AS "editCount", e.batch_id AS "batchId", e.changes AS changes
FROM unnest(ARRAY[:'act']::uuid[]) AS u(id)
JOIN activities a ON a.id = u.id
LEFT JOIN LATERAL (
  SELECT * FROM activity_history_entries h
  WHERE h.activity_id = a.id
  ORDER BY h.first_recorded_at DESC, h.id DESC
  LIMIT 1
) e ON true;
\echo === (b1) read page, first page, cost reader, LIMIT 51
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, actor_user_id AS "actorUserId", scope::text AS scope,
       first_recorded_at AS "firstRecordedAt", last_recorded_at AS "lastRecordedAt",
       edit_count AS "editCount", batch_id AS "batchId", batch_size AS "batchSize",
       origin::text AS origin, changes
FROM activity_history_entries
WHERE activity_id = :'act'::uuid AND organization_id = :'org'::uuid
ORDER BY first_recorded_at DESC, id DESC
LIMIT 51;
\echo === (b2) read page, first page, non-cost reader (has_non_cost_change)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, actor_user_id AS "actorUserId", scope::text AS scope,
       first_recorded_at AS "firstRecordedAt", last_recorded_at AS "lastRecordedAt",
       edit_count AS "editCount", batch_id AS "batchId", batch_size AS "batchSize",
       origin::text AS origin, changes
FROM activity_history_entries
WHERE activity_id = :'act'::uuid AND organization_id = :'org'::uuid AND has_non_cost_change
ORDER BY first_recorded_at DESC, id DESC
LIMIT 51;
\echo === (b3) deep page: keyset cursor ~500 entries down
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, actor_user_id AS "actorUserId", scope::text AS scope,
       first_recorded_at AS "firstRecordedAt", last_recorded_at AS "lastRecordedAt",
       edit_count AS "editCount", batch_id AS "batchId", batch_size AS "batchSize",
       origin::text AS origin, changes
FROM activity_history_entries
WHERE activity_id = :'act'::uuid AND organization_id = :'org'::uuid
  AND (first_recorded_at, id) < (now() - interval '1 day' - interval '500 hours', '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY first_recorded_at DESC, id DESC
LIMIT 51;
\echo === (b4) first page again under a GENERIC plan (as a prepared Prisma statement becomes after 5 runs)
SET plan_cache_mode = force_generic_plan;
PREPARE rp(uuid, uuid) AS
SELECT id, changes FROM activity_history_entries
WHERE activity_id = $1 AND organization_id = $2
ORDER BY first_recorded_at DESC, id DESC LIMIT 51;
EXPLAIN (ANALYZE, BUFFERS) EXECUTE rp(:'act', :'org');
