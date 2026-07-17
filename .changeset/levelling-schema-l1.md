---
'@repo/api': minor
'@repo/types': minor
---

L1 resource-levelling schema fields wired through the API (ADR-0041, the additive DARK slice). Threads
the already-landed schema columns through `@repo/types`, the DTOs, and the service/repository write paths
so they round-trip without changing any behaviour. Client-settable inputs: `resources.maxUnitsPerHour`
(capacity ceiling, null = uncapped, N21 `@Min(0)`), `activities.levelingPriority` (levelling tie-break,
null = unset), and the plan options `plans.levelResources` / `plans.levelWithinFloatOnly`. Engine-owned
overlay (response-echo only, never accepted from a write DTO): `activities.leveledStart` /
`leveledFinish`, `levelingDelayDays` (echoed from stored `levelingDelayMinutes`), `levelingWindowExceeded`,
and `selfOverAllocated` — all null/false until the L2 levelling pass writes them. Fully additive and
byte-parity: with levelling off (the default) nothing runs and every plan recalculates unchanged. The L2
engine pass and L3 conformance follow.
