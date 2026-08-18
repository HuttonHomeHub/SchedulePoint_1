CREATE OR REPLACE FUNCTION walk_bin2(p_slug text, p_take int, p_perbranch boolean)
RETURNS TABLE(pages int, rows_out int, total_ms numeric) LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid; v_at timestamptz := NULL; v_id uuid := NULL;
  v_body text; v_sql text; v_t0 timestamptz; v_pages int := 0; v_rows int := 0;
  v_n int; v_d timestamptz; v_lid uuid;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug = p_slug;
  IF p_perbranch THEN
    v_body := $q$
      (SELECT 'client' k, c.id, c.name, c.deleted_at d, true pa FROM clients c
        WHERE c.organization_id=$1 AND c.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR c.deleted_at < $2 OR (c.deleted_at = $2 AND c.id > $3))
        ORDER BY c.deleted_at DESC, c.id ASC LIMIT $4)
      UNION ALL
      (SELECT 'project', p.id, p.name, p.deleted_at, (cl.deleted_at IS NULL) FROM projects p JOIN clients cl ON cl.id=p.client_id
        WHERE p.organization_id=$1 AND p.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR p.deleted_at < $2 OR (p.deleted_at = $2 AND p.id > $3))
        ORDER BY p.deleted_at DESC, p.id ASC LIMIT $4)
      UNION ALL
      (SELECT 'plan', pl.id, pl.name, pl.deleted_at, (pr.deleted_at IS NULL) FROM plans pl JOIN projects pr ON pr.id=pl.project_id
        WHERE pl.organization_id=$1 AND pl.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR pl.deleted_at < $2 OR (pl.deleted_at = $2 AND pl.id > $3))
        ORDER BY pl.deleted_at DESC, pl.id ASC LIMIT $4)
      ORDER BY d DESC, id ASC LIMIT $4$q$;
  ELSE
    v_body := $q$
      SELECT 'client' k, c.id, c.name, c.deleted_at d, true pa FROM clients c
        WHERE c.organization_id=$1 AND c.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR c.deleted_at < $2 OR (c.deleted_at = $2 AND c.id > $3))
      UNION ALL
      SELECT 'project', p.id, p.name, p.deleted_at, (cl.deleted_at IS NULL) FROM projects p JOIN clients cl ON cl.id=p.client_id
        WHERE p.organization_id=$1 AND p.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR p.deleted_at < $2 OR (p.deleted_at = $2 AND p.id > $3))
      UNION ALL
      SELECT 'plan', pl.id, pl.name, pl.deleted_at, (pr.deleted_at IS NULL) FROM plans pl JOIN projects pr ON pr.id=pl.project_id
        WHERE pl.organization_id=$1 AND pl.deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR pl.deleted_at < $2 OR (pl.deleted_at = $2 AND pl.id > $3))
      ORDER BY d DESC, id ASC LIMIT $4$q$;
  END IF;
  v_sql := 'WITH page AS (' || v_body || ') SELECT count(*)::int,'
        || ' (SELECT d FROM page ORDER BY d ASC, id DESC LIMIT 1),'
        || ' (SELECT id FROM page ORDER BY d ASC, id DESC LIMIT 1) FROM page';

  v_t0 := clock_timestamp();
  LOOP
    EXECUTE v_sql INTO v_n, v_d, v_lid USING v_org, v_at, v_id, p_take;
    v_pages := v_pages + 1; v_rows := v_rows + v_n;
    EXIT WHEN v_n < p_take;
    v_at := v_d; v_id := v_lid;
  END LOOP;
  total_ms := EXTRACT(epoch FROM clock_timestamp() - v_t0) * 1000;
  pages := v_pages; rows_out := v_rows; RETURN NEXT;
END $$;
