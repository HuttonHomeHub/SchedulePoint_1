import type { DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditDependencyDialog } from './EditDependencyDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const DEP: DependencySummary = {
  id: 'd1',
  planId: 'pl1',
  type: 'FS',
  lagDays: 3,
  lagCalendar: 'PROJECT_DEFAULT',
  predecessor: { id: 'a1', code: null, name: 'Excavate' },
  successor: { id: 'b1', code: null, name: 'Pour slab' },
  isDriving: false,
  version: 5,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EditDependencyDialog orgSlug="acme" dependency={DEP} open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('EditDependencyDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(DEP);
  });

  it('seeds type/lag and PATCHes with the row version', async () => {
    renderDialog();
    expect(screen.getByLabelText('Type')).toHaveValue('FS');
    expect(screen.getByLabelText(/Lag \(working days/)).toHaveValue(3);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'FF' } });
    fireEvent.change(screen.getByLabelText(/Lag \(working days/), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/dependencies/d1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      type: 'FF',
      lagDays: -1,
      lagCalendar: 'PROJECT_DEFAULT',
      version: 5,
    });
  });
});
