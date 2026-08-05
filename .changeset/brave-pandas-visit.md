---
'@repo/api': patch
'@repo/web': patch
---

**Waiting to verify your email now reads honestly.** The screen said "We sent you a link to confirm
your address" — a claim the app cannot actually make, because a failed send never reaches the page.
Somebody staring at an empty inbox was being told flatly that it had been sent. It now says a link
_should_ arrive, shows the address it went to (a typo at sign-up is the commonest reason nothing
turns up), and — if a new link does not help either — says to ask whoever set up your organisation,
because at that point the problem is at our end and resending will not fix it.

**For anyone running SchedulePoint themselves:** the API now checks the mail server is reachable
once at start-up and logs `mail.transport_verified` or `mail.transport_unreachable`, with the host
and port and never the password. It will not stop the API starting if the mail server is down — a
relay blip overnight should not take the whole application with it — and it is deliberately not part
of the health check. It cannot tell you everything: a key that can log in but not send, or mail that
is accepted and then bounced, still only show up when a message is actually sent. Completing one
real sign-up to a real mailbox remains the check that matters.
