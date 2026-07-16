# Implementation Plan: M2 — Progress ingestion, data-date floor & retained logic

- **Feature spec:** `docs/specs/engine-conformance-framework/M2-progress-retained-logic-feature-spec.md`
- **Status:** Draft (awaiting approval)
- **Owner:** TBD

## Breakdown

```mermaid
flowchart LR
  E[Epic: Engine Conformance & Validation Framework] --> M2[Milestone M2: Progress + retained logic]
  M2 --> F1[Feature: Storage — progress + mode columns]
  M2 --> F2[Feature: Engine — progress ingestion + data-date floor + retained logic]
  M2 --> F3[Feature: Recalc modes — override + actual-dates]
  M2 --> F4[Feature: Progress boundary validation + plan mode API]
  M2 --> F5[Feature: Schedule service wiring]
  M2 --> F6[Feature: Suspend/resume (droppable, last)]
  M2 --> F7[Feature: Conformance flip + capability matrix + semantics acceptance]
  M2 --> F8[Feature: FE progress fields + recalc-mode select (droppable, flagged)]
  F1 --> T1[T1 migration: remaining/suspend/resume + progress_recalc_mode]
  F2 --> T2[T2 engine: classify + freeze actuals + remaining floor + retained] --> T2b[T2b engine unit tests]
  F3 --> T3[T3 engine: override + actual-dates modes]
  F4 --> T4[T4 progress DTO + N07/N08/N18 boundary] --> T5[T5 plan recalc-mode DTO/service]
  F5 --> T6[T6 service: load progress + resolve remaining + mode]
  F6 --> T7[T7 suspend/resume engine + wiring]
  F7 --> T8[T8 adapter flip: feed progress + mode + data date] --> T9[T9 scenarios + matrix + ADR-0035 acceptance + docs]
  F8 --> T10[T10 web progress fields + recalc-mode select]
```

### Epic

**Engine Conformance & Validation Framework** (ADR-0034) — prove and close the gap between
SchedulePoint's CPM/PDM engine and a P6-class fixture, one capability rung at a time.

### Milestone: M2 — Progress ingestion, data-date floor & retained logic (shippable slice)

**Outcome:** the CPM engine **consumes progress** — completed activities are frozen on their actual
dates, in-progress remaining work is floored at the data date, out-of-sequence progress is handled by a
**chosen recalc mode** (Retained Logic default / Progress Override / Actual Dates), and suspend/resume
reschedules remaining work from `max(data date, resume date)`; the progress boundary rejects/repairs
invalid actuals (N06/N07/N08/N18); the all-unprogressed default path is byte-identical; the conformance
harness runs S02/S03/S04 as differentials and asserts the negative cases, moving the owning matrix rows
to ✅. **ADR-0035 §1–§6 Accept with this milestone.**

**Complexity:** L (the engine progress branch + the three modes dominate; no axis rework — M5/ADR-0037
built it) · **Dependencies:** M1 + M5 (landed) · **Flag:** the engine behaviour ships behind the
unchanged recalculate endpoint with the golden suite as the gate (like M1/M5); the settable fields are
additive; FE behind `VITE_PROGRESS_INGESTION`.

> **Note — no new ADR.** ADR-0035 §1–§6 already governs; M2 implements and **Accepts** those clauses.
> The three genuinely-new design surfaces (remaining-duration column, recalc-mode storage,
> suspend/resume scope) are the milestone's **critical questions** and are resolved before F1 merges;
> the resolutions are recorded in `docs/DECISIONS.md`, not a new ADR.

---

#### Feature: Storage — progress & recalc-mode columns

> **Description:** additive nullable columns the engine + boundary need: independent remaining duration
> (Q1), suspend/resume dates (Q3), and the plan-level recalc mode (Q2). No data migration.
> **Complexity:** S–M
> **Dependencies:** Q1/Q2/Q3 answered (critical questions).
> **Risks:** enum churn if Q2 lands as a request param instead → _mitigation:_ resolve Q2 before T1.
> **Testing requirements:** migration up/down on a seeded DB; check constraints reject bad values;
> Prisma-level round-trip.

##### Task 1 — Migration: remaining/suspend/resume + `progress_recalc_mode` (≈ one PR)

