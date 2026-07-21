---
'@repo/web': minor
---

feat(web): flip live cross-plan / programme scheduling on by default (ADR-0045)

`VITE_PROGRAMME_SCHEDULING` — the last dark web flag — is now **on by default** (set `=false` to
roll back). The programme surface (cross-plan dependency links, "Recalculate programme" over the
plan-level DAG, and the stale-schedule banner) is exposed in the web UI, layered on the already-live
API (its component/ux/a11y quality gates and the flag-on Playwright journey are green). This closes
the last remaining feature flag; every shipped web feature is now on by default.
