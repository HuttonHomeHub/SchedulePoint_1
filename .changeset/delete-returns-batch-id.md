---
'@repo/api': minor
'@repo/web': patch
---

`DELETE …/activities/:activityId` returns the delete batch id.

The route answered `204 No Content`; it now answers `200 { deleteBatchId }`. Nothing about the
delete changed — a cascade has always assigned that id, covering the whole subtree when the activity
is a WBS summary — but a bodiless response meant a client could not call `restore-batch` on the rows
it had just deleted. That is why undoing a copied WBS band had no redo: the undo deletes the copy's
root and lets the cascade run, and the redo needs an id nobody was told.

The **status code moves**, 204 → 200. A caller that reads the body is unaffected; a caller that
branches on the status, or a generated client that treats 204 specially, is not — five of this
repository's own e2e specs had to change `.expect(204)` to `.expect(200)`. Pre-1.0, that is a minor
bump (CLAUDE.md §10).
