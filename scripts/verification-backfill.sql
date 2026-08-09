-- Email-verification enforcement: the count, then the backfill (ADR-0074 M5-T6/T7,
-- `docs/TECH_DEBT.md` #16, programme M4).
--
-- Run the COUNT first, read it, and only then run the BACKFILL. That ordering is the whole point:
-- the backfill writes `email_verified = true` and **does not roll back** — there is no record of
-- which rows were already true, so re-running the inverse would un-verify accounts that had earned
-- it honestly. Every other step in this programme is reversible; this one is not.
--
-- Usage on the host:
--   docker compose exec -T db psql -U app -d app -v ON_ERROR_STOP=1 -f verification-backfill.sql
-- (the file only SELECTs; the UPDATE is commented out and has to be run deliberately).

\echo ''
\echo '=== 1. Total accounts that have not verified their address ==='
-- The population the flip acts on. If this is small, the strict option (no backfill; everyone
-- re-verifies) costs almost nothing and is the cleaner answer — which is why the count comes first
-- rather than being a formality after the decision.
SELECT count(*) AS unverified_total
FROM users
WHERE email_verified = false;

\echo ''
\echo '=== 2. Of those, how many already hold an organisation membership ==='
-- ADR-0074 M5 recommends backfilling exactly this set: enforcement's value is prospective, and
-- holding a membership means somebody already accepted them into an organisation.
SELECT count(DISTINCT u.id) AS unverified_with_membership
FROM users u
JOIN org_members m ON m.user_id = u.id
WHERE u.email_verified = false;

\echo ''
\echo '=== 3. THE RISK SET: unverified, NO membership, but holding a PENDING invitation ==='
-- **This is the figure the CQ-1 decision turns on.**
--
-- The product owner chose to backfill *everyone*, not only members. The members-only predicate
-- existed to exclude exactly one case, and this query is that case: an address that registered an
-- account and has a pending invitation waiting but no membership yet. Backfilling it marks the
-- account verified, so it can accept the invitation without ever proving it controls the mailbox —
-- which is the account-squatting path enforcement exists to close.
--
-- It is very likely **zero**, and if it is, both CQ-1 options were identical and there was nothing
-- to decide. If it is not zero, these are named rows: look at them before running the backfill and
-- take the decision on real addresses rather than on a hypothetical.
SELECT u.id, u.email, i.organization_id, i.expires_at
FROM users u
JOIN invitations i ON lower(i.email) = lower(u.email)
LEFT JOIN org_members m ON m.user_id = u.id
WHERE u.email_verified = false
  AND m.id IS NULL
  AND i.status = 'PENDING'
  AND i.deleted_at IS NULL
  AND i.expires_at > now()
ORDER BY u.email;

\echo ''
\echo '=== 4. DRY RUN — exactly the rows the backfill would write ==='
-- Per the CQ-1 decision this is every unverified account, not only the members. Read the count
-- against (1): they should match, and a mismatch means this file and the decision have drifted
-- apart, which is worth stopping for.
SELECT count(*) AS rows_the_backfill_would_update
FROM users
WHERE email_verified = false;

\echo ''
\echo '=== 5. THE BACKFILL — commented out deliberately ==='
\echo 'Read (3) first. Then uncomment the UPDATE below and re-run. It does not roll back.'
--
-- UPDATE users
-- SET email_verified = true
-- WHERE email_verified = false;
--
-- Then, and only then, set AUTH_REQUIRE_EMAIL_VERIFICATION=true and recreate the API
-- (docs/DEPLOYMENT.md, "Turning verification on").
