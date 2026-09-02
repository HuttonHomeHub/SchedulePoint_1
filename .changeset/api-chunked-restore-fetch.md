---
'@repo/api': patch
---

Restoring a very large deleted phase no longer reports a failure for a restore that succeeded. The response read the restored rows back in one statement, which exceeds Postgres' bind-parameter ceiling above roughly 32,767 activities — sixteen times the largest case anyone has measured, but the restore itself had already committed by then, so the error described the wrong outcome. It now reads them in chunks.
