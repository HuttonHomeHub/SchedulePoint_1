import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigatorCrud } from './navigator-crud';

import { AnnouncerProvider } from '@/components/ui/announcer';
import {
  useNavigatorCrud,
  type NodeActionTarget,
  type UseExpansionState,
} from '@/features/navigator';
import { apiFetch } from '@/lib/api/client';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CLIENT: ClientSummary = {
  id: 'c1',
  name: 'Northgate',
  description: null,
  version: 4,
  createdAt: '',
  updatedAt: '',
};

const clientTarget: NodeActionTarget = {
  kind: 'client',
  id: 'c1',
  name: 'Northgate',
  parentId: null,
};
const planTarget: NodeActionTarget = {
  kind: 'plan',
  id: 'pl1',
  name: 'Overall Schedule',
  parentId: 'p1',
};

const expandPath = vi.fn();
const expansion: UseExpansionState = {
  expanded: new Set(),
  isExpanded: () => false,
  toggle: vi.fn(),
  expand: vi.fn(),
  collapse: vi.fn(),
  expandPath,
};

/** A synthetic tree that fires CRUD intents and surfaces the afterDelete signal. */
function Consumer(): React.ReactElement {
  const crud = useNavigatorCrud();
  return (
    <div>
      <button onClick={() => crud.onNodeAction('delete', clientTarget)}>del-client</button>
      <button onClick={() => crud.onNodeAction('delete', planTarget)}>del-plan</button>
      <button onClick={() => crud.onNodeAction('rename', clientTarget)}>rename-client</button>
      <button onClick={() => crud.onCreateClient()}>create-client</button>
      <span data-testid="after-seq">{crud.afterDelete?.seq ?? 'none'}</span>
    </div>
  );
}

function renderCoordinator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AnnouncerProvider>
        <NavigatorCrud orgSlug="acme" canWrite expansion={expansion}>
          <Consumer />
        </NavigatorCrud>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('NavigatorCrud coordinator', () => {
  beforeEach(() => {
    navigate.mockClear();
    expandPath.mockClear();
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
  });

  it('confirms a client delete with cascade copy, calls DELETE, and re-homes focus', async () => {
    renderCoordinator();
    fireEvent.click(screen.getByText('del-client'));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete client' });
    expect(dialog).toHaveTextContent(
      'Delete “Northgate” and all its projects and plans? You can restore it later.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/clients/c1', { method: 'DELETE' }),
    );
    // afterDelete bumped so the tree can move focus (client → tree container).
    await waitFor(() => expect(screen.getByTestId('after-seq')).toHaveTextContent('1'));
  });

  it('uses plan-scoped copy (no cascade) for a plan delete', () => {
    renderCoordinator();
    fireEvent.click(screen.getByText('del-plan'));
    expect(screen.getByRole('alertdialog', { name: 'Delete plan' })).toHaveTextContent(
      'Delete “Overall Schedule”? You can restore it later.',
    );
  });

  it('opens the create-client dialog from the root affordance', () => {
    renderCoordinator();
    fireEvent.click(screen.getByText('create-client'));
    expect(screen.getByRole('heading', { name: 'New client' })).toBeInTheDocument();
  });

  it('seeds the rename dialog from the cached client summary', async () => {
    vi.mocked(apiFetch).mockResolvedValue([CLIENT]);
    renderCoordinator();
    fireEvent.click(screen.getByText('rename-client'));

    // The edit dialog resolves the summary (with its version) from the list query.
    expect(await screen.findByRole('heading', { name: 'Edit client' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Northgate');
  });
});
