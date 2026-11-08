---
'@repo/api': minor
'@repo/web': minor
---

Float is now compared in working minutes, so changing how long a working day is no longer shows as float movement against a baseline or between two plans. Compare revisions reads "Float down 2 days (16 h)" (days on the earlier revision's plan working day, with the exact hours beside), "Float unchanged" only when nothing moved, and "Float movement unknown" where it cannot tell; a quiet note says how many activities' float could not be compared. The activities table's Total float variance column and the "Criticality changed" change list follow the same rule. A baseline captured before this release, and a plan not recalculated since, show the unknown reading until recalculated or replaced.

API: each moved row of `revision-compare` and `cross-plan-revision-compare` gains `fromTotalFloatMinutes`, `toTotalFloatMinutes` and `floatMovementMinutes`, and its `fromTotalFloatDays`, `toTotalFloatDays` and `floatMovementDays` are now derived from them on `dayFactorMinutes` (null where a side has no minutes). Both responses gain `floatNotComparableCount`. The baseline variance read gains `floatVarianceMinutes` per row and `floatNotComparableCount` in `meta`, and `floatVarianceDays` is re-derived from minutes. The organisation export is format 2.5 (two appended `totalFloatMinutes` columns).
