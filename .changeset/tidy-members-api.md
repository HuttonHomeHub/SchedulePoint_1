---
'@repo/api': minor
'@repo/types': minor
---

Add membership management. New endpoints under the organisation scope:
`GET /api/v1/organizations/:orgSlug/members` (cursor-paginated roster with user
profiles), `PATCH .../members/:memberId` (change role, Org Admin only, with
optimistic locking and the last-Org-Admin invariant), and
`DELETE .../members/:memberId` (soft-delete, Org Admin only, last-admin
protected). Every route resolves the org scope from the caller's memberships
(404 for non-members; 403 for insufficient role). Adds the shared
`OrgMemberSummary` contract to `@repo/types`.
