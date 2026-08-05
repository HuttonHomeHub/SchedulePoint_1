# Deployment & Release

> **Status:** in use, end to end. The release pipeline (versioning, tagging,
> image publishing) runs on every merged changeset, and the images are
> **deployed**: the product owner runs the Docker Compose stack with the
> ADR-0047 Watchtower `autodeploy` profile enabled, so a moved `:latest` is
> pulled and the containers recreated on that host, with the API self-migrating
> on recreate (ADR-0018). **That is the hosting decision**, settled 2026-08-01 —
> see [TECH_DEBT.md](TECH_DEBT.md) #5, which records what would make it worth
> revisiting. This banner called the platform "an open decision" and this
> document "the process the foundation supports" until the 2026-08-04
> reconciliation pass; both readings understate what is running. Anything
> released default-on is live for a real user.

## Release flow (overview)

```mermaid
flowchart TD
  A[Merge PR with changeset to main] --> B[Release workflow runs]
  B --> C{Pending changesets?}
  C -- yes --> D[Open/update 'Version Packages' PR]
  D --> E[Maintainer merges version PR]
  E --> F[Versions bumped + CHANGELOG updated]
  F --> G[Release job tags api-vX.Y.Z / web-vX.Y.Z + invokes publish]
  G --> H[Each released app's image pushed to ghcr.io with its own version + sha]
  H --> I[Promote images through environments]
  C -- no --> J[No release]
```

### Order of operations, and the step that is always forgotten

1. **Green CI first, then merge.** Squash-merge with a Conventional Commit title.
2. **Reset your branch from `main` before touching anything else** —
   `git fetch origin main && git checkout -B <branch> origin/main`. This is step
   2, not step 5: a squash replaces your commits with one new commit, so a
   branch that carries on from its old tip holds history `main` will never
   contain. The next PR from it is unmergeable, and because GitHub cannot
   compute a merge ref **CI never starts** — so it reads as waiting for checks
   that will never arrive. Full reasoning in `CLAUDE.md` §8; this has bitten the
   long-lived agent branch twice.
3. **Let the Release workflow open the "Version Packages" PR**, then merge it.
   That PR has **no checks** — a `GITHUB_TOKEN` push cannot trigger a workflow —
   which is expected, not a fault.
4. **The same run publishes the images.** Do not go looking for a separate
   `docker-publish.yml` run; a reusable-workflow call appears as a job of the
   caller's run (see §11 of `CLAUDE.md`).
5. **Reset from `main` again after the version PR merges** — it is a merge like
   any other, and step 2 applies to it too. This is the one that gets skipped.

## Versioning

- **Semantic Versioning**, driven by **Changesets**. Contributors add a
  changeset (`pnpm changeset`) for user-visible changes.
- The [`release`](../.github/workflows/release.yml) workflow maintains a
  "Version Packages" PR. Merging it bumps versions and writes `CHANGELOG.md`
  entries; the workflow then tags **each app that released independently** —
  `api-vX.Y.Z` / `web-vX.Y.Z` — and invokes image publishing directly for those
  apps (ADR-0027). Per-package tags are used because the two apps version on their
  own cadence, and a single aggregate `vX.Y.Z` tag silently skipped a web-only
  release once web caught up to api's version. (It does **not** use `changeset
