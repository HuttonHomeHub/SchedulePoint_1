# Revision Compare — M0 measurement

> The verdict against [`m0-condition.md`](./m0-condition.md), written as the run proceeds. Every
> number here names the command that produced it. Sections appear in task order; **M0-T4 states
> PROCEED / RESHAPE / WITHDRAW** at the end.

## Setup (how every number below was produced)

Nothing here reads the database. The plan was created by the ADR-0066 seeder, which is an ordinary
REST client, and every count was read back through the public API.

```bash
bash scripts/e2e-local.sh --db-only          # Postgres + `prisma migrate deploy` (58 migrations)
node apps/api/dist/main.js                   # PLAN_EDIT_LOCK_ENFORCED=false, RATE_LIMIT_LIMIT=100000
# bootstrap: sign-up -> POST /organizations -> /clients -> /clients/:id/projects   (public API only)
pnpm --filter @repo/seed-cli seed -- --url http://localhost:3000 --org m0-measurement-org \
  --project <uuid> --email <…> --password <…> --tier fixture
```

The seeder reported **no findings**: "everything the catalogue asked for, the API allowed."

Two setup facts are recorded because they cost time and will cost it again:

- The API enforces an **`Origin` header** on every mutating request (`MISSING_OR_NULL_ORIGIN`,
  403). `packages/seed-http/src/client.ts:230` sends one; a hand-rolled client must too.
- A project is created at **`/organizations/:orgSlug/clients/:clientId/projects`** — the parent
  client comes from the **route**, never the body (the DTO's own docblock says "anti-IDOR"), and
  organisations are addressed by **slug**, which is derived server-side and is not an accepted
  field on create.

## M0-T2 — the fixture's real shape, re-derived

### Finding 1 — the total is right and both published decompositions of it are wrong

`GET …/plans/:id/activities` and `…/dependencies`, paged to exhaustion at the API's real
`limit=100` ceiling and tallied by `type`:

| Quantity      | Value                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Activity rows | **147** (2 pages)                                                                                                          |
| Dependencies  | **188** (2 pages)                                                                                                          |
| By type       | `TASK` 103 · `WBS_SUMMARY` 21 · `FINISH_MILESTONE` 12 · `LEVEL_OF_EFFORT` 5 · `START_MILESTONE` 4 · `RESOURCE_DEPENDENT` 2 |

So the plan is **126 non-summary + 21 summary**, not the "129 tasks + 18 `WBS_SUMMARY`" that this
epic's brief, the spec's §0 V5 and `m0-condition.md`'s own Subject section all asserted — including
in the commit that landed the condition, an hour earlier.

**Why both are defensible and only one is about types.** `147 = 129 + 18` describes the **sources**:
the fixture's `activities` array plus its `wbs` array. `147 = 126 + 21` describes the **types**, and
they differ because **3 of the fixture's own 129 activities already carry
`activity_type: "WBS_SUMMARY"`** (`node -e` over the JSON: `TASK_DEPENDENT` 103, `FINISH_MILESTONE`
12, `LEVEL_OF_EFFORT` 5, `START_MILESTONE` 4, `WBS_SUMMARY` 3, `RESOURCE_DEPENDENT` 2 = 129).
`21 = 18 + 3` and `126 = 129 − 3`.

This is the 129-vs-147 confusion **one level down**: two correct decompositions of one total that
describe different objects. It matters for M0-T3, because a change-set generator that picks "a task"
by index into the fixture array can select a summary — and a summary carries no logic (ADR-0038), so
the change would be silently inert and C4 could pass while attributing nothing.

### Finding 2 — the playbook's row is accurate

`docs/TEST_PLAYBOOK.md:43` predicts a recalculate answering 147 activities, project finish
**2027-03-12**, **87** critical, exactly **one** flagged constraint violation. Measured, first
recalculate: `activityCount: 147`, `projectFinish: "2027-03-12"`, `criticalCount: 87`,
`constraintViolationCount: 1`. **All four match.** No correction owed.

The same response also carries `nearCriticalCount: 9`, `constraintWarningCount: 1`,
`resourceDriverMissingCount: 2`, `externalDrivenCount: 5`, `leveledActivityCount: 0`.

### Finding 3 — the cost basis for C3, and a cold-start artefact

30 consecutive `POST …/schedule/recalculate` on the seeded plan:

|     | ms        |
| --- | --------- |
| min | 97.4      |
| p50 | **106.7** |
| p95 | **117.6** |
| max | 131.5     |

**The first batch measured a 795.3 ms outlier and it was a cold start, not a tail.** An initial run
of five gave `80.0, 94.6, 81.5, 83.5, 795.3`; the 30-run characterisation immediately afterwards
never exceeded 131.5 ms. Recorded rather than dropped, because a five-sample run would have reported
a p95 of ~795 ms and put C3's 3.0 s budget in doubt on an artefact.

**Consequence for C3.** At ~107 ms per pass steady-state on this plan, the capped worst case of
**12 passes is ≈ 1.28 s** — inside the 3.0 s bar with roughly 2.3× headroom, before any measurement
of the attribution wrapper itself. C3 is therefore not expected to be the binding condition; C1 and
C2 are. That expectation is written down **before** M0-T3 runs so it can be contradicted.

ADR-0116's 694.3 ms p95 recalculate was measured at **2,000** activities and remains the only figure
`docs/TECH_DEBT.md` #74 has; this 147-activity plan is not a substitute for it and is not offered as
one.
