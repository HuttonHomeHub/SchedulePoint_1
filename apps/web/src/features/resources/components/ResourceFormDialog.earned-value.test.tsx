import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourceFormDialog } from './ResourceFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The resource cost-rate field (`costPerUnit`, EV4b / ADR-0042) with `VITE_EARNED_VALUE` forced ON —
 * the surface ships dark by default, so this suite pins the flag to prove the field renders, converts
 * MAJOR-unit entry to minor units on submit (omitted when blank), and seeds + round-trips a stored
 * value on edit (blank clears it to null). Flag-off behaviour (field hidden, seeded value still
 * round-trips) is covered by `ResourceFormDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EARNED_VALUE_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const RESOURCE: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: 'CRW-A',
  description: null,
  kind: 'LABOUR',
  maxUnitsPerHour: null,
  // 1250 minor units = 12.50 major units.
  costPerUnit: 1250,
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

describe('ResourceFormDialog — cost rate (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(RESOURCE);
  });

  it('creates a resource carrying the entered rate as minor units (×100)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavator' } });
    fireEvent.change(screen.getByLabelText('Cost per unit (optional)'), {
      target: { value: '12.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Excavator',
      costPerUnit: 1250,
    });
  });

  it('omits the rate on create when the field is left blank', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rate-less' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('costPerUnit');
  });

  it('seeds the rate (minor → major) from the row and round-trips it on save', async () => {
    renderDialog({ resource: RESOURCE });
    expect(screen.getByLabelText('Cost per unit (optional)')).toHaveValue(12.5);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ costPerUnit: 1250, version: 4 });
  });

  it('clears the rate to null when the field is emptied on edit', async () => {
    renderDialog({ resource: RESOURCE });
    fireEvent.change(screen.getByLabelText('Cost per unit (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ costPerUnit: null, version: 4 });
  });

  it('rejects a negative rate and makes no request', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crew' } });
    fireEvent.change(screen.getByLabelText('Cost per unit (optional)'), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    expect(await screen.findAllByText('Cost cannot be negative.')).not.toHaveLength(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
