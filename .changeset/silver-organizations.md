---
'@repo/api': minor
'@repo/types': minor
---

Add the organisations tenancy core. New `Organization` and `OrgMember` models
(the canonical org-scoping foundation: UUID v7, soft-delete, audit, optimistic
locking, partial-unique slug and one-membership-per-user indexes) and the
`organizations` module: `POST /api/v1/organizations` (creator becomes Org Admin,
atomically, with slug uniquification), `GET /api/v1/organizations` (the caller's
orgs), and `GET /api/v1/organizations/:orgSlug` (404 for non-members —
anti-enumeration). The auth seam now hydrates a principal's memberships and
permissions from the database, so `/api/v1/me` returns real memberships and
`principal.can(permission, orgId)` is enforced. Adds the shared
`OrganizationSummary` contract to `@repo/types`.
