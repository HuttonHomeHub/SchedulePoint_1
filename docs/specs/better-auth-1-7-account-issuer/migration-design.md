# `accounts.issuer` — migration design

The `database-architect` pass CLAUDE.md §19.3 requires, recorded here rather than left in a
transcript. It ran in parallel with the feature spec; the spec states requirements, this states the
DDL. **Where the two disagree, §"Reconciliation" below is the resolution.**

Every figure was measured against a real Postgres built from all 57 committed migrations, not
reasoned about.

## The blocking finding: the obvious migration is green in CI and fatal on the host

`prisma migrate diff` generates exactly this for the model change:

```sql
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT NOT NULL;
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");
```

| Target                                                           | Result                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Empty `accounts` (CI provisions a pristine `postgres:17-alpine`) | **succeeds**                                                         |
| Populated `accounts` (85 real rows)                              | `ERROR: column "issuer" of relation "accounts" contains null values` |

**CI structurally cannot catch this**, and neither can the API e2e suite: both start from an empty
table, so `migrate deploy`, the drift check and all 559 tests go green. #176 records that only the
real e2e suite caught the 1.7 break. This is one level worse — the only thing that reproduces it is
a migration applied to a database with rows in it.

## A failed migration is a permanent crash loop, not a retry

Measured with the real Prisma CLI:

- first failure → `P3018`; `_prisma_migrations` records `finished_at = NULL`, `applied_steps_count = 0`
- **second attempt → `P3009`** — Prisma refuses to apply anything while a failed migration is recorded

`apps/api/docker-entrypoint.sh` is `set -e` + `prisma migrate deploy` + `exec node dist/main.js`, so
the container dies, restarts, and fails identically forever. **The API never starts and no number of
restarts fixes it.** Recovery needs a human:

```
prisma migrate resolve --rolled-back "<timestamp>_add_account_issuer"
# fix the data or the migration, then redeploy
```

The schema is left **clean** in every failure case — Prisma wraps each migration file in one
transaction (verified: a migration whose first statement created a table and whose second failed
left no table). So recovery is bookkeeping plus data, never a half-altered table.

## The backfill must be a guarded constant, never derived

Both candidates were run against a planted OAuth row — what a future `socialProviders` config would
create:

| Candidate                                                          | Outcome                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `SET issuer = 'local:'                                             |                                                                    | provider_id` | **succeeds**, writes `local:google`. The library produces `local:oauth:google`, so `findAccountOwnerByKey` never resolves the row and that user silently cannot sign in. No error anywhere. |
| `SET issuer = 'local:credential' WHERE provider_id = 'credential'` | leaves NULL, `SET NOT NULL` raises, **whole migration rolls back** |

The guarded constant is the design: fail-closed in the same sense as `ck_notes_exactly_one_parent`.

## Premises checked, not inherited

