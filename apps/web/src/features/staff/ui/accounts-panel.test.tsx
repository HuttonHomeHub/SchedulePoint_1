import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffAccounts } from '@/features/staff/api/staff-panels';
import { AccountsPanel } from '@/features/staff/ui/accounts-panel';

const apiFetch = vi.fn<(path: string) => Promise<StaffAccounts>>();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => apiFetch(path),
}));

const announce = vi.fn<(message: string) => void>();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

const row = (n: number) => ({
  id: `acc-${String(n)}`,
  email: `person${String(n)}@example.test`,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const PAGE_1: StaffAccounts = {
  unverifiedTotal: 3,
  unverified: [row(1), row(2)],
  hasMore: true,
  nextCursor: 'c2',
};
// Row 2 repeats: a cursor page is a position in a list other people are changing.
const PAGE_2: StaffAccounts = {
  unverifiedTotal: 3,
  unverified: [row(2), row(3)],
  hasMore: false,
  nextCursor: null,
};

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccountsPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  announce.mockReset();
});

describe('AccountsPanel paging (M1-T1)', () => {
  it('reads one page on load, and appends the next without losing focus or the first rows', async () => {
    // Held, so the loading state is observable rather than a race against a resolved promise.
    let release: (page: StaffAccounts) => void = () => undefined;
    apiFetch.mockResolvedValueOnce(PAGE_1).mockReturnValueOnce(
      new Promise<StaffAccounts>((resolve) => {
        release = resolve;
      }),
    );
    mount();

    const button = await screen.findByRole('button', { name: 'Show more' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenLastCalledWith('/staff/accounts');

    button.focus();
    fireEvent.click(button);

    // Shaded with its reason while the page loads — and still the same element, still focused.
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
    expect(button).toHaveTextContent('Loading more accounts…');
    expect(document.activeElement).toBe(button);
    release(PAGE_2);
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });
    expect(apiFetch).toHaveBeenLastCalledWith('/staff/accounts?cursor=c2');

    await screen.findByText('person3@example.test');
    // Verified red against the per-cursor query: the button was replaced by a spinner (focus fell to
    // <body>) and the first page's rows were gone.
    expect(screen.getByText('person1@example.test')).toBeInTheDocument();
    expect(screen.getByText('person2@example.test')).toBeInTheDocument();
    // De-duplicated by id: three rows, not four.
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3);

    // The end state is plain text, not a shaded button, and the press that reached it handed focus
    // to that text rather than dropping it to <body> (ADR-0135).
    const end = screen.getByText('All 3 are shown.');
    expect(end.tagName).toBe('P');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(end);
    expect(announce).toHaveBeenCalledWith('Showing 3 of 3 unconfirmed accounts.');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('shows no button at all when the first page is the whole list', async () => {
    apiFetch.mockResolvedValueOnce({ ...PAGE_2, unverified: [row(3)] });
    mount();
    await screen.findByText('person3@example.test');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the rows and says so when a later page fails', async () => {
    apiFetch.mockResolvedValueOnce(PAGE_1).mockRejectedValueOnce(new Error('boom'));
    mount();
    const button = await screen.findByRole('button', { name: 'Show more' });
    fireEvent.click(button);
    await screen.findByText(/load more accounts/);
    expect(screen.getByText('person1@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
