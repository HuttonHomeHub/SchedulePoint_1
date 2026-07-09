# ADR-0016: Core identity & tenancy model + organisation role set

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** James Ewbank (with Claude Code)

## Context

SchedulePoint is a multi-tenant product (PROJECT_BRIEF §5): users belong to one
or more **organisations**, and every business resource (clients, projects, plans,
activities) is organisation-scoped. The base repository ships a **feature-agnostic
RBAC seam** — `Principal` / `OrganizationMembership` / `OrganizationRole` in
`apps/api/src/common/auth/principal.ts` (ADR-0012) — plus a reference-feature
template whose `reference-permissions.ts` demonstrates a role→permission map. That
seam intentionally carried a **placeholder** role enum (`OWNER / MEMBER / VIEWER`)
as an illustrative default (CLAUDE.md §1, ADR-0014).

Before building the first vertical slice (organisation onboarding & membership) we
must fix the **canonical identity and tenancy model** the whole product scopes
against, and the **concrete organisation role set**. The role enum lives in a
cross-cutting seam (`common/auth/principal`) and in the template's role→permission
map, so ADR-0015 requires this change to be recorded as an ADR and the reference
template updated in step (`scripts/verify-template.sh`).

The brief defines five roles: **Org Admin, Planner, Contributor, Viewer**, and
**External Guest** (a per-plan share link, not an organisation membership).

## Decision

**We will establish the canonical identity & tenancy model and adopt a
SchedulePoint-specific organisation role set.**

1. **Canonical models (scoping foundation).** `User`, `Organization`,
   `OrgMember`, and `Invitation` are the product's canonical identity/tenancy
   models, defined in the app's Prisma schema and owned by the app's module +
   RBAC policy layer (not delegated to an external plugin). `OrgMember` is the
   **single source of truth** for "which user is in which organisation, with what
   role" — the scoping key every future feature's `principal.can(permission,
