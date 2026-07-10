import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CalendarsTable, CreateCalendarButton } from '@/features/calendars';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** The organisation's calendars library screen (`/orgs/$orgSlug/calendars`). */
export function CalendarsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Calendars' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        {canWrite ? <CreateCalendarButton orgSlug={orgSlug} /> : null}
      </div>
      <div className="mt-6">
        <CalendarsTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </main>
  );
}
