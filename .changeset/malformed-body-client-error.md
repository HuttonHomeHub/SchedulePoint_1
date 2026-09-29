---
'@repo/api': patch
---

A request body the API cannot read (truncated or malformed JSON, an aborted upload, an unsupported
charset or content encoding) now answers a 400 or 415 in the standard error envelope instead of an
opaque 500, and is no longer logged as a server fault. The API also no longer parses
`application/x-www-form-urlencoded` bodies, which nothing used and which took up to 100 KB from
anonymous callers.
