import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';
import { ResourceFormDialog } from './ResourceFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

/**
 * The resource-tree FORM surface under `VITE_LIBRARY_SCOPING` (ADR-0053 §3): creating a `GROUP`,
 * picking a parent group (never one that would form a cycle), and the rule that a group carries no
 * calendar / capacity / cost — enforced in the UI by hiding those fields AND by stripping any stale
 * value on the way out, so what the form shows and what it sends can never disagree.
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
    const parent = screen.getByLabelText('Group (optional)');
    const options = within(parent)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options[0]).toBe('No group (top level)');
    expect(options).toContain('Groundworks');
    // The nested group is indented (non-breaking spaces), so the picker reads as a tree.
    expect(options.some((o) => o !== null && o.includes('Diggers') && o !== 'Diggers')).toBe(true);
  });

  it('never offers a resource’s OWN subtree as its parent — a cycle the API would 409', () => {
    // Editing the top group: neither it nor its descendant group may be its parent.
    renderForm({ resource: LIBRARY[0]! });
    const options = within(screen.getByLabelText('Group (optional)'))
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(options).not.toContain('Groundworks');
    expect(options).not.toContain('Diggers');
  });

  it('hides calendar / capacity / cost for a GROUP, and sends none of them', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Plant' } });
    // Fill the calendar FIRST, then switch to GROUP: the stale value must not survive.
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'GROUP' } });
    expect(screen.queryByLabelText('Calendar (optional)')).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Group (optional)'), { target: { value: 'grp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ parentId: 'grp' });

    vi.mocked(apiFetch).mockClear();
    renderForm({ resource: LIBRARY[2]! });
    fireEvent.change(screen.getAllByLabelText('Group (optional)')[1]!, { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    // Explicit null promotes to top level; `undefined` would mean "unchanged" to the API.
    expect(lastBody().parentId).toBeNull();
  });
});

describe('ActivityResourcesDialog — groups are never assignable', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('excludes every GROUP from the assign picker', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(resourceKeys.list('acme'), LIBRARY);
    queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'act-1'), []);
    render(
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
    const picker = screen.getByLabelText('Resource');
    const options = within(picker)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('Crew A'))).toBe(true);
    expect(options.some((o) => o.includes('Groundworks'))).toBe(false);
    expect(options.some((o) => o.includes('Diggers'))).toBe(false);
  });
});
