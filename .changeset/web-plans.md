---
'@repo/web': minor
---

Add the web plans slice (E2): a project's plans table (name → plan detail,
status, planned start) with create/edit/delete for writers, a plan form with a
status select and an optional planned-start date (`<input type="date">`, wire
format `YYYY-MM-DD`), and a plan-detail route (`/orgs/:orgSlug/plans/:planId`)
showing the plan's metadata plus a region reserved for the future Time-Scaled
Logic Diagram canvas. The project screen now lists real plans instead of a
placeholder.
