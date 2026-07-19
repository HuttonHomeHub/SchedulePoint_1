import type { NoteSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteThread } from './NoteThread';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch, apiFetchEnvelope } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn(), apiFetchEnvelope: vi.fn() };
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
    version: 1,
    createdAt: '2026-01-02T10:00:00Z',
    updatedAt: '2026-01-02T10:00:00Z',
    ...over,
  };
}

/** One page of the `{ data, meta }` list envelope. */
function page(notes: NoteSummary[], meta: { nextCursor: string | null; hasMore: boolean }) {
  return { data: notes, meta };
}

function renderThread(currentUserId: string | null = 'u1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <NoteThread
          orgSlug="acme"
          target={{ planId: 'pl1', activityId: null }}
          currentUserId={currentUserId}
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('NoteThread', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset();
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the loading state while the first page is in flight', () => {
    vi.mocked(apiFetchEnvelope).mockReturnValue(new Promise(() => {}));
    renderThread();
    expect(screen.getByText('Loading notes…')).toBeInTheDocument();
  });

  it('shows the empty state when there are no notes', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue(page([], { nextCursor: null, hasMore: false }));
    renderThread();
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
  });

  it('shows the error state when the thread fails to load', async () => {
    vi.mocked(apiFetchEnvelope).mockRejectedValue(new Error('boom'));
    renderThread();
    expect(await screen.findByText('Couldn’t load notes. Please try again.')).toBeInTheDocument();
  });

  it('renders notes newest-first in the server order', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue(
      page(
        [
          note({ id: 'n2', body: 'Newest', createdAt: '2026-01-03T09:00:00Z' }),
          note({ id: 'n1', body: 'Older', createdAt: '2026-01-02T09:00:00Z' }),
        ],
        { nextCursor: null, hasMore: false },
      ),
    );
    renderThread();
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByText('Newest')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Older')).toBeInTheDocument();
  });

  it('shows Edit/Delete only on the current user’s own notes', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue(
      page(
        [
          note({ id: 'mine', body: 'Mine', authorId: 'u1', authorName: 'Alex' }),
          note({ id: 'theirs', body: 'Theirs', authorId: 'u2', authorName: 'Bo' }),
        ],
        { nextCursor: null, hasMore: false },
      ),
    );
    renderThread('u1');
    const mine = (await screen.findByText('Mine')).closest('li')!;
    const theirs = screen.getByText('Theirs').closest('li')!;
    expect(within(mine).getByRole('button', { name: /^Edit note by/ })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: /^Delete note by/ })).toBeInTheDocument();
    expect(within(theirs).queryByRole('button', { name: /^Edit note by/ })).not.toBeInTheDocument();
    expect(
      within(theirs).queryByRole('button', { name: /^Delete note by/ }),
    ).not.toBeInTheDocument();
  });

  it('surfaces an "edited" marker on a revised note', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue(
      page([note({ body: 'Revised', edited: true })], { nextCursor: null, hasMore: false }),
    );
    renderThread();
    expect(await screen.findByText(/edited/)).toBeInTheDocument();
  });

  it('handles a 409 on edit: refreshes the thread and shows an "updated elsewhere" status', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue(
      page([note({ id: 'mine', body: 'Mine', authorId: 'u1' })], {
        nextCursor: null,
        hasMore: false,
      }),
    );
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    renderThread('u1');

    fireEvent.click(await screen.findByRole('button', { name: /^Edit note by/ }));
    fireEvent.change(screen.getByLabelText('Edit note'), { target: { value: 'My change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The PATCH was attempted with the optimistic version…
    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/notes/mine',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ body: 'My change', version: 1 }),
        }),
      ),
    );
    // …then the conflict status appears and the thread is refetched (a second list call).
    expect(await screen.findByText(/updated elsewhere/)).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiFetchEnvelope).mock.calls.length).toBeGreaterThan(1));
  });

  it('loads an older page via "Load more" using the cursor', async () => {
    vi.mocked(apiFetchEnvelope)
      .mockResolvedValueOnce(
        page([note({ id: 'n2', body: 'Newest' })], { nextCursor: 'c1', hasMore: true }),
      )
      .mockResolvedValueOnce(
        page([note({ id: 'n1', body: 'Older' })], { nextCursor: null, hasMore: false }),
      );
    renderThread();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Older')).toBeInTheDocument();
    // The second request carried the cursor from page one.
    expect(vi.mocked(apiFetchEnvelope).mock.calls[1]![0]).toContain('cursor=c1');
  });
});
