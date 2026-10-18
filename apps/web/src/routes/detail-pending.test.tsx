import { render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientDetailScreen } from './client-detail';
import { ProjectDetailScreen } from './project-detail';

import { LoadingShape } from '@/components/ui/page';

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
const h = vi.hoisted(
  (): { client: Read; project: Read; projects: Read; plans: Read; tableMounts: number } => ({
    client: { isPending: true, isError: false },
    project: { isPending: true, isError: false },
    projects: { isPending: true, isError: false },
    plans: { isPending: true, isError: false },
    tableMounts: 0,
  }),
);

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
// A table that is still reading speaks the way the real one does (`DataTable`): one polite shape.
const Table = ({ pending, label, ready }: { pending: boolean; label: string; ready: string }) =>
  pending ? (
    <LoadingShape label={label}>
      <span />
    </LoadingShape>
  ) : (
    <p>{ready}</p>
  );

vi.mock('@/features/projects', () => ({
  useProject: () => h.project,
  useProjects: () => h.projects,
  CreateProjectButton: () => <button type="button">New project</button>,
  ProjectsTable: () => {
    // An effect with no dependencies runs once per MOUNT; a bare increment would count renders.
    useEffect(() => {
      h.tableMounts += 1;
    }, []);
    return (
      <Table pending={h.projects.isPending} label="Loading projects…" ready="projects table" />
    );
  },
}));
vi.mock('@/features/plans', () => ({
  CreatePlanButton: () => <button type="button">New plan</button>,
  usePlans: () => h.plans,
  PlansTable: () => (
    <Table pending={h.plans.isPending} label="Loading plans…" ready="plans table" />
  ),
}));
vi.mock('@/features/calendars', () => ({ ProjectCalendarsSection: () => <p>calendars</p> }));
vi.mock('@/features/interchange', () => ({ ImportScheduleButton: () => null }));

beforeEach(() => {
  h.client = { isPending: true, isError: false };
  h.project = { isPending: true, isError: false };
  h.projects = { isPending: true, isError: false };
  h.plans = { isPending: true, isError: false };
  h.tableMounts = 0;
});

/** The text of every live status on the screen, none of them inside an `aria-busy` subtree. */
function statuses(): string[] {
  const regions = screen.queryAllByRole('status');
  for (const region of regions) expect(region.closest('[aria-busy="true"]')).toBeNull();
  return regions.map((r) => r.textContent ?? '');
}

describe('ClientDetailScreen while the client read is pending', () => {
  it('shows its frame and the Projects table at once, with no spinner and no heading yet', () => {
    h.projects = { isPending: false, isError: false };
    const { container } = render(<ClientDetailScreen />);
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('projects table')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  });

  it('keeps the heading read quiet while the table is still reading: its shape is the one sentence', () => {
    render(<ClientDetailScreen />);
    expect(statuses()).toEqual(['Loading projects…']);
    expect(screen.getByText('Loading client…')).toHaveClass('sr-only');
  });

  it('speaks for the heading read when the table settles first: still exactly one sentence', () => {
    h.projects = { isPending: false, isError: false };
    render(<ClientDetailScreen />);
    expect(statuses()).toEqual(['Loading client…']);
  });

  it('says nothing once both reads have settled', () => {
    h.projects = { isPending: false, isError: false };
    h.client = {
      isPending: false,
      isError: false,
      data: { name: 'Northgate', description: null, projectCount: 2 },
    };
    render(<ClientDetailScreen />);
    expect(statuses()).toEqual([]);
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
    h.plans = { isPending: false, isError: false };
    render(<ProjectDetailScreen />);
    expect(screen.getByRole('heading', { name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByText('plans table')).toBeInTheDocument();
    expect(screen.queryByText('calendars')).toBeNull();
  });

  it('keeps the heading read quiet while the table is still reading', () => {
    render(<ProjectDetailScreen />);
    expect(statuses()).toEqual(['Loading plans…']);
    expect(screen.getByText('Loading project…')).toHaveClass('sr-only');
  });

  it('speaks for the heading read when the table settles first: still exactly one sentence', () => {
    h.plans = { isPending: false, isError: false };
    render(<ProjectDetailScreen />);
    expect(statuses()).toEqual(['Loading project…']);
  });

  it('says nothing once both reads have settled', () => {
    h.plans = { isPending: false, isError: false };
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
    render(<ProjectDetailScreen />);
    expect(statuses()).toEqual([]);
  });

  it('settles into the same frame', () => {
    h.plans = { isPending: false, isError: false };
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
