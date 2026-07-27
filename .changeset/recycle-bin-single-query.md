---
'@repo/api': patch
---

The recycle bin reads one page instead of three.

It paginated the union of the client, project and plan tables by fetching each table's own top page
and merge-sorting in the service — reading three times as many rows as it returned. That cost was
paid on every page, not once, because the recycle-bin screen follows the cursor to the end.

One `UNION ALL … ORDER BY (deleted_at DESC, id ASC) LIMIT` now does the merge in the database and
returns exactly the page asked for. Same rows, same order, same restorability.
