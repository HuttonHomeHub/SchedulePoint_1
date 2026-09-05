---
'@repo/api': minor
---

Freeze the criticality rule a baseline's snapshot was computed under. Four nullable columns on
`baselines`, copied at capture from the plan's engine-owned mirrors inside the plan advisory lock
the capture already holds — never from the plan's client-settable options, which a settings edit
writes without recalculating. `baseline_activities.is_critical` and `.total_float` are the output
of a rule, so until now a baseline froze the output and not the rule, and a comparison against an
older baseline reported a definition change as activities entering the critical path. NULL means
the rule is unknown — captured before this shipped, or from a plan whose last recalculation
predated the mirror — and is never a claim.
