import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NavigatorCrudProvider,
  type AfterDeleteSignal,
  type NavigatorCrudApi,
} from '../lib/navigator-crud-context';

import { HierarchyTree } from './HierarchyTree';

import { AnnouncerProvider } from '@/components/ui/announcer';

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
// #297's reproduction needs a child fetch held OPEN, so the tree renders its synthetic
// `loading` row and a reader can put the roving focus on it before it is replaced. Null
// (the default) keeps every other case on the immediate path it already had.
//
// #305 reuses this fixture verbatim rather than introducing its own. That is deliberate: the
// same sequence produces both defects (a stale tab stop and a dropped focus ring), so a second
// deferred-fetch harness would be a second chance to get the reproduction subtly wrong.
let holdProjects: Promise<ProjectSummary[]> | null = null;

const route = (path: string): Promise<unknown> => {
  if (path.endsWith('/clients')) return Promise.resolve(clients);
  if (path.includes('/clients/c1/projects')) return holdProjects ?? Promise.resolve(projects);
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

// A tree wrapped in the CRUD seam, so `afterDelete` can be bumped between renders. The default
// `renderTree` above leaves the seam unprovided, which yields the context's INERT value — correct
// for every other case here, and the reason `afterDelete` had no coverage at all.
let crudQueryClient: QueryClient;

function crudTree(afterDelete: AfterDeleteSignal | null): React.ReactElement {
  const api: NavigatorCrudApi = {
    canWrite: true,
    onNodeAction: () => {},
    onCreateClient: () => {},
    afterDelete,
  };
  return (
    <QueryClientProvider client={crudQueryClient}>
      <NavigatorCrudProvider value={api}>
        <HierarchyTree orgSlug="acme" />
      </NavigatorCrudProvider>
    </QueryClientProvider>
  );
}

function renderCrudTree(afterDelete: AfterDeleteSignal | null) {
  crudQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sessionStorage.clear();
  return render(crudTree(afterDelete));
}

beforeEach(() => {
  navigate.mockClear();
  params = {};
  holdProjects = null;
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

  /**
   * **#297 — a stale `focusedKey` can leave the tree with no tab stop at all.** `activeKey` is
   * `focusedKey ?? selected ?? first`, and `??` short-circuits on any non-null left side —
   * including a key no row carries any more. `isActive` is then false for EVERY row, nothing
   * gets `tabIndex={0}`, and the `role="tree"` container is itself `tabIndex={-1}`, so the
   * Project Explorer drops out of the Tab sequence entirely.
   *
   * The register row proposed reproducing this by deleting a focused row from a second session.
   * This is the same defect reached without one: a synthetic `loading` row is keyed
   * `${parentId}:loading` (`tree-model.ts:58`) and is FOCUSABLE (`role="treeitem"`,
   * `tabIndex={isActive ? 0 : -1}`), so arrowing onto a placeholder and letting its fetch resolve
   * leaves `focusedKey` naming a key that no longer exists. A slow network and an eager ArrowDown
   * is all it takes.
   *
   * **Verified red against the pre-fix derivation: 0 tab stops.**
   */
  it('keeps exactly one tab stop when a focused loading row resolves away (#297)', async () => {
    let releaseProjects!: (value: ProjectSummary[]) => void;
    holdProjects = new Promise<ProjectSummary[]>((resolve) => {
      releaseProjects = resolve;
    });

    renderTree();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(client); // expand: the child fetch is held, so a `loading` row renders

    // Drive the roving model with the tree's OWN key, not `element.focus()` — see the #143 case
    // above for why that distinction matters in this harness.
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });

    // The fetch resolves and the placeholder is replaced, so `focusedKey` now names nothing.
    releaseProjects(projects);
    await screen.findByRole('treeitem', { name: /Fit-out/ });

    const stops = screen.getAllByRole('treeitem').filter((element) => element.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  /**
   * **#305 — the tab stop is repaired and FOCUS is not.** `#297` fixed which row carries
   * `tabIndex={0}` when `focusedKey` goes stale; it deliberately did not touch where the browser's
   * focus ring is. The same sequence comes apart: the loading row genuinely holds DOM focus, it is
   * unmounted when its fetch resolves, and focus falls to `document.body`.
   *
   * `pendingFocus` cannot catch it — that effect is keyed on `focusedKey`, which does NOT change
   * here, and the row's ref was deleted on unmount, so even a re-run would call `.focus()` on
   * nothing. **WCAG 2.2 §2.4.3 Focus Order (level A)** — the citation this codebase already assigns
   * to this shape (`use-focus-handoff.ts:17`), not §2.1.1, which is `#297`'s and a different
   * failure.
   *
   * **Verified red against the pre-fix component: `activeElement` was `BODY`.**
   */
  it('hands focus back to the tree when a focused row is removed under it (#305)', async () => {
    let releaseProjects!: (value: ProjectSummary[]) => void;
    holdProjects = new Promise<ProjectSummary[]>((resolve) => {
      releaseProjects = resolve;
    });

    renderTree();
    const client = await screen.findByRole('treeitem', { name: /Northgate/ });
    fireEvent.click(client); // expand: the child fetch is held, so a `loading` row renders

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
    // The placeholder really does hold focus — asserted, because if it does not then the case
    // below proves nothing about a row being removed from under a focus ring (the ADR-0093 shape).
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('aria-disabled', 'true');
    });

    releaseProjects(projects);
    await screen.findByRole('treeitem', { name: /Fit-out/ });

    // Focus must not be left on `<body>`. The tree container is the destination the shared
    // hand-off mechanism uses, so the reader's next Tab or arrow key still reaches the diagram.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
    expect(screen.getByRole('tree')).toContainElement(document.activeElement as HTMLElement);
  });

  /**
   * **#305 route 2 — `afterDelete`'s root branch, and the reason it needs a stub to test at all.**
   *
   * Deleting a root-level client makes `afterDelete.parentId` null, so `HierarchyTree` re-homes
   * focus onto the tree container rather than a parent row. The container is permanently
   * `tabIndex={-1}` and carries no `onFocus`, so `focusedKey` never re-syncs — which is what #305
   * raised as a mismatch between the focus ring and the row holding the tab stop.
   *
   * **Post-#297 that mismatch can no longer name a row that is gone**, because `resolvedFocusedKey`
   * drops a `focusedKey` absent from `rows` before it reaches the fallback chain. This case pins
   * both halves of that claim: focus lands on something real, and exactly one row still carries the
   * tab stop. It is the evidence for the docblock's "benign residual" — which was a conclusion
   * asserted from reading before this existed, and #305 itself does not say it.
   *
   * **The stub is load-bearing, and finding out why corrected the claim.** The effect is guarded on
   * `target.offsetParent !== null` so the off-screen rail instance cannot fight the visible one for
   * focus — and jsdom performs no layout, so `offsetParent` is `null` for every attached element
   * (asserted directly before writing this). Without the stub the whole branch is INERT under
   * jsdom: a test would pass while exercising nothing, which is the shape this suite's own #305
   * case guards against one defect along.
   */
  it('re-homes focus to the tree when a root delete removes the focused row (#305 route 2)', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(): Element {
        return document.body;
      },
    });

    try {
      const { rerender } = renderCrudTree(null);
      const client = await screen.findByRole('treeitem', { name: /Northgate/ });

      fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
      await waitFor(() => expect(document.activeElement).toBe(client));

      rerender(crudTree({ seq: 1, parentId: null }));

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('tree'));
      });
      // The tab stop stays coherent: `resolvedFocusedKey` resolves a key naming a gone row away,
      // so the chain falls through to a real row instead of leaving the tree with none (#297).
      const stops = screen
        .getAllByRole('treeitem')
        .filter((row) => row.getAttribute('tabindex') === '0');
      expect(stops).toHaveLength(1);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    }
  });

  /**
   * **ADR-0029 §202-203's lazy-load announcement — specified, never built, now built**
   * (`docs/TECH_DEBT.md` #307(b)). Before this the only way a keyboard or AT user learnt an
   * expansion had resolved was to be standing on the placeholder when it vanished.
   *
   * **The `offsetParent` stub is load-bearing and the reason is the same as the #305 route-2 case
   * above.** Only the VISIBLE rail may speak — the shell mounts two trees sharing one expansion
   * set — and the discriminator is a layout box, which jsdom does not have. Without the stub this
   * assertion tests nothing, because no instance would ever announce.
   *
   * Asserted through a real `AnnouncerProvider`, not a spy on `useAnnounce`: the live region's
   * text is what a reader actually receives, and `announce` clears then sets inside a
   * `requestAnimationFrame` (`announcer.tsx:16-19`), so a spy would pass on a message that never
   * reached the DOM.
   */
  it('announces a lazy-load outcome with its count (#307)', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(): Element {
        return document.body;
      },
    });

    try {
      let releaseProjects!: (value: ProjectSummary[]) => void;
      holdProjects = new Promise<ProjectSummary[]>((resolve) => {
        releaseProjects = resolve;
      });

      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      sessionStorage.clear();
      render(
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <HierarchyTree orgSlug="acme" />
          </AnnouncerProvider>
        </QueryClientProvider>,
      );

      fireEvent.click(await screen.findByRole('treeitem', { name: /Northgate/ }));
      // Nothing is announced while it is still in flight — the placeholder is the visible signal.
      expect(screen.getByTestId('announcer')).toHaveTextContent('');

      releaseProjects(projects);
      await screen.findByRole('treeitem', { name: /Fit-out/ });

      await waitFor(() => {
        expect(screen.getByTestId('announcer')).toHaveTextContent('1 project loaded.');
      });
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    }
  });

  /**
   * **The loading→settled EDGE, which the case above does not pin** (`docs/TECH_DEBT.md` #307(b)).
   *
   * Found by mutation rather than by design: replacing `previous.get(id) === 'loading' && settled`
   * with a bare `settled` left the whole suite green. That defect matters — a group that is merely
   * still loaded would re-announce on every background refetch, so a planner leaving the rail open
   * would hear "1 project loaded" repeatedly with nothing having changed.
   *
   * Collapsing and re-expanding is the cheapest way to reach it: the second expansion is served
   * from the query cache, so the group never returns to `loading` and must therefore say nothing.
   */
  it('does not re-announce a group that never returned to loading (#307)', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(): Element {
        return document.body;
      },
    });

    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      sessionStorage.clear();
      render(
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <HierarchyTree orgSlug="acme" />
          </AnnouncerProvider>
        </QueryClientProvider>,
      );

      // Load the client's projects, then the project's plans, so the live region's last message is
      // about PLANS. That is what makes the absence of a second projects announcement observable:
      // the region keeps its last text, so "nothing was said" cannot be asserted as emptiness.
      fireEvent.click(await screen.findByRole('treeitem', { name: /Northgate/ }));
      const project = await screen.findByRole('treeitem', { name: /Fit-out/ });
      await waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('1 project loaded.'),
      );
      fireEvent.click(project);
      await screen.findByRole('treeitem', { name: /Overall Schedule/ });
      await waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('1 plan loaded.'),
      );

      // Collapse the project first, so only the CLIENT's group is in play on the re-expansion and
      // the assertion cannot be satisfied by a plans announcement landing last.
      fireEvent.click(screen.getByRole('treeitem', { name: /Fit-out/ }));
      fireEvent.click(screen.getByRole('treeitem', { name: /Northgate/ }));
      await waitFor(() =>
        expect(screen.queryByRole('treeitem', { name: /Fit-out/ })).not.toBeInTheDocument(),
      );

      // Re-expand: the projects are cached, so the group never returns to `loading` and must say
      // nothing. Broken (a bare `settled` test) this announces "1 project loaded." again.
      fireEvent.click(screen.getByRole('treeitem', { name: /Northgate/ }));
      await screen.findByRole('treeitem', { name: /Fit-out/ });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      expect(screen.getByTestId('announcer')).toHaveTextContent('1 plan loaded.');
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    }
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
