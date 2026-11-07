# Implementation Plan: A plan keeps the instant beside the date, so a cross-plan link reads what one plan keeps

- **Feature spec:** [`feature-spec.md`](./feature-spec.md)
- **Status:** Approved 2026-11-07 (product owner; Q1 B — milestones and part-day finishes; Q2 A — recalculate linked plans once at first start)
- **Owner:** api (builder agent, with database-architect for M2)

## Breakdown

```mermaid
flowchart LR
  E[Epic: cross-plan instants, #565] --> M0[M0 measure + predict]
  M0 --> M1[M1 engine reports instants; derivation can read them]
  M1 --> M2[M2 columns + write + export 2.4]
  M2 --> M3[M3 boot service, dormant]
  M3 --> M4[M4 switch the read on + marker]
  M4 --> M5[M5 close: ADR Accepted, docs, rows]
```

### Epic

**Cross-plan instants (#565)**: a plan stores the exact instant beside each date a cross-plan link
reads, and the link reads it, so the five remaining zero-span cases (and, if CQ-1 = B, mid-day upstream
finishes) equal one plan. Roadmap theme: inter-project scheduling.

**Entry point (ADR-0081): none, declared.** No milestone adds a control. M1–M3 change nothing a planner
sees. M4 changes dates on linked plans through every existing read (canvas, Gantt, panel, cross-plan
list); the capability is "the dates are right", and its gate is the API e2e that drives the real product
through REST (FC-6), not a Playwright journey, because there is no new surface for a journey to open.

**Every milestone is one PR** except where a task is split out below. Each keeps `main` releasable.

---

### Milestone M0: measure and predict (no product code)

**Outcome:** the decision-bearing claims in spec §0 are executed, and a prediction is committed before
any code that could disagree with it.
**Entry point:** Ships dark: measurement only.

#### Feature: evidence

> **Description:** run the witnesses, take the cost baseline, commit predictions.
> **Complexity:** S
> **Dependencies:** spec approved, CQ-1 and CQ-2 answered (defaults stand otherwise)
> **Risks:** a prediction written after the run proves nothing → commit it in its own commit first.
> **Testing requirements:** the outputs are files under `docs/specs/cross-plan-instants/m0/`.

##### Task M0-T1: re-verify the problem (≈ one PR with T2–T3)

- **Description:** run `cross-plan-milestone-fixture.spec.ts` and record which six cases are `it.fails`
  and that the other 18 pass; correct the stale "twenty" (spec R2) in the record. Run R3's witnesses.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** a case fixed meanwhile by another change → record it and narrow the plan.
- **Testing:** none added.
- **Development steps:**
  1. Run the fixture spec and the derivation suites; paste results into `m0/red-run.md`.
  2. Confirm `compute.ts:961-983` still holds the four instants in scope (spec R4).

##### Task M0-T2: prediction

- **Description:** a per-case prediction for the 24 fixture cases (which flip to equal), for the twin
  matrix (stays all-equal), for a **progressed upstream** pair and a **placed finish milestone** upstream
  (what moves, which way), and if CQ-1 = B for a sub-day axis (which cells turn equal, and that each
  moves earlier, never later). Committed alone before M1.
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** none beyond the commit order.
- **Testing:** none added; M1 runs it.
- **Development steps:**
  1. Write `m0/prediction.md`; commit on its own.

##### Task M0-T3: cost baseline

- **Description:** `writeResults` median and p95 at 2,000 and 5,000 activities, and `buildEngineGraph`
  query counts at 10 and 100 links each way, one machine, one sitting (the ADR-0161 `m0/cost.md` shape),
  so FC-10 is judged against a same-sitting number.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** cross-sitting noise (CLAUDE.md §17's lesson) → M2 re-takes the baseline and the after
  figure in one sitting; this one is the shape and the order of magnitude.
- **Testing:** none added.
- **Development steps:**
  1. Record in `m0/cost.md`.

---

### Milestone M1: the engine reports the instants, and the derivation can read them

**Outcome:** with instants supplied, the split fixture equals one plan in the five cases. Production
passes no instants yet, so nothing a planner sees changes.
**Entry point:** Ships dark: production supplies `null` for every remote instant until M4.

#### Feature: engine result fields and the derivation's read rule

> **Description:** spec D-1 and D-3, pure code, plus the conformance adapter (the second producer).
> **Complexity:** M
> **Dependencies:** M0-T2 committed
> **Risks:** see tasks.
> **Testing requirements:** FC-1, FC-2, FC-3, FC-4, FC-5.

##### Task M1-T1: four required instants on `EngineResult` (≈ one PR)

- **Description:** add placed start/finish and late start/finish instants (absolute minutes) to
  `EngineResult`, set from `placedStartInst`, `placedFinishInst`, `lsInst`, `lfInst`. Update hand-built
  results in specs and test support (about a dozen files; `passOnStartInstant` is the census).
- **Complexity:** S
- **Dependencies:** none
- **Risks:** an edited assertion value hiding a behaviour change → the PR edits **shapes only**; a
  comparison test runs every engine spec fixture and asserts every pre-existing field is identical with
  and without the change (FC-4). Reviewer checks the diff contains no changed expected value.
- **Testing:** unit tests asserting each instant equals the instant the paired date is dated from, for a
  task, each zero-span type on two calendars, a placed activity and a progressed one; FC-4 comparison;
  `compute.spec.ts` and the ADR-0034 matrix unedited.
- **Development steps:**
  1. Add the fields with docblocks (in memory only until M2; state that M2 persists them).
  2. Set them in `compute.ts` and in any other producer of `EngineResult` (levelling's legacy path,
     test oracles), found by the compiler.
  3. File **ADR-0212** as `Proposed` from spec §4.9, add its CLAUDE.md §16 line (`check:adr-coverage`),
     and flip the spec header to `Approved` in the same PR (`check:spec-status`).

##### Task M1-T2: the derivation reads a supplied instant (≈ one PR)

- **Description:** `IncomingCrossPlanEdge` gains `predecessorPlacedStartInstant`/`…FinishInstant`,
  `OutgoingCrossPlanEdge` gains `successorLateStartInstant`/`…FinishInstant`, each `number | null`.
  `remoteInstants` uses the needed instant when non-null (and, under CQ-1 = A, only for a zero-span
  remote); otherwise the date reader runs exactly as today. Add `remoteInstantMissingCount` to the
  result (D-6). The service passes `null` for all four in this milestone.
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** a renamed backward basis (`successorPlaced…`) → `cross-plan-basis.structural.spec.ts`
  already refuses it; extend it so both producers must pass instants on both sides.
- **Testing:** derivation unit tests: instant beats date for each anchor and type; null gives a
  byte-identical result to the current code over the existing `cross-plan-derivation.spec.ts` inputs
  (FC-5); LOE and null-date edges are not counted as instant misses.
- **Development steps:**
  1. Extend the two edge interfaces and `remoteInstants`.
  2. Service: pass `null` (explicitly, with a comment naming M4).
  3. Extend the structural spec.

##### Task M1-T3: the conformance producers pass instants; the witnesses become equalities (≈ one PR)

- **Description:** `conformance/cross-plan-adapter.ts`, `cross-plan-twin.ts` and the milestone fixture's
  `twoPlans` pass the new `EngineResult` instants. `DIVERGES` drops to the one third-shape key, re-labelled
  "the upstream plan's own finish basis (by design, ADR-0212 D7)". Each "stored date cannot say" witness
  gains its instant companion (FC-2). Under CQ-1 = B add the sub-day twin axis and check it against M0's
  prediction.
- **Complexity:** M
- **Dependencies:** M1-T2
- **Risks:** a fixture that passes because instants are supplied by the same engine it compares against
  (no independent oracle) → the existing hand-computed goldens (ADR-0161 FC-3/4/9/10) stay unedited, and
  each flipped case is verified red by forcing the instant to null.
- **Testing:** FC-1, FC-2, FC-3; the prediction comparison recorded in `m1/red-run.md`.
- **Development steps:**
  1. Pass instants in both producers.
  2. Flip the five keys; run each red with instants forced null, then green.
  3. Record the run against the prediction.

---

### Milestone M2: store the instants (schema)

**Outcome:** every recalculation persists the four instants and the freshness marker; the organisation
export carries them. Nothing reads them yet.
**Entry point:** Ships dark: the derivation still receives `null` until M4. The export is the one
visible change (four appended columns, format `2.4`), reached through the existing **Export data**
control.

#### Feature: columns, write, export

> **Description:** spec §4.4 and §4.6.
> **Complexity:** M
> **Dependencies:** M1-T1 (the fields exist); database-architect design accepted
> **Risks:** see tasks.
> **Testing requirements:** FC-7, FC-10, FC-11; migration test on a populated database (ADR-0107).

##### Task M2-T1: database-architect design (no code)

- **Description:** run **database-architect** on spec §4.4: column names and types for D-DB-1, the D-4
  freshness marker's shape and home (D-DB-2), no backfill (D-DB-3), any CHECK, the `unnest` append order,
  and the rollback consequence. Output to `m2-schema-design.md`. Re-run if it returns nothing
  (CLAUDE.md §19.3).
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** the marker on `plans` costs DDL on a hot table → the architect weighs it against the
  alternative recorded in the spec; the choice and its reason go in the design file.
- **Testing:** the design names its own migration tests.

##### Task M2-T2: migration, `writeResults`, freshness marker (≈ one PR, with T3)

- **Description:** the migration as designed; `writeResults` appends the four arrays after
  `derived_duration_minutes`; the marker is written with `stampScheduleComputedAt` in the same
  transaction. Schema comments in the house style (why, unit, engine-owned, no index).
- **Complexity:** M
- **Dependencies:** M2-T1
- **Risks:** an all-null array cast trap (`schedule.repository.ts:898-917`) on a plan whose instants are
  all null → cannot occur for the four (the engine always produces them), but test the empty-plan path;
  a missing `SET` entry invisible to a mocked `$executeRaw` → FC-7 runs the real statement.
- **Testing:** API e2e: recalculate a seeded plan, read the columns back, round-trip identity; mutation
  (remove one `SET` entry) turns it red; `schedule.repository.day-factor.spec.ts` positional pins
  unchanged; migration applied to a populated database (ADR-0107); FC-10 measured in one sitting with a
  fresh baseline.
- **Development steps:**
  1. Migration + `schema.prisma` comments.
  2. `writeResults` and the stamp.
  3. Tests; record cost in `m2/cost.md`.

##### Task M2-T3: organisation export 2.4

- **Description:** append the four columns to `activities` in `export-columns.ts` as `instant`; withhold
  the marker if it is a `plans` column, with the spec's reason; `ORGANISATION_EXPORT_FORMAT.md` to `2.4`
  with the "Changes since" entry from spec §4.6. Same PR as M2-T2 (the census refuses the schema without
  it).
- **Complexity:** S
- **Dependencies:** M2-T2
- **Risks:** another change takes `2.4` first → take the next minor at merge.
- **Testing:** `export-census.structural.spec.ts`; the registry-vs-document test; an export e2e row shows
  the values.
- **Development steps:**
  1. Registry, format document, README text if it lists columns.
  2. Changeset (api, minor: export format change).

---

### Milestone M3: the boot service, dormant

**Outcome:** `CrossPlanInstantRederiveService` exists, tested, keyed on a marker name whose migration
does not exist yet, so it admits no plan (fail-closed, `docs/DATABASE.md:2145-2146`).
**Entry point:** Ships dark: no marker row, no plan pending.

#### Feature: boot recalculation of linked plans (CQ-2)

> **Description:** spec D-5. If CQ-2 answers "no", this milestone is dropped and M4 ships without a
> marker; the changeset then says linked plans correct at their next recalculation.
> **Complexity:** M
> **Dependencies:** M2 (the columns it fills)
> **Risks:** see task.
> **Testing requirements:** FC-9.

##### Task M3-T1: the service (≈ one PR)

- **Description:** shaped like `MilestoneRederiveService`: scalar-subquery marker, pending = live plan
  with a data date, endpoint of a live cross-plan link in either direction, `schedule_computed_at` before
  the marker; group by organisation; `orderPlansUpstreamFirst` over each whole organisation graph,
  recalculating only pending plans; one plan lock per transaction; four log events
  (`schedule.xplan_instants_rederived`, `…_plan_failed`, `…_org_failed`, `…_failed`). Registered at
  bootstrap, unawaited.
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** ordering only the pending set (ADR-0161 D8's first, wrong design) → order the whole graph;
  the e2e creates plans downstream-first so UUID v7 ids sort against the chain, and is verified red with
  the order reversed and with ordering by plan id. Five near-identical services → accepted for now;
  extracting a shared base is a refactor for its own PR, not this one.
- **Testing:** unit (pending-set boundary, each clause red-verified); API e2e with a three-plan chain
  and an inserted marker row; the four events.
- **Development steps:**
  1. Service + module registration.
  2. Tests, with the marker row inserted by the test.
  3. `docs/DATABASE.md` "Re-derivation markers" table gains the row, marked "marker lands in M4".

---

### Milestone M4: switch the read on

**Outcome:** linked plans read the stored instants; the five cases (and sub-day under CQ-1 = B) equal
one plan in the product. At the first start after the release, linked plans are recalculated once.
**Entry point:** none new (declared above). The changed dates appear on the existing canvas, Gantt,
activity panel and cross-plan list.
**Journey:** API e2e FC-6 (two real plans via REST), in place of a Playwright step, because no surface
is added.

#### Feature: repository + service read, marker

> **Description:** spec D-3, D-4, D-6 in production, plus D-DB-4.
> **Complexity:** S
> **Dependencies:** M1, M2, M3
> **Risks:** see task.
> **Testing requirements:** FC-5, FC-6, FC-8, FC-10 (query counts).

##### Task M4-T1: read the instants (≈ one PR)

- **Description:** both repository loads select the remote instants and the remote plan's freshness
  marker in the existing include; the service maps them to absolute minutes, passes `null` where the
  marker does not match (D-4) or the value is null, and logs `remoteInstantMissingCount` when non-zero.
  Add the comment-only marker migration (D-DB-4). Rollback step in `docs/DEPLOYMENT.md`: delete the
  marker row (ADR-0207 D6); D-4 makes the columns safe without further action.
- **Complexity:** S
- **Dependencies:** M3-T1
- **Risks:** an extra query per edge → selected in the existing include; FC-10 asserts equal query
  counts at 10 and 100 links. A stale instant read after a rollback → FC-8 e2e simulates an older
  image's write (dates updated, instants untouched, stamp not advanced) and asserts the date is read.
- **Testing:** FC-6 (start milestone on the weekend calendar `M → K`; finish milestone on the plan
  calendar `W → M`; each red with the read forced off); FC-8; FC-5 regression (an upstream with null
  instants gives today's downstream dates); boot service e2e now driven by the real marker; the
  structural basis spec passes for the repository producer.
- **Development steps:**
  1. Repository selects; service mapping, D-4 check, D-6 log.
  2. Marker migration; `docs/DATABASE.md` row finalised.
  3. Changeset (api, patch or minor per `docs/DEPLOYMENT.md` convention), worded for a planner: "Linked
     plans that meet at a milestone next to weekend work, or (CQ-1 = B) at work finishing mid-day, now
     give the dates the same logic gives in one plan. Some downstream dates move earlier and some
     upstream work regains float. Linked plans are recalculated once when the update starts."

---

### Milestone M5: close

**Outcome:** the register, ADRs and docs say what is true.
**Entry point:** Ships dark: documentation only.

##### Task M5-T1: documentation and register (≈ one PR)

- **Description:** ADR-0212 to `Accepted` with a verification ledger (each mutation and the test it
  turned red); ADR-0161's parity-domain bullet(s) note "closed by ADR-0212" (amendment line in its header
  and in CLAUDE.md §16's ADR-0161 entry); `docs/API.md:559` reworded; the derivation's docblock
  (`cross-plan-derivation.ts:54-57`) reworded to the new domain; `TECH_DEBT.md` #565 closed with the
  third shape recorded as by design, and the stale "twenty" corrected; **#571 filed** from spec §4.11;
  spec and plan headers to `Accepted — shipped (ADR-0212)`. Run the specialised reviews below before
  merging M4, not here.
- **Complexity:** S
- **Dependencies:** M4 released and the boot log read on the owner's host (`schedule.xplan_instants_rederived`
  with its `pending` and `recalculated` counts recorded in `docs/DECISIONS.md`).
- **Risks:** a register line left stale (ADR-0076 Class 1) → `pnpm prepush` runs `check:adr-coverage`,
  `check:spec-status`, `check:debt-status`, `check:counts`.
- **Testing:** the gates.

## Sequencing & slices

1. **M0** (measure, predict) → **M1** (three small PRs, pure code, no production change) → **M2** (DBA
   design, then one PR: schema, write, export) → **M3** (dormant service) → **M4** (the switch, the only
   PR that changes linked dates) → **M5** (close).
2. Rollback at any point is a commit boundary. Before M4 nothing reads the columns. After M4 a rollback
   deletes the marker row; D-4 stops stale instants being read with no operator step.
3. No feature flag (ADR-0088 D1): no web change, and a build-time flag is not a rollback.

## Specialised agents

- **database-architect**: M2-T1, mandatory; re-run if empty.
- **backend-performance-reviewer**: M2-T2 (write cost), M4-T1 (query count).
- **security-reviewer**: M4-T1 (the widened cross-org-safe loads), M2-T3 (export).
- **api-reviewer**: M2-T3 (format change), M4-T1 (confirms no response change).
- **test-engineer**: M1-T3 and M4-T1 (red-first verification of every flipped case).
- **devops-reviewer**: M4-T1 (marker migration, rollback step).
- No ui-architect, component, accessibility or ux review: no web change.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in
[`docs/PROCESS.md`](../../PROCESS.md) (code, tests, docs, security, performance, accessibility, Docker
build, CI, changelog, version impact), with `pnpm prepush` run, plus `scripts/e2e-local.sh api` for every
PR that touches `apps/api` (all of M1–M4).

## Risks & assumptions (rollup)

| Risk / assumption                                                                                 | Likelihood | Impact | Mitigation                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| An edited test value hides a behaviour change in M1-T1                                            | low        | high   | Shapes-only diff; FC-4 comparison over all engine fixtures; reviewer reads the diff for changed expectations. |
| Stale instants read after a rollback                                                              | low        | high   | D-4 freshness marker; FC-8.                                                                                   |
| The instant and the date disagree for a finish milestone whose late date is clamped (`lateDayOf`) | certain    | low    | Intended: the instant is what one plan reads. Stated in the schema comment and spec edge cases.               |
| CQ-1 = B moves dates on linked plans with sub-day upstreams that nobody reported                  | med        | med    | Moves only toward one plan's answer, never later; M0 prediction; changeset says it plainly.                   |
| Boot recalculation surprises a planner holding the pen                                            | low        | low    | Fourth use of the pattern; changeset says it; dates move only toward one plan.                                |
| `writeResults` slows on large plans                                                               | low        | low    | FC-10, same-sitting measurement.                                                                              |
| Export format number collides with a parallel change                                              | med        | low    | Take the next minor at merge.                                                                                 |
| Deployed population of linked plans is unknown (the seed catalogue cannot hold cross-plan links)  | certain    | low    | The boot log's `pending`/`recalculated` counts are the first measurement; recorded at M5.                     |
| A downstream reads dates for an upstream not yet recalculated since the release                   | low        | low    | No worse than today; row #571 with a logged trigger (D-6).                                                    |
