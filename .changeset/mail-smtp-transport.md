---
'@repo/api': minor
---

Invitation emails can now actually be sent, over SMTP.

`common/mail/` has been a logging stub since it was built, so invitations were logged and never
delivered. It now binds an SMTP adapter when `MAIL_SMTP_URL` is configured, and keeps the stub
when it is not — so nothing changes for an operator who does not set it.

SMTP rather than a provider SDK: Postmark, SES, Resend, Fastmail and a self-hosted relay all
speak it, so which provider you use is configuration rather than a dependency. A send failure is
logged and swallowed, because the accept URL is also returned in the create response and shown in
the app — a mail outage must never make an invitation fail.
