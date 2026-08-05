---
'@repo/api': patch
'@repo/web': patch
---

Fold the ADR-0074 M5 gate pass — six specialist reviews over the combined epic diff, and the
flag-on recovery journey.

The sharpest finding is a **server-side enumeration oracle**: Better Auth's anonymous
`/send-verification-email` equalises timing to 500 ms and mints a throwaway token for the
unknown-address branch so the work matches — and then rethrows a transport error, which
`better-call` turns into a bare 500. A caller submitting a candidate address therefore got a
distinguishable answer for "exists, unverified, and delivery just failed". `SmtpMailService` now
swallows and logs, matching `sendInvitation`; the reset send does the same, holding the property
rather than depending on a library internal for it.

The rest are client-side: the same outcome was announced twice through two live regions in four
components; focus was dropped to `<body>` whenever a form was replaced by its outcome; the sign-in
`EMAIL_NOT_VERIFIED` state had no way back to the form; the invitation-accept flow lost the status
announcement the old `InviteShell` carried; and `/verify-email` named "that link has been used" as
the cause — the one cause that cannot produce that state, since a second visit to an
already-verified address takes the library's success branch.
