import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ClientsTable, CreateClientButton } from '@/features/clients';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** The organisation's clients screen (`/orgs/$orgSlug/clients`). */
export function ClientsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Clients' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        {canWrite ? <CreateClientButton orgSlug={orgSlug} /> : null}
      </div>
      <div className="mt-6">
        <ClientsTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </main>
  );
}
