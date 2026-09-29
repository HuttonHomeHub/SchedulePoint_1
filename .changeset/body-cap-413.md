---
'@repo/api': patch
---

A request body over the size limit is now refused with a 413 and the standard error envelope
(`PAYLOAD_TOO_LARGE`) instead of an opaque 500, and the batch endpoints that accept up to 2,000
activities (positions, placements, parents, bulk delete) now accept a full batch: the limit under
`/api/v1/organizations` is 512 KB, while routes reachable without a session keep 64 KB.