- **Description:** add `activities.remaining_duration_minutes Int?` (+ `>= 0` check), `suspend_date` /
  `resume_date DATE?` (+ resume≥suspend check), `plans.progress_recalc_mode ProgressRecalcMode
@default(RETAINED_LOGIC)` (new enum). Update the `Activity`/`Plan` model doc-comments (drop
  "progress ignored by the engine").
- **Complexity:** S–M
- **Dependencies:** critical questions Q1–Q3.
- **Risks:** the check constraints interacting with the derive-null path → _mitigation:_ null is always
  legal (derive); the check only bounds a supplied value. database-architect review.
- **Testing:** migration applies cleanly; check constraints reject negative remaining / resume<suspend;
  `verify-template.sh`/schema checks pass.
- **Development steps:**
  1. `schema.prisma`: add the three columns + the `ProgressRecalcMode` enum; refresh comments.
  2. Migration: `ADD COLUMN` (nullable) + raw-SQL check constraints; add the enum type.
  3. database-architect review; update `docs/DATABASE.md`; changeset.

---

#### Feature: Engine — progress ingestion + data-date floor + retained logic (the core)

> **Description:** teach the pure engine to classify each node (complete / stopped / in-progress /
> not-started) and schedule progress on the **existing absolute-instant axis** (ADR-0037): freeze
> actuals (§6), floor remaining work at the data date (§2), keep incomplete-predecessor logic under
> Retained Logic (§1 default), confirm the N13 lead-truncation. No axis rework.
> **Complexity:** L
> **Dependencies:** none (engine is input-driven) — but ships with T2b as the gate.
> **Risks:** (a) any default-path drift from the goldens; (b) forward/backward asymmetry on the frozen
> portion → spurious float; (c) mis-classifying the stopped §5 case → null finish. _Mitigations:_ the
> all-NOT_STARTED golden suite as the parity gate (byte-identical), one shared classification helper
> used by both passes + driving + visual, explicit §5 + freeze-symmetry tests.
> **Testing requirements:** see T2b.

##### Task 2 — Engine: classify + freeze actuals + remaining floor + retained logic (≈ one PR)

- **Description:** add progress inputs to `EngineActivity` (`actualStart?`, `actualFinish?`,
  `remainingMinutes?`, `resumeDate?`) and `progressMode` to `ComputeOptions` (default
  `RETAINED_LOGIC`); implement the classification branch in the forward + backward passes and the
  stopped-activity §5 rule; ensure remaining work floors at `max(dataDateAbs, resumeInstant)`; confirm
  N13 (lead truncated by the existing `dataDateAbs` floor). Retained Logic (default) keeps
  incomplete-predecessor bounds.
- **Complexity:** L (split into reviewable commits: types + classification helper first with
  all-NOT_STARTED parity, then freeze + remaining floor + retained).
- **Dependencies:** —.
- **Risks:** the frozen-actual portion made non-inverse across a non-working gap → wrong float →
  _mitigation:_ reuse the M5 instant/anchor helpers; test freeze symmetry; project-finish still driven
  by the latest inclusive finish instant.
- **Testing:** covered by T2b; keep `compute.spec.ts` + `goldens.spec.ts` green throughout.
- **Development steps:**
  1. `engine/types.ts`: add the progress fields to `EngineActivity`; document (undefined = not started).
  2. `engine/compute.ts`: add `classify(activity, dataDateAbs)`; branch the forward pass (freeze
     complete/stopped; in-progress remaining floor; not-started unchanged); mirror in the backward pass;
     add `progressMode` to `ComputeOptions` (retained path only in T2).
  3. Route driving + effective-Visual + display through the same classification (a frozen bar renders on
     its actuals; visual drift baseline stays the pure early start).
  4. Update engine doc-comments (types header, compute header) to describe progress ingestion.

##### Task 2b — Engine unit tests + perf re-verify

- **Description:** prove the behaviour + parity/perf.
- **Complexity:** M
- **Dependencies:** T2.
- **Risks:** under-testing the stopped §5 / freeze-symmetry / N13 clamp → _mitigation:_ explicit cases.
- **Testing:** new `compute.progress.spec.ts`: (a) completed activity frozen on actuals, unchanged
  across two recalcs; (b) in-progress remaining floored at the data date (never earlier); (c) stopped
  §5 → finish = data date, propagates (non-null); (d) N13 lead truncated to the data date; (e)
  freeze/backward symmetry (no spurious float on the completed portion); (f) all-NOT_STARTED reproduces
  today's dates. Re-run `goldens.spec.ts` for byte-parity; perf assert (< 2 s @ 2 000 progressed).
