---
'@repo/api': patch
---

WBS-summary soft-delete now cascades its `parentId` subtree (M5-epic F7.5, ADR-0038 / TECH_DEBT #36).
Soft-deleting an activity resolves its active WBS subtree breadth-first — a leaf is just itself; a
`WBS_SUMMARY` sweeps every descendant it heads — and stamps the whole subtree plus every incident
dependency link with one `deleteBatchId`, so restoring the summary reactivates the branch together and
a descendant deleted in an earlier batch is not resurrected. The restore guard is hardened
symmetrically: an activity reactivates only while **both** its plan and (if grouped) its WBS-summary
parent are active, so a separately-deleted child cannot come back under a still-deleted summary
(`409 PARENT_DELETED`). Upholds ADR-0038's "no active row under a deleted ancestor" invariant on the
`parent_id` axis, closing the gap before summaries become planner-creatable (F8). Service-only; a
plan with no summaries is unaffected (every leaf resolves to itself).
