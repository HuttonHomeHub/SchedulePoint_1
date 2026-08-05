# ADR-0074: Account recovery, verification enforcement, and the web origin's first Content-Security-Policy

- **Status:** **Accepted** — M0–M5 landed. `VITE_ACCOUNT_SETTINGS` and `VITE_PASSWORD_RESET`
  **default-on** 2026-08-05. Two operator steps remain and are deliberately not code: the CSP flip
  to enforce, and `AUTH_REQUIRE_EMAIL_VERIFICATION`. See the ledger below.
- **Date:** 2026-08-04 (accepted per-milestone through 2026-08-05)
- **Deciders:** Product owner; security-reviewer (the CSP derivation and the recovery threat
  model); ui-architect (route shape, the verification-pending state, flag structure);
  feature-analyst (delivery shape, milestone ordering, the runtime-evidence rule)
- **Spec:** [`docs/specs/account-security/`](../specs/account-security/feature-spec.md)

## Context

SchedulePoint has no account recovery. Not a missing screen — **a server refusal**:
`createAuth()` configures `emailAndPassword` with no `sendResetPassword`
(`apps/api/src/common/auth/better-auth.ts:125-134`), and Better Auth's endpoint answers that
configuration by throwing outright:

<!-- prettier-ignore -->
```text
// better-auth/dist/api/routes/password.mjs:51-57 — quoted verbatim; do not reformat
	if (!ctx.context.options.emailAndPassword?.sendResetPassword) {
		ctx.context.logger.error("Reset password isn't enabled.Please pass an emailAndPassword.sendResetPassword function in your auth config!");
		throw APIError.from("BAD_REQUEST", {
			message: "Reset password isn't enabled",
			code: "RESET_PASSWORD_DISABLED"
		});
	}
```

The `MailService` port has exactly two messages, `sendInvitation` and `sendEmailVerification`
(`apps/api/src/common/mail/mail.service.ts:27-39`). There is no change-password for a signed-in
user, no session-less resend of a verification email, and no account surface to host any of them —
`/me` is `@Get()` only (`apps/api/src/modules/me/me.controller.ts:24,28`). Today the only route
back into a locked account runs through an operator with database access.

This was found the way ADR-0058 says to find things: the product owner asked whether the
login/admin surface was complete, and the answer came from grepping the code rather than from the
documents. A sweep of `apps/web/src` for `forgetPassword|resetPassword|changePassword` returns
**zero matches**, and `authClient` is used in exactly one file for exactly three methods
(`apps/web/src/features/auth/api/use-session.ts:55,76,94`).

### Why this is one epic with two debt rows

`docs/TECH_DEBT.md` **#16** wants email verification enforced, and says of the switch that "no code
change is needed". That is **true for the API and false for the web**. Enabling
`AUTH_REQUIRE_EMAIL_VERIFICATION` arms three dead ends simultaneously, all latent today and all
verified against the installed `better-auth@1.6.25`:

1. **Sign-up creates no session.** `sign-up.mjs:162-163` derives `shouldSkipAutoSignIn` from
   `requireEmailVerification`, so this app's `autoSignIn: true` (`better-auth.ts:133`) is
   **overridden** and the route returns `{ token: null, user }` (`:252-254`). `useSignUp` inspects
   only `error` (`use-session.ts:76-81`), so it reports success, `SignUpScreen` navigates to `/`
   (`sign-up.tsx:16`), and the `_authed` guard finds no session (`router.tsx:66-71`) and bounces to
   `/sign-in` **with no explanation**.
2. **Sign-in 403s and resends nothing.** `sign-in.mjs:312-324` re-sends only when `sendOnSignIn` is
   set, and only `sendOnSignUp` is (`better-auth.ts:146-162`). The raw library message lands in a
   red `<p role="alert">` with no affordance.
3. **Invitation-accept refuses with instructions the product cannot satisfy.**
   `invitations.service.ts:218-220` says "Verify your email address before accepting this
   invitation"; `AcceptInvitationCard` holds `user.emailVerified` at line 60, never reads it, and
   lets the 403 fall through to a generic paragraph (`:109-113`).

The third is worth stating precisely, because the advisory input got it wrong in one place and
right in another: the refusal is **guarded by `this.config.requireEmailVerification`**, which is
`false`, so it is a **third latent** dead end and not a shipped defect. The correction is recorded
here because the spec's own §0.1 exists to make it, and because "already broken" and "breaks the
moment you flip the switch" are different facts that lead to different orderings.

