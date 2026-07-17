import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourceFormDialog } from './ResourceFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The resource levelling-capacity field (`maxUnitsPerHour`, ADR-0041) with `VITE_RESOURCE_LEVELLING`
 * forced ON — the surface ships dark by default, so this suite pins the flag to prove the field renders,
 * persists on create (omitted when blank), and seeds + round-trips a stored value on edit (blank clears
 * it to null). The flag-off behaviour (field hidden, seeded value still round-trips) is covered by
 * `ResourceFormDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_LEVELLING_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const RESOURCE: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: 'CRW-A',
  description: null,
  kind: 'LABOUR',
  maxUnitsPerHour: 2,
  costPerUnit: null,
  calendarId: null,
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

describe('ResourceFormDialog — levelling capacity (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(RESOURCE);
  });

  it('creates a resource carrying the entered capacity', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavator' } });
    fireEvent.change(screen.getByLabelText('Max units/hour (optional)'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Excavator',
      maxUnitsPerHour: 3,
    });
  });

  it('omits capacity on create when the field is left blank (uncapped)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Uncapped crew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('maxUnitsPerHour');
  });

  it('seeds the capacity from the row and round-trips it on save', async () => {
    renderDialog({ resource: RESOURCE });
    expect(screen.getByLabelText('Max units/hour (optional)')).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ maxUnitsPerHour: 2, version: 4 });
  });

  it('clears the capacity to null when the field is emptied on edit', async () => {
    renderDialog({ resource: RESOURCE });
    fireEvent.change(screen.getByLabelText('Max units/hour (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ maxUnitsPerHour: null, version: 4 });
  });

  it('rejects a negative capacity and makes no request', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crew' } });
    fireEvent.change(screen.getByLabelText('Max units/hour (optional)'), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    expect(await screen.findAllByText('Capacity cannot be negative.')).not.toHaveLength(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
