import type { OrgMemberSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { memberKeys } from '../api/use-members';

import { MembersTable } from './MembersTable';

const MEMBERS: OrgMemberSummary[] = [
  {
    id: 'm1',
    user: { id: 'u1', name: 'Ada Admin', email: 'ada@example.com' },
    role: 'ORG_ADMIN',
    joinedAt: '2026-01-01T00:00:00Z',
    version: 1,
  },
  {
    id: 'm2',
    user: { id: 'u2', name: 'Val Viewer', email: 'val@example.com' },
    role: 'VIEWER',
    joinedAt: '2026-01-02T00:00:00Z',
    version: 3,
  },
];

function renderTable() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(memberKeys.list('acme'), MEMBERS);
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersTable orgSlug="acme" />
    </QueryClientProvider>,
  );
}

describe('MembersTable', () => {
  it('renders each member with an accessible role control and remove action', () => {
    renderTable();

    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.getByText('val@example.com')).toBeInTheDocument();

    // The role control reflects the member's current role and is labelled.
    expect(screen.getByLabelText('Role for Val Viewer')).toHaveValue('VIEWER');
    expect(screen.getByRole('button', { name: 'Remove Ada Admin' })).toBeInTheDocument();
  });
});
