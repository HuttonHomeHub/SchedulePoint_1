---
'@repo/api': minor
---

Record the criticality rule each recalculation actually ran with. Four nullable engine-owned columns
on `plans`, written by the recalculation's own freshness stamp from the same object spread into the
engine's options. The plan's `criticalPathDefinition` / `criticalFloatThresholdMinutes` /
`totalFloatMode` / `makeOpenEndsCritical` columns are its configuration and a settings edit writes
them without recalculating, so they were never evidence of which rule produced the persisted
`is_critical` and `total_float`. NULL means the rule is unknown — never recalculated, or
recalculated before this shipped — and is never a claim.
