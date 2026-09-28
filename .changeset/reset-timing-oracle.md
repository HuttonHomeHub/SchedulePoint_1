---
'@repo/api': patch
---

`/request-password-reset` no longer answers a known address more slowly than an unknown one. Better
Auth's mail sends (password reset, email verification) now dispatch off the request path instead of
being awaited, so the endpoint's identical response body is no longer paired with a clock a caller
could read to tell the two cases apart. A rejection that somehow escapes the mail adapter's own
catch is still logged, never surfaced to the caller.
