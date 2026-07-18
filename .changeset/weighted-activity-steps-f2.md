---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Weighted activity steps (M7 rung 5, ADR-0044 F2 / ADR-0035 §33). An activity gains a **weighted progress
step checklist** (`activity_steps` child table — `seq` / `name` / `weight` / `percentComplete`) whose
weight-weighted mean `Σ(w·p)/Σw` becomes the activity's **PHYSICAL** %-complete and **wins** over the
manual `physicalPercentComplete` when steps are present. Steps feed the ADR-0042 `PHYSICAL` Earned-Value
measure only — they **never change a CPM date**; with no steps the manual field stands exactly (the
byte-identical parity path, so the existing EV goldens stay green). The engine (`compute.ts`) and the
levelling pass (`level.ts`) are untouched; the pure resolver already in `earned-value.ts`
(`rollupPhysicalPercent`) is unchanged — this change only adds layers around it.

- **API (`@repo/api`)** — a steps sub-resource following the reference-template layering
  (controller → service → repository, deny-by-default, org-scoped): `GET …/activities/:activityId/steps`
  (list active, seq-ordered) and `PUT …/activities/:activityId/steps` (`{ version, steps: [...] }`
  bulk-replace, Q3) — retained rows updated in place, new ones appended, removed ones soft-deleted, the
  server assigns `seq`, and the parent **activity's** `version` is optimistic-locked (stale ⇒ 409). Reuses
  `activity:update` (a step is activity-write) — no new permission. **N28** (a step `percentComplete`
  outside 0–100 ⇒ 422 `STEP_PERCENT_OUT_OF_RANGE`) and a negative `weight` are DTO-boundary rejects,
  backstopped by DB CHECKs. The EV read (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`)
  loads each activity's active steps into the `PHYSICAL` rollup and reports a plan-level
  **`stepWeightZeroCount`** (N27 — all-zero-weight ⇒ manual fallback, never a divide-by-zero), mirroring
  `costWarningCount`. The soft-delete cascade is wired into `HierarchyLifecycleService` (steps sweep and
  restore with their activity under the same `delete_batch_id`, both directions).
- **Types (`@repo/types`)** — new `ActivityStep`, `ActivityStepInput`, `ReplaceActivityStepsRequest`;
  `PlanEarnedValue` gains `stepWeightZeroCount`.
- **Conformance** — the EV adapter reads the fixture's `steps` and attaches them to A4200 / A7100; new
  goldens assert the weighted-mean rollup **A4200 → 35.0005%** (the fixture's own
  `prog_rd_vs_pct_divergence` — steps-physical ≠ its 40% duration-%) and **A7100 → 0%**, a
  steps-present-vs-manual differential (`resultsDiffer`), and the N27 fallback + count. **N28** is
  DTO-tested. The `code_steps` capability tag flips ✅ (33 ✅ / 1 ⚪ — only resource curves remain);
  ADR-0035 gains an **Accepted §33** + N27/N28.
- **Web (`@repo/web`)** — an `ActivityStepsEditor` (editable name / weight / %-complete rows with
  add/remove/reorder) opened from the activities table row menu behind the new **off-by-default**
  `VITE_ACTIVITY_STEPS` flag, showing the rolled-up physical % and a "steps override the manual %" note,
  wired to the bulk-PUT mutation (TanStack Query).

Deferred (the last ADR-0044 slice, not in this change): **resource loading curves** (F3), the one
remaining ⚪ capability row.
