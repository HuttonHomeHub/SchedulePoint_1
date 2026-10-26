---
'@repo/api': minor
---

Importing a P6 XER or an MS Project file now brings its activity remarks across as activity notes. They are written in the same transaction as the plan, are authored by the person who imported (so only they can edit or delete them), and are removed with the plan if the import cannot finish. The import report gains a `mapped.notes` count, and the audit entry for an import records `noteCount`.
