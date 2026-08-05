---
'@repo/web': minor
---

Add the `/account` screen behind `VITE_ACCOUNT_SETTINGS` (ADR-0074 M3, default off).

A signed-in member can now change their password and see whether their address is verified, with a
resend if it is not. Both endpoints have always been reachable — there was simply no screen — so
this flag gates a **product decision**, unlike the M2 work, whose gate is a server-side condition
and therefore ships unflagged.

Changing a password always signs the other sessions out, with no checkbox: the reason someone
changes a password is usually that they think somebody else may know it, so a checkbox defaulted
either way asks a session-management question at the worst possible moment. The screen says so
before submit instead. A wrong current password is attached to that field rather than dropped in a
banner above three inputs, only one of which is wrong.

Deliberately not a settings information architecture — theme stays in the account menu, and the
screen is the smallest surface that hosts the two things a person needed and had nowhere to do.

Flag-off is byte-for-byte the prior product: no route is registered and the account menu has no
entry, pinned by `account-settings.parity.test.tsx`.