**#8** is the other half: `apps/web/nginx.conf:33-35` sets `X-Content-Type-Options`,
`X-Frame-Options` and `Referrer-Policy` — and **no `Content-Security-Policy` at all**. The row said
the policy was "not finalised", which reads as a policy that exists and could be tighter. It does
not exist. The app renders user-authored text from five sources.

Recovery is a **hard prerequisite** for #16, not a companion to it: enforcing verification with no
self-service way back in converts a configuration flip into a lockout. That is what makes these one
epic rather than two.

### The two findings that outrank every screen

Both were found by pointing security-reviewer at this app's wiring rather than at Better Auth's
documentation, and both were independently re-verified against the installed package before being
written down. **Neither is a library defect. Both are one configuration key.**

**B1 — reset tokens would be stored in cleartext.** Better Auth stores a verification identifier
through `processIdentifier(identifier, storageOption)`, and that function returns the identifier
**unchanged** when no option is configured:

<!-- prettier-ignore -->
```text
// better-auth/dist/db/verification-token-storage.mjs:8-13 — quoted verbatim; do not reformat
async function processIdentifier(identifier, option) {
	if (!option || option === "plain") return identifier;
	if (option === "hashed") return defaultKeyHasher(identifier);
	if (typeof option === "object" && "hash" in option) return option.hash(identifier);
	return identifier;
}
```

`storageOption` comes from `options.verification?.storeIdentifier`, and the whole `betterAuth({…})`
call in `better-auth.ts:118-180` **has no `verification` key**. So the `verification` row would hold
the literal string `reset-password:<token>`, in the clear, for the full one-hour window. Anyone with
read access to that table — a backup, a replica, a reporting connection, a future injection
elsewhere in the stack — would hold a live, single-use, **account-takeover-capable** credential for
every outstanding reset.

That fails a bar **this repository set for itself**. `apps/api/src/common/tokens/token.ts:15-22`
mints 256 bits, returns the raw value once and stores only the SHA-256, and its docblock states the
reason in one sentence: "a database leak never exposes a usable token" (ADR-0016 invitations,
ADR-0051 share links). The newer and more dangerous surface would silently not do that — the
ADR-0064/0067 shape again, one correct pattern applied to a control and not its neighbour.

**B2 — a completed reset would leave every session alive.** `password.mjs:172` deletes the user's
sessions only when `emailAndPassword.revokeSessionsOnPasswordReset` is truthy, and this app does not
set it. A password reset is frequently a response to suspected compromise; leaving the compromise
signed in is the whole failure the reset was meant to close.

### What is already correct, and must not be undone

Recorded so a later reader does not "harden" a working property:

- **Enumeration equalisation is in the library and is good.** `/request-password-reset` performs a
  dummy `generateId`/`findVerificationValue` on an unknown address to equalise timing and returns an
  identical body either way (`password.mjs:60-72`). `/send-verification-email` goes further with a
  hard **500 ms floor** (`email-verification.mjs:98-117`) to hide the difference between a fast local
  JWT sign and a slow outbound SMTP call. **The only way to lose these is for our web layer to undo
  them** — by pre-validating an address against a members lookup, or by rendering a different state
  per branch.
- **Rate limiting is already present and stricter than the general window.** Better Auth's
  special-rule table (`dist/api/rate-limiter/index.mjs:370-384`) covers `/change-password` at 3 per
  10 s and `/request-password-reset` and `/send-verification-email` at 3 per 60 s, gated on
  `rateLimit.enabled: options.isProduction` (`better-auth.ts:169-173`). **No new configuration is
  needed.** Its in-process, per-replica store is the limitation ADR-0073 C2.1 already recorded —
  inherited, not introduced.
- **The last-Org-Admin invariant holds.** Checked on both role change and removal
  (`members.service.ts:20-25,73`), serialised per-org so the count cannot be read stale.
- **The email-verification token is a different and better mechanism** — a signed JWT
  (`email-verification.mjs:13-19`), never persisted, so B1 does not touch it.

## Decision

### 1. Fix the two blocking findings first, and order them so the cleartext window is empty

Four keys in `createAuth()`:

```ts
emailAndPassword: {
  …
  revokeSessionsOnPasswordReset: true,   // B2
  sendResetPassword: async ({ user, url }) => { … },
},
verification: { storeIdentifier: { hash: hashToken } },   // B1
```

