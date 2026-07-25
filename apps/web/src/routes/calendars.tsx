import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CalendarsTable, CreateCalendarButton } from '@/features/calendars';
import { canManageHierarchy, canManageOrgCalendars, useOrgRole } from '@/hooks/use-org-role';

/**
 * The organisation's calendars library screen (`/orgs/$orgSlug/calendars`). Writing to the SHARED
 * library additionally needs `calendar:manage_org` (ADR-0053 §2), resolved here and threaded down so
 * the table and the create dialog gate on it rather than re-deriving the role.
 */
export function CalendarsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canManageOrg = canManageOrgCalendars(role);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Calendars' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        {canWrite ? <CreateCalendarButton orgSlug={orgSlug} canManageOrg={canManageOrg} /> : null}
      </div>
      <div className="mt-6">
        <CalendarsTable orgSlug={orgSlug} canWrite={canWrite} canManageOrg={canManageOrg} />
      </div>
    </div>
  );
}
