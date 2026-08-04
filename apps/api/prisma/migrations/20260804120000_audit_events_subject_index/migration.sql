-- ADR-0073 C2.3: serve the widened `/me` read (`include=attempts`).
--
-- The existing idx_audit_events_actor_occurred is partial on `actor_user_id IS NOT NULL`, so it
-- structurally cannot serve the second disjunct — which selects rows where `actor_user_id IS NULL`,
-- exactly the rows that index excludes. Without this, the widened read falls off a cliff to a full
-- sequential scan.
--
-- MEASURED before it was written (Postgres 17, 1,000,000 rows: 990k attributed across 500 actors,
-- 10k actor-less failed sign-ins, 2k of them naming one subject). `EXPLAIN (ANALYZE, BUFFERS)` on
-- the real keyset query, warm:
--
--   include absent (the parity path)     0.20 ms   Index Scan — unchanged, and must stay so
--   include=attempts, no index          49–52 ms   Parallel Seq Scan over the whole table
--   include=attempts, with this index     7.1 ms   BitmapOr across both partial indexes
--   include=attempts, user with none      7.6 ms   still indexed; the common case
--
-- Cost: 576 kB on a 145 MB table (+0.4%). The C1 candidate index was rejected at 76 MB for a
-- smaller win; this one is three orders of magnitude cheaper because it is partial over the ~1% of
-- rows that are actor-less. That asymmetry is the whole reason one lands and the other did not.
--
-- What this does NOT do, stated so the next reader does not have to re-measure to find out: 7 ms is
-- still 35x the 0.2 ms unwidened read, because an OR forces a bitmap heap scan and a sort instead of
-- walking one already-ordered index. Recovering that means running the two disjuncts as separate
-- keyset queries and merging them in the repository — more code, and not worth it at 7 ms. If the
-- attempt volume ever makes it worth it, that is the move, not a wider index.
CREATE INDEX "idx_audit_events_subject_occurred"
  ON "audit_events" ("subject_id", "occurred_at" DESC, "id" DESC)
  WHERE "actor_user_id" IS NULL AND "subject_id" IS NOT NULL;
