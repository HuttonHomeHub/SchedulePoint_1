# Implementation Plan: Schedule Health Check (DCMA 14-point assessment)

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — **not yet approved**
- **Status:** Draft — awaiting approval
- **Owner:** _(to be assigned)_
- **Provisional ADR:** ADR-0116 (number chosen at filing time; a collision is recorded, not routed
  around — ADR-0071/ADR-0079)

---

## Breakdown

```mermaid
flowchart LR
  E["Epic: Schedule Health Check"] --> M0["M0 · Measure & verify<br/>(ships dark)"]
  M0 --> M1["M1 · The read-model + endpoint<br/>(ships dark)"]
  M1 --> M2["M2 · The panel<br/>FIRST USER-FACING · journey lands here"]
  M2 --> M3["M3 · Navigate to offenders<br/>+ view parity"]
  M3 --> M4["M4 · The handover document"]
  M4 --> M5["M5 · Gate pass + ADR + release"]
  M5 -.->|CQ-1 (b)| M6["M6 · Metric 12 · optional"]
  M5 -.->|CQ-2 (b)| M7["M7 · Snapshot · BLOCKED on database-architect"]
```

### Epic

**Schedule Health Check** — a DCMA-14-point assessment of how a plan is **built**, computed as a pure
read-model over persisted rows, surfaced beside the plan and printable as a handover document.
Discharges ADR-0035 §16's deferral (`docs/adr/0035-schedulepoint-cpm-semantics.md:143-145`).

**Standing constraints on every milestone below:**

- **The CPM engine is not imported and not modified; the ADR-0034 recalculation parity gate is
  untouched by construction.** Pinned by an import ban, not by intention (M1-T2).
- **No schema change** unless CQ-2 is answered (b), in which case **M7 does not start until
  `database-architect` has designed it** — no exceptions, no self-assessment of size (CLAUDE.md §19.3).
- **No new `VITE_` flag** (ADR-0088 D1). The rollback is a commit boundary.
- **Every milestone claiming user-facing capability names its entry point** or declares itself dark
  (ADR-0081 §1). There is no third state.
- **Every gate is verified red against the defect it names before it is trusted** (ADR-0110 D5).
- **Every decision-bearing claim in a commit, docblock or ADR names its evidence** (ADR-0076).

---

## Milestone 0 — Measure and verify _(ships dark)_

**Outcome:** nothing a user can reach. **Ships dark:** M0 writes no product code at all — it produces
measurements and a verification record that M1 is designed against. It exists because five consecutive
epics in this repository had their width or cost expectation contradicted by their own first
measurement, and the one that measured **before** building (ADR-0099 M0) is the one that caught it
cheaply.

**Journey:** none (nothing is reachable).

---

#### Feature: The measurement record

> **Description:** Establish, by running things rather than reading them, that the fourteen metrics are
> computable from existing columns, what the whole-plan read costs, and which seeded plans can serve as
> the oracle.
> **Complexity:** S
> **Dependencies:** none
> **Risks:** a metric turns out to need a column that does not exist → the spec's §3.1 is wrong and the
> epic changes shape. Mitigated by doing this first and by §3.1 already citing schema line numbers.
> **Testing requirements:** none (no product code); the output is a committed measurement document.

##### Task M0-T1 — Verify the column mapping against a live database

- **Description:** For each of the fourteen metrics, run the SQL that would answer it against a seeded
  database and record the result. Confirms §3.1 row by row.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** none of consequence; the cost of being wrong here is a rewritten spec, which is why it is
  first.
- **Testing:** n/a — the artefact is the record.
- **Development steps:**
  1. Seed the catalogue (`schedulepoint-seed`, ADR-0066) into a local database.
  2. For each metric write the answering query and run it against
     `plan:fixture-p6-torture-v1`, `plan:scale-500` and the per-capability plan §3.5 names.
  3. **Confirm the three claims the design leans hardest on**, each by observation and not by
     re-reading the comment that asserts it:
     - `activities.total_float` really holds **whole working days on the activity's own calendar**
       (claimed from `apps/api/src/modules/schedule/schedule.repository.ts:662-670`) — check a plan
       with a mixed calendar, not just a 24-hour one.
     - `plans.planned_start` is **NOT NULL** on every seeded plan (claimed from `schema.prisma:756-762`).
     - The seed catalogue captures **no baselines** (claimed from two greps returning nothing) — confirm
       by counting rows in `baselines` after a full seed. If it does capture one, §3.5's "these three
       metrics have no fixture" is wrong and M1-T7 shrinks.
  4. Record every result in `docs/specs/schedule-health-check/m0-measurement.md`, including anything
     that **contradicted the spec**. A contradiction is the point of the milestone, not a failure of it.

##### Task M0-T2 — Measure the read

- **Description:** Measure the cost of the whole-plan load the report needs, to decide the throttle
  budget with a number instead of an instinct.
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** the read is materially more expensive than its siblings → it takes its own `@Throttle`
  and possibly an index. Both are cheap **if decided now** and expensive if discovered in production
  (the ADR-0073 C1 lesson: a zero-match filter cost 681–954 ms because nobody had measured the absence).
