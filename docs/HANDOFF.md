# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-29, after `api-v0.79.0` / `web-v0.153.0` (PR #721, release #722).

## Where things stand

- `main` is released and published; the working branch `claude/schedulepoint-project-setup-naacjj`
  is reset onto it.
- The eight-row batch (#356, #359, #396, #357, #99, #353, #334 M1, #248) shipped. #334 stays open
  for M2/M3.
- Model routing is now pinned in `.claude/agents/`: use **builder** (Sonnet) for implementation,
  **explorer** (Haiku) for search. Never send implementation to `general-purpose`.
- The reconciliation pass is **due** (advisory `check:reconcile-due`: 9 ADRs since 2026-09-23,
  threshold 8). Run it in a planning stretch, not mid-build.

## Next batch — approved by the product owner, 2026-09-29

Run the rows below as one batch on **builder** agents, then #334 M2. The decisions below are made;
the builder must not reopen them.

| Row          | Decision                                                                                                                                                                                                    | Spec needed?                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#402**     | Thread the resolved `barDateSource` into `TsldPanel.tsx`'s `rowTextById` `describeActivity` call and its memo deps, so the Late overlay's sentences read late dates.                                        | No — register row.                                                                                                                                                     |
| **#404**     | "Project finish" states the **placed** finish (max drawn finish), on the member summary and the guest view alike.                                                                                           | No — register row; cite ADR-0148.                                                                                                                                      |
| **#405 (a)** | Revision comparison: `REDATED` and the ghosts compare **placed** spans; baselines captured before placement (`placementSnapshotLevel: NONE`) fall back to earliest-vs-earliest, as #359 did.                | No — completes #359 / ADR-0025 Am. 3.                                                                                                                                  |
| **#405 (b)** | Landing "where each programme stands": the baseline's placed finish against today's placed finish, same fallback.                                                                                           | No — same rule.                                                                                                                                                        |
| **#405 (c)** | Earned Value planned value phased on **placed** dates.                                                                                                                                                      | **Yes.** It changes PV, SPI and every EV figure on a placed plan — write a short spec (feature-analyst, Opus) and amend ADR-0042/0044 **before** a builder touches it. |
| **#407**     | Map the body parser's `PayloadTooLarge` to **413** with the envelope, and raise the body limit on **authenticated** routes only (sized for 2,000 items, ~256 KB); keep 64 KB on the unauthenticated routes. | No, but **security-reviewer is mandatory** before merge.                                                                                                               |

## Builder briefs

Written 2026-09-29 by the planning session. Every file:line below was **read** against `53b4cbe`
(§19.11), and where the register row was wrong or incomplete the brief says so. Rules for every
brief:

- **Red first.** Write the regression test, run it, see it fail for the stated reason, then fix.
  Report the red run's output.
- **Run `pnpm prepush`** in the builder's own tree before reporting. Builders never run Playwright
  or `scripts/e2e-local.sh`; the orchestrator runs the journeys named under each brief.
- **Close the register row** in `docs/TECH_DEBT.md` in the same commit (Status → closed, with the
  commit and the test that proves it). For #405, close it only when (a), (b) **and** (c) have landed;
  until then, mark each part closed inside the row.
- **Changeset**: one per brief, `patch` unless stated.
- **Stop and report** (don't improvise) on: a schema change, a new user-facing entry point, a public
  DTO field that did not exist before (except where the brief allows one), or any finding that
  contradicts the brief.

### #402 — the Late overlay's spoken sentences read late dates (web, S)

- **Correction to the row.** The `describeActivity` call is not in `rowTextById` itself but in the
  `optionDescriptions` memo it consumes: `apps/web/src/features/tsld/components/TsldPanel.tsx:1167-1180`
  (deps `[activities, renderActivities, viewToggles.activityCodes]`). `rowTextById` (`:1461`) reads
  `optionDescriptions.get(a.id)`.
- **Behaviour.** Pass `barDateSource` (the prop, `:659`, resolved by the host via
  `barDateSourceFor(lateOverlayActive)` at `plan-workspace-toolbar.tsx:488`) into that
  `describeActivity(a, { … })` call and add it to the memo's deps. `a11y.ts:124-166` already accepts
  `barDateSource` and defaults to `'visual'`; note the panel's own default is `'early'` (`:659`), so
  after the fix a host that passes nothing is spoken on early dates — state in the commit that
  every production host passes it explicitly (the toolbar and `GuestPlanView.tsx:267`).
- **Red test.** In `TsldPanel.a11y.test.tsx` (or a new `TsldPanel.late-speech.test.tsx`): render with
  an activity whose `visualEffectiveStart` differs from `lateStart`, `barDateSource: 'late'`; assert
  the option's accessible text carries the late date. Red today (it speaks the visual date).
- **Docs.** Register row #402 only. **Changeset:** `web` patch.
- **Journeys (orchestrator):** `e2e-float-paths`, `e2e-search-nav`.

### #404 — "Project finish" states the placed finish (api + web, S)

- **Decision (product owner):** the header states the **placed** finish, the latest drawn bar
  (ADR-0148). The row names one computation; there are **three**, and all must agree:
  1. `GET …/schedule/summary` and the guest view: `ScheduleRepository.summarise`
     (`apps/api/src/modules/schedule/schedule.repository.ts:411`, `MAX(early_finish)`), read at
     `schedule.service.ts:784` and `share-guest.service.ts:76` → `guest-plan.dto.ts:104`.
  2. The recalculation response: `schedule.service.ts:479` takes `summary.projectFinish` from the
     **engine** (`engine/compute.ts:629`).
- **Behaviour.** Placed finish = `MAX(COALESCE(visual_effective_finish, early_finish))` (both are
  `@db.Date`, `schema.prisma:1223` and `:1310`). Change (1)'s SQL; for (2), derive the reported
  figure from the same rule over the engine results the service already holds — **do not change the
  engine's own `projectFinish`**: it anchors the backward pass and LONGEST_PATH criticality
  (`compute.ts:401-461`), and the ADR-0034 conformance matrix depends on it. Leave
  `leveledProjectFinish` alone. Check `compute-health.ts` and `baselines.service.ts:150`
  (`latestFinish`, the capture) do **not** read the changed value — health stays network-basis
  (the row's own exclusion) and `capturedProjectFinish` stays the early finish (#405 (b) reads the
  placed side from the snapshot instead).
- **Red tests.** An API e2e on a plan with a bar placed after the network's finish (the seed
  `plan:capability-placements`, `PL_DRIFT`/`PL_SLACK`, or a hand-built fixture in the spec file):
  summary, guest view and recalculation response all report the placed finish. Red today. Plus a
  unit test that an **unplaced** plan's figure is unchanged.
- **Docs.** `docs/API.md` wording for `projectFinish` (placed, ADR-0148); the DTO's
  `@ApiProperty` description (`plan-schedule-summary.dto.ts`, `guest-plan.dto.ts`); cite ADR-0148 in
  the register close. Any web copy that calls it the "network" or "calculated" finish (check
  `ProjectFinishChip.tsx`, `plan-facts.tsx`). **Changeset:** `api` patch (+ `web` patch only if copy
  changes).
- **Journeys:** `e2e-share`, `e2e-workspace-chrome`, `web` (base journey), `e2e-programme`.
- **Reviewers:** api-reviewer (description change on a public field).

### #405 (a) — revision comparison compares placed spans (api, M)

- **Where.** `apps/api/src/modules/baselines/revision-projections.ts:94-137`: both
  `frozenRevisionSide` (reads `baselineStart/Finish`) and `liveRevisionSide` (reads
  `earlyStart/Finish`) project network dates into `RevisionRow.earlyStart/earlyFinish`, which feed
  the delta, `REDATED` (`revision-changes.ts:175,214,445`) and the ghosts
  (`revision-ghosts.ts:107-144`).
- **Behaviour.** Choose the basis **once per read** from the existing `bothPlacementSnapshotted`
  (`schedule.service.ts:2001-2003`, and the second comparison path at `:2545`): `FULL` on every
  frozen side → frozen `placedStart/placedFinish` against live `visualEffectiveStart/Finish`;
  otherwise earliest-vs-earliest, exactly as variance does (`baselines.service.ts:419,465-472`).
  Never per row. Extend the frozen/live row inputs and their loaders to carry the placed columns.
  Rename `RevisionRow.earlyStart/earlyFinish` to basis-neutral names **internally** if that keeps
  it honest; if the **public response** names the fields `early*`, do not put placed dates in them
  silently — mirror the variance response's basis field (`baseline-variance-response.dto.ts:93`,
  `'PLACED' | 'NETWORK'`). That additive field is allowed by this brief. Criticality and float stay
  network (they are network quantities).
