import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateResourceButton } from './CreateResourceButton';

import type * as ApiClient from '@/lib/api/client';
import { apiFetchAllPages } from '@/lib/api/client';

/**
 * **The create dialog's Group picker must be able to offer a group.**
 *
 * `ResourcesTable` threaded its loaded library into the EDIT dialog and this host passed nothing
 * to the same component, so on the create path the picker rendered, looked correct, and could only
 * ever say "No group (top level)" — a resource could not be filed into a group at the moment it
 * was created, only by editing it afterwards. One correct pattern applied to one neighbour and not
 * the other (ADR-0064 §7), found by the ADR-0097 F1 coarse-pointer harness, which refused to
 * report an option count of 1 as a measurement.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

const GROUP: ResourceSummary = {
  id: 'grp',
  name: 'Groundworks',
  code: null,
  description: null,
  kind: 'GROUP',
  parentId: null,
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('CreateResourceButton', () => {
  beforeEach(() => {
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([GROUP]);
  });

  function renderButton(): void {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CreateResourceButton orgSlug="acme" />
      </QueryClientProvider>,
    );
  }

  it("offers the organisation's groups in the new resource's parent picker", async () => {
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'New resource' }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Show groups' }));

    const listbox = screen.getByRole('listbox', { name: 'Show groups' });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Groundworks/ })).toBeInTheDocument(),
    );
    // The empty option alone is the defect: a picker that can only decline.
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('asks only for groups — the screen filters do not narrow what the picker can offer', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'New resource' }));

    await waitFor(() => expect(apiFetchAllPages).toHaveBeenCalled());
    const url = vi.mocked(apiFetchAllPages).mock.calls[0]?.[0];
    expect(String(url)).toContain('kind=GROUP');
  });
});
