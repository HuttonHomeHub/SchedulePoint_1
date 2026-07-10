---
'@repo/api': minor
'@repo/types': minor
---

Add the activity-dependency authorisation and contract foundation (ADR-0021). New
`dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
every member, `dependency:create/update/delete` for Planner + Org Admin only
(deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
(FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
service-layer cycle-prevention strategy; DECISIONS.md records the permission
namespace and link cascade/restore behaviour.