B1 reuses **this app's own `hashToken`** rather than Better Auth's `'hashed'` shorthand, so the
repository has one hashing convention rather than two that happen to agree today.

**The ordering inside M0 is load-bearing and is not a preference.** Hashing the identifier must
merge **before** enabling the endpoint. Today no reset row can exist, because reset is disabled; if
the endpoint landed first, every token minted in the gap would sit in cleartext for up to an hour.
Doing it in this order makes the cleartext window **empty**, not merely short.

The rejection of the obvious alternative is recorded rather than assumed: **we do not build reset
ourselves** on `common/tokens/token.ts` and a Nest module. We would then own minting, expiry,
single-use, timing equalisation and rate limiting — all of which the library already does correctly,
and one of which (equalisation) is the easiest to get subtly wrong. ADR-0003 chose the library; the
two findings are configuration gaps, not reasons to diverge from it.

### 2. A client surface whose gate is a server-side condition is branched on runtime evidence, never on a `VITE_` constant

**This is the precedent this ADR exists to set**, and it is the generalisation of ADR-0060's M0 rule
("a `VITE_` constant is a client build-time value and cannot gate a server check").

The three verification touchpoints above ship **unflagged**, as runtime branches on what the server
actually returned. The argument is structural, not a value judgement about whether the old behaviour
deserves preserving:

- A build-time constant **cannot know which world the server is in**. `AUTH_REQUIRE_EMAIL_VERIFICATION`
  is an operator environment variable read by the API at boot; the bundle is built long before, and
  may be running against a server in either state.
- So a flag would be **actively worse than none**: a flag-off bundle against a flag-on server strands
  every new sign-up, and nothing in the type system says so.
- The change is a branch on an observed response — "did sign-up return a session?", "is this 403
  `EMAIL_NOT_VERIFIED`?", "is `emailVerified` false?" — which is correct in **both** worlds
  simultaneously. There is no second behaviour to roll back to, so there is nothing for a parity
  suite to pin.

The consequence is stated plainly so it is not discovered later: **the client half must be correct
for both values of the server flag on the same bundle.** That correctness is held by regression
tests verified to fail against the pre-fix code, not by a flag.

Where the gate genuinely _is_ a build-time product decision, the house pattern is unchanged. Two
flags, split by prerequisite:

| Flag                    | Gates                                                                                      | Why separate                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `VITE_ACCOUNT_SETTINGS` | `/account`, its `AccountChip` entry, change-password, the email/verification row, resend   | **No server prerequisite** — ships independently of the mail work |
| `VITE_PASSWORD_RESET`   | `/forgot-password`, `/reset-password`, **and the "Forgot your password?" link on sign-in** | Blocked on §1's server work                                       |

The routes and the link share **one** flag deliberately. A link to a conditionally-registered route
is a link to nothing, and **`pnpm typecheck` cannot catch it**: `...(FLAG ? [route] : [])` widens to
`(typeof route)[]`, so the registered-route union contains the route in both branches. The compiler
is not the gate; the flag structure is. One flag over the whole epic was rejected for holding
`/account` hostage to the mail work; three or more were rejected because the cross-links multiply
into combinations, several of them dead ends (the ADR-0062 stranding lesson).

### 3. `/account` is a surface, and its shape is chosen to not pre-commit an information architecture

A change-password dialog would have been cheaper and is rejected: it leaves the verification row
homeless, and it forces an awkward extraction of the shared password-field pair once reset needs the
same one. `/account` is a flat child of `authedRoute` — the precedent for a non-org-scoped authed
route exists twice (`/onboarding`, `/me/activity`, whose docblock explains why an org slug would be
a lie) — carrying one `<h1>` and two `FormSection`s.

