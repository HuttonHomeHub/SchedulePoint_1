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

  > **Nothing is currently watching for it** (`docs/TECH_DEBT.md` #100). There is no log shipping
  > and no alert evaluator — `docs/OBSERVABILITY.md` §"Monitoring & alerting" is explicitly a
  > standard rather than a running system — so this record lands in `docker logs` on the host and
  > goes no further. Until that changes, the honest reading of this section is "here is the term to
  > grep for when you go looking", not "here is what will page you":
  >
  > ```bash
  > docker compose logs api --since 24h | grep -F 'mail.send_failed'
  > ```
  >
  > This caveat exists because the instruction above previously read as though a mechanism were in
  > place. It was not, and a release note told the operator to "update your alerting" on the
  > strength of it.

  Every mail failure carries it, with a `kind` field naming which one
  (`invitation` / `email_verification` / `password_reset`), the recipient, and the error —
  structured, in the Pino stream, with the correlation id, and never containing a URL or token.

  A **second, quieter** record shares the term: `event: "mail.send_failed"` with
  `abandoned: true`, logged at `warn`. That one means a send exceeded its 10-second bound, the
  request was released, and the send _then_ failed anyway. If you are counting failures, filter it
  out; if you are asking whether the bound is too tight, it is the record to count. A burst of
  them means the relay is slow rather than broken.

  Until 2026-08-05 this bullet told you to watch for Better Auth's `Failed to run background
task`. **That line can no longer be produced by a mail failure**: the SMTP adapter catches
  first (ADR-0074 M5-T1, so that a transport error on the session-less
  `/send-verification-email` route cannot become an existence oracle), so the promise Better Auth
  awaits resolves and its `catch` is never reached. An alert built exactly as previously
  instructed would have stayed silent through a total relay outage. It also said "the adapter
  throws deliberately", which stopped being true the same day.

  Better Auth's resend endpoint remains the user-facing recovery path.

#### The boot-time transport check

When `MAIL_SMTP_URL` is set, the API performs **one bounded SMTP handshake at start-up** and logs
`event: "mail.transport_verified"` or `event: "mail.transport_check_failed"`, with the **host and
port only** — never the credential inside the URL. It is capped at 5 seconds.

**It never fails the boot, and it is deliberately not part of `/api/v1/health/ready`.** Your host
recreates containers unattended on a released image (ADR-0047), so a relay that is briefly
unreachable at 03:00 would otherwise take the API down and keep it down until somebody noticed;
and putting it in readiness would turn a mail outage into a restart loop. Mail is not on the
critical path of scheduling — the API is.

**"Never fails the boot" is not "costs nothing".** It runs on `OnApplicationBootstrap`, which is
before Nest begins listening, so an unreachable relay adds **up to 5 seconds** to start-up during
which the port is not bound. That is invisible on a healthy host and worth knowing on a recreate
you are watching: a container that seems to hang for five seconds and then comes up normally,
right after a mail-server change, is this check timing out and not a fault.

#### Every send is bounded at 10 seconds, and three of the four sends no longer wait on it

Mail **was** on the request path, which surprised this project's own design documents once already
(ADR-0075 §"Mail is on the request path"): Better Auth awaited the send unless a background handler
was configured, and none was, so sign-up, password-reset requests, verification resends and
invitation creation each waited for a real SMTP round trip. Nodemailer's own defaults would allow
that wait to reach **ten minutes** on a socket that connects and then goes quiet, which is why the
adapter caps it at ten seconds regardless of who is waiting on it.

**`docs/TECH_DEBT.md` #99 closed that for three of the four.**
`advanced.backgroundTasks.handler` is now configured
(`apps/api/src/common/auth/better-auth.ts`), so Better Auth calls it INSTEAD of awaiting for
`sendResetPassword` and `emailVerification.sendVerificationEmail` — which covers sign-up (it sends
the same verification email), password-reset requests and verification resends. Those three now
answer without waiting on the send at all, which is also what closes the timing this project's
uniform response bodies exist to guard: a **known** address on `/request-password-reset` used to
wait for the send while an **unknown** one answered after one database lookup, so an identical body
arrived at two different speeds — a caller with a stopwatch could tell them apart even though
neither could read the body. **Invitation creation is the one that still waits**:
`InvitationsService` awaits `sendInvitation` directly in its own code, entirely outside Better
Auth's plumbing, so nothing about that handler reaches it.

The ten-second bound stays for all four sends, for two different reasons. For invitation creation
it is unchanged: a broken relay still costs that request up to ten seconds before it answers
normally, and the practical advice below still applies to it. For the other three the bound no
longer protects a request — nothing is waiting on the send — but an abandoned background send would
otherwise hold a socket open for as long as a black-holed relay stays black-holed, which is exactly
the kind of unbounded background work that should never be allowed to run forever, watched or not.

Practically, for invitation creation: a broken relay costs that request ten seconds and then answers
normally. If you see its latency step to ~10 s, look at `mail.send_failed` before looking at the
database. For the other three, that latency step is gone; a broken relay now shows up **only** as
`mail.send_failed` in the log, with no user-visible symptom to notice it by.

**What a success does not prove**, which is why step 3 of the checklist below still exists:

- **Not that we may send.** A credential can authenticate and lack send permission — exactly the
  read-only Resend key described above, which passes this check and fails the first real message.
- **Not that mail arrives.** Asynchronous bounces, spam classification and an unverified sending
  domain are invisible to a handshake.
- **Not that it will keep working.** It is one observation at boot; a relay that breaks an hour
  later shows up as `event: "mail.send_failed"` and nowhere else.

See ADR-0075.

#### What the application actually sends

**Three** messages, and no others: the **organisation invitation**, the **email-verification
link**, and the **password-reset link**. No digest and no notification email — so configuring
mail does not silently open a channel you have not read about here.

This section said "two messages… there is no password-reset flow… the only route back is an
operator resetting it in the database" until 2026-08-05. Password reset shipped with ADR-0074
and is **always on** (its `VITE_PASSWORD_RESET` flag retired in 1.1); `sendResetPassword` is configured, the web UI has
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
2. Confirm the restart logged `event: "mail.transport_check_failed"` **nowhere**, and
   `event: "mail.transport_verified"` **once**. This is the boot handshake described above; it
   proves the host, port and credential are reachable, and nothing more. Do **not** look for
   `mail.send_failed` here — nothing has tried to send yet, so its absence at this point means
   only that no message was attempted, which is exactly the false reassurance this step used to
   give.
3. **Complete a real sign-up to a real mailbox and follow the link through to a signed-in
   session**, confirming no `event: "mail.send_failed"` appears while you do. Not "an email arrived" — the whole chain. A key with read-only permission
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

#### Password reset: the link is composed from `APP_URL`

The emailed reset link is `{APP_URL}/reset-password#token=…` (TECH_DEBT #537), so `APP_URL` must
be the address people open the app at — the same value invitations and verification links already
use. The web no longer sends `redirectTo`, so a reset no longer depends on `CORS_ORIGINS` containing
the app origin; a client that still sends one (an old cached bundle) is origin-checked against
`trustedOrigins`, which is bound to `CORS_ORIGINS`, as before. Reset links emailed before the change
point at `/api/auth/reset-password/<token>`; the API answers those with a redirect to the new form,
so they keep working for the hour they live.

A reverse-proxy access log still records the token for hits on the legacy path
(`/api/auth/reset-password/<token>`) until the old emails expire, at most an hour after the last
pre-change email was sent; links emailed after the change never put it in a path or query.

Put the credential in your secret store, not in `docker-compose.yml`. Deliverability (SPF,
DKIM, DMARC on the sending domain) is a provider-side task this application does not do for
you; without it, invitations to external clients will land in spam.

### Cloudflare & TLS

- Use SSL/TLS mode **Full (strict)** so every leg is HTTPS: the browser→Cloudflare
  leg (which makes the `Secure` auth cookie valid) **and** the Cloudflare→origin
  leg. Give Nginx Proxy Manager a valid certificate (e.g. Let's Encrypt) for the origin.
  _(This bullet used to add "so `X-Forwarded-Proto: https` reaches the API" — which the third
  bullet below has contradicted since 2026-08-25, five lines further down the same list. Full
  (strict) is still right and earns its place on the cookie and the origin leg; it does **not**
  by itself make that header say `https`, and the operator step that does is in that bullet.)_
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

### The organisation export through a proxy (ADR-0194)

`POST /api/v1/organizations/:orgSlug/export` streams a ZIP while it reads the database, for as long as
the organisation is large (about 25 s for 272,000 rows on the reference machine; extrapolated to several
minutes at the brief's upper bound, `docs/specs/organisation-export/m2-measurements.md`). What that asks
of each hop in front of the API:

- **The web container's nginx is already set for it.** `apps/web/nginx.conf` has a dedicated location for
  exactly this route with `proxy_buffering off` (so the ZIP is not spooled to the container's disk,
  which would defeat "nothing is stored on the server") and a 660 s read and send timeout: the API's
  10-minute transaction ceiling (`EXPORT_TRANSACTION_TIMEOUT_MS`) plus a minute of margin. Every other
  `/api/` route keeps nginx's defaults.
- **A proxy or CDN in front of the host may still cut a long export.** Cloudflare's default is to drop a
  connection that has been idle for about 100 seconds, and raising that limit is an Enterprise-plan
  feature (Cloudflare's documentation; not measured here). The export sends its headers first and then
  streams, so the exposure is a long gap between chunks, not the total time. A small or medium organisation finishes inside that. A very large one
  may not, and the symptom is the page saying `The download stopped before it finished` with the Audit
  log recording a failed `privacy.exported` row (`client_aborted`). Nginx Proxy Manager is plain nginx
  with its defaults unless you changed them (60 s read timeout); if you see the cut at about a minute
  rather than at about 100 seconds, raise `proxy_read_timeout` on that proxy host (Advanced tab). If it
  is Cloudflare, the options are an export when the organisation is smaller, or reaching the origin
  directly for the export; the page-memory and streaming trade-offs are `docs/TECH_DEBT.md` #515.
- **An export holds a database snapshot for up to 10 minutes.** It reads inside one repeatable-read
  transaction so the file is consistent, and that snapshot is released when the response ends, the
  client goes away, or the 10-minute ceiling is reached. A slow client therefore delays the database's
  clean-up of old row versions for that long, no more (at most two exports run per API process, which
  bounds the effect; `docs/TECH_DEBT.md` #517). Set `idle_in_transaction_session_timeout` on the
  database if you want a tighter limit.

The plain-English version for the owner is in
[`docs/guides/export-your-organisation.md`](guides/export-your-organisation.md), "If it stops".

### Content-Security-Policy

The web container serves a CSP (ADR-0074, `docs/TECH_DEBT.md` #8). **Both the header name and the
policy are environment variables read by nginx at container start**, not values baked into the
image — so switching between observing and enforcing, in either direction, is a restart rather than
a release. A rollback that needed a new image would be slower than the incident it was fixing.

The whole security header set (this CSP included) lives in one snippet, `apps/web/nginx-security-headers.conf`,
rendered to `/etc/nginx/conf.d/snippets/` and included by the server and by the hashed-asset,
`/theme-boot.js` and `/favicon.svg` locations — an `add_header` in a location replaces every inherited
header, so before `docs/TECH_DEBT.md` #457 those three answered with `Cache-Control` alone.

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
  before the new API version serves traffic. Where backups are switched on, the entrypoint
  first takes a copy when a migration is pending, and a failed copy holds the update (see
  [Backups](#backups)).
- The entrypoint's first step is `schedulepoint-backup preflight` (ADR-0215): it refuses, before any copy
  or migration, a database made before the 1.1 baseline, one it cannot read and one that is not
  SchedulePoint's, logging `boot.database_refused` and pointing at
  [`docs/guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md). A 1.1 database that a later 1.1.x
  has migrated still passes, so rolling back by image tag works inside 1.1.
  The refusal states are `pre_1_1_lineage`, `mixed_lineage` (a 1.0 image was started on a 1.1 database),
  `failed_migration`, `cannot_read` (the database is down or `DATABASE_URL` is wrong; the container retries)
  `unknown_database`, and `other_schema` (`DATABASE_URL` carries a `schema` other than `public`; the check reads
  the `public` schema only, so it refuses before reading anything rather than classify from the wrong tables);
  an empty database (`fresh`) and a 1.1 one (`current`) are accepted. Each refusal
  prints three plain lines and writes nothing. The one-time move to 1.1.0 is the guide's procedure, and
  going back to 1.0 is the old volume with `API_IMAGE_TAG` and `WEB_IMAGE_TAG` pinned to `1.0.0`, never a tag alone.
- Migrations are backward-compatible where feasible (expand/contract) so a
  rollout can proceed without downtime and a rollback stays safe.

## Runtime health & rollout

- The API exposes `/api/v1/health` (liveness) and `/api/v1/health/ready` (readiness)
  for the orchestrator. **Both carry the `/api` prefix and the URI version** — a probe
  pointed at `/health` gets a 404 and marks the container unhealthy forever.
- Roll out gradually where the platform supports it; watch health and error
  rates. **Rollback = redeploy the previous image tag** (plus any compensating
  migration).

### Rolling back past the finish-milestone date release

**History; it does not apply to a 1.1 database.** Until 1.0 this section held the reverse of
`20260923120000_finish_milestone_end_of_day_placements` (ADR-0155): shift every placed finish milestone
back one day, check against `finish_milestone_date_migrations`, then drop that table and the
migration's `_prisma_migrations` row. The 1.1 baseline (ADR-0215) contains no such migration, and a
1.1 database has no row the reverse could act on: the table `finish_milestone_date_migrations` no
longer exists (ADR-0215 D6). Rolling 1.1 back to 1.0 is the old volume, not a reverse script
(ADR-0215 D3, [`docs/guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md)). The procedure, with
its measurement on a populated copy, is at git tag `api-v1.0.0` (this file).

### Rolling back past the cross-plan lag release

**History; it does not apply to a 1.1 database.** Until 1.0 this section held the reverse of
`20260926120000_cross_plan_lag_working_minutes` (ADR-0161, `docs/TECH_DEBT.md` #385): re-encode every
cross-plan lag from working minutes back to `days × 1440`, checked against `cross_plan_lag_migrations`,
then drop that table and the migration's `_prisma_migrations` row. Its e2e proof
(`cross-plan-lag-migration.e2e-spec.ts`) went with the migration (ADR-0215 amending ADR-0107 D2). On a
1.1 database every lag has been written in working minutes from the first row, so there is nothing to
re-encode, and the table `cross_plan_lag_migrations` no longer exists (ADR-0215 D6). Rolling 1.1 back to
1.0 is the old volume (ADR-0215 D3). The procedure, its three caveats and the migration's `resolved`
CTE are at git tag `api-v1.0.0` (this file).

### Re-derivation markers (history)

Until 1.0 a release that changed what the engine writes into engine-owned columns shipped a marker
migration, and a boot service recalculated the affected plans once, keyed on that row's `finished_at`.
Rolling an image back past such a release meant deleting the marker row first. The 1.1 baseline
(ADR-0215) removed every marker row, and the five boot services with them: a fresh database has
nothing to re-derive and no row to delete. The procedures, and the measured cost of each first boot,
are at git tag `api-v1.0.0` (this file and `docs/DATABASE.md`). A future release that needs the
technique again defines it afresh, with its own rollback step.

### Rolling back past the P6 activity codes release

**History; it does not apply to a 1.1 database.** Until 1.0 this section described running the images
before the P6 activity codes release (two forward-only migrations, `20261027120000` and
`20261027120100`) against a database that had applied them: the lock cost during a rolling deploy, the
expiry failures on plans holding codes, and a seven-step reset of every plan whose swimlanes came from a
code, with a per-version table of how far back a baseline allowed. The 1.1 baseline (ADR-0215) contains
the code tables from the first row and a 1.1 database is never run by a pre-1.1 image: rolling 1.1 back
to 1.0 is the old volume, not a reverse script (ADR-0215 D3,
[`docs/guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md)). The procedure and its
measurements are at git tag `api-v1.0.0` (this file).

### Which switches actually work on a running container, and which do not

This distinction is not obvious from `.env.example`, where both kinds sit in one list
looking like the same thing — and only one kind does anything.

**Server-side variables are real.** `RETENTION_SWEEP_ENABLED`, `PLAN_EDIT_LOCK_ENFORCED`,
`AUTH_REQUIRE_EMAIL_VERIFICATION`, `STAFF_EMAILS`, `MAIL_ALERT_URL`, `HEARTBEAT_URL` and the
`CSP_*` pair are read from `process.env` at boot (the CSP pair by nginx's `envsubst` at
container start). Edit the stack's `.env`, `docker compose up -d`, done — no rebuild, no new
image. That is the property worth having: a rollback that needs a release is slower than the
incident.

**There are no web feature flags.** All 48 `VITE_` flags were retired in 1.1 (ADR-0215 D8), so
every capability the client has is always on. Vite inlines `import.meta.env.VITE_*` as a literal
when the bundle is built, and the one build arg `apps/web/Dockerfile` declares is `VITE_API_URL`
(`docker-publish.yml` passes none; `.dockerignore` strips `**/.env`), so nothing in a compose
stack could switch a client behaviour at runtime in any case.

So **your per-feature rollback is image-tag pinning**, described under
"[Deploying a release](#deploying-a-release-to-a-self-hosted-host-docker-compose--dockge)".
`web` and `api` version and publish independently (ADR-0027), so pinning `WEB_IMAGE_TAG` rolls
the client back **without touching the API or the schema** — which matters, because migrations
are forward-only (ADR-0018). And it holds: Watchtower only updates a container whose `:latest`
digest has moved (ADR-0047), so a pinned semver tag is never silently re-pulled.

## The owner's deployment

**This is the canonical deployment until the product scales** (owner, 2026-11-09). Where it differs from
`docker-compose.release.yml`, the guides give both forms; the release compose file is deliberately left as it is,
because changing where it keeps the database would point anyone else using it at an empty one
(`docs/DECISIONS.md`, 2026-11-09). Values of secrets and of the alert and heartbeat URLs are never written down
here.

| What             | The owner's server                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host tooling     | **Dockge**; the stack folder is `/apps/schedulepoint`, holding `compose.yaml` and `.env`; compose project name `schedulepoint`                                                                                |
| Terminal         | Usually a terminal that is **root inside a container**: there is no `sudo`, so leave it out of every command in the guides                                                                                    |
| `db`             | `postgres:17-alpine`, container `schedulepoint-db`, no published port                                                                                                                                         |
| `api`            | `ghcr.io/huttonhomehub/schedulepoint_1/api:${API_IMAGE_TAG:-latest}`, container `schedulepoint-api`                                                                                                           |
| `web`            | `ghcr.io/huttonhomehub/schedulepoint_1/web:${WEB_IMAGE_TAG:-latest}`, container `schedulepoint-web`, port 8080 behind the owner's reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`                |
| `backup`         | The same api image, `user: '1000:1000'`, entrypoint `schedulepoint-backup.sh`, command `schedule`                                                                                                             |
| `watchtower`     | `containrrr/watchtower:1.7.1`, container `schedulepoint-watchtower`, label-enabled, monitor-only switchable from `.env` (`WATCHTOWER_MONITOR_ONLY`), GHCR sign-in from the host's `/root/.docker/config.json` |
| Database storage | A **folder** (bind mount), `/apps/schedulepoint/db`, **not** the `db-data` named volume                                                                                                                       |
| Backups folder   | A folder, `/apps/schedulepoint/backups`, mounted into both `api` and `backup`, owned by uid 1000 (shown as `node` in the owner's terminal)                                                                    |

**Settings in `.env`** (names only): `PLAN_EDIT_LOCK_ENFORCED=true`, `AUTH_REQUIRE_EMAIL_VERIFICATION=false`,
`RETENTION_HIERARCHY_ENABLED` armed, `STAFF_EMAILS` set to the owner's address, mail through Resend SMTP
(`MAIL_SMTP_URL`, `MAIL_FROM`), and `MAIL_ALERT_URL` and `HEARTBEAT_URL` set.

**What the folder form changes.** A database in a folder is moved, copied or deleted as a folder: there is no
`docker volume` command to run. Starting fresh is moving the folder aside with the stack stopped (that is how the
owner switched to 1.1.0 on 2026-11-09, [`guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md)), and
"removing the old volume" is deleting the old folder. Postgres creates and owns the files inside it; do not change
their owner by hand.

**Dockge's buttons.** **Update** pulls newer images and then starts the stack (`docker compose pull`, then
`up -d`): that is the one that installs a release. **Deploy** saves the compose file and starts the stack with the
images already on the server; it does **not** pull. **Restart** restarts the containers as they are.

**Since 2026-11-09** the server runs 1.1.0 on a fresh, empty database (the 1.0 data was discarded by choice and the
old folder deleted), backups run and pass `check`, retention expiry is armed, and the staff console and mail work.

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
   `docker compose pull` then `docker compose up -d`. (**Deploy** does not pull: it starts the stack with the
   images already on the server.) From the host CLI in the
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
   version bump applies pending DB migrations automatically before it serves. Where the
   backups folder is mounted on the `api` service, a copy of the database is taken first
   (ADR-0192 D9, [Backups](#backups)).
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

## Turning email verification on

`docs/TECH_DEBT.md` #16, ADR-0074 M5-T6/T7. The code has been ready since 2026-08-05; what has been
missing is the count and the decision it informs.

**Order matters, and this is the one irreversible step in the programme.** The backfill writes
`email_verified = true` and cannot be undone — nothing records which rows were already true, so
running the inverse would un-verify accounts that earned it honestly. Do the CSP flip first
(above): it rehearses the same edit-a-variable-and-recreate loop where a mistake costs seconds.

1. **Count.** Note the **redirect**, not `-f`:

   ```bash
   docker compose -f docker-compose.release.yml exec -T db \
     psql -U app -d app -v ON_ERROR_STOP=1 < scripts/verification-backfill.sql
   ```

   `-f` would make psql look for the file **inside** the db container, which mounts only its data
   (`db-data:/var/lib/postgresql/data`, or a folder on a host like the owner's) — there is no host mount
   carrying the script, so `-f` fails with
   "could not open file". This step said `-f` until 2026-08-09 and had never been run; it would
   have failed at the most delicate point in the programme. It only SELECTs; the UPDATE is
   commented out.

   It reports **three** figures rather than one, and the third is the one to read carefully:

   - total unverified accounts — if this is small, the strict option (nobody backfilled, everyone
     re-verifies) costs almost nothing and is cleaner;
   - of those, how many already hold an organisation membership;
   - **of the remainder, how many hold a _pending invitation_.** This is the risk set. The product
     owner chose to backfill everyone, and the members-only predicate existed to exclude exactly
     this case: an address that registered an account and has an invitation waiting but no
     membership yet. Backfilling it lets that account accept without ever proving mailbox
     ownership — the squatting path enforcement exists to close. It is very likely **zero**, in
     which case both options were identical; if it is not, the query names the rows, and the
     decision should be taken on real addresses.

2. **Backfill.** Uncomment the `UPDATE` in that file and re-run the same command.
3. **Flip.** Set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and recreate the API.
4. **Smoke it.** Sign up a throwaway address, confirm the email arrives, follow the link, confirm
   it lands on the app rather than the "still waiting" screen — that last step is the ADR-0074 M5
   defect, where a verification that had succeeded rendered the pending state because the router
   JSON-parsed `?verified=1` into a number.

Note what the flip arms: `invitations.service.ts` begins refusing unverified invitees, and the
verification link is a bare acting GET, so a link-prefetching mail scanner can consume it
(`docs/TECH_DEBT.md` #88 — narrowed, and the invitation path is already safe behind a real button).

## Turning the CSP from report-only to enforce

`docs/TECH_DEBT.md` #8. The policy itself is finished and gated: `apps/web/e2e-csp/` serves the
**real** policy — parsed out of `docker-compose.yml`, never restated — over the **production**
build, in a real browser, on its own CI step. What is left is one operator variable.

It is a variable and not a build constant on purpose: hard-coding the mode would make a rollback a
release (ADR-0074). Report-only is the default so a policy error cannot take the app down before
anyone has watched it.

The observation window has already run and found its violations. There was one real
`script-src`/`eval` report on the deployed origin — Zod 4's `allowsEval()` probe, a swallowed
`new Function('')` whose _attempt_ the browser still reports — fixed by `config/zod-jitless.ts`
rather than by adding `'unsafe-eval'`, which would have re-opened string-to-code across the whole
origin to buy JIT speed on a few login forms.

**To enforce:**

1. Set `CSP_HEADER_NAME=Content-Security-Policy` in the host's `.env` (it defaults to
   `Content-Security-Policy-Report-Only` in both compose files).
2. Recreate the web container only — `docker compose up -d web`. The API is untouched.
3. **Walk the routes with the console open.** This is the step that matters, and it cannot be
   automated away: the e2e suite covers the sign-in and app shell paths, and states plainly what it
   does **not** — canvas export, the printed programme, and `upgrade-insecure-requests`, which
   report-only ignores by specification. So visit, in one sitting: a plan workspace (TSLD **and**
   Gantt), an export to PNG/PDF, the printed programme, the guest share view, and `/account`.
4. Any violation appears in the console as a blocked resource. **Roll back by unsetting the
   variable and recreating** — one variable, one recreate, seconds. That reversibility is why this
   is sequenced before the email-verification flip, whose backfill does not roll back.

## Alerting on mail failures

> **Setting this up for the first time? Follow [`docs/guides/set-up-alerts.md`](guides/set-up-alerts.md).**
> It is the step-by-step version for a non-specialist, including the test that proves it works. This
> section stays the reference.

`docs/TECH_DEBT.md` #100. ADR-0075 decided a failed send is the **operator's** signal, not the
caller's — telling the caller would make "that address was free" distinguishable from "that address
is taken" on an unauthenticated endpoint. The application emits one alertable line,
`event: 'mail.send_failed'`. Until now nothing watched it, which meant a broken relay produced
silently unrecoverable accounts: every sign-up, invitation and password reset failing, for every
organisation, with the first signal being someone who cannot get in telling somebody.

> **Read the two subsections below before setting any of this up.** `scripts/watch-mail-failures.sh`
> is **superseded** (2026-08-09) by `MAIL_ALERT_URL` and `HEARTBEAT_URL`, which do the same two jobs
> from inside the container. It is still in-tree as the fallback (it was meant to go after one release and has not), and this section is
> kept because an operator running it today needs it to keep making sense. **If you are setting this
> up for the first time, skip to "The API can now do this itself" and do not install the cron at
> all.** What follows describes the path being retired.

`scripts/watch-mail-failures.sh` closes that. Run it from cron on the host:

```cron
*/5 * * * * SP_ALERT_URL=https://ntfy.sh/your-topic SP_API_CONTAINER=schedulepoint-release-api-1 /opt/schedulepoint/scripts/watch-mail-failures.sh
```

**Check the container name first.** Neither compose file sets `container_name`, so Compose names
the container `<project>-<service>-<index>` — `schedulepoint-release-api-1` for the release stack,
`schedulepoint-api-1` for a local build, and something else again if Dockge names the project after
its stack directory. Confirm with `docker ps --format '{{.Names}}' | grep api`. A wrong name is not
silent — the script alerts "cannot read logs" — but then it alerts every five minutes about itself
rather than about the mail.

**The alert must not be email.** The one transport it exists to report on is the broken one. An
ntfy topic, a Slack or Discord webhook, or a phone push all work; the script only needs a URL that
accepts a POST. It refuses to run with no `SP_ALERT_URL` rather than watching silently.

It is **not** wired into `/api/v1/health/ready`, and that is deliberate: the host recreates containers
unattended (ADR-0047), so a readiness probe failing on a 03:00 relay blip would take the API down
and keep it down. Same reasoning as the boot-time SMTP handshake being warn-only.

Both compose files now set `logging: json-file, max-size 10m, max-file 3` on every service. Docker's
default has **no rotation**, so a steadily-logging container fills the host disk until something
else fails first — and the API's structured Pino output is exactly that.

### The API can now do this itself — `MAIL_ALERT_URL`

Staff console M1. The cron above greps `docker logs` from outside the container; the API can send
the same signal from inside it, which needs no Docker socket, no container name and no host script:

```yaml
api:
  environment:
    MAIL_ALERT_URL: https://ntfy.sh/your-topic
    MAIL_ALERT_WINDOW_MINUTES: 10
```

Recreate the API container and it takes effect. **Unset, behaviour is exactly what it was** — the
failure is logged and nothing else — which is the rollback: clear the variable and recreate.

The message names the failure count, the window and which kinds of message failed. It **never names
a recipient**, deliberately: the alert leaves for a third-party chat service, and the address lives
in `mail_events` where reading it is an audited act behind the staff guard. The first failure alerts
immediately; the window bounds the **repeats**, so a broken relay produces one alert and one summary
rather than one per send.

The URL is validated at boot — a typo refuses the boot rather than producing a channel that silently
never delivers. Any endpoint accepting a JSON POST works; the body carries `text`, which Slack and
Mattermost render directly.

**This replaces the cron's mail-failure half, not the cron.** Keep the script running until you have
watched the new path alert on the real host at least once — see "the liveness half" below for what
the script still covers that this cannot, and "retiring the cron" below for how to get that
observation without waiting for a genuine outage.

### The liveness half — `HEARTBEAT_URL`

**An application cannot alert that it is down.** Everything above is a signal the API sends when
something is wrong, and the API sends nothing when the API is what is wrong. The cron does not escape
this either: it runs on the host it is watching, so a host outage silences the watcher and the thing
watched together.

The only construction that survives the failure it reports is an inverted one — the API pings
outward on a schedule and an external service alerts on the **absence** of pings:

```yaml
api:
  environment:
    HEARTBEAT_URL: https://hc-ping.com/<your-check-uuid>
    HEARTBEAT_INTERVAL_MINUTES: 5
```

Create the check first (healthchecks.io has a free tier; any dead-man's-switch works), set its
**period a little longer than the interval** so an ordinary slow ping is not an alarm, and paste its
URL in. The API pings once at boot and then on the interval; unset, **no timer is created at all**.

Treat that URL as a credential: anyone holding it can suppress the alarm. It is never logged.

> **Nothing is watching this yet.** It ships built and dormant by choice (2026-08-09) so wiring a
> receiver is a compose edit rather than a release. Until you create the check,
> `docs/TECH_DEBT.md` #100's operator half stays **open** — the code existing does not close it,
> because a signal nobody receives is the failure that entry records in the first place.

### Retiring the cron

**Remove the cron line only after you have watched the new path alert on this host.** Not after the
release notes say it shipped, and not after the tests pass — the code has passed unit tests, an API
end-to-end suite and a real migration, and none of that is evidence that _this_ host's outbound
network lets _this_ container reach _your_ receiver. That is the one thing the cron was covering and
the one thing no test in the repository can establish.

The trap is the word "watched". A relay does not break to a schedule, so waiting for a genuine
failure means the cron is retired either never or on a day nobody is paying attention. **Cause one
instead**, which takes about two minutes and is fully reversible:

1. Set `MAIL_ALERT_URL` and `HEARTBEAT_URL` as above and recreate the API container. Confirm the
   heartbeat first — the dead-man's-switch check should go green within one interval. That proves
   outbound POSTs leave this container at all, which is the shared prerequisite; if it fails, the
   mail alert was never going to work either and you have learned it without breaking mail.
2. Point `MAIL_SMTP_URL` at a port with nothing on it — `smtp://127.0.0.1:1` is enough — and
   recreate. Sends now fail at connect, immediately, with no message going anywhere by accident.
3. Trigger one send: request a password reset for **an address that has an account** on your own
   installation. A reset for an address with no account sends nothing, by design (ADR-0074, so a
   stranger cannot learn who is registered), so a made-up address produces no failure and no alert —
   which looks exactly like a broken alert.
4. Watch your receiver. A single failure alerts at once with `SchedulePoint: <kind> mail failed to
send.` (the kind only, no count). Press reset once; if more failures land inside
   `MAIL_ALERT_WINDOW_MINUTES`, a summary naming the count, the window and the kinds follows when the
   window closes. Then open `/staff` and confirm the failure is in the Mail panel with an error class —
   that is the durable half, and it proves the row was written as well as the alert sent.
5. Restore the real `MAIL_SMTP_URL`, recreate, and send one more reset to confirm mail works again.
   **Do this before step 6** — a half-finished retirement that leaves mail pointed at nothing is
   strictly worse than the cron you were removing.
6. Now remove the cron line, and delete `scripts/watch-mail-failures.sh` from the host.

If step 4 produces nothing, the cron stays. The script is not elegant, but it is the alerting you
actually have until something replaces it, and removing it on the strength of a merged pull request
is how an installation ends up with no alerting at all and no one aware of it.

## Backups

The owner's step-by-step version is [`docs/guides/back-up-and-restore.md`](guides/back-up-and-restore.md).
This section is the reference. Design and decisions: ADR-0192 and
[`docs/specs/database-backup/`](specs/database-backup/feature-spec.md).

The database password defaults to `app` when `.env` sets no `POSTGRES_PASSWORD`, and Postgres reads it
only when the data directory is first created, so changing it on an existing installation is an
`ALTER USER` as well as an `.env` edit. The API logs `database.default_password` at start-up while it is
`app`; the steps are in the guide's
[Set a database password](guides/back-up-and-restore.md#set-a-database-password-recommended-about-10-minutes).

### What runs

- **The `backup` service** (`docker-compose.release.yml`, and `docker-compose.yml` for development)
  runs the API image's `schedulepoint-backup` script (`apps/api/backup/`), so it moves with the API
  image (same tag, Watchtower label) and depends on `db` only: copies continue while the API is
  crash-looping. It takes a copy at 02:00 UTC every day, and at once when no copy exists, then prunes.
  The container is `read_only`, drops all capabilities and holds only the database credentials.
- **The copy before an update** is taken by the API's entrypoint
  (`apps/api/docker-entrypoint.sh`, `schedulepoint-backup pre-migrate`) just before
  `prisma migrate deploy`.
- **The database publishes no port** in the release stack (ADR-0192 D10). `docker compose exec db psql`
  is unaffected; a database tool on another computer can no longer connect. `docker-compose.yml`
  keeps its port for local development.

### Settings

| Setting            | Default     | Meaning                                                                          |
| ------------------ | ----------- | -------------------------------------------------------------------------------- |
| `BACKUP_DIR`       | `./backups` | Host folder for the copies (compose interpolation, relative to the compose file) |
| `BACKUP_KEEP_DAYS` | `30`        | Whole days 1 to 3650; older copies are deleted after a good copy                 |

Both are part of the 1.0 promise. There is no setting for the schedule (02:00 UTC) and none for the
pre-update copy: it is on exactly when the `api` service mounts `/backups`, and removing that one
volume line switches it off. A server that has not mounted the folder logs
`backup.pre_migrate_skipped` (reason `not_enabled`) and migrates as it always did.

**The folder must exist and belong to uid 1000 (`node`) before the stack starts:**
`sudo install -d -o 1000 -g 1000 -m 700 backups`. Otherwise Docker creates it owned by root and every
update with a database change is held. Copies are written mode 600 under `umask 077`.

### Files in the folder

| File                                              | What                                                      |
| ------------------------------------------------- | --------------------------------------------------------- |
| `schedulepoint-YYYY-MM-DDTHHMMZ.dump`             | A nightly (or `now`) copy, `pg_dump` custom format        |
| `schedulepoint-pre-migrate-YYYY-MM-DDTHHMMZ.dump` | The copy taken before an update that changes the database |
| `schedulepoint-pre-restore-YYYY-MM-DDTHHMMZ.dump` | The safety copy `restore` takes of the database it swaps  |
| `<copy>.sha256`                                   | Its checksum (`sha256sum -c` works from the folder)       |
| `LAST-BACKUP.txt`                                 | Plain-English outcome of the latest nightly copy          |
| `UPDATE-HELD.txt`                                 | Present only while an update is held                      |

A copy is written as `.partial` and renamed only when finished and readable. Pruning deletes only
these file kinds, only after a good copy, and never the newest nightly copy nor the newest pre-update
copy.

### Signals

1. **Container health.** `backup` is healthy only while the newest nightly copy is under 26 hours
   old. `docker compose ps` and Dockge show `unhealthy` otherwise.
2. **`LAST-BACKUP.txt`**: starts `OK` or `FAILED`, with the reason and the newest good copy.
3. **Log lines** (one JSON object per line): `backup.succeeded`, `backup.failed`, `backup.pruned` in
   `docker compose logs backup`; `backup.pre_migrate_skipped` (reason `not_enabled`, `fresh` or
   `none_pending`), `backup.pre_migrate_taken` and `backup.pre_migrate_failed` in
   `docker compose logs api`.

None needs an outside service. A ping to an external monitor after each good copy is not built.

### Commands

`docker compose run --rm backup <command>`, run in the folder that holds the compose file (add `-f <name>` after
`docker compose` only if the file is not called `compose.yaml` or `docker-compose.yml`):

| Command                  | What it does                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `list`                   | The copies, newest first                                                                             |
| `now`                    | Take a copy immediately                                                                              |
| `check [file] [--keep]`  | Load a copy into a scratch database, print counts beside the live ones, drop it. Ends `CHECK PASSED` |
| `restore <file> [--yes]` | Replace the live database with a copy; needs the API stopped. Ends `RESTORE FINISHED`                |
| `health`                 | Exit 0 when a nightly copy is under 26 hours old (the healthcheck)                                   |
| `preflight`              | What the API's entrypoint calls first: refuses a pre-1.1 database; not for hand use                  |
| `pre-migrate`            | What the API's entrypoint calls; not for hand use                                                    |

File arguments must be `schedulepoint-*.dump` names inside the backups folder.

### Restore semantics

`restore` refuses if anything else is connected, if the copy is damaged (checksum or
`pg_restore --list`), or if the copy holds a migration this image does not know (a copy from a newer
version). It loads the copy into a new `<db>_restoring` database from `template0`, checks it, takes a
`pre-restore` safety copy of the live database, and swaps by renaming. The previous database is kept
as `<db>_before_restore_<stamp>` and never dropped by the tool. Because nothing is updated or deleted
during the load, the append-only triggers on `audit_events` (ADR-0072) have nothing to refuse. The
live database is untouched until the final rename. Restoring an older copy and then starting the
current API applies the newer migrations as any update does, with a pre-update copy first.

If the recycle bin's clear-out is on (`RETENTION_HIERARCHY_ENABLED=true`), switch it off before
restoring a copy to recover something it removed: the sweep runs at boot and would remove the
recovered item again (see "Deleted work" below).

### The hold

If the copy before an update cannot be made, or the database cannot be asked what is pending, the API
container prints an `UPDATE HELD` line, writes `UPDATE-HELD.txt` and exits non-zero **before**
`prisma migrate deploy`. `set -e` in the entrypoint is what makes that a hold; removing it removes the
hold. The database is unchanged. Docker restarts the container, so once the cause is fixed (usually
disk space) the update completes by itself and `UPDATE-HELD.txt` is removed. It is removed **only** when that
copy is then taken (`cmd_pre_migrate` in `apps/api/backup/schedulepoint-backup.sh`), so a hold that clears on a
start with nothing pending leaves the file behind; delete such a leftover by hand. The owner found one dated
2026-10-26 (the database not yet resolvable as `db` at start-up). Since 1.1.0 `preflight` refuses an unreachable
database first (`cannot_read`) and writes no file, which closes that cause. The other ways out are
pinning `API_IMAGE_TAG` to the previous version (valid because nothing was migrated) or removing the
`/backups` volume line from `api`. Pending is decided by comparing the migration directories in
`/app/prisma/migrations` with applied rows of `_prisma_migrations`, never by the exit code of
`prisma migrate status`. A copy of a large database lengthens the boot of an update that carries a
change; that time is unmeasured on the production data (`docs/TECH_DEBT.md` #511).

### Client and server major

The image carries PostgreSQL 17 client tools and the `db` image is `postgres:17-alpine`. The script
refuses, with a plain message, to copy a server whose major version is newer than its tools. Moving
`db` to a newer major means updating the client in `apps/api/Dockerfile` first.

### Limits

Copies live on the same disk as the database, so losing the disk loses both; `BACKUP_DIR` can point at
a second disk or a network folder, and an off-site copier is `docs/TECH_DEBT.md` #509. Copies are not
encrypted and contain password hashes and session tokens. The `.env` file is not in them.

## Retention — what gets deleted, and when

ADR-0087. Two tables documented a period, and until this shipped **nothing enforced either**:
`csp_reports` (30 days) and `mail_events` (12 months). The API now sweeps them on a timer inside its
own process — no Redis, no queue, nothing to install. `perf_probe_results` (365 days) joined them
when the staff console gained its performance readings, and `crash_reports` (30 days after the crash
was last reported; `RETENTION_CRASH_REPORTS_DAYS`, optional) joined with browser crash reports.

```yaml
api:
  environment:
    RETENTION_SWEEP_ENABLED: 'true' # the default
    RETENTION_CSP_REPORTS_DAYS: 30
    RETENTION_MAIL_EVENTS_DAYS: 365
    RETENTION_PERF_PROBE_DAYS: 365
    # RETENTION_CRASH_REPORTS_DAYS: 30  # optional; 30 is the default and nothing needs setting
    RETENTION_SWEEP_INTERVAL_MINUTES: 60
```

**A reading holds a staff member's own machine fingerprint** — the GPU renderer string, the screen,
the user agent — alongside their address. That is why it lives in an ordinary table that can be
corrected, scrubbed and expired, rather than in `audit_events`, which refuses `DELETE`. The audit
row beside it says only that a reading was taken, and names the scenario.

**It is on by default, unlike the two alerting URLs above**, and the difference is deliberate: those
need a receiver you have to create, so shipping them armed would point at nothing. A sweep needs
nothing, and both periods were already decided by an accepted ADR. Rollback is
`RETENTION_SWEEP_ENABLED=false` and a recreate — which creates **no timer at all**, rather than one
that deletes nothing.

> **Shortening a period is free. Lengthening it recovers nothing.** Rows deleted under the old value
> are gone, and no later edit brings them back. This is the one setting in the product where a typo
> is unrecoverable, which is why the minimum is one day — there is no value here that empties a table
> on the next tick — and why the effective numbers are logged at boot rather than left to be inferred
> from what disappears. Watch for `event: 'retention.configured'` after a recreate.

**What it will delete on your host: nothing, for a while.** Both tables were created on 2026-08-09,
so the first CSP rows become eligible thirty days later and the first mail events in a year. The
sweep runs and reports `deleted: 0` until then, which is the correct behaviour and worth knowing so
an empty result does not read as a broken sweep.

### Deleted work — the switch that destroys something a person can still see

Everything above deletes operational rows nobody has ever looked at. This one is different, and it
is the only setting in SchedulePoint that permanently destroys **customer work**.

```yaml
api:
  environment:
    RETENTION_HIERARCHY_ENABLED: 'false' # the default, and the safe direction
    RETENTION_HIERARCHY_DAYS: 90
```

A client, project or plan a planner deletes is a **soft** delete: the row stays, it appears under
**Recently deleted**, and it can be restored. With this switch on, the same row is **permanently
removed** once it has sat there for `RETENTION_HIERARCHY_DAYS`, along with its whole subtree — the
plans under a client, the activities in those plans, their logic, notes, baselines and resource
assignments. Nothing brings it back. Nothing in the product can, either: `POST …/purge` does not
exist and is refused by design (ADR-0096 D1), so there is no button anywhere that does what this
setting does on a timer.

Resources and organisation-wide calendars also appear under **Recently deleted** (ADR-0195) and are
**not** on this timer (D4): they stay until restored. A project's own calendars go with the project.

The owner's step-by-step version of everything below (preview, switch-on day, switching off,
recovering something) is [`docs/guides/switch-on-the-clear-out.md`](guides/switch-on-the-clear-out.md).

**Precondition: a same-day copy that has passed `check` on this host** (ADR-0192 D8). Run
`docker compose run --rm backup check` (in the stack folder) and see `CHECK PASSED` for a copy
made today before you set `RETENTION_HIERARCHY_ENABLED=true`. This switch destroys work with no way
back except a copy, and a copy nobody has tested is not yet a backup.

Five things to know **before** you set it to `true`:

1. **The clock is retroactive.** It counts from when each item was deleted, not from when you armed
   the switch. On a host that has been running for a year, the first tick — which happens at boot,
   not an hour later — permanently deletes everything already older than the period. There is no
   grace window.
2. **Run the preview first.** There is a command that lists, without changing anything, every
   deleted client, project and plan on this server that is past the period (so would go on the first
   tick), with what goes with each, and what falls due in the next 7 days. From the stack folder:

   ```sh
   docker compose exec api node dist/cli/clear-out-preview.js
   ```

   Its first line says whether the clear-out is on or off **on this server**, so it also shows
   whether your compose file passes the setting through. It uses this host's
   `RETENTION_HIERARCHY_DAYS`, lists every organisation (it reads the database directly, like
   `psql`), prints names to your terminal only and never to the log, and runs on a read-only
   database session. It selects with the same code the sweep does (ADR-0193 D1). Read it, restore
   anything that should not go from **Recently deleted** (or ask that organisation's admin), then
   arm. The **Recently deleted** screen does _not_ show a countdown while the switch is off
   (ADR-0096 D11), so it is not a preview.

3. **Only `true` and `false` are accepted.** Any other value fails the boot rather than being
   guessed at — including the empty string. This is stricter than the other switches on purpose: an
   earlier version used a coercion that read `'false'` as **true**, so the documented way to turn it
   off turned it on (ADR-0096 D10).

4. **"Permanently removed" means removed from the live database, not from the backups.** Nightly
   copies are kept `BACKUP_KEEP_DAYS` (30) days, so copies made before an item was removed still hold
   it until each is deleted; the last of them goes about 30 days after the removal. Pruning never deletes the newest copy of each kind, so the newest
   "before an update" copy can be months old and still hold everything as it was then. A restore also
   keeps the replaced database as `<db>_before_restore_<stamp>` until someone drops it by hand. And
   the `hierarchy.expired` audit row keeps the item's **name** for ever (ADR-0085 D1). Erasing a
   client's data completely therefore needs the live removal **and** deleting or waiting out the
   copies; that is ADR-0085's territory and is not built here. The converse is the safety net: for about
   30 days after removal a copy made before it can bring the item back, at the cost of all work done since
   that copy.

5. **Switch it off before restoring a copy to recover something it removed.** The sweep runs at
   every boot. A restored database holds the item in **Recently deleted** still older than the
   period, so with the switch on the sweep would remove it again within a minute of the API
   starting. Set `RETENTION_HIERARCHY_ENABLED=false`, restore (`docs/guides/back-up-and-restore.md`
   Part 3), restore the item from **Recently deleted**, then decide whether to switch it on again.

Each permanent deletion writes one `hierarchy.expired` audit event naming the item and how much went
with it. That row is in the organisation's own audit log, not the staff console, and it is the only
explanation a planner who finds their work gone will ever get — so it outlives the thing it names, by
design and permanently (`audit_events` refuses `DELETE`, ADR-0085 D1).

Rollback is `RETENTION_HIERARCHY_ENABLED=false` and a recreate, which creates **no timer at all**.
It does not bring anything back.

What to watch in the log:

| Event                                            | What it means                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hierarchy_expiry.disabled` (info)               | No timer exists. The default. Carries `pastPeriod` (how many clients, projects and plans are already past the period; counts only, no names).    |
| `hierarchy_expiry.armed` (**warn**)              | Permanent deletion is live from this boot. Logged at warn deliberately: it belongs in a log an operator skims, not one they grep.                |
| `hierarchy_expiry.batch` (info)                  | One subtree expired, with its counts and its duration — so the per-run caps can be re-derived from your data rather than from a bench.           |
| `hierarchy_expiry.overlapped` (warn)             | A run was still going when the next tick fired, and the tick was skipped. Occasional is fine; repeated means the interval is shorter than a run. |
| `hierarchy_expiry.permanent_failure` (**error**) | One subtree **can never expire** and will be retried hourly forever. Not transient — it needs a code fix.                                        |
| `hierarchy_expiry.failed` (error)                | One subtree failed for some other reason; the next tick retries it.                                                                              |
| `hierarchy_expiry.skipped_restored` (debug)      | A planner restored (or re-deleted) an item after the sweep chose it and before it was deleted; nothing was removed. Only at `LOG_LEVEL=debug`.   |

A run is bounded twice — by activities and by number of deletions — so a large backlog is worked
through over several ticks rather than in one. That is by design, and it is why the first ticks after
arming may report far less than you expect to see go.

### When it keeps failing

If the sweep fails **three runs in a row**, one message is POSTed to `MAIL_ALERT_URL` — the same
webhook the mail alerter uses, and the only operator control this needs. Three rather than one is
deliberate: a single failed sweep is usually a connection the process will have again on the next
tick, and the next tick **is** the retry, so alerting on it would train you to mute the channel. A
muted channel is worth less than no channel, because it is believed to be working.

One message per incident, not per tick. A clean run closes the incident, so a sweep that recovers and
breaks again hours later alerts again — that is a new incident to whoever is reading it.

The body carries the failure count and the table names and **nothing from a row**: this POST leaves
your system for a third-party chat service, `csp_reports` holds attacker-controlled strings, and
`mail_events` holds customer addresses.

> **What this cannot tell you: that the sweep never started.** No runs means no failures means no
> alert, forever. That is why the console's **overdue** marker is derived from the age of the oldest
> surviving row rather than from this counter — it is the primary detector, and the alert is the
> secondary one, for a sweep that is running and losing.

With `MAIL_ALERT_URL` unset — which it is on the deployed host today — nothing is POSTed and the
staff console is the only signal. See `docs/TECH_DEBT.md` #100.

### Checking it without a shell

The staff console (`/staff`) carries a **Retention** section, and its leading answer is deliberately
**derived from the data rather than reported by the sweep**: the age of each table's oldest surviving
row against the configured period. That matters because the sweep's own bookkeeping is held in
memory and resets on every recreate — so a last-run timestamp cannot tell "the sweep is working"
from "the sweep never armed", which is the same inverted-signal problem the heartbeat exists to solve
one layer out. A table whose oldest row is older than its period **plus one interval** is marked
**overdue**, in words, with the number the claim rests on.

Four states are worth recognising, because they look similar and mean different things:

| The section says                                  | What it means                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Retention sweeping is disabled"                  | `RETENTION_SWEEP_ENABLED=false` took effect. No timer exists.                                                                                                            |
| "This process has not swept yet", in plain text   | The API restarted moments ago and has not produced a result yet. Routine.                                                                                                |
| "This process has not swept yet", **as an error** | More than one interval has passed with no result. The boot sweep is unawaited and finishes in milliseconds on an idle table, so this almost certainly means it is stuck. |
| "Not swept yet" against **every** table           | The last run threw before it reached any table. The consecutive-failure count says for how long.                                                                         |

The third row used to read _"'Not swept yet' against a **single** table — this process has swept, but
that table was not reached"_. **That state does not exist.** `sweepAll` returns one result per policy,
so a per-table failure renders "Last run failed", and the only path that clears the per-table results
clears all of them together. The UX review caught it: a claim written from the shape of the model
rather than from the code, which is the ADR-0076 Class 3 failure this repository keeps a rule for.
An empty table reads **"no rows"** and never "0 days": a measurement of zero and having nothing to
measure are different facts, and only one of them is something the response can honestly state.

**Two things it deliberately does not do.** It never touches `audit_events` — that table refuses
`DELETE` in the database and ADR-0085 D1 declined to relax it, so **its** documented period stays
unenforced (`docs/TECH_DEBT.md` #118). And the CSP period bounds **staleness, not data age**:
`last_seen_at` moves on every repeat, so a violation still being reported never ages out. That is
intentional — expiring a live finding would remove it from the Security panel, the one screen built
to show what the policy is blocking now.

## The staff console

SchedulePoint staff operate the **installation** — mail health, Content-Security-Policy reports,
what this installation is running, which accounts cannot verify, and what staff themselves have
done. They reach **no customer data at all**: `StaffPrincipal` carries no memberships and no
permissions, so a staff request reaching a member service is a compile error rather than a check
somebody has to remember (ADR-0086). The console is at `/staff`, and a **Staff console** item
appears in the account menu for allowlisted, verified accounts only — everybody else sees no such
item, which is indistinguishable from a product that has no console. If you have just added
yourself to `STAFF_EMAILS`, the menu item appears after the next sign-in; the direct URL works
immediately.

```yaml
api:
  environment:
    STAFF_EMAILS: ops@schedulepoint.example,second@schedulepoint.example
```

Empty — the default — means **nobody**. An allowlisted address must also have a **verified email**,
unconditionally and regardless of `AUTH_REQUIRE_EMAIL_VERIFICATION`: without that, an allowlisted
address that has never signed up is squattable, and whoever registers it first becomes staff.

**So on a new database the console stays hidden until the confirmation email has been clicked**, even on a host
with `AUTH_REQUIRE_EMAIL_VERIFICATION=false` like the owner's. That is what the owner met on 2026-11-09: the mail
was slow, so they marked their own row confirmed by SQL (`UPDATE users SET email_verified = true WHERE email =
'<address>'` through `docker compose exec db psql`), and the mail then arrived and confirmed it anyway. The SQL
route is acceptable only for an address the operator controls, because it is exactly the check the rule above
exists to make; the steps are in [`guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md), Part 3.

**A malformed entry fails the boot**, loudly, rather than being ignored. That is deliberate: a typo
here fails _closed_ — nobody becomes staff, the console 404s for the person it was configured for,
and every diagnostic points at the guard rather than at this line. Spacing is tolerated
(`' a@b.test , c@d.test '` is fine); a missing `@`, a semicolon separator or a display name is not.

Provisioning is deliberately out-of-band. Changing this needs host access and a container recreate —
the same bar as reading the database, which is the point: it creates no new privilege path, because
anyone who could edit it could already do everything the console offers, unaudited, over `psql`.

**A dedicated staff account is recommended, not required.** Dual-hatting — one address that is both
allowlisted and an organisation member — is permitted, because refusing it would lock the only staff
member out on day one, and because staff-ness confers nothing inside any organisation by
construction. At boot the API logs `event: 'staff.allowlist_resolved'` with counts (never
addresses): how many entries have no account, how many are unverified, and how many are dual-hatted.
Watch that line after changing the list — an entry with no account is usually a typo.

Every staff request is **audited, including reads**, because on this surface the read is the
privileged act. The row records that a panel was reached, never what was on it.

**So is every refusal.** An authenticated caller who is not staff — a member, an Org Admin, an
allowlisted address that has not verified — gets the same 404 an unmapped route gives, and leaves a
`staff.access_denied` row naming them. The row never says _which_ condition failed, because that
difference is what the uniform 404 exists to withhold. Those rows appear in the console's own Staff
activity panel, which is where you would notice somebody probing.

## Pre-release checklist

- [ ] CI green on `main` (lint, typecheck, unit, e2e)
- [ ] CodeQL clean; no unresolved high-severity alerts
- [ ] Changesets present for user-visible changes
- [ ] `CHANGELOG.md` reflects the release
- [ ] Migrations reviewed and reversible/safe
- [ ] Relevant docs updated
