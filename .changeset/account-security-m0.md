---
'@repo/api': minor
'@repo/types': minor
---

Account recovery: password reset now exists, and two blocking auth-wiring gaps are closed.

`POST /api/auth/request-password-reset` used to answer `RESET_PASSWORD_DISABLED` — the product
had no recovery path at all, not merely no screen for one. It now sends a reset link through the
`MailService` port, which gains a `sendPasswordReset` message on both adapters.

Two security fixes ship ahead of it, in that order deliberately:

- Verification identifiers are **hashed at rest** with this app's own `hashToken`. Unconfigured,
  Better Auth stores them in the clear, so a reset row would have held a usable
  account-takeover credential for an hour. Landing the hash before the endpoint makes that window
  empty rather than short.
- A completed reset now **revokes every other session**. It previously left them all alive,
  including a compromised one — and a compromise is a common reason to reset.

Three credential events (`auth.password_changed`, `auth.password_reset_requested`,
`auth.password_reset_completed`) join the audit vocabulary. The reset-request row takes the
attempted-address attribution shape, so it is readable by the account it named and by nobody else.

Better Auth's own logging is routed into Pino, so a swallowed mail-send failure reaches the
structured stream instead of stdout.

Also: the auth origin check is now explicitly enabled in every environment. Better Auth disables it
under `isTest()`, which meant the e2e suite had been proving a weaker posture than production ships.