| Claim                                      | Verdict | Evidence                                                                                                                                                                                                        |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer: z.string()`, not nullish          | ✅      | `@better-auth/core@1.7.1/dist/db/schema/account.mjs:6`                                                                                                                                                          |
| `UNIQUE (issuer, accountId)` declared      | ✅      | `dist/db/get-tables.mjs` `account.indexes`                                                                                                                                                                      |
| credential issuer is `local:credential`    | ✅      | `better-auth@1.7.1/dist/api/routes/sign-up.mjs:246`                                                                                                                                                             |
| **credential-only installation**           | ✅ ×4   | no `socialProviders` anywhere; no `plugins` key; **no code in this repo inserts an `Account` row** (`grep '\.account\.\(create\|createMany\|upsert\)'` → zero hits); 85/85 live rows `provider_id='credential'` |
| `account_id = user_id` for credential rows | ✅      | library `sign-up.mjs:247`; data 85/85                                                                                                                                                                           |

> **Every citation above is a store read of an UNINSTALLED version.** `apps/api` has `1.6.28`
> installed; the `1.7.1` directory is an orphan left by the reverted bump — `docs/TECH_DEBT.md`
> **#178 live in this working tree**. Delete the orphan before registering any citation, or
> `check:claims` may resolve the wrong directory and pass.

## Model change

```prisma
model Account {
  id                    String    @id
  accountId             String    @map("account_id")
  issuer                String
  providerId            String    @map("provider_id")
  ...
  @@unique([issuer, accountId])
  @@index([userId])
  @@map("accounts")
}
```

No `@map` on `issuer` — already snake-case-identical, like `scope` and `password`. This unique
**must** be declared in Prisma, unlike the schema's `uq_*` partial uniques which are raw-SQL-only:
it is full, so Prisma sees it, and an undeclared-but-present index is drift.

**Index naming is a live trap.** `docs/DATABASE.md:31` prescribes `uq_<table>_<cols>`; Prisma's
default for a declared `@@unique` is `accounts_issuer_account_id_key`. Measured against
`prisma:check-drift`:

| Migration creates                | Model declares                   | Drift check                |
| -------------------------------- | -------------------------------- | -------------------------- |
| `accounts_issuer_account_id_key` | `@@unique([issuer, accountId])`  | **exit 0**                 |
| `uq_accounts_issuer_account_id`  | `@@unique([issuer, accountId])`  | **exit 2** — renamed index |
| `uq_accounts_issuer_account_id`  | `@@unique([...], map: "uq_...")` | **exit 0**                 |

Following `DATABASE.md` naively breaks CI (TECH_DEBT #54's class). The Prisma default matches the
existing full-unique precedent `plan_shares_token_hash_key`.

## One migration, not several

`DATABASE.md:44-46`'s expand/contract rule exists for zero-downtime rollouts where old and new code
run concurrently. That premise fails twice here: the entrypoint migrates **then** starts the server,
so the two are one atomic act on one host; and the column is written by the library on every insert,
so no code version can run against the half-migrated state. Splitting also multiplies the crash-loop
risk — three migrations are three chances to leave a `P3009`.

## Locks and duration, observed in `pg_locks`

| Statement                           | Lock                  | Blocks                            |
| ----------------------------------- | --------------------- | --------------------------------- |
| `ADD COLUMN` (nullable, no default) | `AccessExclusiveLock` | everything, metadata-only, sub-ms |
| `UPDATE` (backfill)                 | `RowExclusiveLock`    | concurrent writers                |
| `SET NOT NULL`                      | `AccessExclusiveLock` | everything, full validation scan  |
| `CREATE UNIQUE INDEX`               | `ShareLock`           | writes; reads proceed             |

All four run in **one** transaction, so the `AccessExclusiveLock` is held to commit — `accounts` is
fully locked, readers included, for the whole migration. That is acceptable only because of the
duration, and because the entrypoint migrates before any traffic exists.

| `accounts` rows            | Total      |
| -------------------------- | ---------- |
| **85 (this installation)** | **6.0 ms** |
| 1,000                      | 14.2 ms    |
| 10,000                     | 113.9 ms   |
| 100,000                    | 951 ms     |
| 1,000,000                  | ~15.5 s    |

At 1M the backfill `UPDATE` is 11.4 s of it and the index 4.0 s — the backfill dominates, not the
index. `CREATE INDEX CONCURRENTLY` is **impossible** inside a Prisma migration (verified:
`cannot run inside a transaction block`) and unnecessary below ~100,000 accounts. At ~1M the remedy
is to move the _backfill_ out of the transaction, not the index.

## No index on `issuer` alone

`findAccountOwnerByKey({ issuer, accountId })` filters on both, so the composite is an exact match,
not a leftmost-prefix match. And on this installation `issuer` has one distinct value across 100% of
rows — a btree on a constant can never be selective. There is no query pattern to measure.

## Pre-flight, to run against the PRODUCTION database before the release is cut

The migration's own guard is the second line of defence; this is the first.

```sql
SELECT
  count(*)                                                   AS total_accounts,
  count(*) FILTER (WHERE provider_id <> 'credential')         AS non_credential_rows,
  coalesce(string_agg(DISTINCT provider_id, ', '), '(none)')  AS provider_ids,
  (SELECT count(*) FROM (
     SELECT 1 FROM accounts WHERE provider_id = 'credential'
     GROUP BY account_id HAVING count(*) > 1) d)              AS duplicate_account_ids,
  count(*) FILTER (WHERE provider_id = 'credential'
                     AND account_id <> user_id)               AS account_id_ne_user_id
FROM accounts;
```

Ship only if `non_credential_rows`, `duplicate_account_ids` **and** `account_id_ne_user_id` are all
zero. The last column is the feature spec's addition, not the architect's — see below.

## Reconciliation: where the two passes disagree

**1. The spec found a second new conjunct the architect's design does not address.** 1.7's sign-in
predicate is `providerId === 'credential' && issuer === 'local:credential' && accountId === user.id`.
The third conjunct is **also new**, and no `issuer` backfill satisfies it. A row with
`account_id <> user_id` answers `INVALID_EMAIL_OR_PASSWORD` — the user is told their password is
wrong — and reset-password then takes the _create_ branch, writing a second credential row, so the
product appears to heal itself while the data goes wrong. **The spec is right and this is the more
dangerous half.** `account_id_ne_user_id` is therefore in the pre-flight above, and whether to repair
such rows in the migration is CQ-2, which is the product owner's call.

**2. The spec wants a database `DEFAULT` on the column; the architect's SQL has none.** The
architect's stated rollback is "redeploy the previous image tag", and that does not work without a
default: the old image writes no `issuer`, so on a `NOT NULL` column with no default **its sign-up
fails**. The rollback would create a worse outage than the fault. The spec's reasoning holds and the
DDL should carry `DEFAULT 'local:credential'` — the library never observes it, since 1.7 always
writes the value explicitly.

**3. The unique index is optional at runtime.** `@better-auth/prisma-adapter` answers `findOne` with
`findFirst`, so nothing breaks without it. It is a data-integrity choice with a real deploy-failure
mode, which is why the spec gates it on the measurement rather than taking it by default (CQ-3).
