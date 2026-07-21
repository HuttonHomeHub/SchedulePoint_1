---
'@repo/api': minor
---

feat(api): External-Guest share-link foundations — schema, token helper & guest-auth seam (ADR-0051 F-M1)

The dark foundations for Stage F (per-plan share links). Adds a `plan_shares` table + migration: an org-scoped,
soft-deleted, hashed-token grant to exactly one plan (`token_hash` stores only the SHA-256 of the raw bearer
token, unique across all rows), with a `PlanShareRepository`. Extracts the invitation hashed-token util to a
shared `common/tokens/token.ts` (`generateOpaqueToken(prefix)`/`hashToken`); invitations reuse it with an empty
prefix, so their token format and stored hashes are byte-identical.

Introduces the guest identity seam: `GuestPrincipal` — structurally distinct from the member `Principal` (no
memberships, no `can()`), so a guest can never flow into a member service method — plus a `ShareTokenGuard` that
resolves an `Authorization: Bearer sp_share_…` token to a live grant (not revoked / expired / soft-deleted) and
re-checks the referenced plan is active, with a uniform 404 on every failure (no existence oracle). The plan
soft-delete cascade (`HierarchyLifecycleService`) now sweeps and restores a plan's share links in the same batch.

No routes are wired yet (management API is F-M2, guest reads are F-M3), so behaviour is unchanged. Read-only and
write-free: the CPM engine, the pen model (ADR-0028), and the recalc parity golden suite are untouched.
