---
'@repo/api': minor
---

Add baseline activate + delete with cascade (M7 Task B2, ADR-0025).
`POST …/baselines/:id/activate` (200) makes a baseline the plan's active comparison
baseline: under the plan write-lock it clears the current active row **before** setting
the target, so the one-active-per-plan partial unique is never momentarily violated;
it is idempotent and 404s if the baseline was deleted meanwhile. `DELETE …/baselines/:id`
(204) soft-cascades the baseline and its snapshot rows under one `delete_batch_id`;
deleting the active baseline simply leaves the plan with none active. Deny-by-default:
`baseline:activate` / `baseline:delete` (Planner + Org Admin). The
`HierarchyLifecycleService` now sweeps a plan's baselines (and their snapshot rows) into
the batch when a plan/project/client is deleted, and restores them with the plan — so a
baseline never dangles under a soft-deleted plan and comes back on restore with its active
flag intact.