- **Red tests.** Unit on the projections (FULL → placed, NONE → early, mixed pair → early); an
  API e2e where a bar is moved by placement only (network dates unchanged): `REDATED` appears and
  the ghost sits at the old **placed** span. Red today. Existing revision suites stay green.
- **Docs.** ADR-0025 Amendment 3 gains a line saying the revision comparison now follows it;
  `docs/API.md` for the basis field; `docs/specs/one-planning-surface/m-c/placement-snapshot.md`'s
  expectation that `REDATED` moves to placed is now met — say so there. **Changeset:** `api` minor
  if a response field is added, else patch.
- **Journeys:** `e2e-revision-compare` (both specs).
- **Reviewers:** api-reviewer; backend-performance-reviewer (wider row loads).

### #405 (b) — the landing's standing compares placed finishes (api, S–M)

- **Where.** `apps/api/src/modules/overview/overview.repository.ts:282-311`:
  `captured_project_finish` against `MAX(act.early_finish)`, consumed by `plan-standing.ts:62-73`.
- **Behaviour.** Live side: the #404 expression, `MAX(COALESCE(visual_effective_finish,
early_finish))` — share one definition with #404, do not write it twice (`overview.repository.ts:222`
  already promises it reads columns "exactly as `summarise` reads them"). Baseline side: on a
  `FULL` baseline, the maximum `placed_finish` of its snapshot rows; on `NONE`, today's
  `captured_project_finish` vs `MAX(early_finish)`. **Do not change `captured_project_finish`** —
  DCMA's target reads it (`compute-health.ts:577`).
- **Cost — the one thing to stop on.** The docblock at `:216-220` records that this query
  deliberately never reads `baseline_activities`. A lateral `MAX(placed_finish)` for the one active
  baseline per plan is acceptable **only** if an index on the snapshot's baseline id serves it:
  show `EXPLAIN (ANALYZE)` on the `scale-2000` seed. If it needs a new index or a denormalised
  `captured_placed_finish` column, **stop**: that is a schema change for the database-architect,
  and the orchestrator decides.
- **Red tests.** An API e2e: a plan whose placed finish moved while its network finish did not
  reports movement on the landing; a `NONE` baseline is unchanged. Red today.
- **Docs.** Update the `:216-220` docblock; `docs/API.md` if it describes the basis.
  **Changeset:** `api` patch.
- **Journeys:** `e2e-overview`, `e2e-page-composition`.
- **Reviewers:** backend-performance-reviewer (mandatory — this is the landing's one query).

### #407 — the body cap: 413 with the envelope, and room for 2,000 items (api, S)

- **Where.** `apps/api/src/app-setup.ts:66-73`: one `json({ limit: '64kb' })` for every route.
  Better Auth is mounted **before** it (`:52`) and terminates, so auth routes never reach it.
  `AllExceptionsFilter.mapException` (`common/filters/all-exceptions.filter.ts:70-94`) maps anything
  that is not a `DomainError`, Prisma error or `HttpException` to opaque 500 — the body parser's
  error (`type: 'entity.too.large'`, `status: 413`) is neither. `statusCode()` already has
  `PAYLOAD_TOO_LARGE` (`:155`).
- **The row misses one endpoint.** Four DTOs declare `@ArrayMaxSize(2000)`, not three:
  `update-positions`, `update-placements`, `update-parents` **and** `bulk-delete-activities`
  (all on `plan-activities.controller.ts`: `PATCH positions` `:97`, `PATCH placements` `:129`,
  `POST bulk-delete` `:170`, `PATCH parents` `:251`).
- **Decision (product owner):** map the parser's error to **413** with the standard `{ error }`
  envelope, code `PAYLOAD_TOO_LARGE`; raise the limit on **authenticated** routes only, sized for
  2,000 items (~256 KB); keep 64 KB on unauthenticated ones.
- **Behaviour.** The parser runs before guards, so "authenticated" must be decided by **path**. The
  unauthenticated Nest routes are the `@Public()` ones: `csp-report`, `share` (guest),
  `invitations/preview`, `health`, `version`. Recommended shape: mount a `json({ limit: '256kb' })`
  scoped to the org-scoped prefix (`/api/v1/organizations/…`, every route of which is behind the
  session guard — **verify** no `@Public()` handler lives under it) before the global 64 KB parser
  (a parsed body is skipped by the second parser). Measure the real size of 2,000 items on the
  largest of the four DTOs (placements) and size the limit from that, not from the row's ~114 KB
  per 1,000 on `parents`. Map the 413 in the filter by recognising the parser's error shape
  narrowly (`type === 'entity.too.large'`), not by trusting any `status` property on an unknown
  error.
- **Red tests.** API e2e: `PATCH …/activities/parents` with 2,000 items → 200 (red today: 500); a
  body over the new cap on that route → 413 with the envelope; a 100 KB body to `POST
