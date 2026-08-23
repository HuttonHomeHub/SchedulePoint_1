# ADR-0107 — A migration a pristine database cannot test

- **Status:** Accepted (M0–M6 landed 2026-08-23)
- **Date:** 2026-08-23
- **Supersedes:** nothing. **Amends:** nothing. ADR-0018 (the self-migrating image), ADR-0003
  (Better Auth) and ADR-0047 (auto-pull) are the load-bearing context rather than subjects.
- **Spec:** [`docs/specs/better-auth-1-7-account-issuer/`](../specs/better-auth-1-7-account-issuer/) —
  [feature spec](../specs/better-auth-1-7-account-issuer/feature-spec.md),
  [plan](../specs/better-auth-1-7-account-issuer/implementation-plan.md),
  [migration design](../specs/better-auth-1-7-account-issuer/migration-design.md),
  [M0 measurement](../specs/better-auth-1-7-account-issuer/m0-measurement.md),
  [M5 decision](../specs/better-auth-1-7-account-issuer/m5-web-decision.md).
- **Register row:** `docs/TECH_DEBT.md` #176.

## Context

Better Auth 1.7 scopes account identity by an `issuer` column: `TEXT NOT NULL`, no default, declared
`UNIQUE (issuer, accountId)`, and read by the sign-in predicate. `better-auth` had been pinned
`~1.6.28` in both workspaces specifically to stop it arriving unattended. Measured before any of
this was designed: at 1.7 **without** the column, `scripts/e2e-local.sh api` fails **522 of 559**
tests across 37 of 42 files.

The decision worth recording is not "add a column". It is **what to do when the failure mode is a
property of the data, and every automatic gate runs against data that cannot exhibit it.**

## D1 — The migration is hand-written, because the generated one is a trap

`prisma migrate diff` generates one statement for this model change:

```sql
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT NOT NULL;
```

That **succeeds on an empty table and fails on a populated one**. CI provisions a pristine Postgres
container, so `migrate deploy`, `prisma:check-drift` and all 565 API e2e tests go green against it —
verified, not assumed. The failure lands instead on the deployed host, inside
`docker-entrypoint.sh` under `set -e` (ADR-0018), where the API never starts. Also verified against
a real database: the first run leaves `P3018` and the schema clean, and **every retry thereafter
reports `P3009`**, so the container restart-loops until a person runs
`prisma migrate resolve --rolled-back`. On a host that auto-pulls releases (ADR-0047), nobody is
watching when that happens.

So the file is five ordered steps, each carrying its reason. **The ordering is load-bearing twice**:

- the `DEFAULT` is set **after** the backfill, never as part of step 1. In step 1 it would silently
  give a non-credential row the credential issuer; after step 3 it leaves the guard free to abort
  loudly on anything uncovered, while still serving the rollback;
- the repair (D3) is **first**, so a row it fixes is a row the unique index no longer refuses.

## D2 — The `DEFAULT` exists for the rollback, not for the library

1.7 always writes `issuer` explicitly (`createLocalAccountIssuer("credential")`), so the library
never observes the default. Without it, the stated rollback — redeploy the previous image tag — does
not work: a pre-1.7 image writes no `issuer`, and against a `NOT NULL` column with no default its
sign-up fails. **The rollback would cause a worse outage than the fault it rolls back.**

The migration design initially had no default and named image-redeploy as the rollback. The two were
written by different passes and neither noticed the other; the conflict surfaced only when the two
documents were read side by side.

**This was then demonstrated rather than argued, by a gate run for another reason.** The API e2e
suite runs at 1.6.28 against the migrated schema, and afterwards the account row it had created
through the real sign-up path read `issuer = local:credential` — a value 1.6.28 never wrote. The
same query showed `account_id = user_id` for that row, which is the premise D3 rests on, observed in
the product rather than read off `sign-up.mjs`. The suite's pass/fail said nothing about either.

## D3 — Repair `account_id <> user_id`, and the guard took two attempts

1.7's sign-in predicate gained **two** new conjuncts, not one. Read side by side:

- 1.6.28 — `user.accounts.find((a) => a.providerId === "credential")`
- 1.7.1 — `…find((account) => account.providerId === "credential" && account.issuer === credentialIssuer && account.accountId === userRecord.user.id)`

**No `issuer` backfill helps the third.** A row failing it answers `INVALID_EMAIL_OR_PASSWORD` — the
user is told their password is wrong — and reset-password then takes the _create_ branch and writes
them a second credential row, so the product appears to heal itself while the data goes wrong.

The product owner chose to repair those rows, with the deployed table deliberately unmeasured. The
guard is where this ADR is most worth reading.

**The first guard was wrong in two ways at once**, and both were found by re-reading the finished
file rather than by anything failing. It refused to repair a row when the user already had a correct
one, on the stated grounds that repairing it would create the duplicate step 5 refuses:

