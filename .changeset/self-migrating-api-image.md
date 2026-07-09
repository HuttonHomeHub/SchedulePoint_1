---
'@repo/api': patch
---

Make the API container self-migrating and publish GitHub Releases. The API image
now ships the Prisma CLI + schema/migrations and applies pending migrations on
startup (`prisma migrate deploy`) via its entrypoint, so a fresh database is
migrated automatically — no out-of-band step. The release workflow now also
creates a GitHub Release for each `vX.Y.Z` tag so the Releases tab reflects
published versions.
