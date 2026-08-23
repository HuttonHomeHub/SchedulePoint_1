---
'@repo/api': minor
---

Add `accounts.issuer` ahead of the Better Auth 1.7 upgrade.

Better Auth 1.7 scopes account identity by issuer and reads the column in its sign-in predicate.
The column lands **before** the library bump so the two halves fail separately: this release still
runs 1.6.28, which never reads the column, and a database default lets a rollback to a pre-1.7
image keep inserting.

The migration is guarded rather than generated. Prisma's generated form for the model change is a
single `ADD COLUMN "issuer" TEXT NOT NULL`, which succeeds on an empty table — so CI, which
provisions a pristine database, cannot catch that it fails on a populated one, and the failure would
land unattended inside the API's self-migrating entrypoint. It is five steps instead: repair any credential
row whose `account_id` is not the user's id, add the column nullable, backfill guarded on
`provider_id`, `SET NOT NULL` (which aborts loudly on anything the guard missed), then the default
and Better Auth's declared `UNIQUE (issuer, account_id)`.

The repair is not about `issuer` at all. 1.7's sign-in predicate also requires
`accountId === user.id`, and a row failing that is told its password is wrong — after which
reset-password writes the user a second account row rather than repairing the first, so the product
appears to heal itself while the data goes wrong. It is guarded so it cannot itself create the
duplicate the unique index would then refuse.
