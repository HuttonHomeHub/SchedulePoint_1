import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { ClientsTable, CreateClientButton } from '@/features/clients';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** The organisation's clients screen (`/orgs/$orgSlug/clients`). */
export function ClientsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));

  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        actions={canWrite ? <CreateClientButton orgSlug={orgSlug} /> : null}
      />
      <div className="mt-6">
        <ClientsTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </PageContainer>
  );
}