/api/v1/csp-report` and to `POST /api/v1/invitations/preview` → 413 (the 64 KB cap still holds
  there; the guest `share` controller has no body-carrying route). Unit test in
  `all-exceptions.filter.spec.ts` for the mapping.
- **Seed catalogue.** There is no workaround to remove: `packages/seed-http/src/runner.ts:347-363`
  sends parentage as one batch and records the failure as a `wbs-parents` finding. After the fix
  that finding must disappear for `scale-2000`; say so in the register close.
- **Docs.** `docs/API.md` (413 and the limits), `docs/SECURITY_STANDARDS.md` if it states the body
  cap; `@ApiPayloadTooLargeResponse` on the four batch handlers. **Changeset:** `api` patch.
- **Journeys:** `scripts/e2e-local.sh api`, `e2e-csp`, `e2e-share`.
- **Reviewers:** **security-reviewer is mandatory before merge** (a request-size limit on the
  attack surface); api-reviewer.

### #405 (c) — Earned Value planned value on the placed basis (api, M)

- **Approved spec and plan:** `docs/specs/ev-placed-planned-value/spec.md` and `plan.md` (product
  owner, 2026-09-29, both defaults). Build **M1 exactly as the plan's tasks T1–T4 state**; the spec
  is the brief, and this entry only adds what the orchestrator needs.
- **Checked here:** `engine/earned-value.ts:577-579` (frozen early dates when the baseline row has
  both, else live early), `:292-296` (`CPI_TIMES_SPI` is the only EAC method that reads SPI).
- **Shape.** Basis chosen once per read in the service from `placementSnapshotLevel` (exhaustive
  switch, as `baselines.service.ts:465-472`): `FULL` or no baseline → placed; `NONE` → early. The
  engine's maths does not change; only its live field names do. No schema change, no response field,
  no flag.
- **Red first:** E1 (`FULL` baseline) and E3 (no baseline) in `schedule.e2e-spec.ts`, U1/U2 unit;
  **record E4's golden against today's code before changing anything** (the unplaced-plan
  byte-identity proof), and E2 as characterisation. Existing `earned-value.spec.ts` passes with no
  assertion edited.
- **Docs (T4):** mark the ADR-0042 and ADR-0044 amendments Accepted and add the spec link (allowed
  now the spec is Approved); ADR-0035 §29/§32; `docs/API.md`; the `pv` OpenAPI description; the
  three corrections in spec §0 at close-out. Close #405 when (a), (b) and (c) have all landed.
  **Changeset:** `api` minor.
- **Journeys:** the new step in `apps/web/e2e/baselines.spec.ts` (base `web` target), plus
  `e2e-revision-compare` is unaffected but runs in the sweep.
- **Reviewers:** api-reviewer and test-engineer (the latter confirms E4 was recorded before the
  change).

Then **#334 M2** (render isolation), from its approved plan in `docs/specs/activities-panel-scale/`.
**M3** (windowing) needs an ADR and CQ-B, a product-owner decision, before it starts.

## Model switch points

1. Start the next session on **Opus**: write the #405 (c) spec and ADR amendment, and brief the
   builders.
2. Once the builders are briefed, switch to **Sonnet** (`/model`) for build, reviews, sweep and
   release.
3. Switch back to **Opus** for #334 M3's ADR or an unexpected gate failure.

## Environment notes a new session would otherwise rediscover

- **The container's `/tmp` fills with per-run build caches** (random 20-character directories
  holding `client/`). At 93% disk, Chromium failed with `net::ERR_INSUFFICIENT_RESOURCES` and four
  journeys rendered blank pages. Check `df -h /` before a sweep, and clear those directories if
  it is above ~85%.
- **`e2e-library` fails locally** on a strict-mode `getByText('Crew A')` (the assignment row and
  the picker's shown value), and passes in CI on the same head. It is an environment difference,
  not a regression.
- Agents must not run Playwright or `scripts/e2e-local.sh`: they share one database and fixed
  ports. The orchestrator runs `scripts/e2e-sweep.sh` centrally.
- Release: merge the Version Packages PR despite its `action_required` checks (`CLAUDE.md` §11),
  then confirm the `api-v*` / `web-v*` tags and the Release run's two publish jobs.
