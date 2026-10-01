import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourceFormDialog } from './ResourceFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const RESOURCE: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: 'CRW-A',
  description: null,
  kind: 'LABOUR',
  parentId: null,
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  archivedAt: null,
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ResourceFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourceFormDialog orgSlug="acme" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ResourceFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(RESOURCE);
  });

  it('POSTs a new resource in create mode with name and kind', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavator' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'EQUIPMENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/resources');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Excavator',
      kind: 'EQUIPMENT',
    });
  });

  /**
   * **#420's structural property.** A passive `reset()` runs after the field is on screen, so a
   * fast typist's text could be wiped by it. Layout effects run before any passive effect, which
   * makes a layout-phase probe the one place a test can see the value the field is *born* with,
   * and a value placed there stands in for a keystroke that beat the effect.
   */
  it('is born holding the edited resource’s name, not seeded by a later effect', () => {
    const born: string[] = [];
    function Probe(): null {
      useLayoutEffect(() => {
        const input = document.querySelector<HTMLInputElement>('input[name="name"]');
        if (input) born.push(input.value);
      }, []);
      return null;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResourceFormDialog orgSlug="acme" open onClose={vi.fn()} resource={RESOURCE} />
        <Probe />
      </QueryClientProvider>,
    );

    expect(born).toEqual(['Crew A']);
  });

  it('keeps text entered before the first passive effects run in create mode', () => {
    function Probe(): null {
      useLayoutEffect(() => {
        document.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Typed early';
      }, []);
      return null;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResourceFormDialog orgSlug="acme" open onClose={vi.fn()} />
        <Probe />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Typed early');
  });

  it('rejects an empty name with a validation error and makes no request', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    expect(await screen.findAllByText('Name is required.')).not.toHaveLength(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('seeds the form in edit mode and PATCHes with the row version', async () => {
    renderDialog({ resource: RESOURCE });

    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Crew A');
    fireEvent.change(name, { target: { value: 'Crew Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/resources/res-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({ name: 'Crew Alpha', version: 4 });
  });

  it('renders read-only for a reader: no save affordance', () => {
    renderDialog({ resource: RESOURCE, readOnly: true });
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
