import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteComposer } from './NoteComposer';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

function renderComposer(activityId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <NoteComposer orgSlug="acme" target={{ planId: 'pl1', activityId }} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('NoteComposer', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it('disables the submit while empty and posts a trimmed body on submit', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    renderComposer();

    const submit = screen.getByRole('button', { name: 'Add note' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Add a note'), {
      target: { value: '  Poured slab today  ' },
    });
    expect(submit).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(submit);

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/plans/pl1/notes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ body: 'Poured slab today' }),
        }),
      ),
    );
    // Clears + announces on success.
    await waitFor(() => expect(screen.getByLabelText('Add a note')).toHaveValue(''));
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Note added.'));
  });

  it('posts an activity note to the activity endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    renderComposer('act1');
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'Rebar delayed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/activities/act1/notes',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('rejects a whitespace-only body with a validation message and never posts', async () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: '     ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Enter a note.')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it('disables the submit and flags the count when over the 5000-char limit', () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'x'.repeat(5001) } });
    const submit = screen.getByRole('button', { name: 'Add note' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    // The char cue turns destructive once over the limit (text carries the state, not colour alone).
    expect(screen.getByText(/\/ 5,000/)).toHaveClass('text-destructive-text');
  });
});
