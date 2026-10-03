import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resourceKeys } from '../api/use-resources';

import { ResourcesTable } from './ResourcesTable';

import type * as AnnouncerModule from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { clickRowAction, openRowActions } from '@/test/row-actions';

/**
 * The resource library's **Dissolve** row action and the group-aware **Delete** dialog
 * (`docs/specs/resource-group-dissolve/`, ADR-0053 §3). The copy is unit-tested in
 * `lib/group-action-copy.test.ts`; this pins what a pure function cannot see: that the action is
 * OMITTED (not shaded) on a leaf, sits immediately before Delete, is not dressed as destructive,
 * counts from the unfiltered read rather than from what the table shows, posts to the new route,
 * and hands focus to the region when the group's row unmounts.
 */
const { announceSpy } = vi.hoisted(() => ({ announceSpy: vi.fn() }));
vi.mock('@/components/ui/announcer', async (importOriginal) => {
  const actual = await importOriginal<typeof AnnouncerModule>();
  return { ...actual, useAnnounce: vi.fn(() => announceSpy) };
});

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
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

const GROUP = resource({ id: 'grp', name: 'Groundworks', kind: 'GROUP' });
const CREW_A = resource({ id: 'a', name: 'Crew A', parentId: 'grp', version: 3 });
const CREW_B = resource({ id: 'b', name: 'Crew B', parentId: 'grp' });
// Archived members are hidden by the table's default filter but are moved (and deleted) all the
// same, so the dialog's count must include them.
const CREW_ARCHIVED = resource({
  id: 'z',
  name: 'Crew Z',
  parentId: 'grp',
  archivedAt: '2026-02-01T00:00:00Z',
});
const LOOSE = resource({ id: 'loose', name: 'Loose Crew' });

function renderTable(canWrite = true, { seedCount = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), [GROUP, CREW_A, CREW_B, LOOSE]);
  if (seedCount) {
    queryClient.setQueryData(resourceKeys.filtered('acme', { archived: 'include' }), [
      GROUP,
      CREW_A,
      CREW_B,
      CREW_ARCHIVED,
      LOOSE,
    ]);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcesTable orgSlug="acme" canWrite={canWrite} calendars={[]} />
    </QueryClientProvider>,
  );
}

describe('ResourcesTable — dissolve a group', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset();
    announceSpy.mockReset();
  });

  it('offers Dissolve on a group, immediately before Delete', () => {
    renderTable();
    const items = within(openRowActions('Groundworks'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toContain('Dissolve');
    expect(items.indexOf('Dissolve')).toBe(items.indexOf('Delete') - 1);
  });

  it('omits Dissolve from a leaf resource rather than shading it', () => {
    renderTable();
    expect(
      within(openRowActions('Crew A')).queryByRole('menuitem', { name: 'Dissolve' }),
    ).not.toBeInTheDocument();
  });

  it('offers no menu, and so no Dissolve, to a reader', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('states what is kept, where it goes, and that there is no restore, counting archived members', async () => {
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    const dialog = await screen.findByRole('alertdialog', { name: 'Dissolve group' });
    // 3, not the 2 the table shows: the count is the unfiltered read including the archived one.
    expect(within(dialog).getByText(/keeps its 3 resources/)).toBeInTheDocument();
    expect(within(dialog).getByText(/move up to the top level/)).toBeInTheDocument();
    expect(within(dialog).getByText(/This can’t be undone\./)).toBeInTheDocument();
    expect(within(dialog).queryByText(/recycle/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/create the group again and move them back/),
    ).toBeInTheDocument();
  });

  it('does not dress the confirm as destructive', async () => {
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Dissolve',
    });
    // Compared with the Delete confirm's own class list rather than a substring of a token name, so
    // renaming the variant cannot make this pass vacuously.
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    await clickRowAction('Groundworks', 'Delete');
    const deleteConfirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    });
    expect(confirm.className).not.toBe(deleteConfirm.className);
    const defaultClasses =
      render(<Button variant="default">x</Button>).container.querySelector('button')?.className ??
      '';
    for (const token of defaultClasses.split(/\s+/)) expect(confirm.className).toContain(token);
  });

  it('posts to the dissolve route, then closes, announces the server’s count and focuses the list', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      promoted: [
        { id: 'a', parentId: null, version: 4 },
        { id: 'b', parentId: null, version: 2 },
        { id: 'z', parentId: null, version: 2 },
      ],
    });
    vi.mocked(apiFetchAllPages).mockResolvedValue([
      { ...CREW_A, parentId: null, version: 4 },
      { ...CREW_B, parentId: null, version: 2 },
      LOOSE,
    ]);
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/resources/grp/dissolve', {
      method: 'POST',
    });
    expect(announceSpy).toHaveBeenCalledWith(
      'Group “Groundworks” dissolved. Its 3 resources were kept.',
    );
    expect(screen.queryByRole('row', { name: /Groundworks/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Crew A/ })).toBeInTheDocument();
    // The group's row unmounted, so focus must have been handed on rather than dropped to <body>.
    expect(document.activeElement).toContainElement(screen.getByRole('table'));
  });

  it('keeps the dialog open with an inline message when the group is already gone (404)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Resource not found.' }),
    );
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    expect(
      await within(screen.getByRole('alertdialog')).findByText(
        'This group was already removed. Refresh the library.',
      ),
    ).toBeInTheDocument();
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('hands focus to the list when the dialog is closed after a 404 removed the group’s row', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Resource not found.' }),
    );
    // The refetch that follows the failure no longer contains the group.
    vi.mocked(apiFetchAllPages).mockResolvedValue([CREW_A, CREW_B, LOOSE]);
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dissolve' }));
    await within(dialog).findByText('This group was already removed. Refresh the library.');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Actions for Groundworks' })).toBeNull(),
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(screen.getByRole('table'));
  });

  it('shows any other failure inline and leaves the dialog open', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(500, { code: 'INTERNAL', message: 'The server fell over.' }),
    );
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/./);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('labels the confirm “Dissolving…” and aria-disabled while the write is in flight', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => undefined));
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    const busy = await within(screen.getByRole('alertdialog')).findByRole('button', {
      name: 'Dissolving…',
    });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
  });

  it('announces an empty group as empty rather than “0 resources were kept”', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ promoted: [] });
    vi.mocked(apiFetchAllPages).mockResolvedValue([CREW_A, CREW_B, LOOSE]);
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    await waitFor(() => expect(announceSpy).toHaveBeenCalled());
    expect(announceSpy).toHaveBeenCalledWith('Group “Groundworks” dissolved. It was empty.');
  });

  it('announces one kept resource in the singular', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ promoted: [{ id: 'a', parentId: null, version: 4 }] });
    vi.mocked(apiFetchAllPages).mockResolvedValue([CREW_A, LOOSE]);
    renderTable();
    await clickRowAction('Groundworks', 'Dissolve');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    await waitFor(() => expect(announceSpy).toHaveBeenCalled());
    expect(announceSpy).toHaveBeenCalledWith(
      'Group “Groundworks” dissolved. Its 1 resource was kept.',
    );
  });
});

