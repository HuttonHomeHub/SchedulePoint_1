# M4-T1 — the schema design record

**Gating task.** `CLAUDE.md` §19.3 and §20: every schema change goes through the
`database-architect` agent, without exception, and deciding a change is too small to need it is the
judgement the agent exists to make. No migration was written before this record existed.

This file holds the agent's answers to the spec's six questions (§4.13), **any disagreement with
the shape §4.9 proposed**, and the findings that came from checking the spec's own claims rather
than inheriting them.

---

## Independently verified before the agent ran

Two of the spec's decision-bearing claims underpin the `Provenance` columns, and both were checked
by opening the files rather than trusting the citation (ADR-0076 §19.11).

**`__APP_VERSION__` — CONFIRMED, and the citation is accurate.** `apps/web/vite.config.ts:28`
carries `define: { __APP_VERSION__: JSON.stringify(appVersion) }`, fed by a `readFileSync` of the
package manifest at `:11-13`; the comment the spec cites is at `:8-13`. It surfaces as
`APP_VERSION` (`apps/web/src/config/env.ts:26`) and is declared at
`apps/web/src/vite-env.d.ts:7`. So the web half of `Provenance` is a compile-time constant that
cannot drift from the published package — no env var, no runtime fetch.

**`GET /api/v1/version` — CONFIRMED**, `apps/api/src/version/version.controller.ts:19-25`, public,
returning the API's own package version.

### And a correction to the spec's design, found on the way

§4.9 lists `api_version` beside `app_version` as though both were the client's to report. They are
not the same kind of fact. The web app already reads the API's version through a **cached TanStack
Query** (`apps/web/src/features/system/api/use-api-version.ts`, "read once"), so a client-supplied
`api_version` records **what the browser last believed** — which, after a deploy the tab has not
been reloaded through, is the previous release. The API knows its own version with certainty at the
moment of the write.

**So `api_version` is stamped server-side and is not accepted from the request body.** `app_version`
stays client-supplied, because only the bundle knows which bundle it is. That split is not a
tidiness preference: the whole point of these two columns is comparing readings across releases, and
a version field that can silently be one release stale defeats exactly that.

The spec's own note that **no commit SHA is available** stands (ADR-0088 D1: `docker-publish.yml`
passes no build args), so the granularity is a release and the row's docblock must say so.

---

## The agent's design

_(Filled in from the `database-architect` run — see below.)_
