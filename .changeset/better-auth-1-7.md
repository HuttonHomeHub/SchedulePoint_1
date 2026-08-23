---
'@repo/api': minor
'@repo/web': minor
---

Move Better Auth from `~1.6.28` to `^1.7.1`, lifting the deliberate hold.

The pin existed to stop 1.7 arriving unattended, because 1.7 scopes account identity by an `issuer`
column and reads it in the sign-in predicate. That column shipped in the previous release, so the
library can now follow. Verified with the suite that found the problem: `scripts/e2e-local.sh api`
goes from the recorded 522-of-559 failures at 1.7 without the column to **565/565**, plus the three
account journeys (public screens, password reset with session revocation, change password,
verification enforcement) against a real API.

Both workspaces move together. That was the intended default, but it is also **forced**: the
dependency-claims register holds one verified version per package and resolves a package by the
first matching store directory, so a split estate makes the gate verify the API's claims against the
web client's copy — which it did, silently and green, while the API ran 1.7.1. The bundle
falsification condition was measured anyway and passes with room: **+74 bytes gzip** on the initial
bundle against a 5,120-byte threshold.

All 37 `better-auth` citations were re-anchored at 1.7.1. Seven were unchanged, 25 moved, and five
could not be placed mechanically and were read by hand — two of those are refactors that preserve
the behaviour but need new anchors rather than shifted line numbers.
