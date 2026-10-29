import type { ActivityHistoryEntry } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ActivityHistoryPanel } from './ActivityHistoryPanel';

import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetchEnvelope: vi.fn(), apiFetch: vi.fn(), apiFetchAllPages: vi.fn() };
});

function entry(over: Partial<ActivityHistoryEntry> = {}): ActivityHistoryEntry {
  return {
    id: 'e1',
    actor: { id: 'u1', name: 'Jane Smith' },
    scope: 'DEFINITION',
    firstRecordedAt: '2026-10-02T14:32:00.000Z',
    lastRecordedAt: '2026-10-02T14:32:00.000Z',
    editCount: 1,
    batch: null,
    origin: null,
    changes: { durationMinutes: { from: 2400, to: 4320 } },
    ...over,
  };
}

const META = { nextCursor: null, hasMore: false, recordingSince: '2026-10-03T08:00:00.000Z' };

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityHistoryPanel
        orgSlug="acme"
        planId="p1"
        activityId="a1"
        activityCreatedAt="2026-09-01T00:00:00.000Z"
        context={{ hoursPerDay: 8, currencyCode: null }}
      />
    </QueryClientProvider>,
  );
}

describe('ActivityHistoryPanel', () => {
  beforeEach(() => vi.mocked(apiFetchEnvelope).mockReset());

  it('shows the loading state while the first page is in flight', async () => {
    // Settled at the end rather than left pending: a query still in flight at teardown holds the
    // suite's cleanup open.
    let settle: (value: { data: ActivityHistoryEntry[]; meta: typeof META }) => void = () => {};
    vi.mocked(apiFetchEnvelope).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { container } = renderPanel();
    expect(screen.getByText('Loading history…')).toBeInTheDocument();
    // One sentence from one status, and entry-shaped placeholders hidden from assistive technology.
    const spoken = screen.getAllByRole('status').filter((el) => (el.textContent ?? '') !== '');
    expect(spoken).toHaveLength(1);
    expect(container.querySelectorAll('[data-loading-shape] li')).toHaveLength(3);
    expect(container.querySelector('[aria-busy="true"] [role="status"]')).toBeNull();
    settle({ data: [], meta: META });
    expect(await screen.findByText(/No changes have been recorded/)).toBeInTheDocument();
  });

  it('says since when recording began when there is nothing yet', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({ data: [], meta: META });
    renderPanel();
    expect(
      await screen.findByText(
        'No changes have been recorded for this activity. History recorded since 03 Oct 2026.',
      ),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations in the empty and error states', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValueOnce({ data: [], meta: META });
    const empty = renderPanel();
    await screen.findByText(/No changes have been recorded/);
    expect((await axe(empty.container)).violations).toEqual([]);
    empty.unmount();

    vi.mocked(apiFetchEnvelope).mockRejectedValueOnce(new Error('boom'));
    const failed = renderPanel();
    await screen.findByText('Couldn’t load history. Please try again.');
    expect((await axe(failed.container)).violations).toEqual([]);
  });

  it('offers Try again on a failed load, and the rest still renders after it succeeds', async () => {
    vi.mocked(apiFetchEnvelope).mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(await screen.findByText('Couldn’t load history. Please try again.')).toBeInTheDocument();
    vi.mocked(apiFetchEnvelope).mockResolvedValue({ data: [entry()], meta: META });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Jane Smith')).toBeInTheDocument();
    // The retry button unmounted with the error: focus must not be left on <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'History' })),
    );
  });

  it('renders entries newest-first as a list with a time element and the change', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [
        entry({
          id: 'e2',
          actor: { id: 'u2', name: 'Tom Lee' },
          editCount: 3,
          changes: { name: { from: 'a', to: 'b' } },
        }),
        entry(),
      ],
      meta: META,
    });
    const { container } = renderPanel();
    const items = await screen.findAllByRole('listitem');
    const first = items[0] as HTMLElement;
    expect(within(first).getByText('Tom Lee')).toBeInTheDocument();
    expect(within(first).getByText(/3 edits/)).toBeInTheDocument();
    expect(screen.getByText('Duration 5d → 9d')).toBeInTheDocument();
    expect(container.querySelectorAll('time')).toHaveLength(2);
    expect(screen.getByText('History recorded since 03 Oct 2026.')).toBeInTheDocument();
  });

  it('says a group move was one write, and never says audit', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [entry({ batch: { id: 'b', size: 40 }, scope: 'PLACEMENT' })],
      meta: META,
    });
    const { container } = renderPanel();
    expect(await screen.findByText(/saved together with 39 other activities/)).toBeInTheDocument();
    // The separator is for the eye only.
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('·');
    expect(container.textContent?.toLowerCase()).not.toContain('audit');
  });

  it('words a knock-on by its cause and does not call it a group move', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [
        entry({
          scope: 'LOGIC',
          batch: { id: 'b', size: 5 },
          origin: 'ACTIVITY_DELETED',
          changes: {
            'link:1': {
              dir: 'IN',
              other: { id: 'x', code: '1020', name: 'Steel erection' },
              from: { type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' },
              to: null,
            },
          },
        }),
      ],
      meta: META,
    });
    renderPanel();
    expect(
      await screen.findByText('Link removed — 1020 Steel erection was deleted'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved together/)).not.toBeInTheDocument();
  });

  it('loads older entries on request, keeps focus on the control and announces the total', async () => {
    vi.mocked(apiFetchEnvelope)
      .mockResolvedValueOnce({
        data: [entry()],
        meta: { ...META, nextCursor: 'c1', hasMore: true },
      })
      .mockResolvedValueOnce({
        data: [entry({ id: 'e0', actor: { id: 'u3', name: 'Older Person' } })],
        meta: META,
      });
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Load older' });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByText('Older Person')).toBeInTheDocument();
    expect(vi.mocked(apiFetchEnvelope).mock.calls[1]?.[0]).toContain('cursor=c1');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 entries loaded.'));
    // That was the last page, so the button unmounted: focus moves to the end-of-history sentence.
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText('History recorded since 03 Oct 2026.')),
    );
  });

  it('does not fetch a second page twice while one is in flight', async () => {
    let release: (v: { data: ActivityHistoryEntry[]; meta: typeof META }) => void = () => {};
    vi.mocked(apiFetchEnvelope)
      .mockResolvedValueOnce({
        data: [entry()],
        meta: { ...META, nextCursor: 'c1', hasMore: true },
      })
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Load older' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(vi.mocked(apiFetchEnvelope)).toHaveBeenCalledTimes(2);
    release({ data: [], meta: META });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull());
  });

  it('has no accessibility violations with entries showing', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({ data: [entry()], meta: META });
    const { container } = renderPanel();
    await screen.findByText('Jane Smith');
    expect((await axe(container)).violations).toEqual([]);
  });

  describe('code values (P6 activity codes, M3-T3)', () => {
    const resolved = (
      id: string,
      shortCode: string,
      description: string | null,
      typeName = 'Area',
    ) => ({
      id,
      codeTypeId: 'area',
      shortCode,
      description,
      position: 0,
      version: 1,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      codeTypeName: typeName,
      codeTypeDeletedAt: null,
    });

    beforeEach(() => {
      vi.mocked(apiFetch).mockReset();
      vi.mocked(apiFetchAllPages).mockReset();
    });

    it('names the type and both values, from ONE resolve request for the ids on screen', async () => {
      vi.mocked(apiFetchEnvelope).mockResolvedValue({
        data: [
          entry({ id: 'e1', changes: { 'code:area': { from: 'l1', to: 'l2' } } }),
          entry({ id: 'e2', changes: { 'code:area': { from: null, to: 'l1' } } }),
        ],
        meta: META,
      });
      vi.mocked(apiFetchAllPages).mockResolvedValue([
        { id: 'area', name: 'Area', planId: 'p1', position: 0, version: 1 },
      ]);
      vi.mocked(apiFetch).mockResolvedValue([
        resolved('l1', 'L1', 'Level 1'),
        resolved('l2', 'L2', 'Level 2'),
      ]);
      renderPanel();
      expect(await screen.findByText('Area: Level 1 → Level 2')).toBeInTheDocument();
      expect(screen.getByText('Area set to Level 1')).toBeInTheDocument();
      expect(vi.mocked(apiFetch)).toHaveBeenCalledOnce();
      const [path] = vi.mocked(apiFetch).mock.calls[0] ?? [];
      expect(path).toBe('/organizations/acme/plans/p1/code-values?id=l1&id=l2');
    });

    it('names a value of a deleted type through the resolver, and says so for a purged one', async () => {
      vi.mocked(apiFetchEnvelope).mockResolvedValue({
        data: [entry({ changes: { 'code:old': { from: 'x', to: 'purged' } } })],
        meta: META,
      });
      vi.mocked(apiFetchAllPages).mockResolvedValue([]);
      vi.mocked(apiFetch).mockResolvedValue([
        {
          ...resolved('x', 'X', 'Basement', 'Zone'),
          codeTypeId: 'old',
          codeTypeDeletedAt: '2026-10-01T00:00:00Z',
        },
      ]);
      renderPanel();
      expect(
        await screen.findByText('Zone: Basement → a value that no longer exists'),
      ).toBeInTheDocument();
    });

    it('asks for no names when nothing in view is a code', async () => {
      vi.mocked(apiFetchEnvelope).mockResolvedValue({ data: [entry()], meta: META });
      renderPanel();
      await screen.findByText(/Duration/);
      expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
      expect(vi.mocked(apiFetchAllPages)).not.toHaveBeenCalled();
    });
  });
});
