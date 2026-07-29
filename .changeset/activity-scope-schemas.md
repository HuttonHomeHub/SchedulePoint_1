---
'@repo/web': patch
---

Add the activity editor's per-scope schemas, body builders and gating (dark)

The pure layer the tabbed editor stands on: four scope schemas partitioning
`activityFormSchema` (with a structural test asserting the partition is exact in
both directions), four PATCH body builders whose exact key sets are pinned, a
`useUpdateActivityFields` partial-update hook beside the unchanged
`useUpdateActivity`, and `deriveActivityEditorGating` with a full role × pen
matrix test. Nothing consumes any of it yet, so nothing user-visible changes.
