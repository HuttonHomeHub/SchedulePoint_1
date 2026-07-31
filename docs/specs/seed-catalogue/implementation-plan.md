<!--
Implementation Plan — the Seed Catalogue & Test Playbook (ADR-0066).
Stage 5 of docs/PROCESS.md. Stages 1–4 are in feature-spec.md.
-->

# Implementation Plan: the Seed Catalogue & Test Playbook

**Status:** Delivered — M0–M5 landed 2026-07-31 (ADR-0066 Accepted)
**Spec:** [`feature-spec.md`](feature-spec.md)

> The plan below is the **approved** breakdown, kept as written so the estimate can be read
> against what happened. What each milestone actually **found** — which is the point of a test
> bed, and not something a plan can predict — is recorded in
> [`../../adr/0066-the-seed-catalogue-and-the-engine-as-oracle.md`](../../adr/0066-the-seed-catalogue-and-the-engine-as-oracle.md),
> and the plans themselves are documented in [`../../TEST_PLAYBOOK.md`](../../TEST_PLAYBOOK.md).
>
> One deviation worth naming: M4's generator passed **every** declared shape assertion while
> producing a plan that was 96% critical — one queue, not a programme. No test caught it; a
> Postgres query against the seeded result did. The fix added `longestChainFraction` to the
> shape, verified failing at 0.992 against its 0.4 bound before being relied on.

---

## Breakdown

### Epic

Give the application the test bed the engine already has: a catalogue of seeded plans covering
every capability, systematic feature crossings, scale, and hostile input — all created through
the public REST API, with a written playbook that says which plan proves what.

Six milestones. **M0–M2 are the load-bearing half**: after M2 the product owner can seed a real
plan on the running host and the capability gap is closed. M3–M5 build the systematic gates on
top of that foundation.

---

### Milestone M0 — the spec model and the ADR (shippable: nothing user-facing)

| Task                                                                                                                              | Complexity | Dependencies | Risks                           | Tests                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| M0.1 `packages/seed` skeleton, ADR-0019 build contract                                                                            | S          | —            | —                               | build + export smoke                                                                                               |
| M0.2 The `SeedSpec` Zod model — plan, calendars, resources, activities, relationships, assignments, steps, expenses, plan options | M          | —            | Drifting from the Prisma schema | Round-trip parse; a structural test asserting every `ActivityType`/`ConstraintType`/… enum member is representable |
| M0.3 ADR-0066: the catalogue, the HTTP-not-Prisma decision, and **the engine-as-oracle differential**                             | M          | M0.2         | —                               | doc-link check                                                                                                     |

**Why the enum structural test matters:** the way this package rots is a new enum member landing
in Prisma that the spec model cannot express, so the capability is quietly unseedable. The test
makes that a build failure.

---

### Milestone M1 — the HTTP seeder (shippable: `seed fixture` works)

| Task                                                                                                  | Complexity | Dependencies | Risks                                                            | Tests                                                        |
| ----------------------------------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| M1.1 Typed REST client — session auth, org/client/project resolution, standard envelope, 429 back-off | M          | M0           | Duplicating the Playwright helpers                               | Unit against a mocked fetch                                  |
| M1.2 Pen acquisition + heartbeat + release around structural writes                                   | S          | M1.1         | A leaked lease blocks the plan for its TTL                       | Unit; an API e2e proving release on failure                  |
| M1.3 The runner: ordered creation, batching, per-plan verify-then-complete, soft-delete on failure    | L          | M1.1–2       | Partial state looking real                                       | API e2e: a mid-run failure leaves no visible plan            |
| M1.4 `SeedReport` — created counts, unplaceable objects with reasons, timings                         | S          | M1.3         | —                                                                | Unit                                                         |
| M1.5 `fixture → SeedSpec` mapper, incl. the unplaceable list (roles, activity-code types, UDFs)       | M          | M0.2         | Mis-mapping hours → minutes, as the conformance adapter once did | Unit per object kind; a coverage assertion over all 117 keys |
| M1.6 `apps/seed-cli` entry point: `seed fixture --url --org …`                                        | M          | M1.1–5       | —                                                                | CLI arg unit tests                                           |

**Exit:** the product owner runs one command against the Compose host and the torture-test
programme appears, with a report naming what could not be placed.

---

### Milestone M2 — the capability plans (shippable: `seed capabilities`)

One small plan per family, 5–15 activities, each with a one-sentence description **in the plan
itself** stating the expected outcome.

| Task                                                                                                                                      | Complexity | Dependencies | Risks                            | Tests                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------- | ------------------------------------------------ |
| M2.1 Builders: Constraints · Calendars · Progress & retained logic · LOE & WBS · Resources & levelling · Cost & EV · External & programme | L          | M1           | Plans too large to check by hand | One unit per builder asserting size ≤ 15         |
| M2.2 Coverage report: which of the 117 keys each plan reaches                                                                             | M          | M2.1         | —                                | A test failing on an unreached, non-excepted key |
| M2.3 `seed capabilities [--family …]`                                                                                                     | S          | M2.1         | —                                | CLI unit                                         |

**Exit:** every capability is reachable in a plan a person can reason about. This is the
milestone that answers "the WBS rows don't tally" — a five-activity WBS plan has a checkable
right answer.

---

### Milestone M3 — the pairwise differential (shippable: a CI gate)

