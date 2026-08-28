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
    criticalFloatThresholdMinutes: 0,
    totalFloatMode: 'FINISH',
    makeOpenEndsCritical: false,
    ignoreExternalRelationships: false,
    levelResources: false,
    levelWithinFloatOnly: false,
    eacMethod: 'CPI',
    currencyCode: null,
    plannedStart: null,
    calendarId: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
];

// Each level of the tree pages through its list endpoint (`apiFetchAllPages`) so a client/project/
// plan past the server's default 20-row page still appears; the single-node reads use `apiFetch`.
// One router serves both.
const route = (path: string): Promise<unknown> => {
  if (path.endsWith('/clients')) return Promise.resolve(clients);
  if (path.includes('/clients/c1/projects')) return Promise.resolve(projects);
  if (path.includes('/projects/p1/plans')) return Promise.resolve(plans);
  if (path.endsWith('/plans/pl1')) return Promise.resolve(plans[0]);
  if (path.endsWith('/projects/p1')) return Promise.resolve(projects[0]);
  return Promise.reject(new Error(`unexpected ${path}`));
};

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => route(path),
  apiFetchAllPages: (path: string) => route(path),
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

  /**
   * **#143 — the tree can open all three of ADR-0029's levels, not one.** `activate` used to
   * navigate for a plan and TOGGLE for a client or project, so the Client → Project → Plan
   * navigator could open exactly one of the things it names. The meanings are split now: the
   * NAME's click and the keyboard's Enter navigate (the APG tree's "default action"), while the
   * row's remaining surface keeps the container toggle (the Q3 case above) and the arrows keep
   * expansion. **Verified red** against the pre-fix `activate`: both cases below saw
   * `navigate` never called.
   */
  it('clicking a client name opens the client, and Enter on a project opens the project (#143)', async () => {
    renderTree();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    // The NAME navigates; the row's own click (Q3 above) still toggles.
    fireEvent.click(screen.getByText('Northgate'));
    expect(navigate).toHaveBeenCalledWith({
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug: 'acme', clientId: 'c1' },
    });

    // Enter is the keyboard's route in — expansion has its own keys, so the default action is
    // free to mean "open". Reveal the project by expanding the client first (row click), then
    // move the roving focus with the tree's OWN key (ArrowDown), not `element.focus()` — the
    // ArrowRight case above appears to prove `focus()` updates the roving model and does not:
    // its subject is the first row, which is also the model's fallback, so it passes with the
    // focus silently ignored. Driving the model through its own keys is both honest and the
    // path a keyboard user actually takes.
    navigate.mockClear();
    fireEvent.click(client);
    const project = await screen.findByRole('treeitem', { name: /Fit-out/ });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith({
      to: '/orgs/$orgSlug/projects/$projectId',
      params: { orgSlug: 'acme', projectId: 'p1' },
    });
    // And navigating did NOT also toggle the branch under the reader (stopPropagation's job on
    // the pointer path; on the keyboard path Enter simply never toggles any more).
    expect(project).toHaveAttribute('aria-expanded', 'false');
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
