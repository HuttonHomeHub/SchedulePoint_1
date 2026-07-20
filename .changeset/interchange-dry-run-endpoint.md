---
'@repo/api': minor
---

Add the `interchange` NestJS module and the stateless schedule-interchange **dry-run** endpoint
(ADR-0050, Stage C2, Task 1.4). `POST …/organizations/:orgSlug/projects/:projectId/interchange/dry-run`
accepts a multipart file upload, enforces the new **`interchange:import`** permission (Planner + Org
Admin) plus an org-scope check on the target project (anti-IDOR), caps the upload size at the HTTP
boundary (16 MiB → 413), and runs the pure `@repo/interchange` pipeline to return the pre-commit
`InterchangeReport` (mapped counts + approximation/repair/drop findings) — **without persisting anything**.
An unrecognised/malformed file is a user-safe 422. The transactional commit endpoint (create the plan +
recalculate) lands in a follow-up task.
