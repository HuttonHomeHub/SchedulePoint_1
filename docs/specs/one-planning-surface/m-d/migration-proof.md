# M-D-T3 — `visual_conflict_reason` proved against a POPULATED database

**Taken 2026-09-20** against PostgreSQL 16.13 (`postgresql://app:app@localhost:5432` — the shape
`.github/workflows/ci.yml` provisions), on the migration
`20260920120300_activity_visual_conflict_reason` and on the `writeResults` wiring that fills the
column.

**Why a populated database rather than a pristine one.** ADR-0107's finding is that this class of
defect is **invisible on an empty table**, and this migration is the sharpest instance of it the
epic has produced: its `VALIDATE CONSTRAINT` **succeeds on an empty `activities` and fails on a
populated one** unless the backfill runs first. CI provisions a pristine container, so CI would go
green on `migrate deploy`, the drift check and every test, while the failure lands on the deployed
host inside `docker-entrypoint.sh` under `set -e` (ADR-0018) — `P3018` on the first run and `P3009`
on every retry, forever, on a host that pulls and recreates images unattended (ADR-0047). §3 N1
shows both halves.

**Why each assertion has a negative control.** A test that passes equally against a migration that
did nothing is not a test (M-A's own standard). §3 shows each assertion being made to fail.

**What is proved here and nowhere else.** The migration is only half of T3; the other half is four
edits to one statement in `schedule.repository.ts`, and a unit test that mocks `$executeRaw`
**cannot see three of them** — it records the arguments and never parses the SQL (measured for
`remaining_float` at M-D-T2, and re-measured here). §4 drives the **real** `writeResults` against a
**real** database.

---

## 1. The fixture

Every migration in `prisma/migrations` **except** the one under test was replayed into a fresh
database (66 files), then populated:

| Table                        | Rows      | Notes                                                             |
| ---------------------------- | --------- | ----------------------------------------------------------------- |
| `organizations`              | 1         |                                                                   |
| `clients`                    | 1         |                                                                   |
| `projects`                   | 1         |                                                                   |
| `plans`                      | 20        |                                                                   |
| `activities`                 | **5,000** | with `early_start`, `total_float`, and a deliberate placement mix |
| — `visual_start IS NOT NULL` | **714**   | placed bars                                                       |
| — `visual_conflict = true`   | **312**   | **the population the backfill and the VALIDATE turn on**          |

The 312 are the point of the fixture. A fixture with none of them is a pristine database wearing a
disguise: every assertion below passes against it, including the one that matters.

The migration was then applied **as one implicit transaction**, the way Prisma applies it
(`psql --single-transaction -f`). It committed; whole-file wall time **61 ms**.

## 2. What was asserted, and what was observed

**A1 — no row was lost, and no heap was rewritten.** `relfilenode` is the strongest available
statement of "metadata-only": a rewrite allocates a new one.

| Table        | relfilenode before | after      | rows before | after     |
| ------------ | ------------------ | ---------- | ----------- | --------- |
| `activities` | 285123             | **285123** | 5,000       | **5,000** |

**A2 — no existing value changed, including the boolean the backfill reads.** An `md5` digest over
`id`, `early_start`, `total_float`, `visual_start`, `visual_drift_days` and `visual_conflict`,
before and after: `4d70ba8b8be8e90e1a692cd27148661f` → **identical**. So the backfill wrote the new
column and nothing else — in particular it did not "fix up" `visual_conflict`, which would have been
a silent change to shipped engine output.

**A3 — the column has the declared shape.** `information_schema.columns`:
`visual_conflict_reason` is `USER-DEFINED` / `VisualConflictReason`, **nullable**, **no default**.
`pg_enum` reports exactly two labels in declaration order — `EARLIER_THAN_LOGIC` (1),
`LATER_THAN_BOUND` (2). There is deliberately no third "no conflict" label; absence is the column's
NULL.

**A4 — the ADD COLUMN filled nothing in.** `pg_attribute`:

| Column                   | `atthasmissing` | `attmissingval` |
| ------------------------ | --------------- | --------------- |
| `visual_conflict_reason` | **f**           | **NULL**        |
| `visual_conflict`        | t               | `{f}`           |

The neighbour is shown because it is the contrast: `visual_conflict` shipped with a constant
`DEFAULT false`, so it carries a fast-default catalogue entry. This column has no default, so it
carries none — which is what "nullable, no default, metadata-only" looks like from the catalogue.

**A5 — the rows read what the design says they read.** The whole table, grouped:

| `visual_conflict` | `visual_conflict_reason` | rows      |
| ----------------- | ------------------------ | --------- |
| `false`           | `NULL`                   | **4,688** |
| `true`            | `EARLIER_THAN_LOGIC`     | **312**   |

Two facts in one table. The backfill reached **every** flagged row (312 of 312) and **no** unflagged
row — an over-broad backfill is N5. And every row satisfies the CHECK, which is A6's precondition.

**A6 — the constraint exists, is a CHECK, and is VALIDATED.** `pg_constraint`:
`ck_activities_visual_conflict_matches_reason`, `contype = c`, **`convalidated = t`**,
`CHECK ((visual_conflict = (visual_conflict_reason IS NOT NULL)))`. `convalidated` is the assertion
that matters: a `NOT VALID` constraint left unvalidated would enforce going forward and say nothing
about the 5,000 rows already there.

**A7 — no index mentions the column.** `pg_indexes` on `activities`: **0**. Stated because it is a
decision (the migration header gives the reason, and re-derives it from the three reads that touch
the pair) rather than an omission.

**A8 — the per-statement cost, measured rather than estimated.** Same fixture, `\timing`:

| Statement                    | Time          | What it does                              |
| ---------------------------- | ------------- | ----------------------------------------- |
| `CREATE TYPE`                | 1.646 ms      | catalogue only                            |
| `ADD COLUMN`                 | 1.024 ms      | catalogue only (A4)                       |
| the backfill `UPDATE`        | **11.135 ms** | one seq scan; **writes** 312 row versions |
| `ADD CONSTRAINT … NOT VALID` | 0.831 ms      | catalogue only                            |
| `VALIDATE CONSTRAINT`        | 1.778 ms      | one seq scan; reads only                  |

16.4 ms of statement time; 61 ms for the whole file including `psql` startup. The backfill dominates
because it is the only statement that writes. Both scans are linear in the table and there is no
index that would avoid them — nor should there be one for a once-ever statement.

**A9 — no drift.** The repository's own gate, verbatim
(`prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma
--exit-code`) against the migrated database: **"No difference detected"**, exit 0. The stronger form
(`--from-migrations` against the datamodel) agrees. **What that does _not_ cover is stated here so
nobody assumes it does:** `prisma migrate diff` reports a CHECK **not at all** — the other side of
`docs/DATABASE.md`'s "Prisma cannot express CHECK", measured for the M-A migrations and unchanged
here. The column and the enum are gated; the constraint is not, which is why §3 N2/N6 and §4 exist.

## 3. Negative controls — each assertion made to fail

**N1 — the headline, and the reason this file exists. Does "populated" do any work?** The identical
statement sequence **with the backfill removed**, run both ways:

```
-- on the POPULATED activities table (5,000 rows, 312 flagged):
ALTER TABLE activities ADD CONSTRAINT ck_probe
  CHECK (visual_conflict = (visual_conflict_reason IS NOT NULL)) NOT VALID;
ALTER TABLE activities VALIDATE CONSTRAINT ck_probe;
--> ERROR: check constraint "ck_probe" of relation "activities" is violated by some row

-- the SAME sequence after DELETE FROM activities (what CI provisions):
--> VALIDATE SUCCEEDED
```

A pristine database cannot tell those apart. This one can. The failure mode it is standing in front
of is not a failed test: under ADR-0018 the migration runs at boot, so it is the API failing to
start, and it is unattended (ADR-0047).

**N2 — does the CHECK discriminate, or would any expression pass?** With the constraint in place, a
row is refused in **both** directions — see §4 cases (c) and (d), which do it through the real
`writeResults` rather than through hand-written SQL.

**N3 — would A1/A4 pass against a migration that DID rewrite the heap?** A column with a
**volatile** default, which cannot take the fast-default path:

```
ALTER TABLE activities ADD COLUMN zz_probe UUID NOT NULL DEFAULT gen_random_uuid();
relfilenode 281695 --> 283175        atthasmissing = f
```

The relfilenode moves. Both halves of A1/A4 discriminate. (`atthasmissing = f` is the same value the
real column reads, which is why A1 and A4 are both needed and neither is sufficient: A4 distinguishes
a constant default from no default, A1 distinguishes a rewrite from a catalogue change.)

**N4 — the row-count and digest assertions alone are not a test.** Run against the **unmigrated**
database, "5,000 rows" and `4d70ba8b8be8e90e1a692cd27148661f` both **pass**. What discriminates is
the census: **0** columns named `visual_conflict_reason` and **0** constraints named
`ck_activities_visual_conflict_matches_reason` on the unmigrated database, **1** and **1** on the
migrated one. A1/A2 are necessary and are worth nothing on their own.

**N5 — would an OVER-BROAD backfill have been caught?** An unconditional
`UPDATE activities SET visual_conflict_reason = 'EARLIER_THAN_LOGIC'` (no `WHERE`) followed by the
same `VALIDATE`:

```
--> ERROR: check constraint "ck_probe" of relation "activities" is violated by some row
```

So the CHECK guards the backfill in both directions: too narrow (N1) and too broad (N5) both fail
loudly, and the `WHERE visual_conflict` predicate is the only thing that passes.

**N6 — would a WEAKER, one-directional CHECK have done?** The obvious cheaper constraint
`CHECK (visual_conflict_reason IS NULL OR visual_conflict)` — "a reason implies the flag" — is true
of every pre-existing row and therefore needs **no backfill at all**, which makes it tempting. It
was tried:

```
ALTER TABLE activities ADD CONSTRAINT ck_weak
  CHECK (visual_conflict_reason IS NULL OR visual_conflict) NOT VALID;
ALTER TABLE activities VALIDATE CONSTRAINT ck_weak;   --> succeeds, no backfill
UPDATE activities SET visual_conflict = true WHERE id = (SELECT id FROM activities LIMIT 1);
--> ACCEPTED
```

The weak form **accepts the flag-with-no-reason state** — which is exactly the state the missing
`UPDATE SET` entry produces (§4 case b′). It catches the half that cannot happen and misses the half
that has already happened once in this repository. That is why the shipped constraint is the
biconditional and why the backfill is its price.

## 4. The wiring, driven against a real database

`writeResults` wires a column in **four** places — the derived array, the `UPDATE SET`, the `unnest`
argument list and the `AS v(…)` column list — and the unit tier can see only one of them. So the
statement was driven for real: the shipped `ScheduleRepository` class imported from source (not a
copy of the statement), constructed directly, and handed a live `PrismaClient` as its `db` argument,
which is the parameter `writeResults` already takes.

| Case                                                       | Expected | Observed                                                             |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| **(a)** every reason `null` — **the parity path**          | written  | **OK**, three rows read back `(false, NULL)`                         |
| **(b)** mixed: both labels and a `null` in one array       | written  | **OK**, read back `EARLIER_THAN_LOGIC` / `LATER_THAN_BOUND` / `NULL` |
| **(c)** `visualConflict: true`, reason `null`              | refused  | **23514** `ck_activities_visual_conflict_matches_reason`             |
| **(d)** `visualConflict: false`, reason `LATER_THAN_BOUND` | refused  | **23514** `ck_activities_visual_conflict_matches_reason`             |

**(a′) The `::text[]` cast is load-bearing, and its failure is the wrong way round.** The obvious
`${visualConflictReason}::"VisualConflictReason"[]` was substituted and the cases re-run:

```
CASE a all-null : THREW  Code 42846 — ERROR: cannot cast type integer[] to "VisualConflictReason"[]
CASE b mixed    : OK
```

Prisma serialises an all-null array with no element-type hint and Postgres infers `integer[]` — the
trap `leveled_start`'s comment documents, reached here by the **common** case rather than an edge
one. A plan that HAS a conflict writes perfectly; a plan that has none raises 42846. Every plan on
the deployed estate is the second kind (FC-1 predicts zero placements), so the naive cast would pass
any hand-test of the feature and break every recalculation in production. `::text[]` at the `unnest`
plus `::"VisualConflictReason"` at the `SET` — this repository's established shape for a nullable
enum array (`activity.repository.ts` `updatePlacements`) — makes both cases work.

**(b′) The missing `UPDATE SET` entry, and what the unit tier does and does not see.** The
`visual_conflict_reason = v.visual_conflict_reason::"VisualConflictReason"` line was deleted and the
cases re-run:

```
CASE a all-null : OK        <-- silent; nothing to write, nothing written
CASE b mixed    : THREW  Code 23514 — new row for relation "activities" violates check
                         constraint "ck_activities_visual_conflict_matches_reason"
```

Without the CHECK, case (b) would also have been "OK" with the column silently NULL for ever. With
it, the defect surfaces on the **first recalculation of a plan that has a conflict**. This is the
defect class M-D-T2 measured as invisible to a mocked `$executeRaw`, and it is the constraint's
whole justification.

**(c′) A false positive is unreachable from legitimate engine output**, which is what makes the
blast radius of (c)/(d) acceptable. There is exactly one producer of `EngineResult.visualConflict`
in `apps/api/src` — `compute.ts:932` — and it is _defined_ as `visualConflictReason !== null`; no
create, copy, import or DTO path writes either column (grepped). The accepted cost is stated rather
than glossed: if a future engine change decouples them **legitimately**, this constraint turns that
into a failed recalculation rather than an inconsistent read, and the remedy is one compensating
migration.

## 5. One correction this harness produced

The column was first wired **beside `visual_conflict`**, which reads better and is where the
schema puts it. `schedule.repository.day-factor.spec.ts` then went **red against otherwise-correct
code**:

```
AssertionError: visual_drift_days is the 17th: expected [ null ] to deeply equal [ 2 ]
```

That spec pins `visual_drift_days` and `remaining_float` at `$executeRaw` argument indices **16 and
17, by position**, so an argument inserted before them renumbers both. Appending after
`remaining_float` — the **nineteenth** `unnest` argument — leaves every existing index untouched,
and the `SET`, `unnest` and `AS v(…)` lists are kept in that one order so the three cannot be read
as disagreeing. The spec is right to fail loudly; the placement is the thing that had to change.

## 6. What this does NOT establish

- **Nothing about the engine.** No `computeSchedule` call happens anywhere in this harness. The
  `EngineResult`s in §4 are hand-built to exercise the write path; that the engine _produces_ the
  right reason for a given placement is `compute.visual.spec.ts`'s claim (M-D-T1/T2), and the
  end-to-end statement — a real placement recalculated over the real route and read back from the
  column — is an API e2e obligation this file does not discharge.
- **Nothing about the DTO or the API.** The column is not read by anything here. Whether
  `GET …/activities` exposes it, and whether the guest DTO withholds it, is M-D's own work; see §7.
- **Nothing about the deployed estate's size.** 5,000 activities and 312 flagged rows are a
  **shape**, not a measurement. The real figures are an ADR-0140 diagnostic reading, and the one that
  decides the backfill's cost — how many activities currently carry `visual_conflict = true` — has
  **not been taken**. The migration is safe at any count (the backfill is one predicated statement),
  but its wall time on the deployed host is unmeasured.
- **Nothing about concurrency.** `VALIDATE CONSTRAINT` takes `SHARE UPDATE EXCLUSIVE`, which does not
  block reads or writes; that is read from PostgreSQL's documented lock levels and was **not**
  observed under a concurrent workload here.

## 7. One boundary, recorded rather than crossed

This harness added `visualConflictReason: null` to four `*.spec.ts` activity fixtures because the
compiler refused the build without them, and **stopped there**. In particular
`guest-dto.spec.ts`'s `FORBIDDEN_ACTIVITY_KEYS` was left alone: that list is a decision about the
ADR-0051 guest scope rather than a compiler requirement, and the exhaustive gate beside it
("exposes ONLY the whitelisted schedule + progress fields") is what would actually fail if the
guest DTO leaked the field, so omitting the entry breaks nothing and inventing it would be a scope
call made by the wrong hand. It has since been added with the DTO work (`:143`), which is where it
belonged.

The `null` in those fixtures is not arbitrary either: it is the only value consistent with the
`visualConflict: false` beside it, because `ck_activities_visual_conflict_matches_reason` refuses
the other pairing. A fixture describing a state the database refuses is a fixture that will one day
be cited as precedent.

---

## 8. Reproducing it

```sh
createdb -h localhost -U app app_proof_final
# every migration except the one under test
for d in apps/api/prisma/migrations/*/; do
  case "$(basename "$d")" in 20260920120300_*) continue;; esac
  psql -h localhost -U app -d app_proof_final --single-transaction -v ON_ERROR_STOP=1 -f "$d/migration.sql"
done
# populate: 1 org / 1 client / 1 project / 20 plans / 5,000 activities, 312 with visual_conflict
# then apply the file under test as one transaction
psql -h localhost -U app -d app_proof_final --single-transaction -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260920120300_activity_visual_conflict_reason/migration.sql
```

The database is the harness's own (`app_proof_final`), never `app_test` — two runs against that one
corrupt each other (`docs/TECH_DEBT.md` #349).
