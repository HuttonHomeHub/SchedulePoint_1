# M0 — Measuring the `accounts` table

> Milestone M0 of [`implementation-plan.md`](implementation-plan.md). Ships dark: this milestone
> produces numbers, not code. Every figure below is quoted beside the command that produced it
> (ADR-0076 §19.11).

**Measured:** 2026-08-23.

## What was measured, and what was not

| Target                | Reached | How                                                                    |
| --------------------- | ------- | ---------------------------------------------------------------------- |
| Local `app_test`      | **yes** | `psql -d app_test` on the session container's PostgreSQL 16 cluster    |
| The **deployed** host | **no**  | This container has no route to the product owner's Docker Compose host |

ADR-0099 records three consecutive false diagnoses caused by measuring the wrong target and
reporting the number confidently, so the split is stated first rather than in a footnote. **Every
figure in §1 is the local database.** The deployed answers are outstanding — see §4.

---

## 1. M0-T1 — What the table contains

All five queries were run in one `psql -d app_test -f` pass. Output verbatim.

### Q1 — Sizing

```sql
SELECT count(*) AS accounts FROM accounts;   -- 85
SELECT count(*) AS users    FROM users;      -- 85
```

One account per user, exactly.

### Q2 — `provider_id` distribution — **closes CQ-1**

```sql
SELECT provider_id, count(*) FROM accounts GROUP BY 1 ORDER BY 2 DESC;
```

```
 provider_id | count
-------------+-------
 credential  |    85
```

Single-valued. The spec established credential-only from **code**
(`apps/api/src/common/auth/better-auth.ts:164` configures `emailAndPassword` and no
`socialProviders`); this establishes it from **data** on this database. A constant backfill of
`'local:credential'` is therefore honest here — though the shipped migration still guards on
`provider_id = 'credential'` rather than writing the constant blanket (R5), because the guard costs
nothing and the deployed table has not been measured.

### Q3 — `account_id <> user_id` — **closes CQ-2**

```sql
SELECT count(*) AS mismatched
FROM accounts a JOIN users u ON u.id = a.user_id
WHERE a.account_id <> u.id;
```

```
 mismatched
------------
          0
```

Zero. This is the query the brief did not ask for and the one most likely to change the plan: Better
Auth 1.7's sign-in predicate requires `accountId === user.id`, so a non-zero answer names users who
cannot sign in at 1.7 **regardless of any `issuer` backfill**. On this database there are none, so
CQ-2's data-repair fork does not open here.

### Q4 — Duplicates — **closes CQ-3**

```sql
SELECT account_id, count(*)              FROM accounts GROUP BY 1   HAVING count(*) > 1;  -- (0 rows)
SELECT provider_id, account_id, count(*) FROM accounts GROUP BY 1,2 HAVING count(*) > 1;  -- (0 rows)
```

No duplicates on either key, so `UNIQUE (issuer, account_id)` would build without violation here.

### Q5 — The column does not already exist

`information_schema.columns` returns 13 columns for `accounts` and **`issuer` is not among them**:
`id, account_id, provider_id, user_id, access_token, refresh_token, id_token,
access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at`.

---

## 2. M0-T2 — Timing the DDL

The form measured is the **four-step guarded migration** from
[`migration-design.md`](migration-design.md) — add nullable, backfill guarded on `provider_id`,
`SET NOT NULL`, then the unique index — not the `ADD COLUMN … NOT NULL DEFAULT` single-statement
form the plan's step 2 named. The plan predates the design; the shipped form is what matters, and
measuring the other one would be measuring something nobody will run.

All timings from `\timing on` inside one transaction on a `TEMPLATE app_test` clone.

| Rows         | `ADD COLUMN` | `UPDATE` (backfill) | `SET NOT NULL` | `CREATE UNIQUE INDEX` | `COMMIT` |    **Total** |
| ------------ | -----------: | ------------------: | -------------: | --------------------: | -------: | -----------: |
| 85 (cold)    |     0.417 ms |            1.219 ms |       0.154 ms |         **91.891 ms** | 0.738 ms |  **94.4 ms** |
| 85 (warm)    |     0.449 ms |            1.110 ms |       0.154 ms |              1.766 ms | 0.543 ms |   **4.0 ms** |
| 8,500 (100×) |     0.574 ms |          113.415 ms |       1.584 ms |             26.723 ms | 4.474 ms | **146.8 ms** |
| 1,000,000    |     0.681 ms |       10,709.446 ms |     169.686 ms |          3,682.357 ms | 7.194 ms |  **14.57 s** |

**The cold/warm split is not noise and the cold number is the one that matters.** 91.9 ms was the
first index build in a freshly-started cluster; the identical script on a second clone took 1.8 ms.
The deployed migration runs inside `docker-entrypoint.sh` on a container that has just started, so
it runs cold.

**Verdict against the < 1 s target: passes with three orders of magnitude of margin** at the
deployed size. The falsification condition — _if the index build exceeds 1 s at the deployed size it
does not ship in the same release as the column_ — does not fire at 85 rows, and would not fire until
somewhere between 8,500 and 1,000,000 rows.

