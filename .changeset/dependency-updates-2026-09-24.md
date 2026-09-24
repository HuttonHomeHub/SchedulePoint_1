---
'@repo/api': patch
'@repo/web': patch
---

Routine dependency updates: NestJS 11.2.6, the rate limiter 6.7, the sign-in library 1.7.5, TanStack Query and Virtual, the icon set and tailwind-merge. No behaviour change is intended; every place the code relies on those libraries' internals was re-checked against the new versions.
