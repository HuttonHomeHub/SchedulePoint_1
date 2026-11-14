# ADR-0221: An invitation waits for the address it was sent to

- **Status:** Accepted — 2026-11-13. The product owner approved the spec with Q1 answered yes: after signing in, the
  first screen lists invitations sent to the address the person has just confirmed (option C).
- **Date:** 2026-11-13
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0016](0016-core-identity-tenancy-role-model.md) §5 (a verified email match becomes a sufficient
  proof for a second, in-app door; the token stays the only key where verification is not enforced).
- **Spec:** [`docs/specs/invitation-survives-email-confirmation/`](../specs/invitation-survives-email-confirmation/feature-spec.md)
  §4 · **Plan:** [`implementation-plan.md`](../specs/invitation-survives-email-confirmation/implementation-plan.md)
  (M1 builds D1–D4, M2 the screen)
- **Builds on:** ADR-0012 (authorization), ADR-0072 and ADR-0073 (audit), ADR-0074 (verification), ADR-0081 (an entry
  point and a journey), ADR-0088 D1 (no flag), ADR-0172 (soft-delete filter at the query).

## Context

On a host that sets `AUTH_REQUIRE_EMAIL_VERIFICATION`, an invitee creates an account from the invitation, confirms
the address from a second email, signs in, and lands on "Create your organisation". The invitation has dropped out of
view, and the person must find the invitation email and click it again
(`apps/web/e2e-account/verification.spec.ts:177-194` pins exactly that second `goto(acceptUrl)`).

The server cannot rebuild the link: only the token's hash is stored (`tokenHash @unique`), so the secret is
unrecoverable by design. The confirmation email is ours (`better-auth.ts` composes `{verifyPageUrl}#token=…`) and
carries nothing else, and the confirmation is routinely opened in another tab, browser or device, where no redirect
carried by the sign-up tab can follow.

## Decision

**D1 — A verified address is a sufficient key where verification is enforced.** Where
`AUTH_REQUIRE_EMAIL_VERIFICATION` is on and the session's user has `emailVerified`, that user may list and accept
pending invitations whose email equals their own. ADR-0016 §5 already says that, with enforcement on, the email match is
the genuine proof of mailbox ownership; this decision uses that proof without asking for the token as well. Where
enforcement is off, or the user is unverified, nothing changes: the list is empty, the accept is 404, and the token on
the link remains the only key.

**D2 — Two routes, authenticated, no role.** `GET /api/v1/me/invitations` (paginated; `id`, `organizationName`, `role`,
`expiresAt`) and `POST /api/v1/me/invitations/:invitationId/accept`, which answers what `POST /invitations/accept`
answers. Neither is public and neither needs an organisation role, since the caller is not yet a member. The list holds
only pending, unexpired, undeleted invitations of undeleted organisations the caller is not already a member of. The
accept carries the confirm endpoint's throttle (10 per minute).

**D3 — Every failure of ownership or of the host condition is 404, never 403.** Someone else's invitation, an unknown
id, an unverified caller and a host that does not enforce verification are indistinguishable, so the route says nothing
about other people's invitations. Expired and no-longer-pending keep the link door's 410 and an existing member keeps
its 409, but only after ownership is established.

**D4 — One transaction, two doors.** The membership and audit work of the link door's accept moves into one private
method both doors call, so they cannot drift. The audit rows are the same `invitation.accepted` and `member.joined`
rows (ADR-0073); the new door adds `after.acceptedVia: 'verified-address'`. No invitation secret is read, written,
logged, emailed or audited by the new door: log lines carry `organizationId`, `invitationId` and `userId` only.

**D5 — The offer is the first screen after sign-in (web, built in M2).** The onboarding screen lists the invitations
and offers **Accept and join**. The confirmed-address screen is unchanged. This is complementary to the same-tab
`redirect` that PR #1359 carries (`sameOriginRedirect`, re-read on `main` for this decision and found to refuse
`https://`, `//`, `/\` and `javascript:`): when the redirect survives, the person returns to the invitation page; when
it does not, the offer is there. This decision adds no redirect and accepts no URL from any client.

**D6 — No flag, no environment change, no schema change.** ADR-0088 D1. The read is by `email`, `status`, `expires_at`
and `deleted_at`; no existing index leads with `email`, so it is a scan of a table that holds a few rows per
organisation, made once per onboarding view. An `email` index would be a schema change and goes to the
database-architect agent; it is not added by hand.

## Alternatives considered

- **A — carry the destination through the confirmation email** (a `callbackURL` on sign-up, read back from Better
  Auth's `url` and added to our fragment link). It works only through Better Auth internals, needs our own relative-path
  allowlist on server and client, puts the invitation token into a second email and a non-production log line, and is
  lost on every resend (the resend paths send no `callbackURL`, and the invitation card's own resend is the path an
  invitee uses). Its one advantage, landing on the invitation page itself, was the owner's Q1; answered no. If it is ever
  wanted, the Better Auth claims it cites go into `scripts/dependency-claims.json` first.
- **B — store the pending destination on the server** (a column on the user or the verification row). A schema change
  that still needs A's link or C's lookup to be used. Strictly more than C.

## Consequences

- There are two ways to accept an invitation where verification is enforced. They share one transaction (D4), and only
  the audit row's `acceptedVia` tells them apart.
- A person who signs up with a different address than the one invited is offered nothing, as today; the link's
  wrong-account card still applies.
- Someone already in an organisation who is invited to a second one keeps using the link: the offer is on the
  onboarding screen only (M2).
- Hosts that do not enforce verification see no change in any answer.
- The proof is the `emailVerified` flag on the user row. Enabling Better Auth's `changeEmail` later is only safe
  if a change resets `emailVerified` to false; otherwise a confirmed account could re-point itself at someone
  else's address and inherit that address's invitations.
- The rollback is a commit boundary: nothing calls the routes until M2.

## References

- ADR-0016 §5, ADR-0003, ADR-0012, ADR-0073, ADR-0074, ADR-0075 (mail is best-effort), ADR-0081, ADR-0088, ADR-0172.
- `apps/api/src/modules/invitations/invitations.service.ts` (`accept`), `apps/web/src/lib/router/search-string.ts`
  (`sameOriginRedirect`).