| Task                                                                                                                                                                 | Complexity | Dependencies | Risks                                                                  | Tests                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| M3.1 Pairwise generator over the §4 dimension table, with declared illegal-combination constraints                                                                   | L          | M0.2         | Silent exclusions hiding a real gap                                    | Unit: every declared pair is covered or listed as excluded          |
| M3.2 The differential runner — seed via HTTP, recalculate, read back; build the expected result by calling `computeSchedule` **on the spec**; compare field by field | L          | M1.3, M3.1   | **Circularity** if the expected input is assembled from persisted rows | A test that reintroduces the LOE defect and asserts the suite fails |
| M3.3 Divergence reporting: activity, field, both values, the dimension pair                                                                                          | M          | M3.2         | —                                                                      | Unit                                                                |
| M3.4 CI step + a time budget                                                                                                                                         | M          | M3.2         | Slow suite gets disabled                                               | Recorded wall-clock; sharding if needed                             |

**M3.2 is the highest-risk task in the epic** and its regression test is the point of it: if the
suite cannot fail on a defect we have already seen and fixed, it is decoration.

---

### Milestone M4 — scale (shippable: `seed scale`)

| Task                                                                                      | Complexity | Dependencies | Risks                                                   | Tests                                      |
| ----------------------------------------------------------------------------------------- | ---------- | ------------ | ------------------------------------------------------- | ------------------------------------------ |
| M4.1 Generator: N activities, realistic WBS depth and logic density, parameterised        | M          | M0.2         | Unrealistic topology making the measurement meaningless | Unit: density/depth within declared bounds |
| M4.2 `seed scale --activities 500\|2000\|5000`, reporting seed and recalculate wall-clock | M          | M1.3, M4.1   | Interactive-transaction limits at 5,000                 | Recorded, not asserted — hardware varies   |
| M4.3 Feed the 2,000 plan into the TECH_DEBT #75 benchmark question                        | S          | M4.2         | —                                                       | Measurement recorded in the ADR            |

---

### Milestone M5 — hostile input, the playbook, and the gate (shippable: the whole thing)

| Task                                                                                      | Complexity | Dependencies | Risks                                                                   | Tests                  |
| ----------------------------------------------------------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------- | ---------------------- |
| M5.1 `negative_cases.json` → SeedSpec, one attempt each, observed vs declared expectation | M          | M1.3         | A case the API accepts is a **finding**, not a test failure to suppress | One assertion per case |
| M5.2 `docs/TEST_PLAYBOOK.md` — per capability: plan · what to look at · correct · wrong   | L          | M2, M3       | Rotting into fiction, the ADR-0058 failure                              | See M5.3               |
| M5.3 `pnpm check:playbook` — every row names a plan that the builders actually produce    | M          | M5.2         | —                                                                       | The check is the test  |
| M5.4 Seed → export XER → re-import → diff (round-trip fidelity against a known source)    | M          | M1.5         | —                                                                       | One e2e                |
| M5.5 Reconciliation pass over what the epic found; ADR-0066 updated with the real numbers | M          | all          | —                                                                       | doc-link check         |

---

## Sequencing & slices

```
M0 ── M1 ── M2 ──┬── M3
                 ├── M4
                 └── M5
```

M0→M1→M2 is a hard chain. M3, M4 and M5 are independent once M2 lands and can be reordered by
what proves most useful. **Every milestone is separately shippable** — M1 alone already delivers
the thing the product owner asked for first.

## Definition of Done (per task)

The repository standard (CLAUDE.md §21): code, tests, docs updated in the same PR, the pre-push
gate **run** (`pnpm lint && pnpm typecheck && pnpm test`, plus `scripts/e2e-local.sh api` where
`apps/api` is touched), a changeset for user-visible change, and Conventional Commits.

Two additions specific to this epic:

- **A seeder finding is a product finding.** If the seeder cannot create something as a Planner,
  that is raised as a defect, not worked around with a privileged path.
- **No expected value is authored by reading the engine.** Expected results come from the spec
  and the documented semantics (ADR-0035), never from running the code and recording what it
  said. That is the ADR-0034 no-external-oracle rule applied here.

## Risks & assumptions (rollup)

| Risk                                                        | Likelihood | Impact                                    | Mitigation                                                                                           |
| ----------------------------------------------------------- | ---------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The differential compares the app against itself (circular) | Medium     | **Fatal — the suite would prove nothing** | Expected input built from the spec; a regression test that reintroduces the LOE defect and must fail |
| The pairwise suite is too slow and gets disabled            | Medium     | High                                      | Budget measured in M3.4; shard or sample by dimension if over                                        |
| The playbook rots                                           | High       | Medium                                    | `check:playbook` gates it; the reconciliation pass owns it (ADR-0058)                                |
| 5,000 activities hit an API or transaction ceiling          | Medium     | Medium                                    | That **is** a finding worth having; report it rather than tuning the seeder around it                |
| Seeding duplicates the Playwright helpers                   | High       | Low                                       | Extract the shared client in M1.1 and migrate suites opportunistically, not as a precondition        |
| The seeder needs an endpoint that does not exist            | Medium     | Medium                                    | Record as a finding, continue the run, raise separately — the epic must not silently grow the API    |

**Assumptions:** a running instance with a Planner or Org Admin account; the fixture stays at
`schema_version 1.0`; no schema change is needed (if one is, that is an ADR-level decision and
this plan pauses).
