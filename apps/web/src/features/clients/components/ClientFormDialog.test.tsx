import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientFormDialog } from './ClientFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CLIENT: ClientSummary = {
  id: 'c1',
  name: 'Northgate',
  description: 'Retail fit-out',
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ClientFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientFormDialog orgSlug="acme" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ClientFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(CLIENT);
  });

  it('seeds the form in edit mode and PATCHes with the row version', async () => {
    renderDialog({ client: CLIENT });

    // The name is seeded from the client being edited.
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Northgate');

    fireEvent.change(name, { target: { value: 'Northgate Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/clients/c1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({ name: 'Northgate Ltd', version: 3 });
  });

  it('POSTs a new client in create mode', async () => {
    renderDialog();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('');

    fireEvent.change(name, { target: { value: 'Harbour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create client' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/clients');
    expect(init?.method).toBe('POST');
  });
});
