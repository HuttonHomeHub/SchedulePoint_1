# Implementation Plan: Revision Compare across two imported revisions

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — **not yet approved**
- **Status:** Draft — awaiting approval
- **Owner:** _(assigned on approval)_

## Breakdown

```mermaid
flowchart LR
  E["Epic: cross-plan revision compare"] --> M0["M0 — Measure, decide<br/>(dark)"]
  E --> M1["M1 — Correlation + route<br/>(dark)"]
  E --> M2["M2 — The panel<br/>(FIRST user-facing · journey)"]
  E --> M3["M3 — The handover artefact"]
  E --> M4["M4 — The diagram overlay<br/>(own decision + own condition)"]
  E --> M5["M5 — The gate pass"]
  M0 --> M1 --> M2 --> M3 --> M4 --> M5
```

### Epic

**Cross-plan revision compare** — let a planner compare two _imported_ revisions of one programme,
which land as two plans (ADR-0050), by correlating on `activities.code` and showing the match before
anything derived from it. Maps to `docs/BACKLOG.md`'s `M` **"Revision Compare — comparing two
IMPORTED revisions"**, the half the three shipped tiers cannot do.

### Standing rules for every task in this plan

These are repeated here rather than assumed, because each has been got wrong in this repository at
least once.

1. **No schema change is planned (spec §3.1). If a task finds it needs a model, a column, an index,
   a constraint or a data migration, that task STOPS and `database-architect` runs first** — without
   exception, and without self-assessing whether the change is big enough to need it (CLAUDE.md
   §19.3). An unavailable or empty agent is a reason to wait, never to proceed.
2. **No `VITE_` flag.** ADR-0088 D1: a `VITE_` constant is inlined at build time, `docker-publish.yml`
   passes none, and it has never been an operator rollback. The rollback contract is the **commit
   boundary**, and each milestone lands as a revertible commit.
3. **Every decision-bearing claim names its evidence** — the command, the file and line, or the test
   (ADR-0076, `docs/PROCESS.md`). A claim inherited from the spec is checked like any other; §0 of
   the spec exists because one inherited claim was false.
4. **Re-verify the PROBLEM, not only the design** (CLAUDE.md §19). A milestone that fixes something
   does not go back and edit the document that complained about it. Before starting each milestone,
   re-read its problem statement against the code.
5. **A gate is finished when it has been made to fail by the defect it names** (ADR-0110 D5), not
   when it passes. Every structural test in this plan is verified **red first**, and the plan says
   against what.
6. **Run the pre-push gate** — `pnpm prepush`, plus `scripts/e2e-local.sh api` for any `apps/api`
   change and `scripts/e2e-local.sh web:<suite>` for any changed journey. CI is the second opinion.
7. **Approved work runs to completion** (`docs/PROCESS.md`, CLAUDE.md §19.12). Finishing a milestone
   is not finishing the epic; the next slice starts in the same turn.

---

## Milestone M0 — Measure the identity model, and the cost (ships dark)

