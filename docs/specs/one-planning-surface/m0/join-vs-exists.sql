-- Captured 2026-09-20 on the dense estate (every activity placed).
-- The SQL below is the shape gate S-4 REFUSES. Committed verbatim because the
-- finding turns entirely on WHICH EXISTS was measured, and nothing recorded it.

-- REFUSED by gate S-4: baselines-outer semi-join
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) AS affected,
       count(DISTINCT b.plan_id) AS affected_plans,
       count(DISTINCT p.organization_id) AS affected_organizations
FROM baselines b
JOIN plans p ON p.id = b.plan_id AND p.deleted_at IS NULL
WHERE b.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM activities a
              WHERE a.plan_id = b.plan_id AND a.deleted_at IS NULL
                AND a.visual_start IS NOT NULL);

-- PLAN:
                                                                                 QUERY PLAN                                                                                 
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=188.92..188.93 rows=1 width=24) (actual time=2.544..2.547 rows=1 loops=1)
   Buffers: shared hit=7790
   ->  Sort  (cost=184.92..185.92 rows=400 width=32) (actual time=2.453..2.473 rows=400 loops=1)
         Sort Key: b.plan_id
         Sort Method: quicksort  Memory: 46kB
         Buffers: shared hit=7790
         ->  Hash Join  (cost=2.19..167.63 rows=400 width=32) (actual time=0.070..2.331 rows=400 loops=1)
               Hash Cond: (b.plan_id = p.id)
               Buffers: shared hit=7787
               ->  Nested Loop Semi Join  (cost=0.29..164.57 rows=400 width=32) (actual time=0.036..2.226 rows=400 loops=1)
                     Buffers: shared hit=7786
                     ->  Seq Scan on baselines b  (cost=0.00..11.00 rows=400 width=16) (actual time=0.009..0.099 rows=400 loops=1)
                           Filter: (deleted_at IS NULL)
                           Buffers: shared hit=7
                     ->  Index Scan using idx_activities_plan_updated_at on activities a  (cost=0.29..91.40 rows=2550 width=16) (actual time=0.005..0.005 rows=1 loops=400)
                           Index Cond: (plan_id = b.plan_id)
                           Filter: (visual_start IS NOT NULL)
                           Buffers: shared hit=7380

-- ============ SHIPPED (gate S-4 compliant) ============
-- SHIPPED (gate S-4 compliant): join + count(DISTINCT)
EXPLAIN (ANALYZE, BUFFERS) SELECT count(DISTINCT b.id) AS affected,
       count(DISTINCT b.plan_id) AS affected_plans,
       count(DISTINCT p.organization_id) AS affected_organizations
FROM baselines b
JOIN plans p      ON p.id = b.plan_id AND p.deleted_at IS NULL
JOIN activities a ON a.plan_id = b.plan_id AND a.deleted_at IS NULL
                 AND a.visual_start IS NOT NULL
WHERE b.deleted_at IS NULL;

-- PLAN:
                                                                               QUERY PLAN                                                                               
------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=26736.53..26736.54 rows=1 width=24) (actual time=493.169..493.174 rows=1 loops=1)
   Buffers: shared hit=93443, temp read=5008 written=5032
   ->  Nested Loop  (cost=0.73..19086.53 rows=1020000 width=48) (actual time=0.051..209.604 rows=1020000 loops=1)
         Join Filter: (p.id = a.plan_id)
         Buffers: shared hit=93440
         ->  Nested Loop  (cost=0.42..49.75 rows=400 width=64) (actual time=0.024..0.915 rows=400 loops=1)
               Buffers: shared hit=90
               ->  Index Scan using baselines_pkey on baselines b  (cost=0.27..32.27 rows=400 width=32) (actual time=0.013..0.373 rows=400 loops=1)
                     Filter: (deleted_at IS NULL)
                     Buffers: shared hit=10
               ->  Memoize  (cost=0.15..0.20 rows=1 width=32) (actual time=0.001..0.001 rows=1 loops=400)
                     Cache Key: b.plan_id
                     Cache Mode: logical
                     Hits: 360  Misses: 40  Evictions: 0  Overflows: 0  Memory Usage: 6kB
                     Buffers: shared hit=80
                     ->  Index Scan using plans_pkey on plans p  (cost=0.14..0.19 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=40)
                           Index Cond: (id = b.plan_id)
                           Filter: (deleted_at IS NULL)
