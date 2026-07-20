---
'@repo/api': minor
---

Add the schedule-interchange **commit** endpoint (ADR-0050, Stage C2, Task 1.5).
`POST …/organizations/:orgSlug/projects/:projectId/interchange/commit` re-accepts the multipart upload,
re-parses it with the pure `@repo/interchange` pipeline (deterministic — the graph equals the reviewed
dry-run), and in **one transaction** creates the plan with its calendars, activities and dependencies via
the existing repositories (the same transaction-composition the domain services use), then **recalculates**
the new plan (ADR-0022 — the CPM engine is only invoked, never modified) and returns
`201 { data: { planId, report } }`. Same `interchange:import` permission, target-project org-scope
(anti-IDOR) and 16 MiB byte cap as the dry-run. **Atomicity:** an unparseable file (422 before any write),
a persistence rejection (duplicate plan/calendar name, duplicate/cyclic dependency — the whole transaction
rolls back), or a recalculation failure (compensated) leaves **nothing created**. Calendars are imported to
the M1 weekday-mask contract (intraday shifts approximated to worked weekdays); activities take a
deterministic lane per source order.
