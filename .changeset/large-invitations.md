---
'@repo/api': minor
'@repo/types': minor
---

Add organisation invitations and a transactional-mail port. Org Admins can
invite by email with a role (`POST /organizations/:orgSlug/invitations`), list
pending invites, and revoke them; invitees preview by token
(`POST /invitations/preview`) and accept (`POST /invitations/accept`) to join.
Tokens are stored hashed (raw value returned once + emailed), invitations expire,
and accept is transactional. Adds a `MailService` port with a logging stub
adapter (the accept URL is also returned so onboarding works without a provider)
and the shared `InvitationSummary`/`InvitationPreview` contracts to `@repo/types`.
Introduces a `410 Gone` error for expired/revoked invitations.
