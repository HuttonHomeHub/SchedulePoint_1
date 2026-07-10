import type { OrganizationRole } from '@repo/types';

import { useOrganizations } from '@/features/organizations';

export {
  canManageHierarchy,
  canReportProgress,
  canManageLogic,
  canCalculateSchedule,
} from '@/lib/rbac';

/**
 * The current user's role in `orgSlug`, from the already-loaded organisations
 * query. Used to hide write affordances for non-writers — the API still
 * enforces authorisation, so this is UX, not trust.
 */
export function useOrgRole(orgSlug: string): OrganizationRole | undefined {
  const { data } = useOrganizations();
  return data?.find((organization) => organization.slug === orgSlug)?.role;
}
