---
'@repo/web': minor
---

Turn on the account screens (ADR-0074 M5).

`VITE_ACCOUNT_SETTINGS` and `VITE_PASSWORD_RESET` are now default-on, so **Your account** appears in
the account menu — change your password, see whether your address is verified, resend the link — and
a signed-out person who has forgotten their password can ask for a reset from the sign-in screen
instead of needing an operator with database access.

Changing your password always signs you out everywhere else, and so does completing a reset; the
consequence is stated on screen before you submit rather than after.

Both flags remain rollbacks: set either to `false` and rebuild, and the app is byte-for-byte what it
was — the parity suites pin that.
