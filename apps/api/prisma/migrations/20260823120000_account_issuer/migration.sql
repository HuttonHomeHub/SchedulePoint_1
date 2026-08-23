-- Better Auth 1.7: account identity is scoped by issuer.
--
-- `accounts.issuer` is TEXT NOT NULL with no default in the library's own schema, and 1.7's
-- sign-in predicate reads it. Prisma's generated form for the model change is a single
-- `ADD COLUMN "issuer" TEXT NOT NULL`, which succeeds on an empty table and FAILS on a populated
-- one — so CI, which provisions a pristine container, cannot catch it and the failure would land
-- on the deployed host inside `docker-entrypoint.sh` (ADR-0018), where `set -e` turns it into a
-- restart loop that a human has to break with `prisma migrate resolve --rolled-back`.
--
-- Hence the four steps below. The ordering is load-bearing: the DEFAULT is added AFTER the
-- backfill, never as part of step 1. Adding it in step 1 would silently give a non-credential row
-- the credential issuer; adding it in step 4 leaves step 3 free to abort loudly on any row the
-- guard did not cover, while still giving a rolled-back pre-1.7 image something to INSERT.
--
-- Measured on a 85-row copy of the deployed shape: 4.0 ms warm, 94.4 ms cold (the deployed
-- migration runs cold, on a container that has just started). At 1,000,000 rows: 14.57 s, of
-- which the backfill is 10.7 s and leaves one dead tuple per live tuple until autovacuum.
-- See docs/specs/better-auth-1-7-account-issuer/m0-measurement.md.

-- 0. Repair credential rows whose `account_id` is not the user's id.
--
--    This is not about `issuer`, and no issuer backfill would help such a row: 1.7's sign-in
--    predicate is `providerId === 'credential' && issuer === 'local:credential' && accountId ===
--    user.id`, and the third conjunct is also new. An affected user is told their password is
--    wrong, and reset-password then takes the CREATE branch and writes them a SECOND credential
--    row — so the product appears to heal itself while the data goes wrong. Doing nothing here
--    ships a known lockout with no self-service route out of it. Product-owner decision,
--    2026-08-23, taken with the deployed table unmeasured; the measured database has zero such
--    rows (m0-measurement.md Q3), so on that data this statement is a no-op.
--
--    The guard is load-bearing, and it is a COUNT rather than a NOT EXISTS. An earlier draft
--    refused only when a correct row already existed, and a probe found that insufficient: a user
--    with TWO wrong credential rows has no correct row, so both were repaired to the same
--    `account_id`, the index at step 5 refused the duplicate, and the whole migration aborted —
--    the restart loop this file exists to avoid, caused by the repair meant to help. Repairing
--    only when the user has exactly ONE credential row cannot collide with anything, because there
--    is nothing to collide with. Every other shape is left exactly as it was found:
--
--      * one wrong row                -> repaired.
--      * one correct + one wrong      -> untouched. The correct row still satisfies all three
--                                       conjuncts, so that user signs in; the stale row is inert.
--      * two wrong rows               -> untouched. That user stays locked out, which is where
--                                       they already were, and nothing else breaks. A migration
--                                       has no basis for choosing which of two rows is theirs.
--      * two rows already correct     -> a genuine duplicate; step 5 refuses it, which is right.
--                                       Two accounts for one person is not something to merge
--                                       silently.
UPDATE "accounts" a
   SET "account_id" = a."user_id"
 WHERE a."provider_id" = 'credential'
   AND a."account_id" <> a."user_id"
   AND (
         SELECT count(*) FROM "accounts" b
          WHERE b."user_id" = a."user_id"
            AND b."provider_id" = 'credential'
       ) = 1;

-- 1. Add it nullable. Metadata-only on PostgreSQL 11+ (0.4-0.7 ms flat from 85 to 1,000,000 rows,
--    which a table rewrite could not be). No default yet — see the note above.
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;

-- 2. Backfill, guarded on provider_id rather than written blanket. This install is credential-only
--    in code (no `socialProviders` in `common/auth/better-auth.ts`) and in data (85/85 rows on the
--    measured database), so the guard is expected to cover every row — it is here so that if it
--    ever does not, step 3 refuses rather than step 2 inventing an issuer for a provider whose
--    correct value is `local:oauth:<provider>`.
UPDATE "accounts"
   SET "issuer" = 'local:credential'
 WHERE "provider_id" = 'credential'
   AND "issuer" IS NULL;

-- 3. Constrain. Aborts the whole migration if step 2 left any row NULL, which is the loud failure
--    the guard exists to produce.
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;

-- 4. The default, for the rollback path only. Better Auth 1.7 always writes `issuer` explicitly
--    (`createLocalAccountIssuer(providerId)`), so the library never observes this. What it buys is
--    that redeploying a pre-1.7 image against this schema still works: that image writes no
--    `issuer`, and against a NOT NULL column with no default its sign-up would fail — a rollback
--    that causes a worse outage than the fault it rolls back.
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET DEFAULT 'local:credential';

-- 5. Better Auth's own declared unique. Nothing in the runtime needs it — the Prisma adapter
--    answers `findOne` with `findFirst` — so this is a data-integrity choice, taken because the
--    measurement found zero duplicates on either `account_id` or `(provider_id, account_id)`.
--    CONCURRENTLY is unavailable, not declined: it cannot run inside a transaction and
--    `prisma migrate deploy` wraps each migration file in one.
--    Prisma's default name is used deliberately: `uq_accounts_issuer_account_id` (DATABASE.md:31)
--    reads as a renamed index to `prisma:check-drift` unless it is also `@@map`ped, and the
--    existing full unique `plan_shares_token_hash_key` sets the same precedent.
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");
