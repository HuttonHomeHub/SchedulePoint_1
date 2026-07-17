import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { NavigatorCrudProvider, type NavigatorCrudApi } from '../lib/navigator-crud-context';

import { HierarchyTree } from './HierarchyTree';

// Same virtualizer / router / api stubs as HierarchyTree.test.tsx — pass-through render.
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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

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
    totalFloatMode: 'FINISH',
    makeOpenEndsCritical: false,
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
    return Promise.reject(new Error(`unexpected ${path}`));
  },
}));

function renderTree(crud: Partial<NavigatorCrudApi>) {
  const api: NavigatorCrudApi = {
    canWrite: false,
    onNodeAction: vi.fn(),
    onCreateClient: vi.fn(),
    afterDelete: null,
    ...crud,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sessionStorage.clear();
  const result = render(
    <QueryClientProvider client={client}>
      <NavigatorCrudProvider value={api}>
        <HierarchyTree orgSlug="acme" />
      </NavigatorCrudProvider>
    </QueryClientProvider>,
  );
  return { api, container: result.container };
}

describe('HierarchyTree — in-tree CRUD', () => {
  beforeEach(() => sessionStorage.clear());

  it('shows no write affordances to a non-writer', async () => {
    renderTree({ canWrite: false });
    await screen.findByRole('treeitem', { name: /Northgate/ });
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    // Right-click also does nothing for a non-writer.
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Northgate/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a client menu from the "⋯" button with the right actions', async () => {
    renderTree({ canWrite: true });
    await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Northgate' }));

    const menu = screen.getByRole('menu');
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toEqual(['New project', 'Rename', 'Delete']);
  });

  it('dispatches the chosen action with the target node', async () => {
    const { api } = renderTree({ canWrite: true });
    await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Northgate' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New project' }));

    expect(api.onNodeAction).toHaveBeenCalledWith('create-project', {
      kind: 'client',
      id: 'c1',
      name: 'Northgate',
      parentId: null,
    });
  });

  it('opens the menu on right-click at the pointer', async () => {
    renderTree({ canWrite: true });
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.contextMenu(client, { clientX: 120, clientY: 60 });
    expect(screen.getByRole('menu', { name: 'Actions for Northgate' })).toBeInTheDocument();
  });

  it('opens the menu on a touch long-press of the row (non-hover path)', async () => {
    renderTree({ canWrite: true });
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.pointerDown(client, { pointerType: 'touch', clientX: 30, clientY: 30 });
    await waitFor(
      () => expect(screen.getByRole('menu', { name: 'Actions for Northgate' })).toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('opens the menu with the ContextMenu key on the focused row', async () => {
    renderTree({ canWrite: true });
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    client.focus();
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ContextMenu' });
    expect(screen.getByRole('menu', { name: 'Actions for Northgate' })).toBeInTheDocument();
  });

  it('offers only rename/delete on a plan leaf', async () => {
    renderTree({ canWrite: true });
    fireEvent.click(await screen.findByRole('treeitem', { name: /Northgate/ }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Fit-out/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Overall Schedule' }));
    const items = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toEqual(['Rename', 'Delete']);
  });

  it('the tree with row-action triggers visible has no axe violations', async () => {
    const { container } = renderTree({ canWrite: true });
    await screen.findByRole('treeitem', { name: /Northgate/ });
    // Rows + their "⋯" triggers rendered together (menu closed).
    expect((await axe(container)).violations).toEqual([]);
  });

  it('the open menu has no axe violations', async () => {
    renderTree({ canWrite: true });
    await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Northgate' }));
    expect((await axe(screen.getByRole('menu'))).violations).toEqual([]);
  });
});
