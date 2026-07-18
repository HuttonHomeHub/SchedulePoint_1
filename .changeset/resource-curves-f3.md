---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Resource loading curves (M7 rung 5, ADR-0044 F3 / ADR-0035 §31) — **the final capability-matrix slice**.
Each resource assignment gains a settable `curveType` (`UNIFORM` (default) / `BELL` / `FRONT_LOADED` /
`BACK_LOADED` / `DOUBLE_PEAK`) — a named P6 loading curve — plus a new pure read-model
(`resource-histogram.ts`) that distributes each assignment's `budgetedUnits` across its effective span
(`start + assignment-lag → finish`, on the activity's own calendar, ADR-0037) per the named 21-point
profile and aggregates a **units-over-time histogram per resource**, **conserving units** exactly
(`Σ buckets === Σ budgetedUnits`). It moves **no CPM date**, owns **no engine column**, and does **NOT**
feed the levelling pass this rung (Q2). `UNIFORM`/absent is a **flat** load — byte-identical to a
flat-rate distribution — so the parity gate is trivial. `compute.ts` and `level.ts` are untouched.

- **API (`@repo/api`)** — the create/update assignment DTOs, the assignment response DTO, and the
  assignment repository/service all carry `curveType` (reuses the existing `resource:assign` permission;
  a plain enum, not cost-gated). New `GET …/schedule/resource-histogram` endpoint (`schedule:read` — the
  units histogram is **schedule data, not cost**, Q5) with a `granularity` param (`DAY`/`WEEK`/`MONTH`)
  and offset paging over the per-resource series; the `meta` carries the shared bucket axis, series total,
  and `curveNormalisedCount` (N29). The new pure `computeResourceHistogram` read-model is a dependency-free
  sibling of `float-paths.ts` / `earned-value.ts`.
- **Types (`@repo/types`)** — `ResourceCurveType` / `RESOURCE_CURVE_TYPES`, the histogram response types
  (`ResourceHistogram*`, `HistogramGranularity`), and `curveType` on `ResourceAssignmentSummary`.
- **Conformance** — a new `resource-histogram-adapter.ts` reads the fixture's `resource_curves` +
  `assignments.curve`; the built-in profile constants are asserted **byte-equal to the fixture's
  profiles** (self-baselined, no external oracle, ADR-0034). Goldens prove **AS0026** (FRONT_LOADED,
  2400 u), **AS0042** (BACK_LOADED, 640 u), **AS0015** (BELL, 1200 u) and **AS0043** (DOUBLE_PEAK, 560 u)
  distribute to the exact profile shape and sum to `budgetedUnits`, plus a UNIFORM-vs-FRONT_LOADED
  differential (`resultsDiffer`), the assignment-lag case (**AS0027**), and **N29** (a profile not summing
  to 100 ⇒ normalise to the budget, units conserved, counted). The `res_curve_bell` /
  `res_curve_front_loaded` / `res_curve_back_loaded` / `res_curve_double_peak` capability tags flip ✅ —
  **closing the matrix (34 ✅ / 0 ⚪)**; ADR-0035 gains an **Accepted §31** + N29.
- **Web (`@repo/web`)** — a **loading-curve picker** (Uniform / Bell / Front-loaded / Back-loaded /
  Double-peak) on the resource-assignment dialog and a **Resource histogram** read view (a bar chart with
  a keyboard-navigable data-table equivalent for WCAG 2.2 AA), behind the new **off-by-default**
  `VITE_RESOURCE_CURVES` flag; the picker round-trips through the assignment create/update mutation.
