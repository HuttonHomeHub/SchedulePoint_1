---
'@repo/web': minor
---

feat(web): External-Guest share links surface (ADR-0051 F-M4)

Ship the flagged web surface for External-Guest per-plan share links behind
`VITE_GUEST_SHARE_LINKS` (default off). When on: the TSLD toolbar `share` item opens a member
**Share links** dialog (list / create — with the one-time guest URL + Copy — / revoke, gated on
`plan:share`), and a public read-only `/share` guest view (session-less, token in the URL fragment,
no app-shell chrome, `noindex`) renders the plan over the F-M3 endpoints. Flag-off is byte-identical:
the toolbar keeps its "Coming soon" placeholder and no `/share` route is registered.
