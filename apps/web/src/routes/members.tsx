import { useParams } from '@tanstack/react-router';

import { InviteMemberDialog, MembersTable } from '@/features/members';

/** The organisation members screen (`/orgs/$orgSlug/members`). */
export function MembersScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <InviteMemberDialog orgSlug={orgSlug} />
      </div>
      <div className="mt-6">
        <MembersTable orgSlug={orgSlug} />
      </div>
    </main>
  );
}
