import type { PageMeta, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { assignmentKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';

/**
 * The assignment resource picker with `VITE_LIBRARY_SCOPING` ON (ADR-0053 §4 / US-8). This is the
 * one picker that owns its own fetch, so it is the one that genuinely searches SERVER-side and pages
 * with "Load more" — and therefore the one that must prove a >20-row library is reachable.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
  RESOURCES_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

function resource(overrides: Partial<ResourceSummary> & { id: string }): ResourceSummary {
  return {
    name: overrides.id,
    code: null,
    description: null,
    kind: 'LABOUR',
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    calendarId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** 25 rows — deliberately past the endpoint's 20-row default page (the truncation defect). */
const BIG_LIBRARY: ResourceSummary[] = Array.from({ length: 25 }, (_, index) =>
  resource({ id: `res-${index}`, name: `Crew ${String(index).padStart(2, '0')}` }),
);
const PAGE_ONE = BIG_LIBRARY.slice(0, 20);
const PAGE_TWO = BIG_LIBRARY.slice(20);

function meta(hasMore: boolean, nextCursor: string | null): PageMeta {
  return { hasMore, nextCursor };
}

/** Serve the picker's search endpoint as two real cursor pages. */
function mockTwoPages(): void {
  vi.mocked(apiFetchEnvelope).mockImplementation((path: string) =>
    Promise.resolve(
      path.includes('cursor=')
        ? { data: PAGE_TWO, meta: meta(false, null) }
        : { data: PAGE_ONE, meta: meta(true, 'res-19') },
    ),
  );
}

function renderDialog(library: ResourceSummary[] = BIG_LIBRARY) {
  vi.mocked(apiFetchAllPages).mockResolvedValue(library);
  const queryClient = new QueryClient({
    // `staleTime: Infinity` so the SEEDED (empty) assignment list is not refetched through the
    // mocked client — this suite is about the picker, not the assigned rows.
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'act-1'), []);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesDialog
        orgSlug="acme"
        activityId="act-1"
        activityName="Excavate"
        open
        onClose={() => {}}
        canWrite
      />
    </QueryClientProvider>,
  );
}

const field = async (): Promise<HTMLElement> => screen.findByRole('combobox', { name: 'Resource' });
const optionNames = (): string[] =>
  within(screen.getByRole('listbox'))
    .queryAllByRole('option')
    .map((option) => option.getAttribute('aria-label') ?? '');

describe('ActivityResourcesDialog — resource picker (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({});
    vi.mocked(apiFetchAllPages).mockReset();
    vi.mocked(apiFetchEnvelope).mockReset();
  });

  it('does NOT truncate a >20-row library: the rest is reachable via Load more', async () => {
    mockTwoPages();
    renderDialog();
    const picker = await field();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });

    await waitFor(() => expect(optionNames()).toContain('Crew 00 (Labour)'));
    // Page one stops at 20 rows — the 21st is NOT silently dropped, it is behind an explicit control.
    expect(optionNames()).not.toContain('Crew 20 (Labour)');
    // "Load more" is a real option in the listbox (not a pointer-only button), so it is reachable
    // by keyboard as well — the M6 a11y fold, WCAG 2.1.1.
    const loadMore = screen.getByRole('option', { name: 'Load more results' });

    fireEvent.pointerDown(loadMore);
    await waitFor(() => expect(optionNames()).toContain('Crew 24 (Labour)'));
    // Loading a page neither closes the popup nor loses the earlier rows.
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    expect(optionNames()).toContain('Crew 00 (Labour)');
  });

  it('searches server-side rather than filtering the loaded page', async () => {
    mockTwoPages();
    renderDialog();
    const picker = await field();
    fireEvent.change(picker, { target: { value: 'crew 2' } });

    await waitFor(() =>
      expect(
        vi.mocked(apiFetchEnvelope).mock.calls.some(([path]) => path.includes('q=crew%202')),
      ).toBe(true),
    );
  });

  it('renders the chosen resource even when it is outside the current page', async () => {
    mockTwoPages();
    renderDialog();
    const picker = await field();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    await waitFor(() => expect(optionNames()).toContain('Crew 00 (Labour)'));
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Crew 00 (Labour)' }));

    // Now search for something that cannot contain the selection…
    vi.mocked(apiFetchEnvelope).mockResolvedValue({ data: [], meta: meta(false, null) });
    fireEvent.change(picker, { target: { value: 'zzz' } });
    fireEvent.keyDown(picker, { key: 'Escape' });

    // …the field still shows what is selected, never a blank.
    await waitFor(() => expect(picker).toHaveValue('Crew 00'));
  });

  it('never offers an archived resource for a NEW assignment', async () => {
    const archived = resource({
      id: 'crane',
      name: 'CR600 Crawler Crane',
      archivedAt: '2026-07-01T00:00:00Z',
    });
    // The server already excludes archived rows from the picker read (`?archived=exclude`); the
    // full-library read (which includes them, to label existing rows) must not leak them in.
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [resource({ id: 'crew', name: 'Crew A' })],
      meta: meta(false, null),
    });
    renderDialog([resource({ id: 'crew', name: 'Crew A' }), archived]);
    const picker = await field();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });

    await waitFor(() => expect(optionNames()).toContain('Crew A (Labour)'));
    expect(optionNames().some((name) => name.includes('Crawler Crane'))).toBe(false);
  });

  it('surfaces the 422 RESOURCE_ARCHIVED reject if one still reaches the wire', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [resource({ id: 'crew', name: 'Crew A' })],
      meta: meta(false, null),
    });
    renderDialog([resource({ id: 'crew', name: 'Crew A' })]);
    const picker = await field();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    await waitFor(() => expect(optionNames()).toContain('Crew A (Labour)'));
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Crew A (Labour)' }));

    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'This resource is archived. Unarchive it to assign it.',
        details: { reason: 'RESOURCE_ARCHIVED' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    expect(await screen.findByText(/This resource is archived/)).toBeInTheDocument();
  });

  it('has no axe violations with the picker open', async () => {
    mockTwoPages();
    const { container } = renderDialog();
    const picker = await field();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    await waitFor(() => expect(optionNames()).toContain('Crew 00 (Labour)'));
    expect((await axe(container)).violations).toEqual([]);
  });
});
