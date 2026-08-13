import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';
import { ResourceFormDialog } from './ResourceFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';

/**
 * The resource-tree FORM surface under `VITE_LIBRARY_SCOPING` (ADR-0053 §3): creating a `GROUP`,
 * picking a parent group (never one that would form a cycle), and the rule that a group carries no
 * calendar / capacity / cost — enforced in the UI by hiding those fields AND by stripping any stale
 * value on the way out, so what the form shows and what it sends can never disagree.
 *
 * Since M4 (ADR-0053 §4) the parent picker is the shared APG combobox, so the tree indentation is
 * the primitive's `depth` rather than non-breaking spaces, and the picker is searchable.
 *
 * Also pins the assignment picker's exclusion of groups: the API answers 422
 * `GROUP_NOT_ASSIGNABLE`, so offering one would only ever produce an error.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
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

const LIBRARY: ResourceSummary[] = [
  resource({ id: 'grp', name: 'Groundworks', kind: 'GROUP' }),
  resource({ id: 'sub', name: 'Diggers', kind: 'GROUP', parentId: 'grp' }),
  resource({ id: 'crew', name: 'Crew A', parentId: 'sub' }),
];

function renderForm(props: Partial<React.ComponentProps<typeof ResourceFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourceFormDialog orgSlug="acme" open onClose={() => {}} resources={LIBRARY} {...props} />
    </QueryClientProvider>,
  );
}

function lastBody(): Record<string, unknown> {
  const calls = vi.mocked(apiFetch).mock.calls;
  const init = calls[calls.length - 1]?.[1];
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

const groupField = (): HTMLElement => screen.getByRole('combobox', { name: 'Group' });
const openGroupField = (): void => {
  fireEvent.keyDown(groupField(), { key: 'ArrowDown' });
};

describe('ResourceFormDialog — resource tree (ADR-0053 §3)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({});
  });

  it('offers GROUP as a kind and every group as a parent, indented by depth', () => {
    renderForm();
    expect(
      within(screen.getByLabelText('Kind')).getByRole('option', { name: 'Group' }),
    ).toBeInTheDocument();
    openGroupField();

    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((option) => option.getAttribute('aria-label'));
    expect(options[0]).toBe('No group (top level)');
    expect(options).toContain('Groundworks');
    expect(options).toContain('Diggers');
    // The nested group is indented, so the picker still reads as a tree — now via the combobox's
    // `depth` rather than the non-breaking spaces a native `<option>` needed.
    //
    // Asserted on the style ATTRIBUTE rather than through `toHaveStyle`, which reads
    // `getComputedStyle`. jsdom 30 resolves `rem` to `px` there — `0.75rem` comes back as `12px` —
    // where jsdom 29 returned the literal. That is jsdom becoming MORE browser-accurate, not a
    // change in what the combobox does, so the fix is to stop asking a question whose answer
    // depends on the root font size. It also makes this symmetric with the assertion below, which
    // already tests the attribute.
    expect(screen.getByRole('option', { name: 'Diggers' }).querySelector('span')).toHaveAttribute(
      'style',
      'padding-inline-start: 0.75rem;',
    );
    expect(
      screen.getByRole('option', { name: 'Groundworks' }).querySelector('span'),
    ).not.toHaveAttribute('style');
  });

  it('filters the group picker by name as the planner types', () => {
    renderForm();
    fireEvent.change(groupField(), { target: { value: 'digg' } });

    expect(screen.getByRole('option', { name: 'Diggers' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Groundworks' })).not.toBeInTheDocument();
    // "No group (top level)" is not a search result, so it is never filtered away.
    expect(screen.getByRole('option', { name: 'No group (top level)' })).toBeInTheDocument();
  });

  it('never offers a resource’s OWN subtree as its parent — a cycle the API would 409', () => {
    // Editing the top group: neither it nor its descendant group may be its parent.
    renderForm({ resource: LIBRARY[0]! });
    openGroupField();
    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((option) => option.getAttribute('aria-label'));
    expect(options).not.toContain('Groundworks');
    expect(options).not.toContain('Diggers');
  });

  it('hides calendar / capacity / cost for a GROUP, and sends none of them', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Plant' } });
    // Fill the calendar FIRST, then switch to GROUP: the stale value must not survive.
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'GROUP' } });
    expect(screen.queryByLabelText('Calendar')).not.toBeInTheDocument();
    expect(screen.getByText(/can’t be assigned to an activity/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = lastBody();
    expect(body).toMatchObject({ name: 'Plant', kind: 'GROUP' });
    expect(body.calendarId).toBeUndefined();
    expect(body.maxUnitsPerHour).toBeUndefined();
    expect(body.costPerUnit).toBeUndefined();
  });

  it('sends the chosen parent on create and an explicit null when cleared on edit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crew B' } });
    openGroupField();
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Groundworks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ parentId: 'grp' });

    vi.mocked(apiFetch).mockClear();
    const edit = renderForm({ resource: LIBRARY[2]! });
    const editField = within(edit.container).getByRole('combobox', { name: 'Group' });
    fireEvent.keyDown(editField, { key: 'ArrowDown' });
    fireEvent.pointerDown(
      within(edit.container).getByRole('option', { name: 'No group (top level)' }),
    );
    fireEvent.click(within(edit.container).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    // Explicit null promotes to top level; `undefined` would mean "unchanged" to the API.
    expect(lastBody().parentId).toBeNull();
  });
});

describe('ActivityResourcesDialog — groups are never assignable', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    // The whole library, for labelling the assigned rows.
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue(LIBRARY);
    // The picker's server search — one page, nothing more to load.
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockResolvedValue({ data: LIBRARY, meta: { hasMore: false, nextCursor: null } });
  });

  function renderAssign() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
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

  it('excludes every GROUP from the assign picker', async () => {
    renderAssign();
    const picker = await screen.findByRole('combobox', { name: 'Resource' });
    fireEvent.keyDown(picker, { key: 'ArrowDown' });

    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((option) => option.getAttribute('aria-label') ?? '');
    expect(options.some((o) => o.includes('Crew A'))).toBe(true);
    expect(options.some((o) => o.includes('Groundworks'))).toBe(false);
    expect(options.some((o) => o.includes('Diggers'))).toBe(false);
  });

  it('pushes the search term to the server rather than filtering one page locally', async () => {
    renderAssign();
    const picker = await screen.findByRole('combobox', { name: 'Resource' });
    fireEvent.change(picker, { target: { value: 'crew' } });

    await waitFor(() =>
      expect(vi.mocked(apiFetchEnvelope).mock.calls.some(([path]) => path.includes('q=crew'))).toBe(
        true,
      ),
    );
    // …and the request is a bounded page with a cursor contract, never an unbounded scan.
    const searched = vi
      .mocked(apiFetchEnvelope)
      .mock.calls.map(([path]) => path)
      .find((path) => path.includes('q=crew'));
    expect(searched).toContain('limit=20');
  });
});
