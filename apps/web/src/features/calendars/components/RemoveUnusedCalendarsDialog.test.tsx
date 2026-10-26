import type { UnusedCalendar } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoveUnusedCalendarsButton } from './RemoveUnusedCalendarsButton';
import { RemoveUnusedCalendarsDialog } from './RemoveUnusedCalendarsDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
}));

const row = (over: Partial<UnusedCalendar> & { id: string }): UnusedCalendar => ({
  name: over.id,
  archived: false,
  version: 1,
  deletedReferencers: { plans: 0, activities: 0 },
  ...over,
});

const COPY_A = row({ id: 'a', name: 'Site 6-Day (imported 2026-10-20)' });
const COPY_B = row({ id: 'b', name: 'Site 6-Day (imported 2026-10-21)', archived: true });
const BINNED = row({
  id: 'c',
  name: 'Old revision calendar',
  deletedReferencers: { plans: 1, activities: 0 },
});

function renderDialog(
  calendars: UnusedCalendar[],
  handlers: { onClose?: () => void; onDeleted?: (n: number) => void } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RemoveUnusedCalendarsDialog
        orgSlug="acme"
        projectName="Riverside"
        calendars={calendars}
        open
        onClose={handlers.onClose ?? vi.fn()}
        onDeleted={handlers.onDeleted ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const confirm = (name: RegExp) => screen.getByRole('button', { name });

describe('RemoveUnusedCalendarsDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset();
  });

  it('ticks every calendar except one that only Recently deleted still uses, and says why', () => {
    renderDialog([COPY_A, COPY_B, BINNED]);

    expect(
      screen.getByRole('checkbox', { name: /Site 6-Day \(imported 2026-10-20\)/ }),
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /imported 2026-10-21/ })).toBeChecked();
    const binned = screen.getByRole('checkbox', { name: /Old revision calendar/ });
    expect(binned).not.toBeChecked();
    expect(binned).toHaveAccessibleDescription(
      'Used by a deleted plan. Restoring that plan will ask you to restore this calendar first.',
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(confirm(/^Delete 2 calendars$/)).toBeInTheDocument();
  });

  it('names a calendar only deleted activities use in its own words', () => {
    renderDialog([row({ id: 'x', name: 'X', deletedReferencers: { plans: 0, activities: 2 } })]);
    expect(screen.getByRole('checkbox', { name: /X/ })).toHaveAccessibleDescription(
      'Used by a deleted activity. Restoring that activity will ask you to restore this calendar first.',
    );
  });

  it('shades Delete at zero ticks, keeps it reachable, and gives its reason', () => {
    renderDialog([COPY_A]);
    fireEvent.click(screen.getByRole('checkbox', { name: /imported 2026-10-20/ }));

    const button = confirm(/^Delete 0 calendars$/);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription('Tick at least one calendar to delete.');

    fireEvent.click(button);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('deletes the ticked calendars in one request and reports how many', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      deleted: [
        { id: 'a', name: COPY_A.name, deleteBatchId: 'batch-a' },
        { id: 'b', name: COPY_B.name, deleteBatchId: 'batch-b' },
      ],
    });
    const onDeleted = vi.fn();
    renderDialog([COPY_A, COPY_B, BINNED], { onDeleted });

    fireEvent.click(confirm(/^Delete 2 calendars$/));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(2));
    expect(apiFetch).toHaveBeenCalledWith(
      '/organizations/acme/calendars/bulk-delete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: ['a', 'b'] }) }),
    );
  });

  it('keeps the dialog open and names what is in use when the server refuses', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: '1 of these calendars is in use, so none was deleted.',
        details: {
          reason: 'CALENDAR_IN_USE',
          calendars: [{ id: 'a', name: 'Copy A', plans: 1, activities: 0, resources: 0 }],
        },
      }),
    );
    const onDeleted = vi.fn();
    renderDialog([COPY_A, COPY_B], { onDeleted });

    fireEvent.click(confirm(/^Delete 2 calendars$/));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was deleted. In use now: “Copy A” (1 plan).',
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(confirm(/^Delete 2 calendars$/)).toBeInTheDocument();
  });

  it('says what was already deleted when a later request of a large set fails', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => row({ id: `id-${String(i)}` }));
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        deleted: ids.slice(0, 200).map((c) => ({ id: c.id, name: c.name, deleteBatchId: c.id })),
      })
      .mockRejectedValueOnce(
        new ApiFetchError(409, {
          code: 'CONFLICT',
          message: 'in use',
          details: {
            calendars: [{ id: 'id-200', name: 'id-200', plans: 0, activities: 1, resources: 0 }],
          },
        }),
      );
    renderDialog(ids);

    fireEvent.click(confirm(/^Delete 201 calendars$/));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('200 calendars were deleted before it stopped, and 1 remain.');
    expect(alert).toHaveTextContent('“id-200” (1 activity)');
  });
});

describe('RemoveUnusedCalendarsButton', () => {
  function renderButton() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <RemoveUnusedCalendarsButton
          orgSlug="acme"
          projectId="proj-1"
          projectName="Riverside"
          focusTarget={() => null}
        />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset();
  });

  it('renders nothing while the project has no unused calendar', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([]);
    renderButton();
    await waitFor(() => expect(apiFetchAllPages).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Remove unused calendars/ })).toBeNull();
  });

  it('reads the project’s unused list and opens the dialog from the button', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([COPY_A]);
    renderButton();

    const button = await screen.findByRole('button', { name: 'Remove unused calendars…' });
    expect(apiFetchAllPages).toHaveBeenCalledWith(
      '/organizations/acme/projects/proj-1/calendars/unused',
    );
    fireEvent.click(button);
    expect(
      await screen.findByRole('dialog', { name: 'Remove unused calendars' }),
    ).toBeInTheDocument();
  });
});
