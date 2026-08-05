---
'@repo/web': minor
---

The web origin now serves a Content-Security-Policy (report-only), plus the sibling headers it was
missing.

The policy is derived from what the code actually loads rather than from a template: no external
origins at all, so everything is `'self'` except `blob:` on `img-src`, which the printed programme
needs for its live object-URL image. The inline theme-boot script moved to `public/theme-boot.js`,
so `script-src` needs no relaxation — no `'unsafe-inline'` and no hash to keep in sync.

`nginx.conf` becomes an envsubst template so **the CSP mode is an operator variable**:
`CSP_HEADER_NAME=Content-Security-Policy` enforces, and the default report-only value observes.
Either direction is a container restart rather than a release, which matters most when the change
being made is a rollback.

Also adds COOP, CORP and an **enumerated** Permissions-Policy — deliberately not a blanket deny,
because `clipboard-write` is a controlled feature and the two Copy buttons depend on it. HSTS stays
excluded: this container listens only on plain 8080 and cannot know the browser's scheme, and HSTS
is sticky, so it belongs at the edge.

And `X-Forwarded-Proto` is no longer overwritten with this container's own unconditionally-`http`
scheme (TECH_DEBT #89, code half). The operator half — actually sending the header from the proxy —
is still required, and without it nothing changes.
