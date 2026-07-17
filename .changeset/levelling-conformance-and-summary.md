---
'@repo/api': minor
'@repo/types': minor
---

Resource **levelling** is now proven against the P6-class conformance fixture and its summary counts are
surfaced on the HTTP schedule-summary (M7 levelling rung, ADR-0041 / ADR-0035 §28). The conformance
adapter gains an opt-in `honorLevelling` demand-model build (capacity from `max_units_per_hour`, demand
from every active assignment's `units_per_hour`); scenario **S10** runs as a runnable **leveled-date**
differential (NL-CRANE600 A6100/A6200 + NL-HYDROPUMP A7700/A7730 serialise; mandatory A10100/A10500 are
never moved) with the pure early/late/float layer byte-identical to S01 (Q2), plus a first-principles
levelling golden. The `Resource levelling` capability row + S10 flip ✅ in the capability matrix, and
ADR-0035 §28 (levelling semantics) + N21 (negative-capacity reject) are Accepted.

The schedule summary (`PlanScheduleSummary` / `PlanScheduleSummaryDto`, both the recalculate result and
the read endpoint) now carries `leveledActivityCount`, `levelingWindowExceededCount`,
`selfOverAllocatedCount` and `leveledProjectFinish` — a read-time aggregate over the plan's engine-owned
leveled columns, `0` / `null` when the plan does not level (`levelResources` off — the byte-identical
parity path). Additive fields only; no behaviour change when levelling is off.
