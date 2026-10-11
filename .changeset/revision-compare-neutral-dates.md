---
'@repo/api': minor
---

The revision comparison's moved activities now carry `fromStart`, `toStart`, `fromFinish` and `toFinish`, named for the dates the comparison actually used (placed dates when `datesBasis` is `PLACED`). The `fromEarlyStart`, `toEarlyStart`, `fromEarlyFinish` and `toEarlyFinish` fields carry the same values, are marked deprecated and will be removed at the next breaking API change. The OpenAPI description of `placementNotAssessableReason` no longer says placement comparison is unimplemented.
