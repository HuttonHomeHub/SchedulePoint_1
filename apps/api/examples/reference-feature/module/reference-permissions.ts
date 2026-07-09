import { OrganizationRole, type Permission } from '../../common/auth/principal';

/**
 * This feature's permission codes and the role→permission mapping. Each feature
 * owns its own; the generic RBAC model (`Principal`) just carries the resolved
 * permissions per membership. `AuthContextService` uses a mapping like this to
 * populate the principal from the user's organisation roles.
 */
export type ReferencePermission =
  'reference:read' | 'reference:create' | 'reference:update' | 'reference:delete';

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly ReferencePermission[]> = {
  [OrganizationRole.VIEWER]: ['reference:read'],
  [OrganizationRole.MEMBER]: ['reference:read', 'reference:create', 'reference:update'],
  [OrganizationRole.OWNER]: [
    'reference:read',
    'reference:create',
    'reference:update',
    'reference:delete',
  ],
};

/** Resolve the permissions a role grants (used when building the principal). */
export function referencePermissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
