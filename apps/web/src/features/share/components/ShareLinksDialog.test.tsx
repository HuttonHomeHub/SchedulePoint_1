import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreatedShare, ShareLink } from '../api/use-shares';

import { ShareLinksDialog } from './ShareLinksDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { formatTimestamp } from '@/lib/format-date';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const SHARES_PATH = '/organizations/acme/plans/plan-1/shares';

function link(over: Partial<ShareLink> = {}): ShareLink {
  return {
    id: 's1',
    planId: 'plan-1',
    label: 'Client review – Acme',
    active: true,
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...over,
  };
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShareLinksDialog orgSlug="acme" planId="plan-1" open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

/** Route the mocked `apiFetch` by (path, method) so list/create/revoke can be stubbed independently. */
function mockApi(handlers: {
  list?: () => ShareLink[] | Promise<ShareLink[]>;
  create?: () => CreatedShare | Promise<CreatedShare>;
  revoke?: () => void | Promise<void>;
}) {
  vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path === SHARES_PATH && method === 'GET') return Promise.resolve(handlers.list?.() ?? []);
    if (path === SHARES_PATH && method === 'POST') {
      return Promise.resolve(handlers.create?.());
    }
    if (path.startsWith(`${SHARES_PATH}/`) && method === 'DELETE') {
      return Promise.resolve(handlers.revoke?.());
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
}

describe('ShareLinksDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the empty state when a plan has no links', async () => {
    mockApi({ list: () => [] });
    renderDialog();
    expect(await screen.findByText(/No share links yet/)).toBeInTheDocument();
  });

  it('lists existing links with their state', async () => {
    mockApi({
      list: () => [
        link({ label: 'Owner rep' }),
        link({ id: 's2', revokedAt: '2026-07-02T00:00:00.000Z' }),
      ],
    });
    renderDialog();
    expect(await screen.findByText('Owner rep')).toBeInTheDocument();
    // The revoked row is badged (and its actions cell also reads "Revoked").
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
  });

  it('renders a link with an expiry instant without crashing (formatTimestamp, not formatCalendarDate)', async () => {
    // `expiresAt` is a full ISO-8601 instant (server `.toISOString()`); `formatCalendarDate` would throw
    // `RangeError: Invalid time value` on it, so the Expires cell must use the instant formatter.
    const expiresAt = '2026-06-15T12:00:00.000Z';
    mockApi({ list: () => [link({ label: 'Expiring link', expiresAt })] });
    renderDialog();
    expect(await screen.findByText('Expiring link')).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp(expiresAt))).toBeInTheDocument();
  });

  it('surfaces a list error state', async () => {
    mockApi({ list: () => Promise.reject(new Error('boom')) });
    renderDialog();
    expect(await screen.findByText(/Couldn’t load share links/)).toBeInTheDocument();
  });

  it('creates a link and shows the one-time URL with a Copy button', async () => {
    const created: CreatedShare = {
      url: 'https://app.example/share#sp_share_TOKEN123',
      share: link({ id: 's9', label: 'New link' }),
    };
    mockApi({ list: () => [], create: () => created });
    renderDialog();
    await screen.findByText(/No share links yet/);

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'New link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    // The one-time URL surfaces in a read-only field + a Copy button.
    const urlField = await screen.findByLabelText<HTMLInputElement>('Guest link');
    expect(urlField.value).toBe(created.url);
    const copyBtn = screen.getByRole('button', { name: 'Copy link' });
    fireEvent.click(copyBtn);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(created.url));
  });

  it('validates that an expiry more than a year out is rejected (no request sent)', async () => {
    mockApi({ list: () => [] });
    renderDialog();
    await screen.findByText(/No share links yet/);
    const tenYears = `${new Date().getFullYear() + 10}-01-01`;
    fireEvent.change(screen.getByLabelText('Expires (optional)'), { target: { value: tenYears } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText(/at most a year out/)).toBeInTheDocument();
    // Only the initial list GET fired — no POST.
    expect(
      vi.mocked(apiFetch).mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET'),
    ).toBe(true);
  });

  it('revokes a link through the confirm dialog', async () => {
    const revoke = vi.fn();
    mockApi({ list: () => [link({ label: 'Owner rep' })], revoke });
    renderDialog();
    await screen.findByText('Owner rep');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Owner rep' }));
    // The confirm alertdialog appears; confirm it.
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    const deleteCall = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(deleteCall?.[0]).toBe(`${SHARES_PATH}/s1`);
  });

  it('surfaces the past-expiry 422 as a friendly message', async () => {
    mockApi({
      list: () => [],
      create: () =>
        Promise.reject(
          new ApiFetchError(422, {
            code: 'VALIDATION_FAILED',
            message: 'The expiry must be in the future.',
            details: { reason: 'SHARE_EXPIRY_IN_PAST' },
          }),
        ),
    });
    renderDialog();
    await screen.findByText(/No share links yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText(/expiry date must be in the future/)).toBeInTheDocument();
  });
});
