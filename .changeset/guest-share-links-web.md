---
'@repo/web': minor
---

feat(web): External-Guest share links surface (ADR-0051 F-M4)

Ship the web surface for External-Guest per-plan share links, **on by default** behind
`VITE_GUEST_SHARE_LINKS` (set `=false` to roll back). The TSLD toolbar `share` item opens a member
**Share links** dialog (list / create — with the one-time guest URL + Copy — / revoke, gated on
`plan:share`), and a public read-only `/share` guest view (session-less, token in the URL fragment,
no app-shell chrome, `noindex`, its own lazy-loaded chunk) renders the plan over the F-M3 endpoints.
Flag-off is byte-identical: the toolbar keeps its "Coming soon" placeholder and no `/share` route is
registered. Completes ADR-0051 (the fifth product role — External Guest) and closes the last "Coming
soon" TSLD toolbar placeholder. Ships with the five specialist reviews (security / a11y / ux /
component / performance) green after the review fold, and a flag-on Playwright journey in CI.
