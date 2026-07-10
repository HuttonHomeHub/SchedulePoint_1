---
'@repo/api': minor
---

Add the organisation recycle-bin endpoint (`GET /organizations/:orgSlug/deleted`):
one deletion-time-ordered, cursor-paginated list of soft-deleted clients,
projects and plans, each carrying a `canRestore` flag that is false while an
ancestor is still deleted (surfacing the top-down restore invariant). Reading
requires hierarchy read (any member); restore stays on the existing per-entity,
writer-only `.../{id}/restore` routes. Pagination is keyset over the union of the
three tables by `(deletedAt, id)`.
