---
'@repo/api': minor
---

feat(interchange): read-only XER schedule export endpoint + `interchange:export` permission (ADR-0050 M4a)

Adds `GET /api/v1/organizations/:orgSlug/plans/:planId/interchange/export/:format` (M4a: `format = xer`),
a thin, read-only NestJS surface over the pure `@repo/interchange` exporter. It resolves the org from the
caller's memberships (anti-IDOR), scopes the target plan to that org, reads the plan's core network
(activities, dependencies, calendars — plus resources/assignments/constraints/progress, honestly reported as
out-of-M4a-scope drops) into an `ExportGraph`, and streams the serialised `.xer` as an attachment. The
interchange report rides in an `X-Interchange-Report` response header (compact JSON). No database writes, no
migration, and the CPM engine + recalc parity golden suite are untouched.

Introduces the `interchange:export` permission, granted to **every member** (Viewer upward) — export is a
read-egress of on-screen-readable schedule data, unlike the Planner/Org-Admin-only `interchange:import`.

The global response-envelope interceptor now passes binary `StreamableFile` responses through unwrapped, and
CORS exposes `Content-Disposition` + `X-Interchange-Report` so a browser client can read them.
