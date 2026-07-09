# @repo/api

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation invitations and a transactional-mail port. Org Admins can
  invite by email with a role (`POST /organizations/:orgSlug/invitations`), list
  pending invites, and revoke them; invitees preview by token
  (`POST /invitations/preview`) and accept (`POST /invitations/accept`) to join.
  Tokens are stored hashed (raw value returned once + emailed), invitations expire,
  and accept is transactional. Adds a `MailService` port with a logging stub
  adapter (the accept URL is also returned so onboarding works without a provider)
  and the shared `InvitationSummary`/`InvitationPreview` contracts to `@repo/types`.
  Introduces a `410 Gone` error for expired/revoked invitations.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisations tenancy core. New `Organization` and `OrgMember` models
  (the canonical org-scoping foundation: UUID v7, soft-delete, audit, optimistic
  locking, partial-unique slug and one-membership-per-user indexes) and the
  `organizations` module: `POST /api/v1/organizations` (creator becomes Org Admin,
  atomically, with slug uniquification), `GET /api/v1/organizations` (the caller's
  orgs), and `GET /api/v1/organizations/:orgSlug` (404 for non-members —
  anti-enumeration). The auth seam now hydrates a principal's memberships and
  permissions from the database, so `/api/v1/me` returns real memberships and
  `principal.can(permission, orgId)` is enforced. Adds the shared
  `OrganizationSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add membership management. New endpoints under the organisation scope:
  `GET /api/v1/organizations/:orgSlug/members` (cursor-paginated roster with user
  profiles), `PATCH .../members/:memberId` (change role, Org Admin only, with
  optimistic locking and the last-Org-Admin invariant), and
  `DELETE .../members/:memberId` (soft-delete, Org Admin only, last-admin
  protected). Every route resolves the org scope from the caller's memberships
  (404 for non-members; 403 for insufficient role). Adds the shared
  `OrgMemberSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Establish the core identity & tenancy model and adopt the SchedulePoint
  organisation role set (ADR-0016). `OrganizationRole` is now
  `ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` (replacing the placeholder
  `OWNER / MEMBER / VIEWER`); External Guest is modelled separately, not as a
  member role. The reference-feature role→permission map and RBAC tests are
  updated in step. No runtime behaviour changes yet.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.

### Patch Changes

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
