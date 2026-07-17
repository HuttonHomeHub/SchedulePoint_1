import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { useCalendars } from '@/features/calendars';
import { CreateResourceButton, ResourcesTable } from '@/features/resources';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/**
 * The organisation's resource library screen (`/orgs/$orgSlug/resources`), behind
 * `RESOURCES_ENABLED`. The route is only registered when the flag is on (see
 * `app/router.tsx`), so this screen never renders while the surface is dark. The org
 * calendars are composed here and threaded into the table's create/edit dialog so the
 * resources feature stays dependency-free of the calendars feature.
 */
export function ResourcesScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  const calendars = useCalendars(orgSlug);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Resources' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        {canWrite ? (
          <CreateResourceButton
            orgSlug={orgSlug}
            calendars={calendars.data ?? []}
            calendarsLoading={calendars.isPending}
            calendarsError={calendars.isError}
          />
        ) : null}
      </div>
      <div className="mt-6">
        <ResourcesTable
          orgSlug={orgSlug}
          canWrite={canWrite}
          calendars={calendars.data ?? []}
          calendarsLoading={calendars.isPending}
          calendarsError={calendars.isError}
        />
      </div>
    </div>
  );
}
