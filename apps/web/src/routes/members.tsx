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
 * and a bare `<h1>`. `PageContainer`'s default is `max-w-screen-2xl` (`page-container.tsx:38`), not the
 * `max-w-6xl` the old frame spelled out, so the page's measure is the archetype's, not the old
 * frame's. `MembersTable`'s existing suite passes through the conversion unchanged, which is the
 * contract it preserves: it queries by role and caption.
 *
 * **The invitations section is omitted entirely for anyone who is not an Org Admin**, rather than
 * rendered empty or shaded — ADR-0082's first omit clause at section granularity. A Planner cannot
 * read invitations at all, so a frame headed "Pending invitations" would be a permanently empty box
 * asserting there is an answer they may not have.
 */
export function MembersScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  // Inviting, changing a role and removing are one Org-Admin-only bundle on the API (`member:invite`,
  // `member:update_role`, `member:remove`), so the screen offers them to nobody else rather than
  // letting a Contributor fill in a form the server then refuses. Omitted, as the Calendars screen
  // omits its write actions (ADR-0082's omit clause), because for these roles it never applies.
  const canAdminister = canAdministerInvitations(useOrgRole(orgSlug));

  return (
    <PageContainer>
      <PageHeader
        title="Members"
        actions={canAdminister ? <InviteMemberDialog orgSlug={orgSlug} /> : null}
      />
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
          <MembersTable orgSlug={orgSlug} canAdminister={canAdminister} />
        </PageGridItem>
        {canAdminister ? (
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
