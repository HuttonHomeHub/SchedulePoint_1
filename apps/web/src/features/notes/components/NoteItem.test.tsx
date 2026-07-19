import type { NoteSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteItem } from './NoteItem';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

function note(over: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'n1',
    entityType: 'PLAN',
    planId: 'pl1',
    activityId: null,
    body: 'A note',
    authorId: 'u1',
    authorName: 'Alex',
    edited: false,
    version: 3,
    createdAt: '2026-01-02T10:00:00Z',
    updatedAt: '2026-01-02T10:00:00Z',
    ...over,
  };
}

function renderItem(props: Partial<Parameters<typeof NoteItem>[0]> = {}): {
  onThreadStale: ReturnType<typeof vi.fn>;
  onFocusRegion: ReturnType<typeof vi.fn>;
} {
  const onThreadStale = vi.fn();
  const onFocusRegion = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <ul>
          <NoteItem
            orgSlug="acme"
            target={{ planId: 'pl1', activityId: null }}
            note={note()}
            position={1}
            currentUserId="u1"
            onThreadStale={onThreadStale}
            onFocusRegion={onFocusRegion}
            {...props}
          />
        </ul>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  return { onThreadStale, onFocusRegion };
}

describe('NoteItem', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('deletes on confirm: announces, and hands focus to the region sink (the row unmounts)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { onFocusRegion } = renderItem();

    fireEvent.click(screen.getByRole('button', { name: /^Delete note 1 by/ }));
    // The confirm dialog's own "Delete" button (exact name), not the row's "Delete note 1 by …".
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/notes/n1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(onFocusRegion).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Note deleted.'));
  });

  it('surfaces a 403 on delete as an in-dialog error (keeps the note)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(403, { code: 'FORBIDDEN', message: 'You can no longer delete this note.' }),
    );
    const { onFocusRegion } = renderItem();

    fireEvent.click(screen.getByRole('button', { name: /^Delete note 1 by/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can no longer delete this note.',
    );
    // The row is still present and focus was not moved (nothing unmounted).
    expect(onFocusRegion).not.toHaveBeenCalled();
    expect(screen.getByText('A note')).toBeInTheDocument();
  });

  it('on a 403 while editing, refreshes the thread, shows the reason, and moves focus off the vanishing Edit button', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(403, { code: 'FORBIDDEN', message: 'not the author' }),
    );
    const { onThreadStale, onFocusRegion } = renderItem();

    fireEvent.click(screen.getByRole('button', { name: /^Edit note 1 by/ }));
    fireEvent.change(screen.getByLabelText('Edit note'), { target: { value: 'My change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The reason is announced as a status, the thread refetches, and focus goes to the region sink
    // rather than the Edit button that unmounts once authorship is lost (SC 2.4.3).
    expect(await screen.findByText('You can no longer edit this note.')).toBeInTheDocument();
    await waitFor(() => expect(onThreadStale).toHaveBeenCalledOnce());
    expect(onFocusRegion).toHaveBeenCalledOnce();
  });
});
