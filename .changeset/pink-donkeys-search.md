---
'@repo/web': patch
---

Fix two dead ends on the email-verification path, both reachable only when an operator sets
`AUTH_REQUIRE_EMAIL_VERIFICATION` (ADR-0074 M5).

Following a verification link left the reader on the "we sent you a link" screen even though the
address had just been verified: the router JSON-parses search params, so `?verified=1` arrived as
the number `1` and the route discarded it. And the **first** verification email — the one sign-up
sends — carried no return destination, so it verified the address and then bounced the new member to
the sign-in screen with nothing said about why. Both send paths now point at the confirmation screen
through one shared constant.

Found by the flag-on journey (`test:e2e:account-verify`), which is now wired into CI.
