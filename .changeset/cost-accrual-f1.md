---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Cost accrual (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). Each activity gains a settable `accrualType`
(`START` / `UNIFORM` (default) / `END`) that governs **when** its cost lump-sum is recognised in the
Earned-Value read's Planned-Value time-phasing — `START` at the activity start, `END` at its finish,
`UNIFORM` linearly — reshaping the cost / cash-flow S-curve. It **never changes a CPM date**, feeds the
scheduler nothing, and is a pure read-model extension of `earned-value.ts`: `UNIFORM` (or absent) is
byte-identical to the pre-ADR-0044 phasing (the parity gate), so the existing Earned-Value goldens stay
green. The engine (`compute.ts`) and the levelling pass (`level.ts`) are untouched.

- **API (`@repo/api`)** — the create/update activity DTOs, the activity response DTO, and the EV read
  path (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`) all carry `accrualType`
  (reuses `activity:update`; the EV read stays `cost:read`-gated). `AccrualType` / `ACCRUAL_TYPES`
  round-trip through `@repo/types`.
- **Types (`@repo/types`)** — `ActivitySummary` gains `accrualType: AccrualType`.
- **Conformance** — the EV adapter reads the fixture's `expenses.accrual_type` and collapses per-expense
  → one activity value (ADR-0044 §Q4); new first-principles goldens assert the phased PV to the minor
  unit for **E001** (£45,000 crane mobilisation, `START` — full PV at the start), **E002** (£68,000,
  `UNIFORM` — 50% at mid-window) and **E004** (£3,500 retention, `END` — nothing until the finish), plus
  a `UNIFORM`→`START` flip differential. The `accrual_start` / `accrual_uniform` / `accrual_end`
  capability tags flip ✅ (32 ✅ / 1 ⚪); ADR-0035 gains an **Accepted §32**.
- **Web (`@repo/web`)** — a **Cost accrual** select (Start / Uniform / End) in the activity form's
  "Cost & earned value" fieldset, behind the new **off-by-default** `VITE_COST_ACCRUAL` flag; wired
  through the create/update mutation and seeded from the row so a stored value round-trips when hidden.

Deferred (later ADR-0044 slices, not in this change): the period-trend cost **S-curve** chart series
(read-model + web), weighted **activity steps** (F2), and **resource loading curves** (F3).