### `CONCURRENTLY` is unavailable, not declined

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and `prisma migrate deploy` wraps
each migration file in one. So the plan's "note whether it is even available to us" resolves to
**no**. At 85 rows it is moot; the constraint is recorded because it bounds what any future index on
this table can do.

### The finding the design did not quantify: the backfill rewrites every row

`ALTER TABLE … ADD COLUMN "issuer" TEXT` is metadata-only on PostgreSQL 11+ — confirmed, 0.4–0.7 ms
flat from 85 to 1,000,000 rows, which a rewrite could not be. **The `UPDATE` is not**, and under MVCC
it writes a second version of every row. After the 1M-row run:

```
  heap  | indexes | total  | n_live_tup | n_dead_tup
--------+---------+--------+------------+------------
 262 MB | 153 MB  | 415 MB |     999915 |    1000000
```

One dead tuple per live tuple — the heap holds two copies until autovacuum. At the deployed size
(85 rows) this is irrelevant and no mitigation is proposed. It is recorded because "no table
rewrite" is true of **step 1 only**, and quoting it for the migration as a whole would be a claim
about a cost that is real at scale.

---

## 3. Decisions closed (M0-T3)

| Question | Answer, on the evidence above                                                              | Differs from the spec's default?                                                           |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **CQ-1** | Credential-only on `app_test`. Backfill stays **guarded** on `provider_id`, not blanket.   | No — the guard is R5's conservative branch, kept because the deployed table is unmeasured. |
| **CQ-2** | No mismatched rows here — but the **repair ships anyway**, guarded. See below.             | **Yes**                                                                                    |
| **CQ-3** | Zero duplicates and a 1.8–92 ms build, so **take the unique index in the same migration**. | No                                                                                         |

CQ-4 (does `apps/web` take the bump) and CQ-5 (one release or two) are untouched by M0 and keep
their spec defaults: bump both, ship two releases.

### CQ-2 was decided by the product owner, against this measurement rather than because of it

Put to the product owner on 2026-08-23 together with the choice of whether to run the pre-flight
against the deployed host first. They chose **proceed without the pre-flight** and **repair the rows
if any exist** — so the repair ships as step 0 of the migration, unconditional in the file and a
no-op on any table that has none, which is every table measured here.

The spec's stated default was "repair, **only if M0 finds any**". That conditional cannot be
honoured once the deployed table is deliberately left unmeasured: there is no measurement to
condition on, and a repair written later is a second migration. Shipping it unconditionally is the
same decision with its condition removed, which is why the row above is marked as differing from the
default rather than matching it.

**The guard on the repair was not in the spec, and it took two attempts.** The first was a
`NOT EXISTS (a correct row for this user)` test, written to stop the repair creating the duplicate
step 5 would then refuse. Re-reading the finished file against a scratch database found that it does
not: a user with **two wrong rows** has no correct row, so neither is excluded, both are repaired to
the same `account_id`, and the index aborts the whole migration — the restart loop this design
exists to avoid, caused by the repair meant to help.

Worse, the test written for that guard asserted the right rows for a **false stated reason**. Its
name ended "and then refuses it", and the migration does not refuse it: a correct row and a stale row
carry _different_ `account_id`s, so they are not a unique violation at all. The same false half was
written into the migration's own comment. The test passed throughout.

The shipped guard is a **count**: repair only where the user has exactly one credential row, which
cannot collide because there is nothing to collide with. Every other shape is left as found —
including two wrong rows, where the user stays locked out (where they already were) rather than the
migration guessing which row is theirs, and two already-correct duplicate rows, which step 5 rightly
refuses rather than silently merging two accounts.

Writing that test also **invalidated an earlier one**. The duplicate-abort case had been seeded with
two rows sharing an `account_id` under different users — which step 0 now repairs, so the migration
succeeded and the test went red. Its seed is now two credential rows for **one** user, both already
satisfying `account_id = user_id`, which step 0 cannot touch. That is the shape step 0's own comment
describes (reset-password writing a second row for a locked-out user), so the case is now about the
duplicate the migration genuinely cannot resolve rather than one it quietly fixes.

---

## 4. What is still outstanding, and why it is not a footnote

**The four M0-T1 queries have not been run against the deployed database.** The plan's fallback is
explicit: if the measurement cannot be run, take the conservative branch of every fork and record
that the index was deferred _for lack of evidence rather than for a reason_.

The local answers make that fallback less likely to be needed — `app_test` is created by the same
migrations and populated by the same sign-up path — but "the schema is the same" is a claim about
**code** and CQ-2 is a question about **rows**. The one that cannot be inferred is Q3: a mismatched
`account_id` would come from a data event, not from a schema difference, and it locks a real person
out with no self-service route.

The pre-flight query in [`migration-design.md`](migration-design.md) answers all four in one
statement and is read-only. It is the last thing that should run before the M2 release is cut.