- **Testing:** n/a
- **Development steps:**
  1. `EXPLAIN (ANALYZE, BUFFERS)` the three loads (activities + day factors, dependencies, the active
     baseline snapshot) on `plan:scale-500` and on a 2,000-activity generated plan.
  2. Confirm each is served by an existing index —
     `activities(plan_id, created_at, id)` (`schema.prisma:1263`),
     `dependencies(plan_id, created_at, id)` (`:1376`),
     `baseline_activities(baseline_id, source_activity_id)` (`:1889`).
  3. **Write the falsification condition down before running it:** if p95 for the whole endpoint
     exceeds **200 ms** (CLAUDE.md §15) on a 2,000-activity plan, the route takes its own throttle
     budget and the reason is recorded; if any load sequentially scans, an index is proposed and
     **goes through `database-architect`**.
  4. Record in `m0-measurement.md`. **State the spread**, not just the median — a single number from a
     dev machine has been mistaken for a bound in this repository before.

##### Task M0-T3 — Confirm the gates that could refuse this branch

- **Description:** Three repository gates can refuse or mislead a branch that touches both apps. Check
  their **current** state rather than the state a document describes.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** `scripts/frontend-only.json` has twice outlived its epic and refused an unrelated,
  legitimate `apps/api/` change (`:7-18`). It currently reads `"active": false` (`:2`) — **re-read it
  at branch time**, because that is exactly the kind of claim that goes stale between a spec and a
  first commit.
- **Testing:** n/a
- **Development steps:**
  1. Re-read `scripts/frontend-only.json`; if it has been re-armed for another epic, resolve that
     before starting rather than working around it.
  2. Confirm `pnpm check:counts` re-derives the Playwright suite count, and note the current figure —
     M2 adds a config and must move the CLAUDE.md §1 banner in the same PR or CI fails.
  3. Confirm `pnpm check:playbook` resolves `docs/TEST_PLAYBOOK.md` rows **in both directions**, so the
     M1 playbook rows must name real plans and the plans must be named.
  4. Run `pnpm prepush` once on a clean tree so the baseline is known-green before anything changes.

---

## Milestone 1 — The read-model and the endpoint _(ships dark)_

**Outcome:** `GET …/schedule/health-check` returns a correct fourteen-metric report.
**Ships dark:** nothing in the web app calls it. Nothing is reachable by a planner. **M2 surfaces it.**
This is a deliberate dark milestone and says so, per ADR-0081 §1 — "the model landed" is not a claim
that the capability exists.

**Journey:** none yet; the API is proved by Supertest against the seeded catalogue (M1-T7), which is
the tier that can actually assert arithmetic.

---

#### Feature: The pure health model

> **Description:** A pure, engine-free module that turns persisted rows into fourteen metric results.
> **Complexity:** L
> **Dependencies:** M0
> **Risks:** (a) fourteen evaluators are fourteen places a definition can drift from DCMA's → a unit
> suite per metric plus a catalogue-backed e2e; (b) a second copy of an existing rule (remaining
> duration, day conversion) drifts invisibly → both are **reused, not rewritten**, and pinned.
> **Testing requirements:** one unit spec per metric covering pass / fail / boundary / not-assessable /
> empty; a totality test; the import-ban structural test; the threshold-source structural test.

##### Task M1-T1 — The vocabulary and the thresholds

- **Description:** `health/types.ts` and `health/thresholds.ts` — the closed `HealthMetricId` union
  (14 members), the `HealthVerdict` union, the `NotAssessableReason` union, and the **single** table of
  thresholds.
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** an open `string` id lets the result set silently miss a metric — the exact failure
  ADR-0094 M1-T1 closed by making `ConflictKey` a union so the remedy `Record` could be total. Same
  move here, same reason.
- **Testing:** a totality test asserting `Object.keys(THRESHOLDS)` equals the union's members and the
  report array has exactly 14 entries in ordinal order.
- **Development steps:**
  1. Define `HealthMetricId` as a closed 14-member union and `HEALTH_METRICS` as an ordered `readonly`
     array carrying ordinal, id and display name.
  2. Define `THRESHOLDS: Record<HealthMetricId, Threshold>` — total by the compiler, so adding a metric
     without a threshold is a **typecheck failure** rather than a metric that renders blank.
  3. Define `NotAssessableReason`: `EMPTY_PLAN`, `NO_RELATIONSHIPS`, `PLAN_NOT_SCHEDULED`,
     `NO_ACTIVE_BASELINE`, `NO_TARGET_FINISH`, `NOTHING_DUE`, `REQUIRES_WHAT_IF_ANALYSIS`.
  4. Export the report types from `@repo/types` so the client consumes the same shape.
  5. Docblock each threshold with its DCMA source **and** the SchedulePoint semantic it is compared
     against — particularly metric 6/7's "working days on the activity's own calendar".

##### Task M1-T2 — The engine-free gate, verified red first

- **Description:** A structural test asserting `modules/schedule/health/` imports nothing from
  `modules/schedule/engine/compute*`.
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** a gate that passes for the wrong reason — the class ADR-0110 D5 is named for, and which
  ADR-0099 M10 found in an axe scan pointed at a deleted row. Mitigated by the verification below.
- **Testing:** **the gate itself.** Add a temporary `import { computeSchedule } from '../engine'` to a
  health file, confirm the test **fails naming that file**, then remove it. A gate is not finished when
  it passes; it is finished when it has been made to fail by the defect it was written for.
