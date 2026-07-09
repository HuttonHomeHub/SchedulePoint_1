---
'@repo/api': minor
---

Establish the core identity & tenancy model and adopt the SchedulePoint
organisation role set (ADR-0016). `OrganizationRole` is now
`ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` (replacing the placeholder
`OWNER / MEMBER / VIEWER`); External Guest is modelled separately, not as a
member role. The reference-feature role→permission map and RBAC tests are
updated in step. No runtime behaviour changes yet.