- **Development steps:**
  1. Add the spec with the six cases + the perf case.
  2. Confirm the golden suite is byte-identical on the all-NOT_STARTED path.

---

#### Feature: Recalc modes — Progress Override + Actual Dates

> **Description:** the two selectable out-of-sequence modes on top of the retained default; the S03/S04
> discriminators.
> **Complexity:** M
> **Dependencies:** T2 (classification + `progressMode` seam).
> **Risks:** the three modes accidentally coinciding on the discriminator (option not wired) →
> _mitigation:_ a direct engine test asserting A4220→A4300-style out-of-sequence dates differ across
> the three; the conformance differential (T8) as the second net.
> **Testing requirements:** engine test — an out-of-sequence pair yields three distinct successor
> date-sets (retained ≠ override ≠ actual-dates); all-NOT_STARTED ⇒ all three coincide.

##### Task 3 — Engine: override + actual-dates arithmetic (≈ one PR)

- **Description:** under **Progress Override**, drop the incoming bound from **incomplete** predecessors
  for an in-progress activity's remaining start (run from the data date); implement **Actual Dates** per
  the ADR-0035 §1 documented treatment; keep the golden contract as the authority for exact per-mode
  arithmetic.
- **Complexity:** M
- **Dependencies:** T2.
- **Risks:** override incorrectly ignoring **complete** predecessors' actual finish → _mitigation:_
  override only relaxes **incomplete**-predecessor logic; complete predecessors always bound via actuals.
- **Testing:** `compute.progress.spec.ts` mode cases (retained/override/actual-dates differ; coincide
  when unprogressed).
- **Development steps:**
  1. `engine/compute.ts`: implement the two modes in the in-progress remaining-start computation.
  2. Add the three-mode discriminator tests.

---

#### Feature: Progress boundary validation + plan recalc-mode API

> **Description:** the write surface — data-date-aware N07/N08/N18 on the progress path, the new
> progress DTO fields, and the plan recalc-mode setting.
> **Complexity:** M
> **Dependencies:** T1 (columns).
> **Risks:** the progress path not knowing the data date → _mitigation:_ load `plan.plannedStart` in
> `updateProgress` (already has the activity/plan scope); N06 stays as-is.
> **Testing requirements:** progress-service tests (N06 reject, N07 reject, N08 repair+warn, N18
> repair+warn, remaining/suspend/resume round-trip); plan-service test (mode persists, defaults
> RETAINED_LOGIC); DTO tests.

##### Task 4 — Progress DTO + N07/N08/N18 boundary (≈ one PR)

- **Description:** extend `UpdateActivityProgressDto` with `remainingDurationDays?`, `suspendDate?`,
  `resumeDate?` (nullable, validated); in `ActivitiesService.updateProgress` load the plan data date and
  add: **N07** reject (actual/suspend/resume in the future beyond the data date), **N08** repair
  (complete without actual finish → finish = data date, warning), **N18** repair (remaining > 0 on
  complete → 0, warning); return repairs via `meta.warnings`. Extend the response + `ActivitySummary`.
- **Complexity:** M
- **Dependencies:** T1.
- **Risks:** repair warnings lost in the envelope → _mitigation:_ standard `{ data, meta: { warnings } }`;
  api-reviewer pass. Suspend-without-start / resume-without-suspend invariants added.
- **Testing:** `activities.service.spec.ts` — N06/N07 reject; N08/N18 repair + warning; remaining/
  suspend/resume persist + read back; status still derived; pen + optimistic lock hold with new fields.
- **Development steps:**
  1. `dto/update-activity-progress.dto.ts`: add the three fields (nullable, class-validator).
  2. `activities.service.ts`: load the data date; add N07/N08/N18; thread new fields into the patch.
  3. `activity-response.dto.ts` + `@repo/types` `ActivitySummary`: expose the new fields.
  4. api-reviewer + security-reviewer pass; update `docs/API.md`; changeset (minor).

##### Task 5 — Plan recalc-mode DTO + service

- **Description:** add `progressRecalcMode?` to plan create/update DTOs + `PlanResponseDto` +
  `PlanSummary`; persist it (pen-gated, optimistic-locked) like any plan definition field.
- **Complexity:** S
- **Dependencies:** T1.
- **Risks:** drift between the DTO enum and the Prisma enum → _mitigation:_ shared `ProgressRecalcMode`
  union in `@repo/types` mirrored to Prisma (like `SchedulingMode`); type test.