publish` — that is npm-only and no-ops on our private packages, so it never tags.
  And it publishes by calling `docker-publish` as a reusable workflow rather than
  relying on the tag push to trigger it, because a push made with the default
  `GITHUB_TOKEN` cannot start another workflow.)

## Container images

- Built by [`docker-publish.yml`](../.github/workflows/docker-publish.yml): on
  version tags, when invoked by the release workflow (`workflow_call`), and
  manually via `workflow_dispatch`.
- Published to **GitHub Container Registry** (GHCR paths are all-lowercase):
  - `ghcr.io/huttonhomehub/schedulepoint_1/api`
  - `ghcr.io/huttonhomehub/schedulepoint_1/web`
- Tags: each image carries **its own** app version + `latest` on a release, plus
  commit `sha` and the branch name (e.g. `:main`) on manual/branch builds. Because
  the two apps version independently (ADR-0027), a coordinated deploy should pin
  `:main`/`:latest`/a git `sha`, or pin each app to its own version. Images include
  an **SBOM** and **build provenance**.
- Images are **immutable**: the same artifact is promoted across environments;
  we never rebuild per environment.
- **Shared workspace packages must be pre-built in each image (ADR-0019).** Because
  the shared packages ship compiled `dist` and the `development` export condition
  only applies to the dev server, every image's build stage compiles the workspace
  packages its app depends on **before** building the app itself, and its `deps`
  stage copies each package's `package.json`:
  - `apps/api/Dockerfile` → `@repo/types`, `@repo/interchange`
  - `apps/web/Dockerfile` → `@repo/types`, `@repo/interchange`
    When a new shared package is added to an app's dependencies, update that app's
    Dockerfile in the same change, or the image build fails to resolve it.
- To run the published images locally, use
  [`docker-compose.release.yml`](../docker-compose.release.yml) (see its header for
  the `docker login` and `IMAGE_TAG` steps). The API container applies pending
  database migrations on startup (`prisma migrate deploy`), so no manual
  migration step is needed.

## Running behind a reverse proxy (e.g. Nginx Proxy Manager + Cloudflare)

A common self-hosted topology fronts the stack with a reverse proxy and a CDN.
The browser only ever talks to the **web** container's public origin; the web
container's nginx proxies `/api/*` to the API on the internal network, so the
SPA calls the API **same-origin** (relative `/api/v1` — see
`apps/web/src/config/env.ts`). The API is **not** exposed publicly.

```mermaid
flowchart LR
  U[Browser] -->|HTTPS schedulepoint.example| CF[Cloudflare]
  CF -->|HTTPS origin| NPM[Nginx Proxy Manager]
  NPM -->|:8080| WEB[web container - nginx + SPA]
  WEB -->|/api proxy → :3000| API[api container]
  API --> DB[(Postgres)]
```

Point the proxy at the **web** container (`:8080`) only. Because the SPA uses a
relative API base, **you do not rebuild the web image per domain** — the same
image serves any hostname (`VITE_API_URL` is not consumed by the app).

### Required configuration

Set these on the **api** container (via your secret manager, not the compose
defaults). With `NODE_ENV=production` the API enforces its startup guards. The
rows below are marked individually — **not all of them are mandatory**; this
sentence said "all three" and was written when the table had three rows:

| Variable                          | Value for `https://schedulepoint.example`                                                                          | Why                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `production`                                                                                                       | Enables secure (HTTPS-only) auth cookies and the config guards.                                                                   |
| `BETTER_AUTH_SECRET`              | a strong random value (`openssl rand -base64 32`)                                                                  | Guard refuses to boot with a dev/insecure secret.                                                                                 |
| `CORS_ORIGINS`                    | `https://schedulepoint.example`                                                                                    | This is Better Auth's `trustedOrigins`. Must equal the **browser** origin or sign-up/in returns `403 Invalid origin`.             |
| `BETTER_AUTH_URL`                 | `https://schedulepoint.example`                                                                                    | The public base URL the auth handler builds links/callbacks against.                                                              |
| `TRUSTED_PROXY_IPS`               | the proxy hop(s) in front of the API (e.g. the Docker bridge CIDR such as `172.16.0.0/12`, or the web/NPM host IP) | Lets the API trust `X-Forwarded-For`/`-Proto` for the real client IP; guard refuses an empty value in production.                 |
| `MAIL_SMTP_URL`                   | `smtps://user:password@smtp.provider.example:465` (**optional**)                                                   | Turns on real invitation and verification email. **Absent = the logging stub**, which is what shipped before — so this is opt-in. |
| `MAIL_FROM`                       | `SchedulePoint <no-reply@schedulepoint.example>` (required **with** `MAIL_SMTP_URL`)                               | The sender address. The config guard refuses to boot if the SMTP URL is set without it.                                           |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `true` once mail is live (**optional**, defaults `false`)                                                          | Makes the invitation-accept email match a real ownership proof. Requires `MAIL_SMTP_URL` in production — see below.               |

### Transactional email

Invitation and email-verification messages are sent over **SMTP**, so the provider is
configuration rather than code — Postmark, SES, Resend, Fastmail and a self-hosted relay all
speak it, and moving between them costs an env change rather than a new adapter.

Three properties worth knowing before you turn it on:

- **The credential's presence is the switch.** There is no separate feature flag. Set
  `MAIL_SMTP_URL` and mail is live; leave it unset and the logging stub stays. A flag would
  be a second thing to keep in step with the credential, and the usual failures are a flag
  on with nothing behind it, or a transport configured and inert because nobody flipped it.
- **A mail outage cannot fail an invitation.** A send error is logged and swallowed, because
  the accept URL is also returned in the create response and shown in the admin UI — so an
  Org Admin can always hand it over another way. The email is a convenience over an existing
  path, never the only route through.
- **`MAIL_SMTP_URL` is now load-bearing for account _recovery_, not only for verification**
  (ADR-0074). Since password reset exists, a host with no transport configured has no
  self-service way back into a locked account: the reset link exists only in the email, and
  the logging stub deliberately withholds it in production because it can set a password.
  The request still answers `200` — it must, or it becomes an account-existence oracle — so
  **the only signal is a `WARN` naming the missing configuration**, which since ADR-0074 M0
  arrives in the structured Pino stream rather than as bare `[Better Auth]:` stdout text
  (`docs/TECH_DEBT.md` #94, cheap half paid).
- **A verification failure does NOT fail the sign-up, and it never will** — delivery is
  best-effort by decision, not by accident (**ADR-0075**). Better Auth invokes
  `sendVerificationEmail` through `runInBackgroundOrAwait`, which catches and never rethrows, so
  the sign-up returns success regardless; no configuration changes that. Making the application
  send first, so a failure could abort, was designed and **rejected** — under
  `AUTH_REQUIRE_EMAIL_VERIFICATION` an address that already exists gets a synthetic success with
  no send, so a delivery-failure signal would tell a stranger which addresses hold accounts.

  **Alert on this, and not on what this bullet used to say:**

  ```
  event = "mail.send_failed"
  ```

  Every mail failure carries it, with a `message` field naming which one
  (`invitation` / `email_verification` / `password_reset`), the recipient, and the error —
  structured, in the Pino stream, with the correlation id, and never containing a URL or token.

  Until 2026-08-05 this bullet told you to watch for Better Auth's `Failed to run background
task`. **That line can no longer be produced by a mail failure**: the SMTP adapter catches
  first (ADR-0074 M5-T1, so that a transport error on the session-less
  `/send-verification-email` route cannot become an existence oracle), so the promise Better Auth
  awaits resolves and its `catch` is never reached. An alert built exactly as previously
  instructed would have stayed silent through a total relay outage. It also said "the adapter
  throws deliberately", which stopped being true the same day.

  Better Auth's resend endpoint remains the user-facing recovery path.

#### What the application actually sends

**Three** messages, and no others: the **organisation invitation**, the **email-verification
link**, and the **password-reset link**. No digest and no notification email — so configuring
mail does not silently open a channel you have not read about here.

This section said "two messages… there is no password-reset flow… the only route back is an
operator resetting it in the database" until 2026-08-05. Password reset shipped with ADR-0074
and is **default-on** (`VITE_PASSWORD_RESET`); `sendResetPassword` is configured, the web UI has
both the request and the confirm screens, and a completed reset revokes every other session. The
file contradicted itself 47 lines further down, where the Resend example already assumed reset
mail was being sent.

The practical consequence for you: reset is now the route back for a locked-out user, so a broken
relay is more serious than this page implied — it is the difference between an inconvenience and
an account nobody can recover without database access.

#### Worked example: Resend

Any SMTP provider works; this is the one the project's own deployment uses, recorded because
two of its details cost an hour the first time.

1. **Verify a sending domain** in Resend and add the DNS records it gives you. Until a domain
   is verified you may only send **from** `onboarding@resend.dev` and **to** the address on
   your Resend account — enough to test a sign-up against your own inbox, not enough to invite
   a client.
2. **The DNS names are relative.** At Cloudflare (and most providers) enter `resend._domainkey`,
   `send` and `_dmarc` exactly as given. Pasting the fully-qualified
   `resend._domainkey.yourdomain.com` creates `…yourdomain.com.yourdomain.com`, which reads as
   "not found" while everything looks correct on screen. This is the most common cause of a
   domain that will not verify.
3. **The `MX` record on `send` does not affect mail you receive.** It is a subdomain, so your
   root `MX` is untouched; it only gives SES a return path for bounces. Likewise the SPF `TXT`
   is scoped to `send` and will not collide with an SPF record at your root for another
   provider.
4. **Then configure the two variables.** The username is the literal string `resend`; the
   password is the API key. Give the key **sending** permission — a read-only key fails at
   send time rather than at boot, so the symptom is a failed sign-up and nothing at startup.

```bash
MAIL_SMTP_URL=smtps://resend:re_YourApiKeyHere@smtp.resend.com:465
MAIL_FROM="SchedulePoint <no-reply@yourdomain.com>"
```

`smtps://` selects implicit TLS on 465. The sender address belongs to the **verified root
domain**, never the `send.` subdomain — DKIM signs for the root, so a root `From:` is what
aligns for DMARC. `send.` is plumbing and is never a sender.

Resend's keys are alphanumeric plus underscores, so no URL-encoding is needed. A hand-made
password containing `@ : / #` **must** be percent-encoded, or the URL truncates silently and
the failure presents as a wrong password.

#### Turning verification on

`AUTH_REQUIRE_EMAIL_VERIFICATION=true` is what makes invitation acceptance a real proof of
mailbox ownership rather than an email-address match (ADR-0016 §5). It is a separate decision
from configuring mail, and it needs mail first: with no transport the only adapter left is the
logging stub, so the verify link is written to the API's log and nowhere else, and every new
account is unusable. **In production the API refuses to boot** on that combination rather than
letting you find out from a user who cannot sign in.

**The order is load-bearing, and step 3 is the one people skip:**

1. Set `MAIL_SMTP_URL` and `MAIL_FROM`, and restart.
2. Confirm the API logged no `event: "mail.send_failed"` on first use.
3. **Complete a real sign-up to a real mailbox and follow the link through to a signed-in
   session.** Not "an email arrived" — the whole chain. A key with read-only permission
   authenticates at boot and fails at send time; a verified-domain mistake delivers to your own
   address and nothing else; and the redirect back is its own failure mode (ADR-0074 M5 found two
   product defects on exactly this path, both invisible to every unit test because they only
   appear when a browser follows a real emailed link).
4. Only then set `AUTH_REQUIRE_EMAIL_VERIFICATION=true`.

**Why it cannot be reordered:** flipping the switch first arms three dead ends at once — sign-up
returns no session and the client reports success then bounces, sign-in 403s and re-sends
nothing, and invitation-accept tells the user to verify with no way to do so. And because
delivery is best-effort by design (ADR-0075), a broken relay at that point produces accounts that
look created and cannot be used, with the only signal in your logs.

#### Password reset: one precondition that fails silently if you miss it

`CORS_ORIGINS` **must contain the browser origin the reset link lands on.** Better Auth
validates `/request-password-reset`'s `redirectTo` against `trustedOrigins`, which is bound to
`CORS_ORIGINS` — so an app origin missing from that list makes **every** reset fail with an
origin error and nothing on screen to explain it. The row above already says `CORS_ORIGINS`
must equal the browser origin for sign-in to work; this is the second thing that breaks, and it
breaks less visibly.

The rejection itself is tested (`apps/api/test/password-reset.e2e-spec.ts`) so the failure mode
is at least a known one. Note the origin check is now explicitly on in every environment —
Better Auth defaults it **off** under `isTest()`, which meant the suite had been proving a
weaker posture than production ships (ADR-0074).

Put the credential in your secret store, not in `docker-compose.yml`. Deliverability (SPF,
DKIM, DMARC on the sending domain) is a provider-side task this application does not do for
you; without it, invitations to external clients will land in spam.

### Cloudflare & TLS

- Use SSL/TLS mode **Full (strict)** so every leg is HTTPS: the browser→Cloudflare
  leg (which makes the `Secure` auth cookie valid) **and** the Cloudflare→origin
  leg (so `X-Forwarded-Proto: https` reaches the API and links resolve as HTTPS).
  Give Nginx Proxy Manager a valid certificate (e.g. Let's Encrypt) for the origin.
- Ensure the proxy forwards `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`
  (Nginx Proxy Manager's "Websockets support" + default forwarding is fine); the
  web container already sets these when proxying to the API.
- **Check `X-Forwarded-Proto` rather than assuming it.** On the reference
  deployment it arrives as `http` — reflecting the proxy's plaintext hop to the
  web container, not the browser's scheme — while `X-Forwarded-Scheme` and
  Cloudflare's `CF-Visitor` both correctly say `https`. Nothing consumes it today
  (absolute URLs come from `BETTER_AUTH_URL`, and the `Secure` cookie flag from
  `NODE_ENV`), so it is currently harmless and therefore easy to miss.
  **The repo half is now fixed** (ADR-0074 M1): `apps/web/nginx.conf` no longer overwrites the
  header with this container's own unconditionally-`http` `$scheme` — an arriving value is
  preserved and `$scheme` is only the fallback. **The operator half is still yours, and without it
  nothing changes**, because with no header arriving the fallback reproduces the old behaviour
  exactly. In Nginx Proxy Manager: the HTTPS host → Advanced →
  `proxy_set_header X-Forwarded-Proto $scheme;`, with Force SSL on. See `docs/TECH_DEBT.md` #89.

### Content-Security-Policy

The web container serves a CSP (ADR-0074, `docs/TECH_DEBT.md` #8). **Both the header name and the
policy are environment variables read by nginx at container start**, not values baked into the
image — so switching between observing and enforcing, in either direction, is a restart rather than
a release. A rollback that needed a new image would be slower than the incident it was fixing.

```bash
CSP_HEADER_NAME=Content-Security-Policy-Report-Only   # default: observe
CSP_HEADER_NAME=Content-Security-Policy               # enforce
```

**Ship report-only first and actually look.** There is no `report-to` sink — violations appear in
the browser console, which for a single-operator deployment is a real verification tool and avoids
adding a public unauthenticated endpoint. Walk every route with the console open before enforcing:
sign-in/up, accept-invite, the share guest view, the plan workspace, the Gantt, canvas PNG/PDF
export, the printed programme, the library screens, the audit log — and both **Copy** buttons.

Two things worth knowing if you edit the policy:

- `img-src` needs `blob:`. The printed programme renders a live object-URL `<img>`; dropping it
  breaks printing and image export, and only there.
- `style-src 'self'` is deliberately strict and is **inferred from the source**, not verified in a
  browser. If the report-only window shows style violations, relax **`style-src` only** — never
  `script-src`, which needs no relaxation at all now the theme-boot script is a served file.

### Common pitfall: `403 Invalid origin` on sign-up/sign-in

Better Auth rejects any request whose `Origin` header is not in `trustedOrigins`
(= `CORS_ORIGINS`). If you reach the app on a URL that is not listed — a raw
`http://LAN-IP:8080`, a preview hostname, or the domain when `CORS_ORIGINS`
still points at localhost — auth calls fail with `403 Invalid origin`. Set
`CORS_ORIGINS` to the exact origin shown in the browser address bar. For a
plain HTTP LAN test (no TLS), also set `NODE_ENV=development`, otherwise the
`Secure` cookie is set but never sent back over HTTP and login silently fails.

## Environments (intended)

| Environment | Purpose                     | Source                            |
| ----------- | --------------------------- | --------------------------------- |
| Local       | Development                 | `docker compose`                  |
| Staging     | Pre-production verification | image tag from `main`/pre-release |
| Production  | Live                        | promoted SemVer-tagged image      |

Configuration and secrets are supplied per-environment via the platform's
secret manager — never baked into images or committed. See
[`.env.example`](../.env.example) for the required variables.

## Database migrations

- Applied with `prisma migrate deploy` as part of the release/deploy step,
  before the new API version serves traffic.
- Migrations are backward-compatible where feasible (expand/contract) so a
  rollout can proceed without downtime and a rollback stays safe.

## Runtime health & rollout

- The API exposes `/health` (liveness/readiness) for the orchestrator.
- Roll out gradually where the platform supports it; watch health and error
  rates. **Rollback = redeploy the previous image tag** (plus any compensating
  migration).

## Deploying a release to a self-hosted host (Docker Compose / Dockge)

**Publishing an image is not the same as deploying it.** A release builds and
pushes `web`/`api` images to GHCR automatically, but a running host keeps serving
whatever image it already pulled until you tell it to pull the new one. A release
that no host pulls simply never reaches users.

The reference stack (`docker-compose.release.yml`, and the production Dockge
stack) selects images by a tag from the environment:

```yaml
web:
  image: ghcr.io/huttonhomehub/schedulepoint_1/web:${WEB_IMAGE_TAG:-latest}
api:
  image: ghcr.io/huttonhomehub/schedulepoint_1/api:${API_IMAGE_TAG:-latest}
```

Two ways to run it:

- **Track `latest` (recommended for a single production line).** Set
  `WEB_IMAGE_TAG=latest` and `API_IMAGE_TAG=latest` in the stack `.env` (or omit
  them — the compose defaults to `latest`). Every release moves `web:latest` /
  `api:latest` to the newest of _that_ image (the two version independently, so
  each `latest` tracks its own app — ADR-0027). To ship a release you then just
  **pull + recreate** (below); no tag editing.
- **Pin explicit versions** (for staged/coordinated rollouts or easy rollback):
  set `WEB_IMAGE_TAG=0.15.0`, `API_IMAGE_TAG=0.10.1`, etc. Bump the pin per
  release. `latest` is ignored.

**Redeploy steps (both approaches need the pull):**

1. In **Dockge**, open the stack and click **Update** — it runs
   `docker compose pull` then `docker compose up -d`. From the host CLI in the
   stack directory the equivalent is:
   ```bash
   docker compose pull        # fetch the new image (or the moved :latest)
   docker compose up -d        # recreate only the containers whose image changed
   docker compose ps           # confirm versions + health
   ```
2. **A plain restart is a no-op.** `restart`/`up` without a `pull` re-uses the
   cached image — so restarting a `latest` stack does **not** pick up a new
   release. Always pull.
3. The **API self-migrates** on startup (`prisma migrate deploy`, ADR-0018), so a
   version bump applies pending DB migrations automatically before it serves.
4. Hard-refresh the browser (Ctrl/Cmd-F5) to drop the cached old web bundle.

**Rollback:** pin the previous version tag and Update (plus any compensating
migration) — see _Runtime health & rollout_.

### Automatic redeploy (Watchtower, opt-in — ADR-0047)

So a release reaches the host without a manual pull, the reference stack ships an
**optional** [Watchtower](https://containrrr.dev/watchtower/) service that polls
GHCR and pulls + recreates the app containers when their `:latest` digest moves.
It is **dormant by default** (a compose `autodeploy` profile) and **opt-in per
host** — nothing auto-deploys until you enable it. That is the _shipped default_,
not a description of the running world: the profile **is** enabled on the product
owner's host, so in practice a merged release is pulled, recreated and seen by a
person without anyone acting (`docs/TECH_DEBT.md` #29, closed).

**Enable it:**

```bash
# One-time: log the host in to GHCR so Watchtower can pull the private images.
echo $GHCR_PAT | docker login ghcr.io -u <github-user> --password-stdin   # read:packages

# Start the stack WITH the updater (Dockge: add COMPOSE_PROFILES=autodeploy to the
# stack .env, then Update):
COMPOSE_PROFILES=autodeploy docker compose -f docker-compose.release.yml up -d
```

What it does and does not touch:

- **Only the app containers.** It updates just the `web`/`api` containers (they
  carry `com.centurylinklabs.watchtower.enable=true`); it **never** recreates
  Postgres or itself.
- **Reuses your GHCR login.** It mounts the host Docker config
  (`/config.json`, read-only) rather than taking a PAT in the compose env. If your
  `config.json` isn't at `/root/.docker`, set `DOCKER_CONFIG_DIR` to its directory —
  an **absolute** path (Compose does not reliably expand `~`). That config must hold an
  **inline `auth` entry** for `ghcr.io`; if `docker login` used a credential helper
  (`credsStore`/`credHelpers` — common on Docker Desktop), Watchtower can't reach the
  helper and the private pull fails. Check with `grep ghcr.io ~/.docker/config.json`.
- **Self-migrates.** The recreated API applies pending migrations on startup
  (ADR-0018), so the pull **is** the deploy — no extra step.
- **Rolling + tidy.** It recreates one container at a time and prunes the old image.
  It recreates each container independently via the Docker API, so on a simultaneous
  web+api release it does **not** honour the compose `depends_on` health-gate that a
  manual `docker compose up -d` does — a brief cross-version window until both settle
  (harmless: the web nginx just retries `/api`). Use monitor-only + a manual
  `pull && up -d` if you need strict ordering.

**Knobs** (compose env, all optional):

| Variable                      | Default         | Effect                                                                                            |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `WATCHTOWER_POLL_INTERVAL`    | `300`           | Seconds between GHCR checks.                                                                      |
| `WATCHTOWER_MONITOR_ONLY`     | `false`         | `true` = **notify only, don't update** — a manual gate that still tells you a release is waiting. |
| `WATCHTOWER_NOTIFICATION_URL` | _unset_         | Optional [shoutrrr](https://containrrr.dev/shoutrrr/) URL for release notifications.              |
| `DOCKER_CONFIG_DIR`           | `/root/.docker` | Host directory holding the GHCR `config.json` to mount.                                           |

**Disable it:** drop `autodeploy` from `COMPOSE_PROFILES` and `up -d` (or
`docker compose … --profile autodeploy down` to remove the container); the app
containers keep running. Note the updater needs the **Docker socket**, which is
root-equivalent on the host — an accepted cost of any host-side auto-updater, and
the reason it is label-scoped and opt-in (ADR-0047).

**Rollback still wins.** A pinned `WEB_IMAGE_TAG`/`API_IMAGE_TAG` (an explicit
version, not `latest`) is not moved by Watchtower — pin to roll back or to hold a
host on a known version.

## Pre-release checklist

- [ ] CI green on `main` (lint, typecheck, unit, e2e)
- [ ] CodeQL clean; no unresolved high-severity alerts
- [ ] Changesets present for user-visible changes
- [ ] `CHANGELOG.md` reflects the release
- [ ] Migrations reviewed and reversible/safe
- [ ] Relevant docs updated
