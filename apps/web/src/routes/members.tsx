import { useParams } from '@tanstack/react-router';

import { PageContainer, PageGrid, PageGridItem, PageHeader } from '@/components/ui/page';
import {
  InvitationsSection,
  InviteMemberDialog,
  MembersTable,
  RolesPanel,
} from '@/features/members';
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
      {/*
        **Two columns, spans by content demand** (product-owner decision 3: both the landing's
        layout AND richer sections). The roster is a five-column table and takes the full width;
        invitations and the roles panel are narrow and pair with each other.

        The roles panel is not filler. Without it the second column holds one short section beside a
        table four times its height — which is the ragged column the organisation landing already
        has and which this epic is meant to be fixing, not spreading. It earns its place by
        answering the question this screen asks and never answered: the roster's `Role` select and
        the invite dialog both offer four words and nothing said what they mean.
      */}
      <PageGrid className="mt-6">
        <PageGridItem span="wide">
          {/* `MembersTable` owns its own `SectionCard`, so the section can state its size: the
              count has to come from the query, and only the component holds it. See that file's
              docblock for why calling `useMembers` here instead would have been the wrong three
              lines. */}
          <MembersTable orgSlug={orgSlug} />
        </PageGridItem>
        {canAdministerInvitations(role) ? (
          <PageGridItem span="narrow">
            <InvitationsSection orgSlug={orgSlug} />
          </PageGridItem>
        ) : null}
        <PageGridItem span="narrow">
          <RolesPanel />
        </PageGridItem>
      </PageGrid>
    </PageContainer>
  );
}
