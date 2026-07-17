---
'@repo/api': minor
'@repo/types': minor
---

Selectable critical-path definition (M6-F2, ADR-0035 §17–§20). Plans gain two options:
`criticalPathDefinition` (`TOTAL_FLOAT`, the P6 default, or `LONGEST_PATH`) and `criticalFloatThreshold`
(whole working days, default 0). Under `LONGEST_PATH` the engine flags the contiguous chain of driving
ties running back from the latest-finishing activities, so an open-ended, hugely-negative-float activity
is no longer critical though it is under `TOTAL_FLOAT ≤ 0`. The threshold widens the total-float critical
band. Both are echoed on the plan response and accepted on plan update; defaults are behaviour-preserving
(the golden path and existing critical sets are unchanged). Conformance scenario **S07** now runs as a
criticality-only differential.