- **Testing:** `plans.service.spec.ts` — mode persists, defaults RETAINED_LOGIC, round-trips.
- **Development steps:**
  1. `@repo/types`: add the `ProgressRecalcMode` union + `PlanSummary.progressRecalcMode`.
  2. Plan DTOs + `PlanResponseDto.from()`: expose/accept it.
  3. api-reviewer pass; update `docs/API.md`; changeset (minor).

---

#### Feature: Schedule service wiring

> **Description:** resolve each activity's remaining minutes + actuals + the plan mode and thread them to
> the engine; keep the engine calendar/persistence-agnostic.
> **Complexity:** M
> **Dependencies:** T2/T3 (engine consumes), T1 (columns), T5 (mode column).
> **Risks:** forgetting to select the progress columns → engine silently unprogressed → _mitigation:_
> service spec asserts a progressed activity changes dates; add `progressedActivityCount` to the log.
> **Testing requirements:** `schedule.service.spec.ts` — recalc freezes a completed activity, floors an
> in-progress remaining, honours the plan mode; all-NOT_STARTED unchanged; remaining resolution
> (col ?? derive).

##### Task 6 — Service: load progress + resolve remaining + mode (≈ one PR)

- **Description:** select the progress columns in `loadActivities`/`ScheduleActivityRow`; in
  `ScheduleService.recalculate` resolve `remainingMinutes = remainingDurationMinutes ?? round(duration ×
(1 − pct/100))`, map `actualStart`/`actualFinish`/`resumeDate` days → activity-calendar instants, read
  `plan.progressRecalcMode` into `ComputeOptions.progressMode`, and pass plain values via
  `toEngineActivity`; extend the recalc log.
- **Complexity:** M
- **Dependencies:** T2, T3, T5.
- **Risks:** day→instant mapping off-by-one on a finish → _mitigation:_ reuse the M5 inclusive-date
  helpers; test a completed activity's dates equal its input actuals exactly.
- **Testing:** `schedule.service.spec.ts` (completed frozen; in-progress floored; mode honoured;
  all-NOT_STARTED byte-identical; remaining derive vs explicit).
- **Development steps:**
  1. `schedule.repository.ts`: select the progress columns; extend `ScheduleActivityRow`.
  2. `schedule.service.ts`: resolve remaining + actuals + mode; extend `toEngineActivity`; add
     `progressMode`/`progressedActivityCount` to the log.
  3. security-reviewer + backend-performance-reviewer pass; one API e2e (progress → recalc → frozen
     dates); changeset (minor).

---

#### Feature: Suspend / resume (droppable, last — ADR-0035 §4)

> **Description:** the excluded-window remaining-work floor at `max(data date, resume date)`; the least
> common, most involved progress feature. Sequenced last so M2 can ship without it if deferred.
> **Complexity:** M
> **Dependencies:** T1 (columns), T2 (classification), T4 (DTO), T6 (wiring).
> **Risks:** the suspended window double-counted in the actual duration → _mitigation:_ the engine only
> advances `remainingMinutes` (which already excludes suspended time); the resume date only raises the
> floor.
> **Testing requirements:** engine + service test — a resume after the data date floors remaining at the
> resume date; the suspended window excluded; no suspend/resume ⇒ US-2 behaviour.

##### Task 7 — Suspend/resume engine + wiring

- **Description:** honour `resumeDate` in the remaining-work floor (`max(dataDateAbs, resumeInstant)`);
  ensure the boundary invariants (T4) already gate suspend<resume, in-the-future, and require an actual
  start; wire `resumeDate` through the service.
- **Complexity:** M
- **Dependencies:** T1, T2, T4, T6.
- **Risks:** interaction with Progress Override (does override ignore the resume floor?) → _mitigation:_
  the data-date/resume floor is a **hard** floor in all modes (ADR-0035 §2/§4); test override + resume.
- **Testing:** `compute.progress.spec.ts` suspend/resume cases + `schedule.service.spec.ts` round-trip.
- **Development steps:**
  1. `engine/compute.ts`: fold `resumeInstant` into the remaining-start `max`.
  2. `schedule.service.ts`: map `resumeDate` → instant; pass through.
  3. test + review; changeset.

---

#### Feature: Conformance flip + capability matrix + ADR-0035 acceptance (prove it)

