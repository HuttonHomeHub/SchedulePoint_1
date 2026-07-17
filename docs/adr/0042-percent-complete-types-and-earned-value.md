# ADR-0042: Percent-complete types & Earned Value — the cost/EV read-model

- **Status:** Proposed
- **Date:** 2026-07-17
- **Deciders:** James Ewbank (with Claude Code)

> **Proposed — governs milestone M7 (the resource dimension), the cost/**Earned-Value** rung** (the
> `pct_physical` / `pct_units` / `cost_*` capability rows). It **activates** the cost columns that
> [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) reserved **"for the cost rung"**,
> consumes the [ADR-0040](0040-duration-types-and-resource-units.md) units backbone (`budgeted_units` +
> the driving rate) as the quantity EV cost rides on, **amends** [ADR-0025](0025-baselines-snapshot-and-variance.md)
> to snapshot a **cost baseline** (the committed PV/BCWS curve), and reads the
> [ADR-0023](0023-cpm-scheduling-date-convention.md)/[ADR-0033](0033-scheduling-modes-and-data-date.md)
> **data date** as the EV status date. The two load-bearing decisions are: **(1)** the per-activity
> **`percentCompleteType`** (Duration / Units / Physical) that separates **schedule %-complete** (drives
> the CPM remaining work — already present) from **performance / physical %-complete** (earns value,
> **changes no date**); and **(2)** that **Earned Value is a pure read-model / rollup analysis** — a
> sibling of the float-paths and baseline-variance reads, computed live on a **read endpoint**, **not** an
> additive pass inside `computeSchedule` and **not** a set of engine-owned persisted columns. The
> CPM/recalculate write path is untouched, so the [ADR-0034](0034-engine-conformance-methodology.md)
> golden suite is a **structurally trivial** parity gate. The EV **semantics** (which %-type feeds EV, the
> milestone 0/100 rule, LOE/WBS/resource-dependent behaviour, BAC/PV/EV/AC definitions, the default EAC,
> the divide-by-zero guards, and negative cases N22–N24) are documented as a new
> [ADR-0035](0035-schedulepoint-cpm-semantics.md) **§29**, Accepted with this rung's conformance slice
> (EV3). Full spec + plan: [`docs/specs/percent-complete-earned-value/`](../specs/percent-complete-earned-value/).

## Context

Since M7 landed, a planner can build, calendar, resource, level, and progress a schedule, and compare it
to a committed [ADR-0025](0025-baselines-snapshot-and-variance.md) baseline for **dates**. What is still
missing is the **cost dimension** and the **Earned Value** analysis that ties budget, schedule, and
physical progress together — the headline commercial-controls answer to "are we ahead/behind and
over/under budget against the committed plan?" (the P6 metric set: BAC, PV/BCWS, EV/BCWP, AC/ACWP → SV,
CV, SPI, CPI → EAC, ETC, TCPI, VAC). [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md)
deliberately **reserved** cost / earned-value columns "for their later rungs"; the conformance fixture's
`pct_physical` / `pct_units` / `cost_*` tags sit unrunnable.

Two sub-problems sit inside this:

1. **`percentComplete` is overloaded.** Today it is a single schedule figure driving the CPM remaining
   duration. P6 distinguishes three **%-complete types** — **Duration** (elapsed vs total), **Units**
   (actual vs budgeted work), **Physical** (a hand-entered assessment) — and lets each activity choose
   which represents its progress **for value-earned purposes**. Physical %-complete in particular is a
   **performance measure that must not move the schedule** (a wall can be "60% built" while its remaining
   duration is independently forecast).
2. **There is no cost data and no EV maths.** Budget-at-completion, the planned-value S-curve, earned
   value, actual cost, the derived indices (SPI/CPI), and the forecasts (EAC/ETC/TCPI/VAC) do not exist.

Every prerequisite now exists: the units backbone (ADR-0039/0040), the committed-plan snapshot (ADR-0025),
the data/status date (ADR-0023/0033), the working-instant axis for time-phasing (ADR-0037), and the WBS
tree for rollup ([ADR-0038](0038-wbs-activity-hierarchy.md)).

## Decision

### 1. `percentCompleteType` splits schedule %-complete from performance %-complete

Each activity carries a `percentCompleteType` (`DURATION` **default** / `UNITS` / `PHYSICAL`). It selects
**only** which measure feeds the EV **performance %** — it **never changes a CPM date**. The existing
schedule `percentComplete` and remaining-duration (M2) continue to own the dates unchanged. `DURATION`
default = behaviour-preserving (today's `percentComplete` is duration-based). `PHYSICAL` reads a new
per-activity manual `physicalPercentComplete` (0–100); `UNITS` reads `actualUnits / budgetedUnits`.

### 2. Earned Value is a pure read-model, not a write pass

Unlike resource levelling ([ADR-0041](0041-resource-levelling.md), an additive engine **write** pass with
engine-owned columns), Earned Value **schedules nothing**. It is computed as a **pure rollup analysis**
(`earned-value.ts`, a sibling of `float-paths.ts` and the baseline-variance read) invoked by a **new read
endpoint** `GET …/schedule/earned-value`. It never enters `computeSchedule`, adds no write pass, and
persists **no engine-owned columns**. Consequence: the CPM parity gate is trivially satisfied (the recalc
write path is not touched), and EV recomputes live from cost + %-complete inputs as of the data date,
rolled up over the ADR-0038 `parentId` WBS tree (deepest-first, the M5-epic pattern), with divide-by-zero
guards at every derived index.

### 3. Cost source = both (assignment-derived **and** activity-level expense)

BAC = Σ (assignment budgeted cost) + an optional activity-level **budgeted expense** (lump-sum / non-
resourced work); AC = Σ (assignment actual cost) + activity actual expense. Assignment budgeted cost
**derives** `budgetedUnits × resource.costPerUnit` when its `budgetedCost` override is null (the ADR-0040
rate-on-the-assignment precedent); a non-null override pins an explicit price (e.g. a quoted sub-contract).
This activates the ADR-0039-reserved `resource.costPerUnit` (a **cost-per-unit** rate — P6 "Price/Unit" —
so it multiplies the units backbone directly).

### 4. Planned Value = the active baseline (amends ADR-0025)

PV/BCWS is measured against the **active** baseline, extended to snapshot a per-activity **`budgetedCost`**
(the committed cost baseline / S-curve). When no baseline is active, PV falls back to the **live**
time-phased budget and the read flags `costBaselineMissing` (never an error). This is an additive
amendment to the ADR-0025 snapshot; a baseline captured before this rung reads a null cost baseline.

### 5. Default EAC = `BAC / CPI`

The plan carries an `eacMethod` (`CPI` **default** = `BAC / CPI`, P6's headline "typical" forecast;
`REMAINING_AT_BUDGET` = `AC + (BAC − EV)`; `CPI_TIMES_SPI` = `AC + (BAC − EV)/(CPI × SPI)`). A read-endpoint
query param may override per request. When CPI is undefined/zero the CPI-based EAC guards to
`AC + (BAC − EV)` rather than dividing by zero.

### 6. Physical %-complete = a single manual field

`physicalPercentComplete` is one manual value per activity (0–100), used only when `percentCompleteType =
PHYSICAL`. Weighted activity steps (P6 `code_steps`) are a named **later rung**, out of scope.

### 7. Money = `BIGINT` minor units + a per-plan currency; rates = `Decimal(18,4)`

Stored money amounts (`budgetedCost`, `actualCost`, the expenses, the baseline cost) are `BIGINT` minor
units in the plan's `currencyCode` (ISO-4217, `CHAR(3)`) — the `docs/DATABASE.md` money rule; `BIGINT`
because construction BACs exceed the `INT` minor-unit ceiling; integer (not `Decimal`) so rounding is
explicit and happens once, per derived index (§29). **Rate coefficients** (`resource.costPerUnit`,
alongside the existing `units_per_hour` / `max_units_per_hour`) are `Decimal(18,4)` — the house rule is
"rate coefficients are `Decimal(18,4)`; stored money amounts are `BIGINT` minor units" — so a composite
rate (e.g. £52.3750/unit) stays exact rather than rounding to a whole minor unit before the multiply.

### Sliced delivery (like ADR-0039/0040/0041)

**EV1** cost + %-complete-type schema + the ADR-0025 cost-baseline amendment (dark, additive) → **EV2**
the pure EV module + read endpoint + WBS rollup → **EV3** conformance (flip the `pct_*` / `cost_*` matrix
rows, Accept ADR-0035 §29 with first-principles goldens + a differential) → **EV4** the flagged web
surface (`VITE_EARNED_VALUE`, deferred). Resource curves/histograms, cost **accrual / period trending**
(the stored S-curve over time), and **activity steps** are named later rungs, out of scope.

## Consequences

**Positive.** SchedulePoint gains Earned Value Management as a read-only analysis over the live schedule +
cost data; the CPM engine and its golden suite are **untouched** (EV never enters `computeSchedule`); the
model is strictly additive and byte-parity-preserving (an unset EV field changes nothing); it reuses the
existing units backbone, baselines, data date, instant axis, and WBS rollup rather than inventing new
machinery.

**Negative / costs.** A new read endpoint + module to build and keep correct; a new money representation
that touches every EV DTO (mitigated by the single `BIGINT`-minor-units rule + one rounding point per
index); cost is org-sensitive data, so the External-Guest read scope needs an explicit security decision
(EV2); no external EV oracle, so goldens must be hand-worked first-principles and documented in §29;
`percentComplete` remains the schedule figure while `percentCompleteType`/physical-% is the value figure —
a conceptual distinction the UI (EV4) must make legible.

**Neutral.** The `eacMethod` and `currencyCode` are plan-level options with behaviour-preserving defaults;
`costBaselineMissing` degrades gracefully to the live budget; N24 (actuals on a not-started activity) is a
**warn**, not a reject, surfaced by the read.

## Alternatives considered

- **Earned Value as an engine write pass** (like levelling) with persisted EV columns. **Rejected:** EV
  schedules nothing, so a write pass would add a parity-gate surface and stale-persistence risk for no
  benefit; a live read-model is simpler and always current as of the data date.
- **Physical %-complete drives the schedule** (reusing `percentComplete`). **Rejected:** conflates a value
  measure with a duration forecast — the exact overload this rung fixes.
- **Cost from assignments only, or activity-level only.** **Rejected:** both are needed — resourced work
  costs via units × rate, lump-sum / non-resourced work needs a direct expense.
- **PV from the live budget only** (no cost baseline). **Rejected:** PV must reference the **committed**
  plan; the live budget drifts as the plan is edited. (Kept as the flagged fallback when no baseline
  exists.)
- **Money as `Decimal`.** **Rejected** for stored amounts by the `docs/DATABASE.md` money rule (integer
  minor units, explicit rounding); kept only for rate **coefficients**.
- **Weighted activity steps for physical %.** **Deferred:** a whole child-table sub-model; a single manual
  field covers the common construction-reporting case now.
