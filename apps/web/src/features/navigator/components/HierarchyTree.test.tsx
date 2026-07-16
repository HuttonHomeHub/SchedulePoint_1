import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HierarchyTree } from './HierarchyTree';

// The virtualizer measures a scroll element, which jsdom reports as 0×0 (so it would
// window every row out). It is battle-tested and exercised end-to-end by the Playwright
// journeys; here we stub it to a pass-through that renders every row, so this suite
// tests the component's own logic (rendering, keyboard, selection, deep-link).
vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: (range: { startIndex: number; endIndex: number }) =>
    Array.from({ length: range.endIndex - range.startIndex + 1 }, (_, i) => range.startIndex + i),
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 28,
        size: 28,
      })),
    scrollToIndex: () => {},
  }),
}));

const navigate = vi.fn();
let params: Record<string, string> = {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => params,
}));

// Drive the tree off in-memory fixtures instead of the network.
const clients: ClientSummary[] = [
  { id: 'c1', name: 'Northgate', description: null, version: 1, createdAt: '', updatedAt: '' },
];
const projects: ProjectSummary[] = [
  {
    id: 'p1',
    clientId: 'c1',
    name: 'Fit-out',
    description: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
];
const plans: PlanSummary[] = [
  {
    id: 'pl1',
    projectId: 'p1',
    name: 'Overall Schedule',
    description: null,
    status: 'DRAFT',
    schedulingMode: 'EARLY',
    progressRecalcMode: 'RETAINED_LOGIC',
    useExpectedFinishDates: false,
    criticalPathDefinition: 'TOTAL_FLOAT',
    criticalFloatThreshold: 0,
    plannedStart: null,
    calendarId: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => {
    if (path.endsWith('/clients')) return Promise.resolve(clients);
    if (path.includes('/clients/c1/projects')) return Promise.resolve(projects);
    if (path.includes('/projects/p1/plans')) return Promise.resolve(plans);
    if (path.endsWith('/plans/pl1')) return Promise.resolve(plans[0]);
    if (path.endsWith('/projects/p1')) return Promise.resolve(projects[0]);
    return Promise.reject(new Error(`unexpected ${path}`));
  },
}));

function renderTree() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sessionStorage.clear();
  return render(
    <QueryClientProvider client={client}>
      <HierarchyTree orgSlug="acme" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockClear();
  params = {};
});

describe('HierarchyTree', () => {
  it('renders an accessible tree of the org clients', async () => {
    renderTree();
    expect(await screen.findByRole('tree', { name: 'Project Explorer' })).toBeInTheDocument();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    expect(client).toHaveAttribute('aria-level', '1');
    expect(client).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands a client to reveal its projects (lazy) and does not navigate', async () => {
    renderTree();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(client);
    await screen.findByRole('treeitem', { name: /Fit-out/ });
    expect(screen.getByRole('treeitem', { name: /Northgate/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(navigate).not.toHaveBeenCalled(); // folders expand only (Q3)
  });

  it('navigates when a plan leaf is activated', async () => {
    renderTree();
    fireEvent.click(await screen.findByRole('treeitem', { name: /Northgate/ }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Fit-out/ }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Overall Schedule/ }));
    expect(navigate).toHaveBeenCalledWith({
      to: '/orgs/$orgSlug/plans/$planId',
      params: { orgSlug: 'acme', planId: 'pl1' },
    });
  });

  it('expands a folder with the ArrowRight key (APG keymap)', async () => {
    renderTree();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    client.focus();
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });
    await screen.findByRole('treeitem', { name: /Fit-out/ });
    expect(screen.getByRole('treeitem', { name: /Northgate/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('deep-links: a plan route auto-reveals and marks its ancestor path', async () => {
    params = { planId: 'pl1' };
    renderTree();
    // Ancestors resolve (plan → project → client) and expand so the plan is visible + selected.
    const plan = await screen.findByRole('treeitem', { name: /Overall Schedule/ });
    await waitFor(() => expect(plan).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('treeitem', { name: /Northgate/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
