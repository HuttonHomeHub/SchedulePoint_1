---
'@repo/web': minor
---

Add the members management UI and the invitation-accept flow. Each organisation
gets a Members screen (`/orgs/$orgSlug/members`) with an accessible roster: inline
role changes (optimistic-lock conflicts surfaced), remove-with-confirm, and an
Invite dialog that emails a link and shows the copyable accept URL. A public
`/accept-invite` route previews the invitation and lets the invited user join
(prompting sign-in as the right account when needed). Adds a header org nav and
Dialog/Select primitives. Covered by a component test and a two-account
Playwright journey (invite → accept → join).
