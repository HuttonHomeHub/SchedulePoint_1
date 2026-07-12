/**
 * The authenticated principal and the RBAC model (ADR-0012).
 *
 * Roles are scoped to an organisation membership; capabilities depend on the
 * principal's role **in the organisation that owns the resource**. Code checks
 * **permissions**, not role names, so the role→permission mapping can evolve.
 *
 * This is feature-agnostic foundation: a `Permission` is any permission code
 * (e.g. `'item:create'`). Each feature defines its own permission codes and the
 * role→permission mapping; the resolved permissions for a membership are carried
 * on the principal (populated by `AuthContextService` in production). See the
 * reference-feature template in `apps/api/examples/` for a worked mapping.
 */

/**
 * Organisation-scoped roles, least → most privileged (ADR-0016). Modelled as a
 * const object + union (not a TS `enum`) so the type is structurally identical
 * to Prisma's generated `$Enums.OrganizationRole` and the `@repo/types` union —
 * they interoperate without casts, while `OrganizationRole.ORG_ADMIN` access
 * still works.
 *
 * `EXTERNAL_GUEST` from the product brief is intentionally NOT a member role —
 * a guest holds a revocable per-plan share grant, not an organisation
 * membership, and is modelled separately (a future ADR). See ADR-0016.
 */
export const OrganizationRole = {
  VIEWER: 'VIEWER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  PLANNER: 'PLANNER',
  ORG_ADMIN: 'ORG_ADMIN',
} as const;

export type OrganizationRole = (typeof OrganizationRole)[keyof typeof OrganizationRole];

/** A permission code, namespaced by resource, e.g. `'item:create'`. */
export type Permission = string;

/** A single organisation membership: the role and the permissions it grants here. */
export interface OrganizationMembership {
  organizationId: string;
  role: OrganizationRole;
  /** Permissions granted to this principal in this organisation. */
  permissions: readonly Permission[];
}

/**
 * The authenticated user and their memberships. Immutable and request-scoped.
 * Authorisation is always evaluated against a specific organisation (resource
 * scope) — the defence against IDOR.
 *
 * `name`/`email` are the caller's own profile, already loaded by the auth seam's
 * `getSession` (ADR-0003). They are carried so a service can render the caller as
 * an actor without a second DB round-trip (e.g. the edit-lock heartbeat resolving
 * its own holder). They are optional so foundation/test code can build a principal
 * from id + memberships alone; treat them as best-effort display data, never as an
 * authorisation input.
 */
export class Principal {
  constructor(
    readonly userId: string,
    readonly memberships: readonly OrganizationMembership[],
    readonly name?: string,
    readonly email?: string,
  ) {}

  /** True if the principal belongs to the organisation. */
  isMemberOf(organizationId: string): boolean {
    return this.memberships.some((m) => m.organizationId === organizationId);
  }

  /**
   * True if the principal holds `permission` **in the given organisation**. This
   * pairs the permission check with a resource-scope check in one place — the
   * authoritative check services must use (defence against IDOR).
   */
  can(permission: Permission, organizationId: string): boolean {
    const membership = this.memberships.find((m) => m.organizationId === organizationId);
    if (!membership) return false;
    return membership.permissions.includes(permission);
  }

  /**
   * True if the principal holds `permission` in **any** organisation. Used by the
   * PermissionsGuard as a coarse capability gate; the service still enforces
   * the organisation-scoped {@link can} check on the specific resource.
   */
  canAnywhere(permission: Permission): boolean {
    return this.memberships.some((m) => m.permissions.includes(permission));
  }
}
