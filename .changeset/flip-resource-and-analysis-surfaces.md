---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Turn on the remaining eight off-by-default web surfaces (Resources, Duration types, Resource
levelling, Earned Value, Cost accrual, Activity steps, Resource curves, Inter-project external dates)
by flipping their `VITE_*` flags from default-off to default-on — after clearing every documented
pre-flip blocker. The engine/API behind each surface was already live; this exposes it in the UI by
default.

Pre-flip remediation (TECH_DEBT #38/#39/#40/#41/#44):

- **API (`@repo/api`)** — **Pen-gate resource-assignment writes** (#39): assign / edit / unassign now
  call `PlanEditLockService.assertHoldsPen` like the activity write path (a units/rate edit persists the
  owning activity's derived duration, a scheduling mutation), returning **423** to a non-holder when
  `PLAN_EDIT_LOCK_ENFORCED` is on; 423 e2e added. **Money overflow guards** (#40a): every integer
  minor-unit money field (`budgetedExpense`/`actualExpense`/`budgetedCost`/`actualCost`) gains
  `@Max(MONEY_MINOR_UNITS_MAX)` and every `Decimal(18,4)` field
  (`costPerUnit`/`maxUnitsPerHour`/`budgetedUnits`/`unitsPerHour`/`actualUnits`) `@Max(DECIMAL_18_4_MAX)`,
  so an over-range value is a clean **422** rather than a precision-loss / column-overflow 500; boundary
  specs added. **Engine-owned `external_driven`** (#41): a new per-activity boolean column mirroring
  `constraint_violated` (metadata-only migration), written by the recalc batched `unnest` UPDATE and
  aggregated in the read-summary so `externalDrivenCount` is truthful on a plain summary read.
- **Types (`@repo/types`)** — `ActivitySummary` gains `externalDriven: boolean`; new
  `MONEY_MINOR_UNITS_MAX` / `DECIMAL_18_4_MAX` bounds.
- **Web (`@repo/web`)** — **Row-actions `Menu`** (#38): the activities table's per-row actions move from
  a spread of ghost buttons to a single overflow `⋯` trigger opening the APG `Menu`
  (Logic/Progress/Resources/Steps/Edit/Delete, role-gated) — meeting the "dense row actions use a Menu,
  never hover-only" standard. **External badge** (#41): an "External" row badge in the Name cell mirrors
  the "Conflict" badge, driven by the engine's per-activity `externalDriven`. **Context gating** (#44):
  the Steps row action is coupled to Earned Value (its only consumer), and the resource loading-curve
  picker is hidden for zero-span milestones. Then all eight `flagDefaultOff` flags become `flagDefaultOn`.

Parity: `compute.ts` and `level.ts` are untouched; `external_driven` is engine-owned output written on
every recalc (false when not external-driven), so absent-data byte-parity holds and existing engine / EV
goldens do not move. Not addressed here (documented follow-ups): #40b Contributor cost-progress wiring,
#42 shared `SelectField`, #43 histogram bucket in URL.
