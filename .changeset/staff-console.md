---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Staff console (ADR-0086) — SchedulePoint's own operations surface, plus mail alerting and a CSP
report sink.

The most privileged operations in this product were the only unaudited ones: checking whether mail
is delivering, whether an account is stuck unverified, or what the Content-Security-Policy is
blocking all meant `psql` on the host, leaving no record that anyone had looked. `/staff` answers
those questions on a screen and records that it did.

Staff operate the **installation** and reach no customer data — no clients, projects, plans,
activities or notes, and no impersonation. That is structural rather than a rule: `StaffPrincipal`
carries no memberships, no `can()`, no organisation and no role, so passing one to a member service
is a compile error, and the cross-org 404 invariant is untouched because no code on that path
changed. Staff-ness is an environment allowlist (`STAFF_EMAILS`) plus a verified address, and every
refusal is the same 404 an unmapped route gives — including for an Org Admin — so the console is not
an oracle for which addresses are staff. Refusals are audited too.

Also in this release: mail failures become a durable row and an alertable webhook (`MAIL_ALERT_URL`)
with a coalescing window, an optional external heartbeat (`HEARTBEAT_URL`), and an endpoint that
collects browser CSP violation reports so the policy shipped in the previous release can be watched
rather than assumed.
