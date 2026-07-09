---
'@repo/web': minor
---

Add the web screens to browse and manage clients and projects (E1). New routes
`/orgs/:orgSlug/clients` (list), `/orgs/:orgSlug/clients/:clientId` (a client's
projects), and `/orgs/:orgSlug/projects/:projectId` (the plans shell, filled in
by E2), reachable from a new "Clients" nav item. Each screen has create/edit
dialogs and a confirm-first soft delete, breadcrumbs, and loading/empty/error/
not-found states; write affordances are hidden for non-writers (Viewer/
Contributor) while the API still enforces authorisation. Covered by component
tests and a Playwright journey (create client → open → create project) with an
accessibility check.
