---
'@repo/api': minor
---

Deleting a single activity, link or resource assignment, and dissolving a summary, now accept an optional version. When it is sent and the row has changed since, the request is refused with 409 and nothing is deleted. Without it the routes behave exactly as before. The audit entry for a dissolved summary now records the batch it can be restored from.
