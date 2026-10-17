import { render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientDetailScreen } from './client-detail';
import { ProjectDetailScreen } from './project-detail';

/**
 * The client and project screens render their frame at once and swap only the header
 * (loading-skeletons CQ-2, M4). Everything below the header is a stand-in: the subject here is the
 * route's own composition while its subject read is pending.
 */
interface Read {
  isPending: boolean;
  isError: boolean;
  data?: Record<string, unknown>;
}
const h = vi.hoisted((): { client: Read; project: Read; tableMounts: number } => ({
  client: { isPending: true, isError: false },
  project: { isPending: true, isError: false },
  tableMounts: 0,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useParams: () => ({ orgSlug: 'acme', clientId: 'c1', projectId: 'p1' }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => 'PLANNER',
}));
vi.mock('@/features/clients', () => ({ useClient: () => h.client }));
vi.mock('@/features/projects', () => ({
  useProject: () => h.project,
  CreateProjectButton: () => <button type="button">New project</button>,
  ProjectsTable: () => {
    // An effect with no dependencies runs once per MOUNT; a bare increment would count renders.
    useEffect(() => {
      h.tableMounts += 1;
    }, []);
    return <p>projects table</p>;
  },
}));
vi.mock('@/features/plans', () => ({
  CreatePlanButton: () => <button type="button">New plan</button>,
  PlansTable: () => <p>plans table</p>,
}));
vi.mock('@/features/calendars', () => ({ ProjectCalendarsSection: () => <p>calendars</p> }));
vi.mock('@/features/interchange', () => ({ ImportScheduleButton: () => null }));

beforeEach(() => {
  h.client = { isPending: true, isError: false };
  h.project = { isPending: true, isError: false };
  h.tableMounts = 0;
});

describe('ClientDetailScreen while the client read is pending', () => {
  it('shows its frame and the Projects table at once, with no spinner and no heading yet', () => {
    const { container } = render(<ClientDetailScreen />);
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('projects table')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  });

  it('speaks no sentence of its own: the table’s shape is the one sentence', () => {
    render(<ClientDetailScreen />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Loading client…')).toHaveClass('sr-only');
  });

  it('keeps the same table instance when the client arrives', () => {
    const { rerender } = render(<ClientDetailScreen />);
    h.client = {
      isPending: false,
      isError: false,
      data: { name: 'Northgate', description: null, projectCount: 2 },
    };
    rerender(<ClientDetailScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Northgate' })).toBeInTheDocument();
    expect(h.tableMounts, 'the table mounted once, not once per phase').toBe(1);
  });
});

describe('ProjectDetailScreen while the project read is pending', () => {
  it('shows the Plans frame at once, and the Calendars section only with the project', () => {
    render(<ProjectDetailScreen />);
    expect(screen.getByRole('heading', { name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByText('plans table')).toBeInTheDocument();
    expect(screen.queryByText('calendars')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Loading project…')).toHaveClass('sr-only');
  });

  it('settles into the same frame', () => {
    const { rerender } = render(<ProjectDetailScreen />);
    h.project = {
      isPending: false,
      isError: false,
      data: {
        clientId: 'c1',
        name: 'Riverside',
        description: null,
        planCount: 1,
        activityCount: 4,
      },
    };
    rerender(<ProjectDetailScreen />);
    const plans = screen.getByRole('region', { name: 'Plans' });
    expect(within(plans).getByText('plans table')).toBeInTheDocument();
    expect(screen.getByText('calendars')).toBeInTheDocument();
  });
});
