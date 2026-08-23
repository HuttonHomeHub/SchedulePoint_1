# ADR-0075: Mail delivery is best-effort, and the failure belongs to the operator

- **Status:** **Accepted** — M0–M3 landed 2026-08-05. No feature flag: nothing user-facing is
  conditional, and the one copy change is right in both worlds (ADR-0074 §2).
- **Date:** 2026-08-05
- **Deciders:** Product owner (accepted best-effort delivery; ruled the boot check warn-only);
  feature-analyst (option analysis, the enumeration finding, milestone ordering)
- **Spec:** [`docs/specs/mail-delivery-failure-visibility/`](../specs/mail-delivery-failure-visibility/feature-spec.md)
- **Closes:** the open half of [`docs/TECH_DEBT.md`](../TECH_DEBT.md) #94

## Context

When SMTP fails, a sign-up succeeds and **nobody is told** — not the person, not the operator.
Measured rather than reasoned (`apps/api/test/mail-failure.e2e-spec.ts`, against a real Postgres
with a rejecting port):

- `POST /api/auth/sign-up/email` returns **200** with the send having thrown
- the `user` row is **committed**, so the address is now taken
- **no session** is issued — `requireEmailVerification` overrides `autoSignIn`
- the following sign-in, with the correct password, is **403**

The mechanism is not ours to change: Better Auth calls the port through
`ctx.context.runInBackgroundOrAwait(...)` (`api/routes/sign-up.mjs:254`), whose default is
`try { await promise } catch { logger.error(...) }`. It never rethrows, and the
`advanced.backgroundTasks.handler` branch only `.catch()`es — **no configuration this application
can set changes it**.

TECH_DEBT #94 recorded the remedy as an open design question: send from application code _before_
handing off, so a failure could abort the request. This ADR answers it.

## Decision

**Delivery stays best-effort. The failure is surfaced to the operator, never to the caller.**

1. Every mail failure logs `event: 'mail.send_failed'` with a `kind` naming which of the three
   it was — one grep term, an exported constant, never a URL or token.
2. A **bounded, warn-only** SMTP handshake runs once at bootstrap, logging
   `mail.transport_verified` or `mail.transport_check_failed` with **host and port only**.
3. Every send is **bounded at 10 s** (`SEND_TIMEOUT_MS`), because mail turns out to be **on** the
   request path — see the next section, which corrects this ADR's own first draft.
4. `/verify-email` stops asserting that a message was sent, names the address, and offers an exit
   that is not another resend.
5. The documents that were wrong are corrected, including the alert instruction that could not fire.

## Mail is on the request path, and this ADR said it was not

The spec's risk table read **"no request-path cost"**, and §"What the boot check does not prove"
below closes with "mail is not on the critical path of scheduling". The second is true and about
readiness. The first was **false**, and the review pass caught it:

- `runInBackgroundOrAwait` does `else await promise` when no handler is configured
  (`better-auth@1.6.25`, `dist/context/create-context.mjs:217-227`, the `await` on line 220)
- `grep -rn "backgroundTasks" apps/api/src` returns **nothing** — no such handler is configured
- `InvitationsService` (`invitations.service.ts:119`) awaits `sendInvitation` in the handler outright

So `POST /api/auth/sign-up/email`, `/request-password-reset`, `/send-verification-email` and
`POST …/invitations` all block on a live SMTP round trip. Its only bound was nodemailer's own
defaults — **30 s greeting, 2 min connection, 10 min socket** — so the exact failure this ADR
treats as survivable (a relay that accepts the connection and then says nothing) would hold a
request open for ten minutes and occupy a worker for the duration.

The remedy is the same shape as `verifyTransport`'s: one `Promise.race` this file controls, applied
to all three messages through a single private `send()`. It bounds **the wait, not the send** —
nodemailer keeps working, so a merely-slow message may still arrive — and it attaches a handler to
the abandoned promise, without which a rejection arriving after the race would be _unhandled_ and
Node would terminate the process. A bound added to stop a mail outage hanging a request would
otherwise have converted that outage into a crash loop.

**Nothing the caller sees changes.** The bound decides how long the wait is, never what the answer
is: a timeout takes the same swallow-and-log path as a refusal, so every uniformity property above
is untouched. What it does not fix is the **timing** difference on `/request-password-reset` — a
known address awaits a send, an unknown one returns immediately — which the bound narrows from ten
minutes to ten seconds without closing. That is `docs/TECH_DEBT.md` #99.

This correction is recorded here rather than folded silently because the claim was **this ADR's
own**, asserted in a risk table without being checked, in a document whose §"A note on how this was
decided" is about exactly that failure. It is the second time in one milestone.

## Why not send before handing off

**The reason is not effort. It is that the abort would create an enumeration oracle**, and this is
the finding that decided the ADR — the spec was commissioned believing the opposite.

Under `requireEmailVerification`, a sign-up for an address that **already exists** returns a
synthetic `200` with a fabricated user id and **sends nothing** (`sign-up.mjs:163` + `sign-up.mjs:203-241`); Better
Auth hashes the submitted password regardless, purely to equalise timing. It is a deliberate
anti-enumeration control. So surface a delivery failure and, during an outage:

| address | send attempted? | caller sees |
| ------- | --------------- | ----------- |
| new     | yes → fails     | **error**   |
| taken   | no              | **200**     |

An error would mean "that address was free" and a 200 "that address is taken", on an
unauthenticated endpoint. The abort is inadmissible unless the duplicate branch also sends, which
defeats its own purpose. This is now pinned by a test
(`mail-failure.e2e-spec.ts` → "answers a duplicate address exactly like a new one"), because the
property lived entirely in a library file this repository does not own.

Three further reasons, in weight order:

- **A broken relay is a deployment fault with a deployment-shaped remedy.** Aborting sign-up saves
  nobody: it is the same outage wearing a different face, and it converts "some accounts need a
  resend" into "nobody can register".
- **A wrapper around Better Auth's own API bypasses its rate limiter**, which runs at the router's
  `onRequest` (`api/index.mjs:168`), so `auth.api.*` calls never reach it. That is a security
  regression on an open endpoint, bought to improve an error message.
- **The lockout is latent.** `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults `false` and is not on. This
  is a **prerequisite to that flip**, not a live incident.

Options rejected with reasons are in the spec §4.6; the closest to viable was an after-hook abort,
which fails because `toResponse` takes `init?.status ?? data.statusCode`, so the handler's 200 wins
and the caller gets an error body under a success status.

## The password-reset path is different, and must stay as it is

`/request-password-reset` answers identically for a known and an unknown address. Any
caller-visible difference is an oracle, so **no** amount of delivery failure may change its
response — the remedy there is operator-facing by necessity, not by choice. `sendPasswordReset`
swallows and logs for that reason, and holds the property itself rather than borrowing it from
`runInBackgroundOrAwait`: its sibling was safe by exactly that argument at one call site and an
oracle at another (ADR-0074 M5-T1), and nothing in this codebase would have said so.

## What the boot check does not prove

Stated here rather than implied away, because a check that is trusted for more than it does is
worse than none:

- **Not that we may send.** A credential can authenticate and lack send permission — the documented
  Resend case, where a read-only key passes the handshake and fails the first message.
- **Not that mail arrives.** Asynchronous bounces, spam classification and an unverified sending
  domain are all invisible to a handshake.
- **Not that it will keep working.** One observation at boot; a relay that breaks an hour later is
  what `mail.send_failed` is for.

It **never fails the boot** and is **never part of `/health/ready`**. The host recreates containers
unattended (ADR-0047), so a relay blip at 03:00 would otherwise take the API down and keep it down;
and folding it into readiness would turn a mail outage into a restart loop. Mail is not on the
critical path of scheduling — the API is.

## Consequences

- An operator **can** write an alert that fires. Previously `docs/DEPLOYMENT.md` instructed them to
  watch for Better Auth's `Failed to run background task`, a line that **stopped being reachable**
  when the adapter began catching first — an alert built exactly as documented would have stayed
  silent through a total outage.

  **"Can" is doing real work in that sentence, and this ADR did not notice.** There is no log
  shipping and no alert evaluator in this deployment
  (`docs/OBSERVABILITY.md:80` — "Monitoring & alerting — standard, **not yet implemented**"), so
  the record reaches `docker logs` on the host and stops. The whole design turns on preferring an
  operator-facing signal to a caller-facing one; the half that was examined is that the caller must
  not be told, which is sound. The half that was not is whether "operator-facing" reaches an
  operator. It does not — it reaches a file. Recorded as `docs/TECH_DEBT.md` **#100** the day after
  this ADR shipped, when the product owner asked how to act on it.

  This is the third instance of the failure ADR-0076 Class 3 describes, and the first found by a
  reader rather than by a gate or a reviewer.

- **The residual risk is unchanged and real**: an individual whose message is lost after a
  successful boot is still stranded silently. The window is narrowed, not closed.
- The characterisation suite's assertions **do not change** — the clearest statement of what this
  ADR is. It records today's behaviour, including the parts that are wrong, so that any future
  attempt to move it fails loudly.
- The CPM engine is not imported and no migration runs.

## A note on how this was decided

The brief given to the analyst asserted that "sign-up has no enumeration concern, so a design
change is available there". That was **wrong**, and it had already been repeated in three
artefacts — a test docblock, a commit message, and TECH_DEBT #94 — before anyone opened
`sign-up.mjs`. It was caught only because the analyst was told to verify claims rather than trust
documents, including the ones in its own brief.

That is ADR-0058's rule (_verify the claim; do not trust the document_) failing in its most
awkward form: not stale prose left by someone long gone, but a fresh assertion written the same
day by the person applying the rule. The wrong version is preserved in
`mail-failure.e2e-spec.ts`'s docblock rather than quietly replaced, because the correction is more
useful to the next reader than a clean file would be.

## References

- Supersedes nothing. Amends `docs/TECH_DEBT.md` #94 (closes its open half as a decision **not** to
  build) and `docs/DEPLOYMENT.md` §Transactional email.
- Builds on ADR-0016 (the port), ADR-0047 (unattended recreate), ADR-0058 (verify the claim),
  ADR-0074 (recovery, and the M5-T1 inversion this depends on).