organizationId)` check resolves against. Authentication is provided by Better
   Auth behind the existing `AuthContextService` seam (ADR-0003); `User` is backed
   by Better Auth but modelled in our schema so it can be joined and scoped.

2. **Organisation role set.** `OrganizationRole` becomes, least → most
   privileged:

   | Role          | Intent (product)                                                                                  |
   | ------------- | ------------------------------------------------------------------------------------------------- |
   | `VIEWER`      | Read-only access to shared resources in the org.                                                  |
   | `CONTRIBUTOR` | Update progress and add notes on assigned plans; cannot alter logic/dates.                        |
   | `PLANNER`     | Full CRUD on clients/projects/plans/activities in the org; holds edit lock.                       |
   | `ORG_ADMIN`   | Everything a Planner can do, plus manage members, invitations, org settings & libraries, billing. |

   This **replaces** the placeholder `OWNER / MEMBER / VIEWER`. Code checks
   **permissions**, never role names (ADR-0012), so features remain decoupled from
   the enum; only the per-feature role→permission maps reference it.

3. **External Guest is modelled separately, not as an `OrganizationRole`.** A
   guest is _not_ an organisation member — they hold a revocable, per-plan share
   grant (PROJECT_BRIEF §5, §13). Putting `EXTERNAL_GUEST` in `OrganizationRole`
   would force every membership query and role→permission map to special-case a
   value that never appears in `OrgMember`. It is therefore deliberately **out of
   the org role enum** and will be designed as its own per-plan share mechanism
   (a future ADR) when plans exist. Role-accepting DTOs reject any value outside
   `{ORG_ADMIN, PLANNER, CONTRIBUTOR, VIEWER}` (422).

4. **Transactional mail is a port.** Invitations (and later password-reset/share
   notifications) need to send email. We introduce a `MailService` **port** with a
   stub/logging adapter for v1 — the same abstraction pattern as Storage/Cache
   (ADR-0010/0011). This keeps the slice free of a hard dependency on any email
   provider; the raw invite link is also surfaced in the create response so
   onboarding is testable with no provider wired. Selecting a concrete provider is
   deferred to its own ADR; this ADR only records that the seam exists.

5. **Invitation acceptance is gated on an email match, whose strength depends on
   email verification.** Accepting an invite grants organisation membership and a
   role, so it is a privilege grant. The accept flow requires the caller to be
   signed in as an account whose email equals the invited address. That match is
   only a genuine proof of mailbox ownership when email verification is enforced;
   with verification off (the alpha default — no verification-email loop is built
   yet), an account can be registered for any address without proof, so an
   adversary who both controls a matching account **and** possesses the one-time
   token could accept. We accept this risk **only for the alpha** because: the
   token is a 256-bit secret delivered to the invited mailbox (possession already
   implies mailbox access in the normal path), and the check is strictly stronger
   than a pure bearer-link invite. The enforcement is **wired but off**: a single
   flag, `AUTH_REQUIRE_EMAIL_VERIFICATION`, drives both Better Auth's
   `requireEmailVerification` and an `emailVerified` gate in the accept path, so
   turning it on (once the verification-email loop lands) closes the gap with no
   further code change. Tracked in `docs/TECH_DEBT.md`.

## Alternatives considered

- **Keep the placeholder `OWNER/MEMBER/VIEWER` enum and map product roles onto
  it.** Rejected — the brief's roles (especially the Planner ↔ Contributor split
  around "who may change logic/dates") do not map cleanly onto three generic
  tiers, and the mismatch would leak into every permission map and the UI. A
  first-class role set is clearer and is the canonical decision this ADR exists to
  make.
- **Use Better Auth's `organization` plugin for orgs/roles/invites.** Rejected for
  v1 — it would own the tenancy model outside our Prisma schema and RBAC policy
  layer, weakening the single-source-of-truth scoping key every future feature
  depends on and diverging from the reference template. Revisit (in an ADR) only if
  it proves a net simplification.
- **Reserve `EXTERNAL_GUEST` in the enum "for later".** Rejected — a reserved-but-
  invalid enum member that can never be persisted in `OrgMember` is a trap
  (exhaustive `switch`/`Record` maps must handle a dead case; validation must
  reject it). Modelling guests as a separate per-plan grant is more correct.
- **A separate `MailService` ADR now.** Deferred — with no provider chosen there is
  little to decide beyond "a port exists"; folding that into this ADR avoids an
  almost-empty record. A dedicated ADR lands with the provider choice.

## Consequences

**Positive**

- One authoritative scoping model (`OrgMember`) for the whole product; every
  feature's authorisation resolves the same way (defence against IDOR).
- Role set matches the product vocabulary, so permission maps and UI copy read
  naturally.
- Auth provider and mail provider stay swappable behind seams (ADR-0003 pattern).

**Negative / cost**

- The reference template's role→permission map and the RBAC unit tests must be
  updated in step (done in this change; enforced by `scripts/verify-template.sh`).
- `User` is duplicated between Better Auth's storage and our schema; the
  `AuthContextService` adapter must keep them consistent (single write path via
  Better Auth; we treat our `User` row as the projection).

**Neutral / follow-ups**

- **ADR-0012 is not edited** (ADRs are immutable once accepted); its `OWNER/MEMBER/
VIEWER` mention was illustrative. This ADR supersedes that illustration for the
  concrete role set.
- A future ADR will define the **External Guest / per-plan share** mechanism.
- A future ADR will record the chosen **transactional email provider** behind the
  `MailService` port.

## References

- [PROJECT_BRIEF §5 (Tenancy & Roles), §13 (share links)](../PROJECT_BRIEF.md)
- [ADR-0003 — Authentication with Better Auth](0003-authentication-with-better-auth.md)
- [ADR-0012 — Authorisation: RBAC with resource scoping](0012-authorization-rbac-scoped.md)
- [ADR-0014 — Reference feature as a non-shipping template](0014-reference-feature-as-non-shipping-template.md)
- [ADR-0015 — Template-driven feature development](0015-template-driven-feature-development.md)
- Feature spec: [`docs/specs/org-onboarding-membership.md`](../specs/org-onboarding-membership.md)
- Implementation plan: [`docs/plans/org-onboarding-membership.md`](../plans/org-onboarding-membership.md)
