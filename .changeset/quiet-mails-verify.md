---
'@repo/api': minor
---

Send the email-verification link (Theme B2). `AUTH_REQUIRE_EMAIL_VERIFICATION` has existed since
ADR-0016 and the accept-time `emailVerified` gate was already wired to it, but no verification email
was ever sent — so the switch could only lock people out, and the docblock claiming the message "is
sent but not blocking" was wrong on both halves. Better Auth now sends it on sign-up through the
`MailService` port.

The two messages fail differently, deliberately. An invitation swallows a send error because its
accept URL is also returned in the create response and shown in the admin UI; a verification failure
propagates and fails the sign-up, because the verify URL exists only in that email and a silently
unusable account is worse than a sign-up you can retry.

In production the API now refuses to boot with `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and no
`MAIL_SMTP_URL` — without a transport the link is written to the server log and nowhere else.
