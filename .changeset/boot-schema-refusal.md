---
'@repo/api': patch
---

The boot database check now refuses a `DATABASE_URL` whose `schema` parameter names anything other than `public`
(reason `other_schema`, the usual three-line refusal, nothing read or written). The check reads the `public` schema
only, so a pre-1.1 database living in another schema used to read as an empty one and be accepted as fresh. The
shipped compose files use `schema=public` and are unaffected.
