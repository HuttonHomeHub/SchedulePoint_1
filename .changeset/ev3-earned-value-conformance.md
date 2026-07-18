---
'@repo/api': minor
'@repo/types': minor
---

Earned Value is now proven against the P6-class conformance fixture (EV3, ADR-0042 / ADR-0035 §29). A
new fixture→EV adapter (`earned-value-adapter.ts`) grounds `computeEarnedValue` in real fixture cost and
%-complete data — resource `price_per_unit`, assignment `budgeted_units`/`actual_units`, and `expenses`
rows for `A4200`/`A7100`/`A8010`/`A6100`/`A3010`/`A10300` plus their two real WBS-summary ancestors
(`W4000`/`W7000`) — with a first-principles golden (BAC/PV/EV/AC → SPI/CPI/EAC to the minor unit) and
three differentials proving a flipped option changes the output: the `percentCompleteType` flip on
`A4200` (the fixture's own physical-vs-duration divergence case), the `eacMethod` flip, and the
cost-baseline present/absent flip. The `%-complete-type` (`pct_physical`/`pct_units`) and cost/EV
(`cost_*`) halves of the capability matrix's deferred row flip to ✅ (resource curves, cost
accrual/period trending, and activity steps stay ⚪, named later rungs). ADR-0035 gains an **Accepted**
**§29** (percent-complete-type & earned-value semantics) plus **N22–N24**.

The Earned-Value module and read endpoint also gain the **N24** read-time data-quality signal: a new
`costWarningCount` on `PlanEarnedValue` / `PlanEarnedValueResult` counts leaf activities that show
booked actual cost/units while apparently not started — surfaced, never rejected, so spend-without-
progress (the exact CV signal) is visible rather than silently accepted. Additive field; `0` when no
activity triggers it.
