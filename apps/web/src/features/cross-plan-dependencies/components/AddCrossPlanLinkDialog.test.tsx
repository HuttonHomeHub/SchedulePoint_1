import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddCrossPlanLinkDialog } from './AddCrossPlanLinkDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

const ANCHOR = { id: 'anchor', name: 'Pour slab' } as unknown as ActivitySummary;

/** A path-routed apiFetch mock feeding the client → project → plan → activity cascade. */
function mockCascade(create?: () => Promise<unknown>): void {
  vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST' && path.endsWith('/cross-plan-dependencies')) {
      return create ? create() : Promise.resolve({});
    }
    if (path === '/organizations/acme/clients') {
      return Promise.resolve([{ id: 'c1', name: 'Client One' }]);
    }
    if (path === '/organizations/acme/clients/c1/projects') {
      return Promise.resolve([{ id: 'pr1', name: 'Project One' }]);
    }
    if (path === '/organizations/acme/projects/pr1/plans') {
      return Promise.resolve([
        { id: 'pl2', name: 'Upstream Plan' },
        { id: 'pl1', name: 'This Plan' }, // must be excluded (the successor plan → N31)
      ]);
    }
    if (path === '/organizations/acme/plans/pl2/activities') {
      return Promise.resolve([{ id: 'up1', code: 'A-1', name: 'Deliver steel' }]);
    }
    return Promise.resolve([]);
  });
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <AddCrossPlanLinkDialog
          orgSlug="acme"
          currentPlanId="pl1"
          anchor={ANCHOR}
          open
          onClose={vi.fn()}
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

/** Choose the client once its option has loaded (the clients query resolves async). */
async function chooseClient(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Client One' })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'c1' } });
}

/** Drive the cascade to a chosen upstream activity. */
async function pickUpstreamActivity(): Promise<void> {
  await chooseClient();
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Project One' })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'pr1' } });
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Upstream Plan' })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'pl2' } });
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'A-1 — Deliver steel' })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'up1' } });
}

describe('AddCrossPlanLinkDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('excludes the successor’s own plan from the picker (N31 can’t be chosen)', async () => {
    mockCascade();
    renderDialog();
    await chooseClient();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Project One' })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'pr1' } });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Upstream Plan' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('option', { name: 'This Plan' })).not.toBeInTheDocument();
  });

  it('creates a link: chosen upstream activity → the anchor (successor)', async () => {
    mockCascade();
    renderDialog();
    await pickUpstreamActivity();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'SS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cross-plan link' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/cross-plan-dependencies',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(call[1]?.body as string)).toMatchObject({
      predecessorActivityId: 'up1',
      successorActivityId: 'anchor',
      type: 'SS',
      lagDays: 0,
      lagCalendar: 'PROJECT_DEFAULT',
    });
  });

  it('requires choosing an activity before it will submit', async () => {
    mockCascade();
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Add cross-plan link' }));
    await waitFor(() =>
      expect(screen.getAllByText('Choose an activity.').length).toBeGreaterThan(0),
    );
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('surfaces the shared cross-plan cycle copy on a server 409', async () => {
    mockCascade(() =>
      Promise.reject(
        new ApiFetchError(409, {
          code: 'CROSS_PLAN_CYCLE_DETECTED',
          message: 'server wording that should be overridden',
        }),
      ),
    );
    renderDialog();
    await pickUpstreamActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Add cross-plan link' }));
    await waitFor(() =>
      expect(
        screen.getByText('This cross-plan link would create a cycle between plans.'),
      ).toBeInTheDocument(),
    );
  });

  it('surfaces the shared duplicate copy on a server 409', async () => {
    mockCascade(() =>
      Promise.reject(
        new ApiFetchError(409, { code: 'DUPLICATE_CROSS_PLAN_DEPENDENCY', message: 'dup' }),
      ),
    );
    renderDialog();
    await pickUpstreamActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Add cross-plan link' }));
    await waitFor(() =>
      expect(
        screen.getByText('A cross-plan link of this type already exists between these activities.'),
      ).toBeInTheDocument(),
    );
  });

  it('relabels the lag field to calendar days once 24-hour (elapsed) is chosen', () => {
    mockCascade();
    renderDialog();
    expect(screen.getByLabelText(/Lag \(working days/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lag calendar'), {
      target: { value: 'TWENTY_FOUR_HOUR' },
    });
    expect(screen.getByLabelText(/Lag \(calendar days/)).toBeInTheDocument();
  });
});