**Outcome:** two numbers, each judged against a condition committed **before** the harness ran, that
decide whether the design in the spec survives contact.
**Ships dark:** `Nothing is reachable. This milestone adds two scripts under
docs/specs/revision-compare-imported/ and an API e2e probe; no route, no UI. M2 surfaces the
capability.`
**Journey:** none — nothing is user-facing (ADR-0081's second state, declared rather than omitted).

#### Feature: the falsification conditions and the two probes

> **Description:** commit `m0-condition.md`; then measure correlation coverage and route cost.
> **Complexity:** M
> **Dependencies:** none — every prerequisite is landed (spec §3.2)
> **Risks:** a harness that returns a verdict it cannot support → it **throws** when either side is
> empty or the two sides are identical (ADR-0097 Landing C's `PROCEED` from an `undefined`;
> ADR-0066's 4.6 ms figure that was really about the cull).
> **Testing requirements:** the probes are the test; each records its environment, and a disqualified
> environment is recorded as such rather than averaged (ADR-0127 D8).

##### Task M0-T1 — Commit the conditions, in their own commit

- **Description:** write `m0-condition.md` with P1 (coverage ≥ 95 %) and P2 (p95 ≤ 250 ms at 2,000
  activities per side), each with its verdict rule and its non-vacuity control, and commit it
  **before** any harness exists.
- **Complexity:** S
- **Dependencies:** —
- **Risks:** conditions written after seeing the numbers are not conditions → separate commit, and
  the plan says so.
- **Testing:** n/a (a document).
- **Development steps:**
  1. State P1: on a pair differing only in dates, logic and added/removed work, ≥ 95 % of the smaller
     side's **coded** activities correlate. Below ⇒ the identity model is wrong and CQ-2 reopens.
  2. State P2: p95 ≤ 250 ms end-to-end, the bar ADR-0125 committed and met at 65.8 ms for one side.
     Verdict rule: inside ⇒ the global rate budget stands; materially above ⇒ derive a dedicated
     budget by ADR-0116 M6's `clamp(floor(12_000 / p95), 3, 20)`.
  3. State both non-vacuity controls: the two sides must genuinely differ (P1) and be non-empty (P2);
     the harness **throws** otherwise.
  4. Record the environment and what would disqualify it.

##### Task M0-T2 — Probe P1: does the code key actually match?

- **Description:** an API e2e probe that imports two XER files representing Rev B and Rev C of one
  programme into **one project**, then reports the correlation counts.
- **Complexity:** M
- **Dependencies:** M0-T1
- **Risks:** a fixture that matches perfectly because it was written to → the two files are generated
  from one source with **stated, listed** edits (three dated moves, one added activity, one removed,
  one re-logicked, one re-durationed), and the probe asserts each edit is visible in the result.
- **Testing:** the probe is the test; it lands under `apps/api/test/` beside
  `interchange.e2e-spec.ts`.
- **Development steps:**
  1. Build the two fixtures inline, reusing `interchange.e2e-spec.ts:76`'s
     `xerWithCalendar(projectName)` precedent — verified: that helper exists precisely so two files
     can be imported into one project.
  2. Import both through the real REST commit path (never a direct DB write — ADR-0066's rule that
     building the input from persisted rows lets the comparison agree with itself).
  3. Read both plans' activities through the public API and correlate on `code` in the probe.
  4. Report matched / fromUnmatched / toUnmatched / uncoded; judge against P1; record.
  5. **Additionally record how many codes are XER `task_code` and how many are the `task_id`
     fallback** (`xer-adapter.ts:541-551`) — the fallback's stability across two exports is the
     spec's risk R2 and nobody has measured it.

##### Task M0-T3 — Probe P2: what does the route cost?

- **Description:** measure the correlate-and-compare path at 2,000 activities per side.
- **Complexity:** M
- **Dependencies:** M0-T1
- **Risks:** measuring the service before the route exists measures the wrong thing → the probe calls
  the **service method** and the figure is re-derived end-to-end in M1-T4 against the shipped route,
  with both numbers recorded and any divergence stated rather than smoothed (ADR-0125's F3 lesson: a
  second run agreeing to the decimal is more suspicious than one that does not).
- **Testing:** the probe is the test.
- **Development steps:**
  1. Reuse `packages/interchange/scripts/generate-scale-xer.mjs` to build two 2,000-activity sides.
  2. Time the full path: two plan resolutions, both sides' reads, the correlation, the delta and the
     classifier with `?include=changes`.
  3. Judge against P2; record; state the environment.

##### Task M0-T4 — Amend the stale backlog paragraph

- **Description:** `docs/BACKLOG.md:136-141` says a headed paint measurement is owed before any of
  this work. It was taken on 2026-09-08 (ADR-0127 D8a) and the default was flipped (D8b).
- **Complexity:** S
- **Dependencies:** —
- **Risks:** none.
- **Testing:** `pnpm check:doc-links`.
- **Development steps:**
  1. Replace the paragraph with the D8a/D8b outcome, keeping **both** of its stated limits — one
     framing, one machine, Fit ungraded (`docs/TECH_DEBT.md` #260).
  2. Correct the entry's `activity_code` to `code`, and record §0.1's finding that the index the
     entry's premise depends on **does** exist.

---

## Milestone M1 — The correlation model and the cross-plan route (ships dark)

**Outcome:** `GET …/organizations/:orgSlug/cross-plan-revision-compare` answers correctly, with
uniform 404s, the same-plan refusal and the `NO_COMMON_CODES` reason.
**Ships dark:** `No UI reaches this route. The client is unchanged and the shipped plan-nested route
is byte-identical. M2 adds the Compare with picker that calls it.`
**Journey:** none — declared dark. The journey lands in M2, which is the **first user-facing**
milestone (ADR-0081 §2).

#### Feature: `revision-correlate.ts` and the org-scoped route

> **Description:** a pure correlation module + a controller + a service method, reusing the three
> pure functions **unmodified**.
> **Complexity:** L
> **Dependencies:** M0 (P1 must pass, or the identity model changes)
> **Risks:** see per-task.
> **Testing requirements:** unit (the pure module), API e2e (authz, 404 uniformity, both refusals,
> every `include`), three structural gates, and the existing pure suites passing **unchanged** as the
> before/after oracle.

##### Task M1-T1 — The pure correlation module

- **Description:** `apps/api/src/modules/baselines/revision-correlate.ts` — `correlateByCode` and
  `correlateEdges`, projecting both sides into the existing `RevisionRow` / `RevisionEdge` shapes with
  the correlation key in the slot the pure functions already correlate on.
- **Complexity:** M
- **Dependencies:** M0
- **Risks:**
  - _Case-folding creeps in as a "robustness" improvement_ → a unit case asserts `EXC-100` and
    `exc-100` correlate as **two** keys, with the reason (`uq_activities_plan_code` is a
    case-sensitive btree) in the test's own name.
  - _An uncoded row is silently dropped_ → a case asserts it appears in `uncoded` and in **neither**
    `added` nor `removed`.
  - _The edge key collides_ → a case pins `(predCode, succCode, type)`, citing
    `uq_dependencies_pred_succ_type` (migration `:67`) as why it is a natural key per side.
- **Testing:** `revision-correlate.spec.ts` — the five contract clauses (spec §2.4 D1a–D1e), each as
  a named case.
- **Development steps:**
  1. Write the module, named `revision-*` **deliberately**, so `revision-sources.ts:44-48` puts it
     inside both existing structural gates with no roster edit.
  2. Prove that: add a scratch `import { computeSchedule } …`, run
     `revision-delta-engine-free.structural.spec.ts`, **watch it go red**, remove it. Record the red
     output in the PR description.
  3. Do the same for the no-cause gate with a scratch `cause` field.
  4. Write the five contract cases.
  5. Assert the existing `revision-delta.spec.ts` / `revision-changes.spec.ts` /
     `revision-ghosts.spec.ts` pass **unchanged** — the reuse claim's oracle.

##### Task M1-T2 — The index guard

- **Description:** a structural case asserting `uq_activities_plan_code` exists with its exact partial
  predicate, so a future migration relaxing it turns this feature red rather than silently giving the
  correlation two rows for one key.
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** _the test asserts the migration text and passes against a later `DROP INDEX`_ → it
  queries `pg_indexes` on a **real database** in the API e2e tier, not the migration file. Both the
  index name and the `WHERE` clause are asserted.
- **Testing:** the case itself, **verified red** against a fabricated relaxed definition applied in a
  scratch transaction.
- **Development steps:**
  1. Query `pg_indexes` for `uq_activities_plan_code`; assert `indexdef` contains
     `UNIQUE`, `(plan_id, code)` and `WHERE ((deleted_at IS NULL) AND (code IS NOT NULL))`.
  2. Verify red by dropping and recreating it non-uniquely inside a rolled-back transaction.
  3. Docblock: this is what lets §2.4 D1c be a _test_ rather than a branch — spec §0.1.

##### Task M1-T3 — The service method

- **Description:** `ScheduleService.crossPlanRevisionCompare`, a sibling of `revisionCompare`
  (`schedule.service.ts:1449`), reusing its projections and its honesty properties.
- **Complexity:** L
- **Dependencies:** M1-T1
- **Risks:**
  - _A second projection assembly drifts from the shipped one_ → the frozen/live projections are
    **extracted** and shared, not copied; a structural test asserts one definition. This is the
    ADR-0065 `routeOrthogonal` argument, and ADR-0125's own M8 review found the shipped method
    projecting the same array three times.
  - _`existsLive` inherits the wrong meaning_ → it is answered **at the server, per row**, from the
    **anchor** plan's id set (ADR-0126 D9), with a case asserting a row present only in the other
    plan gets `activityId: null`.
  - _The same-plan check runs after the revision check_ → ordering asserted; the same-plan 422 comes
    first, because a same-plan pair is the wrong question whatever revisions it names.
- **Testing:** `schedule.service.spec.ts` additions; the API e2e in M1-T4.
- **Development steps:**
  1. One `resolveScope`; `assertCan('schedule:read')` **and** `assertCan('baseline:read')` — both, for
     the reason the shipped method's comment gives (`:1464-1466`).
  2. Resolve **both** plans with `findActiveByIdInOrg`; either miss ⇒ `NotFoundError('Plan not
found.')`. Resolve both in one round trip, as the shipped method does for its two baselines
     (`:1497-1502`), and for the same stated reason: either miss is the same 404, so resolving them
     together leaks nothing.
  3. `fromPlanId === toPlanId` ⇒ 422 `CROSS_PLAN_SAME_PLAN`, naming the plan-nested route.
  4. Resolve each side's revision (`live`, or `findActiveByIdInPlan` **against its own plan**) ⇒
     uniform 404.
  5. Load both sides; correlate; if `matched === 0` return the typed reason with **no** delta.
  6. Otherwise call the three pure functions unchanged; map `activityId` back to the anchor plan's
     UUIDs; assemble `correlation`, `fromPlan`, `toPlan` and `frame`.
  7. The measurement frame is the **`from` side's** calendar and factor (ADR-0125 D4), and it is
     **named in the payload** because two plans may differ.
  8. Docblock the parity sentence in ADR-0125 D1's strong form, and say explicitly that ADR-0116 D7's
     weaker sibling does **not** apply here.

##### Task M1-T4 — The controller, the DTOs and the API e2e

- **Description:** `CrossPlanRevisionCompareController` + query/response DTOs + OpenAPI + the e2e
  suite.
- **Complexity:** L
- **Dependencies:** M1-T3
- **Risks:**
  - _`?include=changes` arrives as a string, not an array_ → the shipped `@Transform(toArray)` idiom
    is reused verbatim (`revision-compare-query.dto.ts:87`). That defect shipped for one commit and
    **no unit or API test could see it**; the e2e here passes `include` in **both** shapes.
  - _A role-varying field creeps in_ → an ADR-0116 **G4-style** scan over the new DTO, banning
    cost/rate/budget-shaped key names. **Written whole-file, not line-anchored** — ADR-0116's M5 gate
    pass found the line-anchored version passing a Prettier-clean single-line object and a shorthand
    property, and that bypass is pinned as a fixture here.
  - _The shipped route changes_ → its existing e2e cases must pass **unchanged**; a diff on
    `revision-compare-query.dto.ts` or the shipped controller method is a review-blocking finding.
- **Testing:** `apps/api/test/cross-plan-revision-compare.e2e-spec.ts`.
- **Development steps:**
  1. The route at `organizations/:orgSlug/cross-plan-revision-compare`, following the ADR-0045
     precedent `docs/API.md:187-197` states explicitly.
  2. DTOs per spec §4.4; reuse the shipped `UUID_PATTERN` `Matches` idiom for the two revision params.
  3. OpenAPI: the parity sentence, the uniform-404 sentence, the two 422s, the `NO_COMMON_CODES` 200,
     and the rate-limit sentence **derived from M0-T3** rather than copied.
  4. E2e cases: a member reads it; a non-member gets 404; another org's plan gets 404 (**not 403**);
     a soft-deleted plan gets 404; a revision of the _other_ plan named on the wrong side gets 404;
     same plan gets 422; no common codes gets 200 + the reason and **no** delta; uncoded rows are
     listed and in no presence set; `include` in both wire shapes; and each `include` **alone** —
     because ADR-0126 records `?include=ghosts` alone receiving two empty edge sets and lighting
     nothing, caught by exactly this kind of case on its first run.
  5. Re-derive the M0-T3 figure end-to-end and record both, with any divergence stated.
  6. `docs/API.md`: a new sub-section beside "Cross-plan dependencies". Changeset: **minor**.

---

## Milestone M2 — The panel picks another plan (FIRST user-facing milestone)

**Outcome:** a planner compares the open plan against another plan in the same project, and sees the
match coverage before the delta.
**Entry point:** the existing **`Analysis ▾ → Compare revisions…`** (`tsld-toolbar-items.tsx:1397-1400`,
accessible name _"Compare revisions…"_), then the new **`Compare with`** `Select` at the top of the
dock. **No new dock, no new menu item, no new router route** — `right-docks.ts:14` already holds
`revisions`.
**Journey:** extend `apps/web/e2e-revision-compare/revision-compare.spec.ts` (existing config
`playwright.revision-compare.config.ts`, existing CI step, **no new config**) with a spec that seeds
two plans in one project through the API, opens the dock, chooses the other plan under **Compare
with**, and asserts the coverage line and a known non-vacuous delta.

#### Feature: the Compare with picker and the coverage block

> **Description:** one `Select`, one query branch, one new coverage component, and the omission rule
> for other-plan rows.
> **Complexity:** L
> **Dependencies:** M1
> **Risks:** see per-task.
> **Testing requirements:** unit (panel + coverage component + sentences), journey (the entry point
> and a real API), axe scan scoped by `[data-revision-compare-panel]` — the attribute that exists
> because a Playwright `:text-is()` selector is not valid CSS and axe **throws** on it
> (`RevisionComparePanel.tsx:176-181`).

##### Task M2-T1 — The `Compare with` picker

- **Description:** a `Select` above the two revision pickers, listing the other active plans in the
  same project; default **This plan**.
- **Complexity:** M
- **Dependencies:** M1
- **Risks:**
  - _The picker offers a plan the route would 404 on_ → it reads
    `GET …/projects/:projectId/plans` (`project-plans.controller.ts:36-43`), which is already
    org-scoped, and excludes the open plan.
  - _A third select breaks the 380 px dock_ → the picker is on **its own row above** the two, which
    is why the anchor model (CQ-1) is what it is: `use-revision-compare-panel-prefs.ts:14-18` records
    the min being derived from the side-picker row binding at ≈ 400 px.
  - _Loading and empty states collapse_ → "no other plans in this project" is its **own** sentence,
    distinct from "no changes" (ADR-0125's recorded distinction, and ADR-0073 C1's).
- **Testing:** panel unit cases for the four states; the journey drives the real control.
- **Development steps:**
  1. Add the `Select` with a real `Label`, a loading state and an empty state.
  2. Branch the query hook: another plan ⇒ the new route; **This plan** ⇒ the shipped one, unchanged.
  3. Both plans named in the side titles — never "from"/"to" alone.
  4. A unit case asserting **This plan** still calls the shipped route with the shipped params
     (the rollback contract, since there is no flag).

##### Task M2-T2 — The coverage block

- **Description:** `RevisionCorrelationSummary` — the matched/unmatched/uncoded counts and the
  disclosures, rendered **above** the delta.
- **Complexity:** M
- **Dependencies:** M2-T1
- **Risks:**
  - _The counts read as a client's own number_ → each capped list carries its **true total** beside
    it (ADR-0116 D4; ADR-0125's gate pass found two of four sets shipped uncapped while their
    neighbours were capped — the same rule applied to a field and not its sibling).
  - _`NO_COMMON_CODES` renders as an empty delta_ → a case asserts **no** delta and **no** change
    list render in that state, and that the sentence names both plans.
  - _The live region announces the delta before the coverage_ → the announcement states coverage
    first, matching the visual order, and fires **once per settled comparison, never per render**
    (`RevisionComparePanel.tsx:127-132`'s existing idiom, reused rather than re-derived).
- **Testing:** unit cases per state; an axe scan in the journey; a case asserting the announcement
  order.
- **Development steps:**
  1. Build the component from design-system primitives only (`NoticeStrip`, `Label`, the existing
     disclosure idiom). No one-off styling.
  2. Add the sentences to `revision-sentences.ts` — **one module**, shared with the print document,
     which is what stops the two disagreeing.
  3. Include the re-code caveat wherever added/removed render.

##### Task M2-T3 — Reveal, and the omission rule

- **Description:** rows in the anchor plan activate and announce; rows only in the other plan carry
  **no** control and a sentence naming their plan.
- **Complexity:** S
- **Dependencies:** M2-T2
- **Risks:** _the row is shaded instead of omitted_ → ADR-0082's discriminator: the action does not
  apply to the object, so it is **omitted**. A case asserts no disabled control is rendered.
- **Testing:** unit cases both ways; the journey activates one row and asserts the announcement.
- **Development steps:**
  1. Render the activation control only when `activityId !== null`.
  2. Keep the existing announce-on-activation path (`RevisionComparePanel.tsx:144-164`), whose own
     docblock records the announcement being the one line not copied from its sibling.

##### Task M2-T4 — The journey (ADR-0081 §2)

- **Description:** a spec in the **existing** `e2e-revision-compare` suite that drives the whole
  capability against a real API.
- **Complexity:** M
- **Dependencies:** M2-T3
- **Risks:**
  - _The comparison is non-vacuous by accident_ → the seed gives a **known answer**, following
    `e2e-revision-compare/support.ts:67-85`'s existing rule that a comparison of two identical
    schedules passes an "it rendered" assertion while proving nothing.
  - _Seeding through `page.evaluate` leaves the query cache stale_ → the caller reloads;
    `support.ts:81-84` records that several suites leaned on a `Recalculate` press for invalidation,
    an undocumented side effect ADR-0109 D3 removed (`docs/TECH_DEBT.md` #208).
  - _A control is located by its copy_ → locate by role + accessible name, or by
    `[data-revision-compare-panel]`; **never** by copy (every layout epic here has broken one).
- **Testing:** the journey is the test. Run it locally — `scripts/e2e-local.sh web:revision-compare`
  — before pushing, per `docs/PROCESS.md`'s completion criteria.
- **Development steps:**
  1. Seed **two** plans in one project with overlapping codes and a known difference.
  2. Open the dock via `Analysis ▾ → Compare revisions…`; choose the other plan.
  3. Assert the coverage line, the known entered/left rows, and one activation + announcement.
  4. Assert an other-plan-only row renders **no** activation control.
  5. Axe scan scoped to `[data-revision-compare-panel]`.

---

## Milestone M3 — The handover artefact

**Outcome:** the printed comparison names both plans, states the coverage and the frame, and carries
the honesty footer.
**Entry point:** the existing **`Print comparison`** button in the dock header
(`RevisionComparePanel.tsx:197-207`) — unchanged control, new content.
**Journey:** the M2 journey gains one step that presses it and asserts the document's own container
renders both plan names. (The suite exists; no new config, no new CI step.)

#### Feature: the printed cross-plan comparison

> **Description:** extend `RevisionComparePrintDocument` for the cross-plan payload.
> **Complexity:** M
> **Dependencies:** M2
> **Risks:** the asymmetry below.
> **Testing requirements:** unit snapshot; a symmetry test; the journey step.

##### Task M3-T1 — Both directions of the symmetry rule

- **Description:** the printed document states **no** fact the screen withholds and withholds **none**
  the screen states.
- **Complexity:** M
- **Dependencies:** M2
- **Risks:** _one direction is asserted and the other is not_ → both are. ADR-0125's gate pass found
  three facts printed while the screen withheld them; ADR-0106's found the inverse. A test walks the
  shared `revision-sentences.ts` and asserts both renderings consume it.
- **Testing:** the symmetry test, **verified red** by removing one sentence from one renderer.
- **Development steps:**
  1. Add both plans, both projects, the coverage, the frame and the re-code caveat.
  2. Print the correlation lists **in full** where the screen caps them — paper has no "load more"
     (ADR-0116's rule) — with the cap stated in words on screen.
  3. Write the symmetry test; verify red both ways.

---

## Milestone M4 — The diagram overlay for a cross-plan pair

**Outcome:** the compare overlay draws a cross-plan comparison, or the milestone concludes it should
not and the refusal stands permanently with its reason recorded.
**Entry point:** the existing **`View ▾ → Compare on diagram`** toggle
(`tsld-toolbar-items.tsx:276-305`).
**Journey:** the M2 suite gains an overlay step; the toggle's refusal is asserted **before** this
milestone (in M2-T1) and its acceptance after.

> **This milestone is separable and may be approved separately (CQ-3).** M1–M3 ship a complete,
> honest capability without it.

#### Feature: cross-plan ghost geometry

> **Description:** decide the lane rule, then build it — or record the refusal.
> **Complexity:** L
> **Dependencies:** M3
> **Risks:** the decision below is the milestone's whole content.
> **Testing requirements:** unit (the ghost builder's new branch), a committed falsification
> condition, a browser measurement, the journey step.

##### Task M4-T0 — Decide the lane rule, and commit a condition first

- **Description:** ADR-0127 **D2** says the ghost's lane is the **frozen** lane, never guessed —
  and cross-plan the frozen lane belongs to another plan's layout, so drawing it here is exactly the
  false statement about where the work was that D2 prevents.
- **Complexity:** M
- **Dependencies:** M3
- **Risks:** _the milestone builds before deciding_ → T0 produces a written decision and a committed
  condition, and nothing else.
- **Testing:** n/a (a decision).
- **Development steps:**
  1. Evaluate the candidate: a **matched** ghost draws in the **anchor's** lane (the ghost is about
     dates, and the lane is only load-bearing for removed work); **unmatched** work has no anchor
     lane and is counted as `ghostsUndrawable` (ADR-0127 D3 — what cannot be drawn is counted beside
     the array, never folded into a length).
  2. Write the condition **before** measuring: the overlay's cost on a cross-plan pair at 2,000
     activities per side, at **Week**, against the same 2.00 pp bar, with the machine's own baseline
     spread reported and an **INDETERMINATE** verdict available (ADR-0128).
  3. Inherit ADR-0127 D8a's two stated limits explicitly: one framing, one machine, and **Fit
     ungraded** (`docs/TECH_DEBT.md` #260 — at a 98.33 pp baseline the difference metric cannot fail).
     The Week PASS is **not** licence for an unmeasured overlay.
  4. If the candidate is rejected, the M2 refusal becomes permanent and the reason is written into
     the ADR rather than left in a plan.

##### Task M4-T1 — Build it, if T0 says so

- **Description:** the ghost builder's cross-plan branch, behind the same `?include=ghosts`.
- **Complexity:** L
- **Dependencies:** M4-T0
- **Risks:** _the layer culls by `visibleIds`_ → it must **not**, for ADR-0127 D5's exact reason:
  `visibleIds` derives from `scene.activities`, removed work is by definition not there, and
  following the instinct produces an overlay that looks correct on every plan where nothing was
  deleted. **Verified red against precisely that cull**, as D5 records doing.
- **Testing:** unit; the measurement; the journey step; the derived scene-parity gate (ADR-0127 D7).
- **Development steps:**
  1. Extend `buildRevisionGhosts` with the decided lane rule; count what cannot be drawn.
  2. Take the measurement; judge; record.
  3. Remove the M2 refusal reason and assert the toggle's new behaviour in the journey.

---

## Milestone M5 — The gate pass

**Outcome:** the epic's combined diff has been through the specialist reviewers and every blocking
finding is folded with a regression test verified red first.
**Ships dark:** `No new capability. This milestone changes code only where a review blocks.`
**Journey:** the existing suite is re-run in full.

#### Feature: the deferred specialist reviews

> **Description:** six reviewers over the combined diff.
> **Complexity:** M
> **Dependencies:** M4 (or M3, if CQ-3 defers M4 out of the epic)
> **Risks:** _a pass with no findings_ → that is a reason to check the reviews ran, not a result.
> Nine consecutive epics here found defects that had passed a human read.
> **Testing requirements:** each folded finding carries a regression test **verified red against the
> specific defect it names**.

##### Task M5-T1 — Run them, fold the blockers

- **Description:** `security-reviewer`, `api-reviewer`, `backend-performance-reviewer`,
  `component-reviewer`, `accessibility-reviewer`, `ux-reviewer`.
- **Complexity:** M
- **Dependencies:** M4
- **Risks:** _a finding is recorded and rushed_ → non-blocking findings become a numbered
  `docs/TECH_DEBT.md` row with a real status, per ADR-0120's vocabulary; the register's heading
  convention (`### <n>. <title>`) is followed, per ADR-0124.
- **Testing:** as above.
- **Development steps:**
  1. Run all six over the combined diff; ask each to **re-derive** this epic's own measurements from
     the final code rather than accept them.
  2. Fold every blocking finding with a red-first regression test.
  3. File non-blocking findings as one register row with reasons.
  4. File the ADR (§4.9), **verifying the number is still free at filing** (ADR-0071), add it to
     `docs/adr/README.md` (gated by `check:adr-coverage` in both directions since ADR-0110 D6), and
     update `CLAUDE.md` §16.
  5. Run `scripts/e2e-sweep.sh` — **every** journey, not only the one CI names. ADR-0091 M7 records
     three journeys breaking across one epic because the suite CI named was fixed and the others were
     not swept.

---

## Sequencing & slices

| Slice  | Ships                              | Releasable alone?                     | Reversible by |
| ------ | ---------------------------------- | ------------------------------------- | ------------- |
| **M0** | Two measurements + a doc fix       | Yes — no product change               | n/a           |
| **M1** | A dark route                       | Yes — nothing reaches it              | Commit revert |
| **M2** | The capability                     | Yes — **the first user-facing slice** | Commit revert |
| **M3** | The handover artefact              | Yes                                   | Commit revert |
| **M4** | The overlay, or a recorded refusal | Yes                                   | Commit revert |
| **M5** | The gate pass                      | Yes                                   | n/a           |

**No feature flag** (standing rule 2). The rollback contract is the commit boundary, and each
milestone is one revertible commit — which is why M2 keeps a unit case asserting that **This plan**
still calls the shipped route with the shipped params.

**`main` stays releasable at every point**: M0 and M1 are dark by construction, and M2 onwards
changes only the revision dock, whose flag-free surface is reached from one menu item.

**Version impact:** `api` **minor** (a new route), `web` **minor** (a new capability). Pre-1.0, so a
breaking change would also be minor — none is intended, and M1-T4 asserts the shipped route is
byte-identical.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in
[`docs/PROCESS.md`](../../PROCESS.md) — code, tests, docs, security, performance, accessibility,
Docker build, CI, changelog, version impact — **plus** the seven standing rules at the top of this
plan, of which two are worth restating because they are the ones most often skipped:

- **`pnpm prepush` was run, and `scripts/e2e-local.sh api` for any `apps/api` change** — not "CI will
  catch it". A journey drives a real browser against a real API and no unit suite can tell you a
  locator or an accessible name is wrong.
- **Any schema need stops the task and runs `database-architect` first** (CLAUDE.md §19.3).

## Risks & assumptions (rollup)

| #   | Risk / assumption                                                                                                                                                                                                                                                                                                          | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **A code re-used for different work** across two revisions correlates two unrelated activities, silently                                                                                                                                                                                                                   | low        | high   | Undetectable by construction. Stated in the copy and in the ADR's consequences; the coverage block gives the reader the one lever they have. Not mitigated further, and the plan says so rather than implying a fidelity the design does not have.                                                                                                                                                                     |
| R2  | **MSPDI codes are positional.** `mspdi-adapter.ts:453` falls back to `<WBS>`, an outline number like `1.2.3`, which renumbers when a task is inserted — so two MSPDI revisions may correlate badly. **This is reasoned from the MSPDI schema, not observed in a real file in this repository** (ADR-0083's labelling rule) | med        | med    | M0-T2 records the code provenance split. If MSPDI correlates poorly, the panel states it per source rather than the epic pretending format-independence.                                                                                                                                                                                                                                                               |
| R3  | The XER **`task_id` fallback** (`xer-adapter.ts:541-551`) is file-local; two exports from different P6 databases would not share it                                                                                                                                                                                        | low        | med    | M0-T2 counts fallback-derived codes. A high count is a finding, not a silent degradation.                                                                                                                                                                                                                                                                                                                              |
| R4  | **M0-P1 fails** (< 95 % coverage)                                                                                                                                                                                                                                                                                          | low        | high   | CQ-2 reopens; the name-fallback design is costed and put to the product owner. M1 has not started.                                                                                                                                                                                                                                                                                                                     |
| R5  | **M0-P2 fails** (> 250 ms)                                                                                                                                                                                                                                                                                                 | low        | med    | A dedicated rate budget is derived by ADR-0116 M6's committed formula. The rule exists before the number.                                                                                                                                                                                                                                                                                                              |
| R6  | A **second projection assembly** drifts from the shipped one                                                                                                                                                                                                                                                               | med        | med    | Extract and share; a structural test asserts one definition (M1-T3).                                                                                                                                                                                                                                                                                                                                                   |
| R7  | The **shipped route changes** by accident                                                                                                                                                                                                                                                                                  | low        | high   | Its existing e2e cases must pass unchanged; a diff on its DTO or method is a review-blocking finding (M1-T4).                                                                                                                                                                                                                                                                                                          |
| R8  | The overlay's **absence reads as a bug** to a planner who used it two days earlier                                                                                                                                                                                                                                         | med        | low    | A stated refusal on the toggle, not silence (M2-T1); CQ-3 puts the deferral to the product owner explicitly.                                                                                                                                                                                                                                                                                                           |
| R9  | A **`docs/TEST_PLAYBOOK.md`** row is owed if any seeded plan is added to the catalogue                                                                                                                                                                                                                                     | low        | low    | `pnpm check:playbook` gates it in both directions. **No row is owed by this plan, and that was checked rather than assumed:** `scripts/check-playbook.mjs:38-42` builds its inventory from `seed --list-plans` (`@repo/seed-cli` over `packages/seed`'s `SeedSpec`s), so M0-T2's test-local XER fixtures under `apps/api/test/` are invisible to it. If any milestone adds a `SeedSpec`, the row lands in the same PR. |
| R10 | **Assumption:** two revisions of one programme are imported into the **same project**                                                                                                                                                                                                                                      | med        | low    | True of the interchange workflow (import is nested under `:projectId` — `interchange.controller.ts:58`). If a planner splits them across projects, the route still works (same-org is the boundary); only the **picker** would not offer it. Named as a picker limitation, not a rule, and revisited from use.                                                                                                         |
