---
Status: Approved
---

# M-I — the strip, what the design review changed, and what is NOT built

The premise re-verification is [`premise.md`](./premise.md). This is what was built, what was
corrected, and — the part worth reading first — what this milestone deliberately does **not** ship.

## The design review changed four things before a line of SQL was written

CLAUDE.md §19.3 makes `database-architect` mandatory and non-optional for a data migration. It
blocked on four findings, and **two of them were defects in work already written**:

1. **`version` must be bumped** — a departure from every sibling data migration, and the only one
   that is a live data-loss path rather than a preference. Verified independently before following
   it: `use-activities.ts:160-176` resends `constraintType`/`constraintDate` on **every** definition
   save, seeded from the row the dialog was opened with, and `:539-556` (`useBatchPlacements`)
   additionally resends `visualStart` on every row. So a tab left open across the container recreate
   that pulls this release would re-write the stripped constraint on its next save — and through the
   batch route would **clear the placement the migration had just written**. The convention it
   departs from (ADR-0022: never touch `version`) exists so an **engine** write stays invisible to
   optimistic locking; this writes a **planner-owned input** and wants the opposite.
2. **The id must be a UUID v7 generated in SQL.** `placement_migrations.id` has no database
   default, so the migration supplies one, and the obvious `gen_random_uuid()` would have made two
   **already-shipped** claims false: the repository orders the report on `id` _because_ it is
   monotonic by creation, and the DTO says "Oldest first". `migrated_at` cannot substitute — it is
   the transaction-start instant and is identical for every row in the batch, which is deliberate
   and is how a batch is identified.
3. **The notice copy stated as present fact something false when read.** It said the successors
   "may now show more float". They do not: the migration writes `visual_start` and clears the
   constraint, and **cannot** touch `early_start`, `total_float` or `is_critical` — the engine is
   TypeScript, a SQL migration cannot call it, and nothing in the product recalculates because a
   migration changed the inputs. The notice appears the **first** time the plan is opened, which is
   before any recalculation. A planner who read it and went looking for the float would have found
   it unchanged, on the one screen in the product that explains an irreversible act. Now future
   tense, with a regression test verified red against the old wording.
4. **The fourth class had no fixture.** FC-10's judged-by clause names "one row carrying both a
   `visual_start` and a binding SNET" and `seedPlacementEstate` had none. Added.

