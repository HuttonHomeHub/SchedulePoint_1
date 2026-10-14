---
'@repo/api': minor
---

Every organisation response (`GET /organizations`, `GET /organizations/{orgSlug}`, and the create and accept-invitation replies) now carries `retentionActive` and `retentionDays`: whether the recycle bin's clear-out is on for this server, and its period in days. Both are additive and need a signed-in user; the public `/version` route does not carry them.