describe('ResourcesTable — the count is known when a group dialog opens', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset();
    announceSpy.mockReset();
  });

  const includeReads = () =>
    vi
      .mocked(apiFetchAllPages)
      .mock.calls.filter(([path]) => String(path).includes('archived=include'));

  it('holds the dialog until the unfiltered read lands, then opens on the real count', async () => {
    let release: (rows: ResourceSummary[]) => void = () => undefined;
    vi.mocked(apiFetchAllPages).mockReturnValue(
      new Promise<ResourceSummary[]>((resolve) => {
        release = resolve;
      }),
    );
    renderTable(true, { seedCount: false });
    await screen.findByRole('button', { name: 'Actions for Groundworks' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Groundworks' }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'Actions for Groundworks' })).getByRole('menuitem', {
        name: 'Dissolve',
      }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    release([GROUP, CREW_A, CREW_B, CREW_ARCHIVED, LOOSE]);

    const dialog = await screen.findByRole('alertdialog', { name: 'Dissolve group' });
    // The very first description the dialog carries already has the number: it is read once.
    expect(dialog).toHaveAccessibleDescription(/keeps its 3 resources/);
    expect(includeReads()).toHaveLength(1);
  });

  it('makes no unfiltered read for a leaf delete, or with no dialog open', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([]);
    renderTable(true, { seedCount: false });
    await screen.findByRole('button', { name: 'Actions for Crew A' });
    expect(includeReads()).toHaveLength(0);

    await clickRowAction('Crew A', 'Delete');
    expect(screen.getByRole('alertdialog', { name: 'Delete resource' })).toBeInTheDocument();
    expect(includeReads()).toHaveLength(0);
  });

  it('counts for a group delete too, before it opens', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([GROUP, CREW_A, CREW_B, CREW_ARCHIVED, LOOSE]);
    renderTable(true, { seedCount: false });
    await screen.findByRole('button', { name: 'Actions for Groundworks' });
    await clickRowAction('Groundworks', 'Delete');

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete group' });
    expect(dialog).toHaveAccessibleDescription(/and the 3 resources in it/);
  });
});

describe('ResourcesTable — deleting a group', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset();
    announceSpy.mockReset();
  });

  it('titles the dialog for a group and says the delete includes its contents and points at Dissolve', async () => {
    renderTable();
    await clickRowAction('Groundworks', 'Delete');
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete group' });
    expect(
      within(dialog).getByText(/Delete the group “Groundworks” and the 3 resources in it\?/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/deletes everything in it/)).toBeInTheDocument();
    expect(within(dialog).getByText(/dissolve the group instead/)).toBeInTheDocument();
  });

  it('keeps a leaf resource’s delete wording and title', async () => {
    renderTable();
    await clickRowAction('Crew A', 'Delete');
    const dialog = screen.getByRole('alertdialog', { name: 'Delete resource' });
    expect(within(dialog).getByText('Delete “Crew A”?')).toBeInTheDocument();
  });
});
