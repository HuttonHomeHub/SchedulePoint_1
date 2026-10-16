---
'@repo/api': patch
---

A malformed id in a request path is now rejected by Nest's own UUID pipe, so the 400 message reads `Validation failed (uuid is expected)` instead of `Parameter must be a valid UUID.`; the status, the error envelope and the ids accepted (including v7) are unchanged.