> **Description:** feed the fixture's progress + each scenario's mode + the progressed data date; run
> S02/S03/S04 as differentials; assert the negatives; move the matrix rows; Accept ADR-0035 §1–§6.
> **Complexity:** M
> **Dependencies:** T2/T3 (engine), T7 (if suspend/resume in scope).
> **Risks:** over-claiming (e.g. expected-finish S12 is M4) → _mitigation:_ keep S12/M4-M6 rows ❌; only
> flip the progress rows + S02/S03/S04 + N06/N07/N08/N13/N18.
> **Testing requirements:** adapter spec (progress fed; no `progress-ignored` note); scenarios spec
> (S02/S03/S04 runnable + pairwise differ + differ from S01); negative-case assertions; a
> first-principles progressed golden.

##### Task 8 — Adapter flip: feed progress + mode + data date

- **Description:** in `conformance/adapter.ts`, stop dropping progress: map each fixture activity's
  `actualStart`/`actualFinish`/`percent`/`remaining_duration_h` + suspend/resume; add
  `progressMode`/`dataDate` to `AdaptOptions`; use the fixture's **progressed data date** for
  S02/S03/S04 (S01 keeps project-start + stripped actuals); update `approximations` (remove the
  progress-ignored line).
- **Complexity:** M
- **Dependencies:** T2, T3.
- **Risks:** fixture progress-field variants unmapped → _mitigation:_ an exhaustive normaliser + a test
  over the fixture's real progressed activities.
- **Testing:** `adapter.spec.ts` — a progressed activity carries actuals/remaining; no `progress-ignored`
  note; the data date is the progressed one for S02/S03/S04.
- **Development steps:**
  1. `conformance/adapter.ts`: feed progress + mode + data date; refresh `approximations`.
  2. Add a first-principles progressed golden (completed frozen; in-progress remaining floored).

##### Task 9 — Scenarios, matrix, negatives & ADR-0035 acceptance

- **Description:** flip S02/S03/S04 runnable; assert the pairwise + S01 differentials and the negative
  cases; move the capability-matrix rows; record ADR-0035 §1–§6 as Accepted with M2.
- **Complexity:** S
- **Dependencies:** T8.
- **Risks:** matrix drift from behaviour → _mitigation:_ update in the same PR (matrix rule).
- **Testing:** `scenarios.spec.ts` — S02/S03/S04 run; `resultsDiffer(S02, S03)`,
  `resultsDiffer(S03, S04)`, `resultsDiffer(S02, S01)` true; negative-case harness asserts
  N06/N07/N08/N13/N18.
