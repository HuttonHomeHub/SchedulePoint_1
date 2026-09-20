# M-A — the migrations proved against a POPULATED database

**Taken 2026-09-20** against PostgreSQL 16.13 (`postgresql://app:app@localhost:5432` — the shape
`.github/workflows/ci.yml` provisions), on the three migrations
`20260920120000_baseline_placement_snapshot`, `20260920120100_activity_remaining_float` and
`20260920120200_placement_migrations`.

**Why a populated database rather than a pristine one.** ADR-0107's whole finding is that this class
of defect is **invisible on an empty table**: `prisma migrate diff` generates one
`ADD COLUMN "issuer" TEXT NOT NULL`, which **succeeds on an empty table and fails on a populated
one** — so CI, which provisions a pristine container, goes green on `migrate deploy`, the drift
check and every test, while the failure lands on the deployed host inside `docker-entrypoint.sh`
under `set -e` (ADR-0018), where the first run leaves `P3018` and every retry reports `P3009`
forever: a restart loop on a host that auto-pulls releases (ADR-0047) with nobody watching.

**Why each assertion has a negative control.** A test that passes equally against a migration that
did nothing is not a test (M-J-T2's own standard). §3 below shows each assertion being made to
fail.

---

## 1. The fixture

Every migration in `prisma/migrations` **except** the three under test was replayed into a fresh
database (63 files, 31 tables), then populated:

| Table                 | Rows      | Notes                                                  |
| --------------------- | --------- | ------------------------------------------------------ |
| `organizations`       | 1         |                                                        |
| `plans`               | 20        |                                                        |
| `activities`          | **5,000** | with `early_start`, `total_float`, `visual_drift_days` |
| — of those, `SNET`    | **454**   | the population M-I's strip will classify               |
| `baselines`           | 40        |                                                        |
| `baseline_activities` | **2,000** | with `baseline_start`/`baseline_finish`/`total_float`  |

The three migrations were then applied **one implicit transaction per file**, the way Prisma applies
them (`psql --single-transaction -f`). All three committed.

## 2. What was asserted, and what was observed

**A1 — no row was lost, and no heap was rewritten.** `relfilenode` is the strongest available
statement of "metadata-only": a rewrite allocates a new one.

| Table                 | relfilenode before | after      | rows before | after     |
| --------------------- | ------------------ | ---------- | ----------- | --------- |
| `activities`          | 265807             | **265807** | 5,000       | **5,000** |
| `baseline_activities` | 265948             | **265948** | 2,000       | **2,000** |
| `baselines`           | 265937             | **265937** | 40          | **40**    |
| `plans`               | 265723             | **265723** | 20          | **20**    |

**A2 — no existing value changed.** An `md5` digest over the columns the migrations must not touch,
taken before and after:

- `activities` (`id`, `early_start`, `total_float`, `constraint_type`):
  `3084c2fa3d8378525eadc4e556e72dc3` → **identical**
- `baseline_activities` (`id`, `baseline_start`, `total_float`):
  `662a0525571aaf16a136f25f893a36e6` → **identical**

**A3 — every column has the declared shape.** 15 columns/one table, verified through
`information_schema.columns`: the three `baseline_activities` placement columns are `date`,
nullable, **no default**; `activities.remaining_float` is `integer`, nullable, **no default**;
`baselines.placement_snapshot_level` is `NOT NULL DEFAULT 'NONE'::"PlacementSnapshotLevel"`; and
`placement_migrations`' ten columns match the model, with `prior_constraint_type` /
`prior_constraint_date` `NOT NULL` and `activity_code` / `prior_visual_start` nullable.

**A4 — the constant default took the fast-default catalogue path, and the nullable columns filled in
nothing.** `pg_attribute`:

| Column                               | `atthasmissing` | `attmissingval` |
| ------------------------------------ | --------------- | --------------- |
| `baselines.placement_snapshot_level` | **t**           | **{NONE}**      |
| `baseline_activities.placed_start`   | f               | NULL            |
| `baseline_activities.placed_finish`  | f               | NULL            |
| `baseline_activities.visual_start`   | f               | NULL            |
| `activities.remaining_float`         | f               | NULL            |

**A5 — the default is readable on pre-existing rows**, which `atthasmissing` alone does not show:
all 40 pre-existing baselines read `placement_snapshot_level = 'NONE'`; all 2,000 pre-existing
snapshot rows read NULL in all three new columns; all 5,000 activities read NULL `remaining_float`.

**A6 — the foreign keys carry the declared actions.** `pg_constraint.confdeltype`:
`placement_migrations_plan_id_fkey` = `c` (**CASCADE**),
`placement_migrations_organization_id_fkey` = `r` (**RESTRICT**).

**A7 — the two indexes exist** (`(plan_id, id)`, `(organization_id)`) and the first serves the
report read: a `Bitmap Index Scan on placement_migrations_plan_id_id_idx` returning 23 of 454 rows
in 0.089 ms.

**A8 — the CASCADE actually fires.** 454 log rows were written from the SNET population, 22 of them
for plan 1. Hard-deleting plan 1 (the ADR-0096 expiry's own statement order) left **0** rows for
that plan.

**A9 — `migrated_at` is one instant for a whole batch**, as the docblock claims: 454 rows,
`count(DISTINCT migrated_at) = 1`. This is what makes a batch identifiable without a correlation
column, and it is why `(plan_id, id)` carries `id` rather than `migrated_at` — that column cannot
order rows _within_ a batch.

**A10 — `prior_visual_start` was NULL on all 454 rows**, which is the expected state (the strip
excludes any activity already carrying a `visual_start`) and the reason the column's docblock says a
**non-NULL value is a finding**.

**A11 — the `NOT NULL` pair and the foreign keys refuse.** A row with a NULL `prior_constraint_type`
is refused; a row naming an organisation that does not exist is refused by
`placement_migrations_organization_id_fkey`.

**A12 — no drift.** `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code`
reports **"No difference detected"**, exit 0. A declared index or constraint the database does not
have is the CI schema-drift failure of `docs/TECH_DEBT.md` #54.

## 3. Negative controls — each assertion made to fail

**N1 — does "populated" do any work?** This is ADR-0107's premise, and it is the control that
justifies the whole fixture. The _same statement_ on the two tables:

```
-- on the EMPTY placement_migrations table:
ALTER TABLE placement_migrations ADD COLUMN probe TEXT NOT NULL;   --> ALTER TABLE  (succeeds)
-- on the POPULATED baseline_activities table:
ALTER TABLE baseline_activities ADD COLUMN probe TEXT NOT NULL;
--> ERROR: column "probe" of relation "baseline_activities" contains null values
```

A pristine database cannot tell those apart. This one can.

**N2 — would A8 pass against a RESTRICT foreign key?** With the plan FK swapped to `RESTRICT` inside
a rolled-back transaction, the identical delete raises:

```
ERROR: update or delete on table "plans" violates foreign key constraint
       "placement_migrations_plan_id_fkey" on table "placement_migrations"
```

So A8 is testing the CASCADE and not merely that the rows happened to vanish. It also _is_ the
failure this table's FK shape exists to avoid: that 23503 would land inside the ADR-0096 retention
expiry, which catches it, logs `hierarchy_expiry.permanent_failure` and retries hourly forever with
nothing user-facing saying so.

**N3 — would A1/A4 pass against a migration that DID rewrite?** A column with a **volatile** default,
which cannot take the fast-default path:

```
ALTER TABLE baseline_activities ADD COLUMN probe UUID NOT NULL DEFAULT gen_random_uuid();
relfilenode 265948 --> 267274        atthasmissing = f
```

The relfilenode moves and `atthasmissing` stays `f`. Both halves of A1/A4 discriminate.

**N4 — the row-count assertion alone is not a test.** Run against `app_test`, which has **none** of
the three migrations applied, "the counts are unchanged" **passes**. What discriminates is A3's
column census, which reports **0** new columns on the unmigrated database and **15** on the migrated
one. A1 is necessary and is worth nothing on its own.

## 4. One correction this harness produced

The `placement_migrations` docblock and its migration header originally said the strip's `WHERE`
names `START_NO_EARLIER_THAN`. **The enum's label is `SNET`** —
`enum ConstraintType { SNET // start no earlier than … }`, so the long form is the _comment_ and not
the _value_. The fixture refused the insert (`invalid input value for enum "ConstraintType"`) and
the docblocks were corrected. ADR-0076 Class 2, caught by running the thing rather than reading it.

## 5. What this does NOT establish

- **Nothing about behaviour.** M-A ships dark: no writer, no reader, no DTO. These migrations create
  columns and a table and nothing computes or reads any of them.
- **Nothing about the deployed estate's size.** The fixture's 5,000 activities and 454 SNET rows are
  a shape, not a measurement. FC-1's readings are taken through the ADR-0140 staff panel on the
  deployed host and are a separate obligation.
- **Nothing about the strip.** FC-10 clause C — the bars do not move — is M-I's, and this harness
  neither converts a row nor recalculates anything.

---

## 6. The committed half — `apps/api/test/placement-schema.e2e-spec.ts`

§2–§3 above are a one-off run. What is committed is narrower on purpose: **only the decisions no
other gate can see.**

**Measured first, so the file is not decoration.** A raw-SQL `CREATE INDEX` on `remaining_float` and
a raw-SQL `CREATE UNIQUE INDEX` on `placement_migrations(plan_id, activity_id)` were added by hand,
and this repository's own `prisma:check-drift` command reported **both** and exited **2**:

```
[*] Changed the `activities` table
  [-] Removed index on columns (remaining_float)
[*] Changed the `placement_migrations` table
  [-] Removed unique index on columns (plan_id, activity_id)
```

So "no index" and "no unique constraint" are **already gated**, and asserting them would duplicate
a check. The same run reported the hand-added CHECK **not at all** — which is `docs/DATABASE.md`'s
own position (Prisma cannot express CHECK) seen from the other side, and it is the gap the
committed file exists for.

**Verified red against the specific defect each case guards** (M-J-T2's standard), by introducing
all three into the live database and re-running:

| Case                                         | Defect introduced                                         | Result                                                                           |
| -------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `remaining_float` unconstrained              | `CHECK (remaining_float IS NULL OR remaining_float >= 0)` | **FAIL** — "a CHECK on remaining_float would refuse the state US-5 renders"      |
| the three placement columns unconstrained    | `CHECK (placed_finish >= placed_start)`                   | **FAIL** — "a CHECK on placed_start would let a capture fail rather than record" |
| the three are nullable dates with no default | `ALTER COLUMN visual_start SET DEFAULT DATE '2026-01-01'` | **FAIL** — "a DEFAULT on visual_start would fabricate history"                   |

All three were then removed, the file returned to **6 passed**, and `prisma:check-drift` returned
to exit 0. The fourth case is the file's own negative control: it adds the CHECK inside a
transaction it then rolls back, proving the discriminating query **sees** one when one exists —
because a query that never finds anything passes identically against a database that has nothing
and a query that is broken.

**What is deliberately not asserted, and why.** The plan FK's `CASCADE` is gated by the drift check
(it is declared in `schema.prisma`), and the dangerous direction — a new child table with a
`RESTRICT` edge that `hierarchy-expiry.runner.ts` does not delete — is gated by that spec's
DMMF-derived census. `placement_migrations` contributes **zero** edges to that census, and that is
the CASCADE decision working rather than a gap: the census considers only `Restrict` edges into
tables the runner deletes, so a table whose plan edge cascades is excluded _because the database
already handles it_.
