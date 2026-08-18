EXPLAIN (ANALYZE, BUFFERS)
SELECT 'client' AS kind, c.id, c.delete_batch_id, c.deleted_at
  FROM clients c
 WHERE c.deleted_at < :cutoff::timestamptz
UNION ALL
SELECT 'project', p.id, p.delete_batch_id, p.deleted_at
  FROM projects p JOIN clients c ON c.id = p.client_id
 WHERE p.deleted_at < :cutoff::timestamptz
   AND c.delete_batch_id IS DISTINCT FROM p.delete_batch_id
UNION ALL
SELECT 'plan', pl.id, pl.delete_batch_id, pl.deleted_at
  FROM plans pl JOIN projects p ON p.id = pl.project_id
 WHERE pl.deleted_at < :cutoff::timestamptz
   AND p.delete_batch_id IS DISTINCT FROM pl.delete_batch_id
 ORDER BY deleted_at ASC
 LIMIT 50;
