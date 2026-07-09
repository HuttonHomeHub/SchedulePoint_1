import type { ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { projectKeys } from '../api/use-projects';

import { ProjectsTable } from './ProjectsTable';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  }) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

const PROJECTS: ProjectSummary[] = [
  {
    id: 'p1',
    clientId: 'c1',
    name: 'Riverside',
    description: 'Phase 1',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderTable(canWrite: boolean, data: ProjectSummary[] = PROJECTS) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(projectKeys.listByClient('acme', 'c1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectsTable orgSlug="acme" clientId="c1" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

describe('ProjectsTable', () => {
  it('renders each project as a link, with edit/delete actions for writers', () => {
    renderTable(true);
    expect(screen.getByRole('link', { name: 'Riverside' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Riverside' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Riverside' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: 'Edit Riverside' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no projects', () => {
    renderTable(true, []);
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
  });
});
