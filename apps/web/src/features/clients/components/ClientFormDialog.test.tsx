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

  /**
   * **What the structural gate cannot see.** `submit-guard.structural.test.ts` proves the native
   * `disabled` attribute is absent and that the `aria-disabled:` class pair is present; neither
   * says the guard *works*, and the guard is the whole reason the native attribute could be given
   * up. react-hook-form's `handleSubmit` has no re-entrancy guard of its own, so without the
   * `onClick` `preventDefault` a second press while the first request is in flight sends a second
   * create — two clients from one form.
   *
   * It also asserts the property the swap was made FOR: focus does not move. A native `disabled`
   * submit is removed from the tab order the instant the request starts, throwing a keyboard user
   * to `<body>` and back twice per save (`docs/TECH_DEBT.md` #17a).
   */
  it('takes one press per save, and keeps focus while the request is in flight', async () => {
    let settle: (value: ClientSummary) => void = () => {};
    vi.mocked(apiFetch)
      .mockReset()
      .mockReturnValue(
        new Promise<ClientSummary>((resolve) => {
          settle = resolve;
        }),
      );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Harbour' } });

    const submit = screen.getByRole('button', { name: 'Create client' });
    submit.focus();
    fireEvent.click(submit);

    // In flight: the label changes, the button announces itself as blocked, and it is STILL the
    // focused element — which a natively disabled button could not be.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument(),
    );
    const pending = screen.getByRole('button', { name: 'Saving…' });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(pending).not.toBeDisabled();
    expect(document.activeElement).toBe(pending);

    // The second press is the one a real user makes when nothing appears to have happened.
    fireEvent.click(pending);
    fireEvent.click(pending);
    settle(CLIENT);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
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
