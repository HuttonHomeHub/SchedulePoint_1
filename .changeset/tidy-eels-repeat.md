---
'@repo/api': patch
---

**If you run this yourself, the term to alert on for mail failures has changed.** Every failed
send now logs `event: "mail.send_failed"`, with a field naming which message it was (invitation,
email verification or password reset), the recipient, and the error — never a URL or token.

This matters because the previously documented signal could not fire. `docs/DEPLOYMENT.md` told
you to watch for Better Auth's `Failed to run background task`; a change one day earlier made the
mail adapter handle its own errors, so that line stopped being reachable from a mail failure. An
alert set up exactly as documented would have stayed quiet through a complete mail outage. The
deployment guide is corrected, along with a section that still claimed there was no password-reset
flow.

Nothing changes for people using the app. Delivery of these messages remains best-effort by
design: a sign-up still succeeds even if its verification email cannot be sent, so the log is the
place a broken mail server shows up.