**One of its findings was wrong and is recorded as such**: it reported that `docs/DATABASE.md` needs
a `placement_migrations` paragraph. It has had one since M-A (§"PlacementMigration: the record of a
stripped constraint"), covering the classes, the FK shapes, the write-once rule and the read route.
What was genuinely missing were the two facts **this** milestone introduces — the version bump and
the UUID v7 generation — and those are what got added.

## What the epic's own documents got wrong

`dilute.sql`, the M0 scale fixture, **has never produced a single binding row**, and
`m0/measurements.md` claims it produces all four classes. The binding branch is
`g % 7 = 0 AND g % 4 = 0`, which is identically the file's own `early_start IS NULL` branch
(`g % 28 = 0`), so every intended binding row classified **unclassified**. Confirmed by arithmetic
rather than taken on trust (gcd(7,4) = 1, so lcm = 28), and measured at binding 0 / inert 3,643 /
unclassified 10,928.

**Nothing in this epic had ever been measured against a non-empty binding population** until this
milestone — which is ADR-0066's "the benchmark measured the cull rather than the painter" one epic
along. Both files are corrected in place; the M0 readings are **not** re-taken, because they record
what was measured on the day and re-running them under a different fixture would produce a different
table wearing the same date.

The implementation plan's M-I-T1 carried **four** stale instructions, all struck with reasons
(§19's re-verify rule applied to a task's _remedy_, ADR-0142 D4's shape): a dependency on a
**withdrawn** falsification clause; an explicit-batching instruction written for an
application-runner design that is not what shipped; the batching itself, which is not merely
unnecessary but **worse**, since it reintroduces the possibility of the recorded set and the
converted set differing; and "reuse M0's exhaustiveness assertion", which partitions by **effect**
and is therefore structurally blind to the already-placed class.

## The defect the wiring test found

The host suppressed the notice **permanently whenever the session was absent**: the dismissal
compared `dismissedKey !== migrationKey`, and with no user id both were `null`, so they matched and
the strip never rendered. In the running app the session resolves and the notice appears, so this
would have shipped as a suppression during the load window and a total one on any render without a
session. Caught because the host wiring test renders without a session and hit the case head-on —
which is the ADR-0081 seam doing its job, one layer below the defect it was written for.

## The defect I found in my own diff, before a reviewer did

**M-I's first version showed the notice on the diagram and not in the Gantt.** The workspace's
`surface` is a ternary with a Gantt branch and a canvas branch, each carrying its own `CanvasDock`,
and the notice was wired into one of them — verbatim the one-host-and-not-its-neighbour shape this
register records at ADR-0080 (`bulk` wired into one layout and not the one its flag selects),
ADR-0064 §7 and ADR-0067 M4.

It matters more than the symmetry: **the Gantt is where the consequence is most visible**, because
its Float column shows the number the migration moves. A planner who works there would have seen
their float figures change with nothing on screen explaining why.

The fix is one line, and the gate is `host-parity.structural.test.ts` — that file's whole subject is
"a fact about the PLAN reaches both views; a fact about a SURFACE need not", and a one-time
migration having happened to this plan is a fact about the plan. It needed its own case rather than
a table row, because the two mounts take different shapes: the canvas receives a prop and decides
its dock precedence, while the Gantt renders the node as a child of its own dock, so the file's
`propsPassedTo` extractor structurally cannot see the Gantt half. **Verified red both ways** —
removing either mount fails it.

The Gantt needs no precedence decision, and that is worth writing down rather than leaving as an
asymmetry a later reader will try to "fix": the dock's standing rule is at most one **transient**
strip plus one selection bar, and the Gantt has exactly one other strip, which is the selection bar.
`resolveDockStrip`'s ladder exists because the canvas has four transient strips competing for one
row.

## What is NOT built, and why

**The `e2e-placement-migration` Playwright journey named by the plan does not exist.** This is a
decision, not an omission, and the reason is structural rather than an estimate:

> **No journey in this repository can create a `placement_migrations` row.** The only producer is a
> SQL migration that runs inside `prisma migrate deploy`, which the harness has already completed
> before the first test starts. A plan seeded by a journey therefore has un-stripped constraints and
> an empty report, permanently.

There are three ways round it and each is worse than the gap:

- **Give the journey tier database access.** No Playwright config or spec in this repository imports
  a database client or shells out to `psql` — it would be the first, and a new mechanism for the
  journey tier is an ADR-0105 full-spec trigger, not something to add inside a milestone about
  migrating constraints.
- **Add a write route.** The controller's own docblock says why there will never be one: a second
  producer of a record whose entire value is that it describes a one-time act.
- **Seed through a test-only path.** A production surface that exists for a test.

**What covers the gap instead**, and what it cannot cover:

| Claim                                            | Covered by                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The migration converts and leaves the right rows | `strip-drag-constraints-migration.e2e-spec.ts` — real populated database, SQL **read from the shipped file**, 11 cases, each mutation-verified |
| A member can read the report, scoped correctly   | `placement-migration-report.e2e-spec.ts` — real HTTP, real guards, foreign-plan 404 asserted against a plan that really has rows               |
| The host builds the strip and passes it          | `plan-workspace-toolbar.test.tsx` — verified red against the host not passing it, **and** against passing it unconditionally                   |
| The canvas dock shows it, and what it yields to  | `dock-strip.test.ts` — the precedence as a value, each case naming what it expects to have lost to                                             |
| The copy, the count, the dialog, the dismissal   | `PlacementMigrationNotice.test.tsx`, `dismissal.test.ts` — mutation-verified                                                                   |

**What none of them can see is whether the strip is VISIBLE**, because jsdom has no layout. That is
the honest residue of not having the journey, and it is narrower than it sounds: the notice is an
ordinary `NoticeStrip` in a dock that already renders four siblings, so the untested part is shared
with strips that a real browser drives every CI run.

## Measured

Against a real PostgreSQL 16.13 with all prior migrations replayed — **re-derived at the M-J gate
pass**, not inherited from the design review:

| Estate                                        | Converted | Wall clock                 |
| --------------------------------------------- | --------: | -------------------------- |
| 102,000 activities (622× the deployed estate) |     2,826 | **116–143 ms** (four runs) |
| 164 activities (the deployed host)            |         4 | **5.4 ms**                 |

**It DOES sequentially scan `activities`, and that is the correct plan.** `Seq Scan on activities`
feeds a nested loop from a `Seq Scan on plans` (40 rows), then `Index Scan using activities_pkey`
for the update side. The predicate is a whole-table question with no selectivity any index can
offer, so reading 102,000 rows once beats driving 40 index lookups — measured both ways: forcing
the index path with `enable_seqscan = off` produces exactly the plan-driven shape (`Index Scan
using plans_pkey` → `Bitmap Index Scan on idx_activities_plan_updated_at`) at **211 ms**, 1.5–1.8×
slower.

> **This section asserted the opposite until the M-J gate pass, and it was wrong in both
> directions.** It said the statement "does **not** sequentially scan", named the index-driven shape
> as the one that runs, and cited 781–798 ms for a forced sequential scan as proof the index path
> was "real rather than a coincidence". Every part of that is false: the natural plan **is** the
> sequential scan, the index-driven plan is the **slower** one, and the 781–798 ms figure does not
> reproduce under any planner setting tried.
>
> **It came from the design review and was written into a forward-only migration file without being
> re-derived** — ADR-0076 Class 2, in the one kind of artefact that cannot be edited after release.
> M-I verified that review's `version`-bump citation independently, because it was irreversible and
> load-bearing, and did not apply the same test to its plan-shape claim. §19.11's rule is that a
> claim inherited from a report is checked like any other, and the **selective** application of it
> is the finding: the half that was checked was the half that felt dangerous, and the half that was
> not is the one that ended up in an immutable file.
>
> Caught by the backend-performance review of M-J-T1, then re-derived here against a fresh database
> with all 67 prior migrations replayed and the corrected `m0/dilute.sql` — population confirmed identical
> before anything was rewritten (2,826 convertible, 706 already-placed, 14,571 SNETs).

**No new index, and the correction strengthens that rather than weakening it**: an index for a
once-ever statement would cost every activity write for ever, and the forced index plan is
measurably slower here anyway.

## Still owed

**FC-1's estate readings have never been taken** (`m0/estate-readings.md` does not exist). They come
from the ADR-0140 staff diagnostics panel on the deployed host and are the product owner's to take.
They do not block the strip — FC-10 clause B's withdrawal removed their status as a permission, and
the migration converts what it finds while the notice counts what it converted, both at runtime.
What is lost is the **prediction**: clause A predicts binding under 200 activities in one plan and
one organisation, and FULL-baseline coverage zero, so nothing will be able to say afterwards whether
the strip did what was expected. Stated rather than absorbed.

**FC-10 clause B's expiry trigger was checked against the record available, not against the host.**
The trigger is "had a real customer arrived before M-I shipped?" — the evidence is the product
owner's statement of 2026-09-20 that every plan on the installation is a test plan, and ADR-0137
D1's finding that it has one member.
