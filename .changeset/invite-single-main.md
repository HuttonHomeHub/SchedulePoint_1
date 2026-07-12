---
'@repo/web': patch
---

fix(web): give the public accept-invite page a single `main` landmark

Promote the invitation-accept card's centered layout into a shared
`InviteShell` (mirroring `AuthShell`) and route the no-token empty state
through it, so every branch of the accept-invite flow renders exactly one
`main` landmark instead of the route and the card each defining their own
(WCAG 2.2 — 1.3.1 Info and Relationships).
