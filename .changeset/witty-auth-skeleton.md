---
'@repo/api': minor
'@repo/types': minor
---

Wire up authentication and the current-user endpoint (walking skeleton). Mounts
Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
`AuthContextService` seam, adds the identity tables (`users`, `sessions`,
`accounts`, `verifications`) as the first migration, and exposes an
authenticated `GET /api/v1/me` returning the signed-in user and their
organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
`OrganizationRole` contracts to `@repo/types`.
