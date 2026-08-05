---
'@repo/api': minor
'@repo/types': minor
'@repo/web': patch
---

Stop blocking every invitee from accepting an invitation (ADR-0074 M5).

The accept screen refused anyone whose address was unverified — but unless a deployment enforces
verification, **no** address is verified, so it refused everyone, telling them to confirm an address
the server did not require and hiding Accept behind it.

The invitation preview now reports whether this server actually enforces verification, and the
screen refuses only when it does. The client had no other way to know, and guessing was the defect.