- **Development steps:**
  1. Copy the file-scan pattern from
     `apps/web/src/features/float-paths/float-paths-view-agnostic.structural.test.ts:20-45`.
  2. Assert no file under `health/` matches an import of `./engine/compute` or `../engine/compute`.
  3. Assert a **positive** case too — that the scan found a non-zero number of files. An assertion that
     passes against an empty set is not an assertion (ADR-0108's census caught itself on exactly this).
  4. Docblock states what it does **not** cover: it cannot see a transitive import, and it says so.

##### Task M1-T3 — Definition metrics (1, 2, 3, 4, 5, 10)

- **Description:** The six metrics that read only definition columns and therefore work on a plan that
  has never been calculated.
- **Complexity:** M
- **Dependencies:** M1-T1
- **Risks:** metric 2/3 computed from the **rounded** `lagDays` would miss every sub-day lead — the
  ADR-0070 defect exactly. Mitigated by taking `lagMinutes` and by a boundary test at −120 minutes
  asserted to be a lead.
- **Testing:** per-metric unit specs including: a −1-minute lag is a lead; an activity with two hard
  constraints counts once; a secondary `FNLT` counts; `SNET`/`FNET` do **not**; summaries are excluded
  from every denominator; a plan of only summaries is `EMPTY_PLAN`.
- **Development steps:**
  1. Build the adjacency sets once (`hasPredecessor`, `hasSuccessor`) and share them across metrics 1
     and 4 rather than re-walking per metric.
  2. Metric 1: apply the CQ-3 exclusion rule; report `missingPredecessorCount`,
     `missingSuccessorCount`, `excludedSummaries` and the excluded milestone ids so the exclusion is
     auditable rather than hidden.
  3. Metric 5: define `HARD_CONSTRAINTS` as an explicit `readonly` set —
     `MSO`, `MFO`, `MANDATORY_START`, `MANDATORY_FINISH`, `SNLT`, `FNLT` — with a docblock saying why
     `SNET`/`FNET` are excluded. Check the **secondary** slot too (ADR-0035 §10).
  4. Metric 10: read assignment existence only; the payload carries a `narrowing` note explaining that
     the cost half is excluded so the report cannot vary by `cost:read` (spec §3.2). `INFORMATIONAL`
     verdict — never a pass/fail.
  5. Metric 4: report the full FS/SS/FF/SF breakdown, not only the FS share.

##### Task M1-T4 — Output metrics (6, 7, 8, 9)

- **Description:** The four metrics that read engine-owned columns plus the data date.
- **Complexity:** M
- **Dependencies:** M1-T3
- **Risks:** metric 8 re-implementing the engine's remaining-duration rule → two implementations that
  drift, and the drift is invisible because each looks right alone (the ADR-0065 `routeOrthogonal`
  argument). Mitigated by **exporting and reusing** the existing rule.
- **Testing:** unit specs at the 44-day boundary in both directions (44 = pass, 45 = fail); a
  mixed-calendar plan proving metric 8's conversion uses each activity's **own** factor; a
  never-calculated plan proving 6/7/9-forecast go `PLAN_NOT_SCHEDULED` while 1–5/8/10 still compute.
- **Development steps:**
  1. **Export `resolveRemainingMinutes`** from `apps/api/src/modules/schedule/schedule.service.ts:1155`
     (currently a private function) into a shared location, with its existing docblock intact, and have
     both the recalculation path and the health model call it. Confirm `schedule.service.spec.ts` passes
     unchanged — an untouched existing suite is the before/after oracle (the ADR-0078 barrel-preserving
     argument, and ADR-0087 M4's `postAlert` precedent).
  2. Metric 6/7: compare `total_float` directly — **no conversion**, because the column is already
     day-denominated per activity (M0-T1 confirms this against a mixed-calendar plan).
  3. Metric 8: convert remaining minutes → days with `attachDayFactors`
     (`apps/api/src/modules/activities/day-factor.ts:65-85`) — **not** a constant, and not a second
     lookup per row (that would be an N+1 per field, which that file's docblock explicitly warns about).
  4. Metric 9: two sub-counts, `forecastBeforeDataDate` and `actualAfterDataDate`, reported separately —
     they have different causes and different fixes, and collapsing them into one number tells a
     planner nothing about which.

##### Task M1-T5 — Baseline metrics (11, 13, 14) and metric 12

- **Description:** The three baseline-relative metrics, and metric 12's stated non-assessment.
- **Complexity:** M
- **Dependencies:** M1-T4; **CQ-1 answered**
- **Risks:** inventing a target finish for CPLI when none exists — the single most tempting dishonesty
  in the feature. Mitigated by making `NO_TARGET_FINISH` a first-class outcome with a test, and by
  naming the **source** of the target in the payload when one is found.
- **Testing:** a no-baseline plan → 11/13/14 `NO_ACTIVE_BASELINE`; a baseline with nothing due yet →
  14 `NOTHING_DUE` (never a division by zero); a plan with a baseline but no `captured_project_finish`
  and no finish constraint → 13 `NO_TARGET_FINISH`; an activity absent from the snapshot is excluded
  and counted.
- **Development steps:**
  1. Join the snapshot by `source_activity_id` — the same join `getEarnedValue` already does
     (`schedule.service.ts:675`), reusing its shape rather than inventing one.
  2. Metric 13: resolve the target finish in the documented order (active baseline's
     `captured_project_finish` → an `FNLT`/`MFO`/`MANDATORY_FINISH` on a `FINISH_MILESTONE`), and put
     the **source used** in the payload.
  3. Metric 14: guard the zero denominator explicitly and return `NOTHING_DUE`.
  4. Metric 12: per CQ-1. Default (a) — return `NOT_ASSESSABLE` / `REQUIRES_WHAT_IF_ANALYSIS` with the
     check explained. It is a metric that renders, not a metric that is missing.

##### Task M1-T6 — Repository, service, controller, DTO, OpenAPI, audit census

- **Description:** Wire the pure model to an endpoint, matching the `getEarnedValue` shape exactly.
- **Complexity:** M
- **Dependencies:** M1-T5
- **Risks:** the audit route census **fails** without its line — which is the desired behaviour and is
  noted here so it is not mistaken for a broken build.
- **Testing:** service unit spec (403 without `schedule:read`; 404 cross-org; `assertCan` before any
  load); controller spec; the census spec passing with the new line.
- **Development steps:**
  1. `loadHealthCheckInputs` on `ScheduleRepository`: one `Promise.all` of four plan-scoped loads,
     modelled on `getEarnedValue`'s (`schedule.service.ts:667-671`).
  2. `getHealthCheck` on `ScheduleService`: `resolveScope` → `assertCan('schedule:read', org.id)`
     **before any load** → `findActiveByIdInOrg` → 404 → load → pure compute. No lock, no pen, no
     `computeSchedule`. Docblock states all three, in those words.
  3. `@Get('health-check')` on `ScheduleController` with full OpenAPI decorators. **Global throttle
     unless M0-T2 says otherwise**; if it does, add `@Throttle` with the measured number in the
     docblock, following `FLOAT_PATHS_THROTTLE` (`schedule.controller.ts:38-47`).
  4. Add exactly one line to `UNAUDITED_ROUTES`:
     `'GET /api/v1/organizations/:orgSlug/plans/:planId/schedule/health-check': REASONS.READ` —
     beside its four neighbours at
     `apps/api/src/modules/audit/audit-coverage.structural.spec.ts:229-232`. Commit message records
     ADR-0073's two tests and their outcome (spec §3.4).
  5. Cap offenders (default 50) and always emit the true `offenderCount` + `offendersTruncated`
     (ADR-0100's rule).
  6. Update `docs/API.md`.

##### Task M1-T7 — API e2e against the seeded catalogue

- **Description:** Supertest specs asserting each metric's verdict on a plan whose defect is already
  documented — the ADR-0066 catalogue used as an oracle.
- **Complexity:** M
- **Dependencies:** M1-T6
- **Risks:** **three metrics have no seeded fixture.** Verified: the catalogue captures no baselines
  (spec §3.5), so 11/13/14 need a fixture the suite builds itself. Discovering this at M1 rather than
  M5 is the whole reason M0-T1 re-checks it.
- **Testing:** this task **is** the testing.
- **Development steps:**
  1. Assert per-metric verdicts on the plans §3.5 names.
  2. Build the baseline fixture **through the public REST API** (ADR-0066's rule — never by writing
     rows): create plan → activities → links → recalculate → capture baseline → report progress →
     read the health check. This is the only way metrics 11/13/14 get covered at all.
  3. Assert the whole-payload shape on `plan:fixture-p6-torture-v1`, comparing the **entire** report
     rather than three fields — an oracle is a difference (the ADR-0098 rule).
  4. Assert 403 for a member without `schedule:read` and 404 cross-org.
  5. Add rows to `docs/TEST_PLAYBOOK.md` (which plan proves which metric, and **what wrong looks
     like** for each) — `pnpm check:playbook` gates that they resolve in both directions.
  6. Run `scripts/e2e-local.sh api` locally. **CI is the second opinion, never the first**
     (CLAUDE.md §19.8).

---

## Milestone 2 — The panel _(FIRST USER-FACING MILESTONE)_

**Outcome:** a planner can open the report and read fourteen verdicts.
**Entry point:** the plan workspace command strip → **`Analysis ▾`** → menu item **`Health check…`**
(`apps/web/src/features/tsld/toolbar/tsld-toolbar-items.tsx:1297-1312`). One new `MenuItem`; **no new
toolbar stop.**
**Journey:** `apps/web/e2e-health-check/health-check.spec.ts` — its own Playwright config and its own
CI step, landing **here and not at the gate pass** (ADR-0081 §2). Its first step signs in, seeds a
plan with a known defect through the API, opens `Analysis ▾ → Health check…`, and asserts the panel
renders fourteen rows with the expected verdict on the seeded defect. This is the milestone whose
hole would otherwise be invisible: unit tests mount the panel, and the defect the register keeps
recording lives in the seam between the panel and the shell.

---

#### Feature: The docked health panel

> **Description:** A docked column rendering the report, with per-metric disclosure and every state.
> **Complexity:** L
> **Dependencies:** M1
> **Risks:** (a) the client restating a threshold the server did not give it → the G3 structural gate;
> (b) the panel importing a view's renderer → the view-agnostic gate; (c) a menu item that renders and
> opens nothing → the journey.
> **Testing requirements:** component specs for loading / error / empty / not-scheduled / no-baseline /
> pass / fail; the three structural gates; an axe scan; the journey.

##### Task M2-T1 — Query hook and view model

- **Description:** `api/use-schedule-health.ts` and `model/health-rows.ts`.
- **Complexity:** S
- **Dependencies:** M1-T6
- **Risks:** a stale report after an edit reads as a broken feature. Mitigated by invalidating the key
  wherever the recalculation already invalidates the schedule summary — **found by grepping the
  existing invalidation sites, not by adding a new one.**
- **Testing:** unit specs for the hook's key and for the row derivation (including "14 rows always").
- **Development steps:**
  1. `queryOptions` under `scheduleKeys`, modelled on
     `apps/web/src/features/earned-value/api/use-earned-value.ts:18-29`.
  2. Add the key to the existing post-recalculation invalidation set.
  3. `health-rows.ts` is pure — no React, no fetch — so the row logic is testable without a DOM.

##### Task M2-T2 — The panel component

- **Description:** `components/ScheduleHealthPanel.tsx` — the docked column.
- **Complexity:** L
- **Dependencies:** M2-T1
- **Risks:** a modal would black out the diagram and break M3 before it starts. The dock decision is
  CQ-4; if the answer is (b) the panel becomes a `PlanChromeDialog` entry and **M3 shrinks to
  "close, then look"**, which must be re-scoped rather than quietly delivered.
- **Testing:** component specs per state; an axe scan; a **shaded-vs-omitted** check per ADR-0082.
- **Development steps:**
  1. Fourteen rows, always, in ordinal order. A metric never disappears.
  2. Verdict as **word + icon**, never colour alone (WCAG 1.4.1) — the `IndexValue` precedent at
     `apps/web/src/features/earned-value/components/EarnedValuePanel.tsx:39-65`.
  3. `NOT_ASSESSABLE` rows render the reason **as a sentence** and the route that fixes it
     (`Analysis ▾ → Baselines…` / `Recalculate`), with the action offered **only** to a caller who
     holds it — a Viewer gets the explanation and no button
     (`FloatPathsPanel.tsx:45-49`).
  4. Announce the headline **once, on settle**, through the shared live region. Not per render (the
     ADR-0079 stale-debounce finding).
  5. Threshold and measured value reachable to assistive technology — in the accessible name or an
     `aria-describedby` sibling, never only in an `aria-hidden` chip (the ADR-0094 M5 finding).
  6. `onClose` closes **and places focus**, or the Close button unmounts and strands focus on `<body>`
     (WCAG 2.4.3 — recorded three times in this register).

##### Task M2-T3 — The entry point

- **Description:** One `MenuItem` in `PlanAnalysisControl`.
- **Complexity:** S
- **Dependencies:** M2-T2
- **Risks:** **the register's most-repeated defect** — a capability with no entry point, or an entry
  point wired into one host and not the layout the shipped app selects (ADR-0080's `bulk`, ADR-0099's
  drawer, ADR-0081's whole subject). Mitigated by M2-T4 driving the real product.
- **Testing:** a unit spec that the item renders and calls the opener; **the journey is the real proof.**
- **Development steps:**
  1. Add the item beside `Baselines…` / `Earned value…` / `Resource histogram…`.
  2. Wire the opener through the same context path those three use — **check every host that renders
     the panel region**, not just the first one found (ADR-0080's shipped defect was exactly one host
     wired and its neighbour not).
  3. Trigger stays enabled whenever **any** row inside is actionable — never inheriting one row's gate,
     which is the defect ADR-0090 M2-T4 shipped and caught (`tsld-toolbar-items.tsx:1238-1240`).

##### Task M2-T4 — The flag-on-equivalent journey

- **Description:** `apps/web/playwright.health-check.config.ts` + `apps/web/e2e-health-check/`, its own
  `test:e2e:health-check` script and its own CI step.
- **Complexity:** M
- **Dependencies:** M2-T3
- **Risks:** none to the product; the risk is **not writing it**, which is what ADR-0081 exists for.
- **Testing:** this is the testing.
- **Development steps:**
  1. Copy `apps/web/playwright.float-paths.config.ts` as the shape. Chromium only; serial; its own
     ports; `timeout: 120_000` (a seeded plan plus a recalculation before the first assertion).
  2. Set the viewport from a **measured** width, and say in a comment which and why — not a round
     number chosen by eye (this repository has been wrong about widths six consecutive times).
  3. Seed through the API, open the menu item, assert fourteen rows and the seeded defect's verdict.
  4. Locate controls **by role and accessible name**, and any toolbar control by
     `[data-toolbar-item]` rather than by its copy (ADR-0091's rule, written after three journeys
     broke on a label change).
  5. Add the script to `apps/web/package.json`, the target to `scripts/e2e-local.sh`, a CI step, and
     the suite to `scripts/e2e-sweep.sh` — whose list is derived, so confirm the new suite appears.
  6. **Update `CLAUDE.md` §1's Playwright suite count in the same PR**, or `pnpm check:counts` fails.
  7. Run `scripts/e2e-local.sh web:health-check` locally before pushing.

---

## Milestone 3 — Navigate to offenders, in both views

**Outcome:** a planner presses a finding and lands on the activity causing it, in whichever view is
showing.
**Entry point:** the offender rows inside an expanded metric in the health panel.
**Journey:** extends M2's spec — expand a failing metric, press an offender, assert the workspace
selection moved and the showing view revealed it; then switch to the Gantt and repeat.

---

#### Feature: Offender navigation and view parity

> **Description:** Offender lists, the jump seam, and the assertion that the panel is a peer of both
> views rather than a member of one.
> **Complexity:** M
> **Dependencies:** M2
> **Risks:** reaching for `centerOnDate`, which is **null whenever the Gantt is showing**, silently
> skipping half the work in half the product (the ADR-0059 M6 shape, and the exact hazard
> `plan-workspace-toolbar.tsx:1090-1093` was written to warn about).
> **Testing requirements:** component spec for the jump callback; the view-agnostic structural gate;
> the journey in **both** views.

##### Task M3-T1 — Offender lists and the jump

- **Description:** Expandable offender lists; pressing one lifts the selection and lets the view reveal it.
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** an edge is not selectable in either view → relationship offenders select their
  **successor**, stated in the copy so a planner is not surprised.
- **Testing:** component spec asserting the callback fires with the right id for both activity and
  relationship offenders; keyboard operability of the whole list including the "N withheld" row.
- **Development steps:**
  1. `onActivateActivity` prop, wired at the host with
     `canvasUi.requestSelectActivity(id)` + `model.onSelectionChange(id)` —
     the seam already used by Next-conflict, search navigation and the float-paths panel
     (`plan-workspace-toolbar.tsx:1118-1121`).
  2. **Do not** import the canvas handle into the feature.
  3. Announce the jump inside the focus frame, so the panel's announcement is not overwritten by the
     listbox announcing the row it lands on (the ADR-0080 finding).
  4. Truncated lists say how many were withheld and remain keyboard-reachable.

##### Task M3-T2 — The three separation gates

- **Description:** G1 (disjoint vocabularies), G2 (no import either way), G3 (no threshold literal in
  the web feature) — spec §4.3.
- **Complexity:** S
- **Dependencies:** M3-T1
- **Risks:** a gate that passes vacuously. Mitigated by pinning a positive case in each and by
  verifying each red first.
- **Testing:** the gates.
- **Development steps:**
  1. G1: assert `HealthMetricId ∩ ConflictKey = ∅`, **and** that both sets are non-empty.
  2. G2: file-scan both directions, copying
     `float-paths-view-agnostic.structural.test.ts:29-45`.
  3. G3: reject numeric threshold literals in `features/schedule-health/`, **stripping comments
     first** — a scan over raw text counts a docblock explaining the rule as breaking it, which has
     happened four times in this repository (ADR-0099 M4, ADR-0106 M4, and the two ratchets ADR-0098
     records).
  4. Verify each red against the specific defect it names, then remove the injected defect.

##### Task M3-T3 — Correct the stale seam comment

- **Description:** `apps/web/src/features/float-paths/float-paths-view-agnostic.structural.test.ts:33`
  says the shared seam is `ctx.goToActivity`; a repository-wide `Grep "goToActivity"` returns **that
  comment and nothing else**. The seam is real, the name is not.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** none. Skipping it is the risk — noticing drift and stepping over it leaves the repository
  exactly as wrong as not noticing (ADR-0071).
- **Testing:** none needed; it is a comment.
- **Development steps:** correct it to name the real seam; if it is not taken in this epic, file a
  `docs/TECH_DEBT.md` row rather than leaving it.

---

## Milestone 4 — The handover document

**Outcome:** a planner can print the report as a document to put in a submission pack.
**Entry point:** a **`Print report`** button in the health panel's header.
**Journey:** extends M2's spec — press Print with `window.print` stubbed and assert the detached
document contains **all fourteen** rows, including the not-assessable ones with their reasons in words.

---

#### Feature: The printed report

> **Description:** A detached print document built from the same report object the panel renders.
> **Complexity:** M
> **Dependencies:** M3
> **Risks:** printing the live panel would print only the rows scrolled into view — "a programme
> silently truncated to a scroll position, which looks complete and is not"
> (`apps/web/src/lib/print-document.ts:8-13`). Mitigated by using that module, which exists precisely
> for this.
> **Testing requirements:** a unit spec asserting all fourteen rows are in the printed tree, reasons
> rendered as sentences and not codes, and the header carries plan name + data date + computed-at; a
> journey step.

##### Task M4-T1 — The print document

- **Complexity:** M
- **Dependencies:** M3-T1
- **Risks:** a code (`NO_ACTIVE_BASELINE`) reaching paper. Mitigated by a test that greps the printed
  tree for any `NotAssessableReason` literal and fails if one is found.
- **Testing:** as above.
- **Development steps:**
  1. `ScheduleHealthPrintDocument` rendering **every** metric from the same report object — one
     derivation, not two (the ADR-0063 M5 rule: two answers to one question differ eventually, and
     only in a printed document).
  2. Mount via `printDocument()` from `apps/web/src/lib/print-document.ts`; its own print styles.
  3. Header: plan name, data date, computed-at, scheduling mode, baseline name (or "none").
  4. Footer: the standard the report was run against, and the metric-10 narrowing sentence.
  5. Screenshot it into `scripts/shoot.mjs`'s shot list — **the register records a four-scrollbar
     panel reaching a user because the shot list stopped at the route** (ADR-0101), and a printed
     document is exactly the artefact nobody looks at until a client does.

---

## Milestone 5 — Gate pass, ADR, release

**Outcome:** the epic is closed, reviewed and released.
**Ships dark:** nothing new is surfaced; this milestone reviews and records.
**Journey:** the full suite, plus every other journey re-run (M5-T2).

---

##### Task M5-T1 — Specialist review pass

- **Description:** Run the six specialists over the **combined** diff.
- **Complexity:** M
- **Dependencies:** M4
- **Risks:** treating this as a formality. It has blocked on real defects for **seven consecutive
  epics** in this register; budget for findings rather than for a sign-off.
- **Testing:** every fix carries a regression test **verified red first**.
- **Development steps:**
  1. `api-reviewer` (envelope, status codes, OpenAPI), `security-reviewer` (scope/IDOR, the metric-10
     narrowing, no cost egress), `backend-performance-reviewer` (re-derive M0-T2's numbers from the
     **final** code rather than trusting them), `ux-reviewer`, `accessibility-reviewer`,
     `component-reviewer`.
  2. **`accessibility-reviewer` + `component-reviewer` run earlier, at M2, if any shared primitive's
     keyboard contract was touched** (CLAUDE.md §19.13 / ADR-0111) — not deferred to here.
  3. Fold blocking findings with regression tests; record non-blocking ones as a
     `docs/TECH_DEBT.md` row.

##### Task M5-T2 — Pre-push gate and the full sweep

- **Complexity:** S
- **Dependencies:** M5-T1
- **Risks:** running the suite CI names instead of all of them. Three journeys broke that way in one
  epic (ADR-0091's retrospective) and each was found by CI rather than locally.
- **Development steps:**
  1. `pnpm prepush` — **one command**; running its parts by hand is how a gate gets missed
     (CLAUDE.md §19.8).
  2. `scripts/e2e-local.sh api` (this touches `apps/api/`).
  3. `scripts/e2e-local.sh web:health-check`, **plus the base journey** — a screen changed, and
     ADR-0096 records the base suite being the one thing the documented pre-push gate could not run.
  4. `scripts/e2e-sweep.sh` after any label or layout change.
  5. Before merging, read the check runs for the PR's **current head** and confirm every one is
     `completed` / `success` — a relayed `check_suite` event is not proof (CLAUDE.md §19.9). If a job
     sits `queued` unusually long, ask `get_workflow_run_usage` for `run_duration_ms`.

##### Task M5-T3 — ADR, docs, changeset

- **Complexity:** S
- **Dependencies:** M5-T2
- **Development steps:**
  1. File the ADR from §4.10's outline. **Choose the number at filing time** by reading `docs/adr/`,
     and record a collision rather than routing around it (ADR-0071/ADR-0079). Add it to
     `docs/adr/README.md` — gated in **both** directions since ADR-0110 D6.
  2. Update `CLAUDE.md` §16 (ADR summary) and §1 (counts), `docs/API.md`, `docs/TESTING.md`,
     `docs/TEST_PLAYBOOK.md`.
  3. Record in the ADR's closing section **what this epic got wrong**, including the three claims §3.6
     already corrects. The corrections are the useful part.
  4. `pnpm changeset` — a **minor** bump pre-1.0 for both `@repo/api` and `@repo/web` (a new
     user-visible capability; nothing breaking).

---

## Milestone 6 — Metric 12, the Critical Path Test _(optional; only if CQ-1 = (b))_

**Outcome:** metric 12 reports a real verdict.
**Entry point:** a **`Run critical path test`** button on metric 12's row, which is otherwise
`NOT_ASSESSABLE`.
**Journey:** extends M2's spec — press it and assert the verdict changes.

> **Description:** A separate route running `computeSchedule` **read-only, twice, in memory**,
> persisting nothing — the `floatPaths` pattern (`schedule.service.ts:580-645`) with its own tighter
> throttle (`schedule.controller.ts:38-47`).
> **Complexity:** L
> **Dependencies:** M5; CQ-1 answered (b)
> **Risks:** the honest-wording risk. **Parity still holds** — no new input reaches `computeSchedule`
> and nothing is persisted — **but "the engine is not imported" becomes false for this route and must
> not be repeated there.** The ADR says so explicitly rather than copying the sentence across.
> **Testing requirements:** unit specs for the perturbation rule; an API e2e proving the plan is
> **unchanged** afterwards (read the rows back and compare); a rate-limit spec.

##### Task M6-T1 — Decide and document the perturbation

- **Complexity:** M
- **Development steps:** which critical activity, by how much, and what counts as "the finish moved by
  the same amount"; document the rule with its DCMA source; make it a constant, not a magic number.

##### Task M6-T2 — The route and the non-mutation proof

- **Complexity:** M
- **Development steps:** the read-only recompute; the e2e that reads every engine-owned column before
  and after and asserts equality — **the claim "it persists nothing" is proved, not asserted.**

---

## Milestone 7 — Capturable snapshot _(only if CQ-2 = (b)); BLOCKED on database-architect_

**Outcome:** a planner can freeze a report as a record.
**Entry point:** a **`Capture health check`** button; captured reports listed beside baselines.
**Journey:** capture, then re-read the captured report and assert it did not move when the plan did.

> ⚠️ **This milestone does not begin until the `database-architect` agent has designed the schema.**
> Every schema change goes through that agent without exception, and deciding a change is too small to
> need it is precisely the judgement the agent exists to make (CLAUDE.md §19.3 / §20, product-owner
> instruction 2026-08-09). **If the agent returns nothing, fails, or is slow, re-run it.** An
> unavailable agent is a reason to wait, never a reason to proceed: a migration is checksummed the
> moment it lands and applies to a real database, so a mistake costs a second migration in every
> environment rather than an edit.
>
> **Complexity:** XL
> **Dependencies:** M5; CQ-2 answered (b); `database-architect` design complete
> **Risks:** a frozen report whose meaning drifts when the metric definitions change → the snapshot
> stores the **verdicts and the thresholds it was judged against**, following ADR-0025's snapshot-copy
> rule and ADR-0068's "freeze the factor at capture" lesson.
> **Testing requirements:** schema/migration tests; an audit-event spec (**this one IS audited** — a
> durable artefact handed to a client passes ADR-0073's Test 1, unlike the live read); a retention
> question answered rather than deferred (ADR-0087); restore/recycle-bin behaviour.

---

## Sequencing & slices

Each milestone leaves `main` releasable.

| Slice | Ships                      | Reachable by a planner?                      | Rollback                                    |
| ----- | -------------------------- | -------------------------------------------- | ------------------------------------------- |
| M0    | A measurement document     | No — **dark by declaration**                 | n/a (no product code)                       |
| M1    | The endpoint               | No — **dark by declaration**; M2 surfaces it | Revert one commit; nothing calls it         |
| M2    | The panel + the journey    | **Yes** — `Analysis ▾ → Health check…`       | Revert the panel commit; the API stays dark |
| M3    | Offender navigation        | Yes                                          | Revert; the panel still reads               |
| M4    | The printed report         | Yes                                          | Revert; the panel still reads               |
| M5    | Reviews, ADR, release      | —                                            | —                                           |
| M6/M7 | Conditional on CQ-1 / CQ-2 | Yes                                          | Revert                                      |

**No feature flag** (ADR-0088 D1: a `VITE_` constant is inlined at build time, `docker-publish.yml`
passes none, so it has never been an operator rollback). The rollback contract is the commit boundary,
and the table above is that contract written down.

---

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in
[`docs/PROCESS.md`](../../PROCESS.md) — code, tests (**run**, not merely written), docs, security,
performance, accessibility, Docker build, CI green, changeset, version impact.

Two additions specific to this epic:

- **A milestone claiming user-facing capability names its entry point in its PR description**, or
  declares itself dark. There is no third state (ADR-0081 §1).
- **Every new gate has been verified red** against the defect it names before it is trusted
  (ADR-0110 D5).

---

## Risks & assumptions (rollup)

| Risk / assumption                                                                                    | Likelihood  | Impact | Mitigation                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A metric needs a column that does not exist → schema change → `database-architect` becomes mandatory | **low**     | high   | §3.1 enumerates every column with schema line numbers; **M0-T1 re-verifies against a live database before any code**.                             |
| The whole-plan read is slower than its siblings                                                      | med         | med    | **M0-T2 measures it with the falsification condition written first**; a tighter throttle and/or an index (via `database-architect`) if it fails.  |
| A metric definition drifts from DCMA's                                                               | med         | high   | Per-metric unit suite; catalogue-backed API e2e; every threshold docblocked with its source **and** the SchedulePoint semantic it is compared to. |
| Metrics 11/13/14 have **no seeded fixture** (baselines are not seeded)                               | **certain** | med    | Confirmed by two greps and re-confirmed at M0-T1; the API e2e builds its own baseline fixture through the public REST API (M1-T7 step 2).         |
| "Health" and "conflict" counts disagree on screen                                                    | med         | high   | Three structural gates (§4.3), each verified red; the report links to the conflict review rather than restating it.                               |
| The client restates a threshold                                                                      | med         | med    | The threshold travels in the payload; G3 bans numeric threshold literals in the web feature (comments stripped first).                            |
| The entry point is wired into one host and not the layout the shipped app selects                    | **med**     | high   | The register's most-repeated defect (ADR-0080, ADR-0099 M10, ADR-0081). Mitigated by M2-T4's journey driving the real product.                    |
| Metric 8 re-implements the engine's remaining-duration rule                                          | med         | med    | **Export and reuse** `resolveRemainingMinutes` (`schedule.service.ts:1155`); the untouched existing suite is the before/after oracle.             |
| Sub-day lags/durations missed because the model reads the rounded day fields                         | med         | med    | Read `lagMinutes` / `durationMinutes`; boundary tests at −120 minutes and at a four-hour duration.                                                |
| `scripts/frontend-only.json` re-armed for another epic refuses this branch                           | low         | low    | Currently `"active": false` (`:2`); **M0-T3 re-reads it at branch time** — it has gone stale twice (`:7-18`).                                     |
| `pnpm check:counts` fails on the new Playwright suite                                                | **certain** | low    | M2-T4 step 6 updates `CLAUDE.md` §1 in the same PR. Listed so it is expected rather than debugged.                                                |
| Reviewers find defects at M5                                                                         | **high**    | med    | Expected, not feared — seven consecutive epics. Budgeted as a milestone with regression tests verified red.                                       |
| CQ-2 answered (b) mid-flight after M2 has shipped                                                    | low         | med    | M7 is a separate milestone gated on the agent; nothing in M1–M5 assumes the live-read-only answer beyond the absence of a table.                  |

---

## Approval gate

**Awaiting approval before implementation.** No application code has been written and none will be
until the spec and this plan are approved and the four critical questions in
[`./feature-spec.md`](./feature-spec.md) §6 are answered — **CQ-2 first**, because it is the only one
whose answer changes what must be gated.
