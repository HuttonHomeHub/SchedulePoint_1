import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MembersScreen } from './members';

/**
 * **What this screen COMPOSES, as distinct from what its sections render.**
 *
 * The sections have their own suites and this does not repeat them; they are stubbed to their own
 * names so a failure here means the screen put the wrong thing on the page, never that a table
 * misbehaved. Three facts are pinned:
 *
 * 1. **Pending invitations is OMITTED for anyone who is not an Org Admin** — not shaded, not
 *    rendered empty (ADR-0082's first omit clause at section granularity). A Planner cannot read
 *    invitations at all, so a frame headed "Pending invitations" would be a permanently empty box
 *    asserting there is an answer they may not have. `members.tsx` has always done this and
 *    **nothing asserted it**, which is how a permission boundary quietly becomes a layout detail
 *    the next person refactors away.
 * 2. The roles panel is there for **everyone**, because the question it answers — what does
 *    "Contributor" mean? — is a reader's question and not an administrator's.
 * 3. The roster is there for everyone.
 */
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
}));

const role = vi.hoisted(() => ({ current: 'ORG_ADMIN' }));

vi.mock('@/hooks/use-org-role', () => ({
  useOrgRole: () => role.current,
  canAdministerInvitations: (r: string) => r === 'ORG_ADMIN',
}));

vi.mock('@/features/members', () => ({
  MembersTable: () => <div>ROSTER</div>,
  InvitationsSection: () => <div>INVITATIONS</div>,
  InviteMemberDialog: () => <button type="button">Invite member</button>,
  RolesPanel: () => <div>ROLES</div>,
}));

describe('MembersScreen — what the screen composes', () => {
  it('shows the roster, the invitations and the roles panel to an Org Admin', () => {
    role.current = 'ORG_ADMIN';
    render(<MembersScreen />);
    expect(screen.getByText('ROSTER')).toBeInTheDocument();
    expect(screen.getByText('INVITATIONS')).toBeInTheDocument();
    expect(screen.getByText('ROLES')).toBeInTheDocument();
  });

  it('OMITS pending invitations for a Planner, rather than rendering an empty frame', () => {
    role.current = 'PLANNER';
    render(<MembersScreen />);
    expect(screen.queryByText('INVITATIONS')).not.toBeInTheDocument();
    // The distinction that matters: omitted, not shaded. Nothing on the page names the section.
    expect(screen.queryByText(/pending invitations/i)).not.toBeInTheDocument();
    // …and the rest of the screen is unaffected.
    expect(screen.getByText('ROSTER')).toBeInTheDocument();
    expect(screen.getByText('ROLES')).toBeInTheDocument();
  });
});
