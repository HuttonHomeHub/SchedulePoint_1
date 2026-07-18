---
'@repo/api': minor
'@repo/types': minor
---

EV2a: make the EV1 cost & percent-complete-type fields (ADR-0042) settable via the API. Passthrough only
— no earned-value computation and no new endpoint (that is EV2b). Threads the already-landed schema columns
through the create/update DTOs and the service/repository write paths so they persist without changing any
behaviour. Client-settable inputs (all Planner/Org-Admin-gated writes): activities `percentCompleteType`
(`DURATION` default / `UNITS` / `PHYSICAL`), `physicalPercentComplete` (0–100, N23), `budgetedExpense` /
`actualExpense`; resources `costPerUnit` (cost rate, N22); assignments `budgetedCost` (null = derive later),
`actualCost`, `actualUnits`; plan `eacMethod` (`CPI` default) / `currencyCode` (ISO-4217, nullable to clear).

**Cost reads are Planner/Org-Admin only.** The commercially sensitive money **amounts** (`costPerUnit`,
`budgetedCost` / `actualCost`, `budgetedExpense` / `actualExpense`) are deliberately NOT returned by the
general entity GETs or in `@repo/types` summary types — they will be served only by the dedicated
`cost:read`-gated Earned-Value read endpoint (EV2b), so a Viewer/Contributor can never read cost through a
schedule read. The non-sensitive fields (`percentCompleteType`, `physicalPercentComplete`, `actualUnits` —
a quantity like the already-public `budgetedUnits` —, `eacMethod`, `currencyCode`) remain in the summaries.
Money on the wire is a plain `number` of minor units (`BIGINT` amounts → `Number(x)`, the `Decimal(18,4)`
cost rate → `x.toNumber()`). Fully additive and behaviour-preserving: unset fields keep today's behaviour
and nothing touches the CPM engine, recalc, or baseline capture.
