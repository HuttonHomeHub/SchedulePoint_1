import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader, SectionCard } from '@/components/ui/page';
import { InvitationsSection, InviteMemberDialog, MembersTable } from '@/features/members';
import { canAdministerInvitations, useOrgRole } from '@/hooks/use-org-role';

/**
 * The organisation members screen (`/orgs/$orgSlug/members`).
 *
 * **On the ADR-0097 archetypes**, converted from a hand-rolled `mx-auto w-full max-w-6xl p-6` frame
 * and a bare `<h1>`. The conversion is width-neutral by construction — `PageContainer`'s default is
 * `max-w-6xl`, the same class the frame spelled out — so it changes the heading tree and the
 * section semantics and nothing a reader measures. `MembersTable`'s existing suite passes through
 * it unchanged, which is the contract the conversion preserves: it queries by role and caption.
 *
 * **The invitations section is omitted entirely for anyone who is not an Org Admin**, rather than
 * rendered empty or shaded — ADR-0082's first omit clause at section granularity. A Planner cannot
 * read invitations at all, so a frame headed "Pending invitations" would be a permanently empty box
 * asserting there is an answer they may not have.
 */
export function MembersScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const role = useOrgRole(orgSlug);

  return (
    <PageContainer>
      <PageHeader title="Members" actions={<InviteMemberDialog orgSlug={orgSlug} />} />
      <div className="mt-6 flex flex-col gap-6">
        <SectionCard title="Roster" description="Everyone who has joined this organisation.">
          <MembersTable orgSlug={orgSlug} />
        </SectionCard>
        {canAdministerInvitations(role) ? <InvitationsSection orgSlug={orgSlug} /> : null}
      </div>
    </PageContainer>
  );
}
