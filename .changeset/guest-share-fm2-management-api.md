---
'@repo/api': minor
---

feat(api): External-Guest share-link management API + `plan:share` (ADR-0051 F-M2)

Adds the authenticated management surface for per-plan share links, nested under a plan:

- `POST …/plans/:planId/shares` — create a revocable, optionally-expiring link. Returns **201**
  `{ url, share }`; the raw `sp_share_…` token is returned **once** in the URL's fragment
  (`…/share#<token>`) and never again (only its SHA-256 hash is stored). A non-future `expiresAt`
  is a **422** (`SHARE_EXPIRY_IN_PAST`).
- `GET …/plans/:planId/shares` — list a plan's links, newest-first, **metadata only** (never a token).
- `DELETE …/plans/:planId/shares/:shareId` — revoke, immediate and **idempotent** (204).

Introduces the `plan:share` permission, granted to **Planner + Org Admin only** — sharing a plan
outside the organisation is a governance act, deliberately not a Contributor/Viewer capability. Every
method resolves the org from the caller's memberships (404 non-member), asserts `plan:share` (403), and
scopes the target plan to that org (404 anti-IDOR); `organization_id` is copied from the resolved plan,
never from client input. Non-scheduling and write-free of engine state — the CPM engine, the pen model
(ADR-0028), and the recalc parity gate are untouched, and share writes are not pen-gated.

The session-less guest read path and its rate-limiter are F-M3; a flagged web surface is F-M4.
