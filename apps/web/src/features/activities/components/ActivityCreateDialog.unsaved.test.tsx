import { type ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

/**
 * **Creation asks before discarding** (unsaved-work guard, M5 gate pass).
 *
 * The first version of this milestone registered the create dialog with the navigation guard and
 * stopped there — which covers a reload, a tab close and a browser navigation, and covers **none**
 * of Escape, the backdrop or Cancel, because those never leave the page. So a form collecting
 * twenty-odd fields across four scopes was guarded against the rare exits and not the commonest
 * one. The plan had said in as many words that the two halves must ship together; the ux review
 * found that they had not.
 */
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function mount(onClose = vi.fn()) {
  const view = render(
    <QueryClientProvider client={client()}>
      <ActivityCreateDialog
        open
        onClose={onClose}
        orgSlug="acme"
        planId="plan-1"
        planActivities={[] as ActivitySummary[]}
      />
    </QueryClientProvider>,
  );
  return { ...view, onClose };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response),
    ),
  );
});

describe('the new-activity dialog asks before discarding', () => {
  it('closes without asking when nothing has been typed', async () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    // The other half of the guard: over-warning is what gets a confirmation dismissed unread.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('asks before discarding a filled-in field, and names the scope', async () => {
    const { onClose } = mount();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Excavate' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Verified red against the version that registered for navigation only: Cancel called onClose
    // outright and the typed work went in silence.
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('alertdialog', { name: /discard unsaved changes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/General has unsaved changes/i)).toBeInTheDocument();
  });

  it('keeps the typed work when the reader keeps editing', async () => {
    const { onClose } = mount();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Excavate' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /keep editing/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>(/^Name/).value).toBe('Excavate');
  });

  it('discards when that is what the reader chose', async () => {
    const { onClose } = mount();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Excavate' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^discard$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
