---
'@repo/api': minor
'@repo/types': minor
---

Store a resource's join lag — the delay before a crew arrives on an activity

The CPM engine's resource-histogram read-model has taken a per-assignment `lagMinutes` since the
ADR-0044 rung-5 slice, shifts the effective span by it, and is scored against the fixture's own
24-hour lag case — and **nothing in the product could store one**. This is the surface audit's
inverted finding (F6): normally storage supports what no write path can produce; here the engine
supported what no storage could hold, with the coverage report recording the omission as if it were a
design decision ("an assignment has no lag field: work starts with its activity").

`resource_assignments.lag_minutes` now exists — working minutes, measured on the **activity's own**
calendar (ADR-0037), on both write DTOs, on the assignment response and on
`ResourceAssignmentSummary`. Constant `DEFAULT 0`, so every existing assignment keeps today's
behaviour exactly: the resource joins with the activity.

The column is **unsigned**, deliberately unlike a dependency's signed lag. A negative dependency lag
is a lead and means something; a resource joining before the work starts does not. More to the point,
a signed column would be a trap rather than harmless symmetry — the read-model applies the lag only
when `> 0` (a parity fast path for the common zero case), so a stored negative would be silently
discarded and the assignment would behave as unlagged with the API having said yes. The DTO's
`@Min(0)` is the primary reject (N34); the database CHECK is defence in depth.

`lagMinutes` is **never cost-gated**. A lag is a scheduling fact, not money, so a Viewer reads a real
value while `budgetedCost`/`actualCost` are withheld — pinned by an e2e case rather than asserted,
because gating it would make a Viewer's picture of when the resource arrives disagree with a
Planner's.

This is ADR-0071 M0: storage and the API. The histogram, levelling and earned-value passes read the
stored lag in M1–M3; the planner-facing control lands in M4. **The CPM engine is not modified and the
ADR-0034 recalculation parity gate is untouched.**