Explicitly **not** built: tabs (ADR-0061 added vertical `Tabs` _with_ its first consumer;
`docs/COMPONENT_LIBRARY.md`'s threshold is the third instance), a `/settings/*` tree, and profile
editing — **there is no endpoint**, and proposing one is a separate API decision. When a third
concern arrives, the section list becomes vertical `Tabs` at the same route: additive, no route
change, and suites querying by heading and label survive.

A shell-wide "verify your email" banner is rejected for the same reason: it would nag every user in
the far commoner enforcement-off world, where being unverified costs nothing except invitation
acceptance, and would give a deliberately plan-unaware shell (ADR-0029) a global concern. It stays
one `NoticeStrip` away if the product owner later wants it.

### 4. The Content-Security-Policy is derived from what the code loads, its mode is an operator variable, and the inline script moves out

The policy, derived rather than templated:

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' blob:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'; upgrade-insecure-requests;
```

There are **no external origins at all** — no CDN, no external fonts, no workers, no `eval` in the
pinned `jspdf@4.2.1`. `blob:` is load-bearing for `img-src` because `PrintSurface.tsx:55,86` renders
a live `<img src={URL.createObjectURL(blob)}>`. `data:` is **not** needed: jsPDF's data URL goes to
`doc.addImage()` inside the library and never onto a DOM element. `style-src 'self'` is **inferred
from source, not browser-verified** — that is precisely what the report-only window exists to
falsify.

**The header belongs in `apps/web/nginx.conf`, not in the API's Helmet.** They cover different
origins and neither substitutes for the other: nginx serves the document a browser applies a policy
to; Helmet's default governs JSON bodies and dev-only Swagger. **The API's Helmet configuration is
not touched by this epic.**

**The theme-boot IIFE moves to a static `apps/web/public/theme-boot.js` rather than being pinned by
hash.** "Maintenance trap" undersells the reason: a hash mismatch **fails closed and silently**. The
script runs before first paint, so the symptom is a flash of — or a stuck — wrong theme, which no
reader connects to an HTTP header; it fails **only in enforce mode, only on the deployed origin**,
so dev and CI stay green; and `index.html` and `nginx.conf` have no compiler relationship, so
nothing catches the drift. The honest cost is one extra render-blocking request before first paint,
measured in the report-only window against CLAUDE.md §15's LCP target. The hash stays as the
documented fallback, with that failure mode written into the nginx file as a comment.

**The mode is `${CSP_HEADER_NAME}` / `${CSP_POLICY}`, not a code edit.** Hard-coding report-only vs
enforce would make both the flip _and any rollback_ a new image through the release train, coupling
a security observation window to the release cadence and making rollback slower than the incident.
The `nginx:1.31-alpine` runtime already ships the envsubst entrypoint, so this costs a `COPY` path
change — and **`NGINX_ENVSUBST_FILTER=^CSP_`**, which is essential: without it `envsubst` eats
nginx's own `$scheme`, `$host`, `$remote_addr`, `$proxy_add_x_forwarded_for` and `$uri`, and the
container serves a config that is subtly and comprehensively wrong.

**Report-only ships with no collector**, deliberately. Violations reach the browser console with no
`report-to` configured, which for an operator who reviews every release on one host (ADR-0047,
CLAUDE.md §17) is a real verification tool. A `POST /api/v1/csp-reports` sink is **deferred** — it
would be a new `@Public()` route, and ADR-0051 established that list stays short and each entry
justified.

Two sibling-header decisions, both of which look like omissions and are not:

- **`Permissions-Policy` is enumerated, never blanket-denied.** `clipboard-write` is a controlled
  feature in Chromium and the app uses `navigator.clipboard` in `ShareLinksDialog.tsx` and
  `InviteMemberDialog.tsx` — both Copy buttons that are the entire point of their dialogs. Deny
  `camera`, `microphone`, `geolocation`, `payment`, `usb`, `interest-cohort`; leave clipboard alone.
- **HSTS is excluded from this epic.** The server block only ever `listen`s on plain `8080` — TLS is
  terminated upstream — so this container **cannot know whether the browser used HTTPS**, and
  `TECH_DEBT` #89 records that the header which would tell it arrives as `http` through the real
  Cloudflare → Nginx Proxy Manager → web chain. HSTS is also sticky: `max-age` pins the browser, so
  a mistake is expensive to reverse. It belongs at the edge terminator, where the TLS is.

### 5. The three credential events earn audit rows, and no gate would have caught their absence

`auth.password_changed`, `auth.password_reset_completed` and `auth.password_reset_requested` are new
`AuditAction` members under the `sign-ins` category. They pass ADR-0073's blast-radius test on the
same footing as the five existing `auth.*` events: a credential change is the same class of fact as
a sign-in.

**The route census cannot see them, in either direction.**
`apps/api/src/modules/audit/audit-coverage.structural.spec.ts:45-47` says so in its own docblock —
Better Auth is mounted as a raw Node handler outside Nest, so its routes never enter the census and
their coverage is proven by `auth-audit.spec.ts` and the e2e suite instead. **"Extend the census" is
therefore the wrong instruction**, and more importantly there is no gate that would fail a PR
omitting these. Deferring them was rejected on exactly that basis: ADR-0072/0073's own stated reason
for existing is that with no gate behind it, "later" means never.

Two implementation constraints are decisions rather than details:

- **Drive a real hook before writing each producer.** `auth-audit.ts:10-24` records the "three seams,
  not one" lesson — `/sign-out` needed a `before` hook and `/verify-email` a dedicated callback,
  because an after-hook saw no user and an error on the success path. The two easy cases do not
  generalise, and assuming they do is how a producer ships looking correct and recording nothing.
- **`auth.password_reset_requested` is itself an enumeration oracle** if it is readable by the wrong
  audience. The handler succeeds uniformly for known and unknown addresses, so the existing
  `failed`/`newSession` signals cannot even see it; it takes its own `hooks.after` branch and the
  ADR-0073 C2.2 attribution pattern — `ANONYMOUS` actor, attempted address as `subjectLabel` with
  the caller's casing preserved, best-effort `subjectId` resolved at **write** time, `organizationId`
  null, normaliser `toLowerCase()` and **nothing else** (C2.1: trimming would attribute a probe to an
  account that input could never have reached). Its reachability must be **identical to a failed
  sign-in** — self-projection only, never an organisation feed.

### 6. Milestones, and what is deliberately not in this epic

Six milestones, each independently shippable and each keeping `main` releasable: **M0** server
hardening (invisible), **M1** CSP report-only (independent), **M2** the verification touchpoints
(unflagged, correct in both worlds), **M3** `/account`, **M4** password reset, **M5** enablement —
the specialist gate pass, the flag-on journey, the flips and the CSP enforce.

Two hard orderings beyond §1's: **M2 must be deployed before the verification flip**, because the
flip arms three dead ends at once and the bundle that closes them has to already be live; and
**M1's report-only window stays open until M2–M4's screens exist**, since a window closed before the
new DOM surfaces existed would never have covered them.

**Epic-wide invariants**, asserted in review at every milestone: **the CPM engine is not imported**,
no scheduling input changes and no migration runs — so the ADR-0034 recalculation parity gate is
untouched **by construction**, which is the honest form of that claim rather than the usual one:
there is nothing to hold parity _for_. The pen (ADR-0028) is not involved; nothing here is a plan
write. And **no new Nest controller, no new endpoint, no new permission, no OpenAPI change, no
migration.**

**On the existing user base.** `emailVerified` defaults to `false` (`schema.prisma:36`) and
enforcement has never been on, so most or all current accounts are unverified — the honest claim is
"unknown but probably nearly all", and **the real figure is counted against the deployed database
before the flip, not estimated.** The chosen migration is to **backfill only accounts already
holding at least one organisation membership**. Enforcement's security value is **prospective**: it
stops a _future_ unverified account accepting an invitation on an unproven email match (ADR-0016
§5). An account that already holds a membership has already passed that gate, so locking it out buys
nothing and costs a support event for every active user. The residual risk of a blanket backfill —
an account squatted on an address holding a **pending** invitation — is exactly what the membership
predicate excludes, because a squatter who has not accepted holds no membership. Strictly safer than
a blanket backfill, materially kinder than none.

**Change-password always revokes other sessions**, with the consequence stated on screen before
submit. A user-facing checkbox was considered and rejected for v1: the commonest reason to change a
password deliberately is suspicion of exposure, and a change that leaves the exposure signed in is
B2 one route along.

The auth/admin sweep that produced this epic found seven further gaps. **None is silently added.**
Session visibility and revocation (the natural third `/account` concern, and therefore the trigger
for the vertical-`Tabs` decision above), change-email, profile editing, **no organisation rename or
delete at all** — `organizations.controller.ts:29-57` is POST/GET/GET, so an organisation's name is
fixed forever at creation — no "leave organisation", and no resend-invitation, all become new
`docs/TECH_DEBT.md` rows. Account deletion is already covered by CLAUDE.md §17's soft-delete bullet,
extended to name the account case.

## Alternatives considered

- **Build password reset ourselves** on `common/tokens/token.ts` plus a Nest module — we would own
  minting, expiry, single-use, timing equalisation and rate limiting, all of which the library does
  correctly today. ADR-0003 chose the library and the two findings are configuration gaps, not
  grounds to leave it.
- **Pin the inline theme script by `'sha256-…'`** — fails closed and silently, in enforce mode only,
  on the deployed origin only, across two files with no compiler relationship. Kept as the
  documented fallback if externalising measures badly against the LCP target.
- **One flag for the whole epic** — holds `/account`, which has no server prerequisite, hostage to
  the mail work.
- **Three or more flags** — the cross-links (sign-in→forgot, reset-success→sign-in, account→resend)
  multiply into combinations, several of them dead ends.
- **Flag the three verification touchpoints** — actively worse than not flagging them; see §2.
- **`sendOnSignIn: true`** (server-side auto-resend on a 403) — a silent server resend has no
  pending, sent or rate-limited states. A client-initiated resend has all three.
- **A change-password dialog instead of `/account`** — leaves the verification row homeless and
  forces a later extraction of the shared password-field pair.
- **A shell-wide verification banner** — nags every user in the enforcement-off world; additive
  later at the cost of one `NoticeStrip`.
- **Hard-code the CSP mode in `nginx.conf`** — makes rollback a release.
- **Add HSTS at the web container** — the container cannot know the browser's scheme (#89) and HSTS
  is sticky.
- **A `POST /api/v1/csp-reports` sink** — a new `@Public()` route for a single-operator deployment
  where the console already answers the question. Deferred.
- **Defer the audit actions** — no gate would catch the omission, which is the argument for doing
  them now rather than against it.

## Consequences

**Positive.** Reset tokens are hashed at rest to the same bar as this repository's own tokens, and
the window in which any could have been stored otherwise is empty rather than short. A completed
reset ends every other session. A locked-out user has a self-service way back in, which is what makes
`AUTH_REQUIRE_EMAIL_VERIFICATION` safe to enable and therefore closes #16 rather than merely
describing it. The web origin serves a document-level CSP for the first time, derived from what the
code loads rather than from a template. Three credential events become evidence. And `#8`, `#16`,
half of `#94` and part of `#88` are paid.

**Negative and accepted.** The client now carries branches that must be correct for both values of a
server-side flag, held by tests rather than by a compiler. `MAIL_SMTP_URL` becomes load-bearing for
**recovery** and not only for verification — on a host with no transport configured, reset requests
succeed and deliver nothing, which is `TECH_DEBT` #94's invisible-failure mode **inherited, not
re-solved**; the cheap half (routing Better Auth's logger into Pino) is paid here, the hard half
stays open. `CORS_ORIGINS` becomes load-bearing in a new way: `redirectTo` passes `originCheck`
against `trustedOrigins` (`password.mjs:49`, bound at `auth.module.ts:34`), so a deployed origin
missing from it makes **every** reset fail with nothing on screen to explain it — hence a tested
rejection path and a deployment precondition rather than a hope. And the theme-boot script becomes
one extra render-blocking request.

**New debt.** Six rows from the sweep (§6), plus `TECH_DEBT` #88 extended at higher severity: the
reset flow _is_ structurally the confirm-button shape #88 asks for — a scanner's GET consumes only
the validation redirect, and the real change is a POST from our form — **and** that same redirect
carries the raw token in a `Location` header, which a proxy log can capture, compounding with B1 if
B1 had not been fixed. Both halves belong in the row; recording only the flattering one would be the
drift this repository has an ADR about.

**Expected.** M5 will find defects that passed a human read. Six epics running have found them, four
of those the same shape — one correct pattern applied to a control and not its neighbour — and this
epic ships four new forms and touches two existing ones. The gate pass is budgeted as work, not as a
formality.

**And it did, from the journey rather than from a reviewer.** `e2e-account/verification.spec.ts` —
the only test that follows a real emailed link, through a real redirect, against a server with
`AUTH_REQUIRE_EMAIL_VERIFICATION` actually on — was red on landing, and the cause was **two product
defects, not a fault in the harness**. That distinction had to be established rather than assumed:
the HTTP chain was driven end to end first (sign-up, resend, the emailed URL, the proxy) and proved
correct, `302 → /verify-email?verified=1`, before anything was changed.

1. **The router never delivered `?verified=1`.** TanStack Router's default `parseSearch` is
   `parseSearchWith(JSON.parse)`, so the param arrives as the **number** `1` and the route's
   `typeof search.verified === 'string'` test discarded it. A verification that had genuinely
   succeeded rendered the "still waiting" screen. Every screen test in the repository mocks
   `useSearch` and hands the component a literal, so none of them crosses the parser — the unit
   suite was green throughout, and `router-search.test.ts` now composes the real parser with the
   real validator, which is the only shape that could have caught it (`docs/TECH_DEBT.md` #96
   records what the fix does **not** cover, and why).
2. **Sign-up sent no `callbackURL`.** `sign-up.mjs:244` defaults it to `/`, so the **first**
   verification email — the one every new member actually receives — verified the address and then
   dropped the reader on the app root, where the `_authed` guard bounced them to `/sign-in` with
   nothing said. That is the _same dead end_ M2 was written to close, one send path along: the
   resend was fixed and its sibling was not. Both now pass one shared constant.

Neither is reachable with the switch off, which is why the CI step exists and why it was not
weakened to go green.

## Acceptance ledger

Each milestone Accepts when it lands, in the ADR-0035 style, so a reader can tell what is decided
**and shipped** from what is decided and pending. The last column is the honest half.

| Milestone                                 | Status                  | What it means today                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** — server foundations               | **Accepted** 2026-08-04 | B1 (identifier hashed at rest) and B2 (reset revokes other sessions) are in `createAuth()`; `sendResetPassword` wired; three `auth.*` audit actions; Better Auth's logger routed into Pino. Hashing merged **before** the endpoint existed, so the cleartext window is empty rather than short.                             |
| **M1** — CSP + sibling headers            | **Accepted** 2026-08-05 | `nginx.conf` is an envsubst template. Ships **report-only** by default in both compose files, per the product owner's 2026-08-05 decision. `CSP_HEADER_NAME` is the operator's variable — the flip to enforce needs no release. `TECH_DEBT` #8 stays open for exactly that step.                                            |
| **M2** — the three verification dead ends | **Accepted** 2026-08-05 | Ships **unflagged**, and that is the decision, not an omission: each is a runtime branch on a server switch, so a `VITE_` constant would strand a flag-off bundle against a flag-on server. Proven by `e2e-account/verification.spec.ts`, the only place they are reachable.                                                |
| **M3** — `/account`                       | **Accepted** 2026-08-05 | `VITE_ACCOUNT_SETTINGS` **default-on**. No server prerequisite — `/change-password` was always reachable and there was simply no screen. Rollback is the env var plus a rebuild; `account-settings.parity.test.tsx` is the contract.                                                                                        |
| **M4** — password reset                   | **Accepted** 2026-08-05 | `VITE_PASSWORD_RESET` **default-on**, held until the product owner confirmed `MAIL_SMTP_URL` is set and sending. Without a transport the screen's enumeration-safe copy makes a silent delivery failure indistinguishable from success — which is why this flag's prerequisite was a **deployment fact**, not a code state. |
| **M5** — enablement                       | **Accepted** 2026-08-05 | Five specialist gates folded; two further defects found by the journey and fixed (see "Expected", above); both flag-on suites wired into CI.                                                                                                                                                                                |
| **M5-T2** — CSP to enforce                | **Pending — operator**  | Needs an observed clean report-only window across every route with the console open. Not code.                                                                                                                                                                                                                              |
| **M5-T6/T7/T8** — verification enforced   | **Pending — operator**  | Ordered: a bundle carrying M2 **and** the M5 fixes must be live first, then count unverified accounts, then backfill the ones already holding a membership, then set `AUTH_REQUIRE_EMAIL_VERIFICATION=true`. Enforcing against an older bundle re-arms the three dead ends M2 closed. `TECH_DEBT` #16.                      |

## References

- Spec and plan: [`docs/specs/account-security/`](../specs/account-security/feature-spec.md)
- `docs/TECH_DEBT.md` #8, #16, #88, #89, #94
- ADR-0003 (Better Auth), ADR-0012 (RBAC + resource scoping), ADR-0016 (identity and tenancy;
  §5 invitation email-matching)
- ADR-0051 (share links — the 256-bit mint / SHA-256-at-rest bar, and the short `@Public()` list)
- ADR-0060 (per-scope save; the M0 rule this ADR generalises), ADR-0061 (form layout; `Tabs` with
  their first consumer), ADR-0062 (derived flags and the stranding failure)
- ADR-0072 (the append-only audit log), ADR-0073 (coverage tests; C2.1/C2.2 attribution)
- ADR-0058 (drift control — verify the claim, do not trust the document)
