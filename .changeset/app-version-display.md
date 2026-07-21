---
'@repo/api': minor
'@repo/web': minor
---

feat: show the running API + web version in the app shell

Adds a public `GET /api/v1/version` endpoint (unauthenticated, like `/health`) returning
`{ data: { version } }` — the API's own package version, read once at startup. The web app bakes its
own version at build time and renders a subtle `web x.y.z · api x.y.z` line in the Project Explorer
rail footer (muted, non-interactive, screen-reader labelled), fetching the API version via a cached
query. Makes the deployed versions visible in-product for support/debugging.
