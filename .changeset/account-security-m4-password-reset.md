---
'@repo/web': minor
---

Add the signed-out password-reset flow behind `VITE_PASSWORD_RESET` (ADR-0074 M4, default off).

A signed-out user can now ask for a reset link and set a new password unaided. Until now the only
route back into a locked account ran through an operator with database access.

`/forgot-password` shows **one** submitted state whatever the truth, and never promises delivery:
the endpoint answers identically for a known and an unknown address and even performs a dummy
lookup so the timing matches, so a UI that branched would hand back the enumeration oracle the
library closed. "Reset is not available on this installation" is kept clearly distinct from "no
such account" — it is a fact about the deployment, not about the address just typed.

`/reset-password` captures the emailed token into component state and strips it from the URL with
`replace: true`, so a live token does not persist in history or ride along in a later referrer.
Success ends at a "Sign in" link rather than a navigation into the app, because the reset endpoint
issues no session. Both screens are `noindex`, via a hook extracted from the guest-share view so
the two cannot drift on the unmount cleanup.

Both routes **and the sign-in link** are gated on the one constant. That is load-bearing:
`pnpm typecheck` cannot catch a link to a conditionally-registered route, so splitting them across
changes is how the link becomes a link to nothing. Flag-off is byte-for-byte the prior product,
pinned by `password-reset.parity.test.tsx`.
