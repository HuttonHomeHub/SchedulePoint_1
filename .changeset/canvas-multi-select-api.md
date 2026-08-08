---
'@repo/api': minor
---

Batch activity operations: placements, bulk delete, and an id-stable batch restore.

`PATCH …/plans/:planId/activities/placements` moves several activities in time (and
optionally lane) all-or-nothing; `POST …/activities/bulk-delete` soft-deletes several as
one act under one `deleteBatchId`; `POST …/activities/restore-batch/:batchId` reverses it
with the original ids, so the dependencies between the deleted activities come back too.

Every placement field is required but nullable — an omitted field is a validation error,
never a silent clear — and the write seam names four placement columns and no others, so a
bulk move cannot reach a definition field. A `WBS_SUMMARY` is refused by both batch routes.