- **the stated reason was false.** A correct row and a stale row carry _different_ `account_id`s, so
  they are not a unique violation at all. That false half was in the migration's comment **and** in
  a test name, and the test passed the whole time because it asserted the right rows for a reason
  that was not true;
- **it missed the shape that actually breaks.** A user with **two wrong rows** has no correct row,
  so neither was excluded: both were repaired to the same `account_id`, the index refused the
  duplicate, and the whole migration aborted — the restart loop of D1, caused by the repair meant to
  help. Reproduced against Postgres before anything was changed.

The shipped guard is a **count**: repair only where the user has exactly one credential row, which
cannot collide because there is nothing to collide with. Every other shape is left as found — two
wrong rows leave that user locked out, which is where they already were, because a migration has no
basis for choosing which row is theirs; two already-correct duplicates are refused by step 5, which
is right, because two accounts for one person is not something to merge silently.

## D4 — Two releases, so the halves fail separately

The schema landed alone (`api-v0.52.0`, still running 1.6.28, which never reads the column); the
library followed. This is `docs/DEPLOYMENT.md`'s expand/contract rule applied literally, and it is
what makes D2's rollback a redeploy rather than a restore. The cost is one extra release cycle.

## D5 — The test reads the shipped migration file

`apps/api/test/account-issuer-migration.e2e-spec.ts` runs the SQL **read from the migration file**,
never restated, in a scratch schema with `search_path` pointed at it. A restated copy passes while
the file it claims to test drifts.

Six cases, and **each was verified red against the specific defect it guards** rather than against
nothing:

| Case                                                   | Verified red against                   |
| ------------------------------------------------------ | -------------------------------------- |
| backfill / uncovered provider aborts / rollback INSERT | the naive `ADD COLUMN … NOT NULL` form |
| repairs a mismatched `account_id`                      | the file with step 0 deleted           |
| leaves a user with more than one credential row alone  | step 0's earlier `NOT EXISTS` guard    |

Two blind spots are recorded in the file rather than left implicit: the uncovered-provider case
passes equally against the naive form (which aborts at step 1 with the same SQLSTATE), so the
backfill case is its discriminator; and the more-than-one-row case passes equally against a
migration with no repair at all, so the repair case is its discriminator.

## D6 — Both workspaces take the bump, and the reason is not the bundle

`apps/api` was bumped first with `apps/web` left behind, and `pnpm check:claims` then reported
**52 claims OK against `better-auth@1.6.28`** while the API loaded 1.7.1. Green, against a version
the application no longer ran. That is `docs/TECH_DEBT.md` #178 in its stated "dangerous direction —
the quiet one", observed live.

It is structural, not a slip: the resolver takes the **first** matching store directory, and
`verifiedAgainst` holds **one version per package**. So a split estate makes the claims register
unable to describe the code that ships, whichever way it is set. The bundle falsification condition
was measured anyway — **+74 bytes gzip** against a 5,120 threshold — so the two arguments agree and
there was no conflict to escalate. Details in
[`m5-web-decision.md`](../specs/better-auth-1-7-account-issuer/m5-web-decision.md).

#178 is **worked around, not closed**: the workaround is "only ever install one version of a cited
package", which held only because the split was ours to remove. Fixing the resolver is a shared-gate
change and fires ADR-0105's trigger, so it was not smuggled into a dependency bump. Neither was
**#181**, filed here: a `ref` is `basename:lines` and carries no version, so a citation into 1.7.1 at
a line coinciding with a registered 1.6.28 one **passed the gate** and read as re-read evidence.

## Consequences

- The `accounts` table carries a column the application never writes and never reads; only the
  library does. `docs/DATABASE.md`'s conventions are followed except the index name, which uses
  Prisma's default deliberately — `uq_accounts_issuer_account_id` reads as a _renamed_ index to
  `prisma:check-drift` unless also `@@map`ped, and `plan_shares_token_hash_key` sets the precedent.
- `CONCURRENTLY` is **unavailable, not declined**: it cannot run inside a transaction and
  `prisma migrate deploy` wraps a migration file in one. Moot at 85 rows; recorded because it bounds
  any future index on this table.
- The backfill is metadata-cheap but not free at scale: `ADD COLUMN` is 0.4–0.7 ms flat from 85 to
  1,000,000 rows, while the `UPDATE` writes a second MVCC version of every row — measured at 1M,
  one dead tuple per live tuple until autovacuum.
- **The CPM engine is not imported and the ADR-0034 recalculation parity gate is untouched** — in
  its honest form: there is nothing here to hold parity for.

## What no gate here can tell us

Three actions on the deployed host, after **each** of the two releases: sign in as a user whose
account predates the migration, change a password, complete a reset. The product owner declined the
read-only pre-flight query, so the deployed `accounts` table was never measured; a migration failure
appears as the API **restart-looping**, not as a broken page.