- **Development steps:**
  1. `conformance/scenarios.ts`: set S02/S03/S04 `runnable = true` with mode wiring.
  2. `CAPABILITY_MATRIX.md`: Progress row ❌ → ✅; S02/S03/S04 runnable; N06/N07/N08/N13/N18 flips;
     update the summary counts. Keep S12/M4–M6 rows ❌.
  3. `docs/adr/0035-schedulepoint-cpm-semantics.md`: mark §1–§6 **Accepted** (status/date note — never
     edit another decision's body); `CLAUDE.md` §16 + `docs/DECISIONS.md` (the three Q resolutions).
  4. changeset (docs/tests only for this PR).

---

#### Feature: FE progress fields + recalc-mode select (droppable — behind `VITE_PROGRESS_INGESTION`)

> **Description:** optional remaining/suspend/resume fields on the progress dialog + a plan recalc-mode
> select + a repair-warning surface.
> **Complexity:** S
> **Dependencies:** T4 (progress fields), T5 (mode), T6 (persistence).
> **Risks:** one-off styling drift → _mitigation:_ reuse the existing progress dialog + shadcn/ui
> `Select`.
> **Testing requirements:** component tests (fields render, submit; mode select persists; warnings shown);
> **accessibility-reviewer** (WCAG 2.2 AA), **ux-reviewer** (copy, states), **component-reviewer**.

##### Task 10 — Web progress fields + recalc-mode select

- **Description:** extend the progress form schema + dialog with `remainingDurationDays`/`suspendDate`/
  `resumeDate`; surface `meta.warnings`; add the plan recalc-mode `Select` (default Retained Logic).
- **Complexity:** S
- **Dependencies:** T4, T5, T6.
- **Risks:** exposing sub-day input → _mitigation:_ day-denominated only (ADR-0036 §7).
- **Testing:** `ProgressDialog.test.tsx` (fields present; submits; warning renders); a11y in the journey.
- **Development steps:**
  1. Progress schema + dialog: add the three fields + the warning surface.
  2. Plan editor: add the recalc-mode `Select`.
  3. component/accessibility/ux review; changeset (minor).

## Sequencing & slices

1. **Critical questions Q1–Q3 resolved** — gate F1 (schema shape depends on them).
2. **T1 (storage)** — additive, nullable; safe to land early (columns inert until wired).
3. **T2 → T2b (engine core)** — progress ingestion + data-date floor + retained logic; ships behind the
   unchanged recalculate endpoint with the golden suite as the parity gate (all-NOT_STARTED ⇒
   byte-identical). Keeps `main` releasable.
4. **T3 (modes)** — override + actual-dates on the T2 seam.
5. **T4 → T5 (boundary + plan mode API)** — the write surface; makes progress settable + the mode
   choosable. T4 can land in parallel with the engine (independent path).
6. **T6 (service wiring)** — the first end-to-end user-valuable slice (progress changes recalculated
   dates); depends on T2/T3/T5.
7. **T8 → T9 (conformance)** — proves S02/S03/S04 + the negatives, flips the matrix, Accepts ADR-0035;
   parallel with T6 once T2/T3 land.
8. **T7 (suspend/resume)** — droppable, last; deferrable without affecting the headline value or
   S02/S03/S04 (only ADR-0035 §4 would stay un-Accepted — call it out if deferred).
9. **T10 (FE)** — last, lowest-risk, behind `VITE_PROGRESS_INGESTION`; droppable.

Each task is an independently reviewable PR. Only the FE needs a flag; the engine behaviour is gated by
the goldens and the API fields are additive.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in `docs/PROCESS.md` (code, tests ≥ 80 % on
changed code, docs, security review, performance, accessibility for UI, Docker build, CI green,
changeset, version impact). Milestone-level: a completed activity is frozen on its actuals; in-progress
remaining is floored at the data date; S02 ≠ S03 ≠ S04 and all ≠ S01 (runnable differentials);
N06/N07/N08/N13/N18 assert; the capability-matrix Progress row is ✅; the full golden suite is
byte-identical on the all-NOT_STARTED path; recalc perf budget holds @ 2 000 progressed activities;
**ADR-0035 §1–§6 Accepted**.

## Risks & assumptions (rollup)

| Risk / assumption                                                                      | Likelihood | Impact | Mitigation                                                                                     |
| -------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| Progress branch drifts the default path from the goldens                               | med        | high   | all-NOT_STARTED collapses to today's not-started branch → byte-identical; golden suite is gate |
| Frozen-actual portion made non-inverse across a non-working gap → spurious float       | med        | high   | reuse the M5 instant/anchor helpers; freeze-symmetry test                                      |
| The three recalc modes coincide on the discriminator (option not wired)                | med        | high   | direct engine test (out-of-sequence dates differ across modes) + conformance differential      |
| `loadActivities` not selecting progress columns → silent unprogressed                  | med        | med    | service spec asserts a progressed activity changes dates; `progressedActivityCount` log        |
| Progress path unaware of the data date → N07/N08 can't be enforced                     | med        | med    | load `plan.plannedStart` in `updateProgress`; boundary tests                                   |
| Q1 rejected (derive-only) → N18 un-representable, out-of-sequence productivity approx. | low        | med    | documented no-op for N18; recommend the explicit column                                        |
| Suspend/resume deferred → ADR-0035 §4 stays un-Accepted this milestone                 | med        | low    | call it out explicitly; sequence T7 last/droppable                                             |
| Over-claiming M4–M6 rows (expected-finish S12, longest-path)                           | med        | low    | flip only progress + S02/S03/S04 + N06/N07/N08/N13/N18; keep the rest ❌ with reasons          |
| **Assumption:** M1 + M5 fully landed (minute durations, instant axis, calendar port)   | —          | —      | verified in engine/service before planning                                                     |
| **Assumption:** the data date is `Plan.plannedStart` and already settable (ADR-0033)   | —          | —      | verified in schema + `schedule.service.ts`                                                     |
| **Assumption:** critical questions Q1–Q3 resolved before F1 merges                     | —          | —      | Q resolution is the milestone's first gate; recorded in `docs/DECISIONS.md`                    |

</content>
